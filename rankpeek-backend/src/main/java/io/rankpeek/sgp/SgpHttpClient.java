package io.rankpeek.sgp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import okhttp3.HttpUrl;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

@Slf4j
@Service
public class SgpHttpClient {

    private static final String USER_AGENT = "LeagueOfLegendsClient/14.13.596.7996 (rcp-be-lol-match-history)";
    private static final Duration DEFAULT_TIMEOUT = Duration.ofMillis(12_500);
    private static final int DEFAULT_MATCH_HISTORY_COUNT = 20;
    private static final int MAX_MATCH_HISTORY_COUNT = 200;
    private static final ExecutorService REQUEST_EXECUTOR = Executors.newVirtualThreadPerTaskExecutor();
    private static final ScheduledExecutorService REQUEST_TIMEOUT_EXECUTOR =
            Executors.newSingleThreadScheduledExecutor(runnable -> {
                Thread thread = new Thread(runnable, "sgp-request-deadline");
                thread.setDaemon(true);
                return thread;
            });

    private final ObjectMapper objectMapper;
    private final SgpServerConfigService configService;
    private final SgpServerResolver serverResolver;
    private final SgpTokenService tokenService;
    private final OkHttpClient httpClient;
    private final Duration requestTimeout;
    private final AtomicLong requestSequence = new AtomicLong();
    private final AtomicInteger activeSummaryRequests = new AtomicInteger();

    @Autowired
    public SgpHttpClient(ObjectMapper objectMapper,
                         SgpServerConfigService configService,
                         SgpServerResolver serverResolver,
                         SgpTokenService tokenService) {
        this(objectMapper, configService, serverResolver, tokenService, createHttpClient());
    }

    SgpHttpClient(ObjectMapper objectMapper,
                  SgpServerConfigService configService,
                  SgpServerResolver serverResolver,
                  SgpTokenService tokenService,
                  OkHttpClient httpClient) {
        this(objectMapper, configService, serverResolver, tokenService, httpClient, DEFAULT_TIMEOUT);
    }

    SgpHttpClient(ObjectMapper objectMapper,
                  SgpServerConfigService configService,
                  SgpServerResolver serverResolver,
                  SgpTokenService tokenService,
                  OkHttpClient httpClient,
                  Duration requestTimeout) {
        this.objectMapper = objectMapper;
        this.configService = configService;
        this.serverResolver = serverResolver;
        this.tokenService = tokenService;
        this.httpClient = httpClient;
        this.requestTimeout = requestTimeout == null ? DEFAULT_TIMEOUT : requestTimeout;
    }

    public JsonNode getMatchHistorySummary(String puuid, int startIndex, int count, String tag, String sgpServerId) {
        RequestContext context = resolveRequestContext(sgpServerId);
        long requestId = requestSequence.incrementAndGet();
        int normalizedStartIndex = Math.max(0, startIndex);
        int normalizedCount = normalizeMatchHistoryCount(count);
        int active = activeSummaryRequests.incrementAndGet();
        Map<String, String> queryParams = new LinkedHashMap<>();
        queryParams.put("startIndex", String.valueOf(normalizedStartIndex));
        queryParams.put("count", String.valueOf(normalizedCount));
        if (hasText(tag)) {
            queryParams.put("tag", tag.trim());
        }
        log.info("SGP match history summary request: requestId={}, server={}, startIndex={}, count={}, tagPresent={}, active={}",
                requestId, context.sgpServerId(), normalizedStartIndex, normalizedCount, hasText(tag), active);
        try {
            return executeGet(new SgpRequestOptions(
                    context.sgpServerId(),
                    context.baseUrl(),
                    "/match-history-query/v1/products/lol/player/" + puuid + "/SUMMARY",
                    queryParams
            ), context);
        } finally {
            activeSummaryRequests.decrementAndGet();
        }
    }

