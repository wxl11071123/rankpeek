package io.rankpeek.listener;

import io.rankpeek.event.GamePhaseChangedEvent;
import io.rankpeek.model.GameState;
import io.rankpeek.service.SummonerService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class GameStateListenerTest {

    @Test
    void gamePhaseChangedPushesGameStatePayloadWithPhase() {
        SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
        SummonerService summonerService = mock(SummonerService.class);
        GameStateListener listener = new GameStateListener(messagingTemplate, summonerService);

        listener.onGamePhaseChanged(new GamePhaseChangedEvent(this, "Lobby", "ChampSelect"));

        ArgumentCaptor<GameState> payloadCaptor = ArgumentCaptor.forClass(GameState.class);
        verify(messagingTemplate).convertAndSend(eq("/topic/game-state"), payloadCaptor.capture());
        assertThat(payloadCaptor.getValue().isConnected()).isTrue();
        assertThat(payloadCaptor.getValue().getPhase()).isEqualTo("ChampSelect");
    }
}
