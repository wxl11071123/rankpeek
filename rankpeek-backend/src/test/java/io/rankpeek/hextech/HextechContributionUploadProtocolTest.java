package io.rankpeek.hextech;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 上传协议回归测试：短期会话 + 逐条回执。
 *
 * <p>锁住三件事：
 * <ol>
 *   <li>上传前必须先换会话，批次请求带 {@code Authorization: Bearer}；</li>
 *   <li>只有服务端明确回执的对局才算传过（rejected 且可重试的要留在待传列表里）；</li>
 *   <li>会话 401 时自动重申请一次，而不是把这一批直接判失败。</li>
 * </ol>
 */
class HextechContributionUploadProtocolTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private HttpServer server;
    private String baseUrl;
    private final AtomicInteger sessionRequests = new AtomicInteger();
    private final List<String> batchAuths = new ArrayList<>();
    private volatile int batchStatus = 200;
    private volatile String batchBody = "";

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/v1/upload/session", exchange -> {
            int n = sessionRequests.incrementAndGet();
            respond(exchange, 200, "{\"success\":true,\"data\":{\"token\":\"tok-" + n
                    + "\",\"expiresAt\":\"" + Instant.now().plusSeconds(3600)
                    + "\",\"maxBatchSize\":5,\"maxBodyBytes\":65536}}");
        });
        server.createContext("/api/v1/upload/batch", exchange -> {
            batchAuths.add(String.valueOf(exchange.getRequestHeaders().getFirst("Authorization")));
            respond(exchange, batchStatus, batchBody);
        });
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    private HextechContributionService service() {
        return new HextechContributionService(null, null, null, null, MAPPER, null,
                baseUrl + "/api/v1/upload/batch", null, baseUrl + "/hextech/upload-policy.json",
                Duration.ofSeconds(5), null);
    }

    private static HextechContributionService.State state() {
        return new HextechContributionService.State("rp-test-install", List.of(), null, null, null);
    }

    private static List<HextechContributionService.PendingGame> batch(String... keys) {
        List<HextechContributionService.PendingGame> games = new ArrayList<>();
        for (String key : keys) {
            games.add(new HextechContributionService.PendingGame(key, "16.19", null,
                    List.of(new HextechContributionService.PlayerRecord(875, List.of(1001), true))));
        }
        return games;
    }

    @Test
    void batchGoesOutWithABearerTokenFromTheSessionEndpoint() {
        batchBody = "{\"success\":true,\"data\":{\"accepted\":1,\"duplicates\":0,"
                + "\"acknowledgements\":[{\"gameKey\":\"g1\",\"status\":\"inserted\"}]}}";
        HextechContributionService.UploadOutcome outcome = service().sendBatch(state(), batch("g1"));

        assertTrue(outcome.ok());
        assertEquals(1, sessionRequests.get(), "必须先换一次会话");
        assertEquals(List.of("Bearer tok-1"), batchAuths);
        assertEquals(1, outcome.accepted());
    }

    @Test
    void sessionIsReusedAcrossBatches() {
        batchBody = "{\"success\":true,\"data\":{\"acknowledgements\":[]}}";
        HextechContributionService service = service();
        service.sendBatch(state(), batch("g1"));
        service.sendBatch(state(), batch("g2"));
        assertEquals(1, sessionRequests.get(), "会话没过期就该复用，不要每批都换");
    }

    @Test
    void onlyAcknowledgedGamesAreTreatedAsUploaded() {
        batchBody = "{\"success\":true,\"data\":{\"accepted\":1,\"duplicates\":1,"
                + "\"acknowledgements\":["
                + "{\"gameKey\":\"ok\",\"status\":\"inserted\"},"
                + "{\"gameKey\":\"dupe\",\"status\":\"duplicate\"},"
                + "{\"gameKey\":\"dead\",\"status\":\"rejected\",\"retryable\":false},"
                + "{\"gameKey\":\"later\",\"status\":\"rejected\",\"retryable\":true}]}}";
        HextechContributionService.UploadOutcome outcome =
                service().sendBatch(state(), batch("ok", "dupe", "dead", "later"));

        assertTrue(outcome.ok());
        assertTrue(outcome.settled().contains("ok"));
        assertTrue(outcome.settled().contains("dupe"));
        assertTrue(outcome.settled().contains("dead"), "不可重试的拒绝也要算结清，否则会一直重传");
        assertFalse(outcome.settled().contains("later"), "可重试的拒绝必须留在待传列表里");
    }

    @Test
    void expiredSessionIsRefreshedOnceAndTheBatchIsRetried() {
        batchStatus = 401;
        batchBody = "{\"success\":false,\"error\":{\"code\":\"invalid_session\"}}";
        HextechContributionService service = service();

        HextechContributionService.UploadOutcome first = service.sendBatch(state(), batch("g1"));
        assertFalse(first.ok());
        assertEquals(2, sessionRequests.get(), "401 之后要重申请一次再试");
        assertEquals(List.of("Bearer tok-1", "Bearer tok-2"), batchAuths);
    }

    @Test
    void aServerWithoutAcknowledgementsStillCountsAsSuccess() {
        // 旧服务端只回 accepted/duplicates：整批按成功处理，保持兼容
        batchBody = "{\"success\":true,\"data\":{\"accepted\":2,\"duplicates\":0}}";
        HextechContributionService.UploadOutcome outcome = service().sendBatch(state(), batch("g1", "g2"));
        assertTrue(outcome.ok());
        assertTrue(outcome.settled().contains("g1"));
        assertTrue(outcome.settled().contains("g2"));
    }

    @Test
    void policyCanDisableUploads() throws Exception {
        HextechContributionService.UploadPolicy off = service().parsePolicy(MAPPER.readTree(
                "{\"hextechUpload\":{\"enabled\":false}}"));
        assertFalse(off.enabled(), "服务端要能一键关掉上传，不用发版");
    }

    @Test
    void policyIsClampedSoTheServerCannotWidenClientLimits() throws Exception {
        HextechContributionService.UploadPolicy tooBig = service().parsePolicy(MAPPER.readTree(
                "{\"hextechUpload\":{\"maxGamesPerUpload\":99}}"));
        assertEquals(3, tooBig.maxGamesPerUpload(), "每批局数不能超过客户端自己的上限");

        HextechContributionService.UploadPolicy tooSmall = service().parsePolicy(MAPPER.readTree(
                "{\"hextechUpload\":{\"maxGamesPerUpload\":0}}"));
        assertEquals(1, tooSmall.maxGamesPerUpload());
    }

    @Test
    void policyCanLimitUploadsToOnePatch() throws Exception {
        HextechContributionService.UploadPolicy policy = service().parsePolicy(MAPPER.readTree(
                "{\"hextechUpload\":{\"targetGamePatch\":\"16.19\"}}"));
        assertTrue(policy.acceptsPatch("16.19"));
        assertFalse(policy.acceptsPatch("16.18"), "策略指定了版本就只传那个版本");

        HextechContributionService.UploadPolicy broken = service().parsePolicy(MAPPER.readTree(
                "{\"hextechUpload\":{\"targetGamePatch\":\"not-a-patch\"}}"));
        assertNull(broken.targetGamePatch(), "非法版本号直接忽略，别把上传全卡死");
    }

    @Test
    void policyWithoutTheExpectedShapeIsIgnored() throws Exception {
        assertNull(service().parsePolicy(MAPPER.readTree("{}")));
        assertNull(service().parsePolicy(MAPPER.readTree("{\"other\":1}")));
    }

    private static void respond(com.sun.net.httpserver.HttpExchange exchange, int status, String body)
            throws IOException {
        byte[] bytes = body.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }
}
