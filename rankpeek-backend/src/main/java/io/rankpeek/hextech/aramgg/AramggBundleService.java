package io.rankpeek.hextech.aramgg;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.rankpeek.config.LocalDataPathService;
import io.rankpeek.hextech.HextechContributionService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.zip.GZIPInputStream;

/**
 * aramgg 数据包的分发下载（客户端只连我们自己的服务器，不再直连 aramgg、也不需要 Key）。
 *
 * <p>服务端 {@code rankpeek-server/scripts/build_aramgg_bundle.py} 把抓取结果打成
 * {@code manifest.json} + {@code aramgg-<版本>.json.gz}，nginx 静态发。本类负责：
 *
 * <ol>
 *   <li>比对 manifest 的 {@code version}，和本地已装的版本一样就不下载；</li>
 *   <li>下载后校验字节数与 sha256，通过才落盘；</li>
 *   <li>落盘时按英雄逐个替换，并删掉这一版里没有的旧矩阵文件 —— 覆盖旧数据，不会无限增长；</li>
 *   <li>广播 {@link UpdatedEvent}，让 {@link AramggDataService} 重新读盘。</li>
 * </ol>
 *
 * <p>节奏（用户要求：下载 CD 1~2 天）：
 * <ul>
 *   <li>启动 90 秒后检查一次，之后每 6 小时醒一次，但真正发请求受 manifest 里的
 *       {@code minIntervalHours}（默认 36 小时）约束，并带 ±10% 抖动；</li>
 *   <li>本地没有数据时无视 CD 立刻下载（自愈）；</li>
 *   <li>手动「检查更新」无视 CD；</li>
 *   <li>失败按 30 分钟起步指数退避，最长 6 小时，成功即清零。</li>
 * </ul>
 *
 * <p>失败时保留本地已有数据继续用（上层拿不到数据就自动降级到 101 的公开数据）。
 */
import io.rankpeek.hextech.HextechEndpoints;

@Slf4j
@Service
public class AramggBundleService {

    static final long DEFAULT_MIN_INTERVAL_MS = 36L * 60L * 60L * 1000L;
    static final long BACKOFF_BASE_MS = 30L * 60L * 1000L;
    static final long MAX_BACKOFF_MS = 6L * 60L * 60L * 1000L;
    private static final String STATE_FILE_NAME = "bundle-state.json";
    private static final String STAGING_DIR_NAME = ".staging";

    /** 下载状态机：idle=空闲/已最新，checking=正在比对版本，downloading=正在下载，error=上次失败。 */
    public enum State {
        IDLE, CHECKING, DOWNLOADING, ERROR
    }

    /** 数据包换新后广播。 */
    public record UpdatedEvent(String version, int matrices) {
    }

    private final ObjectMapper objectMapper;
    private final LocalDataPathService pathService;
    private final ApplicationEventPublisher events;
    private final String bundleBaseUrl;
    private final Duration timeout;
    private final HttpClient httpClient;

    private final AtomicBoolean running = new AtomicBoolean();

    private volatile State state = State.IDLE;
    private volatile String localVersion;
    private volatile String remoteVersion;
    private volatile String updatedAt;
    private volatile String checkedAt;
    private volatile long nextCheckAt;
    private volatile long bytes;
    private volatile int definitionCount;
    private volatile int globalStatCount;
    private volatile int matrixCount;
    private volatile long minIntervalMs = DEFAULT_MIN_INTERVAL_MS;
    private volatile String message;
    private volatile String error;
    private volatile int failureCount;

    @Autowired
    public AramggBundleService(ObjectMapper objectMapper,
                               LocalDataPathService pathService,
                               ApplicationEventPublisher events,
                               @Value("${rankpeek.hextech.aramgg.bundle-base-url:}") String bundleBaseUrl,
                               @Value("${rankpeek.hextech.timeout-ms:8000}") long timeoutMs) {
        this(objectMapper, pathService, events, bundleBaseUrl,
                Duration.ofMillis(timeoutMs <= 0 ? 8000 : timeoutMs), null);
    }

