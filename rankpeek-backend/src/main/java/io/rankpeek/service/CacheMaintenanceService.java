package io.rankpeek.service;

import io.rankpeek.model.CacheClearResult;
import io.rankpeek.config.LocalDataPathService;
import io.rankpeek.cache.LocalCacheRecoveryCoordinator;
import io.rankpeek.cache.LocalCacheSchemaInitializer;
import org.springframework.beans.factory.annotation.Autowired;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@Service
@Slf4j
public class CacheMaintenanceService {

    private static final String SCOPE_ALL = "all";
    private static final String SCOPE_MEMORY = "memory";
    private static final String SCOPE_LOCAL_DB = "localDb";
    private static final String MODE_NORMAL = "normal";
    private static final String MODE_DEEP = "deep";
    private static final List<String> LOCAL_CACHE_TABLES = List.of(
            "player_fetch_state",
            "player_match_index",
            "match_participant_cache",
            "game_detail_cache",
            "match_data_scope_cache",
            "match_cache",
            "rank_cache",
            "summoner_cache"
    );

    private final JdbcTemplate jdbcTemplate;
    private final MatchHistoryService matchHistoryService;
    private final RankService rankService;
    private final SummonerService summonerService;
    private final LocalCacheRetentionService retentionService;
    private final LocalDataPathService localDataPathService;
    private final LocalCacheRecoveryCoordinator recoveryCoordinator;
    private final LocalCacheSchemaInitializer schemaInitializer;

    @Autowired
    public CacheMaintenanceService(JdbcTemplate jdbcTemplate,
                                   MatchHistoryService matchHistoryService,
                                   RankService rankService,
                                   SummonerService summonerService,
                                   LocalCacheRetentionService retentionService,
                                   LocalDataPathService localDataPathService,
                                   LocalCacheRecoveryCoordinator recoveryCoordinator,
                                   LocalCacheSchemaInitializer schemaInitializer) {
        this.jdbcTemplate = jdbcTemplate;
        this.matchHistoryService = matchHistoryService;
        this.rankService = rankService;
        this.summonerService = summonerService;
        this.retentionService = retentionService;
        this.localDataPathService = localDataPathService;
        this.recoveryCoordinator = recoveryCoordinator;
        this.schemaInitializer = schemaInitializer;
    }

    public CacheMaintenanceService(JdbcTemplate jdbcTemplate,
                                   MatchHistoryService matchHistoryService,
                                   RankService rankService,
                                   SummonerService summonerService,
                                   LocalCacheRetentionService retentionService,
                                   LocalDataPathService localDataPathService) {
        this(
                jdbcTemplate,
                matchHistoryService,
                rankService,
                summonerService,
                retentionService,
                localDataPathService,
                null,
                null
        );
    }

    public CacheMaintenanceService(JdbcTemplate jdbcTemplate,
                                   MatchHistoryService matchHistoryService,
                                   RankService rankService,
                                   SummonerService summonerService) {
        this(jdbcTemplate, matchHistoryService, rankService, summonerService, null, null, null, null);
    }

    public CacheClearResult clearCache(String scope, boolean confirm) {
        return clearCache(scope, confirm, MODE_NORMAL);
    }

    public CacheClearResult clearCache(String scope, boolean confirm, String mode) {
        String normalizedScope = normalizeScope(scope);
        String normalizedMode = normalizeMode(mode);
        long databaseSizeBeforeBytes = readDatabaseSizeBytes();

        if (!confirm) {
            return result(false, normalizedScope, "confirm=true is required", List.of(), List.of(
                    new CacheClearResult.Failure("confirmation", "confirm=true is required")
            ), 0, normalizedMode, databaseSizeBeforeBytes, readDatabaseSizeBytes(), false, 0);
        }

        if (!isSupportedScope(normalizedScope)) {
            String message = "Unsupported cache clear scope: " + normalizedScope;
            return result(false, normalizedScope, message, List.of(), List.of(
                    new CacheClearResult.Failure("scope", message)
            ), 0, normalizedMode, databaseSizeBeforeBytes, readDatabaseSizeBytes(), false, 0);
        }

        if (!isSupportedMode(normalizedMode)) {
            String message = "Unsupported cache clear mode: " + normalizedMode;
            return result(false, normalizedScope, message, List.of(), List.of(
                    new CacheClearResult.Failure("mode", message)
            ), 0, normalizedMode, databaseSizeBeforeBytes, readDatabaseSizeBytes(), false, 0);
        }

        List<String> cleared = new ArrayList<>();
        List<CacheClearResult.Failure> failed = new ArrayList<>();
        long deletedRows = 0;
        long retentionDeletedRows = 0;
        boolean compacted = false;

        if (SCOPE_MEMORY.equals(normalizedScope) || SCOPE_ALL.equals(normalizedScope)) {
            clearMemoryCache(cleared, failed);
        }

        if (SCOPE_LOCAL_DB.equals(normalizedScope) || SCOPE_ALL.equals(normalizedScope)) {
            deletedRows = clearLocalDatabaseCache(cleared, failed);
            retentionDeletedRows = runRetention(cleared, failed);
        }

        if (MODE_DEEP.equals(normalizedMode)) {
            compacted = checkpointDatabase(cleared, failed);
            pruneBackupArtifacts(cleared, failed);
        }

        boolean success = failed.isEmpty();
        return result(
                success,
                normalizedScope,
                message(success, cleared, failed),
                List.copyOf(cleared),
                List.copyOf(failed),
                deletedRows,
                normalizedMode,
                databaseSizeBeforeBytes,
                readDatabaseSizeBytes(),
                compacted,
                retentionDeletedRows
        );
    }

