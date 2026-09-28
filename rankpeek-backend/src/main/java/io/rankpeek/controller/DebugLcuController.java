package io.rankpeek.controller;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;
import io.rankpeek.exception.LcuException;
import io.rankpeek.model.Summoner;
import io.rankpeek.service.LcuHttpClient;
import io.rankpeek.service.SummonerService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@RestController
@RequestMapping("/api/v1/debug/lcu")
@RequiredArgsConstructor
public class DebugLcuController {

    private static final int DEFAULT_PAGE_SIZE = 20;
    private static final int DEFAULT_MAX_BEG_INDEX = 100;
    private static final int SHORT_GAME_DURATION_SECONDS = 300;
    private static final List<RangeRequest> SINGLE_RANGE_REQUESTS = List.of(
            new RangeRequest(0, 19),
            new RangeRequest(0, 49),
            new RangeRequest(20, 39),
            new RangeRequest(40, 59),
            new RangeRequest(60, 79),
            new RangeRequest(80, 99),
            new RangeRequest(0, 99),
            new RangeRequest(100, 119)
    );

    private final LcuHttpClient lcuHttpClient;
    private final SummonerService summonerService;

    @GetMapping("/match-history-limit")
    public LcuMatchHistoryLimitDebugResponse matchHistoryLimit(
            @RequestParam(required = false) String puuid,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(defaultValue = "100") int maxBegIndex) {
        String targetPuuid = resolvePuuid(puuid);
        int normalizedPageSize = pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE;
        int normalizedMaxBegIndex = maxBegIndex >= 0 ? maxBegIndex : DEFAULT_MAX_BEG_INDEX;

        List<RangeResult> singleRangeResults = SINGLE_RANGE_REQUESTS.stream()
                .map(range -> fetchRange(targetPuuid, range.begIndex(), range.endIndex()))
                .toList();
        PagedScanResult pagedScan = scanPagedRanges(targetPuuid, normalizedPageSize, normalizedMaxBegIndex);

        return new LcuMatchHistoryLimitDebugResponse(
                targetPuuid,
                singleRangeResults,
                pagedScan,
                buildConclusion(singleRangeResults, pagedScan, normalizedPageSize)
        );
    }

    private String resolvePuuid(String puuid) {
        if (puuid != null && !puuid.isBlank()) {
            return puuid.trim();
        }
        Summoner summoner = summonerService.getMySummoner();
        if (summoner == null || summoner.getPuuid() == null || summoner.getPuuid().isBlank()) {
            throw new LcuException("Unable to resolve current summoner puuid for LCU match history debug scan");
        }
        return summoner.getPuuid();
    }

    private PagedScanResult scanPagedRanges(String puuid, int pageSize, int maxBegIndex) {
        List<PagedRangeResult> ranges = new ArrayList<>();
        Map<Long, GameSummary> distinctGames = new LinkedHashMap<>();
        Map<String, Long> rawQueueCount = new LinkedHashMap<>();
        int totalRawRows = 0;
        int nonNullGameIdRows = 0;
        Integer firstEmptyBegIndex = null;

        for (int begIndex = 0; begIndex <= maxBegIndex; begIndex += pageSize) {
            int endIndex = begIndex + pageSize - 1;
            RangeResult range = fetchRange(puuid, begIndex, endIndex);
            ranges.add(new PagedRangeResult(
                    range.begIndex(),
                    range.endIndex(),
                    range.requestedCount(),
                    range.success(),
                    range.error(),
                    range.rawCount(),
                    range.distinctGameIds(),
                    range.queueCount(),
                    range.shortGameCount()
            ));

            if (range.success() && range.rawCount() == 0 && firstEmptyBegIndex == null) {
                firstEmptyBegIndex = begIndex;
            }

            totalRawRows += range.rawCount();
            mergeQueueCounts(rawQueueCount, range.queueCount());
            for (GameSummary game : range.games()) {
                if (game.gameId() == null) {
                    continue;
                }
                nonNullGameIdRows += 1;
                distinctGames.putIfAbsent(game.gameId(), game);
            }
        }

        int shortGameCount = (int) distinctGames.values().stream()
                .filter(GameSummary::isShortGame)
                .count();
        int validAfterDurationFilter = distinctGames.size() - shortGameCount;
        int duplicateGameIds = Math.max(0, nonNullGameIdRows - distinctGames.size());
        Map<String, Long> queueCount = countQueues(new ArrayList<>(distinctGames.values()));

        return new PagedScanResult(
                pageSize,
                ranges,
                totalRawRows,
                distinctGames.size(),
                validAfterDurationFilter,
                shortGameCount,
                duplicateGameIds,
                firstEmptyBegIndex,
                queueCount,
                rawQueueCount
        );
    }

