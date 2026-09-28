package io.rankpeek.hextech.aramgg;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpServer;
import io.rankpeek.config.LocalDataPathService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.GZIPOutputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * aramgg 数据包下载的回归测试。
 *
 * <p>锁住四件事：下载后按本地布局落盘、版本没变不重复下载、换版本时旧矩阵被清掉、
 * 校验不过不落盘。这几条对应「覆盖旧数据、不能无限增长」和「数据必须是完整的」。
 */
class AramggBundleServiceTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @TempDir
    Path tempDir;

    private HttpServer server;
    private String baseUrl;
    private final List<AramggBundleService.UpdatedEvent> events = new ArrayList<>();
    private final java.util.concurrent.atomic.AtomicInteger manifestHits = new java.util.concurrent.atomic.AtomicInteger();
    private final java.util.concurrent.atomic.AtomicInteger bundleHits = new java.util.concurrent.atomic.AtomicInteger();

    /** 当前对外提供的版本与内容（测试里随时替换）。 */
    private volatile String version = "16.19.1";
    private volatile Map<Long, Integer> matrices = Map.of(1L, 2, 2L, 2, 3L, 2);
    private volatile String shaOverride;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/hextech/aramgg/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            try {
                if (path.endsWith("manifest.json")) {
                    manifestHits.incrementAndGet();
                    respond(exchange, manifestJson());
                } else {
                    bundleHits.incrementAndGet();
                    respond(exchange, bundleGz());
                }
            } catch (Exception e) {
                exchange.sendResponseHeaders(500, -1);
                exchange.close();
            }
        });
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/hextech/aramgg";
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    private AramggBundleService service() {
        return new AramggBundleService(MAPPER, new LocalDataPathService(tempDir.toString(), false),
                event -> {
                    if (event instanceof AramggBundleService.UpdatedEvent updated) {
                        events.add(updated);
                    }
                }, baseUrl, Duration.ofSeconds(5), null);
    }

    private Path aramggDir() {
        return tempDir.resolve("hextech").resolve("aramgg");
    }

    @Test
    void downloadsBundleAndInstallsFlatLayout() throws Exception {
        AramggBundleService service = service();
        AramggBundleService.Summary summary = service.check(true);

        assertEquals("idle", summary.state());
        assertEquals("16.19.1", summary.dataVersion());
        assertNotNull(summary.updatedAt());
        assertEquals(3, summary.matrices());
        assertEquals(1, summary.definitions());
        assertEquals(1, events.size(), "下载成功后应广播一次换新事件");

        Path dir = aramggDir();
        assertTrue(Files.isRegularFile(dir.resolve("definitions.json")));
        assertTrue(Files.isRegularFile(dir.resolve("global-stats.json")));
        assertTrue(Files.isRegularFile(dir.resolve("matrix").resolve("1.json")));
        assertEquals("16.19.1", Files.readString(dir.resolve("data-version.txt")).trim());
        assertTrue(Files.readString(dir.resolve("definitions.json")).contains("测试强化"));
        assertTrue(Files.readString(dir.resolve("matrix").resolve("1.json")).contains("augments"));
        // 暂存目录必须被清掉，不能留在磁盘上
        assertFalse(Files.exists(dir.resolve(".staging")));
    }

    @Test
    void skipsDownloadWhenVersionUnchanged() throws Exception {
        AramggBundleService service = service();
        service.check(true);
        assertEquals(1, bundleHits.get());

        AramggBundleService.Summary again = service.check(true);
        assertEquals(1, bundleHits.get(), "版本没变就不该再下载数据包");
        assertEquals("数据已是最新（16.19.1）", again.message());
        assertNull(again.error());
    }

    @Test
    void replacesOldDataAndRemovesStaleMatrixFiles() throws Exception {
        AramggBundleService service = service();
        service.check(true);
        assertTrue(Files.isRegularFile(aramggDir().resolve("matrix").resolve("3.json")));

        version = "16.20.0";
        matrices = Map.of(2L, 3, 3L, 3, 4L, 3);
        AramggBundleService.Summary next = service.check(true);

        assertEquals("16.20.0", next.dataVersion());
        assertEquals(3, next.matrices());
        assertEquals("16.20.0", Files.readString(aramggDir().resolve("data-version.txt")).trim());
        assertFalse(Files.exists(aramggDir().resolve("matrix").resolve("1.json")), "旧版本的英雄矩阵必须被清掉");
        assertTrue(Files.isRegularFile(aramggDir().resolve("matrix").resolve("4.json")));
        assertEquals(2, events.size());
    }

    @Test
    void rejectsBundleWhenShaDoesNotMatch() throws Exception {
        shaOverride = "0".repeat(64);
        AramggBundleService service = service();
        AramggBundleService.Summary summary = service.check(true);

        assertEquals("error", summary.state());
        assertNotNull(summary.error());
        assertTrue(summary.error().contains("sha256"));
        assertFalse(Files.exists(aramggDir().resolve("definitions.json")), "校验不过不能落盘");
        assertTrue(events.isEmpty());
    }

    @Test
    void automaticCheckRespectsDownloadCooldown() throws Exception {
        AramggBundleService service = service();
        service.check(true);
        int manifestAfterFirst = manifestHits.get();

        service.check(false);
        assertEquals(manifestAfterFirst, manifestHits.get(), "CD 内的自动检查不该发请求");

        version = "16.20.0";
        service.check(true);
        assertEquals("16.20.0", service.summary().dataVersion(), "手动检查忽略 CD");
    }

    @Test
    void healsWhenLocalDataIsMissing() throws Exception {
        AramggBundleService service = service();
        service.check(true);

        // 本地数据被清掉（用户手动删了目录）→ 即使还在 CD 内也要立刻补回来
        Path matrixDir = aramggDir().resolve("matrix");
        try (var stream = Files.list(matrixDir)) {
            for (Path path : stream.toList()) {
                Files.deleteIfExists(path);
            }
        }
        Files.deleteIfExists(aramggDir().resolve("definitions.json"));

        AramggBundleService.Summary healed = service.check(false);
        assertTrue(Files.isRegularFile(aramggDir().resolve("definitions.json")));
        assertEquals(3, healed.matrices());
    }

    @Test
    void keepsWorkingOfflineWhenServerIsDown() throws Exception {
        AramggBundleService service = service();
        service.check(true);
        server.stop(0);

        AramggBundleService.Summary summary = service.check(true);
        assertEquals("error", summary.state());
        assertNotNull(summary.error());
        // 旧数据必须还在，页面继续用
        assertTrue(Files.isRegularFile(aramggDir().resolve("definitions.json")));
        assertEquals("16.19.1", summary.dataVersion());
        assertTrue(summary.available());
    }

    // ------------------------------------------------------------------ 测试用的假服务器

    private byte[] bundleGz() throws Exception {
        ObjectNode root = MAPPER.createObjectNode();
        root.put("schemaVersion", 1);
        root.put("version", version);
        ArrayNode definitions = root.putArray("definitions");
        definitions.addObject().put("id", 1).put("name", "测试强化");
        ArrayNode globalStats = root.putArray("globalStats");
        globalStats.addObject().put("id", 1);
        ObjectNode matricesNode = root.putObject("matrices");
        new LinkedHashMap<>(matrices).forEach((championId, size) -> {
            ObjectNode matrix = matricesNode.putObject(String.valueOf(championId));
            ArrayNode augments = matrix.putArray("augments");
            for (int i = 0; i < size; i++) {
                augments.addObject().put("augmentId", 100 + i).put("rank", String.valueOf(i + 1));
            }
        });
        byte[] raw = MAPPER.writeValueAsBytes(root);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (GZIPOutputStream gzip = new GZIPOutputStream(out)) {
            gzip.write(raw);
        }
        return out.toByteArray();
    }

    private byte[] manifestJson() throws Exception {
        byte[] packed = bundleGz();
        ObjectNode manifest = MAPPER.createObjectNode();
        manifest.put("schemaVersion", 1);
        manifest.put("version", version);
        manifest.put("generatedAt", "2026-09-27T13:41:11+00:00");
        manifest.put("file", "aramgg-" + version + ".json.gz");
        manifest.put("bytes", packed.length);
        manifest.put("sha256", shaOverride != null ? shaOverride : sha256(packed));
        manifest.put("minIntervalHours", 36);
        ObjectNode counts = manifest.putObject("counts");
        counts.put("definitions", 1);
        counts.put("globalStats", 1);
        counts.put("matrices", matrices.size());
        return MAPPER.writeValueAsBytes(manifest);
    }

    private static void respond(com.sun.net.httpserver.HttpExchange exchange, byte[] body) throws IOException {
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, body.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(body);
        }
    }

    private static String sha256(byte[] body) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body));
    }
}
