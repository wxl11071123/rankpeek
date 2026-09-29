package io.rankpeek.cache;

import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class LocalCacheRecoveryCoordinatorTest {

    @Test
    void recoverIfCorrupt_sharesInProgressGateAcrossStatusSchemaAndRepositoryTriggers() throws Exception {
        RuntimeException corruption = new RuntimeException("File corrupted while reading record");
        LocalCacheRecoveryService recoveryService = mock(LocalCacheRecoveryService.class);
        CountDownLatch recoveryStarted = new CountDownLatch(1);
        CountDownLatch releaseRecovery = new CountDownLatch(1);
        when(recoveryService.isRecoverableCorruption(corruption)).thenReturn(true);
        when(recoveryService.rootCauseSummary(corruption)).thenReturn("RuntimeException: corrupt");
        when(recoveryService.quarantineIfRecoverable(corruption)).thenAnswer(invocation -> {
            recoveryStarted.countDown();
            assertThat(releaseRecovery.await(5, TimeUnit.SECONDS)).isTrue();
            return new LocalCacheRecoveryService.RecoveryResult(
                    true,
                    true,
                    Path.of("quarantine"),
                    List.of(),
                    "quarantined",
                    null
            );
        });
        LocalCacheRecoveryCoordinator coordinator =
                new LocalCacheRecoveryCoordinator(recoveryService, fixedClock());
        var executor = Executors.newFixedThreadPool(3);
        try {
            var statusRecovery = executor.submit(() ->
                    coordinator.recoverIfCorrupt(corruption, "status.getStatus"));
            assertThat(recoveryStarted.await(5, TimeUnit.SECONDS)).isTrue();
            var schemaRecovery = executor.submit(() ->
                    coordinator.recoverIfCorrupt(corruption, "schema.initialize", false));
            var repositoryRecovery = executor.submit(() ->
                    coordinator.recoverIfCorrupt(corruption, "repository.findRecentMatchHistory"));

            releaseRecovery.countDown();

            List<LocalCacheRecoveryCoordinator.CoordinatedRecoveryResult> results = List.of(
                    statusRecovery.get(5, TimeUnit.SECONDS),
                    schemaRecovery.get(5, TimeUnit.SECONDS),
                    repositoryRecovery.get(5, TimeUnit.SECONDS)
            );

            assertThat(results).filteredOn(LocalCacheRecoveryCoordinator.CoordinatedRecoveryResult::recovered)
                    .hasSize(1);
            assertThat(results).filteredOn(LocalCacheRecoveryCoordinator.CoordinatedRecoveryResult::throttled)
                    .hasSize(2);
            verify(recoveryService, times(1)).quarantineIfRecoverable(corruption);
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void recoverIfCorrupt_doesNotThrottleImmediateRetryAfterFailedRecovery() {
        RuntimeException corruption = new RuntimeException("File corrupted while reading record");
        LocalCacheRecoveryService recoveryService = mock(LocalCacheRecoveryService.class);
        when(recoveryService.isRecoverableCorruption(corruption)).thenReturn(true);
        when(recoveryService.rootCauseSummary(corruption)).thenReturn("RuntimeException: corrupt");
        when(recoveryService.quarantineIfRecoverable(corruption))
                .thenReturn(new LocalCacheRecoveryService.RecoveryResult(
                        true,
                        false,
                        null,
                        List.of(),
                        "failed to quarantine corrupt local H2 cache files",
                        new RuntimeException("move failed")
                ))
                .thenReturn(new LocalCacheRecoveryService.RecoveryResult(
                        true,
                        true,
                        Path.of("quarantine"),
                        List.of(),
                        "quarantined",
                        null
                ));
        LocalCacheRecoveryCoordinator coordinator =
                new LocalCacheRecoveryCoordinator(recoveryService, fixedClock());

        LocalCacheRecoveryCoordinator.CoordinatedRecoveryResult firstRecovery =
                coordinator.recoverIfCorrupt(corruption, "status.getStatus");
        LocalCacheRecoveryCoordinator.CoordinatedRecoveryResult retryRecovery =
                coordinator.recoverIfCorrupt(corruption, "manual-cache-repair");

        assertThat(firstRecovery.throttled()).isFalse();
        assertThat(firstRecovery.recovered()).isFalse();
        assertThat(retryRecovery.throttled()).isFalse();
        assertThat(retryRecovery.recovered()).isTrue();
        verify(recoveryService, times(2)).quarantineIfRecoverable(corruption);
    }

    private Clock fixedClock() {
        return Clock.fixed(Instant.parse("2026-05-01T01:02:03Z"), ZoneOffset.UTC);
    }
}
