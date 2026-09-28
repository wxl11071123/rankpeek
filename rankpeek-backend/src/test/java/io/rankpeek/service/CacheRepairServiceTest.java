package io.rankpeek.service;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import io.rankpeek.cache.LocalCacheRecoveryCoordinator;
import io.rankpeek.cache.LocalCacheRecoveryService;
import io.rankpeek.cache.LocalCacheSchemaInitializer;
import io.rankpeek.config.LocalDataPathService;
import io.rankpeek.model.CacheRepairResult;
import io.rankpeek.model.CacheStatus;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.SQLTransientConnectionException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class CacheRepairServiceTest {

    @TempDir
    private Path tempDir;

    @Test
    void repair_withoutConfirmDoesNotTouchDatabase() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        CacheRepairService service = new CacheRepairService(
                jdbcTemplate,
                pathService(tempDir.resolve("rankpeek-cache")),
                null,
                null
        );

        CacheRepairResult result = service.repair(false);

        assertThat(result.isSuccess()).isFalse();
        assertThat(result.isRepaired()).isFalse();
        assertThat(result.getHealth()).isEqualTo(CacheStatus.Health.DISABLED);
        assertThat(result.getMessage()).isEqualTo("confirm=true is required");
        verifyNoInteractions(jdbcTemplate);
    }

    @Test
    void repair_quarantinesRecoverableCorruptionAndLeavesUserStoreFilesInPlace() throws Exception {
        Path databasePath = tempDir.resolve("rankpeek-cache");
        Files.write(databasePath.resolveSibling("rankpeek-cache.mv.db"), new byte[]{9, 8, 7});
        Files.writeString(databasePath.resolveSibling("rankpeek-cache.trace.db"), "trace");
        Files.writeString(databasePath.resolveSibling("rankpeek-user-store.json"), "keep");

        HikariDataSource dataSource = createDataSource(databasePath);
        try {
            JdbcTemplate jdbcTemplate = new JdbcTemplate(dataSource);
            LocalDataPathService pathService = pathService(databasePath);
            LocalCacheRecoveryService recoveryService =
                    new LocalCacheRecoveryService(pathService, fixedClock(), dataSource);
            LocalCacheRecoveryCoordinator coordinator = new LocalCacheRecoveryCoordinator(recoveryService, fixedClock());
            LocalCacheSchemaInitializer initializer =
                    new LocalCacheSchemaInitializer(jdbcTemplate, recoveryService);
            CacheRepairService service = new CacheRepairService(jdbcTemplate, pathService, coordinator, initializer);

            CacheRepairResult result = service.repair(true);

            Path quarantineDirectory = tempDir.resolve("rankpeek-cache.corrupt.20260501-010203");
            assertThat(result.isSuccess()).isTrue();
            assertThat(result.isRepaired()).isTrue();
            assertThat(result.getHealth()).isEqualTo(CacheStatus.Health.RECOVERED);
            assertThat(result.getQuarantineDirectory()).isEqualTo(quarantineDirectory.toString());
            assertThat(result.getMovedFiles()).containsExactlyInAnyOrder(
                    "rankpeek-cache.mv.db",
                    "rankpeek-cache.trace.db"
            );
            assertThat(Files.readString(databasePath.resolveSibling("rankpeek-user-store.json"))).isEqualTo("keep");
            assertThat(Files.readAllBytes(quarantineDirectory.resolve("rankpeek-cache.mv.db")))
                    .containsExactly(9, 8, 7);
            assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM summoner_cache", Long.class)).isZero();
        } finally {
            dataSource.close();
        }
    }

    @Test
    void repair_quarantinesClosedH2DatabaseAsRecoverableCacheFailure() throws Exception {
        Path databasePath = tempDir.resolve("closed-rankpeek-cache");
        Files.writeString(databasePath.resolveSibling("closed-rankpeek-cache.mv.db"), "closed-cache");
        RuntimeException closed = new RuntimeException(
                "org.h2.jdbc.JdbcSQLNonTransientConnectionException: The database has been closed [90098-232]"
        );
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForObject("SELECT 1", Integer.class)).thenThrow(closed);
        LocalDataPathService pathService = pathService(databasePath);
        LocalCacheRecoveryService recoveryService = new LocalCacheRecoveryService(pathService, fixedClock());
        LocalCacheSchemaInitializer initializer = mock(LocalCacheSchemaInitializer.class);
        when(initializer.initializeSchemaIfPossible()).thenReturn(true);
        CacheRepairService service = new CacheRepairService(
                jdbcTemplate,
                pathService,
                new LocalCacheRecoveryCoordinator(recoveryService, fixedClock()),
                initializer
        );

        CacheRepairResult result = service.repair(true);

        Path quarantineDirectory = tempDir.resolve("closed-rankpeek-cache.corrupt.20260501-010203");
        assertThat(result.isSuccess()).isTrue();
        assertThat(result.isRepaired()).isTrue();
        assertThat(result.getHealth()).isEqualTo(CacheStatus.Health.RECOVERED);
        assertThat(result.getQuarantineDirectory()).isEqualTo(quarantineDirectory.toString());
        assertThat(result.getMovedFiles()).containsExactly("closed-rankpeek-cache.mv.db");
        assertThat(Files.exists(databasePath.resolveSibling("closed-rankpeek-cache.mv.db"))).isFalse();
        assertThat(Files.readString(quarantineDirectory.resolve("closed-rankpeek-cache.mv.db")))
                .isEqualTo("closed-cache");
    }

    @Test
    void repair_doesNotQuarantineLockedOrTimedOutDatabase() throws Exception {
        Path databasePath = tempDir.resolve("rankpeek-cache");
        Path h2File = databasePath.resolveSibling("rankpeek-cache.mv.db");
        Files.writeString(h2File, "keep");
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForObject("SELECT 1", Integer.class))
                .thenThrow(new RuntimeException(new SQLTransientConnectionException(
                        "Connection is not available, request timed out after 1000ms"
                )));
        LocalDataPathService pathService = pathService(databasePath);
        LocalCacheRecoveryService recoveryService = new LocalCacheRecoveryService(pathService, fixedClock());
        CacheRepairService service = new CacheRepairService(
                jdbcTemplate,
                pathService,
                new LocalCacheRecoveryCoordinator(recoveryService, fixedClock()),
                null
        );

        CacheRepairResult result = service.repair(true);

        assertThat(result.isSuccess()).isFalse();
        assertThat(result.isRepaired()).isFalse();
        assertThat(result.getHealth()).isEqualTo(CacheStatus.Health.LOCKED);
        assertThat(result.getMessage()).contains("another backend or packaged RankPeek instance may be running");
        assertThat(Files.readString(h2File)).isEqualTo("keep");
        try (var paths = Files.list(tempDir)) {
            assertThat(paths).noneMatch(path -> path.getFileName().toString().contains(".corrupt."));
        }
    }

    private HikariDataSource createDataSource(Path databasePath) {
        HikariConfig config = new HikariConfig();
        config.setDriverClassName("org.h2.Driver");
        config.setJdbcUrl("jdbc:h2:file:" + databasePath.toString().replace('\\', '/')
                + ";MODE=PostgreSQL;DATABASE_TO_UPPER=false");
        config.setUsername("sa");
        config.setPassword("");
        config.setMaximumPoolSize(1);
        config.setMinimumIdle(0);
        config.setConnectionTimeout(1_000);
        config.setInitializationFailTimeout(-1);
        config.setPoolName("rankpeek-cache-repair-test-" + System.nanoTime());
        return new HikariDataSource(config);
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
