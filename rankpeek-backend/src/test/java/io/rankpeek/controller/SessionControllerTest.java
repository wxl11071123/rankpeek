package io.rankpeek.controller;

import io.rankpeek.model.ApiResponse;
import io.rankpeek.model.GameState;
import io.rankpeek.service.ChampionSelectService;
import io.rankpeek.service.GameFlowService;
import io.rankpeek.service.LcuHttpClient;
import io.rankpeek.service.SessionAnalysisService;
import io.rankpeek.service.SummonerService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SessionControllerTest {

    @Mock
    private LcuHttpClient lcuHttpClient;
    @Mock
    private GameFlowService gameFlowService;
    @Mock
    private ChampionSelectService championSelectService;
    @Mock
    private SessionAnalysisService sessionAnalysisService;
    @Mock
    private SummonerService summonerService;

    private SessionController controller;

    @BeforeEach
    void setUp() {
        controller = new SessionController(
                lcuHttpClient,
                gameFlowService,
                championSelectService,
                sessionAnalysisService,
                summonerService
        );
    }

    @Test
    void getGameState_keepsLcuConnectedWhenSummonerLookupFails() {
        when(lcuHttpClient.isConnected()).thenReturn(true);
        when(gameFlowService.getGamePhase()).thenReturn("Lobby");
        when(summonerService.getMySummoner()).thenThrow(new RuntimeException("summoner unavailable"));

        ApiResponse<GameState> response = controller.getGameState();

        assertThat(response.getData().isConnected()).isTrue();
        assertThat(response.getData().getPhase()).isEqualTo("Lobby");
        assertThat(response.getData().getSummoner()).isNull();
    }

    @Test
    void getSessionDataPassesForceRefreshToAnalysisService() {
        controller.getSessionData(null, true);

        verify(sessionAnalysisService).getSessionData(null, true);
    }

}
