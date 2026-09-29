package io.rankpeek.cache;

import com.zaxxer.hikari.HikariDataSource;
import io.rankpeek.config.LocalDataPathService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.io.EOFException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

@Slf4j
@Service
public class LocalCacheRecoveryService {

    private static final DateTimeFormatter QUARANTINE_TIMESTAMP_FORMAT =
            DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss");

    private final LocalDataPathService localDataPathService;
    private final Clock clock;
    private final DataSource dataSource;
    private final AtomicReference<RecoveryResult> lastRecoveryResult = new AtomicReference<>();

    @Autowired
    public LocalCacheRecoveryService(LocalDataPathService localDataPathService, DataSource dataSource) {
        this(localDataPathService, Clock.systemDefaultZone(), dataSource);
    }

    public LocalCacheRecoveryService(LocalDataPathService localDataPathService, Clock clock) {
        this(localDataPathService, clock, null);
    }

    public LocalCacheRecoveryService(LocalDataPathService localDataPathService, Clock clock, DataSource dataSource) {
        this.localDataPathService = localDataPathService;
        this.clock = clock;
        this.dataSource = dataSource;
    }

    public boolean isRecoverableCorruption(Throwable error) {
        if (error == null) {
            return false;
        }

        boolean hasH2Marker = false;
        boolean hasEof = false;
        for (Throwable current = error; current != null; current = current.getCause()) {
            String className = current.getClass().getName().toLowerCase(Locale.ROOT);
            String message = current.getMessage() == null
                    ? ""
                    : current.getMessage().toLowerCase(Locale.ROOT);
            String combined = className + " " + message;

            if (combined.contains("org.h2")
                    || combined.contains("mvstoreexception")
                    || combined.contains("jdbcsqlnontransientexception")) {
                hasH2Marker = true;
            }
            if (current instanceof EOFException || combined.contains("eofexception")) {
                hasEof = true;
            }
            if (containsCorruptionMessage(combined)) {
                return true;
            }
            if (combined.contains("database has been closed") && combined.contains("90098")) {
                return true;
            }
            if (hasH2Marker && (combined.contains("outofmemoryerror") || combined.contains("java heap space"))) {
                return true;
            }
        }

        return hasH2Marker && hasEof;
    }

    public RecoveryResult quarantineIfRecoverable(Throwable error) {
        if (!isRecoverableCorruption(error)) {
            return RecoveryResult.notAttempted("error is not recognized as local H2 corruption");
        }

        Path databasePath = localDataPathService.getCacheDatabasePath().toAbsolutePath();
        log.warn("Detected local H2 cache corruption: databasePath={}, rootCause={}",
                databasePath,
                rootCauseSummary(error));

        try {
            List<Path> cacheFiles = findH2CacheFiles(databasePath);
            evictHikariConnections();

            if (cacheFiles.isEmpty()) {
                log.warn("No local H2 cache files found to quarantine for databasePath={}", databasePath);
                RecoveryResult result = RecoveryResult.recovered(null, List.of(), "no H2 cache files found");
                lastRecoveryResult.set(result);
                return result;
            }

            Path quarantineDirectory = createQuarantineDirectory(databasePath);
            List<Path> quarantinedFiles = new ArrayList<>();
            for (Path cacheFile : cacheFiles) {
                Path target = quarantineDirectory.resolve(cacheFile.getFileName());
                Files.move(cacheFile, target);
                quarantinedFiles.add(target);
                log.warn("Quarantined local H2 cache file: {} -> {}", cacheFile, target);
            }

            log.info("Local H2 cache quarantine complete: directory={}, files={}",
                    quarantineDirectory,
                    quarantinedFiles.stream()
                            .map(path -> path.getFileName().toString())
                            .toList());
            RecoveryResult result = RecoveryResult.recovered(quarantineDirectory, List.copyOf(quarantinedFiles),
                    "quarantined corrupt local H2 cache files");
            lastRecoveryResult.set(result);
            return result;
        } catch (Exception e) {
            log.warn("Failed to quarantine corrupt local H2 cache files; persistent cache will remain disabled: rootCause={}",
                    rootCauseSummary(e),
                    e);
            RecoveryResult result = RecoveryResult.failed("failed to quarantine corrupt local H2 cache files", e);
            lastRecoveryResult.set(result);
            return result;
        }
    }

