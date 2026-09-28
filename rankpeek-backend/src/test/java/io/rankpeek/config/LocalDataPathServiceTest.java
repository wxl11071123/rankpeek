package io.rankpeek.config;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class LocalDataPathServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void defaultRootKeepsExistingProductionLocationWhenSimulatorIsDisabled() {
        LocalDataPathService service = new LocalDataPathService("", false);

        Path root = service.getLocalDataRoot();

        assertThat(root).isEqualTo(expectedDefaultRoot());
    }

    @Test
    void simulatorRootUsesIsolatedTempLocationWhenNoExplicitRootIsConfigured() {
        String originalTmpDir = System.getProperty("java.io.tmpdir");
        try {
            System.setProperty("java.io.tmpdir", tempDir.toString());
            LocalDataPathService service = new LocalDataPathService("", true);

            Path root = service.getLocalDataRoot();

            assertThat(root).isEqualTo(tempDir.resolve("RankPeek").resolve("simulator"));
            assertThat(root.startsWith(expectedDefaultRoot())).isFalse();
            assertThat(service.getCacheDatabasePath()).isEqualTo(root.resolve("cache").resolve("rankpeek-cache"));
            assertThat(service.getUserStorePath()).isEqualTo(root.resolve("user-store").resolve("rankpeek-user-store.json"));
        } finally {
            System.setProperty("java.io.tmpdir", originalTmpDir);
        }
    }

    @Test
    void explicitRootOverridesSimulatorAndDefaultLocations() {
        Path configuredRoot = tempDir.resolve("configured-root");

        LocalDataPathService simulatorService = new LocalDataPathService(configuredRoot.toString(), true);
        LocalDataPathService productionService = new LocalDataPathService(configuredRoot.toString(), false);

        assertThat(simulatorService.getLocalDataRoot()).isEqualTo(configuredRoot);
        assertThat(productionService.getLocalDataRoot()).isEqualTo(configuredRoot);
        assertThat(simulatorService.getCacheDatabasePath())
                .isEqualTo(configuredRoot.resolve("cache").resolve("rankpeek-cache"));
        assertThat(simulatorService.getUserStorePath())
                .isEqualTo(configuredRoot.resolve("user-store").resolve("rankpeek-user-store.json"));
    }

    private Path expectedDefaultRoot() {
        if (System.getProperty("os.name", "").toLowerCase().contains("win")) {
            String appData = System.getenv("APPDATA");
            if (appData != null && !appData.isBlank()) {
                return Path.of(appData, "RankPeek");
            }
        }
        return Path.of(System.getProperty("user.home", "."), ".rankpeek");
    }
}
