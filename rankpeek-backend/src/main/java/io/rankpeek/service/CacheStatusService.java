package io.rankpeek.service;

import io.rankpeek.cache.LocalCacheRecoveryService;
import io.rankpeek.cache.LocalCacheRecoveryCoordinator;
import io.rankpeek.cache.LocalCacheSchemaInitializer;
import io.rankpeek.config.LocalDataPathService;
import io.rankpeek.model.CacheStatus;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.function.Predicate;
import java.util.stream.Stream;

@Service
@Slf4j
public class CacheStatusService {

    private final JdbcTemplate jdbcTemplate;
    private final LocalDataPathService localDataPathService;
    private final LocalCacheRecoveryCoordinator recoveryCoordinator;

    @Autowired
    public CacheStatusService(JdbcTemplate jdbcTemplate,
                              LocalDataPathService localDataPathService,
                              LocalCacheRecoveryCoordinator recoveryCoordinator) {
        this.jdbcTemplate = jdbcTemplate;
        this.localDataPathService = localDataPathService;
        this.recoveryCoordinator = recoveryCoordinator;
    }

    public CacheStatusService(JdbcTemplate jdbcTemplate, LocalDataPathService localDataPathService) {
        this(jdbcTemplate, localDataPathService, (LocalCacheRecoveryCoordinator) null);
    }

    public CacheStatusService(JdbcTemplate jdbcTemplate,
                              LocalDataPathService localDataPathService,
                              LocalCacheRecoveryService recoveryService,
                              LocalCacheSchemaInitializer schemaInitializer) {
        this(jdbcTemplate, localDataPathService, recoveryService == null
                ? null
                : new LocalCacheRecoveryCoordinator(
                        recoveryService,
                        java.time.Clock.systemDefaultZone(),
                        () -> schemaInitializer));
    }

    public CacheStatus getStatus() {
        return getStatus(false, null);
    }

    private CacheStatus getStatus(
            boolean recoveryAlreadyAttempted,
            LocalCacheRecoveryCoordinator.CoordinatedRecoveryResult recoveryResult) {
        Path databasePath = resolveDatabasePath();
        String databasePathText = databasePath != null ? databasePath.toString() : "";
        long databaseSizeBytes = readDatabaseSizeBytes(databasePath);
        boolean databaseExists = databaseExists(databasePath);
        boolean lockFileExists = lockFileExists(databasePath);

        try {
            return CacheStatus.builder()
                    .enabled(true)
                    .health(recoveryResult != null && recoveryResult.recovered()
                            ? CacheStatus.Health.RECOVERED
                            : CacheStatus.Health.OK)
                    .databasePath(databasePathText)
                    .databaseSizeBytes(databaseSizeBytes)
                    .lastRecoveryDirectory(recoveryDirectoryText(recoveryResult))
                    .databaseExists(databaseExists)
                    .lockFileExists(lockFileExists)
                    .summonerCount(count("SELECT COUNT(*) FROM summoner_cache"))
                    .rankCount(count("SELECT COUNT(*) FROM rank_cache"))
                    .matchCount(count("SELECT COUNT(*) FROM match_cache"))
                    .gameDetailCount(count("SELECT COUNT(*) FROM game_detail_cache"))
                    .participantCount(count("SELECT COUNT(*) FROM match_participant_cache"))
                    .playerMatchIndexCount(count("SELECT COUNT(*) FROM player_match_index"))
                    .trackedPlayerCount(count("SELECT COUNT(DISTINCT puuid) FROM player_match_index"))
                    .latestMatchCreation(queryLong("SELECT MAX(game_creation) FROM match_cache"))
                    .orphanMatchCount(countOrphans("match_cache"))
                    .orphanGameDetailCount(countOrphans("game_detail_cache"))
                    .orphanParticipantCount(countOrphans("match_participant_cache"))
                    .orphanDataScopeCount(countOrphans("match_data_scope_cache"))
                    .quarantineCount(countArtifacts(databasePath, path ->
                            Files.isDirectory(path)
                                    && path.getFileName().toString().startsWith("rankpeek-cache.corrupt.")))
                    .traceFileCount(countArtifacts(databasePath, path -> {
                        String fileName = path.getFileName().toString();
                        return Files.isRegularFile(path)
                                && fileName.startsWith("rankpeek-cache.trace")
                                && fileName.endsWith(".db");
                    }))
                    .corruptFileCount(countArtifacts(databasePath, path -> {
                        String fileName = path.getFileName().toString();
                        return Files.isRegularFile(path)
                                && fileName.startsWith("rankpeek-cache.corrupt")
                                && fileName.endsWith(".db");
                    }))
                    .build();
        } catch (Exception e) {
            LocalCacheRecoveryCoordinator.CoordinatedRecoveryResult attemptedRecovery = null;
            if (!recoveryAlreadyAttempted) {
                attemptedRecovery = recoverCorruptCache(e);
                if (attemptedRecovery != null
                        && attemptedRecovery.recovered()
                        && attemptedRecovery.schemaInitialized()) {
                    return getStatus(true, attemptedRecovery);
                }
            }
            String rootCause = rootCauseSummary(e);
            log.warn("Failed to read local cache status; reporting cache as disabled: rootCause={}", rootCause, e);
            return disabledStatus(
                    databasePathText,
                    databaseSizeBytes,
                    databaseExists,
                    lockFileExists,
                    failureHealth(e),
                    rootCause,
                    recoveryDirectoryText(attemptedRecovery)
            );
        }
    }

