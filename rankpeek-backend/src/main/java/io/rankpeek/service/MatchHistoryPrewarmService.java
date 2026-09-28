package io.rankpeek.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

@Slf4j
@Service
public class MatchHistoryPrewarmService {

    private static final long PREWARM_DEDUPE_MILLIS = TimeUnit.MINUTES.toMillis(2);
    private static final int MAX_CONCURRENT_PREWARMS = 4;

    private final SummonerService summonerService;
    private final RankService rankService;
    private final MatchHistoryService matchHistoryService;
    private final CacheUpdateNotificationService cacheUpdateNotificationService;
    private final Executor dataLoaderExecutor;
    private final Map<String, Long> prewarmSubmittedAt = new ConcurrentHashMap<>();
    private final Semaphore prewarmSemaphore = new Semaphore(MAX_CONCURRENT_PREWARMS);

    @Autowired
    MatchHistoryPrewarmService(SummonerService summonerService,
                               RankService rankService,
                               MatchHistoryService matchHistoryService,
                               CacheUpdateNotificationService cacheUpdateNotificationService,
                               @Qualifier("dataLoaderExecutor") Executor dataLoaderExecutor) {
        this.summonerService = summonerService;
        this.rankService = rankService;
        this.matchHistoryService = matchHistoryService;
        this.cacheUpdateNotificationService = cacheUpdateNotificationService;
        this.dataLoaderExecutor = dataLoaderExecutor;
    }

    public void prewarmPlayers(Collection<String> puuids, String reason) {
        Set<String> normalizedPuuids = normalizePuuids(puuids);
        if (normalizedPuuids.isEmpty()) {
            return;
        }

        for (String puuid : normalizedPuuids) {
            try {
                dataLoaderExecutor.execute(() -> prewarmPlayer(puuid, reason));
            } catch (Exception e) {
                log.debug("Failed to submit match-history prewarm task: puuid={}, reason={}, error={}",
                        puuidPrefix(puuid), reason, e.getMessage());
            }
        }
    }

    private void prewarmPlayer(String puuid, String reason) {
        if (!prewarmSemaphore.tryAcquire()) {
            log.debug("Skipping match-history prewarm because concurrency limit was reached: puuid={}, reason={}",
                    puuidPrefix(puuid), reason);
            return;
        }

        try {
            if (!markSubmittedIfNeeded(puuid, System.currentTimeMillis())) {
                log.debug("Skipping duplicate match-history prewarm: puuid={}, reason={}", puuidPrefix(puuid), reason);
                return;
            }

            List<String> updatedScopes = new ArrayList<>();
            if (prewarmSummoner(puuid, reason)) {
                updatedScopes.add("summoner");
            }
            if (prewarmRank(puuid, reason)) {
                updatedScopes.add("rank");
            }
            if (prewarmMatchHistory(puuid, reason)) {
                updatedScopes.add("matchHistory");
            }
            if (!updatedScopes.isEmpty()) {
                publishCacheUpdate(puuid, reason, updatedScopes);
            }
            log.debug("Finished visible session player cache prewarm: puuid={}, reason={}", puuidPrefix(puuid), reason);
        } finally {
            prewarmSemaphore.release();
        }
    }

    private boolean prewarmSummoner(String puuid, String reason) {
        try {
            summonerService.getSummonerByPuuid(puuid);
            return true;
        } catch (Exception e) {
            log.debug("Failed to prewarm summoner cache: puuid={}, reason={}, error={}",
                    puuidPrefix(puuid), reason, e.getMessage());
            return false;
        }
    }

    private boolean prewarmRank(String puuid, String reason) {
        try {
            rankService.getRankByPuuid(puuid);
            return true;
        } catch (Exception e) {
            log.debug("Failed to prewarm rank cache: puuid={}, reason={}, error={}",
                    puuidPrefix(puuid), reason, e.getMessage());
            return false;
        }
    }

    private boolean prewarmMatchHistory(String puuid, String reason) {
        try {
            matchHistoryService.getMatchHistoryFetchResult(puuid, false);
            return true;
        } catch (Exception e) {
            log.debug("Failed to prewarm match history cache: puuid={}, reason={}, error={}",
                    puuidPrefix(puuid), reason, e.getMessage());
            return false;
        }
    }

    private void publishCacheUpdate(String puuid, String reason, List<String> updatedScopes) {
        try {
            cacheUpdateNotificationService.publishPlayerCacheUpdated(puuid, reason, updatedScopes);
        } catch (Exception e) {
            log.debug("Failed to publish prewarm cache update: puuid={}, reason={}, error={}",
                    puuidPrefix(puuid), reason, e.getMessage());
        }
    }

    private boolean markSubmittedIfNeeded(String puuid, long now) {
        AtomicBoolean shouldSubmit = new AtomicBoolean(false);
        prewarmSubmittedAt.compute(puuid, (key, previous) -> {
            if (previous == null || now - previous >= PREWARM_DEDUPE_MILLIS) {
                shouldSubmit.set(true);
                return now;
            }
            return previous;
        });
        return shouldSubmit.get();
    }

    private Set<String> normalizePuuids(Collection<String> puuids) {
        if (puuids == null || puuids.isEmpty()) {
            return Set.of();
        }

        Set<String> normalized = new LinkedHashSet<>();
        puuids.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(puuid -> !puuid.isBlank())
                .forEach(normalized::add);
        return normalized;
    }

    private String puuidPrefix(String puuid) {
        if (puuid == null || puuid.isBlank()) {
            return "null";
        }
        return puuid.substring(0, Math.min(8, puuid.length()));
    }
}