    AramggBundleService(ObjectMapper objectMapper,
                        LocalDataPathService pathService,
                        ApplicationEventPublisher events,
                        String bundleBaseUrl,
                        Duration timeout,
                        HttpClient httpClient) {
        this.objectMapper = objectMapper == null ? new ObjectMapper() : objectMapper;
        this.pathService = pathService;
        this.events = events == null ? event -> { } : events;
        this.bundleBaseUrl = HextechEndpoints
                .resolve(HextechEndpoints.ARAMGG_BUNDLE_BASE_URL, bundleBaseUrl)
                .replaceAll("/+$", "");
        this.timeout = timeout == null || timeout.isZero() || timeout.isNegative()
                ? Duration.ofSeconds(8) : timeout;
        this.httpClient = httpClient != null ? httpClient : HttpClient.newBuilder()
                .connectTimeout(this.timeout)
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    public boolean isEnabled() {
        return !bundleBaseUrl.isBlank();
    }

    /** 启动时把上次的版本 / CD / 失败计数读回来，重启不会立刻重下。 */
    @jakarta.annotation.PostConstruct
    public void loadState() {
        try {
            Path base = baseDir();
            Path statePath = base.resolve(STATE_FILE_NAME);
            if (Files.isRegularFile(statePath)) {
                JsonNode node = objectMapper.readTree(Files.readString(statePath, StandardCharsets.UTF_8));
                localVersion = text(node, "localVersion");
                updatedAt = text(node, "updatedAt");
                checkedAt = text(node, "checkedAt");
                nextCheckAt = node.path("nextCheckAt").asLong(0L);
                failureCount = node.path("failureCount").asInt(0);
                bytes = node.path("bytes").asLong(0L);
                definitionCount = node.path("definitions").asInt(0);
                globalStatCount = node.path("globalStats").asInt(0);
                matrixCount = node.path("matrices").asInt(0);
            }
            if (localVersion == null) {
                Path versionPath = base.resolve("data-version.txt");
                if (Files.isRegularFile(versionPath)) {
                    localVersion = Files.readString(versionPath, StandardCharsets.UTF_8).trim();
                }
            }
            if (matrixCount == 0) {
                matrixCount = countMatrixFiles(base.resolve("matrix"));
            }
            if (localVersion != null) {
                log.info("aramgg 数据包已装: version={} 英雄矩阵={} 上次更新={}", localVersion, matrixCount, updatedAt);
            }
        } catch (Exception e) {
            log.debug("aramgg bundle state unreadable: {}", e.getMessage());
        }
    }

    /** 每 6 小时醒一次；是否真的发请求由 CD 决定。 */
    @Scheduled(initialDelay = 90_000L, fixedDelay = 6L * 60L * 60L * 1000L)
    public void scheduledCheck() {
        check(false);
    }

    /**
     * 检查并按需下载。
     *
     * @param force true = 手动「检查更新」，无视下载 CD
     */
    public Summary check(boolean force) {
        if (!isEnabled()) {
            return summary();
        }
        if (!running.compareAndSet(false, true)) {
            // 已经在跑了（后台自动检查 / 用户连点），直接返回当前状态
            return summary();
        }
        try {
            if (!force && !isDue()) {
                return summary();
            }
            state = State.CHECKING;
            message = "正在检查更新";
            error = null;

            Manifest manifest = fetchManifest();
            if (manifest == null) {
                markFailure("拿不到数据包清单（manifest.json）");
                return summary();
            }
            minIntervalMs = manifest.minIntervalHours() > 0
                    ? manifest.minIntervalHours() * 60L * 60L * 1000L
                    : DEFAULT_MIN_INTERVAL_MS;
            remoteVersion = manifest.version();

            if (manifest.version().equals(localVersion) && hasLocalData()) {
                definitionCount = manifest.definitions();
                globalStatCount = manifest.globalStats();
                matrixCount = manifest.matrices() > 0 ? manifest.matrices() : matrixCount;
                markSuccess(false, "数据已是最新（" + manifest.version() + "）");
                return summary();
            }

            state = State.DOWNLOADING;
            message = "正在下载数据包 " + manifest.version();
            byte[] raw = fetchBytes(bundleBaseUrl + "/" + manifest.file());
            if (raw == null) {
                markFailure("下载数据包失败（" + manifest.file() + "）");
                return summary();
            }
            if (manifest.bytes() > 0 && raw.length != manifest.bytes()) {
                markFailure("数据包大小不符：期望 " + manifest.bytes() + " 字节，实际 " + raw.length);
                return summary();
            }
            String actualSha = sha256(raw);
            if (manifest.sha256() != null && !manifest.sha256().isBlank()
                    && !manifest.sha256().equalsIgnoreCase(actualSha)) {
                markFailure("数据包 sha256 校验失败");
                return summary();
            }

            JsonNode root = objectMapper.readTree(maybeGunzip(raw));
            Installed installed = install(root, manifest.version());
            localVersion = manifest.version();
            bytes = raw.length;
            definitionCount = installed.definitions();
            globalStatCount = installed.globalStats();
            matrixCount = installed.matrices();
            events.publishEvent(new UpdatedEvent(localVersion, matrixCount));
            markSuccess(true, "已更新到 " + localVersion);
            log.info("aramgg 数据包已更新: version={} 定义={} 全局榜={} 英雄矩阵={} 大小={}KB",
                    localVersion, definitionCount, globalStatCount, matrixCount, bytes / 1024);
            return summary();
        } catch (Exception e) {
            log.warn("aramgg 数据包检查失败: {}", e.getMessage());
            markFailure(e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
            return summary();
        } finally {
            running.set(false);
        }
    }

    public Summary summary() {
        return new Summary(
                hasLocalData() || localVersion != null,
                state.name().toLowerCase(Locale.ROOT),
                localVersion,
                remoteVersion,
                updatedAt,
                checkedAt,
                nextCheckAt > 0 ? Instant.ofEpochMilli(nextCheckAt).toString() : null,
                bytes,
                definitionCount,
                globalStatCount,
                matrixCount,
                Math.max(1L, minIntervalMs / (60L * 60L * 1000L)),
                message,
                error
        );
    }

    /** 本地已装的数据版本（没有数据时为 null）。 */
    public String localVersion() {
        return localVersion;
    }

    // ------------------------------------------------------------------ 内部实现

    private boolean isDue() {
        if (!hasLocalData()) {
            return true;
        }
        return System.currentTimeMillis() >= nextCheckAt;
    }

    private boolean hasLocalData() {
        return Files.isRegularFile(baseDir().resolve("definitions.json"))
                || countMatrixFiles(matrixDir()) > 0;
    }

    private void markSuccess(boolean downloaded, String note) {
        failureCount = 0;
        error = null;
        state = State.IDLE;
        checkedAt = Instant.now().toString();
        if (downloaded) {
            updatedAt = checkedAt;
        }
        message = note;
        nextCheckAt = System.currentTimeMillis() + jitter(minIntervalMs);
        saveState();
    }

    private void markFailure(String reason) {
        failureCount = Math.min(failureCount + 1, 6);
        error = reason;
        message = reason;
        state = State.ERROR;
        checkedAt = Instant.now().toString();
        long backoff = Math.min(BACKOFF_BASE_MS << Math.min(failureCount - 1, 5), MAX_BACKOFF_MS);
        nextCheckAt = System.currentTimeMillis() + jitter(backoff);
        saveState();
    }

    private long jitter(long base) {
        long safe = Math.max(base, 60_000L);
        return safe + ThreadLocalRandom.current().nextLong(safe / 10 + 1);
    }

    private Manifest fetchManifest() {
        JsonNode node = fetchJson(bundleBaseUrl + "/manifest.json");
        if (node == null) {
            return null;
        }
        String version = text(node, "version");
        String file = text(node, "file");
        if (version == null || version.isBlank() || file == null || file.isBlank()) {
            return null;
        }
        // manifest 来自我们自己的服务器，但仍然不允许它跳出目录（防御性）
        if (file.contains("/") || file.contains("\\") || file.contains("..")) {
            log.warn("数据包文件名不合法，已忽略: {}", file);
            return null;
        }
        return new Manifest(
                version,
                file,
                text(node, "sha256"),
                node.path("bytes").asLong(0L),
                node.path("minIntervalHours").asLong(0L),
                node.path("counts").path("definitions").asInt(0),
                node.path("counts").path("globalStats").asInt(0),
                node.path("counts").path("matrices").asInt(0)
        );
    }

    /**
     * 把 bundle 写成本地布局（{@code definitions.json / global-stats.json / data-version.txt / matrix/*.json}）。
     *
     * <p>先整包写进 {@code .staging}，再逐个文件替换，最后删掉这一版里没有的旧矩阵文件：
     * 中途失败不会把已有数据清空，正常结束后旧版本不会残留。
     */
    private Installed install(JsonNode root, String version) throws Exception {
        Path base = baseDir();
        Files.createDirectories(base);
        Path staging = base.resolve(STAGING_DIR_NAME);
        deleteRecursively(staging);
        Files.createDirectories(staging.resolve("matrix"));

        JsonNode definitions = root.path("definitions");
        JsonNode globalStats = root.path("globalStats");
        Files.writeString(staging.resolve("definitions.json"),
                objectMapper.writeValueAsString(definitions), StandardCharsets.UTF_8);
        Files.writeString(staging.resolve("global-stats.json"),
                objectMapper.writeValueAsString(globalStats), StandardCharsets.UTF_8);
        Files.writeString(staging.resolve("data-version.txt"), version, StandardCharsets.UTF_8);

        Set<String> written = new LinkedHashSet<>();
        JsonNode matrices = root.path("matrices");
        Iterator<Map.Entry<String, JsonNode>> fields = matrices.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> entry = fields.next();
            String championId = entry.getKey() == null ? "" : entry.getKey().trim();
            if (!championId.matches("\\d+")) {
                continue;
            }
            String name = championId + ".json";
            Files.writeString(staging.resolve("matrix").resolve(name),
                    objectMapper.writeValueAsString(entry.getValue()), StandardCharsets.UTF_8);
            written.add(name);
        }

        Path liveMatrix = base.resolve("matrix");
        Files.createDirectories(liveMatrix);
        moveInto(staging.resolve("definitions.json"), base.resolve("definitions.json"));
        moveInto(staging.resolve("global-stats.json"), base.resolve("global-stats.json"));
        moveInto(staging.resolve("data-version.txt"), base.resolve("data-version.txt"));
        for (String name : written) {
            moveInto(staging.resolve("matrix").resolve(name), liveMatrix.resolve(name));
        }
        // 覆盖旧数据：这一版没有的英雄矩阵直接删掉，磁盘不会无限增长
        List<Path> stale = new ArrayList<>();
        try (var stream = Files.list(liveMatrix)) {
            stream.forEach(path -> {
                String name = path.getFileName().toString();
                if (name.endsWith(".json") && !written.contains(name)) {
                    stale.add(path);
                }
            });
        }
        for (Path path : stale) {
            Files.deleteIfExists(path);
        }
        deleteRecursively(staging);
        return new Installed(definitions.size(), globalStats.size(), written.size(), stale.size());
    }

    private void moveInto(Path from, Path to) throws Exception {
        try {
            Files.move(from, to, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException e) {
            Files.move(from, to, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private void deleteRecursively(Path dir) throws Exception {
        if (!Files.exists(dir)) {
            return;
        }
        try (var stream = Files.walk(dir)) {
            for (Path path : stream.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(path);
            }
        }
    }

    private int countMatrixFiles(Path dir) {
        if (!Files.isDirectory(dir)) {
            return 0;
        }
        try (var stream = Files.list(dir)) {
            return (int) stream.filter(p -> p.getFileName().toString().endsWith(".json")).count();
        } catch (Exception e) {
            return 0;
        }
    }

    private JsonNode fetchJson(String url) {
        byte[] body = fetchBytes(url);
        if (body == null) {
            return null;
        }
        try {
            return objectMapper.readTree(maybeGunzip(body));
        } catch (Exception e) {
            log.debug("manifest 解析失败 {}: {}", url, e.getMessage());
            return null;
        }
    }

    private byte[] fetchBytes(String url) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(timeout)
                    .header("Accept-Encoding", "gzip")
                    .header("User-Agent", "RankPeek/" + HextechContributionService.APP_VERSION)
                    .GET()
                    .build();
            HttpResponse<byte[]> response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() != 200) {
                log.debug("数据包请求失败 {}: HTTP {}", url, response.statusCode());
                return null;
            }
            return response.body();
        } catch (Exception e) {
            log.debug("数据包请求异常 {}: {}", url, e.getMessage());
            return null;
        }
    }

    /** 数据是 gzip 就解压：既认 nginx 的 Content-Encoding，也认我们自己发的 .json.gz。 */
    private byte[] maybeGunzip(byte[] body) {
        if (body == null || body.length < 2) {
            return body == null ? new byte[0] : body;
        }
        boolean gzipMagic = (body[0] & 0xff) == 0x1f && (body[1] & 0xff) == 0x8b;
        if (!gzipMagic) {
            return body;
        }
        try (var stream = new GZIPInputStream(new ByteArrayInputStream(body))) {
            return stream.readAllBytes();
        } catch (Exception e) {
            log.debug("gzip 解压失败: {}", e.getMessage());
            return body;
        }
    }

    private String sha256(byte[] body) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        return HexFormat.of().formatHex(digest.digest(body));
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isMissingNode() || value.isNull() ? null : value.asText();
    }

    private Path baseDir() {
        return pathService.getLocalDataRoot().resolve("hextech").resolve("aramgg");
    }

    private Path matrixDir() {
        return baseDir().resolve("matrix");
    }

    private void saveState() {
        Path path = baseDir().resolve(STATE_FILE_NAME);
        try {
            Files.createDirectories(path.getParent());
            var node = objectMapper.createObjectNode();
            node.put("localVersion", localVersion);
            node.put("remoteVersion", remoteVersion);
            node.put("updatedAt", updatedAt);
            node.put("checkedAt", checkedAt);
            node.put("nextCheckAt", nextCheckAt);
            node.put("failureCount", failureCount);
            node.put("bytes", bytes);
            node.put("definitions", definitionCount);
            node.put("globalStats", globalStatCount);
            node.put("matrices", matrixCount);
            Path temp = path.resolveSibling(path.getFileName() + ".tmp");
            Files.writeString(temp, objectMapper.writeValueAsString(node), StandardCharsets.UTF_8);
            try {
                Files.move(temp, path, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(temp, path, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (Exception e) {
            log.debug("aramgg bundle state not saved: {}", e.getMessage());
        }
    }

    private record Manifest(String version, String file, String sha256, long bytes,
                            long minIntervalHours, int definitions, int globalStats, int matrices) {
    }

    private record Installed(int definitions, int globalStats, int matrices, int removedStale) {
    }

    /** 下载状态（给前端的数据状态块用）。 */
    public record Summary(boolean available,
                          String state,
                          String dataVersion,
                          String remoteVersion,
                          String updatedAt,
                          String checkedAt,
                          String nextCheckAt,
                          long bytes,
                          int definitions,
                          int globalStats,
                          int matrices,
                          long minIntervalHours,
                          String message,
                          String error) {
    }
}
