package io.rankpeek.config;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class NativeImageMetadataTest {

    @Test
    void registersCaffeineCachesUsedDuringBackendStartup() throws Exception {
        String reflectConfig = Files.readString(Path.of(
                "src/main/resources/META-INF/native-image/reflect-config.json"));

        assertThat(reflectConfig)
                .contains("com.github.benmanes.caffeine.cache.SSMWW")
                .contains("com.github.benmanes.caffeine.cache.SSMSW")
                .contains("com.github.benmanes.caffeine.cache.PSWMW")
                .contains("com.github.benmanes.caffeine.cache.PSWMS");
    }

    @Test
    void registersSgpServerConfigUsedByNativeJacksonDeserialization() throws Exception {
        String reflectConfig = Files.readString(Path.of(
                "src/main/resources/META-INF/native-image/reflect-config.json"));
        String resourceConfig = Files.readString(Path.of(
                "src/main/resources/META-INF/native-image/resource-config.json"));

        assertThat(reflectConfig)
                .contains("io.rankpeek.sgp.SgpServerConfig")
                .contains("io.rankpeek.sgp.SgpServerEntry");
        assertThat(resourceConfig).contains("sgp/league-servers.json");
    }

    @Test
    void registersPrivateGameDetailRawTeamDtosUsedByLcuBackfill() throws Exception {
        String reflectConfig = Files.readString(Path.of(
                "src/main/resources/META-INF/native-image/reflect-config.json"));

        assertThat(reflectConfig)
                .contains("io.rankpeek.model.GameDetail$RawTeamSummary")
                .contains("io.rankpeek.model.GameDetail$RawTeamObjectives")
                .contains("io.rankpeek.model.GameDetail$RawObjective")
                .contains("io.rankpeek.model.GameDetail$TeamBan");
    }
}