    public boolean isLockedOrUnavailable(Throwable error) {
        if (error == null) {
            return false;
        }

        for (Throwable current = error; current != null; current = current.getCause()) {
            String className = current.getClass().getName().toLowerCase(Locale.ROOT);
            String message = current.getMessage() == null
                    ? ""
                    : current.getMessage().toLowerCase(Locale.ROOT);
            String combined = className + " " + message;

            if (combined.contains("database may be already in use")
                    || combined.contains("locked by another process")
                    || combined.contains("file locked")
                    || combined.contains("database is locked")
                    || combined.contains("connection is not available")
                    || combined.contains("request timed out")
                    || combined.contains("sqltransientconnectionexception")) {
                return true;
            }
        }

        return false;
    }

    public String rootCauseSummary(Throwable error) {
        if (error == null) {
            return "";
        }

        Throwable current = error;
        while (current.getCause() != null) {
            current = current.getCause();
        }
        String message = current.getMessage();
        if (message == null || message.isBlank()) {
            message = error.getMessage();
        }
        if (message == null || message.isBlank()) {
            message = current.getClass().getSimpleName();
        }
        return current.getClass().getSimpleName() + ": " + message;
    }

    public Optional<RecoveryResult> getLastRecoveryResult() {
        return Optional.ofNullable(lastRecoveryResult.get());
    }

    private boolean containsCorruptionMessage(String text) {
        return text.contains("file corrupted while reading record")
                || text.contains("file corrupted in chunk")
                || text.contains("file version error")
                || text.contains("store header is corrupt")
                || text.contains("unsupported database file version")
                || text.contains("invalid file header")
                || (text.contains("write format") && text.contains("larger than the supported format"));
    }

    private List<Path> findH2CacheFiles(Path databasePath) throws IOException {
        Path parent = databasePath.getParent();
        if (parent == null || !Files.isDirectory(parent)) {
            return List.of();
        }

        String baseName = databasePath.getFileName().toString();
        try (var paths = Files.list(parent)) {
            return paths
                    .filter(Files::isRegularFile)
                    .filter(path -> isH2CacheFile(baseName, path.getFileName().toString()))
                    .sorted(Comparator.comparing(path -> path.getFileName().toString()))
                    .toList();
        }
    }

    private boolean isH2CacheFile(String baseName, String fileName) {
        return fileName.equals(baseName + ".mv.db")
                || fileName.equals(baseName + ".h2.db")
                || fileName.equals(baseName + ".trace.db")
                || fileName.equals(baseName + ".lock.db")
                || fileName.equals(baseName + ".temp.db")
                || fileName.equals(baseName + ".newFile")
                || fileName.equals(baseName + ".oldFile")
                || fileName.startsWith(baseName + ".mv.db.")
                || fileName.startsWith(baseName + ".temp.");
    }

    private Path createQuarantineDirectory(Path databasePath) throws IOException {
        Path parent = databasePath.getParent();
        if (parent == null) {
            parent = Path.of(".").toAbsolutePath();
        }

        String baseName = databasePath.getFileName().toString();
        String timestamp = QUARANTINE_TIMESTAMP_FORMAT.withZone(clock.getZone()).format(clock.instant());
        Path candidate = parent.resolve(baseName + ".corrupt." + timestamp);
        int suffix = 2;
        while (Files.exists(candidate)) {
            candidate = parent.resolve(baseName + ".corrupt." + timestamp + "-" + suffix);
            suffix++;
        }
        return Files.createDirectories(candidate);
    }

    private void evictHikariConnections() {
        if (dataSource instanceof HikariDataSource hikariDataSource && !hikariDataSource.isClosed()) {
            try {
                var poolMxBean = hikariDataSource.getHikariPoolMXBean();
                if (poolMxBean != null) {
                    poolMxBean.softEvictConnections();
                    log.info("Evicted local cache Hikari connections before quarantine");
                }
            } catch (Exception e) {
                log.debug("Failed to evict local cache Hikari connections before quarantine", e);
            }
        }
    }

    public record RecoveryResult(
            boolean attempted,
            boolean recovered,
            Path quarantineDirectory,
            List<Path> quarantinedFiles,
            String message,
            Throwable failure
    ) {
        private static RecoveryResult notAttempted(String message) {
            return new RecoveryResult(false, false, null, List.of(), message, null);
        }

        private static RecoveryResult recovered(Path quarantineDirectory, List<Path> quarantinedFiles, String message) {
            return new RecoveryResult(true, true, quarantineDirectory, quarantinedFiles, message, null);
        }

        private static RecoveryResult failed(String message, Throwable failure) {
            return new RecoveryResult(true, false, null, List.of(), message, failure);
        }
    }
}