    private RangeResult fetchRange(String puuid, int begIndex, int endIndex) {
        String uri = String.format(
                "lol-match-history/v1/products/lol/%s/matches?begIndex=%d&endIndex=%d",
                puuid,
                begIndex,
                endIndex
        );

        try {
            JsonNode response = lcuHttpClient.get(uri, JsonNode.class);
            List<GameSummary> games = readGames(response);
            RangeResult result = buildRangeResult(begIndex, endIndex, true, null, games);
            log.info(
                    "LCU match history scan: puuid={}, range={}-{}, rawCount={}",
                    puuid,
                    begIndex,
                    endIndex,
                    result.rawCount()
            );
            return result;
        } catch (Exception e) {
            String error = e.getMessage();
            log.warn(
                    "LCU match history scan failed: puuid={}, range={}-{}, error={}",
                    puuid,
                    begIndex,
                    endIndex,
                    error
            );
            return buildRangeResult(begIndex, endIndex, false, error, List.of());
        }
    }

    private RangeResult buildRangeResult(
            int begIndex,
            int endIndex,
            boolean success,
            String error,
            List<GameSummary> games) {
        Map<Long, Boolean> distinctGameIds = new LinkedHashMap<>();
        for (GameSummary game : games) {
            if (game.gameId() != null) {
                distinctGameIds.putIfAbsent(game.gameId(), Boolean.TRUE);
            }
        }

        return new RangeResult(
                begIndex,
                endIndex,
                endIndex - begIndex + 1,
                success,
                error,
                games.size(),
                distinctGameIds.size(),
                games.isEmpty() ? null : games.getFirst().gameId(),
                games.isEmpty() ? null : games.getLast().gameId(),
                countQueues(games),
                (int) games.stream().filter(GameSummary::isShortGame).count(),
                games
        );
    }

    private List<GameSummary> readGames(JsonNode response) {
        JsonNode gamesNode = extractGamesNode(response);
        if (gamesNode == null || !gamesNode.isArray()) {
            return List.of();
        }

        List<GameSummary> games = new ArrayList<>();
        for (JsonNode game : gamesNode) {
            Integer gameDuration = readInteger(game, "gameDuration");
            games.add(new GameSummary(
                    readLong(game, "gameId"),
                    readInteger(game, "queueId"),
                    readLong(game, "gameCreation"),
                    gameDuration,
                    gameDuration != null && gameDuration < SHORT_GAME_DURATION_SECONDS
            ));
        }
        return games;
    }

    private JsonNode extractGamesNode(JsonNode response) {
        if (response == null) {
            return null;
        }
        JsonNode gamesWrapper = response.get("games");
        if (gamesWrapper == null) {
            return null;
        }
        if (gamesWrapper.isArray()) {
            return gamesWrapper;
        }
        return gamesWrapper.get("games");
    }

