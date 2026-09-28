package io.rankpeek.service;

import io.rankpeek.cache.MatchHistoryCacheRepository;
import io.rankpeek.model.MatchDataScopeCache;
import io.rankpeek.model.MatchHistory;
import io.rankpeek.model.MatchHistoryFetchResult;
import io.rankpeek.model.MatchHistoryPageResponse;
import io.rankpeek.model.MatchTimeline;
import io.rankpeek.model.MatchTimelineFetchResult;
import io.rankpeek.model.Rank;
import io.rankpeek.model.RecordStatus;
import io.rankpeek.service.matchhistory.MatchHistoryProvider;
import io.rankpeek.service.matchhistory.MatchHistoryQueryOptions;
import io.rankpeek.service.matchhistory.MatchHistorySource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.ArrayList;
import java.util.concurrent.AbstractExecutorService;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.after;

@ExtendWith(MockitoExtension.class)
class MatchHistoryServiceTest {

    @Mock
    private MatchHistoryProvider matchHistoryProvider;
    @Mock
    private MatchHistoryProvider sgpMatchHistoryProvider;
    @Mock
    private MatchHistoryCacheRepository cacheRepository;

    private MatchHistoryService matchHistoryService;

    @BeforeEach
    void setUp() {
        matchHistoryService = new MatchHistoryService(matchHistoryProvider);
        matchHistoryService.init();
    }

    @Test
    void getMatchHistoryFetchResult_usesProviderAndCachesOnRepeatedReads() {
        when(matchHistoryProvider.fetchMatchHistory(any(String.class), any(MatchHistoryQueryOptions.class)))
                .thenReturn(resultWithSequentialMatches(1L, 50));

        MatchHistoryFetchResult first = matchHistoryService.getMatchHistoryFetchResult("puuid-1");
        MatchHistoryFetchResult second = matchHistoryService.getMatchHistoryFetchResult("puuid-1");

        assertThat(first.getMatches()).hasSize(50);
        assertThat(second.getMatches()).hasSize(50);
        verify(matchHistoryProvider, times(1))
                .fetchMatchHistory("puuid-1", options(MatchHistorySource.AUTO, false));
    }

    @Test
    void getMatchHistoryFetchResult_forceRefreshInvalidatesCachedEntryAndPassesRefreshOption() {
        when(matchHistoryProvider.fetchMatchHistory(any(String.class), any(MatchHistoryQueryOptions.class)))
                .thenReturn(resultWithSequentialMatches(1L, 50), resultWithSequentialMatches(1001L, 50));

        MatchHistoryFetchResult cached = matchHistoryService.getMatchHistoryFetchResult("puuid-1");
        MatchHistoryFetchResult stillCached = matchHistoryService.getMatchHistoryFetchResult("puuid-1");
        MatchHistoryFetchResult refreshed = matchHistoryService.getMatchHistoryFetchResult("puuid-1", true);

        assertThat(cached.getMatches()).first().extracting(MatchHistory::getGameId).isEqualTo(1L);
        assertThat(stillCached.getMatches()).first().extracting(MatchHistory::getGameId).isEqualTo(1L);
        assertThat(refreshed.getMatches()).first().extracting(MatchHistory::getGameId).isEqualTo(1001L);
        verify(matchHistoryProvider).fetchMatchHistory("puuid-1", options(MatchHistorySource.AUTO, false));
        verify(matchHistoryProvider).fetchMatchHistory("puuid-1", options(MatchHistorySource.AUTO, true));
    }

    @Test
    void getMatchHistoryFetchResult_sourceLcuUsesLcuProvider() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        when(matchHistoryProvider.fetchMatchHistory("puuid-1", options(MatchHistorySource.LCU, false)))
                .thenReturn(resultWithMatch(1L));

        MatchHistoryFetchResult result = sourceAwareService.getMatchHistoryFetchResult(
                "puuid-1",
                false,
                MatchHistorySource.LCU
        );

