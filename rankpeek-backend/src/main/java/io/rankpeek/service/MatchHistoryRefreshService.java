package io.rankpeek.service;

import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Slf4j
@Service
public class MatchHistoryRefreshService {

    private static final List<Long> REFRESH_DELAY_SECONDS = List.of(5L, 20L, 60L);
    private static final long DEDUPE_WINDOW_MILLIS = TimeUnit.SECONDS.toMillis(60);

    private final MatchHistoryService matchHistoryService;
    private final RankService rankService;
    private final CacheUpdateNotificationService cacheUpdateNotificationService;
    private final ScheduledExecutorService scheduler;

    private final Set<String> recentSessionPuuids = ConcurrentHashMap.newKeySet();
    private final Map<String, Long> refreshTaskSubmittedAt = new ConcurrentHashMap<>();

    @Autowired
    public MatchHistoryRefreshService(MatchHistoryService matchHistoryService,
                                      RankService rankService,
                                      CacheUpdateNotificationService cacheUpdateNotificationService) {
        this(matchHistoryService, rankService, cacheUpdateNotificationService, Executors.newScheduledThreadPool(2, runnable -> {
            Thread thread = new Thread(runnable, "match-history-refresh");
            thread.setDaemon(true);
            return thread;
        }));
    }

    MatchHistoryRefreshService(
            MatchHistoryService matchHistoryService,
            RankService rankService,
            CacheUpdateNotificationService cacheUpdateNotificationService,
            ScheduledExecutorService scheduler) {
        this.matchHistoryService = matchHistoryService;
        this.rankService = rankService;
        this.cacheUpdateNotificationService = cacheUpdateNotificationService;
        this.scheduler = scheduler;
    }

    public void rememberSessionPuuids(Collection<String> puuids) {
        if (puuids == null || puuids.isEmpty()) {
            return;
        }

        int beforeSize = recentSessionPuuids.size();
        puuids.stream()
                .filter(this::isValidPuuid)
                .forEach(recentSessionPuuids::add);
        int added = Math.max(0, recentSessionPuuids.size() - beforeSize);
        if (added > 0) {
            log.debug("Remembered session PUUIDs: added={}, total={}", added, recentSessionPuuids.size());
        }
    }

    public void refreshAfterGameEnd(String currentPuuid) {
        Set<String> candidates = new LinkedHashSet<>(recentSessionPuuids);
        if (isValidPuuid(currentPuuid)) {
            candidates.add(currentPuuid);
        }

        if (candidates.isEmpty()) {
            log.debug("Skipping match history refresh after game end because no valid PUUIDs were recorded");
            clearRecentSessionPuuids();
            return;
        }

        candidates.forEach(this::invalidatePlayerCaches);

        long now = System.currentTimeMillis();
        cleanupSubmittedAt(now);
        Set<String> refreshTargets = candidates.stream()
                .filter(puuid -> markRefreshTaskSubmitted(puuid, now))
                .collect(Collectors.toCollection(LinkedHashSet::new));

        if (refreshTargets.isEmpty()) {
            log.debug("Skipping duplicate match history refresh task group: candidates={}", candidates.size());
            clearRecentSessionPuuids();
            return;
        }

        log.info("Submitted match history refresh tasks after game end: players={}", refreshTargets.size());
        for (Long delaySeconds : REFRESH_DELAY_SECONDS) {
            scheduleDelayedRefresh(delaySeconds, refreshTargets);
        }
        clearRecentSessionPuuids();
    }

    public void invalidatePlayerCaches(String puuid) {
        if (!isValidPuuid(puuid)) {
            return;
        }

        try {
            matchHistoryService.refreshCache(puuid);
            rankService.refreshCache(puuid);
        } catch (Exception e) {
            log.warn("Failed to invalidate player caches: puuid={}, error={}", puuidPrefix(puuid), e.getMessage());
        }
    }

    public void clearRecentSessionPuuids() {
        recentSessionPuuids.clear();
    }

    private void scheduleDelayedRefresh(long delaySeconds, Set<String> refreshTargets) {
        List<String> targetsSnapshot = new ArrayList<>(refreshTargets);
        scheduler.schedule(
                () -> runDelayedRefresh(delaySeconds, targetsSnapshot),
                delaySeconds,
                TimeUnit.SECONDS
        );
    }

    private void runDelayedRefresh(long delaySeconds, List<String> refreshTargets) {
        log.info("Starting delayed match history refresh: delaySeconds={}, players={}",
                delaySeconds, refreshTargets.size());

        for (String puuid : refreshTargets) {
            refreshPlayer(puuid);
        }
    }

    private void refreshPlayer(String puuid) {
        try {
            matchHistoryService.refreshCache(puuid);
            rankService.refreshCache(puuid);
            matchHistoryService.getMatchHistoryFetchResult(puuid, true);
            cacheUpdateNotificationService.publishPlayerCacheUpdated(
                    puuid,
                    "GameEndDelayedRefresh",
                    List.of("matchHistory")
            );
        } catch (Exception e) {
            log.warn("Delayed match history refresh failed: puuid={}, error={}", puuidPrefix(puuid), e.getMessage());
        }
    }

    private boolean markRefreshTaskSubmitted(String puuid, long now) {
        Long submittedAt = refreshTaskSubmittedAt.get(puuid);
        if (submittedAt != null && now - submittedAt < DEDUPE_WINDOW_MILLIS) {
            log.debug("Skipping duplicate delayed refresh task: puuid={}, ageMillis={}",
                    puuidPrefix(puuid), now - submittedAt);
            return false;
        }

        refreshTaskSubmittedAt.put(puuid, now);
        return true;
    }

    private void cleanupSubmittedAt(long now) {
        refreshTaskSubmittedAt.entrySet().removeIf(entry -> now - entry.getValue() > DEDUPE_WINDOW_MILLIS * 10);
    }

    private boolean isValidPuuid(String puuid) {
        return puuid != null && !puuid.isBlank();
    }

    private String puuidPrefix(String puuid) {
        if (!isValidPuuid(puuid)) {
            return "null";
        }
        return puuid.substring(0, Math.min(8, puuid.length()));
    }

    @PreDestroy
    public void destroy() {
        scheduler.shutdown();
        try {
            if (!scheduler.awaitTermination(5, TimeUnit.SECONDS)) {
                scheduler.shutdownNow();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            scheduler.shutdownNow();
        }
    }
}