    private Integer readInteger(JsonNode node, String fieldName) {
        JsonNode value = node == null ? null : node.get(fieldName);
        if (value == null || value.isNull()) {
            return null;
        }
        if (value.isNumber()) {
            return value.asInt();
        }
        if (value.isTextual()) {
            try {
                return Integer.parseInt(value.asText());
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private Long readLong(JsonNode node, String fieldName) {
        JsonNode value = node == null ? null : node.get(fieldName);
        if (value == null || value.isNull()) {
            return null;
        }
        if (value.isNumber()) {
            return value.asLong();
        }
        if (value.isTextual()) {
            try {
                return Long.parseLong(value.asText());
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private Map<String, Long> countQueues(List<GameSummary> games) {
        Map<String, Long> queueCount = new LinkedHashMap<>();
        for (GameSummary game : games) {
            String key = game.queueId() == null ? "unknown" : String.valueOf(game.queueId());
            queueCount.merge(key, 1L, Long::sum);
        }
        return queueCount;
    }

    private void mergeQueueCounts(Map<String, Long> target, Map<String, Long> source) {
        for (Map.Entry<String, Long> entry : source.entrySet()) {
            target.merge(entry.getKey(), entry.getValue(), Long::sum);
        }
    }

    private Conclusion buildConclusion(
            List<RangeResult> singleRangeResults,
            PagedScanResult pagedScan,
            int pageSize) {
        RangeResult zeroToNineteen = findSingleRange(singleRangeResults, 0, 19);
        RangeResult zeroToFortyNine = findSingleRange(singleRangeResults, 0, 49);

        Integer singleRequestAppearsCappedAt = null;
        if (zeroToNineteen != null
                && zeroToFortyNine != null
                && zeroToFortyNine.success()
                && zeroToFortyNine.rawCount() > 0
                && zeroToFortyNine.rawCount() < zeroToFortyNine.requestedCount()
                && zeroToFortyNine.rawCount() == zeroToNineteen.rawCount()) {
            singleRequestAppearsCappedAt = zeroToFortyNine.rawCount();
        }

        boolean canPageBeyond20 = canPageBeyondFirstPage(zeroToNineteen, singleRangeResults, pagedScan);

        return new Conclusion(
                singleRequestAppearsCappedAt,
                canPageBeyond20,
                singleRequestAppearsCappedAt != null ? singleRequestAppearsCappedAt : pageSize
        );
    }

    private boolean canPageBeyondFirstPage(
            RangeResult firstPage,
            List<RangeResult> singleRangeResults,
            PagedScanResult pagedScan) {
        Set<Long> firstPageGameIds = gameIds(firstPage);
        if (firstPageGameIds.isEmpty()) {
            return singleRangeResults.stream()
                    .filter(range -> range.begIndex() >= DEFAULT_PAGE_SIZE)
                    .anyMatch(range -> range.rawCount() > 0);
        }

        boolean singleRangesContainNewIds = singleRangeResults.stream()
                .filter(range -> range.begIndex() >= DEFAULT_PAGE_SIZE)
                .flatMap(range -> range.games().stream())
                .map(GameSummary::gameId)
                .anyMatch(gameId -> gameId != null && !firstPageGameIds.contains(gameId));

        return singleRangesContainNewIds || pagedScan.totalDistinctGameIds() > firstPageGameIds.size();
    }

    private Set<Long> gameIds(RangeResult range) {
        Set<Long> ids = new LinkedHashSet<>();
        if (range == null) {
            return ids;
        }
        for (GameSummary game : range.games()) {
            if (game.gameId() != null) {
                ids.add(game.gameId());
            }
        }
        return ids;
    }

    private RangeResult findSingleRange(List<RangeResult> ranges, int begIndex, int endIndex) {
        return ranges.stream()
                .filter(range -> range.begIndex() == begIndex && range.endIndex() == endIndex)
                .findFirst()
                .orElse(null);
    }

    private record RangeRequest(int begIndex, int endIndex) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record LcuMatchHistoryLimitDebugResponse(
            String puuid,
            List<RangeResult> singleRangeResults,
            PagedScanResult pagedScan,
            Conclusion conclusion) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record RangeResult(
            int begIndex,
            int endIndex,
            int requestedCount,
            boolean success,
            String error,
            int rawCount,
            int distinctGameIds,
            Long firstGameId,
            Long lastGameId,
            Map<String, Long> queueCount,
            int shortGameCount,
            List<GameSummary> games) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record PagedScanResult(
            int pageSize,
            List<PagedRangeResult> ranges,
            int totalRawRows,
            int totalDistinctGameIds,
            int validAfterDurationFilter,
            int shortGameCount,
            int duplicateGameIds,
            Integer firstEmptyBegIndex,
            Map<String, Long> queueCount,
            Map<String, Long> rawQueueCount) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record PagedRangeResult(
            int begIndex,
            int endIndex,
            int requestedCount,
            boolean success,
            String error,
            int rawCount,
            int distinctGameIds,
            Map<String, Long> queueCount,
            int shortGameCount) {
    }

    public record GameSummary(
            Long gameId,
            Integer queueId,
            Long gameCreation,
            Integer gameDuration,
            boolean isShortGame) {
    }

    public record Conclusion(
            Integer singleRequestAppearsCappedAt,
            boolean canPageBeyond20,
            int recommendedLcuPageSize) {
    }
}
