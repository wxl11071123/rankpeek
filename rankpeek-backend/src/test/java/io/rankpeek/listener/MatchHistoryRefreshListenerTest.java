package io.rankpeek.listener;

import io.rankpeek.event.GamePhaseChangedEvent;
import io.rankpeek.model.Summoner;
import io.rankpeek.service.MatchHistoryRefreshService;
import io.rankpeek.service.SummonerService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MatchHistoryRefreshListenerTest {

    @Mock
    private MatchHistoryRefreshService refreshService;
    @Mock
    private SummonerService summonerService;

    private MatchHistoryRefreshListener listener;

    @BeforeEach
    void setUp() {
        listener = new MatchHistoryRefreshListener(refreshService, summonerService);
    }

    @Test
    void onGamePhaseChanged_triggersRefreshWhenGameEnds() {
        Summoner summoner = new Summoner();
        summoner.setPuuid("current-puuid");
        when(summonerService.getMySummoner()).thenReturn(summoner);

        listener.onGamePhaseChanged(new GamePhaseChangedEvent(this, "InProgress", "Lobby"));

        verify(refreshService).refreshAfterGameEnd("current-puuid");
    }

    @Test
    void onGamePhaseChanged_ignoresNonEndTransitions() {
        listener.onGamePhaseChanged(new GamePhaseChangedEvent(this, "Lobby", "Matchmaking"));

        verify(refreshService, never()).refreshAfterGameEnd("current-puuid");
    }

    @Test
    void onGamePhaseChanged_ignoresNullTransitions() {
        listener.onGamePhaseChanged(new GamePhaseChangedEvent(this, null, null));

        verify(refreshService, never()).refreshAfterGameEnd("current-puuid");
    }

    @Test
    void onGamePhaseChanged_swallowsSummonerLookupFailures() {
        when(summonerService.getMySummoner()).thenThrow(new RuntimeException("LCU offline"));

        listener.onGamePhaseChanged(new GamePhaseChangedEvent(this, "PreEndOfGame", "EndOfGame"));

        verify(refreshService, never()).refreshAfterGameEnd("current-puuid");
    }
}