    public JsonNode getGameSummary(Long gameId, String sgpServerId) {
        RequestContext context = resolveRequestContext(sgpServerId);
        return executeGet(new SgpRequestOptions(
                context.sgpServerId(),
                context.baseUrl(),
                "/match-history-query/v1/products/lol/" + context.sgpServerId() + "_" + gameId + "/SUMMARY",
                Map.of()
        ), context);
    }

    public JsonNode getGameDetails(Long gameId, String sgpServerId) {
        RequestContext context = resolveRequestContext(sgpServerId);
        return executeGet(new SgpRequestOptions(
                context.sgpServerId(),
                context.baseUrl(),
                "/match-history-query/v1/products/lol/" + context.sgpServerId() + "_" + gameId + "/DETAILS",
                Map.of()
        ), context);
    }

    private RequestContext resolveRequestContext(String sgpServerId) {
        if (!hasText(sgpServerId)) {
            throw new SgpApiException("SGP server id is required", 400, sgpServerId);
        }

        SgpServerEntry entry = configService.findByPlatformId(sgpServerId)
                .orElseThrow(() -> new SgpApiException("SGP server is not configured: " + sgpServerId, 404, sgpServerId));
        if (!entry.isMatchHistorySupported()) {
            throw new SgpApiException("SGP server does not support SGP match-history: " + sgpServerId, 503, sgpServerId);
        }

        SgpStatus status = serverResolver.resolveStatus(sgpServerId);
        SgpAuthState authState = status != null ? status.getAuthState() : null;
        if (authState == null) {
            authState = tokenService.getAuthState();
        }
        String leagueSessionToken = authState != null ? authState.getLeagueSessionToken() : null;
        String entitlementsToken = authState != null ? authState.getEntitlementsToken() : null;
        if (!hasText(leagueSessionToken)) {
            String message = authState != null && hasText(authState.getMessage())
                    ? authState.getMessage()
                    : "SGP token missing: league session token";
            throw new SgpApiException(message, 401, sgpServerId);
        }
        if (!hasText(entitlementsToken)) {
            String message = authState != null && hasText(authState.getMessage())
                    ? authState.getMessage()
                    : "SGP token missing: entitlements token";
            throw new SgpApiException(message, 401, sgpServerId);
        }

        String resolvedServerId = firstText(entry.getSgpServerId(), status != null ? status.getSgpServerId() : null, sgpServerId);
        return new RequestContext(normalize(resolvedServerId), entry.getMatchHistoryBaseUrl(),
                leagueSessionToken.trim(), entitlementsToken.trim());
    }