    private void clearMemoryCache(List<String> cleared, List<CacheClearResult.Failure> failed) {
        clearItem("memory.matchHistory", () -> matchHistoryService.refreshAllCache(), cleared, failed);
        clearItem("memory.rank", () -> rankService.refreshAllCache(), cleared, failed);
        clearItem("memory.summoner", () -> summonerService.refreshAllCache(), cleared, failed);
    }

    private long clearLocalDatabaseCache(List<String> cleared, List<CacheClearResult.Failure> failed) {
        long deletedRows = 0;
        boolean recovered = false;
        for (String tableName : LOCAL_CACHE_TABLES) {
            String itemName = "localDb." + tableName;
            try {
                deletedRows += deleteTable(tableName);
                cleared.add(itemName);
            } catch (Exception e) {
                if (!recovered && recoverLocalDatabaseIfPossible(e, "cache-clear." + tableName, cleared, failed)) {
                    recovered = true;
                    try {
                        deletedRows += deleteTable(tableName);
                        cleared.add(itemName);
                        continue;
                    } catch (Exception retryError) {
                        e = retryError;
                    }
                }
                String message = rootMessage(e);
                log.warn("Failed to clear cache item: name={}, error={}", itemName, message);
                failed.add(new CacheClearResult.Failure(itemName, message));
            }
        }
        return deletedRows;
    }

    private long runRetention(List<String> cleared, List<CacheClearResult.Failure> failed) {
        if (retentionService == null) {
            return 0;
        }
        try {
            LocalCacheRetentionService.RetentionResult result = retentionService.runRetention();
            cleared.add("localDb.retention");
            return result.deletedRows();
        } catch (Exception e) {
            String message = rootMessage(e);
            log.warn("Failed to run local cache retention: error={}", message);
            failed.add(new CacheClearResult.Failure("localDb.retention", message));
            return 0;
        }
    }

    private boolean checkpointDatabase(List<String> cleared, List<CacheClearResult.Failure> failed) {
        try {
            jdbcTemplate.execute("CHECKPOINT");
            cleared.add("localDb.checkpoint");
            return false;
        } catch (Exception e) {
            String message = rootMessage(e);
            log.warn("Failed to checkpoint local cache database: error={}", message);
            if (recoverLocalDatabaseIfPossible(e, "cache-clear.checkpoint", cleared, failed)) {
                return false;
            }
            failed.add(new CacheClearResult.Failure("localDb.checkpoint", message));
            return false;
        }
    }

    private boolean recoverLocalDatabaseIfPossible(
            Exception error,
            String trigger,
            List<String> cleared,
            List<CacheClearResult.Failure> failed) {
        if (recoveryCoordinator == null || !recoveryCoordinator.isRecoverableCorruption(error)) {
            return false;
        }

        try {
            LocalCacheRecoveryCoordinator.CoordinatedRecoveryResult recovery =
                    recoveryCoordinator.recoverIfCorrupt(error, trigger);
            if (recovery.recovered() || recovery.schemaInitialized()) {
                if (schemaInitializer != null && !recovery.schemaInitialized()) {
                    schemaInitializer.initializeSchemaIfPossible();
                }
                cleared.add("localDb.recovered");
                return true;
            }
            failed.add(new CacheClearResult.Failure("localDb.recovery", recovery.message()));
            return false;
        } catch (Exception recoveryError) {
            String message = rootMessage(recoveryError);
            log.warn("Failed to recover local cache database during clear: trigger={}, error={}", trigger, message);
            failed.add(new CacheClearResult.Failure("localDb.recovery", message));
            return false;
        }
    }

