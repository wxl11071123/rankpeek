package io.rankpeek.service;

import io.rankpeek.cache.LocalCacheRecoveryCoordinator;
import io.rankpeek.cache.LocalCacheRecoveryService;
import io.rankpeek.cache.LocalCacheSchemaInitializer;
import io.rankpeek.config.LocalDataPathService;
import io.rankpeek.model.CacheRepairResult;
import io.rankpeek.model.CacheStatus;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class CacheRepairService {

    private final JdbcTemplate jdbcTemplate;
    private final LocalDataPathService localDataPathService;
    private final LocalCacheRecoveryCoordinator recoveryCoordinator;
    private final LocalCacheSchemaInitializer schemaInitializer;

    public CacheRepairResult repair(boolean confirm) {
        if (!confirm) {
            return result(
                    false,
                    false,
                    CacheStatus.Health.DISABLED,
                    "confirm=true is required",
                    null,
                    List.of(),
                    null
            );
        }

        Path databasePath = resolveDatabasePath();
        try {
            jdbcTemplate.queryForObject("SELECT 1", Integer.class);
            boolean initialized = schemaInitializer == null || schemaInitializer.initializeSchemaIfPossible();
            if (!initialized) {
                return result(
                        false,
                        false,
                        CacheStatus.Health.ERROR,
                        "local cache schema initialization failed",
                        null,
                        List.of(),
                        null
                );
            }
            return result(
                    true,
                    false,
                    CacheStatus.Health.OK,
                    "local H2 cache is healthy",
                    null,
                    List.of(),
                    null
            );
        } catch (Exception e) {
            String rootCause = rootCauseSummary(e);
            log.warn("Manual local H2 cache repair check failed: databasePath={}, rootCause={}",
                    databasePath,
                    rootCause,
                    e);

            if (recoveryCoordinator == null) {
                return result(
                        false,
                        false,
                        CacheStatus.Health.ERROR,
                        "local H2 cache repair is unavailable",
                        null,
                        List.of(),
                        rootCause
                );
            }

            if (!recoveryCoordinator.isRecoverableCorruption(e)) {
                if (recoveryCoordinator.isLockedOrUnavailable(e)) {
                    return result(
                            false,
                            false,
                            CacheStatus.Health.LOCKED,
                            "local H2 cache is locked; another backend or packaged RankPeek instance may be running",
                            null,
                            List.of(),
                            rootCause
                    );
                }

                return result(
                        false,
                        false,
                        CacheStatus.Health.ERROR,
                        "local H2 cache check failed but was not recognized as recoverable corruption",
                        null,
                        List.of(),
                        rootCause
                );
            }

            LocalCacheRecoveryCoordinator.CoordinatedRecoveryResult recovery =
                    recoveryCoordinator.recoverIfCorrupt(e, "manual-cache-repair");
            LocalCacheRecoveryService.RecoveryResult recoveryResult = recovery.recoveryResult();
            boolean schemaInitialized = recovery.schemaInitialized();
            if (recoveryResult != null && recoveryResult.recovered() && !schemaInitialized && schemaInitializer != null) {
                schemaInitialized = schemaInitializer.initializeSchemaIfPossible();
            }

            if (recoveryResult != null && recoveryResult.recovered() && schemaInitialized) {
                return result(
                        true,
                        true,
                        CacheStatus.Health.RECOVERED,
                        "local H2 cache repaired",
                        recoveryResult.quarantineDirectory() == null ? null : recoveryResult.quarantineDirectory().toString(),
                        movedFileNames(recoveryResult),
                        rootCause
                );
            }

            return result(
                    false,
                    false,
                    CacheStatus.Health.CORRUPT,
                    recovery == null ? "local H2 cache repair failed" : recovery.message(),
                    recoveryResult == null || recoveryResult.quarantineDirectory() == null
                            ? null
                            : recoveryResult.quarantineDirectory().toString(),
                    recoveryResult == null ? List.of() : movedFileNames(recoveryResult),
                    rootCause
            );
        }
    }

    private Path resolveDatabasePath() {
        try {
            return localDataPathService.getCacheDatabasePath().toAbsolutePath();
        } catch (Exception e) {
            log.warn("Failed to resolve local cache database path before repair: rootCause={}",
                    rootCauseSummary(e),
                    e);
            return null;
        }
    }

    private List<String> movedFileNames(LocalCacheRecoveryService.RecoveryResult recoveryResult) {
        return recoveryResult.quarantinedFiles().stream()
                .map(path -> path.getFileName().toString())
                .toList();
    }

    private String rootCauseSummary(Throwable error) {
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

    private CacheRepairResult result(
            boolean success,
            boolean repaired,
            CacheStatus.Health health,
            String message,
            String quarantineDirectory,
            List<String> movedFiles,
            String lastError) {
        return CacheRepairResult.builder()
                .success(success)
                .repaired(repaired)
                .health(health)
                .message(message)
                .quarantineDirectory(quarantineDirectory)
                .movedFiles(movedFiles)
                .lastError(lastError)
                .timestamp(System.currentTimeMillis())
                .build();
    }
}
