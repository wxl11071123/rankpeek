package io.rankpeek.service;

import io.rankpeek.model.CacheUpdateEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.List;
import java.util.Objects;

@Service
@RequiredArgsConstructor
@Slf4j
public class CacheUpdateNotificationService {

    private static final String CACHE_UPDATES_TOPIC = "/topic/cache-updates";
    private static final String PLAYER_CACHE_UPDATED = "PLAYER_CACHE_UPDATED";

    private final SimpMessagingTemplate messagingTemplate;

    public void publishPlayerCacheUpdated(String puuid, String reason, Collection<String> updatedScopes) {
        if (puuid == null || puuid.isBlank() || updatedScopes == null || updatedScopes.isEmpty()) {
            return;
        }

        List<String> scopes = updatedScopes.stream()
                .filter(Objects::nonNull)
                .filter(scope -> !scope.isBlank())
                .toList();
        if (scopes.isEmpty()) {
            return;
        }

        CacheUpdateEvent event = CacheUpdateEvent.builder()
                .type(PLAYER_CACHE_UPDATED)
                .puuid(puuid)
                .reason(reason)
                .updatedScopes(scopes)
                .timestamp(System.currentTimeMillis())
                .build();

        try {
            messagingTemplate.convertAndSend(CACHE_UPDATES_TOPIC, event);
        } catch (Exception e) {
            log.warn("Failed to publish cache update event: puuid={}, reason={}, scopes={}, error={}",
                    puuidPrefix(puuid), reason, scopes, e.getMessage());
        }
    }

    private String puuidPrefix(String puuid) {
        if (puuid == null || puuid.isBlank()) {
            return "null";
        }
        return puuid.substring(0, Math.min(8, puuid.length()));
    }
}
