package io.rankpeek.cache;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.rankpeek.model.GameDetail;
import io.rankpeek.model.MatchDataScopeCache;
import io.rankpeek.model.MatchHistory;
import io.rankpeek.model.MatchHistoryFetchResult;
import io.rankpeek.model.MatchTimeline;
import io.rankpeek.model.Rank;
import io.rankpeek.model.Summoner;
import io.rankpeek.service.LocalCacheRetentionService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Slf4j
@Repository
public class JdbcMatchHistoryCacheRepository implements MatchHistoryCacheRepository {

    private static final int DEFAULT_MATCH_INDEX_KEEP_COUNT = 200;

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final LocalCacheRecoveryCoordinator recoveryCoordinator;
    private final LocalCacheRetentionService retentionService;

    @Autowired
    public JdbcMatchHistoryCacheRepository(
            JdbcTemplate jdbcTemplate,
            ObjectMapper objectMapper,
            LocalCacheRecoveryCoordinator recoveryCoordinator,
            LocalCacheRetentionService retentionService) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.recoveryCoordinator = recoveryCoordinator;
        this.retentionService = retentionService;
    }

    public JdbcMatchHistoryCacheRepository(
            JdbcTemplate jdbcTemplate,
            ObjectMapper objectMapper,
            LocalCacheRecoveryCoordinator recoveryCoordinator) {
        this(jdbcTemplate, objectMapper, recoveryCoordinator, null);
    }

    public JdbcMatchHistoryCacheRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this(jdbcTemplate, objectMapper, null, null);
    }

    @Override
    public Optional<MatchHistoryFetchResult> findRecentMatchHistory(String puuid, int limit) {
        if (puuid == null || puuid.isBlank() || limit <= 0) {
            return Optional.empty();
        }

        try {
            List<CachedMatchRow> rawRows = jdbcTemplate.query(
                    """
                            SELECT m.game_id, m.raw_json
                            FROM player_match_index i
                            JOIN match_cache m ON m.game_id = i.game_id
                            WHERE i.puuid = ?
                            ORDER BY i.game_creation DESC, i.game_id DESC
                            LIMIT ?
                            """,
                    (rs, rowNum) -> new CachedMatchRow(rs.getLong("game_id"), rs.getString("raw_json")),
                    puuid,
                    limit
            );

            if (rawRows.isEmpty()) {
                return findEmptyFetchState(puuid);
            }

            List<MatchHistory> matches = new ArrayList<>();
            for (CachedMatchRow row : rawRows) {
                Optional<MatchHistory> cachedMatch = readValue(row.rawJson(), MatchHistory.class, "match history");
                if (cachedMatch.isEmpty()) {
                    continue;
                }

                MatchHistory match = cachedMatch.get();
                if (match.getGameId() == null) {
                    match.setGameId(row.gameId());
                }
                matches.add(restoreRosterFromLocalCache(puuid, match));
            }

            if (matches.isEmpty()) {
                return Optional.empty();
            }

            return Optional.of(MatchHistoryFetchResult.builder()
                    .matches(matches)
                    .rawEmpty(false)
                    .build());
        } catch (Exception e) {
            log.warn("Failed to read match history from local cache, puuid={}, rootCause={}",
                    puuidPrefix(puuid),
                    rootCauseSummary(e),
                    e);
            recoverIfCorrupt(e, "repository.findRecentMatchHistory");
            return Optional.empty();
        }
    }

    @Override
    public void saveMatchHistory(String puuid, List<MatchHistory> matches) {
        if (puuid == null || puuid.isBlank() || matches == null) {
            return;
        }

        List<MatchHistory> renderableMatches = filterRenderableCurrentPlayerMatches(puuid, matches);
        if (renderableMatches.size() < matches.size()) {
            log.info("Filtered incomplete match history rows before H2 save: puuid={}, filtered={}, kept={}",
                    puuidPrefix(puuid), matches.size() - renderableMatches.size(), renderableMatches.size());
        }
        if (renderableMatches.isEmpty()) {
            return;
        }

        long now = System.currentTimeMillis();
        Set<Long> existingGameIds = findExistingMatchCacheGameIds(renderableMatches);
        Map<Long, Integer> existingIndexCounts = findExistingPlayerMatchIndexCounts(renderableMatches);
        try {
            for (MatchHistory match : renderableMatches) {
                if (match.getGameId() == null || !existingGameIds.contains(match.getGameId())) {
                    saveMatch(match, now);
                    saveParticipants(match, now);
                }
                if (match.getGameId() == null
                        || existingIndexCounts.getOrDefault(match.getGameId(), 0) < participantPuuidCount(match)) {
                    savePlayerMatchIndexesForAllParticipants(match, now);
                }
            }
            updatePlayerFetchState(puuid, renderableMatches, "OK", null);
            runRetention();
        } catch (Exception e) {
            log.warn("Failed to save match history to local cache, puuid={}, rootCause={}",
                    puuidPrefix(puuid),
                    rootCauseSummary(e),
                    e);
            recoverIfCorrupt(e, "repository.saveMatchHistory");
            updatePlayerFetchState(puuid, renderableMatches, "ERROR", e.getMessage());
        }
    }

    private Map<Long, Integer> findExistingPlayerMatchIndexCounts(List<MatchHistory> matches) {
        List<Long> gameIds = matches.stream()
                .filter(match -> match != null && match.getGameId() != null)
                .map(MatchHistory::getGameId)
                .distinct()
                .toList();
        if (gameIds.isEmpty()) {
            return Map.of();
        }

        String placeholders = String.join(",", java.util.Collections.nCopies(gameIds.size(), "?"));
        try {
            return jdbcTemplate.query(
                    "SELECT game_id, COUNT(*) AS row_count FROM player_match_index WHERE game_id IN ("
                            + placeholders + ") GROUP BY game_id",
                    rs -> {
                        Map<Long, Integer> counts = new HashMap<>();
                        while (rs.next()) {
                            counts.put(rs.getLong("game_id"), rs.getInt("row_count"));
                        }
                        return counts;
                    },
                    gameIds.toArray()
            );
        } catch (Exception e) {
            log.warn("Failed to inspect existing match index rows before save, rootCause={}",
                    rootCauseSummary(e),
                    e);
            recoverIfCorrupt(e, "repository.findExistingPlayerMatchIndexCounts");
            return Map.of();
        }
    }

    private int participantPuuidCount(MatchHistory match) {
        if (match == null || match.getParticipantIdentities() == null || match.getParticipantIdentities().isEmpty()) {
            return 0;
        }
        Set<String> puuids = new HashSet<>();
        for (MatchHistory.ParticipantIdentity identity : match.getParticipantIdentities()) {
            if (identity == null || identity.getPlayer() == null) {
                continue;
            }
            String puuid = identity.getPlayer().getPuuid();
            if (puuid != null && !puuid.isBlank()) {
                puuids.add(puuid);
            }
        }
        return puuids.size();
    }

    private Set<Long> findExistingMatchCacheGameIds(List<MatchHistory> matches) {
        List<Long> gameIds = matches.stream()
                .filter(match -> match != null && match.getGameId() != null)
                .map(MatchHistory::getGameId)
                .distinct()
                .toList();
        if (gameIds.isEmpty()) {
            return Set.of();
        }

        String placeholders = String.join(",", java.util.Collections.nCopies(gameIds.size(), "?"));
        try {
            return new HashSet<>(jdbcTemplate.queryForList(
                    "SELECT game_id FROM match_cache WHERE game_id IN (" + placeholders + ")",
                    Long.class,
                    gameIds.toArray()
            ));
        } catch (Exception e) {
            log.warn("Failed to inspect existing match cache rows before save, rootCause={}",
                    rootCauseSummary(e),
                    e);
            recoverIfCorrupt(e, "repository.findExistingMatchCacheGameIds");
            return Set.of();
        }
    }

    @Override
    public Optional<GameDetail> findGameDetail(Long gameId) {
        if (gameId == null) {
            return Optional.empty();
        }

        try {
            String rawJson = jdbcTemplate.queryForObject(
                    "SELECT raw_json FROM game_detail_cache WHERE game_id = ?",
                    String.class,
                    gameId
            );
            return readValue(rawJson, GameDetail.class, "game detail");
        } catch (EmptyResultDataAccessException e) {
            return Optional.empty();
        } catch (Exception e) {
            log.warn("Failed to read game detail from local cache, gameId={}, rootCause={}",
                    gameId,
                    rootCauseSummary(e),
                    e);
            recoverIfCorrupt(e, "repository.findGameDetail");
            return Optional.empty();
        }
    }

    @Override
    public void saveGameDetail(GameDetail detail) {
        if (detail == null || detail.getGameId() == null) {
            return;
        }

        long now = System.currentTimeMillis();
        try {
            jdbcTemplate.update(
                    """
                            MERGE INTO game_detail_cache (game_id, raw_json, updated_at)
                            KEY(game_id) VALUES (?, ?, ?)
                            """,
                    detail.getGameId(),
                    writeValue(detail),
                    now
            );
        } catch (Exception e) {
            log.warn("Failed to save game detail to local cache, gameId={}, rootCause={}",
                    detail.getGameId(),
                    rootCauseSummary(e),
                    e);
            recoverIfCorrupt(e, "repository.saveGameDetail");
        }
    }

    @Override
    public void saveSgpRawSummaries(Map<Long, String> rawSummaryJsonByGameId) {
        if (rawSummaryJsonByGameId == null || rawSummaryJsonByGameId.isEmpty()) {
            return;
        }

        for (Map.Entry<Long, String> entry : rawSummaryJsonByGameId.entrySet()) {
            if (entry.getKey() == null || entry.getValue() == null || entry.getValue().isBlank()) {
                continue;
            }
            try {
                saveSgpRawSummary(entry.getKey(), entry.getValue());
            } catch (Exception e) {
                log.warn("Failed to save SGP raw summary scope, gameId={}, rootCause={}",
                        entry.getKey(),
                        rootCauseSummary(e),
                        e);
                recoverIfCorrupt(e, "repository.saveSgpRawSummaries");
            }
        }
    }

    @Override
    public void saveSgpRawDetail(Long gameId, String rawDetailJson, String status, String lastError) {
        if (gameId == null) {
            return;
        }

        long now = System.currentTimeMillis();
        try {
            int updated = jdbcTemplate.update(
                    """
                            UPDATE match_data_scope_cache
                            SET source = ?, detail_raw_json = ?, detail_status = ?,
                                fetched_at = ?, schema_version = ?, last_error = ?, updated_at = ?
                            WHERE game_id = ?
                            """,
                    "sgp",
                    rawDetailJson,
                    normalizeStatus(status),
                    now,
                    1,
                    lastError,
                    now,
                    gameId
            );
            if (updated == 0) {
                jdbcTemplate.update(
                        """
                                INSERT INTO match_data_scope_cache (
                                    game_id, source, detail_raw_json, detail_status,
                                    fetched_at, schema_version, last_error, updated_at
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                """,
                        gameId,
                        "sgp",
                        rawDetailJson,
                        normalizeStatus(status),
                        now,
                        1,
                        lastError,
                        now
                );
            }
        } catch (Exception e) {
            log.warn("Failed to save SGP raw detail scope, gameId={}, rootCause={}",
                    gameId,
                    rootCauseSummary(e),
                    e);
            recoverIfCorrupt(e, "repository.saveSgpRawDetail");
        }
    }

    @Override
    public void saveSgpTimeline(Long gameId,
                                MatchTimeline timeline,
                                String rawTimelineJson,
                                String status,
                                String lastError) {
        if (gameId == null) {
            return;
        }

        long now = System.currentTimeMillis();
        try {
            String timelineJson = timeline == null ? null : writeValue(timeline);
            int updated = jdbcTemplate.update(
                    """
                            UPDATE match_data_scope_cache
                            SET source = ?, timeline_raw_json = ?, timeline_json = ?, timeline_status = ?,
                                fetched_at = ?, schema_version = ?, last_error = ?, updated_at = ?
                            WHERE game_id = ?
                            """,
                    "sgp",
                    rawTimelineJson,
                    timelineJson,
                    normalizeStatus(status),
                    now,
                    1,
                    lastError,
                    now,
                    gameId
            );
            if (updated == 0) {
                jdbcTemplate.update(
                        """
                                INSERT INTO match_data_scope_cache (
                                    game_id, source, timeline_raw_json, timeline_json, timeline_status,
                                    fetched_at, schema_version, last_error, updated_at
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                                """,
                        gameId,
                        "sgp",
                        rawTimelineJson,
                        timelineJson,
                        normalizeStatus(status),
                        now,
                        1,
                        lastError,
                        now
                );
            }
        } catch (Exception e) {
            log.warn("Failed to save SGP timeline scope, gameId={}, rootCause={}",
                    gameId,
                    rootCauseSummary(e),
                    e);
            recoverIfCorrupt(e, "repository.saveSgpTimeline");
        }
    }

    @Override
    public Optional<MatchDataScopeCache> findMatchDataScope(Long gameId) {
        if (gameId == null) {
            return Optional.empty();
        }

        try {
            return Optional.ofNullable(jdbcTemplate.queryForObject(
                    """
                            SELECT game_id, source, summary_raw_json, detail_raw_json, timeline_raw_json,
                                   timeline_json, summary_status, detail_status, timeline_status,
                                   fetched_at, schema_version, last_error, updated_at
                            FROM match_data_scope_cache
                            WHERE game_id = ?
                            """,
                    (rs, rowNum) -> toMatchDataScopeCache(rs),
                    gameId
            ));
        } catch (EmptyResultDataAccessException e) {
            return Optional.empty();
        } catch (Exception e) {
            log.warn("Failed to read match data scope cache, gameId={}, rootCause={}",
                    gameId,
                    rootCauseSummary(e),
                    e);
            recoverIfCorrupt(e, "repository.findMatchDataScope");
            return Optional.empty();
        }
    }

    @Override
    public Optional<Summoner> findSummonerByPuuid(String puuid) {
        if (puuid == null || puuid.isBlank()) {
            return Optional.empty();
        }

        try {
            String rawJson = jdbcTemplate.queryForObject(
                    "SELECT raw_json FROM summoner_cache WHERE puuid = ?",
                    String.class,
                    puuid
            );
            return readValue(rawJson, Summoner.class, "summoner");
        } catch (EmptyResultDataAccessException e) {
            return Optional.empty();
        } catch (Exception e) {
            log.warn("Failed to read summoner from local cache, puuid={}, rootCause={}",
                    puuidPrefix(puuid),
                    rootCauseSummary(e),
                    e);
            recoverIfCorrupt(e, "repository.findSummonerByPuuid");
            return Optional.empty();
        }
    }

    @Override
    public Optional<Summoner> findSummonerByName(String gameName, String tagLine) {
        if (gameName == null || gameName.isBlank()) {
            return Optional.empty();
        }

        try {
            List<String> rawRows;
            if (tagLine != null && !tagLine.isBlank()) {
                rawRows = jdbcTemplate.query(
                        """
                                SELECT raw_json
                                FROM summoner_cache
                                WHERE LOWER(game_name) = LOWER(?)
                                  AND LOWER(COALESCE(tag_line, '')) = LOWER(?)
                                LIMIT 1
                                """,
                        (rs, rowNum) -> rs.getString("raw_json"),
                        gameName,
                        tagLine
                );
            } else {
                rawRows = jdbcTemplate.query(
                        """
                                SELECT raw_json
                                FROM summoner_cache
                                WHERE LOWER(game_name) = LOWER(?)
                                   OR LOWER(summoner_name) = LOWER(?)
                                LIMIT 1
                                """,
                        (rs, rowNum) -> rs.getString("raw_json"),
                        gameName,
                        gameName
                );
            }

            return rawRows.stream()
                    .findFirst()
                    .flatMap(rawJson -> readValue(rawJson, Summoner.class, "summoner"));
        } catch (Exception e) {
            log.warn("Failed to read summoner by name from local cache, name={}, rootCause={}",
                    gameName,
                    rootCauseSummary(e),
                    e);
            recoverIfCorrupt(e, "repository.findSummonerByName");
            return Optional.empty();
        }
    }

    @Override
    public void saveSummoner(Summoner summoner) {
        if (summoner == null || summoner.getPuuid() == null || summoner.getPuuid().isBlank()) {
            return;
        }

        long now = System.currentTimeMillis();
        try {
            jdbcTemplate.update(
                    """
                            MERGE INTO summoner_cache (
                                puuid, game_name, tag_line, summoner_name, profile_icon_id,
                                summoner_level, platform_id, raw_json, updated_at
                            )
                            KEY(puuid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                    summoner.getPuuid(),
                    summoner.getGameName(),
                    summoner.getTagLine(),
                    summoner.getGameName(),
                    summoner.getProfileIconId(),
                    summoner.getSummonerLevel(),
                    null,
                    writeValue(summoner),
                    now
            );
            mergeFetchStateTimestamp(summoner.getPuuid(), "summoner_updated_at", now);
        } catch (Exception e) {
            log.warn("Failed to save summoner to local cache, puuid={}, rootCause={}",
                    puuidPrefix(summoner.getPuuid()),
                    rootCauseSummary(e),
                    e);
            recoverIfCorrupt(e, "repository.saveSummoner");
        }
    }

    @Override
    public Optional<Rank> findRank(String puuid) {
        if (puuid == null || puuid.isBlank()) {
            return Optional.empty();
        }

        try {
            String rawJson = jdbcTemplate.queryForObject(
                    "SELECT raw_json FROM rank_cache WHERE puuid = ?",
                    String.class,
                    puuid
            );
            return readValue(rawJson, Rank.class, "rank");
        } catch (EmptyResultDataAccessException e) {
            return Optional.empty();
        } catch (Exception e) {
            log.warn("Failed to read rank from local cache, puuid={}, rootCause={}",
                    puuidPrefix(puuid),
                    rootCauseSummary(e),
                    e);
            recoverIfCorrupt(e, "repository.findRank");
            return Optional.empty();
        }
    }

    @Override
    public void saveRank(String puuid, Rank rank) {
        if (puuid == null || puuid.isBlank() || rank == null) {
            return;
        }

        long now = System.currentTimeMillis();
        try {
            jdbcTemplate.update(
                    """
                            MERGE INTO rank_cache (puuid, raw_json, updated_at)
                            KEY(puuid) VALUES (?, ?, ?)
                            """,
                    puuid,
                    writeValue(rank),
                    now
            );
            mergeFetchStateTimestamp(puuid, "rank_updated_at", now);
        } catch (Exception e) {
            log.warn("Failed to save rank to local cache, puuid={}, rootCause={}",
                    puuidPrefix(puuid),
                    rootCauseSummary(e),
                    e);
            recoverIfCorrupt(e, "repository.saveRank");
        }
    }

    @Override
    public void updatePlayerFetchState(String puuid, List<MatchHistory> matches, String status, String lastError) {
        if (puuid == null || puuid.isBlank()) {
            return;
        }

        long now = System.currentTimeMillis();
        MatchHistory latest = latestMatch(matches);
        try {
            jdbcTemplate.update(
                    """
                            MERGE INTO player_fetch_state (
                                puuid, latest_game_id, latest_game_creation, match_updated_at,
                                last_error, status, updated_at
                            )
                            KEY(puuid) VALUES (?, ?, ?, ?, ?, ?, ?)
                            """,
                    puuid,
                    latest == null ? null : latest.getGameId(),
                    latest == null ? null : latest.getGameCreation(),
                    now,
                    lastError,
                    status,
                    now
            );
        } catch (Exception e) {
            log.warn("Failed to update local fetch state, puuid={}, rootCause={}",
                    puuidPrefix(puuid),
                    rootCauseSummary(e),
                    e);
            recoverIfCorrupt(e, "repository.updatePlayerFetchState");
        }
    }

    @Override
    public Optional<Long> getMatchUpdatedAt(String puuid) {
        if (puuid == null || puuid.isBlank()) {
            return Optional.empty();
        }

        try {
            return Optional.ofNullable(jdbcTemplate.queryForObject(
                    "SELECT match_updated_at FROM player_fetch_state WHERE puuid = ?",
                    Long.class,
                    puuid
            ));
        } catch (EmptyResultDataAccessException e) {
            return Optional.empty();
        } catch (Exception e) {
            log.warn("Failed to read match cache timestamp, puuid={}, rootCause={}",
                    puuidPrefix(puuid),
                    rootCauseSummary(e),
                    e);
            recoverIfCorrupt(e, "repository.getMatchUpdatedAt");
            return Optional.empty();
        }
    }

    @Override
    public void trimPlayerMatchIndex(String puuid, int keepCount) {
        if (puuid == null || puuid.isBlank() || keepCount <= 0) {
            return;
        }

        try {
            jdbcTemplate.update(
                    """
                            DELETE FROM player_match_index
                            WHERE puuid = ?
                              AND game_id NOT IN (
                                  SELECT game_id FROM (
                                      SELECT game_id
                                      FROM player_match_index
                                      WHERE puuid = ?
                                      ORDER BY game_creation DESC, game_id DESC
                                      LIMIT ?
                                  )
                              )
                            """,
                    puuid,
                    puuid,
                    keepCount
            );
        } catch (Exception e) {
            log.warn("Failed to trim local match index, puuid={}, rootCause={}",
                    puuidPrefix(puuid),
                    rootCauseSummary(e),
                    e);
            recoverIfCorrupt(e, "repository.trimPlayerMatchIndex");
        }
    }

    private void saveMatch(MatchHistory match, long now) throws JsonProcessingException {
        jdbcTemplate.update(
                """
                        MERGE INTO match_cache (
                            game_id, queue_id, queue_name, game_mode, game_type, map_id,
                            game_creation, game_duration, platform_id, raw_json, updated_at
                        )
                        KEY(game_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                match.getGameId(),
                match.getQueueId(),
                match.getQueueName(),
                match.getGameMode(),
                match.getGameType(),
                match.getMapId(),
                match.getGameCreation(),
                match.getGameDuration(),
                match.getPlatformId(),
                writeValue(match),
                now
        );
    }

    private void saveSgpRawSummary(Long gameId, String rawSummaryJson) {
        long now = System.currentTimeMillis();
        int updated = jdbcTemplate.update(
                """
                        UPDATE match_data_scope_cache
                        SET source = ?, summary_raw_json = ?, summary_status = ?,
                            fetched_at = ?, schema_version = ?, updated_at = ?
                        WHERE game_id = ?
                        """,
                "sgp",
                rawSummaryJson,
                "FETCHED",
                now,
                1,
                now,
                gameId
        );
        if (updated == 0) {
            jdbcTemplate.update(
                    """
                            INSERT INTO match_data_scope_cache (
                                game_id, source, summary_raw_json, summary_status,
                                fetched_at, schema_version, updated_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?)
                            """,
                    gameId,
                    "sgp",
                    rawSummaryJson,
                    "FETCHED",
                    now,
                    1,
                    now
            );
        }
    }

    private void saveParticipants(MatchHistory match, long now) throws JsonProcessingException {
        if (match.getParticipants() == null || match.getParticipants().isEmpty()) {
            return;
        }

        Map<Integer, MatchHistory.Player> playerByParticipantId = playersByParticipantId(match);
        for (MatchHistory.Participant participant : match.getParticipants()) {
            if (participant == null || participant.getParticipantId() == null) {
                continue;
            }

            MatchHistory.Player player = playerByParticipantId.get(participant.getParticipantId());
            if (player == null || player.getPuuid() == null || player.getPuuid().isBlank()) {
                continue;
            }

            MatchHistory.Stats stats = participant.getStats();
            jdbcTemplate.update(
                    """
                            MERGE INTO match_participant_cache (
                                game_id, puuid, participant_id, team_id, champion_id, spell1_id, spell2_id,
                                win, kills, deaths, assists, gold_earned, total_damage_dealt_to_champions,
                                total_damage_taken, total_minions_killed, neutral_minions_killed,
                                game_name, tag_line, summoner_name, raw_json, updated_at
                            )
                            KEY(game_id, puuid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                    match.getGameId(),
                    player.getPuuid(),
                    participant.getParticipantId(),
                    participant.getTeamId(),
                    participant.getChampionId(),
                    participant.getSpell1Id(),
                    participant.getSpell2Id(),
                    stats == null ? null : stats.getWin(),
                    stats == null ? null : stats.getKills(),
                    stats == null ? null : stats.getDeaths(),
                    stats == null ? null : stats.getAssists(),
                    stats == null ? null : stats.getGoldEarned(),
                    stats == null ? null : stats.getTotalDamageDealtToChampions(),
                    stats == null ? null : stats.getTotalDamageTaken(),
                    stats == null ? null : stats.getTotalMinionsKilled(),
                    stats == null ? null : stats.getNeutralMinionsKilled(),
                    player.getGameName(),
                    player.getTagLine(),
                    player.getSummonerName(),
                    writeValue(participant),
                    now
            );
        }
    }

    private void savePlayerMatchIndex(String puuid, MatchHistory match, long now) {
        MatchHistory.Participant participant = participantByPuuid(match, puuid).orElse(null);
        MatchHistory.Stats stats = participant == null ? null : participant.getStats();
        jdbcTemplate.update(
                """
                        MERGE INTO player_match_index (
                            puuid, game_id, game_creation, queue_id, champion_id, win, updated_at
                        )
                        KEY(puuid, game_id) VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                puuid,
                match.getGameId(),
                match.getGameCreation(),
                match.getQueueId(),
                participant == null ? null : participant.getChampionId(),
                stats == null ? null : stats.getWin(),
                now
        );
    }

    private void savePlayerMatchIndexesForAllParticipants(MatchHistory match, long now) {
        if (match.getParticipantIdentities() == null || match.getParticipantIdentities().isEmpty()) {
            return;
        }

        Map<Integer, MatchHistory.Participant> participantByParticipantId = participantsByParticipantId(match);
        for (MatchHistory.ParticipantIdentity identity : match.getParticipantIdentities()) {
            if (identity == null || identity.getParticipantId() == null || identity.getPlayer() == null) {
                continue;
            }

            String participantPuuid = identity.getPlayer().getPuuid();
            if (participantPuuid == null || participantPuuid.isBlank()) {
                continue;
            }

            MatchHistory.Participant participant = participantByParticipantId.get(identity.getParticipantId());
            MatchHistory.Stats stats = participant == null ? null : participant.getStats();
            try {
                jdbcTemplate.update(
                        """
                                MERGE INTO player_match_index (
                                    puuid, game_id, game_creation, queue_id, champion_id, win, updated_at
                                )
                                KEY(puuid, game_id) VALUES (?, ?, ?, ?, ?, ?, ?)
                                """,
                        participantPuuid,
                        match.getGameId(),
                        match.getGameCreation(),
                        match.getQueueId(),
                        participant == null ? null : participant.getChampionId(),
                        stats == null ? null : stats.getWin(),
                        now
                );
            } catch (Exception e) {
                log.warn("Failed to save local match index row, puuid={}, gameId={}, rootCause={}",
                        puuidPrefix(participantPuuid),
                        match.getGameId(),
                        rootCauseSummary(e),
                        e);
                recoverIfCorrupt(e, "repository.savePlayerMatchIndexesForAllParticipants");
            }
        }
    }

    private void mergeFetchStateTimestamp(String puuid, String columnName, long timestamp) {
        jdbcTemplate.update(
                "MERGE INTO player_fetch_state (puuid, " + columnName + ", updated_at) KEY(puuid) VALUES (?, ?, ?)",
                puuid,
                timestamp,
                timestamp
        );
    }

    private Optional<MatchHistory.Participant> participantByPuuid(MatchHistory match, String puuid) {
        if (match.getParticipantIdentities() == null || match.getParticipants() == null) {
            return Optional.empty();
        }

        Integer participantId = null;
        for (MatchHistory.ParticipantIdentity identity : match.getParticipantIdentities()) {
            if (identity != null
                    && identity.getPlayer() != null
                    && puuid.equals(identity.getPlayer().getPuuid())) {
                participantId = identity.getParticipantId();
                break;
            }
        }

        if (participantId == null) {
            return Optional.empty();
        }

        for (MatchHistory.Participant participant : match.getParticipants()) {
            if (participant != null && participantId.equals(participant.getParticipantId())) {
                return Optional.of(participant);
            }
        }
        return Optional.empty();
    }

    private List<MatchHistory> filterRenderableCurrentPlayerMatches(String puuid, List<MatchHistory> matches) {
        if (matches == null || matches.isEmpty()) {
            return List.of();
        }
        return matches.stream()
                .filter(match -> match != null
                        && match.getGameId() != null
                        && hasRenderableCurrentParticipant(match, puuid))
                .toList();
    }

    private boolean hasRenderableCurrentParticipant(MatchHistory match, String puuid) {
        MatchHistory.Participant participant = participantByPuuid(match, puuid).orElse(null);
        if (participant == null || participant.getChampionId() == null || participant.getChampionId() <= 0) {
            return false;
        }

        MatchHistory.Stats stats = participant.getStats();
        return stats != null
                && stats.getWin() != null
                && stats.getKills() != null
                && stats.getDeaths() != null
                && stats.getAssists() != null;
    }

    private Map<Integer, MatchHistory.Player> playersByParticipantId(MatchHistory match) {
        Map<Integer, MatchHistory.Player> players = new HashMap<>();
        if (match.getParticipantIdentities() == null) {
            return players;
        }

        for (MatchHistory.ParticipantIdentity identity : match.getParticipantIdentities()) {
            if (identity != null && identity.getParticipantId() != null && identity.getPlayer() != null) {
                players.put(identity.getParticipantId(), identity.getPlayer());
            }
        }
        return players;
    }

    private Map<Integer, MatchHistory.Participant> participantsByParticipantId(MatchHistory match) {
        Map<Integer, MatchHistory.Participant> participants = new HashMap<>();
        if (match.getParticipants() == null) {
            return participants;
        }

        for (MatchHistory.Participant participant : match.getParticipants()) {
            if (participant != null && participant.getParticipantId() != null) {
                participants.put(participant.getParticipantId(), participant);
            }
        }
        return participants;
    }

    private MatchHistory restoreRosterFromLocalCache(String puuid, MatchHistory match) {
        if (match == null || match.getGameId() == null || hasRenderableRoster(match, puuid)) {
            return match;
        }

        Optional<GameDetail> detail = findGameDetail(match.getGameId());
        if (detail.isPresent()) {
            mergeGameDetailIntoMatchHistory(match, detail.get());
            if (hasRenderableRoster(match, puuid)) {
                return match;
            }
        }

        return rebuildRosterFromParticipantCache(match);
    }

    private MatchHistory rebuildRosterFromParticipantCache(MatchHistory match) {
        try {
            List<ParticipantCacheRow> rows = jdbcTemplate.query(
                    """
                            SELECT participant_id, puuid, team_id, champion_id, spell1_id, spell2_id,
                                   win, kills, deaths, assists, gold_earned,
                                   total_damage_dealt_to_champions, total_damage_taken,
                                   total_minions_killed, neutral_minions_killed,
                                   game_name, tag_line, summoner_name, raw_json
                            FROM match_participant_cache
                            WHERE game_id = ?
                            ORDER BY participant_id
                            """,
                    (rs, rowNum) -> toParticipantCacheRow(rs),
                    match.getGameId()
            );
            if (rows.isEmpty()) {
                return match;
            }

            int currentParticipantCount = match.getParticipants() == null ? 0 : match.getParticipants().size();
            int currentIdentityCount = match.getParticipantIdentities() == null ? 0 : match.getParticipantIdentities().size();
            if (rows.size() < currentParticipantCount || rows.size() < currentIdentityCount) {
                return match;
            }

            List<MatchHistory.Participant> participants = new ArrayList<>();
            List<MatchHistory.ParticipantIdentity> identities = new ArrayList<>();
            for (ParticipantCacheRow row : rows) {
                participants.add(toMatchParticipant(row));
                identities.add(toMatchParticipantIdentity(row));
            }
            match.setParticipants(participants);
            match.setParticipantIdentities(identities);
        } catch (Exception e) {
            log.debug("Failed to rebuild roster from participant cache, gameId={}, rootCause={}",
                    match.getGameId(),
                    rootCauseSummary(e),
                    e);
            recoverIfCorrupt(e, "repository.rebuildRosterFromParticipantCache");
        }
        return match;
    }

    private boolean hasRenderableRoster(MatchHistory match, String puuid) {
        return hasCompleteRoster(match) && hasCurrentParticipant(match, puuid);
    }

    private boolean hasCurrentParticipant(MatchHistory match, String puuid) {
        if (puuid == null || puuid.isBlank()) {
            return true;
        }
        return participantByPuuid(match, puuid).isPresent();
    }

    private boolean hasCompleteRoster(MatchHistory match) {
        return match != null
                && match.getParticipants() != null
                && match.getParticipants().size() >= 10
                && match.getParticipantIdentities() != null
                && match.getParticipantIdentities().size() >= 10;
    }

    private MatchHistory mergeGameDetailIntoMatchHistory(MatchHistory match, GameDetail detail) {
        if (match == null || detail == null) {
            return match;
        }
        int currentParticipantCount = match.getParticipants() == null ? 0 : match.getParticipants().size();
        int currentIdentityCount = match.getParticipantIdentities() == null ? 0 : match.getParticipantIdentities().size();
        if (detail.getParticipants() != null && detail.getParticipants().size() >= currentParticipantCount) {
            match.setParticipants(detail.getParticipants().stream()
                    .map(this::toMatchParticipant)
                    .toList());
        }
        if (detail.getParticipantIdentities() != null && detail.getParticipantIdentities().size() >= currentIdentityCount) {
            match.setParticipantIdentities(detail.getParticipantIdentities().stream()
                    .map(this::toMatchParticipantIdentity)
                    .toList());
        }
        if (match.getQueueId() == null) {
            match.setQueueId(detail.getQueueId());
        }
        if (match.getGameMode() == null) {
            match.setGameMode(detail.getGameMode());
        }
        if (match.getGameType() == null) {
            match.setGameType(detail.getGameType());
        }
        if (match.getMapId() == null) {
            match.setMapId(detail.getMapId());
        }
        if (match.getGameCreation() == null) {
            match.setGameCreation(detail.getGameCreation());
        }
        if (match.getGameDuration() == null && detail.getGameDuration() != null) {
            match.setGameDuration(detail.getGameDuration().intValue());
        }
        return match;
    }

    private MatchHistory.Participant toMatchParticipant(GameDetail.GameParticipant gameParticipant) {
        MatchHistory.Participant participant = new MatchHistory.Participant();
        participant.setParticipantId(gameParticipant.getParticipantId());
        participant.setTeamId(gameParticipant.getTeamId());
        participant.setChampionId(gameParticipant.getChampionId());
        participant.setSpell1Id(gameParticipant.getSpell1Id());
        participant.setSpell2Id(gameParticipant.getSpell2Id());
        participant.setTeamPosition(gameParticipant.getTeamPosition());
        participant.setIndividualPosition(gameParticipant.getIndividualPosition());
        participant.setSelectedPosition(gameParticipant.getSelectedPosition());
        if (gameParticipant.getTimeline() != null) {
            participant.setLane(firstText(
                    gameParticipant.getTimeline().getTeamPosition(),
                    gameParticipant.getTimeline().getLane(),
                    gameParticipant.getTimeline().getRawLane()
            ));
            participant.setRole(firstText(
                    gameParticipant.getTimeline().getRole(),
                    gameParticipant.getTimeline().getRawRole()
            ));
        }
        participant.setStats(toMatchStats(gameParticipant.getStats()));
        return participant;
    }

    private MatchHistory.Participant toMatchParticipant(ParticipantCacheRow row) {
        MatchHistory.Participant participant = readValue(row.rawJson(), MatchHistory.Participant.class, "match participant")
                .orElseGet(MatchHistory.Participant::new);
        if (participant.getParticipantId() == null) {
            participant.setParticipantId(row.participantId());
        }
        if (participant.getTeamId() == null) {
            participant.setTeamId(row.teamId());
        }
        if (participant.getChampionId() == null) {
            participant.setChampionId(row.championId());
        }
        if (participant.getSpell1Id() == null) {
            participant.setSpell1Id(row.spell1Id());
        }
        if (participant.getSpell2Id() == null) {
            participant.setSpell2Id(row.spell2Id());
        }
        if (participant.getStats() == null) {
            participant.setStats(new MatchHistory.Stats());
        }
        fillStatsFromParticipantCache(participant.getStats(), row);
        return participant;
    }

    private MatchHistory.Stats toMatchStats(GameDetail.Stats detailStats) {
        MatchHistory.Stats stats = new MatchHistory.Stats();
        if (detailStats == null) {
            return stats;
        }
        stats.setWin(detailStats.getWin());
        stats.setKills(detailStats.getKills());
        stats.setDeaths(detailStats.getDeaths());
        stats.setAssists(detailStats.getAssists());
        stats.setGoldEarned(toInteger(detailStats.getGoldEarned()));
        stats.setTotalDamageDealtToChampions(toInteger(detailStats.getTotalDamageDealtToChampions()));
        stats.setTotalDamageTaken(toInteger(detailStats.getTotalDamageTaken()));
        stats.setTotalHeal(toInteger(detailStats.getTotalHeal()));
        stats.setTotalMinionsKilled(detailStats.getTotalMinionsKilled());
        stats.setNeutralMinionsKilled(detailStats.getNeutralMinionsKilled());
        stats.setVisionScore(detailStats.getVisionScore());
        stats.setItem0(detailStats.getItem0());
        stats.setItem1(detailStats.getItem1());
        stats.setItem2(detailStats.getItem2());
        stats.setItem3(detailStats.getItem3());
        stats.setItem4(detailStats.getItem4());
        stats.setItem5(detailStats.getItem5());
        stats.setItem6(detailStats.getItem6());
        stats.setDamageDealtToChampionsRate(detailStats.getDamageDealtToChampionsRate());
        stats.setDamageTakenRate(detailStats.getDamageTakenRate());
        stats.setHealRate(detailStats.getHealRate());
        stats.setMvp(detailStats.getMvp());
        stats.setDoubleKills(detailStats.getDoubleKills());
        stats.setTripleKills(detailStats.getTripleKills());
        stats.setQuadraKills(detailStats.getQuadraKills());
        stats.setPentaKills(detailStats.getPentaKills());
        stats.setLargestKillingSpree(detailStats.getLargestKillingSpree());
        stats.setLegendaryCount(detailStats.getLegendaryCount());
        stats.setPerk0(detailStats.getPerk0());
        stats.setPerk1(detailStats.getPerk1());
        stats.setPerk2(detailStats.getPerk2());
        stats.setPerk3(detailStats.getPerk3());
        stats.setPerk4(detailStats.getPerk4());
        stats.setPerk5(detailStats.getPerk5());
        stats.setPerkPrimaryStyle(detailStats.getPerkPrimaryStyle());
        stats.setPerkSubStyle(detailStats.getPerkSubStyle());
        stats.setPerks(detailStats.getPerks());
        stats.setMinionsKilled(detailStats.getTotalMinionsKilled());
        stats.setDamageDealtToTurrets(toInteger(detailStats.getDamageDealtToTurrets()));
        stats.setPlayerAugment1(detailStats.getPlayerAugment1());
        stats.setPlayerAugment2(detailStats.getPlayerAugment2());
        stats.setPlayerAugment3(detailStats.getPlayerAugment3());
        stats.setPlayerAugment4(detailStats.getPlayerAugment4());
        stats.setChallenges(detailStats.getChallenges());
        stats.setExtraFields(detailStats.getExtraFields());
        return stats;
    }

    private void fillStatsFromParticipantCache(MatchHistory.Stats stats, ParticipantCacheRow row) {
        if (stats.getWin() == null) {
            stats.setWin(row.win());
        }
        if (stats.getKills() == null) {
            stats.setKills(row.kills());
        }
        if (stats.getDeaths() == null) {
            stats.setDeaths(row.deaths());
        }
        if (stats.getAssists() == null) {
            stats.setAssists(row.assists());
        }
        if (stats.getGoldEarned() == null) {
            stats.setGoldEarned(row.goldEarned());
        }
        if (stats.getTotalDamageDealtToChampions() == null) {
            stats.setTotalDamageDealtToChampions(row.totalDamageDealtToChampions());
        }
        if (stats.getTotalDamageTaken() == null) {
            stats.setTotalDamageTaken(row.totalDamageTaken());
        }
        if (stats.getTotalMinionsKilled() == null) {
            stats.setTotalMinionsKilled(row.totalMinionsKilled());
        }
        if (stats.getNeutralMinionsKilled() == null) {
            stats.setNeutralMinionsKilled(row.neutralMinionsKilled());
        }
    }

    private MatchHistory.ParticipantIdentity toMatchParticipantIdentity(GameDetail.ParticipantIdentity identity) {
        MatchHistory.ParticipantIdentity participantIdentity = new MatchHistory.ParticipantIdentity();
        participantIdentity.setParticipantId(identity.getParticipantId());

        MatchHistory.Player player = new MatchHistory.Player();
        if (identity.getPlayer() != null) {
            player.setPuuid(identity.getPlayer().getPuuid());
            player.setGameName(identity.getPlayer().getGameName());
            player.setTagLine(identity.getPlayer().getTagLine());
            player.setSummonerName(identity.getPlayer().getSummonerName());
            player.setAccountId(identity.getPlayer().getAccountId());
            player.setSummonerId(identity.getPlayer().getSummonerId());
            player.setPlatformId(identity.getPlayer().getPlatformId());
        }
        participantIdentity.setPlayer(player);
        return participantIdentity;
    }

    private MatchHistory.ParticipantIdentity toMatchParticipantIdentity(ParticipantCacheRow row) {
        MatchHistory.ParticipantIdentity identity = new MatchHistory.ParticipantIdentity();
        identity.setParticipantId(row.participantId());

        MatchHistory.Player player = new MatchHistory.Player();
        player.setPuuid(row.puuid());
        player.setGameName(row.gameName());
        player.setTagLine(row.tagLine());
        player.setSummonerName(row.summonerName());
        identity.setPlayer(player);
        return identity;
    }

    private ParticipantCacheRow toParticipantCacheRow(ResultSet rs) throws SQLException {
        return new ParticipantCacheRow(
                getInteger(rs, "participant_id"),
                rs.getString("puuid"),
                getInteger(rs, "team_id"),
                getInteger(rs, "champion_id"),
                getInteger(rs, "spell1_id"),
                getInteger(rs, "spell2_id"),
                getBoolean(rs, "win"),
                getInteger(rs, "kills"),
                getInteger(rs, "deaths"),
                getInteger(rs, "assists"),
                getInteger(rs, "gold_earned"),
                getInteger(rs, "total_damage_dealt_to_champions"),
                getInteger(rs, "total_damage_taken"),
                getInteger(rs, "total_minions_killed"),
                getInteger(rs, "neutral_minions_killed"),
                rs.getString("game_name"),
                rs.getString("tag_line"),
                rs.getString("summoner_name"),
                rs.getString("raw_json")
        );
    }

    private Integer getInteger(ResultSet rs, String columnName) throws SQLException {
        int value = rs.getInt(columnName);
        return rs.wasNull() ? null : value;
    }

    private Boolean getBoolean(ResultSet rs, String columnName) throws SQLException {
        boolean value = rs.getBoolean(columnName);
        return rs.wasNull() ? null : value;
    }

    private Integer toInteger(Long value) {
        return value == null ? null : value.intValue();
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

    private MatchDataScopeCache toMatchDataScopeCache(ResultSet rs) throws SQLException {
        MatchDataScopeCache cache = new MatchDataScopeCache();
        cache.setGameId(rs.getLong("game_id"));
        cache.setSource(rs.getString("source"));
        cache.setRawSummaryJson(rs.getString("summary_raw_json"));
        cache.setRawDetailJson(rs.getString("detail_raw_json"));
        cache.setRawTimelineJson(rs.getString("timeline_raw_json"));
        cache.setTimeline(readValue(rs.getString("timeline_json"), MatchTimeline.class, "match timeline").orElse(null));
        cache.setSummaryStatus(rs.getString("summary_status"));
        cache.setDetailStatus(rs.getString("detail_status"));
        cache.setTimelineStatus(rs.getString("timeline_status"));
        cache.setFetchedAt(getLong(rs, "fetched_at"));
        cache.setSchemaVersion(getInteger(rs, "schema_version"));
        cache.setLastError(rs.getString("last_error"));
        cache.setUpdatedAt(getLong(rs, "updated_at"));
        return cache;
    }

    private Long getLong(ResultSet rs, String columnName) throws SQLException {
        long value = rs.getLong(columnName);
        return rs.wasNull() ? null : value;
    }

    private String normalizeStatus(String status) {
        return status == null || status.isBlank() ? "UNKNOWN" : status.trim();
    }

    private MatchHistory latestMatch(List<MatchHistory> matches) {
        if (matches == null || matches.isEmpty()) {
            return null;
        }
        return matches.stream()
                .filter(match -> match != null && match.getGameId() != null)
                .max(Comparator.comparingLong(match -> match.getGameCreation() == null ? Long.MIN_VALUE : match.getGameCreation()))
                .orElse(null);
    }

    private <T> Optional<T> readValue(String rawJson, Class<T> type, String description) {
        if (rawJson == null || rawJson.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(objectMapper.readValue(rawJson, type));
        } catch (Exception e) {
            log.debug("Skipping corrupt {} cache row", description, e);
            return Optional.empty();
        }
    }

    private String writeValue(Object value) throws JsonProcessingException {
        return objectMapper.writeValueAsString(value);
    }

    private Optional<MatchHistoryFetchResult> findEmptyFetchState(String puuid) {
        try {
            List<String> statuses = jdbcTemplate.query(
                    "SELECT status FROM player_fetch_state WHERE puuid = ? AND match_updated_at IS NOT NULL LIMIT 1",
                    (rs, rowNum) -> rs.getString("status"),
                    puuid
            );
            if (statuses.isEmpty()) {
                return Optional.empty();
            }
            if (!"OK".equalsIgnoreCase(statuses.getFirst())) {
                return Optional.empty();
            }
            return Optional.of(MatchHistoryFetchResult.builder()
                    .matches(List.of())
                    .rawEmpty(true)
                    .build());
        } catch (Exception e) {
            log.debug("Failed to read empty match-history cache state, puuid={}, rootCause={}",
                    puuidPrefix(puuid),
                    rootCauseSummary(e),
                    e);
            recoverIfCorrupt(e, "repository.findEmptyFetchState");
            return Optional.empty();
        }
    }

    private String puuidPrefix(String puuid) {
        if (puuid == null || puuid.isBlank()) {
            return "null";
        }
        return puuid.substring(0, Math.min(8, puuid.length()));
    }

    private void runRetention() {
        if (retentionService == null) {
            return;
        }
        LocalCacheRetentionService.RetentionResult result = retentionService.runRetention();
        if (result.deletedRows() > 0) {
            log.info("Applied local H2 cache retention after match history save: deletedRows={}",
                    result.deletedRows());
        }
    }

    private void recoverIfCorrupt(Exception error, String trigger) {
        if (recoveryCoordinator == null) {
            return;
        }
        recoveryCoordinator.recoverIfCorrupt(error, trigger);
    }

    private String rootCauseSummary(Exception error) {
        if (recoveryCoordinator != null) {
            String summary = recoveryCoordinator.rootCauseSummary(error);
            if (summary != null && !summary.isBlank()) {
                return summary;
            }
        }

        Throwable current = error;
        while (current.getCause() != null) {
            current = current.getCause();
        }
        String message = current.getMessage();
        if (message == null || message.isBlank()) {
            message = error.getMessage();
        }
        if (message == null || message.isBlank()) {
            message = current.getClass().getSimpleName();
        }
        return current.getClass().getSimpleName() + ": " + message;
    }

    private record CachedMatchRow(Long gameId, String rawJson) {
    }

    private record ParticipantCacheRow(
            Integer participantId,
            String puuid,
            Integer teamId,
            Integer championId,
            Integer spell1Id,
            Integer spell2Id,
            Boolean win,
            Integer kills,
            Integer deaths,
            Integer assists,
            Integer goldEarned,
            Integer totalDamageDealtToChampions,
            Integer totalDamageTaken,
            Integer totalMinionsKilled,
            Integer neutralMinionsKilled,
            String gameName,
            String tagLine,
            String summonerName,
            String rawJson) {
    }
}
