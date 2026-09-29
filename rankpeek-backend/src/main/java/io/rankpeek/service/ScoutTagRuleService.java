package io.rankpeek.service;

import io.rankpeek.model.MatchHistory;
import io.rankpeek.model.RankTag;
import io.rankpeek.model.ScoutTagContext;
import io.rankpeek.model.ScoutTagSample;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class ScoutTagRuleService {

    private static final Set<Integer> FIXED_POSITION_QUEUE_IDS = Set.of(420, 440);
    private static final Set<Integer> CASUAL_QUEUE_IDS = Set.of(430, 450, 900, 1700, 1900, 2000, 2400);
    private static final Set<String> LANE_TAG_POSITIONS = Set.of("TOP", "MIDDLE", "BOTTOM");
    private static final int OFFROLE_MIN_RELIABLE_POSITIONS = 4;
    private static final int OFFROLE_MIN_MAIN_POSITION_COUNT = 3;
    private static final int LANE_TAG_MIN_RELIABLE_SAME_POSITION = 8;
    private static final int LANE_TAG_GOLD_DIFF_THRESHOLD = 750;
    private static final int SMOLDER_CHAMPION_ID = 901;

    private final AssetService assetService;

    public List<RankTag> buildTags(ScoutTagContext context, ScoutTagSample sample) {
        List<RankTag> tags = new ArrayList<>();
        if (context == null || sample == null) {
            return tags;
        }

        tryAdd(tags, () -> addStreakTags(tags, context, sample));
        tryAdd(tags, () -> addWinRateTags(tags, context, sample));
        tryAdd(tags, () -> addKdaTag(tags, context, sample));
        tryAdd(tags, () -> addHighDamageTag(tags, context, sample));
        tryAdd(tags, () -> addCasualTag(tags, context, sample));
        tryAdd(tags, () -> addSmolderTag(tags, context, sample));
        tryAdd(tags, () -> addPremadeTag(tags, context, sample));
        tryAdd(tags, () -> addChampionSpecialistTags(tags, context, sample));
        tryAdd(tags, () -> addOffroleTag(tags, context, sample));
        tryAdd(tags, () -> addLaneTags(tags, context, sample));

        tags.sort(Comparator.comparingInt(this::tagPriority));
        return tags;
    }

    private void addStreakTags(List<RankTag> tags, ScoutTagContext context, ScoutTagSample sample) {
        Integer streak = currentResultStreak(sample.getCurrentModeMatches(), context.getPuuid());
        if (streak == null || Math.abs(streak) < 3) {
            return;
        }
        if (streak > 0) {
            addTag(tags, true, streak + "连胜", "当前模式近期连续获胜。");
        } else {
            addTag(tags, false, Math.abs(streak) + "连败", "当前模式近期连续失败。");
        }
    }

    private Integer currentResultStreak(List<MatchHistory> matches, String puuid) {
        Boolean expectedWin = null;
        int streak = 0;
        for (MatchHistory match : safeList(matches)) {
            MatchHistory.Participant participant = participant(match, puuid);
            if (participant == null || participant.getStats() == null || participant.getStats().getWin() == null) {
                continue;
            }
            boolean win = Boolean.TRUE.equals(participant.getStats().getWin());
            if (expectedWin == null) {
                expectedWin = win;
            }
            if (expectedWin == win) {
                streak++;
            } else {
                break;
            }
        }
        if (expectedWin == null) {
            return null;
        }
        return expectedWin ? streak : -streak;
    }

    private void addWinRateTags(List<RankTag> tags, ScoutTagContext context, ScoutTagSample sample) {
        WinStats winStats = winStats(sample.getCurrentModeMatches(), context.getPuuid());
        if (winStats.total() <= 0) {
            return;
        }
        double winRate = winStats.wins() * 1.0 / winStats.total();
        if (winRate >= 0.60) {
            addTag(tags, true, "高胜率", "当前模式胜率不低。");
        } else if (winRate < 0.40) {
            addTag(tags, false, "低迷", "当前模式近期胜率偏低。");
        }
    }

    private void addKdaTag(List<RankTag> tags, ScoutTagContext context, ScoutTagSample sample) {
        int count = 0;
        double total = 0;
        for (MatchHistory match : safeList(sample.getCurrentModeMatches())) {
            MatchHistory.Participant participant = participant(match, context.getPuuid());
            if (participant == null || participant.getStats() == null) {
                continue;
            }
            MatchHistory.Stats stats = participant.getStats();
            total += (value(stats.getKills()) + value(stats.getAssists())) * 1.0 / Math.max(1, value(stats.getDeaths()));
            count++;
        }
        if (count > 0 && total / count >= 4.0) {
            addTag(tags, true, "稳定C", "当前模式平均 KDA 很稳。");
        }
    }

    private void addHighDamageTag(List<RankTag> tags, ScoutTagContext context, ScoutTagSample sample) {
        long highDamageCount = safeList(sample.getCurrentModeMatches()).stream()
                .map(match -> participant(match, context.getPuuid()))
                .filter(participant -> participant != null && participant.getStats() != null)
                .filter(participant -> value(participant.getStats().getTotalDamageDealtToChampions()) >= 25_000)
                .count();
        if (highDamageCount >= 4) {
            addTag(tags, true, "高伤", "当前模式高伤害对局较多。");
        }
    }

    private void addCasualTag(List<RankTag> tags, ScoutTagContext context, ScoutTagSample sample) {
        if (CASUAL_QUEUE_IDS.contains(normalizeQueueId(context.getCurrentQueueId()))) {
            return;
        }
        long casualCount = safeList(sample.getLookbackMatches()).stream()
                .filter(match -> match != null && match.getQueueId() != null && CASUAL_QUEUE_IDS.contains(match.getQueueId()))
                .count();
        if (casualCount > 10) {
            addTag(tags, null, "娱乐", "最近 50 场娱乐模式偏多。");
        }
    }

    private void addSmolderTag(List<RankTag> tags, ScoutTagContext context, ScoutTagSample sample) {
        long smolderCount = safeList(sample.getCurrentModeMatches()).stream()
                .map(match -> participant(match, context.getPuuid()))
                .filter(participant -> participant != null && Integer.valueOf(SMOLDER_CHAMPION_ID).equals(participant.getChampionId()))
                .count();
        if (smolderCount >= 4) {
            addTag(tags, null, "小火龙", "当前模式小火龙使用较多。");
        }
    }

    private void addPremadeTag(List<RankTag> tags, ScoutTagContext context, ScoutTagSample sample) {
        Set<String> currentTeammates = new HashSet<>(safeList(context.getCurrentTeamPuuids()));
        currentTeammates.remove(context.getPuuid());
        if (currentTeammates.isEmpty()) {
            return;
        }

        for (MatchHistory match : safeList(sample.getLookbackMatches()).stream().limit(2).toList()) {
            Set<String> recentTeammates = teammatePuuids(match, context.getPuuid());
            recentTeammates.retainAll(currentTeammates);
            if (!recentTeammates.isEmpty()) {
                addTag(tags, null, "开黑", "当前队友最近也曾同队出现。");
                return;
            }
        }
    }

    private void addChampionSpecialistTags(List<RankTag> tags, ScoutTagContext context, ScoutTagSample sample) {
        Map<Integer, ChampionStats> statsByChampion = new LinkedHashMap<>();
        int valid = 0;
        for (MatchHistory match : safeList(sample.getCurrentModeMatches())) {
            MatchHistory.Participant participant = participant(match, context.getPuuid());
            if (participant == null || participant.getChampionId() == null || participant.getStats() == null) {
                continue;
            }
            valid++;
            ChampionStats stats = statsByChampion.computeIfAbsent(participant.getChampionId(), ignored -> new ChampionStats());
            stats.games++;
            if (Boolean.TRUE.equals(participant.getStats().getWin())) {
                stats.wins++;
            }
        }

        if (valid < 4 || statsByChampion.isEmpty()) {
            return;
        }

        Map.Entry<Integer, ChampionStats> top = statsByChampion.entrySet().stream()
                .max(Comparator.comparingInt(entry -> entry.getValue().games))
                .orElse(null);
        if (top == null || top.getValue().games < 4 || top.getValue().games * 2 < valid) {
            return;
        }

        double championWinRate = top.getValue().wins * 1.0 / top.getValue().games;
        if (championWinRate >= 0.55) {
            addTag(tags, true, ChampionTagFormatter.signatureTagName(assetService, top.getKey()), "当前模式该英雄使用集中且胜率不错。");
        } else if (championWinRate <= 0.40) {
            addTag(tags, false, ChampionTagFormatter.struggleTagName(assetService, top.getKey()), "当前模式该英雄使用集中但胜率偏低。");
        }
    }

    private void addOffroleTag(List<RankTag> tags, ScoutTagContext context, ScoutTagSample sample) {
        if (!FIXED_POSITION_QUEUE_IDS.contains(normalizeQueueId(context.getCurrentQueueId()))) {
            return;
        }

        String currentPosition = normalizePosition(context.getCurrentPosition());
        if (currentPosition == null) {
            return;
        }

        Map<String, Integer> positionCounts = new HashMap<>();
        int known = 0;
        for (MatchHistory match : safeList(sample.getCurrentModeMatches())) {
            MatchHistory.Participant participant = participant(match, context.getPuuid());
            String position = participantPosition(participant);
            if (position == null) {
                continue;
            }
            known++;
            positionCounts.merge(position, 1, Integer::sum);
        }
        if (known < OFFROLE_MIN_RELIABLE_POSITIONS) {
            return;
        }

        Map.Entry<String, Integer> main = positionCounts.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .orElse(null);
        if (main != null
                && main.getValue() >= OFFROLE_MIN_MAIN_POSITION_COUNT
                && main.getValue() * 2 >= known
                && !currentPosition.equals(main.getKey())) {
            addTag(tags, null, "补位", "本局位置和近期常玩位置不一致，可能是补位。");
        }
    }

    private void addLaneTags(List<RankTag> tags, ScoutTagContext context, ScoutTagSample sample) {
        if (!FIXED_POSITION_QUEUE_IDS.contains(normalizeQueueId(context.getCurrentQueueId()))) {
            return;
        }

        String currentPosition = normalizePosition(context.getCurrentPosition());
        if (currentPosition == null || !LANE_TAG_POSITIONS.contains(currentPosition)) {
            return;
        }

        int reliable = 0;
        int pressure = 0;
        int risks = 0;
        for (MatchHistory match : safeList(sample.getCurrentModeMatches())) {
            MatchHistory.Participant participant = participant(match, context.getPuuid());
            String historyPosition = participantPosition(participant);
            if (!currentPosition.equals(historyPosition)) {
                continue;
            }
            Integer goldDiff15 = laneGoldDiff15(participant);
            if (goldDiff15 == null) {
                continue;
            }
            reliable++;
            if (goldDiff15 >= LANE_TAG_GOLD_DIFF_THRESHOLD) {
                pressure++;
            } else if (goldDiff15 <= -LANE_TAG_GOLD_DIFF_THRESHOLD) {
                risks++;
            }
        }
        if (reliable < LANE_TAG_MIN_RELIABLE_SAME_POSITION) {
            return;
        }
        int required = (reliable + 1) / 2;
        if (pressure >= required && pressure > risks) {
            addTag(tags, true, "对线压制", "近期在当前分路经常打出对线经济优势。");
        } else if (risks >= required && risks > pressure) {
            addTag(tags, false, "对线风险", "近期在当前分路对线期容易落后。");
        }
    }

    private Integer laneGoldDiff15(MatchHistory.Participant participant) {
        if (participant == null || participant.getStats() == null) {
            return null;
        }
        MatchHistory.Stats stats = participant.getStats();
        return firstNonNull(
                stats.getEarlyGoldDiff(),
                stats.getLaneGoldDiff15(),
                stats.getGoldDiff15(),
                stats.getGoldDiffAt15(),
                stats.getGoldDifferenceAt15(),
                stats.getFifteenMinuteGoldDiff()
        );
    }

    private String participantPosition(MatchHistory.Participant participant) {
        if (participant == null) {
            return null;
        }
        String position = firstNormalizedPosition(
                participant.getTeamPosition(),
                participant.getIndividualPosition(),
                participant.getSelectedPosition()
        );
        if (position != null) {
            return position;
        }
        return laneRolePosition(participant.getLane(), participant.getRole());
    }

    private Set<String> teammatePuuids(MatchHistory match, String puuid) {
        Set<String> result = new HashSet<>();
        MatchHistory.Participant self = participant(match, puuid);
        if (self == null || self.getTeamId() == null || match == null || match.getParticipants() == null) {
            return result;
        }
        for (MatchHistory.Participant participant : match.getParticipants()) {
            if (participant == null || participant.getParticipantId() == null || !self.getTeamId().equals(participant.getTeamId())) {
                continue;
            }
            String teammatePuuid = puuidByParticipantId(match, participant.getParticipantId());
            if (teammatePuuid != null && !teammatePuuid.equals(puuid)) {
                result.add(teammatePuuid);
            }
        }
        return result;
    }

    private WinStats winStats(List<MatchHistory> matches, String puuid) {
        int wins = 0;
        int total = 0;
        for (MatchHistory match : safeList(matches)) {
            MatchHistory.Participant participant = participant(match, puuid);
            if (participant == null || participant.getStats() == null || participant.getStats().getWin() == null) {
                continue;
            }
            total++;
            if (Boolean.TRUE.equals(participant.getStats().getWin())) {
                wins++;
            }
        }
        return new WinStats(wins, total);
    }

    private MatchHistory.Participant participant(MatchHistory match, String puuid) {
        if (match == null || match.getParticipants() == null || match.getParticipants().isEmpty()) {
            return null;
        }
        Integer participantId = participantIdByPuuid(match, puuid);
        if (participantId != null) {
            for (MatchHistory.Participant participant : match.getParticipants()) {
                if (participantId.equals(participant.getParticipantId())) {
                    return participant;
                }
            }
        }
        return match.getParticipants().size() == 1 ? match.getParticipants().getFirst() : null;
    }

    private Integer participantIdByPuuid(MatchHistory match, String puuid) {
        if (match == null || match.getParticipantIdentities() == null || puuid == null) {
            return null;
        }
        for (MatchHistory.ParticipantIdentity identity : match.getParticipantIdentities()) {
            if (identity != null
                    && identity.getPlayer() != null
                    && puuid.equals(identity.getPlayer().getPuuid())) {
                return identity.getParticipantId();
            }
        }
        return null;
    }

    private String puuidByParticipantId(MatchHistory match, Integer participantId) {
        if (match == null || match.getParticipantIdentities() == null || participantId == null) {
            return null;
        }
        for (MatchHistory.ParticipantIdentity identity : match.getParticipantIdentities()) {
            if (identity != null
                    && participantId.equals(identity.getParticipantId())
                    && identity.getPlayer() != null) {
                return identity.getPlayer().getPuuid();
            }
        }
        return null;
    }

    private void addTag(List<RankTag> tags, Boolean good, String name, String desc) {
        if (tags.stream().noneMatch(tag -> name.equals(tag.getTagName()))) {
            tags.add(RankTag.builder().good(good).tagName(name).tagDesc(desc).build());
        }
    }

    private String normalizePosition(String position) {
        if (position == null || position.isBlank()) {
            return null;
        }
        return switch (position.trim().toUpperCase()) {
            case "TOP" -> "TOP";
            case "JUNGLE" -> "JUNGLE";
            case "MID", "MIDDLE" -> "MIDDLE";
            case "BOT", "BOTTOM", "ADC" -> "BOTTOM";
            case "SUPPORT", "UTILITY" -> "SUPPORT";
            default -> null;
        };
    }

    private String firstNormalizedPosition(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            String normalized = normalizePosition(value);
            if (normalized != null) {
                return normalized;
            }
        }
        return null;
    }

    private String laneRolePosition(String lane, String role) {
        String normalizedLane = normalizePosition(lane);
        String normalizedRole = normalizeRole(role);
        if ("JUNGLE".equals(normalizedLane)) {
            return "JUNGLE";
        }
        if ("TOP".equals(normalizedLane)) {
            return "TOP";
        }
        if ("MIDDLE".equals(normalizedLane)) {
            return "MIDDLE";
        }
        if ("BOTTOM".equals(normalizedLane)) {
            return "SUPPORT".equals(normalizedRole) ? "SUPPORT" : "BOTTOM";
        }
        if ("SUPPORT".equals(normalizedLane) || "SUPPORT".equals(normalizedRole)) {
            return "SUPPORT";
        }
        return null;
    }

    private String normalizeRole(String role) {
        if (role == null || role.isBlank()) {
            return null;
        }
        return switch (role.trim().toUpperCase()) {
            case "SUPPORT", "DUO_SUPPORT" -> "SUPPORT";
            case "BOTTOM", "BOT", "ADC", "DUO_CARRY", "CARRY" -> "BOTTOM";
            default -> normalizePosition(role);
        };
    }

    private int tagPriority(RankTag tag) {
        String name = tag.getTagName();
        if (name == null) {
            return 99;
        }
        if (name.endsWith("连胜")) {
            return 0;
        }
        if (name.endsWith("连败")) {
            return 1;
        }
        if (ChampionTagFormatter.isSignatureTagName(name)) {
            return 10;
        }
        if (ChampionTagFormatter.isStruggleTagName(name)) {
            return 11;
        }
        return switch (name) {
            case "高胜率" -> 2;
            case "低迷" -> 3;
            case "稳定C" -> 4;
            case "高伤" -> 5;
            case "娱乐" -> 6;
            case "小火龙" -> 7;
            case "开黑" -> 8;
            case "补位" -> 12;
            case "对线压制" -> 13;
            case "对线风险" -> 14;
            default -> 50;
        };
    }

    private void tryAdd(List<RankTag> tags, TagCalculator calculator) {
        try {
            calculator.add();
        } catch (Exception e) {
            log.debug("Scout tag calculation failed; continuing with remaining tags", e);
        }
    }

    private <T> List<T> safeList(List<T> values) {
        return values == null ? List.of() : values;
    }

    private int normalizeQueueId(Integer queueId) {
        return queueId == null ? 0 : queueId;
    }

    private int value(Integer value) {
        return value == null ? 0 : value;
    }

    private String firstText(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private Integer firstNonNull(Integer... values) {
        if (values == null) {
            return null;
        }
        for (Integer value : values) {
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private interface TagCalculator {
        void add();
    }

    private record WinStats(int wins, int total) {
    }

    private static final class ChampionStats {
        private int games;
        private int wins;
    }
}
