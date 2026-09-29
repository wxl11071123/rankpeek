package io.rankpeek.cache;

import io.rankpeek.config.LocalDataPathService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.EOFException;
import java.nio.file.AccessDeniedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.SQLTransientConnectionException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

class LocalCacheRecoveryServiceTest {

    @TempDir
    private Path tempDir;

    @Test
    void isRecoverableCorruption_recognizesH2MvStoreAndEofExceptionChain() {
        LocalCacheRecoveryService service = new LocalCacheRecoveryService(pathService(tempDir.resolve("rankpeek-cache")), fixedClock());
        Throwable corruption = new RuntimeException(
                "org.h2.jdbc.JdbcSQLNonTransientException: General error",
                new RuntimeException(
                        "org.h2.mvstore.MVStoreException: File corrupted while reading record",
                        new EOFException("java.io.EOFException")
                )
        );

        assertThat(service.isRecoverableCorruption(corruption)).isTrue();
        assertThat(service.isRecoverableCorruption(new RuntimeException("File version error"))).isTrue();
        assertThat(service.isRecoverableCorruption(new RuntimeException("Store header is corrupt"))).isTrue();
        assertThat(service.isRecoverableCorruption(new RuntimeException("File corrupted in chunk 4622"))).isTrue();
        assertThat(service.isRecoverableCorruption(new RuntimeException(
                "The write format 3 is larger than the supported format 2"))).isTrue();
        assertThat(service.isRecoverableCorruption(new RuntimeException(
                "org.h2.jdbc.JdbcSQLNonTransientConnectionException: The database has been closed [90098-232]"
        ))).isTrue();
        assertThat(service.isRecoverableCorruption(new RuntimeException(
                "org.h2.mvstore.MVStoreException: java.lang.OutOfMemoryError: Capacity: 7077888 [2.3.232/3]",
                new OutOfMemoryError("Java heap space")
        ))).isTrue();
    }

    @Test
    void isRecoverableCorruption_doesNotTreatTimeoutLockOrAccessDeniedAsCorruption() {
        LocalCacheRecoveryService service = new LocalCacheRecoveryService(pathService(tempDir.resolve("rankpeek-cache")), fixedClock());

        assertThat(service.isRecoverableCorruption(
                new SQLTransientConnectionException("Connection is not available, request timed out after 1000ms")
        )).isFalse();
        assertThat(service.isRecoverableCorruption(
                new RuntimeException("Database may be already in use: Locked by another process")
        )).isFalse();
        assertThat(service.isRecoverableCorruption(
                new AccessDeniedException(tempDir.resolve("rankpeek-cache.mv.db").toString())
        )).isFalse();
    }

    @Test
    void quarantineIfRecoverable_movesOnlyLocalH2CacheFilesWithoutDeletingThem() throws Exception {
        Path databasePath = tempDir.resolve("rankpeek-cache");
        Files.write(databasePath.resolveSibling("rankpeek-cache.mv.db"), new byte[]{1, 2, 3});
        Files.writeString(databasePath.resolveSibling("rankpeek-cache.trace.db"), "trace");
        Files.writeString(databasePath.resolveSibling("rankpeek-cache.lock.db"), "lock");
        Files.writeString(databasePath.resolveSibling("rankpeek-user-store.json"), "keep");
        LocalCacheRecoveryService service = new LocalCacheRecoveryService(pathService(databasePath), fixedClock());

        LocalCacheRecoveryService.RecoveryResult result = service.quarantineIfRecoverable(
                new RuntimeException("File corrupted while reading record")
        );

        Path quarantineDirectory = tempDir.resolve("rankpeek-cache.corrupt.20260501-010203");
        assertThat(result.attempted()).isTrue();
        assertThat(result.recovered()).isTrue();
        assertThat(result.quarantineDirectory()).isEqualTo(quarantineDirectory);
        assertThat(result.quarantinedFiles())
                .extracting(path -> path.getFileName().toString())
                .containsExactlyInAnyOrder(
                        "rankpeek-cache.mv.db",
                        "rankpeek-cache.trace.db",
                        "rankpeek-cache.lock.db"
                );
        assertThat(Files.exists(databasePath.resolveSibling("rankpeek-cache.mv.db"))).isFalse();
        assertThat(Files.readAllBytes(quarantineDirectory.resolve("rankpeek-cache.mv.db"))).containsExactly(1, 2, 3);
        assertThat(Files.readString(quarantineDirectory.resolve("rankpeek-cache.trace.db"))).isEqualTo("trace");
        assertThat(Files.readString(quarantineDirectory.resolve("rankpeek-cache.lock.db"))).isEqualTo("lock");
        assertThat(Files.readString(databasePath.resolveSibling("rankpeek-user-store.json"))).isEqualTo("keep");
    }

    @Test
    void quarantineIfRecoverable_doesNotMoveFilesForNonCorruptionError() throws Exception {
        Path databasePath = tempDir.resolve("rankpeek-cache");
        Path h2File = databasePath.resolveSibling("rankpeek-cache.mv.db");
        Files.writeString(h2File, "keep");
        LocalCacheRecoveryService service = new LocalCacheRecoveryService(pathService(databasePath), fixedClock());

        LocalCacheRecoveryService.RecoveryResult result = service.quarantineIfRecoverable(
                new SQLTransientConnectionException("Connection is not available, request timed out after 1000ms")
        );

        assertThat(result.attempted()).isFalse();
        assertThat(result.recovered()).isFalse();
        assertThat(Files.readString(h2File)).isEqualTo("keep");
        try (var paths = Files.list(tempDir)) {
            assertThat(paths)
                    .noneMatch(path -> path.getFileName().toString().contains(".corrupt."));
        }
    }

    @Test
    void quarantineIfRecoverable_doesNotMoveFilesForLockedDatabase() throws Exception {
        Path databasePath = tempDir.resolve("rankpeek-cache");
        Path h2File = databasePath.resolveSibling("rankpeek-cache.mv.db");
        Files.writeString(h2File, "keep");
        LocalCacheRecoveryService service = new LocalCacheRecoveryService(pathService(databasePath), fixedClock());

        LocalCacheRecoveryService.RecoveryResult result = service.quarantineIfRecoverable(
                new RuntimeException("Database may be already in use: Locked by another process")
        );

        assertThat(result.attempted()).isFalse();
        assertThat(result.recovered()).isFalse();
        assertThat(service.isLockedOrUnavailable(
                new RuntimeException("Database may be already in use: Locked by another process")
        )).isTrue();
        assertThat(Files.readString(h2File)).isEqualTo("keep");
        try (var paths = Files.list(tempDir)) {
            assertThat(paths)
                    .noneMatch(path -> path.getFileName().toString().contains(".corrupt."));
        }
    }

    private LocalDataPathService pathService(Path databasePath) {
        return new LocalDataPathService() {
            @Override
            public Path getCacheDatabasePath() {
                return databasePath;
            }
        };
    }

    private Clock fixedClock() {
        return Clock.fixed(Instant.parse("2026-05-01T01:02:03Z"), ZoneOffset.UTC);
    }
}
