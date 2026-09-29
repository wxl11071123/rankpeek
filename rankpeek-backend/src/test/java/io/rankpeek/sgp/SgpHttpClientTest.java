package io.rankpeek.sgp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import okhttp3.OkHttpClient;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SgpHttpClientTest {

    private static final String USER_AGENT = "LeagueOfLegendsClient/14.13.596.7996 (rcp-be-lol-match-history)";

    @Mock
    private SgpServerConfigService configService;
    @Mock
    private SgpServerResolver serverResolver;
    @Mock
    private SgpTokenService tokenService;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final List<RecordedRequest> recordedRequests = new ArrayList<>();
    private final LinkedBlockingQueue<MockResponse> responses = new LinkedBlockingQueue<>();

    private HttpServer server;
    private SgpHttpClient client;

    @BeforeEach
    void setUp() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", this::handleRequest);
        server.start();

        OkHttpClient httpClient = new OkHttpClient.Builder()
                .connectTimeout(Duration.ofSeconds(2))
                .readTimeout(Duration.ofSeconds(2))
                .writeTimeout(Duration.ofSeconds(2))
                .build();
        client = new SgpHttpClient(objectMapper, configService, serverResolver, tokenService, httpClient);
    }

    @AfterEach
    void tearDown() {
        server.stop(0);
    }

    @Test
    void getMatchHistorySummarySendsExpectedUrlHeadersAndQueryParams() throws Exception {
        givenSupportedServer("NA1", baseUrl(), readyAuth("entitlements-token-secret"));
        responses.add(new MockResponse(200, "{\"result\":\"summary\"}"));

        JsonNode result = client.getMatchHistorySummary("puuid-1", 20, 10, "ranked", "NA1");

        assertThat(result.get("result").asText()).isEqualTo("summary");
        RecordedRequest request = takeRequest();
        assertThat(request.path()).isEqualTo("/match-history-query/v1/products/lol/player/puuid-1/SUMMARY");
        assertThat(request.query()).containsEntry("startIndex", "20");
        assertThat(request.query()).containsEntry("count", "10");
        assertThat(request.query()).containsEntry("tag", "ranked");
        assertThat(request.headers()).containsEntry("Authorization", "Bearer league-session-token-secret");
        assertThat(request.headers()).containsEntry("Entitlements-jwt", "entitlements-token-secret");
        assertThat(request.headers()).containsEntry("User-agent", USER_AGENT);
    }

    @Test
    void getMatchHistorySummaryNormalizesUnsafeCounts() throws Exception {
        givenSupportedServer("NA1", baseUrl(), readyAuth("entitlements-token-secret"));
        responses.add(new MockResponse(200, "{}"));
        responses.add(new MockResponse(200, "{}"));

        client.getMatchHistorySummary("puuid-1", 0, 0, null, "NA1");
        client.getMatchHistorySummary("puuid-1", 0, 500, null, "NA1");

        assertThat(takeRequest().query()).containsEntry("count", "20");
        assertThat(takeRequest(2).query()).containsEntry("count", "200");
    }

    @Test
    void getMatchHistorySummaryTimesOutSlowResponseBody() {
        client = new SgpHttpClient(
                objectMapper,
                configService,
                serverResolver,
                tokenService,
                new OkHttpClient.Builder().build(),
                Duration.ofMillis(100)
        );
        givenSupportedServer("NA1", baseUrl(), readyAuth("entitlements-token-secret"));
        responses.add(new MockResponse(200, "{}", 1_000));

        assertThatThrownBy(() -> client.getMatchHistorySummary("puuid-1", 0, 20, null, "NA1"))
                .isInstanceOf(SgpApiException.class)
                .hasMessageContaining("timed out");
    }

    @Test
    void defaultHttpClientBoundsTheWholeSgpCall() throws Exception {
        var method = SgpHttpClient.class.getDeclaredMethod("createHttpClient");
        method.setAccessible(true);

        OkHttpClient httpClient = (OkHttpClient) method.invoke(null);

        assertThat(httpClient.callTimeoutMillis()).isEqualTo(12_500);
    }

    @Test
    void getGameSummaryAndDetailsUseRegionGamePath() throws Exception {
        givenSupportedServer("NA1", baseUrl(), readyAuth("entitlements-token-secret"));
        responses.add(new MockResponse(200, "{\"result\":\"game-summary\"}"));
        responses.add(new MockResponse(200, "{\"result\":\"game-details\"}"));

        JsonNode summary = client.getGameSummary(123456789L, "NA1");
        JsonNode details = client.getGameDetails(123456789L, "NA1");

        assertThat(summary.get("result").asText()).isEqualTo("game-summary");
        assertThat(details.get("result").asText()).isEqualTo("game-details");
        assertThat(recordedRequests).hasSize(2);
        assertThat(recordedRequests.get(0).path())
                .isEqualTo("/match-history-query/v1/products/lol/NA1_123456789/SUMMARY");
        assertThat(recordedRequests.get(1).path())
                .isEqualTo("/match-history-query/v1/products/lol/NA1_123456789/DETAILS");
    }

    @Test
    void requestFailsBeforeNetworkWhenTokenIsMissing() {
        givenSupportedServer("NA1", baseUrl(), SgpAuthState.builder()
                .entitlementsTokenReady(false)
                .leagueSessionTokenReady(false)
                .ready(false)
                .message("SGP token missing")
                .build());

        assertThatThrownBy(() -> client.getGameSummary(123L, "NA1"))
                .isInstanceOf(SgpApiException.class)
                .hasMessageContaining("SGP token missing")
                .satisfies(error -> assertThat(((SgpApiException) error).getStatusCode()).isEqualTo(401));
        assertThat(recordedRequests).isEmpty();
    }

    @Test
    void requestFailsBeforeNetworkWhenLeagueSessionTokenIsMissing() {
        givenSupportedServer("NA1", baseUrl(), SgpAuthState.builder()
                .entitlementsToken("entitlements-token-secret")
                .entitlementsTokenReady(true)
                .leagueSessionTokenReady(false)
                .ready(false)
                .message("SGP token missing: league session token")
                .build());

        assertThatThrownBy(() -> client.getGameSummary(123L, "NA1"))
                .isInstanceOf(SgpApiException.class)
                .hasMessageContaining("league session token")
                .satisfies(error -> assertThat(((SgpApiException) error).getStatusCode()).isEqualTo(401));
        assertThat(recordedRequests).isEmpty();
    }

    @Test
    void requestFailsBeforeNetworkWhenServerDoesNotSupportMatchHistory() {
        SgpServerEntry entry = serverEntry("CN", null);
        when(configService.findByPlatformId("CN")).thenReturn(Optional.of(entry));

        assertThatThrownBy(() -> client.getGameSummary(123L, "CN"))
                .isInstanceOf(SgpApiException.class)
                .hasMessageContaining("does not support SGP match-history")
                .satisfies(error -> assertThat(((SgpApiException) error).getStatusCode()).isEqualTo(503));
        verify(serverResolver, never()).resolveStatus("CN");
        assertThat(recordedRequests).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(ints = {401, 403, 404, 500, 502})
    void httpErrorsAreMappedToSgpApiException(int statusCode) {
        givenSupportedServer("NA1", baseUrl(), readyAuth("entitlements-token-secret"));
        responses.add(new MockResponse(statusCode, "{\"error\":\"upstream\"}"));

        assertThatThrownBy(() -> client.getGameDetails(456L, "NA1"))
                .isInstanceOf(SgpApiException.class)
                .hasMessageContaining(String.valueOf(statusCode))
                .satisfies(error -> {
                    assertThat(error.getMessage()).doesNotContain("entitlements-token-secret");
                    assertThat(((SgpApiException) error).getStatusCode()).isEqualTo(statusCode);
                });
    }

    private void givenSupportedServer(String sgpServerId, String baseUrl, SgpAuthState authState) {
        when(configService.findByPlatformId(sgpServerId)).thenReturn(Optional.of(serverEntry(sgpServerId, baseUrl)));
        when(serverResolver.resolveStatus(sgpServerId)).thenReturn(SgpStatus.builder()
                .supported(true)
                .platformId(sgpServerId)
                .sgpServerId(sgpServerId)
                .matchHistorySupported(true)
                .matchHistoryBaseUrl(baseUrl)
                .authState(authState)
                .tokenReady(authState.isReady())
                .build());
    }

    private SgpAuthState readyAuth(String entitlementsToken) {
        return SgpAuthState.builder()
                .entitlementsToken(entitlementsToken)
                .leagueSessionToken("league-session-token-secret")
                .entitlementsTokenReady(true)
                .leagueSessionTokenReady(true)
                .ready(true)
                .message("SGP token ready")
                .build();
    }

    private SgpServerEntry serverEntry(String sgpServerId, String baseUrl) {
        SgpServerEntry entry = new SgpServerEntry();
        entry.setPlatformId(sgpServerId);
        entry.setSgpServerId(sgpServerId);
        entry.setMatchHistoryBaseUrl(baseUrl);
        return entry;
    }

    private String baseUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    private RecordedRequest takeRequest() throws InterruptedException {
        for (int i = 0; i < 20 && recordedRequests.isEmpty(); i++) {
            TimeUnit.MILLISECONDS.sleep(10);
        }
        return recordedRequests.getFirst();
    }

    private RecordedRequest takeRequest(int count) throws InterruptedException {
        for (int i = 0; i < 20 && recordedRequests.size() < count; i++) {
            TimeUnit.MILLISECONDS.sleep(10);
        }
        return recordedRequests.get(count - 1);
    }

    private void handleRequest(HttpExchange exchange) throws IOException {
        recordedRequests.add(RecordedRequest.from(exchange));
        MockResponse response = responses.poll();
        if (response == null) {
            response = new MockResponse(200, "{}");
        }
        byte[] body = response.body().getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(response.statusCode(), body.length);
        if (response.bodyDelayMillis() > 0) {
            try {
                Thread.sleep(response.bodyDelayMillis());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        exchange.getResponseBody().write(body);
        exchange.close();
    }

    private record MockResponse(int statusCode, String body, long bodyDelayMillis) {
        private MockResponse(int statusCode, String body) {
            this(statusCode, body, 0);
        }
    }

    private record RecordedRequest(String path, Map<String, String> query, Map<String, String> headers) {

        static RecordedRequest from(HttpExchange exchange) {
            URI uri = exchange.getRequestURI();
            return new RecordedRequest(uri.getPath(), parseQuery(uri.getRawQuery()),
                    exchange.getRequestHeaders().entrySet().stream()
                            .collect(java.util.stream.Collectors.toMap(Map.Entry::getKey, entry -> entry.getValue().getFirst())));
        }

        private static Map<String, String> parseQuery(String rawQuery) {
            if (rawQuery == null || rawQuery.isBlank()) {
                return Map.of();
            }
            return java.util.Arrays.stream(rawQuery.split("&"))
                    .map(part -> part.split("=", 2))
                    .collect(java.util.stream.Collectors.toMap(parts -> decode(parts[0]), parts -> decode(parts.length > 1 ? parts[1] : "")));
        }

        private static String decode(String value) {
            return java.net.URLDecoder.decode(value, StandardCharsets.UTF_8);
        }
    }
}
