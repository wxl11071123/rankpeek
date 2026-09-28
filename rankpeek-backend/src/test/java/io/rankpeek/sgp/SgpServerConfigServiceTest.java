package io.rankpeek.sgp;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ClassPathResource;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class SgpServerConfigServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void findByPlatformId_readsConfigAndResolvesAliasesCaseInsensitively() {
        SgpServerConfigService service = createService("""
                {
                  "servers": [
                    {
                      "platformId": "NA1",
                      "aliases": ["NA", "na1"],
                      "sgpServerId": "NA1",
                      "matchHistoryBaseUrl": "https://usw2-red.pp.sgp.pvp.net",
                      "commonBaseUrl": "https://na-red.lol.sgp.pvp.net"
                    }
                  ]
                }
                """);

        SgpServerEntry entry = service.findByPlatformId("na").orElseThrow();

        assertThat(entry.getPlatformId()).isEqualTo("NA1");
        assertThat(entry.getSgpServerId()).isEqualTo("NA1");
        assertThat(entry.isMatchHistorySupported()).isTrue();
        assertThat(entry.isCommonSupported()).isTrue();
    }

    @Test
    void findByPlatformId_returnsEmptyForUnknownPlatform() {
        SgpServerConfigService service = createService("""
                {
                  "servers": []
                }
                """);

        assertThat(service.findByPlatformId("UNKNOWN")).isEmpty();
    }

    @Test
    void findByPlatformId_canRepresentServerWithoutMatchHistorySupport() {
        SgpServerConfigService service = createService("""
                {
                  "servers": [
                    {
                      "platformId": "PBE1",
                      "aliases": ["PBE"],
                      "sgpServerId": "PBE1",
                      "commonBaseUrl": "https://pbe-red.lol.sgp.pvp.net"
                    }
                  ]
                }
                """);

        SgpServerEntry entry = service.findByPlatformId("PBE").orElseThrow();

        assertThat(entry.isMatchHistorySupported()).isFalse();
        assertThat(entry.isCommonSupported()).isTrue();
    }

    @Test
    void builtInConfigContainsNorthAmericaMatchHistoryServer() {
        SgpServerConfigService service = new SgpServerConfigService(
                objectMapper,
                new ClassPathResource("sgp/league-servers.json")
        );

        SgpServerEntry entry = service.findByPlatformId("NA").orElseThrow();

        assertThat(entry.getPlatformId()).isEqualTo("NA1");
        assertThat(entry.isMatchHistorySupported()).isTrue();
        assertThat(entry.getMatchHistoryBaseUrl()).isNotBlank();
    }

    @ParameterizedTest
    @CsvSource({
            "HN1,https://hn1-k8s-sgp.lol.qq.com:21019",
            "HN10,https://hn10-k8s-sgp.lol.qq.com:21019",
            "TJ100,https://tj100-sgp.lol.qq.com:21019",
            "TJ101,https://tj101-sgp.lol.qq.com:21019",
            "NJ100,https://nj100-sgp.lol.qq.com:21019",
            "GZ100,https://gz100-sgp.lol.qq.com:21019",
            "CQ100,https://cq100-sgp.lol.qq.com:21019",
            "BGP2,https://bgp2-k8s-sgp.lol.qq.com:21019"
    })
    void builtInConfigContainsTencentMatchHistoryServers(String platformId, String expectedBaseUrl) {
        SgpServerConfigService service = new SgpServerConfigService(
                objectMapper,
                new ClassPathResource("sgp/league-servers.json")
        );

        SgpServerEntry entry = service.findByPlatformId(platformId).orElseThrow();
        SgpServerEntry aliasEntry = service.findByPlatformId("TENCENT_" + platformId).orElseThrow();

        assertThat(entry.getPlatformId()).isEqualTo(platformId);
        assertThat(entry.getSgpServerId()).isEqualTo(platformId);
        assertThat(entry.getMatchHistoryBaseUrl()).isEqualTo(expectedBaseUrl);
        assertThat(entry.getCommonBaseUrl()).isEqualTo(expectedBaseUrl);
        assertThat(entry.isMatchHistorySupported()).isTrue();
        assertThat(entry.isCommonSupported()).isTrue();
        assertThat(aliasEntry).isSameAs(entry);
    }

    private SgpServerConfigService createService(String json) {
        return new SgpServerConfigService(
                objectMapper,
                new ByteArrayResource(json.getBytes(StandardCharsets.UTF_8))
        );
    }
}
