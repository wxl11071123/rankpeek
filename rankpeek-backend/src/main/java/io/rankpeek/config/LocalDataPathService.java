package io.rankpeek.config;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;

/**
 * Resolves RankPeek local data paths without making application startup depend on disk availability.
 */
@Slf4j
@Service
public class LocalDataPathService {

    private static final String APP_DIRECTORY_NAME = "RankPeek";
    private static final String CACHE_DIRECTORY_NAME = "cache";
    private static final String USER_STORE_DIRECTORY_NAME = "user-store";
    private static final String USER_STORE_FILE_NAME = "rankpeek-user-store.json";
    private static final String SIMULATOR_DIRECTORY_NAME = "simulator";

    private final Path localDataRoot;
    private final String localDataRootSource;

    public LocalDataPathService() {
        this("", false);
    }

    @Autowired
    public LocalDataPathService(
            @Value("${rankpeek.local-data-root:}") String configuredLocalDataRoot,
            @Value("${rankpeek.simulator.enabled:false}") boolean simulatorEnabled) {
        Path configuredRoot = parseConfiguredRoot(configuredLocalDataRoot);
        if (configuredRoot != null) {
            this.localDataRoot = configuredRoot;
            this.localDataRootSource = "rankpeek.local-data-root";
        } else if (simulatorEnabled) {
            this.localDataRoot = resolveSimulatorDataRoot();
            this.localDataRootSource = "rankpeek.simulator.enabled";
        } else {
            this.localDataRoot = resolveDefaultDataRoot();
            this.localDataRootSource = "default";
        }
    }

    @PostConstruct
    public void logLocalDataRoot() {
        log.info("RankPeek local data root: {} (source={})",
                localDataRoot.toAbsolutePath(),
                localDataRootSource);
    }

    public Path getLocalDataRoot() {
        return localDataRoot;
    }

    public Path getCacheDatabasePath() {
        Path cacheDirectory = getCacheDirectory();
        try {
            Files.createDirectories(cacheDirectory);
        } catch (IOException e) {
            log.warn("Failed to create local cache directory: {}", cacheDirectory, e);
        }
        return cacheDirectory.resolve("rankpeek-cache");
    }

    public Path getUserDataDirectory() {
        Path userDataDirectory = resolveUserDataDirectory();
        try {
            Files.createDirectories(userDataDirectory);
        } catch (IOException e) {
            log.warn("Failed to create RankPeek user store directory: {}", userDataDirectory, e);
        }
        return userDataDirectory;
    }

    public Path getUserStorePath() {
        return getUserDataDirectory().resolve(USER_STORE_FILE_NAME);
    }

    private Path getCacheDirectory() {
        return localDataRoot.resolve(CACHE_DIRECTORY_NAME);
    }

    private Path resolveUserDataDirectory() {
        return localDataRoot.resolve(USER_STORE_DIRECTORY_NAME);
    }

    private Path parseConfiguredRoot(String configuredLocalDataRoot) {
        if (configuredLocalDataRoot == null || configuredLocalDataRoot.isBlank()) {
            return null;
        }
        return Path.of(configuredLocalDataRoot.trim());
    }

    private Path resolveSimulatorDataRoot() {
        return Path.of(System.getProperty("java.io.tmpdir", "."),
                APP_DIRECTORY_NAME,
                SIMULATOR_DIRECTORY_NAME);
    }

    private Path resolveDefaultDataRoot() {
        if (isWindows()) {
            String appData = System.getenv("APPDATA");
            if (appData != null && !appData.isBlank()) {
                return Path.of(appData, APP_DIRECTORY_NAME);
            }
        }
        return Path.of(System.getProperty("user.home", "."), ".rankpeek");
    }

    private boolean isWindows() {
        return System.getProperty("os.name", "")
                .toLowerCase(Locale.ROOT)
                .contains("win");
    }
}
