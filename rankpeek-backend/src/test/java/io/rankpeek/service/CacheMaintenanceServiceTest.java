package io.rankpeek.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import io.rankpeek.cache.LocalCacheRecoveryCoordinator;
import io.rankpeek.cache.LocalCacheRecoveryService;
import io.rankpeek.cache.LocalCacheSchemaInitializer;
import io.rankpeek.config.LocalDataPathService;
import io.rankpeek.config.LocalDatabaseConfig;
import io.rankpeek.model.CacheClearResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.sql.Connection;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.mock;

class CacheMaintenanceServiceTest {

    private JdbcTemplate jdbcTemplate;
    private MatchHistoryService matchHistoryService;
    private RankService rankService;
    private SummonerService summonerService;
    private CacheMaintenanceService service;

    @BeforeEach
    void setUp() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:rankpeek-cache-maintenance-" + System.nanoTime() + ";MODE=PostgreSQL;DATABASE_TO_UPPER=false;DB_CLOSE_DELAY=-1",
                "sa",
                ""
        );
        jdbcTemplate = new JdbcTemplate(dataSource);
        new LocalCacheSchemaInitializer(jdbcTemplate).initializeSchema();

        matchHistoryService = mock(MatchHistoryService.class);
        rankService = mock(RankService.class);
        summonerService = mock(SummonerService.class);
        service = new CacheMaintenanceService(jdbcTemplate, matchHistoryService, rankService, summonerService);
    }

    @Test
    void clearCache_requiresConfirmationBeforeClearing() {
        insertCacheRows();

        CacheClearResult result = service.clearCache("all", false);

        assertThat(result.isSuccess()).isFalse();
        assertThat(result.getScope()).isEqualTo("all");
        assertThat(result.getMessage()).isEqualTo("confirm=true is required");
        assertThat(result.getDeletedRows()).isZero();
        assertThat(result.getCleared()).isEmpty();
        assertThat(result.getFailed())
                .extracting(CacheClearResult.Failure::getName)
                .containsExactly("confirmation");
        assertThat(totalLocalCacheRows()).isEqualTo(10);
        verifyNoInteractions(matchHistoryService, rankService, summonerService);
    }

    @Test
    void clearCache_memoryClearsOnlyInMemoryCaches() {
        insertCacheRows();

        CacheClearResult result = service.clearCache("memory", true);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getScope()).isEqualTo("memory");
        assertThat(result.getDeletedRows()).isZero();
        assertThat(result.getCleared()).containsExactly(
                "memory.matchHistory",
                "memory.rank",
                "memory.summoner"
        );
        assertThat(result.getFailed()).isEmpty();
        assertThat(totalLocalCacheRows()).isEqualTo(10);
        verify(matchHistoryService).refreshAllCache();
        verify(rankService).refreshAllCache();
        verify(summonerService).refreshAllCache();
    }

    @Test
    void clearCache_localDbDeletesLocalCacheRows() {
        insertCacheRows();

        CacheClearResult result = service.clearCache("localDb", true);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getScope()).isEqualTo("localDb");
        assertThat(result.getDeletedRows()).isEqualTo(10);
        assertThat(result.getCleared()).contains(
                "localDb.player_fetch_state",
                "localDb.player_match_index",
                "localDb.match_participant_cache",
                "localDb.game_detail_cache",
                "localDb.match_data_scope_cache",
                "localDb.match_cache",
                "localDb.rank_cache",
                "localDb.summoner_cache"
        );
        assertThat(result.getFailed()).isEmpty();
        assertThat(totalLocalCacheRows()).isZero();
        verifyNoInteractions(matchHistoryService, rankService, summonerService);
    }

    @Test
    void clearCache_localDbCanRunWhileBackgroundCacheConnectionIsActive(@TempDir Path tempDir) throws Exception {
        LocalDataPathService pathService = new TestLocalDataPathService(tempDir);
        HikariDataSource dataSource = (HikariDataSource) new LocalDatabaseConfig().dataSource(pathService);
        try {
            JdbcTemplate pooledJdbcTemplate = new JdbcTemplate(dataSource);
            new LocalCacheSchemaInitializer(pooledJdbcTemplate).initializeSchema();
            try (Connection ignored = dataSource.getConnection()) {
                CacheMaintenanceService maintenanceService = new CacheMaintenanceService(
                        pooledJdbcTemplate,
                        matchHistoryService,
                        rankService,
                        summonerService
                );

                CacheClearResult result = maintenanceService.clearCache("localDb", true, "normal");

                assertThat(result.isSuccess()).isTrue();
                assertThat(result.getFailed()).isEmpty();
                assertThat(result.getCleared()).contains(
                        "localDb.player_fetch_state",
                        "localDb.match_cache",
                        "localDb.summoner_cache"
                );
            }
        } finally {
            dataSource.close();
        }
    }

    @Test
    void clearCache_normalReportsModeRetentionAndDatabaseSize(@TempDir Path tempDir) throws Exception {
        Files.createDirectories(tempDir.resolve("cache"));
        Files.writeString(tempDir.resolve("cache").resolve("rankpeek-cache.mv.db"), "cache-file");
        CacheMaintenanceService maintenanceService = new CacheMaintenanceService(
                jdbcTemplate,
                matchHistoryService,
                rankService,
                summonerService,
                new LocalCacheRetentionService(jdbcTemplate, new TestLocalDataPathService(tempDir)),
                new TestLocalDataPathService(tempDir)
        );
        insertCacheRows();

        CacheClearResult result = maintenanceService.clearCache("localDb", true, "normal");

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getMode()).isEqualTo("normal");
        assertThat(result.isCompacted()).isFalse();
        assertThat(result.getDatabaseSizeBeforeBytes()).isEqualTo(10);
        assertThat(result.getDatabaseSizeAfterBytes()).isEqualTo(10);
        assertThat(result.getRetentionDeletedRows()).isZero();
        assertThat(result.getDeletedRows()).isEqualTo(10);
    }

    @Test
    void clearCache_deepUsesOnlineCheckpointWithoutClosingDataSourceAndPrunesBackupArtifacts(@TempDir Path tempDir)
            throws Exception {
        Files.createDirectories(tempDir.resolve("cache"));
        Files.writeString(tempDir.resolve("cache").resolve("rankpeek-cache.mv.db"), "cache-file");
        Files.createDirectories(tempDir.resolve("cache").resolve("rankpeek-cache.corrupt.20260501-010201"));
        Files.createDirectories(tempDir.resolve("cache").resolve("rankpeek-cache.corrupt.20260501-010202"));
        Files.createDirectories(tempDir.resolve("cache").resolve("rankpeek-cache.corrupt.20260501-010203"));
        Files.createDirectories(tempDir.resolve("cache").resolve("rankpeek-cache.corrupt.20260501-010204"));
        CacheMaintenanceService maintenanceService = new CacheMaintenanceService(
                jdbcTemplate,
                matchHistoryService,
                rankService,
                summonerService,
                new LocalCacheRetentionService(jdbcTemplate, new TestLocalDataPathService(tempDir)),
                new TestLocalDataPathService(tempDir)
        );
        insertCacheRows();

        CacheClearResult result = maintenanceService.clearCache("all", true, "deep");

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getMode()).isEqualTo("deep");
        assertThat(result.isCompacted()).isFalse();
        assertThat(result.getDatabaseSizeBeforeBytes()).isEqualTo(10);
        assertThat(result.getDatabaseSizeAfterBytes()).isGreaterThanOrEqualTo(0);
        assertThat(result.getCleared()).contains("localDb.backupArtifacts");
        assertThat(Files.exists(tempDir.resolve("cache").resolve("rankpeek-cache.corrupt.20260501-010201"))).isFalse();
        assertThat(jdbcTemplate.queryForObject("SELECT 1", Integer.class)).isEqualTo(1);
    }

    @Test
    void clearCache_deepRecoversClosedH2BeforeRetryingLocalDatabaseClear(@TempDir Path tempDir) throws Exception {
        Path databasePath = tempDir.resolve("cache").resolve("rankpeek-cache");
        Files.createDirectories(databasePath.getParent());
        Files.writeString(databasePath.resolveSibling("rankpeek-cache.mv.db"), "closed-cache");
        JdbcTemplate closedJdbcTemplate = mock(JdbcTemplate.class);
        RuntimeException closed = new RuntimeException(
                "org.h2.jdbc.JdbcSQLNonTransientConnectionException: The database has been closed [90098-232]"
        );
        doThrow(closed)
                .doReturn(0)
                .when(closedJdbcTemplate)
                .update("DELETE FROM player_fetch_state");
        LocalDataPathService pathService = new TestLocalDataPathService(tempDir);
        LocalCacheRecoveryService recoveryService = new LocalCacheRecoveryService(
                pathService,
                fixedClock()
        );
        LocalCacheSchemaInitializer schemaInitializer = mock(LocalCacheSchemaInitializer.class);
        org.mockito.Mockito.when(schemaInitializer.initializeSchemaIfPossible()).thenReturn(true);
        CacheMaintenanceService maintenanceService = new CacheMaintenanceService(
                closedJdbcTemplate,
                matchHistoryService,
                rankService,
                summonerService,
                null,
                pathService,
                new LocalCacheRecoveryCoordinator(recoveryService, fixedClock()),
                schemaInitializer
        );

        CacheClearResult result = maintenanceService.clearCache("localDb", true, "deep");

        Path quarantineDirectory = databasePath.getParent().resolve("rankpeek-cache.corrupt.20260501-010203");
        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getCleared()).contains("localDb.recovered", "localDb.player_fetch_state");
        assertThat(result.getFailed()).isEmpty();
        assertThat(Files.exists(databasePath.resolveSibling("rankpeek-cache.mv.db"))).isFalse();
        assertThat(Files.readString(quarantineDirectory.resolve("rankpeek-cache.mv.db")))
                .isEqualTo("closed-cache");
    }

    @Test
    void clearCache_allClearsMemoryAndLocalDb() {
        insertCacheRows();

        CacheClearResult result = service.clearCache(null, true);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getScope()).isEqualTo("all");
        assertThat(result.getDeletedRows()).isEqualTo(10);
        assertThat(result.getCleared()).contains(
                "memory.matchHistory",
                "memory.rank",
                "memory.summoner",
                "localDb.player_fetch_state",
                "localDb.match_data_scope_cache"
        );
        assertThat(result.getFailed()).isEmpty();
        assertThat(totalLocalCacheRows()).isZero();
        verify(matchHistoryService).refreshAllCache();
        verify(rankService).refreshAllCache();
        verify(summonerService).refreshAllCache();
    }

    @Test
    void clearCache_allReturnsFailedItemsAndContinuesWhenOneItemFails() {
        insertCacheRows();
        doThrow(new IllegalStateException("rank cache busy")).when(rankService).refreshAllCache();

        CacheClearResult result = service.clearCache("all", true);

        assertThat(result.isSuccess()).isFalse();
        assertThat(result.getScope()).isEqualTo("all");
        assertThat(result.getDeletedRows()).isEqualTo(10);
        assertThat(result.getCleared()).contains(
                "memory.matchHistory",
                "memory.summoner",
                "localDb.player_fetch_state",
                "localDb.summoner_cache"
        );
        assertThat(result.getFailed())
                .extracting(CacheClearResult.Failure::getName)
                .containsExactly("memory.rank");
        assertThat(result.getFailed().getFirst().getMessage()).contains("rank cache busy");
        assertThat(totalLocalCacheRows()).isZero();
        verify(matchHistoryService).refreshAllCache();
        verify(rankService).refreshAllCache();
        verify(summonerService).refreshAllCache();
    }

    @Test
    void clearCache_rejectsUnsupportedScope() {
        insertCacheRows();

        CacheClearResult result = service.clearCache("files", true);

        assertThat(result.isSuccess()).isFalse();
        assertThat(result.getScope()).isEqualTo("files");
        assertThat(result.getMessage()).contains("Unsupported cache clear scope");
        assertThat(result.getDeletedRows()).isZero();
        assertThat(result.getCleared()).isEmpty();
        assertThat(result.getFailed())
                .extracting(CacheClearResult.Failure::getName)
                .containsExactly("scope");
        assertThat(totalLocalCacheRows()).isEqualTo(10);
        verify(matchHistoryService, never()).refreshAllCache();
        verify(rankService, never()).refreshAllCache();
        verify(summonerService, never()).refreshAllCache();
    }

    @Test
    void clearCache_doesNotTouchUserStoreFilesForAnyScope(@TempDir Path tempDir) throws Exception {
        UserStoreService userStoreService = new UserStoreService(new ObjectMapper(), new TestLocalDataPathService(tempDir));
        userStoreService.setDefaultMatchQueueMode(440);
        Path userStorePath = tempDir.resolve("user-store").resolve("rankpeek-user-store.json");
        String before = Files.readString(userStorePath);

        service.clearCache("memory", true);
        service.clearCache("localDb", true);
        service.clearCache("all", true);

        assertThat(Files.exists(userStorePath)).isTrue();
        assertThat(Files.readString(userStorePath)).isEqualTo(before);
    }

    private void insertCacheRows() {
        jdbcTemplate.update("""
                INSERT INTO summoner_cache (puuid, raw_json, updated_at)
                VALUES ('puuid-1', '{}', 1)
                """);
        jdbcTemplate.update("""
                INSERT INTO rank_cache (puuid, raw_json, updated_at)
                VALUES ('puuid-1', '{}', 1)
                """);
        jdbcTemplate.update("""
                INSERT INTO match_cache (game_id, game_creation, raw_json, updated_at)
                VALUES (1001, 1710000000000, '{}', 1)
                """);
        jdbcTemplate.update("""
                INSERT INTO game_detail_cache (game_id, raw_json, updated_at)
                VALUES (1001, '{}', 1)
                """);
        jdbcTemplate.update("""
                INSERT INTO match_data_scope_cache (game_id, source, updated_at)
                VALUES (1001, 'lcu', 1)
                """);
        jdbcTemplate.update("""
                INSERT INTO match_participant_cache (game_id, puuid, participant_id, updated_at)
                VALUES (1001, 'puuid-1', 1, 1), (1001, 'puuid-2', 2, 1)
                """);
        jdbcTemplate.update("""
                INSERT INTO player_match_index (puuid, game_id, game_creation, updated_at)
                VALUES ('puuid-1', 1001, 1710000000000, 1),
                       ('puuid-2', 1001, 1710000000000, 1)
                """);
        jdbcTemplate.update("""
                INSERT INTO player_fetch_state (puuid, updated_at)
                VALUES ('puuid-1', 1)
                """);
    }

    private long totalLocalCacheRows() {
        return count("summoner_cache")
                + count("rank_cache")
                + count("match_cache")
                + count("game_detail_cache")
                + count("match_data_scope_cache")
                + count("match_participant_cache")
                + count("player_match_index")
                + count("player_fetch_state");
    }

    private long count(String tableName) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM " + tableName, Long.class);
    }

    private Clock fixedClock() {
        return Clock.fixed(Instant.parse("2026-05-01T01:02:03Z"), ZoneOffset.UTC);
    }

    private static final class TestLocalDataPathService extends LocalDataPathService {
        private final Path root;

        private TestLocalDataPathService(Path root) {
            this.root = root;
        }

        @Override
        public Path getUserDataDirectory() {
            return root.resolve("user-store");
        }

        @Override
        public Path getUserStorePath() {
            return getUserDataDirectory().resolve("rankpeek-user-store.json");
        }

        @Override
        public Path getCacheDatabasePath() {
            return root.resolve("cache").resolve("rankpeek-cache");
        }
    }
}
