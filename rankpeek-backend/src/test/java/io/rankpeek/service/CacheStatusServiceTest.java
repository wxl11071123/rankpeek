package io.rankpeek.service;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import io.rankpeek.cache.LocalCacheRecoveryCoordinator;
import io.rankpeek.cache.LocalCacheSchemaInitializer;
import io.rankpeek.cache.LocalCacheRecoveryService;
import io.rankpeek.config.LocalDataPathService;
import io.rankpeek.model.CacheStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.SQLTransientConnectionException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CacheStatusServiceTest {

    @TempDir
    private Path tempDir;

    private JdbcTemplate jdbcTemplate;
    private LocalDataPathService localDataPathService;
    private CacheStatusService service;
    private Path cacheDatabasePath;

    @BeforeEach
    void setUp() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:rankpeek-cache-status-" + System.nanoTime() + ";MODE=PostgreSQL;DATABASE_TO_UPPER=false;DB_CLOSE_DELAY=-1",
                "sa",
                ""
        );
        jdbcTemplate = new JdbcTemplate(dataSource);
        new LocalCacheSchemaInitializer(jdbcTemplate).initializeSchema();

        cacheDatabasePath = tempDir.resolve("rankpeek-cache").toAbsolutePath();
        localDataPathService = mock(LocalDataPathService.class);
        when(localDataPathService.getCacheDatabasePath()).thenReturn(cacheDatabasePath);
        service = new CacheStatusService(jdbcTemplate, localDataPathService);
    }

    @Test
    void getStatus_returnsEnabledWithZeroCountsForEmptyDatabase() {
        CacheStatus status = service.getStatus();

        assertThat(status.isEnabled()).isTrue();
        assertThat(status.getHealth()).isEqualTo(CacheStatus.Health.OK);
        assertThat(status.getDatabasePath()).isEqualTo(cacheDatabasePath.toString());
        assertThat(status.getDatabaseSizeBytes()).isZero();
        assertThat(status.isDatabaseExists()).isFalse();
        assertThat(status.isLockFileExists()).isFalse();
        assertThat(status.getLastError()).isNull();
        assertThat(status.getLastRecoveryDirectory()).isNull();
        assertThat(status.getSummonerCount()).isZero();
        assertThat(status.getRankCount()).isZero();
        assertThat(status.getMatchCount()).isZero();
        assertThat(status.getGameDetailCount()).isZero();
        assertThat(status.getParticipantCount()).isZero();
        assertThat(status.getPlayerMatchIndexCount()).isZero();
        assertThat(status.getTrackedPlayerCount()).isZero();
        assertThat(status.getLatestMatchCreation()).isNull();
        assertThat(status.getOrphanMatchCount()).isZero();
        assertThat(status.getOrphanGameDetailCount()).isZero();
        assertThat(status.getOrphanParticipantCount()).isZero();
        assertThat(status.getOrphanDataScopeCount()).isZero();
        assertThat(status.getQuarantineCount()).isZero();
        assertThat(status.getTraceFileCount()).isZero();
        assertThat(status.getCorruptFileCount()).isZero();
    }

    @Test
    void getStatus_countsLocalCacheRowsAndDatabaseFileSize() throws Exception {
        Files.writeString(cacheDatabasePath.resolveSibling("rankpeek-cache.mv.db"), "cache-file");
        Files.writeString(cacheDatabasePath.resolveSibling("rankpeek-cache.lock.db"), "lock");
        jdbcTemplate.update("""
                INSERT INTO summoner_cache (puuid, raw_json, updated_at)
                VALUES ('puuid-1', '{}', 1), ('puuid-2', '{}', 1)
                """);
        jdbcTemplate.update("""
                INSERT INTO rank_cache (puuid, raw_json, updated_at)
                VALUES ('puuid-1', '{}', 1)
                """);
        jdbcTemplate.update("""
                INSERT INTO match_cache (game_id, game_creation, raw_json, updated_at)
                VALUES (1001, 1710000000000, '{}', 1), (1002, 1710000001000, '{}', 1)
                """);
        jdbcTemplate.update("""
                INSERT INTO game_detail_cache (game_id, raw_json, updated_at)
                VALUES (1001, '{}', 1)
                """);
        jdbcTemplate.update("""
                INSERT INTO match_participant_cache (game_id, puuid, participant_id, updated_at)
                VALUES (1001, 'puuid-1', 1, 1), (1001, 'puuid-2', 2, 1), (1002, 'puuid-3', 1, 1)
                """);
        jdbcTemplate.update("""
                INSERT INTO player_match_index (puuid, game_id, game_creation, updated_at)
                VALUES ('puuid-1', 1001, 1710000000000, 1),
                       ('puuid-2', 1001, 1710000000000, 1),
                       ('puuid-1', 1002, 1710000001000, 1)
                """);

        CacheStatus status = service.getStatus();

        assertThat(status.isEnabled()).isTrue();
        assertThat(status.getHealth()).isEqualTo(CacheStatus.Health.OK);
        assertThat(status.isDatabaseExists()).isTrue();
        assertThat(status.isLockFileExists()).isTrue();
        assertThat(status.getSummonerCount()).isEqualTo(2);
        assertThat(status.getRankCount()).isEqualTo(1);
        assertThat(status.getMatchCount()).isEqualTo(2);
        assertThat(status.getGameDetailCount()).isEqualTo(1);
        assertThat(status.getParticipantCount()).isEqualTo(3);
        assertThat(status.getPlayerMatchIndexCount()).isEqualTo(3);
        assertThat(status.getTrackedPlayerCount()).isEqualTo(2);
        assertThat(status.getLatestMatchCreation()).isEqualTo(1710000001000L);
        assertThat(status.getDatabaseSizeBytes()).isEqualTo(10);
    }

    @Test
    void getStatus_reportsRetentionAndBackupArtifactStats() throws Exception {
        Files.createDirectories(cacheDatabasePath.getParent());
        Files.createDirectories(cacheDatabasePath.getParent().resolve("rankpeek-cache.corrupt.20260501-010203"));
        Files.writeString(cacheDatabasePath.resolveSibling("rankpeek-cache.trace.db"), "trace");
        Files.writeString(cacheDatabasePath.resolveSibling("rankpeek-cache.corrupt.db"), "corrupt");
        jdbcTemplate.update("""
                INSERT INTO match_cache (game_id, game_creation, raw_json, updated_at)
                VALUES (1001, 1710000000000, '{}', 1), (1002, 1710000001000, '{}', 1)
                """);
        jdbcTemplate.update("""
                INSERT INTO game_detail_cache (game_id, raw_json, updated_at)
                VALUES (1002, '{}', 1)
                """);
        jdbcTemplate.update("""
                INSERT INTO match_data_scope_cache (game_id, source, updated_at)
                VALUES (1002, 'sgp', 1)
                """);
        jdbcTemplate.update("""
                INSERT INTO match_participant_cache (game_id, puuid, participant_id, updated_at)
                VALUES (1002, 'orphan-player', 1, 1)
                """);
        jdbcTemplate.update("""
                INSERT INTO player_match_index (puuid, game_id, game_creation, updated_at)
                VALUES ('player-1', 1001, 1710000000000, 1)
                """);

        CacheStatus status = service.getStatus();

        assertThat(status.getOrphanMatchCount()).isEqualTo(1);
        assertThat(status.getOrphanGameDetailCount()).isEqualTo(1);
        assertThat(status.getOrphanParticipantCount()).isEqualTo(1);
        assertThat(status.getOrphanDataScopeCount()).isEqualTo(1);
        assertThat(status.getQuarantineCount()).isEqualTo(1);
        assertThat(status.getTraceFileCount()).isEqualTo(1);
        assertThat(status.getCorruptFileCount()).isEqualTo(1);
    }

    @Test
    void getStatus_returnsDisabledWhenDatabaseQueryFails() {
        JdbcTemplate brokenJdbcTemplate = mock(JdbcTemplate.class);
        when(brokenJdbcTemplate.queryForObject("SELECT COUNT(*) FROM summoner_cache", Long.class))
                .thenThrow(new RuntimeException("database down"));
        CacheStatusService brokenService = new CacheStatusService(brokenJdbcTemplate, localDataPathService);

        CacheStatus status = brokenService.getStatus();

        assertThat(status.isEnabled()).isFalse();
        assertThat(status.getHealth()).isEqualTo(CacheStatus.Health.ERROR);
        assertThat(status.getLastError()).contains("RuntimeException: database down");
        assertThat(status.getDatabasePath()).isEqualTo(cacheDatabasePath.toString());
        assertThat(status.getSummonerCount()).isZero();
        assertThat(status.getRankCount()).isZero();
        assertThat(status.getMatchCount()).isZero();
        assertThat(status.getGameDetailCount()).isZero();
        assertThat(status.getParticipantCount()).isZero();
        assertThat(status.getPlayerMatchIndexCount()).isZero();
        assertThat(status.getTrackedPlayerCount()).isZero();
        assertThat(status.getLatestMatchCreation()).isNull();
    }

    @Test
    void getStatus_recoversCorruptLocalDatabaseThroughCoordinator() {
        RuntimeException corruption = new RuntimeException("File corrupted while reading record");
        JdbcTemplate brokenJdbcTemplate = mock(JdbcTemplate.class);
        when(brokenJdbcTemplate.queryForObject("SELECT COUNT(*) FROM summoner_cache", Long.class))
                .thenThrow(corruption);
        LocalCacheRecoveryCoordinator recoveryCoordinator = mock(LocalCacheRecoveryCoordinator.class);
        when(recoveryCoordinator.isRecoverableCorruption(corruption)).thenReturn(true);
        when(recoveryCoordinator.rootCauseSummary(corruption)).thenReturn("RuntimeException: corrupt");
        when(recoveryCoordinator.recoverIfCorrupt(corruption, "status.getStatus"))
                .thenReturn(new LocalCacheRecoveryCoordinator.CoordinatedRecoveryResult(
                        false,
                        false,
                        false,
                        true,
                        "local H2 recovery already in progress",
                        null
                ));
        CacheStatusService brokenService = new CacheStatusService(
                brokenJdbcTemplate,
                localDataPathService,
                recoveryCoordinator
        );

        CacheStatus status = brokenService.getStatus();

        assertThat(status.isEnabled()).isFalse();
        assertThat(status.getHealth()).isEqualTo(CacheStatus.Health.CORRUPT);
        verify(recoveryCoordinator).recoverIfCorrupt(corruption, "status.getStatus");
    }

    @Test
    void getStatus_recoversCorruptLocalDatabaseAndReturnsEnabled() throws Exception {
        Path recoveringDatabasePath = tempDir.resolve("recover-status").resolve("rankpeek-cache").toAbsolutePath();
        Files.createDirectories(recoveringDatabasePath.getParent());
        Files.write(recoveringDatabasePath.resolveSibling("rankpeek-cache.mv.db"), new byte[]{4, 3, 2, 1});
        LocalDataPathService recoveringPathService = mock(LocalDataPathService.class);
        when(recoveringPathService.getCacheDatabasePath()).thenReturn(recoveringDatabasePath);

        HikariDataSource recoveringDataSource = createDataSource(recoveringDatabasePath);
        try {
            JdbcTemplate recoveringJdbcTemplate = new JdbcTemplate(recoveringDataSource);
            LocalCacheRecoveryService recoveryService =
                    new LocalCacheRecoveryService(recoveringPathService, fixedClock(), recoveringDataSource);
            LocalCacheSchemaInitializer initializer =
                    new LocalCacheSchemaInitializer(recoveringJdbcTemplate, recoveryService);
            CacheStatusService recoveringService = new CacheStatusService(
                    recoveringJdbcTemplate,
                    recoveringPathService,
                    recoveryService,
                    initializer
            );

            CacheStatus status = recoveringService.getStatus();

            Path quarantineDirectory = recoveringDatabasePath.getParent()
                    .resolve("rankpeek-cache.corrupt.20260501-010203");
            assertThat(status.isEnabled()).isTrue();
            assertThat(status.getHealth()).isEqualTo(CacheStatus.Health.RECOVERED);
            assertThat(status.getLastRecoveryDirectory()).isEqualTo(quarantineDirectory.toString());
            assertThat(status.getDatabasePath()).isEqualTo(recoveringDatabasePath.toString());
            assertThat(status.getSummonerCount()).isZero();
            assertThat(status.getMatchCount()).isZero();
            assertThat(Files.readAllBytes(quarantineDirectory.resolve("rankpeek-cache.mv.db")))
                    .containsExactly(4, 3, 2, 1);
            assertThat(Files.exists(recoveringDatabasePath.resolveSibling("rankpeek-cache.mv.db"))).isTrue();
        } finally {
            recoveringDataSource.close();
        }
    }

    @Test
    void getStatus_doesNotQuarantineNonCorruptionDatabaseFailure() throws Exception {
        Path nonCorruptDatabasePath = tempDir.resolve("non-corrupt-status").resolve("rankpeek-cache").toAbsolutePath();
        Files.createDirectories(nonCorruptDatabasePath.getParent());
        Path h2File = nonCorruptDatabasePath.resolveSibling("rankpeek-cache.mv.db");
        Files.writeString(h2File, "keep");
        LocalDataPathService nonCorruptPathService = mock(LocalDataPathService.class);
        when(nonCorruptPathService.getCacheDatabasePath()).thenReturn(nonCorruptDatabasePath);
        JdbcTemplate brokenJdbcTemplate = mock(JdbcTemplate.class);
        when(brokenJdbcTemplate.queryForObject("SELECT COUNT(*) FROM summoner_cache", Long.class))
                .thenThrow(new RuntimeException(new SQLTransientConnectionException(
                        "Connection is not available, request timed out after 1000ms"
                )));
        LocalCacheRecoveryService recoveryService = new LocalCacheRecoveryService(nonCorruptPathService, fixedClock());
        CacheStatusService brokenService = new CacheStatusService(
                brokenJdbcTemplate,
                nonCorruptPathService,
                recoveryService,
                null
        );

        CacheStatus status = brokenService.getStatus();

        assertThat(status.isEnabled()).isFalse();
        assertThat(status.getHealth()).isEqualTo(CacheStatus.Health.LOCKED);
        assertThat(status.getLastError()).contains("SQLTransientConnectionException");
        assertThat(Files.readString(h2File)).isEqualTo("keep");
        try (var paths = Files.list(nonCorruptDatabasePath.getParent())) {
            assertThat(paths)
                    .noneMatch(path -> path.getFileName().toString().contains(".corrupt."));
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
        config.setPoolName("rankpeek-cache-status-recovery-test-" + System.nanoTime());
        return new HikariDataSource(config);
    }

    private Clock fixedClock() {
        return Clock.fixed(Instant.parse("2026-05-01T01:02:03Z"), ZoneOffset.UTC);
    }
}
