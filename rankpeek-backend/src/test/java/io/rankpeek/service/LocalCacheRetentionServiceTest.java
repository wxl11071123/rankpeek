package io.rankpeek.service;

import io.rankpeek.cache.LocalCacheSchemaInitializer;
import io.rankpeek.config.LocalDataPathService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class LocalCacheRetentionServiceTest {

    @TempDir
    private Path tempDir;

    private JdbcTemplate jdbcTemplate;
    private LocalCacheRetentionService service;

    @BeforeEach
    void setUp() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:rankpeek-cache-retention-" + System.nanoTime()
                        + ";MODE=PostgreSQL;DATABASE_TO_UPPER=false;DB_CLOSE_DELAY=-1",
                "sa",
                ""
        );
        jdbcTemplate = new JdbcTemplate(dataSource);
        new LocalCacheSchemaInitializer(jdbcTemplate).initializeSchema();
        service = new LocalCacheRetentionService(jdbcTemplate, new TestLocalDataPathService(tempDir));
    }

    @Test
    void runRetention_removesOrphanMatchRowsAndKeepsReferencedRows() {
        insertMatchCacheRow(1001L, 1710000001001L);
        insertMatchCacheRow(1002L, 1710000001002L);
        jdbcTemplate.update("""
                INSERT INTO game_detail_cache (game_id, raw_json, updated_at)
                VALUES (1001, '{}', 1), (1002, '{}', 1)
                """);
        jdbcTemplate.update("""
                INSERT INTO match_data_scope_cache (game_id, source, updated_at)
                VALUES (1001, 'sgp', 1), (1002, 'sgp', 1)
                """);
        jdbcTemplate.update("""
                INSERT INTO match_participant_cache (game_id, puuid, participant_id, updated_at)
                VALUES (1001, 'player-1', 1, 1), (1002, 'orphan-player', 1, 1)
                """);
        jdbcTemplate.update("""
                INSERT INTO player_match_index (puuid, game_id, game_creation, updated_at)
                VALUES ('player-1', 1001, 1710000001001, 1)
                """);

        LocalCacheRetentionService.RetentionResult result = service.runRetention();

        assertThat(result.deletedRows()).isEqualTo(4);
        assertThat(result.orphanDeletedRows()).isEqualTo(4);
        assertThat(jdbcTemplate.queryForList("SELECT game_id FROM match_cache", Long.class))
                .containsExactly(1001L);
        assertThat(jdbcTemplate.queryForList("SELECT game_id FROM game_detail_cache", Long.class))
                .containsExactly(1001L);
        assertThat(jdbcTemplate.queryForList("SELECT game_id FROM match_data_scope_cache", Long.class))
                .containsExactly(1001L);
        assertThat(jdbcTemplate.queryForList("SELECT game_id FROM match_participant_cache", Long.class))
                .containsExactly(1001L);
    }

    @Test
    void runRetention_keepsNewestTwoHundredIndexesPerPlayer() {
        for (long gameId = 1; gameId <= 205; gameId++) {
            insertMatchCacheRow(gameId, gameId);
            jdbcTemplate.update("""
                    INSERT INTO player_match_index (puuid, game_id, game_creation, updated_at)
                    VALUES ('player-1', ?, ?, 1)
                    """, gameId, gameId);
        }

        LocalCacheRetentionService.RetentionResult result = service.runRetention();

        assertThat(result.playerIndexDeletedRows()).isEqualTo(5);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM player_match_index WHERE puuid = 'player-1'",
                Integer.class
        )).isEqualTo(200);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT MIN(game_id) FROM player_match_index WHERE puuid = 'player-1'",
                Long.class
        )).isEqualTo(6L);
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM match_cache", Integer.class))
                .isEqualTo(200);
    }

    @Test
    void runRetention_keepsNewestFiveHundredDistinctMatchesGlobally() {
        for (long gameId = 1; gameId <= 502; gameId++) {
            insertMatchCacheRow(gameId, gameId);
            jdbcTemplate.update("""
                    INSERT INTO player_match_index (puuid, game_id, game_creation, updated_at)
                    VALUES (?, ?, ?, 1)
                    """, "player-" + gameId, gameId, gameId);
        }

        LocalCacheRetentionService.RetentionResult result = service.runRetention();

        assertThat(result.globalMatchDeletedRows()).isEqualTo(2);
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM match_cache", Integer.class))
                .isEqualTo(500);
        assertThat(jdbcTemplate.queryForObject("SELECT MIN(game_id) FROM match_cache", Long.class))
                .isEqualTo(3L);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM player_match_index WHERE game_id IN (1, 2)",
                Integer.class
        )).isZero();
    }

    @Test
    void runRetention_prunesMatchScopedTablesToNewestFiveHundredDistinctMatches() {
        for (long gameId = 1; gameId <= 502; gameId++) {
            insertMatchCacheRow(gameId, gameId);
            jdbcTemplate.update("""
                    INSERT INTO player_match_index (puuid, game_id, game_creation, updated_at)
                    VALUES (?, ?, ?, 1)
                    """, "player-" + gameId, gameId, gameId);
            jdbcTemplate.update("""
                    INSERT INTO game_detail_cache (game_id, raw_json, updated_at)
                    VALUES (?, '{}', ?)
                    """, gameId, gameId);
            jdbcTemplate.update("""
                    INSERT INTO match_data_scope_cache (
                        game_id, source, summary_raw_json, detail_raw_json,
                        timeline_raw_json, timeline_json, updated_at
                    )
                    VALUES (?, 'sgp', '{}', '{}', '{}', '{}', ?)
                    """, gameId, gameId);
            jdbcTemplate.update("""
                    INSERT INTO match_participant_cache (game_id, puuid, participant_id, updated_at)
                    VALUES (?, ?, 1, ?)
                    """, gameId, "player-" + gameId, gameId);
        }

        service.runRetention();

        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM match_cache", Integer.class))
                .isEqualTo(500);
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM game_detail_cache", Integer.class))
                .isEqualTo(500);
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM match_data_scope_cache", Integer.class))
                .isEqualTo(500);
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM match_participant_cache", Integer.class))
                .isEqualTo(500);
        assertThat(jdbcTemplate.queryForObject("SELECT MIN(game_id) FROM match_data_scope_cache", Long.class))
                .isEqualTo(3L);
    }

    @Test
    void pruneBackupArtifacts_keepsLatestThreeCorruptQuarantineDirectoriesAndTraceFiles() throws Exception {
        Path cacheRoot = tempDir.resolve("cache");
        Files.createDirectories(cacheRoot);
        for (int index = 1; index <= 5; index++) {
            Files.createDirectories(cacheRoot.resolve("rankpeek-cache.corrupt.20260501-01020" + index));
            Files.writeString(cacheRoot.resolve("rankpeek-cache.trace." + index + ".db"), "trace-" + index);
        }

        LocalCacheRetentionService.BackupRetentionResult result = service.pruneBackupArtifacts();

        assertThat(result.deletedArtifacts()).isEqualTo(4);
        try (var paths = Files.list(cacheRoot)) {
            assertThat(paths.map(path -> path.getFileName().toString()))
                    .containsExactlyInAnyOrder(
                            "rankpeek-cache.corrupt.20260501-010203",
                            "rankpeek-cache.corrupt.20260501-010204",
                            "rankpeek-cache.corrupt.20260501-010205",
                            "rankpeek-cache.trace.3.db",
                            "rankpeek-cache.trace.4.db",
                            "rankpeek-cache.trace.5.db"
                    );
        }
    }

    private void insertMatchCacheRow(long gameId, long gameCreation) {
        jdbcTemplate.update("""
                INSERT INTO match_cache (game_id, game_creation, raw_json, updated_at)
                VALUES (?, ?, '{}', 1)
                """, gameId, gameCreation);
    }

    private static final class TestLocalDataPathService extends LocalDataPathService {
        private final Path root;

        private TestLocalDataPathService(Path root) {
            this.root = root;
        }

        @Override
        public Path getCacheDatabasePath() {
            return root.resolve("cache").resolve("rankpeek-cache");
        }

        @Override
        public Path getUserDataDirectory() {
            return root.resolve("user-store");
        }
    }
}