    private LocalCacheRecoveryCoordinator.CoordinatedRecoveryResult recoverCorruptCache(Exception error) {
        if (recoveryCoordinator == null || !recoveryCoordinator.isRecoverableCorruption(error)) {
            return null;
        }

        log.warn("Detected local H2 cache corruption while reading status; attempting cache recovery: rootCause={}",
                recoveryCoordinator.rootCauseSummary(error));
        LocalCacheRecoveryCoordinator.CoordinatedRecoveryResult recoveryResult =
                recoveryCoordinator.recoverIfCorrupt(error, "status.getStatus");
        if (!recoveryResult.recovered()) {
            log.warn("Local H2 cache recovery from status check failed: {}", recoveryResult.message(),
                    recoveryResult.recoveryResult() == null ? error : recoveryResult.recoveryResult().failure());
            return recoveryResult;
        }

        if (recoveryResult.schemaInitialized()) {
            log.info("Local cache schema initialized after status-triggered H2 cache recovery");
        } else {
            log.warn("Local cache schema initialization failed after status-triggered H2 cache recovery");
        }
        return recoveryResult;
    }

    private CacheStatus disabledStatus(
            String databasePath,
            long databaseSizeBytes,
            boolean databaseExists,
            boolean lockFileExists,
            CacheStatus.Health health,
            String lastError,
            String lastRecoveryDirectory) {
        return CacheStatus.builder()
                .enabled(false)
                .health(health)
                .databasePath(databasePath)
                .databaseSizeBytes(databaseSizeBytes)
                .lastError(lastError)
                .lastRecoveryDirectory(lastRecoveryDirectory)
                .databaseExists(databaseExists)
                .lockFileExists(lockFileExists)
                .summonerCount(0)
                .rankCount(0)
                .matchCount(0)
                .gameDetailCount(0)
                .participantCount(0)
                .playerMatchIndexCount(0)
                .trackedPlayerCount(0)
                .latestMatchCreation(null)
                .build();
    }

    private long count(String sql) {
        Long value = queryLong(sql);
        return value != null ? value : 0;
    }

    private Long queryLong(String sql) {
        return jdbcTemplate.queryForObject(sql, Long.class);
    }

    private long countOrphans(String tableName) {
        return count("""
                SELECT COUNT(*)
                FROM %s
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM player_match_index
                    WHERE player_match_index.game_id = %s.game_id
                )
                """.formatted(tableName, tableName));
    }

    private Path resolveDatabasePath() {
        try {
            return localDataPathService.getCacheDatabasePath().toAbsolutePath();
        } catch (Exception e) {
            log.warn("Failed to resolve local cache database path: error={}", e.getMessage());
            return null;
        }
    }

    private CacheStatus.Health failureHealth(Exception error) {
        if (recoveryCoordinator != null && recoveryCoordinator.isRecoverableCorruption(error)) {
            return CacheStatus.Health.CORRUPT;
        }
        if (recoveryCoordinator != null && recoveryCoordinator.isLockedOrUnavailable(error)) {
            return CacheStatus.Health.LOCKED;
        }
        return CacheStatus.Health.ERROR;
    }

    private String recoveryDirectoryText(LocalCacheRecoveryCoordinator.CoordinatedRecoveryResult recoveryResult) {
        if (recoveryResult != null
                && recoveryResult.recoveryResult() != null
                && recoveryResult.recoveryResult().quarantineDirectory() != null) {
            return recoveryResult.recoveryResult().quarantineDirectory().toString();
        }
        if (recoveryCoordinator == null) {
            return null;
        }
        return recoveryCoordinator.getLastRecoveryResult()
                .filter(LocalCacheRecoveryService.RecoveryResult::recovered)
                .map(LocalCacheRecoveryService.RecoveryResult::quarantineDirectory)
                .map(Path::toString)
                .orElse(null);
    }

    private String rootCauseSummary(Exception error) {
        if (recoveryCoordinator != null) {
            return recoveryCoordinator.rootCauseSummary(error);
        }

        Throwable current = error;
        while (current.getCause() != null) {
            current = current.getCause();
        }
        String message = current.getMessage();
        if (message == null || message.isBlank()) {
            message = error.getMessage();
        }
        return current.getClass().getSimpleName() + ": " + message;
    }

    private long readDatabaseSizeBytes(Path databasePath) {
        if (databasePath == null) {
            return 0;
        }

        try {
            Path h2File = databasePath.resolveSibling(databasePath.getFileName() + ".mv.db");
            if (Files.exists(h2File)) {
                return Files.size(h2File);
            }
            if (Files.exists(databasePath)) {
                return Files.size(databasePath);
            }
        } catch (Exception e) {
            log.warn("Failed to read local cache database size: path={}, error={}", databasePath, e.getMessage());
        }
        return 0;
    }

    private boolean databaseExists(Path databasePath) {
        if (databasePath == null) {
            return false;
        }
        Path h2File = databasePath.resolveSibling(databasePath.getFileName() + ".mv.db");
        return Files.exists(h2File);
    }

    private boolean lockFileExists(Path databasePath) {
        if (databasePath == null) {
            return false;
        }
        Path lockFile = databasePath.resolveSibling(databasePath.getFileName() + ".lock.db");
        return Files.exists(lockFile);
    }

    private long countArtifacts(Path databasePath, Predicate<Path> predicate) {
        if (databasePath == null || databasePath.getParent() == null || !Files.isDirectory(databasePath.getParent())) {
            return 0;
        }
        try (Stream<Path> paths = Files.list(databasePath.getParent())) {
            return paths.filter(predicate).count();
        } catch (Exception e) {
            log.warn("Failed to count local cache artifacts: path={}, error={}",
                    databasePath.getParent(),
                    e.getMessage());
            return 0;
        }
    }
}