    private void pruneBackupArtifacts(List<String> cleared, List<CacheClearResult.Failure> failed) {
        if (retentionService == null) {
            return;
        }
        try {
            retentionService.pruneBackupArtifacts();
            cleared.add("localDb.backupArtifacts");
        } catch (Exception e) {
            String message = rootMessage(e);
            log.warn("Failed to prune local cache backup artifacts: error={}", message);
            failed.add(new CacheClearResult.Failure("localDb.backupArtifacts", message));
        }
    }

    private long deleteTable(String tableName) {
        try {
            return jdbcTemplate.update("DELETE FROM " + tableName);
        } catch (Exception e) {
            log.warn("Failed to clear local cache table: table={}, error={}", tableName, e.getMessage());
            throw new IllegalStateException("failed to clear local database table " + tableName, e);
        }
    }

    private void clearItem(
            String name,
            Runnable operation,
            List<String> cleared,
            List<CacheClearResult.Failure> failed) {
        try {
            operation.run();
            cleared.add(name);
        } catch (Exception e) {
            String message = rootMessage(e);
            log.warn("Failed to clear cache item: name={}, error={}", name, message);
            failed.add(new CacheClearResult.Failure(name, message));
        }
    }

    private String rootMessage(Exception e) {
        Throwable current = e;
        while (current.getCause() != null) {
            current = current.getCause();
        }
        String message = current.getMessage();
        return message == null || message.isBlank() ? current.getClass().getSimpleName() : message;
    }

    private String message(
            boolean success,
            List<String> cleared,
            List<CacheClearResult.Failure> failed) {
        if (success) {
            return "cache cleared";
        }
        if (cleared.isEmpty()) {
            return "cache clear failed: " + failedNames(failed);
        }
        return "cache clear completed with failures: " + failedNames(failed);
    }

    private String failedNames(List<CacheClearResult.Failure> failed) {
        return failed.stream()
                .map(CacheClearResult.Failure::getName)
                .reduce((left, right) -> left + ", " + right)
                .orElse("unknown");
    }

    private String normalizeScope(String scope) {
        if (scope == null || scope.isBlank()) {
            return SCOPE_ALL;
        }

        String trimmed = scope.trim();
        String lower = trimmed.toLowerCase(Locale.ROOT);
        return switch (lower) {
            case SCOPE_ALL -> SCOPE_ALL;
            case SCOPE_MEMORY -> SCOPE_MEMORY;
            case "localdb" -> SCOPE_LOCAL_DB;
            default -> trimmed;
        };
    }

    private String normalizeMode(String mode) {
        if (mode == null || mode.isBlank()) {
            return MODE_NORMAL;
        }
        return mode.trim().toLowerCase(Locale.ROOT);
    }

    private boolean isSupportedScope(String scope) {
        return SCOPE_ALL.equals(scope) || SCOPE_MEMORY.equals(scope) || SCOPE_LOCAL_DB.equals(scope);
    }

    private boolean isSupportedMode(String mode) {
        return MODE_NORMAL.equals(mode) || MODE_DEEP.equals(mode);
    }

    private long readDatabaseSizeBytes() {
        if (localDataPathService == null) {
            return 0;
        }
        try {
            Path databasePath = localDataPathService.getCacheDatabasePath();
            if (databasePath == null) {
                return 0;
            }
            Path h2File = databasePath.resolveSibling(databasePath.getFileName() + ".mv.db");
            if (Files.exists(h2File)) {
                return Files.size(h2File);
            }
            return Files.exists(databasePath) ? Files.size(databasePath) : 0;
        } catch (Exception e) {
            log.warn("Failed to read local cache database size during clear: error={}", e.getMessage());
            return 0;
        }
    }

    private CacheClearResult result(
            boolean success,
            String scope,
            String message,
            List<String> cleared,
            List<CacheClearResult.Failure> failed,
            long deletedRows,
            String mode,
            long databaseSizeBeforeBytes,
            long databaseSizeAfterBytes,
            boolean compacted,
            long retentionDeletedRows) {
        return CacheClearResult.builder()
                .success(success)
                .scope(scope)
                .mode(mode)
                .message(message)
                .cleared(cleared)
                .failed(failed)
                .deletedRows(deletedRows)
                .databaseSizeBeforeBytes(databaseSizeBeforeBytes)
                .databaseSizeAfterBytes(databaseSizeAfterBytes)
                .compacted(compacted)
                .retentionDeletedRows(retentionDeletedRows)
                .timestamp(System.currentTimeMillis())
                .build();
    }
}