    private JsonNode executeGet(SgpRequestOptions options, RequestContext context) {
        HttpUrl url = buildUrl(options);
        Request request = new Request.Builder()
                .url(url)
                .header("Authorization", "Bearer " + context.authorizationToken())
                .header("Entitlements-JWT", context.entitlementsToken())
                .header("User-Agent", USER_AGENT)
                .get()
                .build();

        log.debug("SGP GET: server={}, route={}", options.sgpServerId(), routeLabel(options.path()));
        okhttp3.Call call = httpClient.newCall(request);
        long timeoutMillis = timeoutMillis();
        AtomicBoolean deadlineExceeded = new AtomicBoolean(false);
        ScheduledFuture<?> deadline = REQUEST_TIMEOUT_EXECUTOR.schedule(
                () -> cancelCallOnDeadline(call, options, deadlineExceeded),
                timeoutMillis,
                TimeUnit.MILLISECONDS
        );
        Future<JsonNode> future = REQUEST_EXECUTOR.submit(() -> executeCall(call, options, deadlineExceeded));
        try {
            return future.get(timeoutMillis, TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            call.cancel();
            future.cancel(true);
            throw new SgpApiException("SGP request timed out: " + routeLabel(options.path()), 503, options.sgpServerId(), e);
        } catch (InterruptedException e) {
            call.cancel();
            Thread.currentThread().interrupt();
            throw new SgpApiException("SGP request interrupted", 503, options.sgpServerId(), e);
        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            if (cause instanceof SgpApiException sgpException) {
                throw sgpException;
            }
            throw new SgpApiException("SGP request failed: " + cause.getClass().getSimpleName(), 503, options.sgpServerId(), cause);
        } finally {
            deadline.cancel(false);
        }
    }

    private long timeoutMillis() {
        return Math.max(1, requestTimeout.toMillis());
    }

    private void cancelCallOnDeadline(okhttp3.Call call, SgpRequestOptions options, AtomicBoolean deadlineExceeded) {
        if (call == null) {
            return;
        }
        deadlineExceeded.set(true);
        log.warn("SGP request exceeded deadline, cancelling call: server={}, route={}",
                options.sgpServerId(), routeLabel(options.path()));
        call.cancel();
    }

    private JsonNode executeCall(okhttp3.Call call, SgpRequestOptions options, AtomicBoolean deadlineExceeded) {
        try (Response response = call.execute()) {
            if (!response.isSuccessful()) {
                throw toHttpException(response.code(), options.sgpServerId(), options.path());
            }
            ResponseBody responseBody = response.body();
            if (responseBody == null || responseBody.contentLength() == 0) {
                return objectMapper.createObjectNode();
            }
            try (InputStream stream = responseBody.byteStream()) {
                return objectMapper.readTree(stream);
            }
        } catch (SgpApiException e) {
            throw e;
        } catch (IOException e) {
            if (deadlineExceeded.get()) {
                throw new SgpApiException("SGP request timed out: " + routeLabel(options.path()), 503, options.sgpServerId(), e);
            }
            throw new SgpApiException("SGP request failed: " + e.getClass().getSimpleName(), 503, options.sgpServerId(), e);
        }
    }

    private int normalizeMatchHistoryCount(int count) {
        if (count <= 0) {
            return DEFAULT_MATCH_HISTORY_COUNT;
        }
        return Math.min(count, MAX_MATCH_HISTORY_COUNT);
    }

    private String routeLabel(String path) {
        if (path == null) {
            return "unknown";
        }
        if (path.endsWith("/SUMMARY") && path.contains("/player/")) {
            return "match-history-summary";
        }
        if (path.endsWith("/DETAILS")) {
            return "game-details";
        }
        if (path.endsWith("/SUMMARY")) {
            return "game-summary";
        }
        return "sgp";
    }

    private HttpUrl buildUrl(SgpRequestOptions options) {
        HttpUrl baseUrl = HttpUrl.parse(options.baseUrl());
        if (baseUrl == null) {
            throw new SgpApiException("Invalid SGP match-history baseUrl", 503, options.sgpServerId());
        }

        HttpUrl.Builder builder = baseUrl.newBuilder();
        for (String segment : options.path().split("/")) {
            if (!segment.isBlank()) {
                builder.addPathSegment(segment);
            }
        }
        options.queryParams().forEach(builder::addQueryParameter);
        return builder.build();
    }

    private SgpApiException toHttpException(int statusCode, String sgpServerId, String path) {
        String message = switch (statusCode) {
            case 401 -> "SGP request unauthorized (401): entitlement token rejected";
            case 403 -> "SGP request forbidden (403): entitlement token lacks access";
            case 404 -> "SGP resource not found (404): " + path;
            default -> statusCode >= 500
                    ? "SGP upstream error (" + statusCode + "): " + path
                    : "SGP request failed (" + statusCode + "): " + path;
        };
        return new SgpApiException(message, statusCode, sgpServerId);
    }

    private static OkHttpClient createHttpClient() {
        return new OkHttpClient.Builder()
                .callTimeout(DEFAULT_TIMEOUT)
                .connectTimeout(DEFAULT_TIMEOUT)
                .readTimeout(DEFAULT_TIMEOUT)
                .writeTimeout(DEFAULT_TIMEOUT)
                .build();
    }

    private String firstText(String... values) {
        for (String value : values) {
            if (hasText(value)) {
                return value;
            }
        }
        return null;
    }

    private String normalize(String value) {
        return value == null ? null : value.trim().toUpperCase();
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private record RequestContext(String sgpServerId, String baseUrl, String authorizationToken, String entitlementsToken) {
    }
}
