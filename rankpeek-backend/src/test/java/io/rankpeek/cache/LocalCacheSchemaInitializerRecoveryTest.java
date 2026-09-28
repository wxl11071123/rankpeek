package io.rankpeek.cache;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import io.rankpeek.config.LocalDataPathService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class LocalCacheSchemaInitializerRecoveryTest {

    @TempDir
    private Path tempDir;

    @Test
    void initializeSchema_quarantinesCorruptFileAndCreatesFreshSchema() throws Exception {
        Path databasePath = tempDir.resolve("rankpeek-cache");
        Path corruptFile = databasePath.resolveSibling("rankpeek-cache.mv.db");
        Files.write(corruptFile, new byte[]{9, 8, 7, 6});

        HikariDataSource dataSource = createDataSource(databasePath);
        try {
            JdbcTemplate jdbcTemplate = new JdbcTemplate(dataSource);
            LocalDataPathService pathService = pathService(databasePath);
            LocalCacheRecoveryService recoveryService =
                    new LocalCacheRecoveryService(pathService, fixedClock(), dataSource);
            LocalCacheSchemaInitializer initializer =
                    new LocalCacheSchemaInitializer(jdbcTemplate, recoveryService);

            boolean initialized = initializer.initializeSchemaIfPossible();

            Path quarantineDirectory = tempDir.resolve("rankpeek-cache.corrupt.20260501-010203");
            assertThat(initialized).isTrue();
            assertThat(Files.exists(corruptFile)).isTrue();
            assertThat(Files.readAllBytes(quarantineDirectory.resolve("rankpeek-cache.mv.db")))
                    .containsExactly(9, 8, 7, 6);
            assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM summoner_cache", Long.class)).isZero();
            assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM player_match_index", Long.class)).isZero();
        } finally {
            dataSource.close();
        }
    }

    @Test
    void initializeSchema_usesCoordinatorRecoveryGate() {
        RuntimeException corruption = new RuntimeException("File corrupted while reading record");
        JdbcTemplate brokenJdbcTemplate = mock(JdbcTemplate.class);
        doThrow(corruption).when(brokenJdbcTemplate).execute(anyString());
        LocalCacheRecoveryCoordinator recoveryCoordinator = mock(LocalCacheRecoveryCoordinator.class);
        when(recoveryCoordinator.isRecoverableCorruption(corruption)).thenReturn(true);
        when(recoveryCoordinator.rootCauseSummary(corruption)).thenReturn("RuntimeException: corrupt");
        when(recoveryCoordinator.recoverIfCorrupt(corruption, "schema.initialize", false))
                .thenReturn(new LocalCacheRecoveryCoordinator.CoordinatedRecoveryResult(
                        false,
                        false,
                        false,
                        true,
                        "local H2 recovery already in progress",
                        null
                ));
        LocalCacheSchemaInitializer initializer =
                new LocalCacheSchemaInitializer(brokenJdbcTemplate, recoveryCoordinator);

        boolean initialized = initializer.initializeSchemaIfPossible();

        assertThat(initialized).isFalse();
        verify(recoveryCoordinator).recoverIfCorrupt(corruption, "schema.initialize", false);
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
        config.setPoolName("rankpeek-schema-recovery-test-" + System.nanoTime());
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