        assertThat(result.getMatches()).extracting(MatchHistory::getGameId).containsExactly(1L);
        verify(matchHistoryProvider).fetchMatchHistory("puuid-1", options(MatchHistorySource.LCU, false));
        verify(sgpMatchHistoryProvider, never())
                .fetchMatchHistory(any(String.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getMatchHistoryFetchResult_sourceSgpUsesSgpProvider() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", options(MatchHistorySource.SGP, false)))
                .thenReturn(resultWithMatch(2L));

        MatchHistoryFetchResult result = sourceAwareService.getMatchHistoryFetchResult(
                "puuid-1",
                false,
                MatchHistorySource.SGP
        );

        assertThat(result.getMatches()).extracting(MatchHistory::getGameId).containsExactly(2L);
        verify(sgpMatchHistoryProvider).fetchMatchHistory("puuid-1", options(MatchHistorySource.SGP, false));
        verify(matchHistoryProvider, never()).fetchMatchHistory(any(String.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getMatchHistoryFetchResult_sourceAutoUsesSgpWhenReady() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        when(sgpMatchHistoryProvider.supports(options(MatchHistorySource.AUTO, false))).thenReturn(true);
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", options(MatchHistorySource.AUTO, false)))
                .thenReturn(resultWithMatch(3L));

        MatchHistoryFetchResult result = sourceAwareService.getMatchHistoryFetchResult(
                "puuid-1",
                false,
                MatchHistorySource.AUTO
        );

        assertThat(result.getMatches()).extracting(MatchHistory::getGameId).containsExactly(3L);
        verify(sgpMatchHistoryProvider).fetchMatchHistory("puuid-1", options(MatchHistorySource.AUTO, false));
        verify(matchHistoryProvider, never()).fetchMatchHistory(any(String.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getMatchHistoryFetchResult_defaultSourcePrefersSgpWhenReady() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        when(sgpMatchHistoryProvider.supports(options(MatchHistorySource.AUTO, false))).thenReturn(true);
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", options(MatchHistorySource.AUTO, false)))
                .thenReturn(resultWithMatch(33L));

        MatchHistoryFetchResult result = sourceAwareService.getMatchHistoryFetchResult("puuid-1");

        assertThat(result.getMatches()).extracting(MatchHistory::getGameId).containsExactly(33L);
        verify(sgpMatchHistoryProvider).fetchMatchHistory("puuid-1", options(MatchHistorySource.AUTO, false));
        verify(matchHistoryProvider, never()).fetchMatchHistory(any(String.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getMatchHistoryFetchResult_sourceAutoStillUsesSgpWhenSupportCheckIsUnavailable() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        when(sgpMatchHistoryProvider.supports(options(MatchHistorySource.AUTO, false))).thenReturn(false);
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", options(MatchHistorySource.AUTO, false)))
                .thenReturn(resultWithMatch(4L));

        MatchHistoryFetchResult result = sourceAwareService.getMatchHistoryFetchResult(
                "puuid-1",
                false,
                MatchHistorySource.AUTO
        );

        assertThat(result.getMatches()).extracting(MatchHistory::getGameId).containsExactly(4L);
        verify(sgpMatchHistoryProvider).fetchMatchHistory("puuid-1", options(MatchHistorySource.AUTO, false));
        verify(matchHistoryProvider, never()).fetchMatchHistory(any(String.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getMatchHistoryFetchResult_cacheSeparatesLcuAndSgpSources() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        when(matchHistoryProvider.fetchMatchHistory("puuid-1", options(MatchHistorySource.LCU, false)))
                .thenReturn(resultWithMatch(5L));
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", options(MatchHistorySource.SGP, false)))
                .thenReturn(resultWithMatch(6L));

        MatchHistoryFetchResult lcu = sourceAwareService.getMatchHistoryFetchResult(
                "puuid-1",
                false,
                MatchHistorySource.LCU
        );
        MatchHistoryFetchResult sgp = sourceAwareService.getMatchHistoryFetchResult(
                "puuid-1",
                false,
                MatchHistorySource.SGP
        );

        assertThat(lcu.getMatches()).extracting(MatchHistory::getGameId).containsExactly(5L);
        assertThat(sgp.getMatches()).extracting(MatchHistory::getGameId).containsExactly(6L);
        verify(matchHistoryProvider).fetchMatchHistory("puuid-1", options(MatchHistorySource.LCU, false));
        verify(sgpMatchHistoryProvider).fetchMatchHistory("puuid-1", options(MatchHistorySource.SGP, false));
    }

    @Test
    void getMatchHistoryWithFetchLimit_prefersSgpAutoSource() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        when(sgpMatchHistoryProvider.supports(limitOptions(MatchHistorySource.AUTO, 50))).thenReturn(true);
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", limitOptions(MatchHistorySource.AUTO, 50)))
                .thenReturn(resultWithMatches(
                        match(7L, 420, "puuid-1", 11),
                        match(8L, 420, "puuid-1", 12)
                ));

        List<MatchHistory> matches = sourceAwareService.getMatchHistory("puuid-1", 0, 49, 50);

        assertThat(matches).extracting(MatchHistory::getGameId).containsExactly(7L, 8L);
        verify(sgpMatchHistoryProvider).fetchMatchHistory("puuid-1", limitOptions(MatchHistorySource.AUTO, 50));
        verify(matchHistoryProvider, never()).fetchMatchHistory(any(String.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getMatchHistoryWithFetchLimitRetriesSgpAndDoesNotFallbackToLcuWhenSgpFetchFails() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        when(sgpMatchHistoryProvider.supports(limitOptions(MatchHistorySource.AUTO, 50))).thenReturn(true);
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", limitOptions(MatchHistorySource.AUTO, 50)))
                .thenThrow(new RuntimeException("sgp down"));

        assertThatThrownBy(() -> sourceAwareService.getMatchHistory("puuid-1", 0, 49, 50))
                .hasMessageContaining("sgp down");

        verify(sgpMatchHistoryProvider, times(3))
                .fetchMatchHistory("puuid-1", limitOptions(MatchHistorySource.AUTO, 50));
        verify(matchHistoryProvider, never()).fetchMatchHistory(any(String.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void shutdownAsyncExecutors_shutsDownCacheWriteAndSgpBackfillExecutors() {
        ExecutorService cacheWriteExecutor = Executors.newSingleThreadExecutor();
        ExecutorService sgpBackfillExecutor = Executors.newSingleThreadExecutor();
        MatchHistoryService service = new MatchHistoryService(
                List.of(matchHistoryProvider),
                cacheRepository,
                cacheWriteExecutor,
                sgpBackfillExecutor
        );

        service.shutdownAsyncExecutors();

        assertThat(cacheWriteExecutor.isShutdown()).isTrue();
        assertThat(sgpBackfillExecutor.isShutdown()).isTrue();
    }

    @Test
    void getMatchHistory_sourceSgpDoesNotFetchRemoteDetailWhenSummaryCannotRenderCurrentParticipant() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", options(MatchHistorySource.SGP, false)))
                .thenReturn(resultWithMatches(nonRenderableCurrentOnlyMatch(77L, 420)));

        List<MatchHistory> result = sourceAwareService.getMatchHistory(
                "puuid-1",
                0,
                0,
                false,
                MatchHistorySource.SGP
        );

        assertThat(result).extracting(MatchHistory::getGameId).containsExactly(77L);
        verify(sgpMatchHistoryProvider).fetchMatchHistory("puuid-1", options(MatchHistorySource.SGP, false));
        verify(sgpMatchHistoryProvider, never())
                .fetchGameDetail(any(Long.class), any(MatchHistoryQueryOptions.class));
        verify(sgpMatchHistoryProvider, after(300).never())
                .fetchGameTimeline(any(Long.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getGameDetailById_sourceSgpUsesSgpProvider() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        var detail = renderableGameDetail(99L);
        when(sgpMatchHistoryProvider.fetchGameDetail(99L, options(MatchHistorySource.SGP, false)))
                .thenReturn(detail);

        assertThat(sourceAwareService.getGameDetailById(99L, MatchHistorySource.SGP)).isSameAs(detail);
        verify(sgpMatchHistoryProvider).fetchGameDetail(99L, options(MatchHistorySource.SGP, false));
        verify(matchHistoryProvider, never()).fetchGameDetail(any(Long.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getGameDetailById_stringSourceSgpStillFetchesProviderDetail() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        var detail = renderableGameDetail(120L);
        when(sgpMatchHistoryProvider.fetchGameDetail(120L, options(MatchHistorySource.SGP, false)))
                .thenReturn(detail);

        assertThat(sourceAwareService.getGameDetailById(120L, "sgp")).isSameAs(detail);
        verify(sgpMatchHistoryProvider).fetchGameDetail(120L, options(MatchHistorySource.SGP, false));
        verify(matchHistoryProvider, never()).fetchGameDetail(any(Long.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getGameDetailById_assignsRankedSummonersRiftPositionsByTeamOrder() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        var detail = rankedSummonersRiftDetailWithMisleadingTopMidStats(121L);
        when(matchHistoryProvider.fetchGameDetail(121L, options(MatchHistorySource.LCU, false)))
                .thenReturn(detail);

        var result = sourceAwareService.getGameDetailById(121L, MatchHistorySource.LCU);

        assertThat(orderedTeamPositions(result, 100))
                .containsExactly("TOP", "JUNGLE", "MIDDLE", "BOTTOM", "SUPPORT");
        assertThat(orderedTimelinePositions(result, 100))
                .containsExactly("TOP", "JUNGLE", "MIDDLE", "BOTTOM", "SUPPORT");
        assertThat(orderedTeamPositions(result, 200))
                .containsExactly("TOP", "JUNGLE", "MIDDLE", "BOTTOM", "SUPPORT");
        assertThat(orderedTimelinePositions(result, 200))
                .containsExactly("TOP", "JUNGLE", "MIDDLE", "BOTTOM", "SUPPORT");
    }

    @Test
    void getGameTimelineById_sourceSgpReturnsFetchedTimeline() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        MatchTimeline timeline = new MatchTimeline();
        timeline.setGameId(130L);
        MatchTimelineFetchResult fetched = MatchTimelineFetchResult.builder()
                .gameId(130L)
                .timeline(timeline)
                .status("FETCHED")
                .build();
        when(sgpMatchHistoryProvider.fetchGameTimeline(130L, options(MatchHistorySource.SGP, false)))
                .thenReturn(fetched);

        MatchTimelineFetchResult result = sourceAwareService.getGameTimelineById(130L, MatchHistorySource.SGP);

        assertThat(result).isSameAs(fetched);
        assertThat(result.getStatus()).isEqualTo("FETCHED");
        verify(sgpMatchHistoryProvider).fetchGameTimeline(130L, options(MatchHistorySource.SGP, false));
        verify(sgpMatchHistoryProvider, never()).fetchGameDetail(any(Long.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getGameTimelineById_sourceSgpUsesRequestedServerId() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        MatchTimelineFetchResult fetched = timelineResult(133L);
        when(sgpMatchHistoryProvider.fetchGameTimeline(133L, options(MatchHistorySource.SGP, false, "HN1")))
                .thenReturn(fetched);

        MatchTimelineFetchResult result = sourceAwareService.getGameTimelineById(133L, "sgp", "HN1");

        assertThat(result).isSameAs(fetched);
        verify(sgpMatchHistoryProvider).fetchGameTimeline(133L, options(MatchHistorySource.SGP, false, "HN1"));
        verify(sgpMatchHistoryProvider, never()).fetchGameTimeline(133L, options(MatchHistorySource.SGP, false));
    }

    @Test
    void getGameTimelineById_sourceSgpWithRequestedServerIdIgnoresFailedCachedTimeline() {
        MatchHistoryService sourceAwareService = sourceAwareServiceWithCacheRepository();
        MatchDataScopeCache cachedFailure = new MatchDataScopeCache();
        cachedFailure.setGameId(134L);
        cachedFailure.setTimelineStatus("FAILED");
        cachedFailure.setLastError("coarse CN region cannot resolve server id");
        when(cacheRepository.findMatchDataScope(134L)).thenReturn(Optional.of(cachedFailure));
        MatchTimelineFetchResult fetched = timelineResult(134L);
        when(sgpMatchHistoryProvider.fetchGameTimeline(134L, options(MatchHistorySource.SGP, false, "HN1")))
                .thenReturn(fetched);

        MatchTimelineFetchResult result = sourceAwareService.getGameTimelineById(134L, "sgp", "HN1");

        assertThat(result).isSameAs(fetched);
        verify(sgpMatchHistoryProvider).fetchGameTimeline(134L, options(MatchHistorySource.SGP, false, "HN1"));
    }

    @Test
    void getGameTimelineById_sourceSgpReturnsEmptyTimeline() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        MatchTimelineFetchResult empty = MatchTimelineFetchResult.builder()
                .gameId(131L)
                .timeline(new MatchTimeline())
                .status("EMPTY")
                .build();
        when(sgpMatchHistoryProvider.fetchGameTimeline(131L, options(MatchHistorySource.SGP, false)))
                .thenReturn(empty);

        MatchTimelineFetchResult result = sourceAwareService.getGameTimelineById(131L, "sgp");

        assertThat(result.getStatus()).isEqualTo("EMPTY");
        assertThat(result.getGameId()).isEqualTo(131L);
        verify(sgpMatchHistoryProvider).fetchGameTimeline(131L, options(MatchHistorySource.SGP, false));
        verify(sgpMatchHistoryProvider, never()).fetchGameDetail(any(Long.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getGameTimelineById_providerWithoutTimelineReturnsUnavailable() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        MatchTimelineFetchResult unavailable = MatchTimelineFetchResult.builder()
                .gameId(132L)
                .status("UNAVAILABLE")
                .lastError("Timeline is not supported by this match-history provider")
                .build();
        when(matchHistoryProvider.fetchGameTimeline(132L, options(MatchHistorySource.LCU, false)))
                .thenReturn(unavailable);

        MatchTimelineFetchResult result = sourceAwareService.getGameTimelineById(132L, MatchHistorySource.LCU);

        assertThat(result.getStatus()).isEqualTo("UNAVAILABLE");
        assertThat(result.getLastError()).contains("not supported");
        verify(matchHistoryProvider).fetchGameTimeline(132L, options(MatchHistorySource.LCU, false));
        verify(matchHistoryProvider, never()).fetchGameDetail(any(Long.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getGameDetailById_sourceSgpUsesLcuParticipantsWhenSgpObjectiveDetailIsNotRenderable() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        var sgpDetail = hollowGameDetail(110L);
        sgpDetail.setQueueId(420);
        var sgpSummary = teamObjectiveSummary(
                100,
                List.of(),
                1,
                1,
                0,
                null,
                null,
                null,
                Map.of("hextech", 1)
        );
        sgpSummary.setObjectiveEvents(List.of(objectiveEvent(
                "dragon",
                "hextech",
                100,
                1,
                null,
                600000L
        )));
        sgpDetail.setTeamObjectives(List.of(sgpSummary));
        var lcuDetail = renderableGameDetail(110L);
        lcuDetail.setQueueId(420);
        lcuDetail.setTeamObjectives(List.of(teamObjectiveSummary(
                100,
                List.of(56, 84),
                9,
                9,
                0,
                1,
                3,
                "hextech",
                Map.of()
        )));
        when(sgpMatchHistoryProvider.fetchGameDetail(110L, options(MatchHistorySource.SGP, false)))
                .thenReturn(sgpDetail);
        when(matchHistoryProvider.fetchGameDetail(110L, options(MatchHistorySource.LCU, false)))
                .thenReturn(lcuDetail);

        var result = sourceAwareService.getGameDetailById(110L, MatchHistorySource.SGP);

        assertThat(result).isSameAs(sgpDetail);
        assertThat(result.getParticipants()).isSameAs(lcuDetail.getParticipants());
        assertThat(result.getParticipantIdentities()).isSameAs(lcuDetail.getParticipantIdentities());
        assertThat(result.getTeamObjectives()).hasSize(1);
        var summary = result.getTeamObjectives().getFirst();
        assertThat(summary.getDragonKillsByType()).containsOnly(Map.entry("hextech", 1));
        assertThat(summary.getObjectiveEvents())
                .extracting(
                        io.rankpeek.model.GameDetail.TeamObjectiveEvent::getKind,
                        io.rankpeek.model.GameDetail.TeamObjectiveEvent::getParticipantId,
                        io.rankpeek.model.GameDetail.TeamObjectiveEvent::getChampionId
                )
                .containsExactly(org.assertj.core.groups.Tuple.tuple("dragon", 1, 11));
        assertThat(summary.getBans()).containsExactly(56, 84);
        assertThat(summary.getBaronKills()).isEqualTo(1);
        assertThat(summary.getDragonKills()).isEqualTo(1);
        assertThat(summary.getHeraldKills()).isEqualTo(1);
        assertThat(summary.getVoidGrubKills()).isEqualTo(3);
        verify(sgpMatchHistoryProvider).fetchGameDetail(110L, options(MatchHistorySource.SGP, false));
        verify(matchHistoryProvider).fetchGameDetail(110L, options(MatchHistorySource.LCU, false));
    }

    @Test
    void getGameDetailById_sgpOnlyDoesNotUseLcuParticipantsWhenSgpObjectiveDetailIsNotRenderable() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        var sgpDetail = hollowGameDetail(112L);
        sgpDetail.setQueueId(420);
        sgpDetail.setTeamObjectives(List.of(teamObjectiveSummary(
                100,
                List.of(),
                1,
                1,
                0,
                null,
                null,
                null,
                Map.of("hextech", 1)
        )));
        when(sgpMatchHistoryProvider.fetchGameDetail(112L, options(MatchHistorySource.SGP, false)))
                .thenReturn(sgpDetail);

        assertThatThrownBy(() -> sourceAwareService.getGameDetailById(112L, MatchHistorySource.SGP, true))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("missing renderable participant stats");

        verify(sgpMatchHistoryProvider).fetchGameDetail(112L, options(MatchHistorySource.SGP, false));
        verify(matchHistoryProvider, never()).fetchGameDetail(any(Long.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getGameDetailById_sourceSgpDoesNotUseCachedLcuDetailBeforeProvider() {
        MatchHistoryService sourceAwareService = sourceAwareServiceWithCacheRepository();
        var cachedLcuDetail = renderableGameDetail(106L);
        cachedLcuDetail.setQueueId(420);
        cachedLcuDetail.setTeamObjectives(List.of(teamObjectiveSummary(
                100,
                List.of(1, 2),
                1,
                3,
                0,
                1,
                3,
                null,
                Map.of()
        )));
        var sgpDetail = renderableGameDetail(106L);
        sgpDetail.setQueueId(420);
        sgpDetail.setTeamObjectives(List.of(teamObjectiveSummary(
                100,
                List.of(),
                1,
                3,
                0,
                1,
                3,
                null,
                Map.of("hextech", 1, "mountain", 1, "chemtech", 1)
        )));
        lenient().when(cacheRepository.findGameDetail(106L)).thenReturn(Optional.of(cachedLcuDetail));
        when(sgpMatchHistoryProvider.fetchGameDetail(106L, options(MatchHistorySource.SGP, false)))
                .thenReturn(sgpDetail);

        var result = sourceAwareService.getGameDetailById(106L, MatchHistorySource.SGP);

        assertThat(result).isSameAs(sgpDetail);
        assertThat(result.getTeamObjectives().getFirst().getDragonKillsByType()).containsEntry("hextech", 1);
        verify(sgpMatchHistoryProvider).fetchGameDetail(106L, options(MatchHistorySource.SGP, false));
        verify(matchHistoryProvider, never()).fetchGameDetail(any(Long.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getGameDetailById_defaultSourceRefreshesRankedSummonersRiftCacheMissingTurretPlateCounts() {
        MatchHistoryService sourceAwareService = sourceAwareServiceWithCacheRepository();
        var cachedDetail = rankedSummonersRiftDetailWithMisleadingTopMidStats(113L);
        cachedDetail.setTeamObjectives(List.of(
                teamObjectiveSummary(100, List.of(1, 2), 1, 1, 0, 1, 3, null, Map.of("hextech", 1)),
                teamObjectiveSummary(200, List.of(3, 4), 0, 2, 0, 0, 0, null, Map.of("mountain", 1, "ocean", 1))
        ));
        var sgpDetail = rankedSummonersRiftDetailWithMisleadingTopMidStats(113L);
        sgpDetail.setTeamObjectives(List.of(
                teamObjectiveSummary(100, List.of(), 1, 1, 0, 1, 3, null, Map.of("hextech", 1)),
                teamObjectiveSummary(200, List.of(), 0, 2, 0, 0, 0, null, Map.of("mountain", 1, "ocean", 1))
        ));
        when(cacheRepository.findGameDetail(113L)).thenReturn(Optional.of(cachedDetail));
        when(sgpMatchHistoryProvider.supports(options(MatchHistorySource.AUTO, false))).thenReturn(true);
        when(sgpMatchHistoryProvider.fetchGameDetail(113L, options(MatchHistorySource.AUTO, false)))
                .thenReturn(sgpDetail);
        when(sgpMatchHistoryProvider.fetchGameTimeline(113L, options(MatchHistorySource.SGP, false)))
                .thenReturn(timelineResult(
                        113L,
                        turretPlateEvent(120000L, 6, null, 100),
                        turretPlateEvent(180000L, 0, null, 100),
                        turretPlateEvent(240000L, 0, null, 200)
                ));

        var result = sourceAwareService.getGameDetailById(113L);

        assertThat(result).isSameAs(sgpDetail);
        assertThat(result.getTeamObjectives())
                .filteredOn(summary -> Integer.valueOf(100).equals(summary.getTeamId()))
                .singleElement()
                .extracting(io.rankpeek.model.GameDetail.TeamObjectiveSummary::getTurretPlateKills)
                .isEqualTo(1);
        assertThat(result.getTeamObjectives())
                .filteredOn(summary -> Integer.valueOf(200).equals(summary.getTeamId()))
                .singleElement()
                .extracting(io.rankpeek.model.GameDetail.TeamObjectiveSummary::getTurretPlateKills)
                .isEqualTo(2);
        assertThat(result.getTeamObjectives())
                .filteredOn(summary -> Integer.valueOf(200).equals(summary.getTeamId()))
                .singleElement()
                .extracting(io.rankpeek.model.GameDetail.TeamObjectiveSummary::getObjectiveEvents)
                .asInstanceOf(org.assertj.core.api.InstanceOfAssertFactories.LIST)
                .singleElement()
                .satisfies(event -> {
                    io.rankpeek.model.GameDetail.TeamObjectiveEvent objectiveEvent =
                            (io.rankpeek.model.GameDetail.TeamObjectiveEvent) event;
                    assertThat(objectiveEvent.getKind()).isEqualTo("turretPlate");
                    assertThat(objectiveEvent.getTeamId()).isEqualTo(200);
                    assertThat(objectiveEvent.getParticipantId()).isEqualTo(6);
                    assertThat(objectiveEvent.getChampionId()).isEqualTo(106);
                    assertThat(objectiveEvent.getTimestamp()).isEqualTo(120000L);
                });
        verify(sgpMatchHistoryProvider).fetchGameDetail(113L, options(MatchHistorySource.AUTO, false));
        verify(sgpMatchHistoryProvider).fetchGameTimeline(113L, options(MatchHistorySource.SGP, false));
        verify(cacheRepository).saveGameDetail(sgpDetail);
    }

    @Test
    void getGameDetailById_defaultSourceRefreshesRankedSummonersRiftCacheMissingTurretPlateEvents() {
        MatchHistoryService sourceAwareService = sourceAwareServiceWithCacheRepository();
        var cachedDetail = rankedSummonersRiftDetailWithMisleadingTopMidStats(114L);
        var cachedBlueSummary = teamObjectiveSummary(100, List.of(1, 2), 1, 1, 0, 1, 3, null, Map.of("hextech", 1));
        cachedBlueSummary.setTurretPlateKills(1);
        var cachedRedSummary = teamObjectiveSummary(200, List.of(3, 4), 0, 2, 0, 0, 0, null, Map.of("mountain", 1, "ocean", 1));
        cachedRedSummary.setTurretPlateKills(2);
        cachedDetail.setTeamObjectives(List.of(cachedBlueSummary, cachedRedSummary));

        var sgpDetail = rankedSummonersRiftDetailWithMisleadingTopMidStats(114L);
        var sgpBlueSummary = teamObjectiveSummary(100, List.of(), 1, 1, 0, 1, 3, null, Map.of("hextech", 1));
        sgpBlueSummary.setTurretPlateKills(1);
        var sgpRedSummary = teamObjectiveSummary(200, List.of(), 0, 2, 0, 0, 0, null, Map.of("mountain", 1, "ocean", 1));
        sgpRedSummary.setTurretPlateKills(2);
        sgpDetail.setTeamObjectives(List.of(sgpBlueSummary, sgpRedSummary));

        when(cacheRepository.findGameDetail(114L)).thenReturn(Optional.of(cachedDetail));
        when(sgpMatchHistoryProvider.supports(options(MatchHistorySource.AUTO, false))).thenReturn(true);
        when(sgpMatchHistoryProvider.fetchGameDetail(114L, options(MatchHistorySource.AUTO, false)))
                .thenReturn(sgpDetail);
        when(sgpMatchHistoryProvider.fetchGameTimeline(114L, options(MatchHistorySource.SGP, false)))
                .thenReturn(timelineResult(
                        114L,
                        turretPlateEvent(120000L, 6, null, 100),
                        turretPlateEvent(180000L, 0, null, 100),
                        turretPlateEvent(240000L, 0, null, 200)
                ));

        var result = sourceAwareService.getGameDetailById(114L);

        assertThat(result).isSameAs(sgpDetail);
        assertThat(result.getTeamObjectives())
                .filteredOn(summary -> Integer.valueOf(200).equals(summary.getTeamId()))
                .singleElement()
                .extracting(io.rankpeek.model.GameDetail.TeamObjectiveSummary::getObjectiveEvents)
                .asInstanceOf(org.assertj.core.api.InstanceOfAssertFactories.LIST)
                .singleElement()
                .extracting("kind", "teamId", "participantId", "championId")
                .containsExactly("turretPlate", 200, 6, 106);
        verify(sgpMatchHistoryProvider).fetchGameDetail(114L, options(MatchHistorySource.AUTO, false));
        verify(sgpMatchHistoryProvider).fetchGameTimeline(114L, options(MatchHistorySource.SGP, false));
        verify(cacheRepository).saveGameDetail(sgpDetail);
    }

    @Test
    void getGameDetailById_sourceSgpDoesNotFallbackToLcuOrCacheWhenProviderFails() {
        MatchHistoryService sourceAwareService = sourceAwareServiceWithCacheRepository();
        var cachedLcuDetail = renderableGameDetail(107L);
        cachedLcuDetail.setQueueId(420);
        cachedLcuDetail.setTeamObjectives(List.of(teamObjectiveSummary(100, List.of(1), 1, 2, 0)));
        lenient().when(cacheRepository.findGameDetail(107L)).thenReturn(Optional.of(cachedLcuDetail));
        when(sgpMatchHistoryProvider.fetchGameDetail(107L, options(MatchHistorySource.SGP, false)))
                .thenThrow(new RuntimeException("sgp down"));

        assertThatThrownBy(() -> sourceAwareService.getGameDetailById(107L, MatchHistorySource.SGP))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("sgp down");

        verify(sgpMatchHistoryProvider).fetchGameDetail(107L, options(MatchHistorySource.SGP, false));
        verify(matchHistoryProvider, never()).fetchGameDetail(any(Long.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getGameDetailById_defaultSourcePrefersSgpWhenReady() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        var detail = renderableGameDetail(100L);
        when(sgpMatchHistoryProvider.supports(options(MatchHistorySource.AUTO, false))).thenReturn(true);
        when(sgpMatchHistoryProvider.fetchGameDetail(100L, options(MatchHistorySource.AUTO, false)))
                .thenReturn(detail);

        assertThat(sourceAwareService.getGameDetailById(100L)).isSameAs(detail);
        verify(sgpMatchHistoryProvider).fetchGameDetail(100L, options(MatchHistorySource.AUTO, false));
        verify(matchHistoryProvider, never()).fetchGameDetail(any(Long.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getGameDetailById_defaultSourceMergesMissingTeamObjectivesFromLcuOnly() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        var sgpDetail = renderableGameDetail(104L);
        sgpDetail.setQueueId(420);
        var lcuDetail = renderableGameDetail(104L);
        lcuDetail.setQueueId(420);
        var lcuSummary = teamObjectiveSummary(
                200,
                List.of(24, 799),
                0,
                3,
                1,
                1,
                3,
                "hextech",
                Map.of("hextech", 2, "ocean", 1)
        );
        lcuSummary.setObjectiveEvents(List.of(objectiveEvent(
                "dragon",
                "hextech",
                200,
                6,
                206,
                600000L
        )));
        lcuDetail.setTeamObjectives(List.of(lcuSummary));
        when(sgpMatchHistoryProvider.supports(options(MatchHistorySource.AUTO, false))).thenReturn(true);
        when(sgpMatchHistoryProvider.fetchGameDetail(104L, options(MatchHistorySource.AUTO, false)))
                .thenReturn(sgpDetail);
        when(matchHistoryProvider.fetchGameDetail(104L, options(MatchHistorySource.LCU, false)))
                .thenReturn(lcuDetail);

        var result = sourceAwareService.getGameDetailById(104L);

        assertThat(result).isSameAs(sgpDetail);
        assertThat(result.getParticipants()).isSameAs(sgpDetail.getParticipants());
        assertThat(result.getTeamObjectives()).hasSize(1);
        assertThat(result.getTeamObjectives().getFirst().getTeamId()).isEqualTo(200);
        assertThat(result.getTeamObjectives().getFirst().getBans()).containsExactly(24, 799);
        assertThat(result.getTeamObjectives().getFirst().getDragonKills()).isEqualTo(3);
        assertThat(result.getTeamObjectives().getFirst().getHeraldKills()).isEqualTo(1);
        assertThat(result.getTeamObjectives().getFirst().getVoidGrubKills()).isEqualTo(3);
        assertThat(result.getTeamObjectives().getFirst().getDragonSoulType()).isNull();
        assertThat(result.getTeamObjectives().getFirst().getDragonKillsByType()).isEmpty();
        assertThat(result.getTeamObjectives().getFirst().getObjectiveEvents()).isEmpty();
        verify(sgpMatchHistoryProvider).fetchGameDetail(104L, options(MatchHistorySource.AUTO, false));
        verify(matchHistoryProvider).fetchGameDetail(104L, options(MatchHistorySource.LCU, false));
    }

    @Test
    void getGameDetailById_defaultSourceMergesOnlyFallbackCountsFromLcuWithoutReplacingSgpTotals() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        var sgpDetail = renderableGameDetail(105L);
        sgpDetail.setQueueId(420);
        var sgpSummary = teamObjectiveSummary(
                100,
                List.of(56, 84),
                1,
                1,
                0,
                null,
                null,
                null,
                Map.of()
        );
        sgpSummary.setObjectiveEvents(List.of(objectiveEvent(
                "baron",
                null,
                100,
                1,
                11,
                1200000L
        )));
        sgpDetail.setTeamObjectives(List.of(sgpSummary));
        var lcuDetail = renderableGameDetail(105L);
        lcuDetail.setQueueId(420);
        var lcuSummary = teamObjectiveSummary(
                100,
                List.of(1, 2),
                9,
                9,
                1,
                1,
                3,
                "hextech",
                Map.of("ocean", 1)
        );
        lcuSummary.setObjectiveEvents(List.of(objectiveEvent(
                "dragon",
                "ocean",
                100,
                2,
                12,
                600000L
        )));
        lcuSummary.setTurretKills(6);
        lcuSummary.setInhibitorKills(1);
        lcuSummary.setTurretPlateKills(8);
        lcuDetail.setTeamObjectives(List.of(lcuSummary));
        when(sgpMatchHistoryProvider.supports(options(MatchHistorySource.AUTO, false))).thenReturn(true);
        when(sgpMatchHistoryProvider.fetchGameDetail(105L, options(MatchHistorySource.AUTO, false)))
                .thenReturn(sgpDetail);
        when(matchHistoryProvider.fetchGameDetail(105L, options(MatchHistorySource.LCU, false)))
                .thenReturn(lcuDetail);

        var result = sourceAwareService.getGameDetailById(105L);

        assertThat(result).isSameAs(sgpDetail);
        assertThat(result.getTeamObjectives()).hasSize(1);
        var summary = result.getTeamObjectives().getFirst();
        assertThat(summary.getBans()).containsExactly(56, 84);
        assertThat(summary.getBaronKills()).isEqualTo(1);
        assertThat(summary.getDragonKills()).isEqualTo(1);
        assertThat(summary.getElderDragonKills()).isZero();
        assertThat(summary.getHeraldKills()).isEqualTo(1);
        assertThat(summary.getVoidGrubKills()).isEqualTo(3);
        assertThat(summary.getTurretKills()).isEqualTo(6);
        assertThat(summary.getInhibitorKills()).isEqualTo(1);
        assertThat(summary.getTurretPlateKills()).isEqualTo(8);
        assertThat(summary.getDragonSoulType()).isNull();
        assertThat(summary.getDragonKillsByType()).isEmpty();
        assertThat(summary.getObjectiveEvents())
                .extracting(io.rankpeek.model.GameDetail.TeamObjectiveEvent::getKind)
                .containsExactly("baron");
        verify(sgpMatchHistoryProvider).fetchGameDetail(105L, options(MatchHistorySource.AUTO, false));
        verify(matchHistoryProvider).fetchGameDetail(105L, options(MatchHistorySource.LCU, false));
    }

    @Test
    void getGameDetailById_defaultSourceMergesPositiveLcuTurretPlateFallbackOverSgpZero() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        var sgpDetail = renderableGameDetail(111L);
        sgpDetail.setQueueId(420);
        var sgpSummary = teamObjectiveSummary(
                100,
                List.of(),
                1,
                1,
                0,
                null,
                null,
                null,
                Map.of()
        );
        sgpSummary.setTurretPlateKills(0);
        sgpDetail.setTeamObjectives(List.of(sgpSummary));
        var lcuDetail = renderableGameDetail(111L);
        lcuDetail.setQueueId(420);
        var lcuSummary = teamObjectiveSummary(
                100,
                List.of(56, 84),
                1,
                1,
                0,
                1,
                3,
                null,
                Map.of()
        );
        lcuSummary.setTurretPlateKills(6);
        lcuDetail.setTeamObjectives(List.of(lcuSummary));
        when(sgpMatchHistoryProvider.supports(options(MatchHistorySource.AUTO, false))).thenReturn(true);
        when(sgpMatchHistoryProvider.fetchGameDetail(111L, options(MatchHistorySource.AUTO, false)))
                .thenReturn(sgpDetail);
        when(matchHistoryProvider.fetchGameDetail(111L, options(MatchHistorySource.LCU, false)))
                .thenReturn(lcuDetail);

        var result = sourceAwareService.getGameDetailById(111L);

        assertThat(result).isSameAs(sgpDetail);
        var summary = result.getTeamObjectives().getFirst();
        assertThat(summary.getTurretPlateKills()).isEqualTo(6);
        assertThat(summary.getBans()).containsExactly(56, 84);
        assertThat(summary.getHeraldKills()).isEqualTo(1);
        assertThat(summary.getVoidGrubKills()).isEqualTo(3);
        verify(sgpMatchHistoryProvider).fetchGameDetail(111L, options(MatchHistorySource.AUTO, false));
        verify(matchHistoryProvider).fetchGameDetail(111L, options(MatchHistorySource.LCU, false));
    }

    @Test
    void getGameDetailById_defaultSourceMergesLcuFallbackBansIntoTypedSgpObjectives() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        var sgpDetail = renderableGameDetail(108L);
        sgpDetail.setQueueId(420);
        sgpDetail.setTeamObjectives(List.of(teamObjectiveSummary(
                100,
                List.of(),
                1,
                3,
                0,
                1,
                3,
                null,
                Map.of("hextech", 1, "mountain", 1, "chemtech", 1)
        )));
        var lcuDetail = renderableGameDetail(108L);
        lcuDetail.setQueueId(420);
        lcuDetail.setTeamObjectives(List.of(teamObjectiveSummary(
                100,
                List.of(56, 84),
                9,
                9,
                1,
                2,
                6,
                "hextech",
                Map.of("ocean", 1)
        )));
        when(sgpMatchHistoryProvider.supports(options(MatchHistorySource.AUTO, false))).thenReturn(true);
        when(sgpMatchHistoryProvider.fetchGameDetail(108L, options(MatchHistorySource.AUTO, false)))
                .thenReturn(sgpDetail);
        when(matchHistoryProvider.fetchGameDetail(108L, options(MatchHistorySource.LCU, false)))
                .thenReturn(lcuDetail);

        var result = sourceAwareService.getGameDetailById(108L);

        assertThat(result).isSameAs(sgpDetail);
        var summary = result.getTeamObjectives().getFirst();
        assertThat(summary.getBans()).containsExactly(56, 84);
        assertThat(summary.getBaronKills()).isEqualTo(1);
        assertThat(summary.getDragonKills()).isEqualTo(3);
        assertThat(summary.getElderDragonKills()).isZero();
        assertThat(summary.getHeraldKills()).isEqualTo(1);
        assertThat(summary.getVoidGrubKills()).isEqualTo(3);
        assertThat(summary.getDragonKillsByType()).containsOnly(
                Map.entry("hextech", 1),
                Map.entry("mountain", 1),
                Map.entry("chemtech", 1)
        );
        assertThat(summary.getDragonSoulType()).isNull();
        verify(sgpMatchHistoryProvider).fetchGameDetail(108L, options(MatchHistorySource.AUTO, false));
        verify(matchHistoryProvider).fetchGameDetail(108L, options(MatchHistorySource.LCU, false));
    }

    @Test
    void getGameDetailById_defaultSourceRefreshesRankedCacheWithGenericObjectives() {
        MatchHistoryService sourceAwareService = sourceAwareServiceWithCacheRepository();
        var cachedDetail = renderableGameDetail(109L);
        cachedDetail.setQueueId(420);
        cachedDetail.setTeamObjectives(List.of(teamObjectiveSummary(
                100,
                List.of(1, 2),
                1,
                3,
                0,
                1,
                3,
                null,
                Map.of()
        )));
        var sgpDetail = renderableGameDetail(109L);
        sgpDetail.setQueueId(420);
        sgpDetail.setTeamObjectives(List.of(teamObjectiveSummary(
                100,
                List.of(),
                1,
                3,
                0,
                1,
                3,
                null,
                Map.of("hextech", 1, "mountain", 1, "chemtech", 1)
        )));
        var lcuDetail = renderableGameDetail(109L);
        lcuDetail.setQueueId(420);
        lcuDetail.setTeamObjectives(List.of(teamObjectiveSummary(
                100,
                List.of(56, 84),
                1,
                3,
                0,
                1,
                3,
                null,
                Map.of()
        )));
        when(cacheRepository.findGameDetail(109L)).thenReturn(Optional.of(cachedDetail));
        when(sgpMatchHistoryProvider.supports(options(MatchHistorySource.AUTO, false))).thenReturn(true);
        when(sgpMatchHistoryProvider.fetchGameDetail(109L, options(MatchHistorySource.AUTO, false)))
                .thenReturn(sgpDetail);
        when(matchHistoryProvider.fetchGameDetail(109L, options(MatchHistorySource.LCU, false)))
                .thenReturn(lcuDetail);

        var result = sourceAwareService.getGameDetailById(109L);

        assertThat(result).isSameAs(sgpDetail);
        var summary = result.getTeamObjectives().getFirst();
        assertThat(summary.getBans()).containsExactly(56, 84);
        assertThat(summary.getDragonKillsByType()).containsEntry("hextech", 1);
        verify(sgpMatchHistoryProvider).fetchGameDetail(109L, options(MatchHistorySource.AUTO, false));
        verify(matchHistoryProvider).fetchGameDetail(109L, options(MatchHistorySource.LCU, false));
        verify(cacheRepository).saveGameDetail(sgpDetail);
    }

    @Test
    void getGameDetailById_defaultSourceFallsBackToLcuWhenSgpReturnsHollowDetail() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        var hollowDetail = hollowGameDetail(101L);
        var lcuDetail = renderableGameDetail(101L);
        when(sgpMatchHistoryProvider.supports(options(MatchHistorySource.AUTO, false))).thenReturn(true);
        when(sgpMatchHistoryProvider.fetchGameDetail(101L, options(MatchHistorySource.AUTO, false)))
                .thenReturn(hollowDetail);
        when(matchHistoryProvider.fetchGameDetail(101L, options(MatchHistorySource.LCU, false)))
                .thenReturn(lcuDetail);

        assertThat(sourceAwareService.getGameDetailById(101L)).isSameAs(lcuDetail);
        verify(sgpMatchHistoryProvider).fetchGameDetail(101L, options(MatchHistorySource.AUTO, false));
        verify(matchHistoryProvider).fetchGameDetail(101L, options(MatchHistorySource.LCU, false));
    }

    @Test
    void getGameDetailById_sourceCacheReturnsCachedDetailWithoutProvider() {
        MatchHistoryService sourceAwareService = sourceAwareServiceWithCacheRepository();
        var cachedDetail = renderableGameDetail(102L);
        when(cacheRepository.findGameDetail(102L)).thenReturn(Optional.of(cachedDetail));

        assertThat(sourceAwareService.getGameDetailById(102L, MatchHistorySource.CACHE)).isSameAs(cachedDetail);
        verify(cacheRepository).findGameDetail(102L);
        verify(matchHistoryProvider, never()).fetchGameDetail(any(Long.class), any(MatchHistoryQueryOptions.class));
        verify(sgpMatchHistoryProvider, never()).fetchGameDetail(any(Long.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getGameDetailById_sourceLcuRefreshesRankedCacheMissingTeamObjectives() {
        MatchHistoryService sourceAwareService = sourceAwareServiceWithCacheRepository();
        var cachedDetail = renderableGameDetail(103L);
        cachedDetail.setQueueId(420);
        var lcuDetail = renderableGameDetail(103L);
        lcuDetail.setQueueId(420);
        lcuDetail.setTeamObjectives(List.of(teamObjectiveSummary(
                100,
                List.of(56, 84),
                1,
                2,
                0,
                1,
                6,
                "infernal",
                Map.of("infernal", 2)
        )));
        when(cacheRepository.findGameDetail(103L)).thenReturn(Optional.of(cachedDetail));
        when(matchHistoryProvider.fetchGameDetail(103L, options(MatchHistorySource.LCU, false)))
                .thenReturn(lcuDetail);

        var result = sourceAwareService.getGameDetailById(103L, MatchHistorySource.LCU);

        assertThat(result).isSameAs(lcuDetail);
        assertThat(result.getTeamObjectives()).hasSize(1);
        assertThat(result.getTeamObjectives().getFirst().getHeraldKills()).isEqualTo(1);
        assertThat(result.getTeamObjectives().getFirst().getVoidGrubKills()).isEqualTo(6);
        assertThat(result.getTeamObjectives().getFirst().getDragonSoulType()).isEqualTo("infernal");
        assertThat(result.getTeamObjectives().getFirst().getDragonKillsByType()).containsEntry("infernal", 2);
        verify(matchHistoryProvider).fetchGameDetail(103L, options(MatchHistorySource.LCU, false));
        verify(cacheRepository).saveGameDetail(lcuDetail);
        verify(sgpMatchHistoryProvider, never()).fetchGameDetail(any(Long.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getMatchHistoryPage_sourceAutoUsesSgpAndCalculatesHasNext() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        when(sgpMatchHistoryProvider.supports(pageOptions(MatchHistorySource.AUTO, false, 3))).thenReturn(true);
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.AUTO, false, 3)))
                .thenReturn(resultWithMatches(
                        match(1L, 420, "puuid-1", 11),
                        match(2L, 420, "puuid-1", 12),
                        match(3L, 420, "puuid-1", 13)
                ));

        MatchHistoryPageResponse response = sourceAwareService.getMatchHistoryPage(
                "puuid-1",
                1,
                2,
                "auto",
                null,
                null,
                false,
                null
        );

        assertThat(response.getMatches()).extracting(MatchHistory::getGameId).containsExactly(1L, 2L);
        assertThat(response.getPage()).isEqualTo(1);
        assertThat(response.getPageSize()).isEqualTo(2);
        assertThat(response.isHasNext()).isTrue();
        assertThat(response.getSource()).isEqualTo("sgp");
        assertThat(response.getRecordStatus()).isEqualTo(RecordStatus.NORMAL);
        verify(sgpMatchHistoryProvider).fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.AUTO, false, 3));
    }

    @Test
    void getMatchHistoryPage_fetchesOnlyEnoughRowsForRequestedFirstPage() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.SGP, false, 21)))
                .thenReturn(resultWithMatches(
                        match(1L, 420, "puuid-1", 11),
                        match(2L, 420, "puuid-1", 12)
                ));

        MatchHistoryPageResponse response = sourceAwareService.getMatchHistoryPage(
                "puuid-1",
                1,
                20,
                "sgp",
                null,
                null,
                false,
                null
        );

        assertThat(response.getMatches()).extracting(MatchHistory::getGameId).containsExactly(1L, 2L);
        verify(sgpMatchHistoryProvider).fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.SGP, false, 21));
    }

    @Test
    void getMatchHistoryPage_sourceSgpDoesNotHydrateDetailsWhenCurrentParticipantIsRenderable() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.SGP, false, 21)))
                .thenReturn(resultWithMatches(
                        renderableCurrentOnlyMatch(77L, 420, "puuid-1", 11)
                ));

        MatchHistoryPageResponse response = sourceAwareService.getMatchHistoryPage(
                "puuid-1",
                1,
                20,
                "sgp",
                null,
                null,
                false,
                null
        );

        assertThat(response.getMatches()).extracting(MatchHistory::getGameId).containsExactly(77L);
        verify(sgpMatchHistoryProvider, never())
                .fetchGameDetail(any(Long.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getMatchHistoryPage_sourceSgpDoesNotFallbackToLcuWhenSummaryCannotRenderCurrentParticipant() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.SGP, false, 21)))
                .thenReturn(resultWithMatches(nonRenderableCurrentOnlyMatch(77L, 420)));

        MatchHistoryPageResponse response = sourceAwareService.getMatchHistoryPage(
                "puuid-1",
                1,
                20,
                "sgp",
                null,
                null,
                false,
                null
        );

        assertThat(response.getMatches()).extracting(MatchHistory::getGameId).containsExactly(77L);
        assertThat(response.getSource()).isEqualTo("sgp");
        verify(sgpMatchHistoryProvider).fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.SGP, false, 21));
        verify(matchHistoryProvider, never()).fetchMatchHistory(any(String.class), any(MatchHistoryQueryOptions.class));
        verify(sgpMatchHistoryProvider, never())
                .fetchGameDetail(any(Long.class), any(MatchHistoryQueryOptions.class));
        verify(sgpMatchHistoryProvider, after(300).never())
                .fetchGameTimeline(any(Long.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getMatchHistoryPage_sourceSgpDoesNotPersistRawSummaryOnListPage() {
        MatchHistoryService sourceAwareService = sourceAwareServiceWithCacheRepository();
        List<MatchHistory> matches = new java.util.ArrayList<>();
        Map<Long, String> rawSummaries = new java.util.LinkedHashMap<>();
        for (long gameId = 78L; gameId <= 83L; gameId++) {
            matches.add(renderableCurrentOnlyMatch(gameId, 420, "puuid-1", 11));
            rawSummaries.put(gameId, "{\"gameId\":" + gameId + "}");
        }
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.SGP, false, 21)))
                .thenReturn(MatchHistoryFetchResult.builder()
                        .matches(matches)
                        .rawSummaryJsonByGameId(rawSummaries)
                        .build());

        MatchHistoryPageResponse response = sourceAwareService.getMatchHistoryPage(
                "puuid-1",
                1,
                20,
                "sgp",
                null,
                null,
                false,
                null
        );

        assertThat(response.getMatches()).extracting(MatchHistory::getGameId)
                .containsExactly(78L, 79L, 80L, 81L, 82L, 83L);
        assertThat(response.getSource()).isEqualTo("sgp");
        assertThat(response.getRecordStatus()).isEqualTo(RecordStatus.NORMAL);
        verify(sgpMatchHistoryProvider, never())
                .fetchGameDetail(any(Long.class), any(MatchHistoryQueryOptions.class));
        verify(cacheRepository, after(300).never()).saveSgpRawSummaries(any());
        verify(cacheRepository, never()).findMatchDataScope(any(Long.class));
        verify(sgpMatchHistoryProvider, after(300).never())
                .fetchGameTimeline(any(Long.class), any(MatchHistoryQueryOptions.class));
        verify(cacheRepository, never()).saveSgpRawDetail(any(Long.class), any(), any(), any());
        verify(cacheRepository, never()).saveSgpTimeline(any(Long.class), any(), any(), any(), any());
    }

    @Test
    void getMatchHistoryPage_sourceSgpDoesNotConsultTimelineBackfillScopeOnListPage() {
        MatchHistoryService sourceAwareService = sourceAwareServiceWithCacheRepository();
        MatchHistory match = renderableCurrentOnlyMatch(78L, 420, "puuid-1", 11);
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.SGP, false, 21)))
                .thenReturn(MatchHistoryFetchResult.builder()
                        .matches(List.of(match))
                        .rawSummaryJsonByGameId(Map.of(78L, "{\"gameId\":78}"))
                        .build());

        MatchHistoryPageResponse response = sourceAwareService.getMatchHistoryPage(
                "puuid-1",
                1,
                20,
                "sgp",
                null,
                null,
                false,
                null
        );

        assertThat(response.getMatches()).extracting(MatchHistory::getGameId).containsExactly(78L);
        verify(cacheRepository, never()).findMatchDataScope(any(Long.class));
        verify(sgpMatchHistoryProvider, after(300).never())
                .fetchGameTimeline(any(Long.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getMatchHistoryPage_sourceCacheReadsRequestedPageSizeFromLocalCache() {
        MatchHistoryService sourceAwareService = sourceAwareServiceWithCacheRepository();
        List<MatchHistory> matches = new java.util.ArrayList<>();
        for (long gameId = 1; gameId <= 200; gameId++) {
            matches.add(match(gameId, 420, "puuid-1", 11));
        }
        when(cacheRepository.findRecentMatchHistory("puuid-1", 200))
                .thenReturn(Optional.of(MatchHistoryFetchResult.builder()
                        .matches(matches)
                        .build()));

        MatchHistoryPageResponse response = sourceAwareService.getMatchHistoryPage(
                "puuid-1",
                1,
                200,
                "cache",
                null,
                null,
                false,
                null
        );

        assertThat(response.getMatches()).hasSize(200);
        assertThat(response.getSource()).isEqualTo("cache");
        verify(cacheRepository).findRecentMatchHistory("puuid-1", 200);
    }

    @Test
    void getMatchHistoryPage_sourceSgpReusesLocalCacheBeforeProviderWhenNotForceRefreshing() {
        MatchHistoryService sourceAwareService = sourceAwareServiceWithCacheRepository();
        List<MatchHistory> matches = new java.util.ArrayList<>();
        for (long gameId = 1; gameId <= 200; gameId++) {
            matches.add(match(gameId, 420, "puuid-1", 11));
        }
        when(cacheRepository.findRecentMatchHistory("puuid-1", 200))
                .thenReturn(Optional.of(MatchHistoryFetchResult.builder()
                        .matches(matches)
                        .build()));

        MatchHistoryPageResponse response = sourceAwareService.getMatchHistoryPage(
                "puuid-1",
                1,
                200,
                "sgp",
                null,
                null,
                false,
                null
        );

        assertThat(response.getMatches()).hasSize(200);
        assertThat(response.getSource()).isEqualTo("sgp");
        verify(cacheRepository).findRecentMatchHistory("puuid-1", 200);
        verify(sgpMatchHistoryProvider, never())
                .fetchMatchHistory(any(String.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getMatchHistoryPage_sourceAutoFetchesProviderWhenCachedRowsDoNotCoverRequestedPage() {
        MatchHistoryService sourceAwareService = sourceAwareServiceWithCacheRepository();
        List<MatchHistory> cachedMatches = new java.util.ArrayList<>();
        for (long gameId = 1; gameId <= 51; gameId++) {
            cachedMatches.add(match(gameId, 420, "puuid-1", 11));
        }
        List<MatchHistory> remoteMatches = new java.util.ArrayList<>();
        for (long gameId = 1; gameId <= 61; gameId++) {
            remoteMatches.add(match(gameId, 420, "puuid-1", 11));
        }
        when(sgpMatchHistoryProvider.supports(pageOptions(MatchHistorySource.AUTO, false, 61))).thenReturn(true);
        when(cacheRepository.findRecentMatchHistory("puuid-1", 61))
                .thenReturn(Optional.of(MatchHistoryFetchResult.builder()
                        .matches(cachedMatches)
                        .build()));
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.AUTO, false, 61)))
                .thenReturn(MatchHistoryFetchResult.builder()
                        .matches(remoteMatches)
                        .build());

        MatchHistoryPageResponse response = sourceAwareService.getMatchHistoryPage(
                "puuid-1",
                3,
                20,
                "auto",
                null,
                null,
                false,
                null
        );

        assertThat(response.getMatches()).extracting(MatchHistory::getGameId)
                .containsExactly(41L, 42L, 43L, 44L, 45L, 46L, 47L, 48L, 49L, 50L,
                        51L, 52L, 53L, 54L, 55L, 56L, 57L, 58L, 59L, 60L);
        assertThat(response.isHasNext()).isTrue();
        assertThat(response.getSource()).isEqualTo("sgp");
        verify(cacheRepository).findRecentMatchHistory("puuid-1", 61);
        verify(sgpMatchHistoryProvider).fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.AUTO, false, 61));
    }

    @Test
    void getMatchHistoryPage_sourceAutoRetriesSgpAndDoesNotFallbackToLcuWhenFetchInitiallyFails() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        when(sgpMatchHistoryProvider.supports(pageOptions(MatchHistorySource.AUTO, false, 11))).thenReturn(true);
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.AUTO, false, 11)))
                .thenThrow(new RuntimeException("sgp down"))
                .thenThrow(new RuntimeException("sgp down again"))
                .thenReturn(resultWithMatches(match(44L, 420, "puuid-1", 11)));

        MatchHistoryPageResponse response = sourceAwareService.getMatchHistoryPage(
                "puuid-1",
                1,
                10,
                "auto",
                null,
                null,
                false,
                null
        );

        assertThat(response.getMatches()).extracting(MatchHistory::getGameId).containsExactly(44L);
        assertThat(response.getSource()).isEqualTo("sgp");
        verify(sgpMatchHistoryProvider, times(3))
                .fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.AUTO, false, 11));
        verify(matchHistoryProvider, never())
                .fetchMatchHistory(any(String.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getMatchHistoryPage_sourceAutoFailsAfterThreeSgpAttemptsWithoutLcuFallback() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        when(sgpMatchHistoryProvider.supports(pageOptions(MatchHistorySource.AUTO, false, 11))).thenReturn(true);
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.AUTO, false, 11)))
                .thenThrow(new RuntimeException("sgp down"));

        assertThatThrownBy(() -> sourceAwareService.getMatchHistoryPage(
                "puuid-1",
                1,
                10,
                "auto",
                null,
                null,
                false,
                null
        )).hasMessageContaining("sgp down");

        verify(sgpMatchHistoryProvider, times(3))
                .fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.AUTO, false, 11));
        verify(matchHistoryProvider, never())
                .fetchMatchHistory(any(String.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getMatchHistoryPage_sourceAutoReportsCacheWhenSgpFetchFallsBackToDatabaseCache() {
        MatchHistoryService sourceAwareService = sourceAwareServiceWithCacheRepository();
        when(sgpMatchHistoryProvider.supports(pageOptions(MatchHistorySource.AUTO, true, 11))).thenReturn(true);
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.AUTO, true, 11)))
                .thenThrow(new RuntimeException("sgp timeout"));
        List<MatchHistory> cachedMatches = new java.util.ArrayList<>();
        for (long gameId = 55L; gameId <= 64L; gameId++) {
            cachedMatches.add(match(gameId, 420, "puuid-1", 11));
        }
        when(cacheRepository.findRecentMatchHistory("puuid-1", 11))
                .thenReturn(Optional.of(resultWithMatches(cachedMatches.toArray(MatchHistory[]::new))));

        MatchHistoryPageResponse response = sourceAwareService.getMatchHistoryPage(
                "puuid-1",
                1,
                10,
                "auto",
                null,
                null,
                true,
                null
        );

        assertThat(response.getMatches()).extracting(MatchHistory::getGameId)
                .containsExactlyElementsOf(cachedMatches.stream().map(MatchHistory::getGameId).toList());
        assertThat(response.getSource()).isEqualTo("cache");
        verify(sgpMatchHistoryProvider, times(3))
                .fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.AUTO, true, 11));
        verify(matchHistoryProvider, never())
                .fetchMatchHistory(any(String.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getMatchHistoryPage_forceRefreshRejectsSingleShortSgpResultAndUsesCacheFallback() {
        MatchHistoryService sourceAwareService = sourceAwareServiceWithCacheRepository();
        List<MatchHistory> cachedMatches = new java.util.ArrayList<>();
        for (long gameId = 1001; gameId <= 1020; gameId++) {
            cachedMatches.add(match(gameId, 420, "puuid-1", 11));
        }
        MatchHistory shortMatch = renderableCurrentOnlyMatch(77L, 420, "puuid-1", 11);
        shortMatch.setGameDuration(180);
        shortMatch.setRemake(true);
        when(sgpMatchHistoryProvider.supports(pageOptions(MatchHistorySource.AUTO, true, 21))).thenReturn(true);
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.AUTO, true, 21)))
                .thenReturn(resultWithMatches(shortMatch));
        when(cacheRepository.findRecentMatchHistory("puuid-1", 21))
                .thenReturn(Optional.of(MatchHistoryFetchResult.builder()
                        .matches(cachedMatches)
                        .build()));

        MatchHistoryPageResponse response = sourceAwareService.getMatchHistoryPage(
                "puuid-1",
                1,
                20,
                "auto",
                null,
                null,
                true,
                null
        );

        assertThat(response.getMatches()).extracting(MatchHistory::getGameId)
                .containsExactlyElementsOf(cachedMatches.stream().map(MatchHistory::getGameId).toList());
        assertThat(response.getSource()).isEqualTo("cache");
        verify(cacheRepository).findRecentMatchHistory("puuid-1", 21);
        verify(cacheRepository, after(300).never())
                .saveMatchHistory(eq("puuid-1"), argThat(matches -> matches.stream()
                        .anyMatch(match -> match != null && Long.valueOf(77L).equals(match.getGameId()))));
    }

    @Test
    void getMatchHistoryPage_forceRefreshSavesAndReturnsEnoughRenderableSgpMatches() {
        MatchHistoryService sourceAwareService = sourceAwareServiceWithCacheRepository();
        List<MatchHistory> sgpMatches = new java.util.ArrayList<>();
        for (long gameId = 2001; gameId <= 2020; gameId++) {
            sgpMatches.add(renderableCurrentOnlyMatch(gameId, 420, "puuid-1", 11));
        }
        when(sgpMatchHistoryProvider.supports(pageOptions(MatchHistorySource.AUTO, true, 21))).thenReturn(true);
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.AUTO, true, 21)))
                .thenReturn(resultWithMatches(sgpMatches.toArray(MatchHistory[]::new)));

        MatchHistoryPageResponse response = sourceAwareService.getMatchHistoryPage(
                "puuid-1",
                1,
                20,
                "auto",
                null,
                null,
                true,
                null
        );

        assertThat(response.getMatches()).hasSize(20);
        assertThat(response.getSource()).isEqualTo("sgp");
        verify(cacheRepository, timeout(1000)).saveMatchHistory(eq("puuid-1"), argThat(matches ->
                matches.size() == 20
                        && matches.stream().allMatch(match -> match != null && match.getGameId() >= 2001L)));
    }

    @Test
    void getMatchHistoryPage_skipsDuplicateAsyncSgpCacheWritesForSamePuuidWhileWriteIsQueued() {
        ManualExecutorService cacheWriteExecutor = new ManualExecutorService();
        ExecutorService sgpBackfillExecutor = Executors.newSingleThreadExecutor();
        when(matchHistoryProvider.source()).thenReturn(MatchHistorySource.LCU);
        when(sgpMatchHistoryProvider.source()).thenReturn(MatchHistorySource.SGP);
        MatchHistoryService sourceAwareService = new MatchHistoryService(
                List.of(matchHistoryProvider, sgpMatchHistoryProvider),
                cacheRepository,
                cacheWriteExecutor,
                sgpBackfillExecutor
        );
        sourceAwareService.init();

        lenient().when(cacheRepository.findRecentMatchHistory(eq("puuid-1"), anyInt()))
                .thenReturn(Optional.empty());
        when(sgpMatchHistoryProvider.supports(pageOptions(MatchHistorySource.AUTO, false, 21))).thenReturn(true);
        when(sgpMatchHistoryProvider.supports(pageOptions(MatchHistorySource.AUTO, false, 41))).thenReturn(true);
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.AUTO, false, 21)))
                .thenReturn(resultWithMatches(renderableCurrentOnlyMatch(3001L, 420, "puuid-1", 11)));
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.AUTO, false, 41)))
                .thenReturn(resultWithMatches(renderableCurrentOnlyMatch(3002L, 420, "puuid-1", 11)));

        try {
            sourceAwareService.getMatchHistoryPage("puuid-1", 1, 20, "auto", null, null, false, null);
            sourceAwareService.getMatchHistoryPage("puuid-1", 2, 20, "auto", null, null, false, null);

            assertThat(cacheWriteExecutor.queuedTaskCount()).isEqualTo(1);
        } finally {
            cacheWriteExecutor.runQueuedTasks();
            sourceAwareService.shutdownAsyncExecutors();
        }
    }

    @Test
    void getMatchHistoryPage_reusesLargerInMemorySgpResultForSmallerLaterPages() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        MatchHistory[] matches = new MatchHistory[61];
        for (int index = 0; index < matches.length; index++) {
            matches[index] = match(4000L + index, 420, "puuid-1", 11);
        }
        when(sgpMatchHistoryProvider.supports(pageOptions(MatchHistorySource.AUTO, false, 61))).thenReturn(true);
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.AUTO, false, 61)))
                .thenReturn(resultWithMatches(matches));

        MatchHistoryPageResponse pageThree = sourceAwareService.getMatchHistoryPage(
                "puuid-1",
                3,
                20,
                "auto",
                null,
                null,
                false,
                null
        );
        MatchHistoryPageResponse pageTwo = sourceAwareService.getMatchHistoryPage(
                "puuid-1",
                2,
                20,
                "auto",
                null,
                null,
                false,
                null
        );

        assertThat(pageThree.getMatches()).hasSize(20);
        assertThat(pageTwo.getMatches()).hasSize(20);
        assertThat(pageTwo.getMatches()).extracting(MatchHistory::getGameId)
                .containsExactlyElementsOf(
                        java.util.Arrays.stream(matches, 20, 40)
                                .map(MatchHistory::getGameId)
                                .toList()
                );
        verify(sgpMatchHistoryProvider, times(1))
                .fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.AUTO, false, 61));
        verify(sgpMatchHistoryProvider, never())
                .fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.AUTO, false, 41));
    }

    @Test
    void getMatchHistoryPage_fetchesOnlyWhenCachedSgpResultDoesNotSatisfyRequestedRows() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        MatchHistory[] oneHundredOneMatches = new MatchHistory[101];
        for (int index = 0; index < oneHundredOneMatches.length; index++) {
            oneHundredOneMatches[index] = match(5000L + index, 420, "puuid-1", 11);
        }
        MatchHistory[] oneHundredFortyOneMatches = new MatchHistory[141];
        for (int index = 0; index < oneHundredFortyOneMatches.length; index++) {
            oneHundredFortyOneMatches[index] = match(6000L + index, 420, "puuid-1", 11);
        }
        when(sgpMatchHistoryProvider.supports(pageOptions(MatchHistorySource.AUTO, false, 101))).thenReturn(true);
        when(sgpMatchHistoryProvider.supports(pageOptions(MatchHistorySource.AUTO, false, 141))).thenReturn(true);
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.AUTO, false, 101)))
                .thenReturn(resultWithMatches(oneHundredOneMatches));
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.AUTO, false, 141)))
                .thenReturn(resultWithMatches(oneHundredFortyOneMatches));

        sourceAwareService.getMatchHistoryPage("puuid-1", 5, 20, "auto", null, null, false, null);
        MatchHistoryPageResponse smallerPage = sourceAwareService.getMatchHistoryPage(
                "puuid-1",
                4,
                20,
                "auto",
                null,
                null,
                false,
                null
        );
        MatchHistoryPageResponse largerPage = sourceAwareService.getMatchHistoryPage(
                "puuid-1",
                7,
                20,
                "auto",
                null,
                null,
                false,
                null
        );

        assertThat(smallerPage.getMatches()).hasSize(20);
        assertThat(largerPage.getMatches()).hasSize(20);
        verify(sgpMatchHistoryProvider, times(1))
                .fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.AUTO, false, 101));
        verify(sgpMatchHistoryProvider, never())
                .fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.AUTO, false, 81));
        verify(sgpMatchHistoryProvider, times(1))
                .fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.AUTO, false, 141));
    }

    @Test
    void getMatchHistoryPage_sourceAutoFailsAfterThreeNonRenderableSgpResultsWithoutLcuFallback() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        when(sgpMatchHistoryProvider.supports(pageOptions(MatchHistorySource.AUTO, true, 11))).thenReturn(true);
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.AUTO, true, 11)))
                .thenReturn(resultWithMatches(nonRenderableCurrentOnlyMatch(77L, 420)));

        assertThatThrownBy(() -> sourceAwareService.getMatchHistoryPage(
                "puuid-1",
                1,
                10,
                "auto",
                null,
                null,
                true,
                null
        )).hasMessageContaining("SGP summary missing renderable current-player data");

        verify(sgpMatchHistoryProvider, times(3))
                .fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.AUTO, true, 11));
        verify(matchHistoryProvider, never())
                .fetchMatchHistory(any(String.class), any(MatchHistoryQueryOptions.class));
        verify(sgpMatchHistoryProvider, never())
                .fetchGameDetail(any(Long.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getMatchHistoryPage_sourceSgpPaginatesSecondPage() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.SGP, false, 5)))
                .thenReturn(resultWithMatches(
                        match(1L, 420, "puuid-1", 11),
                        match(2L, 420, "puuid-1", 12),
                        match(3L, 420, "puuid-1", 13)
                ));

        MatchHistoryPageResponse response = sourceAwareService.getMatchHistoryPage(
                "puuid-1",
                2,
                2,
                "sgp",
                null,
                null,
                false,
                null
        );

        assertThat(response.getMatches()).extracting(MatchHistory::getGameId).containsExactly(3L);
        assertThat(response.isHasNext()).isFalse();
        assertThat(response.getSource()).isEqualTo("sgp");
        verify(sgpMatchHistoryProvider).fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.SGP, false, 5));
    }

    @Test
    void getMatchHistoryPage_normalizesUnsafePageSizes() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.SGP, false, 21)))
                .thenReturn(resultWithMatches(
                        match(1L, 420, "puuid-1", 11),
                        match(2L, 420, "puuid-1", 12),
                        match(3L, 420, "puuid-1", 13)
                ));
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.SGP, false, 200)))
                .thenReturn(resultWithMatches(
                        match(1L, 420, "puuid-1", 11),
                        match(2L, 420, "puuid-1", 12),
                        match(3L, 420, "puuid-1", 13)
                ));

        MatchHistoryPageResponse fallbackResponse = sourceAwareService.getMatchHistoryPage(
                "puuid-1", 1, 0, "sgp", null, null, false, null);
        MatchHistoryPageResponse cappedResponse = sourceAwareService.getMatchHistoryPage(
                "puuid-1", 1, 500, "sgp", null, null, false, null);

        assertThat(fallbackResponse.getPageSize()).isEqualTo(20);
        assertThat(cappedResponse.getPageSize()).isEqualTo(200);
        verify(sgpMatchHistoryProvider).fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.SGP, false, 21));
        verify(sgpMatchHistoryProvider).fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.SGP, false, 200));
    }

    @Test
    void getMatchHistoryPage_sourceSgpSupportsPageTwentyWithinLimit() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        List<MatchHistory> matches = new java.util.ArrayList<>();
        for (long gameId = 1; gameId <= 201; gameId++) {
            matches.add(match(gameId, 420, "puuid-1", 11));
        }
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.SGP, false)))
                .thenReturn(MatchHistoryFetchResult.builder()
                        .matches(matches)
                        .build());

        MatchHistoryPageResponse response = sourceAwareService.getMatchHistoryPage(
                "puuid-1",
                20,
                10,
                "sgp",
                null,
                null,
                false,
                null
        );

        assertThat(response.getMatches()).extracting(MatchHistory::getGameId)
                .containsExactly(191L, 192L, 193L, 194L, 195L, 196L, 197L, 198L, 199L, 200L);
        assertThat(response.getPage()).isEqualTo(20);
        assertThat(response.getPageSize()).isEqualTo(10);
        assertThat(response.isHasNext()).isFalse();

        MatchHistoryPageResponse overflowResponse = sourceAwareService.getMatchHistoryPage(
                "puuid-1",
                21,
                10,
                "sgp",
                null,
                null,
                false,
                null
        );

        assertThat(overflowResponse.getMatches()).isEmpty();
        assertThat(overflowResponse.isHasNext()).isFalse();
        verify(sgpMatchHistoryProvider).fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.SGP, false));
    }

    @Test
    void getMatchHistoryPage_filtersByQueueAndChampion() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        when(sgpMatchHistoryProvider.supports(pageOptions(MatchHistorySource.AUTO, false, 200))).thenReturn(false);
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.AUTO, false, 200)))
                .thenReturn(resultWithMatches(
                        match(1L, 420, "puuid-1", 11),
                        match(2L, 440, "puuid-1", 22),
                        match(3L, 420, "puuid-1", 22)
                ));

        MatchHistoryPageResponse response = sourceAwareService.getMatchHistoryPage(
                "puuid-1",
                1,
                10,
                "auto",
                420,
                22,
                false,
                null
        );

        assertThat(response.getMatches()).extracting(MatchHistory::getGameId).containsExactly(3L);
        assertThat(response.isHasNext()).isFalse();
        assertThat(response.getSource()).isEqualTo("sgp");
        verify(sgpMatchHistoryProvider).fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.AUTO, false, 200));
        verify(matchHistoryProvider, never()).fetchMatchHistory(any(String.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getMatchHistoryPage_filtersQueueAfterScanningRecentLimit() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        List<MatchHistory> matches = new java.util.ArrayList<>();
        for (long gameId = 1L; gameId <= 50L; gameId++) {
            int queueId = gameId <= 25L ? 450 : 420;
            matches.add(match(gameId, queueId, "puuid-1", 11));
        }
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.SGP, false, 200)))
                .thenReturn(MatchHistoryFetchResult.builder()
                        .matches(matches)
                        .build());

        MatchHistoryPageResponse response = sourceAwareService.getMatchHistoryPage(
                "puuid-1",
                1,
                20,
                "sgp",
                420,
                null,
                false,
                null
        );

        assertThat(response.getMatches()).hasSize(20);
        assertThat(response.getMatches()).extracting(MatchHistory::getGameId)
                .containsExactly(26L, 27L, 28L, 29L, 30L, 31L, 32L, 33L, 34L, 35L,
                        36L, 37L, 38L, 39L, 40L, 41L, 42L, 43L, 44L, 45L);
        assertThat(response.isHasNext()).isTrue();
        verify(sgpMatchHistoryProvider).fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.SGP, false, 200));
    }

    @Test
    void getMatchHistoryPage_filtersChampionAfterScanningRecentLimit() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        List<MatchHistory> matches = new java.util.ArrayList<>();
        for (long gameId = 1L; gameId <= 60L; gameId++) {
            int championId = gameId <= 35L ? 11 : 22;
            matches.add(match(gameId, 420, "puuid-1", championId));
        }
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.SGP, false, 200)))
                .thenReturn(MatchHistoryFetchResult.builder()
                        .matches(matches)
                        .build());

        MatchHistoryPageResponse response = sourceAwareService.getMatchHistoryPage(
                "puuid-1",
                1,
                20,
                "sgp",
                null,
                22,
                false,
                null
        );

        assertThat(response.getMatches()).hasSize(20);
        assertThat(response.getMatches()).extracting(MatchHistory::getGameId)
                .containsExactly(36L, 37L, 38L, 39L, 40L, 41L, 42L, 43L, 44L, 45L,
                        46L, 47L, 48L, 49L, 50L, 51L, 52L, 53L, 54L, 55L);
        assertThat(response.isHasNext()).isTrue();
        verify(sgpMatchHistoryProvider).fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.SGP, false, 200));
    }

    @Test
    void getMatchHistoryPage_filteredResultBelowPageSizeHasNoNext() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        List<MatchHistory> matches = new java.util.ArrayList<>();
        for (long gameId = 1L; gameId <= 30L; gameId++) {
            int queueId = gameId <= 18L ? 420 : 450;
            matches.add(match(gameId, queueId, "puuid-1", 11));
        }
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.SGP, false, 200)))
                .thenReturn(MatchHistoryFetchResult.builder()
                        .matches(matches)
                        .build());

        MatchHistoryPageResponse response = sourceAwareService.getMatchHistoryPage(
                "puuid-1",
                1,
                20,
                "sgp",
                420,
                null,
                false,
                null
        );

        assertThat(response.getMatches()).hasSize(18);
        assertThat(response.isHasNext()).isFalse();
        verify(sgpMatchHistoryProvider).fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.SGP, false, 200));
    }

    @Test
    void getMatchHistoryPage_reusesRecordStatusForPrivateRecords() {
        MatchHistoryService sourceAwareService = sourceAwareService();
        Rank rankWithGames = rankWithGames();
        when(sgpMatchHistoryProvider.supports(pageOptions(MatchHistorySource.AUTO, false, 11))).thenReturn(false);
        when(sgpMatchHistoryProvider.fetchMatchHistory("puuid-1", pageOptions(MatchHistorySource.AUTO, false, 11)))
                .thenReturn(MatchHistoryFetchResult.builder()
                        .matches(List.of())
                        .rawEmpty(true)
                        .build());

        MatchHistoryPageResponse response = sourceAwareService.getMatchHistoryPage(
                "puuid-1",
                1,
                10,
                "auto",
                null,
                null,
                false,
                rankWithGames
        );

        assertThat(response.getMatches()).isEmpty();
        assertThat(response.getRecordStatus()).isEqualTo(RecordStatus.PRIVATE);
    }

    @Test
    void resolveRecordStatus_distinguishesNormalPrivateEmptyAndError() {
        MatchHistory normalMatch = new MatchHistory();
        normalMatch.setGameId(99L);

        MatchHistoryFetchResult normal = MatchHistoryFetchResult.builder()
                .matches(List.of(normalMatch))
                .rawEmpty(false)
                .build();
        MatchHistoryFetchResult rawEmpty = MatchHistoryFetchResult.builder()
                .matches(List.of())
                .rawEmpty(true)
                .build();
        MatchHistoryFetchResult error = MatchHistoryFetchResult.builder()
                .matches(List.of())
                .rawEmpty(false)
                .build();

        Rank rankWithGames = new Rank();
        Rank.QueueMap queueMap = new Rank.QueueMap();
        Rank.QueueInfo solo = new Rank.QueueInfo();
        solo.setWins(6);
        solo.setLosses(4);
        queueMap.setRankedSolo5x5(solo);
        rankWithGames.setQueueMap(queueMap);

        assertThat(matchHistoryService.resolveRecordStatus(normal, null)).isEqualTo(RecordStatus.NORMAL);
        assertThat(matchHistoryService.resolveRecordStatus(rawEmpty, rankWithGames)).isEqualTo(RecordStatus.PRIVATE);
        assertThat(matchHistoryService.resolveRecordStatus(rawEmpty, null)).isEqualTo(RecordStatus.EMPTY);
        assertThat(matchHistoryService.resolveRecordStatus(error, null)).isEqualTo(RecordStatus.ERROR);
        assertThat(matchHistoryService.resolveRecordStatus(null, null)).isEqualTo(RecordStatus.ERROR);
    }

    private MatchHistoryFetchResult resultWithMatch(long gameId) {
        MatchHistory match = new MatchHistory();
        match.setGameId(gameId);
        return MatchHistoryFetchResult.builder()
                .matches(List.of(match))
                .rawEmpty(false)
                .build();
    }

    private MatchHistoryFetchResult resultWithMatches(MatchHistory... matches) {
        return MatchHistoryFetchResult.builder()
                .matches(List.of(matches))
                .rawEmpty(matches.length == 0)
                .build();
    }

    private MatchHistoryFetchResult resultWithSequentialMatches(long firstGameId, int count) {
        List<MatchHistory> matches = new ArrayList<>();
        for (int index = 0; index < count; index++) {
            MatchHistory match = new MatchHistory();
            match.setGameId(firstGameId + index);
            matches.add(match);
        }
        return MatchHistoryFetchResult.builder()
                .matches(matches)
                .rawEmpty(matches.isEmpty())
                .build();
    }

    private io.rankpeek.model.GameDetail renderableGameDetail(long gameId) {
        io.rankpeek.model.GameDetail detail = new io.rankpeek.model.GameDetail();
        detail.setGameId(gameId);

        io.rankpeek.model.GameDetail.GameParticipant participant = new io.rankpeek.model.GameDetail.GameParticipant();
        participant.setParticipantId(1);
        participant.setTeamId(100);
        participant.setChampionId(11);
        io.rankpeek.model.GameDetail.Stats stats = new io.rankpeek.model.GameDetail.Stats();
        stats.setWin(true);
        stats.setKills(8);
        stats.setDeaths(2);
        stats.setAssists(10);
        participant.setStats(stats);
        detail.setParticipants(List.of(participant));

        io.rankpeek.model.GameDetail.ParticipantIdentity identity = new io.rankpeek.model.GameDetail.ParticipantIdentity();
        identity.setParticipantId(1);
        io.rankpeek.model.GameDetail.Player player = new io.rankpeek.model.GameDetail.Player();
        player.setPuuid("puuid-1");
        identity.setPlayer(player);
        detail.setParticipantIdentities(List.of(identity));
        return detail;
    }

    private io.rankpeek.model.GameDetail rankedSummonersRiftDetailWithMisleadingTopMidStats(long gameId) {
        io.rankpeek.model.GameDetail detail = new io.rankpeek.model.GameDetail();
        detail.setGameId(gameId);
        detail.setMapId(11);
        detail.setQueueId(420);
        detail.setGameDuration(1800L);

        List<io.rankpeek.model.GameDetail.GameParticipant> participants = new java.util.ArrayList<>();
        List<io.rankpeek.model.GameDetail.ParticipantIdentity> identities = new java.util.ArrayList<>();
        for (int participantId = 1; participantId <= 10; participantId++) {
            int slot = (participantId - 1) % 5;
            int teamId = participantId <= 5 ? 100 : 200;
            int totalMinionsKilled = switch (slot) {
                case 0 -> 260;
                case 1 -> 30;
                case 2 -> 190;
                case 3 -> 210;
                default -> 20;
            };
            int neutralMinionsKilled = slot == 1 ? 120 : 0;
            int visionScore = slot == 4 ? 75 : 12;
            participants.add(gameParticipant(
                    participantId,
                    teamId,
                    100 + participantId,
                    slot == 1 ? 11 : 4,
                    switch (slot) {
                        case 0, 2 -> 12;
                        case 3 -> 7;
                        default -> 14;
                    },
                    totalMinionsKilled,
                    neutralMinionsKilled,
                    visionScore
            ));
            identities.add(detailIdentity(participantId, "player-" + participantId));
        }

        detail.setParticipants(participants);
        detail.setParticipantIdentities(identities);
        return detail;
    }

    private io.rankpeek.model.GameDetail.GameParticipant gameParticipant(
            int participantId,
            int teamId,
            int championId,
            int spell1Id,
            int spell2Id,
            int totalMinionsKilled,
            int neutralMinionsKilled,
            int visionScore) {
        io.rankpeek.model.GameDetail.GameParticipant participant = new io.rankpeek.model.GameDetail.GameParticipant();
        participant.setParticipantId(participantId);
        participant.setTeamId(teamId);
        participant.setChampionId(championId);
        participant.setSpell1Id(spell1Id);
        participant.setSpell2Id(spell2Id);

        io.rankpeek.model.GameDetail.Stats stats = new io.rankpeek.model.GameDetail.Stats();
        stats.setWin(teamId == 100);
        stats.setKills(participantId);
        stats.setDeaths(2);
        stats.setAssists(3);
        stats.setTotalMinionsKilled(totalMinionsKilled);
        stats.setNeutralMinionsKilled(neutralMinionsKilled);
        stats.setVisionScore(visionScore);
        stats.setGoldEarned(9000L + participantId);
        stats.setTotalDamageDealtToChampions(12000L + participantId);
        stats.setTotalDamageTaken(15000L + participantId);
        participant.setStats(stats);
        return participant;
    }

    private io.rankpeek.model.GameDetail.ParticipantIdentity detailIdentity(int participantId, String puuid) {
        io.rankpeek.model.GameDetail.ParticipantIdentity identity = new io.rankpeek.model.GameDetail.ParticipantIdentity();
        identity.setParticipantId(participantId);
        io.rankpeek.model.GameDetail.Player player = new io.rankpeek.model.GameDetail.Player();
        player.setPuuid(puuid);
        identity.setPlayer(player);
        return identity;
    }

    private List<String> orderedTeamPositions(io.rankpeek.model.GameDetail detail, int teamId) {
        return detail.getParticipants().stream()
                .filter(participant -> participant.getTeamId() == teamId)
                .sorted(java.util.Comparator.comparing(io.rankpeek.model.GameDetail.GameParticipant::getParticipantId))
                .map(io.rankpeek.model.GameDetail.GameParticipant::getTeamPosition)
                .toList();
    }

    private List<String> orderedTimelinePositions(io.rankpeek.model.GameDetail detail, int teamId) {
        return detail.getParticipants().stream()
                .filter(participant -> participant.getTeamId() == teamId)
                .sorted(java.util.Comparator.comparing(io.rankpeek.model.GameDetail.GameParticipant::getParticipantId))
                .map(participant -> participant.getTimeline() == null ? null : participant.getTimeline().getTeamPosition())
                .toList();
    }

    private io.rankpeek.model.GameDetail.TeamObjectiveSummary teamObjectiveSummary(
            int teamId,
            List<Integer> bans,
            int baronKills,
            int dragonKills,
            int elderDragonKills) {
        return teamObjectiveSummary(
                teamId,
                bans,
                baronKills,
                dragonKills,
                elderDragonKills,
                null,
                null,
                null,
                Map.of()
        );
    }

    private io.rankpeek.model.GameDetail.TeamObjectiveSummary teamObjectiveSummary(
            int teamId,
            List<Integer> bans,
            int baronKills,
            int dragonKills,
            int elderDragonKills,
            Integer heraldKills,
            Integer voidGrubKills,
            String dragonSoulType,
            Map<String, Integer> dragonKillsByType) {
        io.rankpeek.model.GameDetail.TeamObjectiveSummary summary =
                new io.rankpeek.model.GameDetail.TeamObjectiveSummary();
        summary.setTeamId(teamId);
        summary.setBans(bans);
        summary.setBaronKills(baronKills);
        summary.setDragonKills(dragonKills);
        summary.setElderDragonKills(elderDragonKills);
        summary.setHeraldKills(heraldKills);
        summary.setVoidGrubKills(voidGrubKills);
        summary.setDragonSoulType(dragonSoulType);
        summary.setDragonKillsByType(new java.util.LinkedHashMap<>(dragonKillsByType));
        return summary;
    }

    private io.rankpeek.model.GameDetail.TeamObjectiveEvent objectiveEvent(
            String kind,
            String subType,
            int teamId,
            int participantId,
            Integer championId,
            long timestamp) {
        io.rankpeek.model.GameDetail.TeamObjectiveEvent event =
                new io.rankpeek.model.GameDetail.TeamObjectiveEvent();
        event.setKind(kind);
        event.setSubType(subType);
        event.setTeamId(teamId);
        event.setParticipantId(participantId);
        event.setChampionId(championId);
        event.setTimestamp(timestamp);
        return event;
    }

    private MatchTimelineFetchResult timelineResult(long gameId, MatchTimeline.TimelineEvent... events) {
        MatchTimeline timeline = new MatchTimeline();
        timeline.setGameId(gameId);
        timeline.setEvents(List.of(events));
        return MatchTimelineFetchResult.builder()
                .gameId(gameId)
                .timeline(timeline)
                .status("FETCHED")
                .build();
    }

    private MatchTimeline.TimelineEvent turretPlateEvent(
            long timestamp,
            Integer killerId,
            Integer participantId,
            Integer destroyedTeamId) {
        MatchTimeline.TimelineEvent event = new MatchTimeline.TimelineEvent();
        event.setEventType("TURRET_PLATE_DESTROYED");
        event.setTimestamp(timestamp);
        event.setKillerId(killerId);
        event.setParticipantId(participantId);
        event.setTeamId(destroyedTeamId);
        return event;
    }

    private io.rankpeek.model.GameDetail hollowGameDetail(long gameId) {
        io.rankpeek.model.GameDetail detail = new io.rankpeek.model.GameDetail();
        detail.setGameId(gameId);

        io.rankpeek.model.GameDetail.GameParticipant participant = new io.rankpeek.model.GameDetail.GameParticipant();
        participant.setParticipantId(1);
        participant.setStats(new io.rankpeek.model.GameDetail.Stats());
        detail.setParticipants(List.of(participant));

        io.rankpeek.model.GameDetail.ParticipantIdentity identity = new io.rankpeek.model.GameDetail.ParticipantIdentity();
        identity.setParticipantId(1);
        detail.setParticipantIdentities(List.of(identity));
        return detail;
    }

    private MatchHistory match(long gameId, int queueId, String puuid, int championId) {
        MatchHistory match = new MatchHistory();
        match.setGameId(gameId);
        match.setQueueId(queueId);
        List<MatchHistory.Participant> participants = new java.util.ArrayList<>();
        List<MatchHistory.ParticipantIdentity> identities = new java.util.ArrayList<>();
        for (int participantId = 1; participantId <= 10; participantId++) {
            MatchHistory.Participant participant = new MatchHistory.Participant();
            participant.setParticipantId(participantId);
            participant.setChampionId(participantId == 1 ? championId : 100 + participantId);
            MatchHistory.Stats stats = new MatchHistory.Stats();
            stats.setWin(participantId <= 5);
            stats.setKills(participantId);
            stats.setDeaths(2);
            stats.setAssists(3);
            participant.setStats(stats);
            participants.add(participant);

            MatchHistory.ParticipantIdentity identity = new MatchHistory.ParticipantIdentity();
            identity.setParticipantId(participantId);
            MatchHistory.Player player = new MatchHistory.Player();
            player.setPuuid(participantId == 1 ? puuid : "other-puuid-" + participantId);
            identity.setPlayer(player);
            identities.add(identity);
        }
        match.setParticipants(participants);
        match.setParticipantIdentities(identities);
        return match;
    }

    private MatchHistory nonRenderableCurrentOnlyMatch(long gameId, int queueId) {
        MatchHistory match = new MatchHistory();
        match.setGameId(gameId);
        match.setQueueId(queueId);

        MatchHistory.Participant participant = new MatchHistory.Participant();
        participant.setParticipantId(1);
        participant.setChampionId(11);
        MatchHistory.Stats stats = new MatchHistory.Stats();
        stats.setWin(true);
        stats.setKills(5);
        stats.setDeaths(1);
        stats.setAssists(7);
        participant.setStats(stats);
        match.setParticipants(List.of(participant));

        return match;
    }

    private MatchHistory renderableCurrentOnlyMatch(long gameId, int queueId, String puuid, int championId) {
        MatchHistory match = new MatchHistory();
        match.setGameId(gameId);
        match.setQueueId(queueId);

        MatchHistory.Participant participant = new MatchHistory.Participant();
        participant.setParticipantId(1);
        participant.setChampionId(championId);
        MatchHistory.Stats stats = new MatchHistory.Stats();
        stats.setWin(true);
        stats.setKills(5);
        stats.setDeaths(1);
        stats.setAssists(7);
        participant.setStats(stats);
        match.setParticipants(List.of(participant));

        MatchHistory.ParticipantIdentity identity = new MatchHistory.ParticipantIdentity();
        identity.setParticipantId(1);
        MatchHistory.Player player = new MatchHistory.Player();
        player.setPuuid(puuid);
        identity.setPlayer(player);
        match.setParticipantIdentities(List.of(identity));

        return match;
    }

    private Rank rankWithGames() {
        Rank rank = new Rank();
        Rank.QueueMap queueMap = new Rank.QueueMap();
        Rank.QueueInfo solo = new Rank.QueueInfo();
        solo.setWins(6);
        solo.setLosses(4);
        queueMap.setRankedSolo5x5(solo);
        rank.setQueueMap(queueMap);
        return rank;
    }

    private MatchHistoryService sourceAwareService() {
        when(matchHistoryProvider.source()).thenReturn(MatchHistorySource.LCU);
        when(sgpMatchHistoryProvider.source()).thenReturn(MatchHistorySource.SGP);
        MatchHistoryService service = new MatchHistoryService(List.of(matchHistoryProvider, sgpMatchHistoryProvider));
        service.init();
        return service;
    }

    private MatchHistoryService sourceAwareServiceWithCacheRepository() {
        when(matchHistoryProvider.source()).thenReturn(MatchHistorySource.LCU);
        when(sgpMatchHistoryProvider.source()).thenReturn(MatchHistorySource.SGP);
        MatchHistoryService service = new MatchHistoryService(
                List.of(matchHistoryProvider, sgpMatchHistoryProvider),
                cacheRepository
        );
        service.init();
        return service;
    }

    private MatchHistoryQueryOptions options(MatchHistorySource source, boolean forceRefresh) {
        return options(source, forceRefresh, null);
    }

    private MatchHistoryQueryOptions options(MatchHistorySource source, boolean forceRefresh, String sgpServerId) {
        return new MatchHistoryQueryOptions(
                0,
                99,
                null,
                null,
                50,
                forceRefresh,
                source,
                sgpServerId,
                null
        );
    }

    private MatchHistoryQueryOptions pageOptions(MatchHistorySource source, boolean forceRefresh) {
        return pageOptions(source, forceRefresh, 200);
    }

    private MatchHistoryQueryOptions pageOptions(MatchHistorySource source, boolean forceRefresh, int limit) {
        return new MatchHistoryQueryOptions(
                0,
                limit - 1,
                null,
                null,
                limit,
                forceRefresh,
                source,
                null,
                null
        );
    }

    private MatchHistoryQueryOptions limitOptions(MatchHistorySource source, int limit) {
        return new MatchHistoryQueryOptions(
                0,
                limit - 1,
                null,
                null,
                limit,
                false,
                source,
                null,
                null
        );
    }

    private static final class ManualExecutorService extends AbstractExecutorService {
        private final List<Runnable> tasks = new ArrayList<>();
        private boolean shutdown;

        @Override
        public void shutdown() {
            shutdown = true;
        }

        @Override
        public List<Runnable> shutdownNow() {
            shutdown = true;
            List<Runnable> queued = new ArrayList<>(tasks);
            tasks.clear();
            return queued;
        }

        @Override
        public boolean isShutdown() {
            return shutdown;
        }

        @Override
        public boolean isTerminated() {
            return shutdown && tasks.isEmpty();
        }

        @Override
        public boolean awaitTermination(long timeout, TimeUnit unit) {
            return isTerminated();
        }

        @Override
        public void execute(Runnable command) {
            tasks.add(command);
        }

        private int queuedTaskCount() {
            return tasks.size();
        }

        private void runQueuedTasks() {
            List<Runnable> queued = new ArrayList<>(tasks);
            tasks.clear();
            queued.forEach(Runnable::run);
        }
    }
}
