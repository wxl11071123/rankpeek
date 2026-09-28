package io.rankpeek.service;

import io.rankpeek.model.MatchHistory;
import io.rankpeek.model.RankTag;
import io.rankpeek.model.TagConfig;
import io.rankpeek.model.TagConfig.MatchFilter;
import io.rankpeek.model.TagConfig.MatchRefresh;
import io.rankpeek.model.TagConfig.Operator;
import io.rankpeek.model.TagConfig.StreakType;
import io.rankpeek.model.TagConfig.TagCondition;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Manages tag configuration rules and default migrations.
 */
@Slf4j
@Service
public class TagConfigService {

    private final UserStoreService userStoreService;
    private final ObjectMapper objectMapper;
    private final Path legacyConfigPath;

    private List<TagConfig> tagConfigs = new ArrayList<>();

    @Autowired
    public TagConfigService(UserStoreService userStoreService) {
        this(userStoreService, new ObjectMapper(), Path.of("tag-config.json"));
    }

    TagConfigService(UserStoreService userStoreService, ObjectMapper objectMapper, Path legacyConfigPath) {
        this.userStoreService = userStoreService;
        this.objectMapper = objectMapper;
        this.legacyConfigPath = legacyConfigPath;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void init() {
        loadConfig();
    }

    public synchronized List<TagConfig> getAllTagConfigs() {
        return new ArrayList<>(tagConfigs);
    }

    public synchronized void saveTagConfigs(List<TagConfig> configs) {
        this.tagConfigs = new ArrayList<>(configs);
        persistConfig();
    }

    public List<RankTag> evaluateTags(List<MatchHistory> matchHistory, String puuid, Integer currentMode) {
        List<RankTag> result = new ArrayList<>();
        if (matchHistory == null || matchHistory.isEmpty()) {
            return result;
        }

        for (TagConfig config : tagConfigs) {
            if (!Boolean.TRUE.equals(config.getEnabled())) {
                continue;
            }

            EvaluateResult evalResult = evaluateConditionWithResult(
                    config.getCondition(),
                    matchHistory,
                    puuid,
                    currentMode
            );
            if (!evalResult.matched) {
                continue;
            }

            result.add(RankTag.builder()
                    .good(config.getGood())
                    .tagName(formatName(config.getName(), evalResult.streakValue))
                    .tagDesc(config.getDesc())
                    .build());
        }

        return result;
    }

    private EvaluateResult evaluateConditionWithResult(TagCondition condition,
                                                       List<MatchHistory> history,
                                                       String puuid,
                                                       Integer currentMode) {
        if (condition instanceof TagCondition.HistoryCondition historyCondition) {
            List<MatchHistory> filtered = history;
            for (MatchFilter filter : historyCondition.getFilters()) {
                filtered = applyFilter(filtered, filter, puuid);
            }

            if (historyCondition.getRefresh() instanceof MatchRefresh.StreakRefresh streakRefresh) {
                int streak = calculateStreak(filtered, puuid, streakRefresh.getKind());
                boolean matched = streak >= streakRefresh.getMin();
                int streakValue = streakRefresh.getKind() == StreakType.LOSS ? -streak : streak;
                return new EvaluateResult(matched, streakValue);
            }

            return new EvaluateResult(applyRefresh(historyCondition.getRefresh(), filtered, puuid));
        }

        return new EvaluateResult(evaluateCondition(condition, history, puuid, currentMode));
    }

    private boolean evaluateCondition(TagCondition condition,
                                      List<MatchHistory> history,
                                      String puuid,
                                      Integer currentMode) {
        return switch (condition) {
            case TagCondition.AndCondition andCondition -> andCondition.getConditions().stream()
                    .allMatch(item -> evaluateCondition(item, history, puuid, currentMode));
            case TagCondition.OrCondition orCondition -> orCondition.getConditions().stream()
                    .anyMatch(item -> evaluateCondition(item, history, puuid, currentMode));
            case TagCondition.NotCondition notCondition ->
                    !evaluateCondition(notCondition.getCondition(), history, puuid, currentMode);
            case TagCondition.CurrentQueueCondition queueCondition ->
                    queueCondition.getIds().contains(currentMode);
            case TagCondition.CurrentChampionCondition ignored -> false;
            case TagCondition.HistoryCondition historyCondition ->
                    evaluateHistoryCondition(historyCondition, history, puuid);
            case null, default -> false;
        };
    }

    private boolean evaluateHistoryCondition(TagCondition.HistoryCondition condition,
                                             List<MatchHistory> history,
                                             String puuid) {
        List<MatchHistory> filtered = history;
        for (MatchFilter filter : condition.getFilters()) {
            filtered = applyFilter(filtered, filter, puuid);
        }
        return applyRefresh(condition.getRefresh(), filtered, puuid);
    }

    private List<MatchHistory> applyFilter(List<MatchHistory> games, MatchFilter filter, String puuid) {
        if (filter instanceof MatchFilter.QueueFilter queueFilter) {
            return games.stream()
                    .filter(game -> game.getQueueId() != null && queueFilter.getIds().contains(game.getQueueId()))
                    .toList();
        }

        if (filter instanceof MatchFilter.ChampionFilter championFilter) {
            return games.stream()
                    .filter(game -> {
                        MatchHistory.Participant participant = findParticipant(game, puuid);
                        return participant != null
                                && participant.getChampionId() != null
                                && championFilter.getIds().contains(participant.getChampionId());
                    })
                    .toList();
        }

        if (filter instanceof MatchFilter.StatFilter statFilter) {
            return games.stream()
                    .filter(game -> {
                        double value = extractMetric(game, puuid, statFilter.getMetric());
                        return statFilter.getOp().check(value, statFilter.getValue());
                    })
                    .toList();
        }

        return games;
    }

    private boolean applyRefresh(MatchRefresh refresh, List<MatchHistory> games, String puuid) {
        if (refresh instanceof MatchRefresh.CountRefresh countRefresh) {
            return countRefresh.getOp().check(games.size(), countRefresh.getValue());
        }

        if (games.isEmpty()) {
            return false;
        }

        if (refresh instanceof MatchRefresh.AverageRefresh averageRefresh) {
            double total = games.stream()
                    .mapToDouble(game -> extractMetric(game, puuid, averageRefresh.getMetric()))
                    .sum();
            return averageRefresh.getOp().check(total / games.size(), averageRefresh.getValue());
        }

        if (refresh instanceof MatchRefresh.SumRefresh sumRefresh) {
            double total = games.stream()
                    .mapToDouble(game -> extractMetric(game, puuid, sumRefresh.getMetric()))
                    .sum();
            return sumRefresh.getOp().check(total, sumRefresh.getValue());
        }

        if (refresh instanceof MatchRefresh.MaxRefresh maxRefresh) {
            double max = games.stream()
                    .mapToDouble(game -> extractMetric(game, puuid, maxRefresh.getMetric()))
                    .max()
                    .orElse(Double.MIN_VALUE);
            return maxRefresh.getOp().check(max, maxRefresh.getValue());
        }

        if (refresh instanceof MatchRefresh.MinRefresh minRefresh) {
            double min = games.stream()
                    .mapToDouble(game -> extractMetric(game, puuid, minRefresh.getMetric()))
                    .min()
                    .orElse(Double.MAX_VALUE);
            return minRefresh.getOp().check(min, minRefresh.getValue());
        }

        if (refresh instanceof MatchRefresh.StreakRefresh streakRefresh) {
            int streak = calculateStreak(games, puuid, streakRefresh.getKind());
            return streak >= streakRefresh.getMin();
        }

        return false;
    }

    private MatchHistory.Participant findParticipant(MatchHistory game, String puuid) {
        if (game.getParticipants() == null || game.getParticipantIdentities() == null) {
            return null;
        }

        Integer participantId = null;
        for (MatchHistory.ParticipantIdentity identity : game.getParticipantIdentities()) {
            if (identity.getPlayer() != null && puuid.equals(identity.getPlayer().getPuuid())) {
                participantId = identity.getParticipantId();
                break;
            }
        }

        if (participantId == null) {
            return null;
        }

        for (MatchHistory.Participant participant : game.getParticipants()) {
            if (participantId.equals(participant.getParticipantId())) {
                return participant;
            }
        }

        return null;
    }

    private double extractMetric(MatchHistory game, String puuid, String metric) {
        MatchHistory.Participant participant = findParticipant(game, puuid);
        if (participant == null || participant.getStats() == null) {
            return 0.0;
        }

        MatchHistory.Stats stats = participant.getStats();
        return switch (metric.toLowerCase()) {
            case "kills" -> valueOrZero(stats.getKills());
            case "deaths" -> valueOrZero(stats.getDeaths());
            case "assists" -> valueOrZero(stats.getAssists());
            case "kda" -> {
                int deaths = stats.getDeaths() != null && stats.getDeaths() > 0 ? stats.getDeaths() : 1;
                yield (valueOrZero(stats.getKills()) + valueOrZero(stats.getAssists())) * 1.0 / deaths;
            }
            case "win" -> Boolean.TRUE.equals(stats.getWin()) ? 1.0 : 0.0;
            case "gold" -> valueOrZero(stats.getGoldEarned());
            case "cs" -> valueOrZero(stats.getTotalMinionsKilled()) + valueOrZero(stats.getNeutralMinionsKilled());
            case "damage" -> valueOrZero(stats.getTotalDamageDealtToChampions());
            default -> 0.0;
        };
    }

    private int calculateStreak(List<MatchHistory> games, String puuid, StreakType kind) {
        int streak = 0;
        for (MatchHistory game : games) {
            MatchHistory.Participant participant = findParticipant(game, puuid);
            if (participant == null || participant.getStats() == null) {
                continue;
            }

            boolean win = Boolean.TRUE.equals(participant.getStats().getWin());
            if (kind == StreakType.WIN && win) {
                streak++;
            } else if (kind == StreakType.LOSS && !win) {
                streak++;
            } else {
                break;
            }
        }
        return streak;
    }

    private String formatName(String name, int streakValue) {
        if (name != null && name.contains("{N}")) {
            return name.replace("{N}", String.valueOf(Math.abs(streakValue)));
        }
        return name;
    }

    private int valueOrZero(Integer value) {
        return value != null ? value : 0;
    }

    private synchronized void loadConfig() {
        List<TagConfig> defaults = getDefaultTags();
        List<TagConfig> storedConfigs = userStoreService.getTagConfigs();
        if (!storedConfigs.isEmpty()) {
            tagConfigs = mergeDefaultConfigs(storedConfigs, defaults);
            persistConfig();
            log.info("Loaded {} tag configs from user store", tagConfigs.size());
            return;
        }

        Optional<List<TagConfig>> legacyConfigs = readLegacyConfigs();
        if (legacyConfigs.isPresent()) {
            tagConfigs = mergeDefaultConfigs(legacyConfigs.get(), defaults);
            persistConfig();
            log.info("Migrated {} legacy tag configs from {} into user store; legacy file was left untouched",
                    tagConfigs.size(), legacyConfigPath);
            return;
        }

        tagConfigs = defaults;
        persistConfig();
    }

    private Optional<List<TagConfig>> readLegacyConfigs() {
        if (Files.notExists(legacyConfigPath)) {
            return Optional.empty();
        }

        try {
            List<TagConfig> legacyConfigs = objectMapper.readValue(legacyConfigPath.toFile(), new TypeReference<>() {
            });
            return Optional.ofNullable(legacyConfigs);
        } catch (IOException e) {
            log.warn("Failed to migrate legacy tag config from {}, using defaults: {}", legacyConfigPath, e.getMessage());
            return Optional.empty();
        }
    }

    private List<TagConfig> mergeDefaultConfigs(List<TagConfig> existing, List<TagConfig> defaults) {
        Map<String, TagConfig> existingById = new LinkedHashMap<>();
        for (TagConfig config : existing) {
            if (config != null && config.getId() != null) {
                existingById.put(config.getId(), config);
            }
        }

        List<TagConfig> merged = new ArrayList<>();
        for (TagConfig defaultConfig : defaults) {
            TagConfig existingConfig = existingById.remove(defaultConfig.getId());
            if (existingConfig != null && existingConfig.getEnabled() != null) {
                defaultConfig.setEnabled(existingConfig.getEnabled());
            }
            merged.add(defaultConfig);
        }

        existingById.values().stream()
                .filter(config -> !Boolean.TRUE.equals(config.getIsDefault()))
                .forEach(merged::add);

        return merged;
    }

    private void persistConfig() {
        try {
            userStoreService.saveTagConfigs(tagConfigs);
        } catch (RuntimeException e) {
            log.error("Failed to save tag config: {}", e.getMessage());
        }
    }

    public List<TagConfig> getDefaultTags() {
        List<TagConfig> defaults = new ArrayList<>();

        List<Integer> seriousQueueIds = List.of(420, 440, 1700, 2400);
        List<Integer> casualQueueIds = List.of(430, 450, 900, 1700, 1900, 2000, 2400);

        defaults.add(defaultHistoryTag(
                "default_streak_win",
                "{N}连胜",
                "最近状态很热，连续赢了好几把。",
                true,
                List.of(new MatchFilter.QueueFilter(seriousQueueIds)),
                new MatchRefresh.StreakRefresh(3, StreakType.WIN)
        ));

        defaults.add(defaultHistoryTag(
                "default_streak_loss",
                "{N}连败",
                "最近状态很裂，连着输。",
                false,
                List.of(new MatchFilter.QueueFilter(seriousQueueIds)),
                new MatchRefresh.StreakRefresh(3, StreakType.LOSS)
        ));

        defaults.add(defaultHistoryTag(
                "default_high_win_rate",
                "高胜率",
                "最近这人赢得多，状态肉眼可见地在线。",
                true,
                List.of(new MatchFilter.QueueFilter(seriousQueueIds)),
                new MatchRefresh.AverageRefresh("win", Operator.GTE, 0.60)
        ));

        defaults.add(defaultHistoryTag(
                "default_slump",
                "低迷",
                "最近赢少输多，手感和节奏都不太对。",
                false,
                List.of(new MatchFilter.QueueFilter(seriousQueueIds)),
                new MatchRefresh.AverageRefresh("win", Operator.LT, 0.40)
        ));

        defaults.add(defaultHistoryTag(
                "default_stable_carry",
                "稳定C",
                "最近 KDA 很稳，基本都有核心输出味道。",
                true,
                List.of(new MatchFilter.QueueFilter(seriousQueueIds)),
                new MatchRefresh.AverageRefresh("kda", Operator.GTE, 4.0)
        ));

        defaults.add(defaultHistoryTag(
                "default_high_damage",
                "高伤",
                "最近几把输出量都不低，伤害是真能打。",
                true,
                List.of(
                        new MatchFilter.QueueFilter(seriousQueueIds),
                        new MatchFilter.StatFilter("damage", Operator.GTE, 25000.0)
                ),
                new MatchRefresh.CountRefresh(Operator.GTE, 4.0)
        ));

        defaults.add(new TagConfig(
                "default_casual",
                "娱乐",
                "最近主要在玩娱乐模式，排位样本不算多。",
                null,
                true,
                true,
                new TagCondition.AndCondition(List.of(
                        new TagCondition.NotCondition(new TagCondition.CurrentQueueCondition(casualQueueIds)),
                        new TagCondition.HistoryCondition(
                                List.of(new MatchFilter.QueueFilter(casualQueueIds)),
                                new MatchRefresh.CountRefresh(Operator.GT, 10.0)
                        )
                ))
        ));

        defaults.add(defaultHistoryTag(
                "default_smolder",
                "小火龙",
                "最近小火龙拿得多，英雄池信息很直接。",
                null,
                List.of(
                        new MatchFilter.QueueFilter(seriousQueueIds),
                        new MatchFilter.ChampionFilter(List.of(901))
                ),
                new MatchRefresh.CountRefresh(Operator.GTE, 4.0)
        ));

        return defaults;
    }

    private TagConfig defaultHistoryTag(String id,
                                        String name,
                                        String desc,
                                        Boolean good,
                                        List<MatchFilter> filters,
                                        MatchRefresh refresh) {
        return new TagConfig(
                id,
                name,
                desc,
                good,
                true,
                true,
                new TagCondition.HistoryCondition(filters, refresh)
        );
    }

    public synchronized void resetToDefault() {
        tagConfigs = getDefaultTags();
        persistConfig();
    }

    public synchronized void addTagConfig(TagConfig config) {
        tagConfigs.add(config);
        persistConfig();
    }

    public synchronized void updateTagConfig(String id, TagConfig config) {
        tagConfigs.removeIf(item -> item.getId().equals(id));
        tagConfigs.add(config);
        persistConfig();
    }

    public synchronized void deleteTagConfig(String id) {
        tagConfigs.removeIf(item -> item.getId().equals(id));
        persistConfig();
    }

    public synchronized void toggleTagConfig(String id) {
        tagConfigs.stream()
                .filter(item -> item.getId().equals(id))
                .findFirst()
                .ifPresent(item -> item.setEnabled(!Boolean.TRUE.equals(item.getEnabled())));
        persistConfig();
    }

    private static final class EvaluateResult {
        private final boolean matched;
        private final int streakValue;

        private EvaluateResult(boolean matched) {
            this(matched, 0);
        }

        private EvaluateResult(boolean matched, int streakValue) {
            this.matched = matched;
            this.streakValue = streakValue;
        }
    }
}
