package io.rankpeek.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.concurrent.Executor;
import java.util.concurrent.Semaphore;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class MatchHistoryPrewarmServiceTest {

    @Mock
    private SummonerService summonerService;
    @Mock
    private RankService rankService;
    @Mock
    private MatchHistoryService matchHistoryService;
    @Mock
    private CacheUpdateNotificationService cacheUpdateNotificationService;

    private MatchHistoryPrewarmService service;

    @BeforeEach
    void setUp() {
        Executor directExecutor = Runnable::run;
        service = new MatchHistoryPrewarmService(
                summonerService,
                rankService,
                matchHistoryService,
                cacheUpdateNotificationService,
                directExecutor
        );
    }

    @Test
    void prewarmPlayers_prewarmsUniquePuuidsOnly() {
        service.prewarmPlayers(List.of("player-a", "player-a", "player-b"), "test");

        verify(summonerService, times(1)).getSummonerByPuuid("player-a");
        verify(rankService, times(1)).getRankByPuuid("player-a");
        verify(matchHistoryService, times(1)).getMatchHistoryFetchResult("player-a", false);
        verify(summonerService, times(1)).getSummonerByPuuid("player-b");
        verify(rankService, times(1)).getRankByPuuid("player-b");
        verify(matchHistoryService, times(1)).getMatchHistoryFetchResult("player-b", false);
    }

    @Test
    void prewarmPlayers_skipsDuplicateSubmissionsWithinDedupeWindow() {
        service.prewarmPlayers(List.of("player-a"), "first");
        service.prewarmPlayers(List.of("player-a"), "second");

        verify(summonerService, times(1)).getSummonerByPuuid("player-a");
        verify(rankService, times(1)).getRankByPuuid("player-a");
        verify(matchHistoryService, times(1)).getMatchHistoryFetchResult("player-a", false);
    }

    @Test
    void prewarmPlayers_singlePlayerFailureDoesNotStopOtherPlayers() {
        doThrow(new RuntimeException("summoner failed"))
                .when(summonerService)
                .getSummonerByPuuid("player-a");

        service.prewarmPlayers(List.of("player-a", "player-b"), "test");

        verify(summonerService).getSummonerByPuuid("player-a");
        verify(summonerService).getSummonerByPuuid("player-b");
        verify(rankService).getRankByPuuid("player-b");
        verify(matchHistoryService).getMatchHistoryFetchResult("player-b", false);
    }

    @Test
    void prewarmPlayers_semaphoreSkipDoesNotEnterDedupeWindow() throws Exception {
        Semaphore semaphore = prewarmSemaphore();
        semaphore.drainPermits();

        service.prewarmPlayers(List.of("player-a"), "busy");
        semaphore.release();
        service.prewarmPlayers(List.of("player-a"), "retry");

        verify(summonerService, times(1)).getSummonerByPuuid("player-a");
        verify(rankService, times(1)).getRankByPuuid("player-a");
        verify(matchHistoryService, times(1)).getMatchHistoryFetchResult("player-a", false);
    }

    @Test
    void prewarmPlayers_summonerFailureStillPrewarmsRankAndMatchHistory() {
        doThrow(new RuntimeException("summoner failed"))
                .when(summonerService)
                .getSummonerByPuuid("player-a");

        service.prewarmPlayers(List.of("player-a"), "test");

        verify(summonerService).getSummonerByPuuid("player-a");
        verify(rankService).getRankByPuuid("player-a");
        verify(matchHistoryService).getMatchHistoryFetchResult("player-a", false);
    }

    @Test
    void prewarmPlayers_publishesCacheUpdateWhenPrewarmSucceeds() {
        service.prewarmPlayers(List.of("player-a"), "Lobby");

        verify(cacheUpdateNotificationService).publishPlayerCacheUpdated(
                "player-a",
                "Lobby",
                List.of("summoner", "rank", "matchHistory")
        );
    }

    @Test
    void prewarmPlayers_publishesOnlySuccessfulScopes() {
        doThrow(new RuntimeException("summoner failed"))
                .when(summonerService)
                .getSummonerByPuuid("player-a");

        service.prewarmPlayers(List.of("player-a"), "Lobby");

        verify(cacheUpdateNotificationService).publishPlayerCacheUpdated(
                "player-a",
                "Lobby",
                List.of("rank", "matchHistory")
        );
    }

    @Test
    void prewarmPlayers_doesNotPublishWhenAllScopesFail() {
        doThrow(new RuntimeException("summoner failed"))
                .when(summonerService)
                .getSummonerByPuuid("player-a");
        doThrow(new RuntimeException("rank failed"))
                .when(rankService)
                .getRankByPuuid("player-a");
        doThrow(new RuntimeException("history failed"))
                .when(matchHistoryService)
                .getMatchHistoryFetchResult("player-a", false);

        service.prewarmPlayers(List.of("player-a"), "Lobby");

        verify(cacheUpdateNotificationService, never()).publishPlayerCacheUpdated(anyString(), anyString(), any());
    }

    @Test
    void prewarmPlayers_doesNotForceRefreshMatchHistory() {
        service.prewarmPlayers(List.of("player-a"), "test");

        verify(matchHistoryService).getMatchHistoryFetchResult("player-a", false);
        verify(matchHistoryService, never()).getMatchHistoryFetchResult("player-a", true);
    }

    private Semaphore prewarmSemaphore() throws Exception {
        var field = MatchHistoryPrewarmService.class.getDeclaredField("prewarmSemaphore");
        field.setAccessible(true);
        return (Semaphore) field.get(service);
    }
}
