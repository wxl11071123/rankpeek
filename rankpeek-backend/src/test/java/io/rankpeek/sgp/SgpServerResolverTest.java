package io.rankpeek.sgp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.rankpeek.service.LcuHttpClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SgpServerResolverTest {

    @Mock
    private LcuHttpClient lcuHttpClient;
    @Mock
    private SgpTokenService tokenService;

    private SgpServerResolver resolver;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        SgpServerConfigService configService = new SgpServerConfigService(
                objectMapper,
                new ByteArrayResource("""
                        {
                          "servers": [
                            {
                              "platformId": "NA1",
                              "aliases": ["NA"],
                              "sgpServerId": "NA1",
                              "matchHistoryBaseUrl": "https://usw2-red.pp.sgp.pvp.net",
                              "commonBaseUrl": "https://na-red.lol.sgp.pvp.net"
                            },
                            {
                              "platformId": "PBE1",
                              "aliases": ["PBE"],
                              "sgpServerId": "PBE1",
                              "commonBaseUrl": "https://pbe-red.lol.sgp.pvp.net"
                            },
                            {
                              "platformId": "HN1",
                              "aliases": ["TENCENT_HN1"],
                              "sgpServerId": "HN1",
                              "matchHistoryBaseUrl": "https://hn1-k8s-sgp.lol.qq.com:21019",
                              "commonBaseUrl": "https://hn1-k8s-sgp.lol.qq.com:21019"
                            }
                          ]
                        }
                        """.getBytes(StandardCharsets.UTF_8))
        );
        resolver = new SgpServerResolver(configService, lcuHttpClient, tokenService);
        when(tokenService.getAuthState()).thenReturn(missingAuthState());
    }

    @Test
    void resolveCurrentStatus_returnsSupportedStatusForCurrentPlatformAlias() {
        when(lcuHttpClient.get("riotclient/region-locale", JsonNode.class)).thenReturn(regionLocale("NA"));

        SgpStatus status = resolver.resolveCurrentStatus();

        assertThat(status.isSupported()).isTrue();
        assertThat(status.getPlatformId()).isEqualTo("NA1");
        assertThat(status.getSgpServerId()).isEqualTo("NA1");
        assertThat(status.isMatchHistorySupported()).isTrue();
        assertThat(status.isCommonSupported()).isTrue();
        assertThat(status.getMatchHistoryBaseUrl()).isEqualTo("https://usw2-red.pp.sgp.pvp.net");
        assertThat(status.getCommonBaseUrl()).isEqualTo("https://na-red.lol.sgp.pvp.net");
        assertThat(status.isTokenReady()).isFalse();
        assertThat(status.getAuthState().isReady()).isFalse();
    }

    @Test
    void resolveCurrentStatus_includesReadyTokenStateWhenTokensArePresent() {
        when(lcuHttpClient.get("riotclient/region-locale", JsonNode.class)).thenReturn(regionLocale("NA"));
        when(tokenService.getAuthState()).thenReturn(SgpAuthState.builder()
                .entitlementsToken("entitlements-token-secret")
                .leagueSessionToken("league-session-token-secret")
                .entitlementsTokenReady(true)
                .leagueSessionTokenReady(true)
                .ready(true)
                .message("SGP token ready")
                .build());

        SgpStatus status = resolver.resolveCurrentStatus();

        assertThat(status.isTokenReady()).isTrue();
        assertThat(status.getAuthState().isEntitlementsTokenReady()).isTrue();
        assertThat(status.getAuthState().isLeagueSessionTokenReady()).isTrue();
    }

    @Test
    void resolveCurrentStatus_prefersLeagueSessionRegionWhenRegionLocaleOnlyReportsTencent() {
        when(lcuHttpClient.get("riotclient/region-locale", JsonNode.class)).thenReturn(regionLocale("CN"));
        when(tokenService.getAuthState()).thenReturn(SgpAuthState.builder()
                .entitlementsToken("entitlements-token-secret")
                .leagueSessionToken(jwtWithRegion("HN1"))
                .entitlementsTokenReady(true)
                .leagueSessionTokenReady(true)
                .ready(true)
                .message("SGP token ready")
                .build());

        SgpStatus status = resolver.resolveCurrentStatus();

        assertThat(status.isSupported()).isTrue();
        assertThat(status.getPlatformId()).isEqualTo("HN1");
        assertThat(status.getSgpServerId()).isEqualTo("HN1");
        assertThat(status.getMatchHistoryBaseUrl()).isEqualTo("https://hn1-k8s-sgp.lol.qq.com:21019");
        assertThat(status.isTokenReady()).isTrue();
    }

    @Test
    void resolveCurrentStatus_usesNestedTencentPlatformWhenLeagueSessionRegIsOnlyCn() {
        when(lcuHttpClient.get("riotclient/region-locale", JsonNode.class)).thenReturn(regionLocale("CN"));
        when(tokenService.getAuthState()).thenReturn(SgpAuthState.builder()
                .entitlementsToken("entitlements-token-secret")
                .leagueSessionToken(jwtWithPayload("""
                        {"reg":"CN","dat":{"r":"HN1"},"lol":{"cpid":"HN1"}}
                        """))
                .entitlementsTokenReady(true)
                .leagueSessionTokenReady(true)
                .ready(true)
                .message("SGP token ready")
                .build());

        SgpStatus status = resolver.resolveCurrentStatus();

        assertThat(status.isSupported()).isTrue();
        assertThat(status.getPlatformId()).isEqualTo("HN1");
        assertThat(status.getSgpServerId()).isEqualTo("HN1");
        assertThat(status.isMatchHistorySupported()).isTrue();
        assertThat(status.isCommonSupported()).isTrue();
    }

    @Test
    void resolveCurrentStatus_returnsClearTencentPlatformMissingStateWhenOnlyCnIsKnown() {
        when(lcuHttpClient.get("riotclient/region-locale", JsonNode.class)).thenReturn(regionLocale("CN"));

        SgpStatus status = resolver.resolveCurrentStatus();

        assertThat(status.isSupported()).isFalse();
        assertThat(status.getPlatformId()).isEqualTo("CN");
        assertThat(status.getSgpServerId()).isNull();
        assertThat(status.getMessage()).contains("腾讯").contains("细分区服");
    }

    @Test
    void resolveCurrentStatus_marksServerUnsupportedWhenMatchHistoryBaseUrlIsMissing() {
        when(lcuHttpClient.get("riotclient/region-locale", JsonNode.class)).thenReturn(regionLocale("PBE"));

        SgpStatus status = resolver.resolveCurrentStatus();

        assertThat(status.isSupported()).isFalse();
        assertThat(status.getPlatformId()).isEqualTo("PBE1");
        assertThat(status.isMatchHistorySupported()).isFalse();
        assertThat(status.isCommonSupported()).isTrue();
    }

    @Test
    void resolveCurrentStatus_returnsClearUnsupportedStateForUnknownPlatform() {
        when(lcuHttpClient.get("riotclient/region-locale", JsonNode.class)).thenReturn(regionLocale("UNKNOWN"));

        SgpStatus status = resolver.resolveCurrentStatus();

        assertThat(status.isSupported()).isFalse();
        assertThat(status.getPlatformId()).isEqualTo("UNKNOWN");
        assertThat(status.getSgpServerId()).isNull();
        assertThat(status.getMessage()).contains("暂不支持");
    }

    @Test
    void resolveCurrentStatus_returnsDisconnectedStateWhenLcuPlatformCannotBeRead() {
        when(lcuHttpClient.get("riotclient/region-locale", JsonNode.class)).thenThrow(new RuntimeException("LCU offline"));

        SgpStatus status = resolver.resolveCurrentStatus();

        assertThat(status.isSupported()).isFalse();
        assertThat(status.getPlatformId()).isNull();
        assertThat(status.getMessage()).contains("无法获取");
        assertThat(status.getAuthState().isReady()).isFalse();
    }

    private ObjectNode regionLocale(String region) {
        ObjectNode node = objectMapper.createObjectNode();
        node.put("region", region);
        return node;
    }

    private SgpAuthState missingAuthState() {
        return SgpAuthState.builder()
                .entitlementsTokenReady(false)
                .leagueSessionTokenReady(false)
                .ready(false)
                .message("SGP token missing")
                .build();
    }

    private String jwtWithRegion(String region) {
        String header = base64Url("{\"alg\":\"none\"}");
        String payload = base64Url("{\"reg\":\"" + region + "\",\"dat\":{\"r\":\"" + region + "\"}}");
        return header + "." + payload + ".signature";
    }

    private String jwtWithPayload(String payloadJson) {
        String header = base64Url("{\"alg\":\"none\"}");
        return header + "." + base64Url(payloadJson.strip()) + ".signature";
    }

    private String base64Url(String value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }
}
