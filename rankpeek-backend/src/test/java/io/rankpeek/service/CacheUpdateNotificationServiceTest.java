package io.rankpeek.service;

import io.rankpeek.model.CacheUpdateEvent;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class CacheUpdateNotificationServiceTest {

    private SimpMessagingTemplate messagingTemplate;
    private CacheUpdateNotificationService service;

    @BeforeEach
    void setUp() {
        messagingTemplate = mock(SimpMessagingTemplate.class);
        service = new CacheUpdateNotificationService(messagingTemplate);
    }

    @Test
    void publishPlayerCacheUpdated_sendsEventToCacheUpdatesTopic() {
        service.publishPlayerCacheUpdated("player-puuid", "Lobby", List.of("summoner", "rank"));

        ArgumentCaptor<CacheUpdateEvent> eventCaptor = ArgumentCaptor.forClass(CacheUpdateEvent.class);
        verify(messagingTemplate).convertAndSend(eq("/topic/cache-updates"), eventCaptor.capture());
        CacheUpdateEvent event = eventCaptor.getValue();
        assertThat(event.getType()).isEqualTo("PLAYER_CACHE_UPDATED");
        assertThat(event.getPuuid()).isEqualTo("player-puuid");
        assertThat(event.getReason()).isEqualTo("Lobby");
        assertThat(event.getUpdatedScopes()).containsExactly("summoner", "rank");
        assertThat(event.getTimestamp()).isPositive();
    }

    @Test
    void publishPlayerCacheUpdated_skipsBlankPuuid() {
        service.publishPlayerCacheUpdated(" ", "Lobby", List.of("summoner"));

        verify(messagingTemplate, never()).convertAndSend(anyString(), any(Object.class));
    }

    @Test
    void publishPlayerCacheUpdated_skipsEmptyScopes() {
        service.publishPlayerCacheUpdated("player-puuid", "Lobby", List.of());

        verify(messagingTemplate, never()).convertAndSend(anyString(), any(Object.class));
    }

    @Test
    void publishPlayerCacheUpdated_swallowMessagingException() {
        doThrow(new RuntimeException("websocket down"))
                .when(messagingTemplate)
                .convertAndSend(eq("/topic/cache-updates"), any(CacheUpdateEvent.class));

        assertThatCode(() -> service.publishPlayerCacheUpdated(
                "player-puuid",
                "Lobby",
                List.of("matchHistory")
        )).doesNotThrowAnyException();
    }
}
