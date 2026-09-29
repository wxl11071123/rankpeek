package io.rankpeek.service;

import io.rankpeek.config.LocalDataPathService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;

@Service
@Slf4j
public class LocalCacheRetentionService {

    private static final int PLAYER_MATCH_INDEX_KEEP_COUNT = 200;
    private static final int GLOBAL_MATCH_CACHE_KEEP_COUNT = 500;
    private static final int BACKUP_ARTIFACT_KEEP_COUNT = 3;

    private final JdbcTemplate jdbcTemplate;
    private final LocalDataPathService localDataPathService;

    public LocalCacheRetentionService(JdbcTemplate jdbcTemplate, LocalDataPathService localDataPathService) {
        this.jdbcTemplate = jdbcTemplate;
        this.localDataPathService = localDataPathService;
    }

    public RetentionResult runRetention() {
        long playerIndexDeletedRows = trimPlayerMatchIndexes();
        long globalMatchDeletedRows = trimGlobalMatchCacheIndexes();
        long orphanDeletedRows = deleteOrphanRows();
        return new RetentionResult(
                playerIndexDeletedRows + globalMatchDeletedRows + orphanDeletedRows,
                playerIndexDeletedRows,
                globalMatchDeletedRows,
                orphanDeletedRows
        );
    }

    public BackupRetentionResult pruneBackupArtifacts() {
        Path cacheRoot = resolveCacheRoot();
        if (cacheRoot == null || !Files.isDirectory(cacheRoot)) {
            return new BackupRetentionResult(0);
        }

        long deletedArtifacts = 0;
        deletedArtifacts += pruneMatchingArtifacts(cacheRoot, path ->
                Files.isDirectory(path)
                        && path.getFileName().toString().startsWith("rankpeek-cache.corrupt."));
        deletedArtifacts += pruneMatchingArtifacts(cacheRoot, path -> {
            String fileName = path.getFileName().toString();
            return Files.isRegularFile(path)
                    && fileName.startsWith("rankpeek-cache.trace")
                    && fileName.endsWith(".db");
        });
        deletedArtifacts += pruneMatchingArtifacts(cacheRoot, path -> {
            String fileName = path.getFileName().toString();
            return Files.isRegularFile(path)
                    && fileName.startsWith("rankpeek-cache.corrupt")
                    && fileName.endsWith(".db");
        });
        return new BackupRetentionResult(deletedArtifacts);
    }

    private long trimPlayerMatchIndexes() {
        return jdbcTemplate.update("""
                DELETE FROM player_match_index
                WHERE (puuid, game_id) IN (
                    SELECT puuid, game_id
                    FROM (
                        SELECT puuid,
                               game_id,
                               ROW_NUMBER() OVER (
                                   PARTITION BY puuid
                                   ORDER BY game_creation DESC, game_id DESC
                               ) AS row_number
                        FROM player_match_index
                    ) ranked
                    WHERE row_number > ?
                )
                """, PLAYER_MATCH_INDEX_KEEP_COUNT);
    }

    private long trimGlobalMatchCacheIndexes() {
        return jdbcTemplate.update("""
                DELETE FROM player_match_index
                WHERE game_id NOT IN (
                    SELECT game_id
                    FROM (
                        SELECT game_id
                        FROM match_cache
                        ORDER BY game_creation DESC, game_id DESC
                        LIMIT ?
                    ) newest_matches
                )
                """, GLOBAL_MATCH_CACHE_KEEP_COUNT);
    }

    private long deleteOrphanRows() {
        long deletedRows = 0;
        deletedRows += deleteRowsWithoutPlayerIndex("match_participant_cache");
        deletedRows += deleteRowsWithoutPlayerIndex("game_detail_cache");
        deletedRows += deleteRowsWithoutPlayerIndex("match_data_scope_cache");
        deletedRows += deleteRowsWithoutPlayerIndex("match_cache");
        return deletedRows;
    }

    private long deleteRowsWithoutPlayerIndex(String tableName) {
        return jdbcTemplate.update("""
                DELETE FROM %s
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM player_match_index
                    WHERE player_match_index.game_id = %s.game_id
                )
                """.formatted(tableName, tableName));
    }

    private long pruneMatchingArtifacts(Path directory, ArtifactPredicate predicate) {
        try (Stream<Path> paths = Files.list(directory)) {
            List<Path> matching = paths
                    .filter(predicate::matches)
                    .sorted(Comparator
                            .comparing(this::artifactLastModified)
                            .thenComparing(path -> path.getFileName().toString()))
                    .toList();
            int deleteCount = Math.max(0, matching.size() - BACKUP_ARTIFACT_KEEP_COUNT);
            long deleted = 0;
            for (int index = 0; index < deleteCount; index++) {
                if (deleteRecursively(matching.get(index))) {
                    deleted++;
                }
            }
            return deleted;
        } catch (IOException e) {
            log.warn("Failed to prune local cache backup artifacts: directory={}, error={}", directory, e.getMessage());
            return 0;
        }
    }

    private long artifactLastModified(Path path) {
        try {
            return Files.getLastModifiedTime(path).toMillis();
        } catch (IOException e) {
            return 0;
        }
    }

    private boolean deleteRecursively(Path path) {
        try {
            if (Files.isDirectory(path)) {
                try (Stream<Path> children = Files.walk(path)) {
                    children
                            .sorted(Comparator.reverseOrder())
                            .forEach(this::deletePathQuietly);
                }
            } else {
                Files.deleteIfExists(path);
            }
            return true;
        } catch (IOException e) {
            log.warn("Failed to delete local cache backup artifact: path={}, error={}", path, e.getMessage());
            return false;
        }
    }

    private void deletePathQuietly(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException e) {
            log.warn("Failed to delete local cache backup path: path={}, error={}", path, e.getMessage());
        }
    }

    private Path resolveCacheRoot() {
        try {
            Path databasePath = localDataPathService.getCacheDatabasePath();
            return databasePath == null ? null : databasePath.toAbsolutePath().getParent();
        } catch (Exception e) {
            log.warn("Failed to resolve local cache root for retention: error={}", e.getMessage());
            return null;
        }
    }

    public record RetentionResult(
            long deletedRows,
            long playerIndexDeletedRows,
            long globalMatchDeletedRows,
            long orphanDeletedRows
    ) {
    }

    public record BackupRetentionResult(long deletedArtifacts) {
    }

    @FunctionalInterface
    private interface ArtifactPredicate {
        boolean matches(Path path);
    }
}
