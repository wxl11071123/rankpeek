package io.rankpeek.opgg;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;

@Component
public class OpggCacheCleanupScheduler {
    private final OpggCacheProperties properties;
    private final OpggChampionCacheRepository repository;
    private final Clock clock;

    @Autowired
    public OpggCacheCleanupScheduler(
            OpggCacheProperties properties,
            OpggChampionCacheRepository repository
    ) {
        this(properties, repository, Clock.systemUTC());
    }

    OpggCacheCleanupScheduler(
            OpggCacheProperties properties,
            OpggChampionCacheRepository repository,
            Clock clock
    ) {
        this.properties = properties;
        this.repository = repository;
        this.clock = clock;
    }

    @Scheduled(
            cron = "${rankpeek.opgg.cleanup-cron:0 20 4 * * *}",
            zone = "${rankpeek.opgg.cache-zone:Asia/Shanghai}"
    )
    public void runDailyCleanup() {
        if (!Boolean.TRUE.equals(properties.cleanupEnabled())) {
            return;
        }
        repository.deleteExpiredBefore(clock.instant());
    }
}
