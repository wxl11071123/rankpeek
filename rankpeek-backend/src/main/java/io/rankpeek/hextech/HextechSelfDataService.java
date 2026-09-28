package io.rankpeek.hextech;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.rankpeek.config.LocalDataPathService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

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
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;

/**
 * 自建层数据（玩家贡献的国服「英雄 × 强化」胜率）。
 *
 * <p>数据来自项目自己的服务器：{@code {dataBaseUrl}/version.json} 给出最新 dataVersion 与
 * matrix.json 的 sha256，内容变化时才下载。玩家没有同意贡献时，这一层为空，
 * 前端自动回退到 101 的国服公开数据（tier / 排名 / 选取率）。
 */
@Slf4j
@Service
public class HextechSelfDataService {

    private final ObjectMapper objectMapper;
    private final LocalDataPathService localDataPathService;
    private final String dataBaseUrl;
    private final Duration timeout;
    private final HttpClient httpClient;

    private volatile Snapshot snapshot = Snapshot.empty();

    @Autowired
    public HextechSelfDataService(ObjectMapper objectMapper,
                                  LocalDataPathService localDataPathService,
                                  @Value("${rankpeek.hextech.data-base-url:}") String dataBaseUrl,
                                  @Value("${rankpeek.hextech.timeout-ms:8000}") long timeoutMs) {
        this(objectMapper, localDataPathService, dataBaseUrl,
                Duration.ofMillis(timeoutMs <= 0 ? 8000 : timeoutMs), null);
    }

    HextechSelfDataService(ObjectMapper objectMapper,
                           LocalDataPathService localDataPathService,
                           String dataBaseUrl,
                           Duration timeout,
                           HttpClient httpClient) {
        this.objectMapper = objectMapper;
        this.localDataPathService = localDataPathService;
        this.dataBaseUrl = HextechEndpoints.resolve(HextechEndpoints.DATA_BASE_URL, dataBaseUrl)
                .replaceAll("/+$", "");
        this.timeout = timeout == null || timeout.isZero() || timeout.isNegative()
                ? Duration.ofSeconds(8) : timeout;
        this.httpClient = httpClient != null ? httpClient : HttpClient.newBuilder()
                .connectTimeout(this.timeout)
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    /** 启动时先读本地缓存（离线也能用上次的数据）。 */
    @jakarta.annotation.PostConstruct
    public void loadCachedSnapshot() {
        Snapshot cached = readCache();
        if (cached != null) {
            this.snapshot = cached;
            log.info("hextech self data cache loaded: version={} champions={} games={}",
                    cached.dataVersion(), cached.championCount(), cached.totalGames());
        }
    }

    /** 每 6 小时检查一次远端版本；没有新版本就不下载。 */
    @Scheduled(initialDelay = 90_000L, fixedDelay = 6 * 60 * 60 * 1000L)
    public void refreshIfStale() {
        if (dataBaseUrl.isBlank()) {
            return;
        }
        try {
            JsonNode version = fetchJson(dataBaseUrl + "/version.json");
            if (version == null) {
                return;
            }
            String dataVersion = text(version, "dataVersion");
            if (dataVersion == null || dataVersion.equals(snapshot.dataVersion())) {
                return;
            }
            String expectedSha = version.path("files").path("matrix.json").path("sha256").asText(null);
            byte[] body = fetchBytes(dataBaseUrl + "/" + dataVersion + "/matrix.json");
            if (body == null) {
                return;
            }
            if (expectedSha != null && !expectedSha.equalsIgnoreCase(sha256(body))) {
                log.warn("hextech self data sha256 mismatch, ignoring version {}", dataVersion);
                return;
            }
            Snapshot next = parse(dataVersion, body);
            if (next == null) {
                return;
            }
            writeCache(body, dataVersion);
            this.snapshot = next;
            log.info("hextech self data updated: version={} champions={} games={}",
                    next.dataVersion(), next.championCount(), next.totalGames());
        } catch (Exception e) {
            log.debug("hextech self data refresh skipped: {}", e.getMessage());
        }
    }

    /** 某个英雄的某个强化在自建层里的战绩。 */
    public Optional<Stat> find(long championId, long augmentId) {
        Snapshot current = snapshot;
        Map<Long, Stat> byAugment = current.index().get(championId);
        if (byAugment == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(byAugment.get(augmentId));
    }

    public Summary summary() {
        Snapshot current = snapshot;
        return new Summary(
                current.available(),
                current.dataVersion(),
                current.generatedAt(),
                current.patch(),
                current.totalGames(),
                current.totalPlayers(),
                current.championCount(),
                current.fetchedAt()
        );
    }

    // ------------------------------------------------------------------ 内部实现

    private Snapshot parse(String dataVersion, byte[] body) {
        try {
            JsonNode root = objectMapper.readTree(body);
            Map<Long, Map<Long, Stat>> index = new HashMap<>();
            for (JsonNode champion : root.path("champions")) {
                long championId = champion.path("championId").asLong();
                Map<Long, Stat> byAugment = new HashMap<>();
                for (JsonNode augment : champion.path("augments")) {
                    long augmentId = augment.path("id").asLong();
                    int wins = augment.path("wins").asInt();
                    int games = augment.path("games").asInt();
                    if (augmentId <= 0 || games <= 0) {
                        continue;
                    }
                    // 服务端下发的是"截断 + 贝叶斯收缩"之后的口径：
                    //   winRate = 收缩后的胜率（样本少时被拉回英雄总体水平）
                    //   lowSample / suppressed = 样本不足 / 单人占比过高，都不该拿来做排名
                    Double winRate = augment.path("winRate").isNumber()
                            ? augment.path("winRate").asDouble() : null;
                    boolean lowSample = augment.path("lowSample").asBoolean(false)
                            || augment.path("suppressed").asBoolean(false);
                    byAugment.put(augmentId, new Stat(wins, games, lowSample, winRate));
                }
                if (!byAugment.isEmpty()) {
                    index.put(championId, byAugment);
                }
            }
            return new Snapshot(
                    true,
                    dataVersion,
                    text(root, "generatedAt"),
                    text(root, "patch"),
                    root.path("totalGames").asInt(),
                    root.path("totalPlayers").asInt(),
                    index.size(),
                    nowText(),
                    Map.copyOf(index)
            );
        } catch (Exception e) {
            log.warn("hextech self data parse failed: {}", e.getMessage());
            return null;
        }
    }

    private Path cachePath() {
        return localDataPathService.getLocalDataRoot().resolve("hextech").resolve("self-data.json");
    }

    private Snapshot readCache() {
        Path path = cachePath();
        try {
            if (!Files.isRegularFile(path)) {
                return null;
            }
            JsonNode root = objectMapper.readTree(Files.readString(path, StandardCharsets.UTF_8));
            String dataVersion = text(root, "dataVersion");
            JsonNode matrix = root.path("matrix");
            if (dataVersion == null || matrix.isMissingNode()) {
                return null;
            }
            Snapshot parsed = parse(dataVersion, objectMapper.writeValueAsBytes(matrix));
            if (parsed == null) {
                return null;
            }
            return new Snapshot(parsed.available(), parsed.dataVersion(), parsed.generatedAt(), parsed.patch(),
                    parsed.totalGames(), parsed.totalPlayers(), parsed.championCount(),
                    text(root, "fetchedAt"), parsed.index());
        } catch (Exception e) {
            log.debug("hextech self data cache unreadable: {}", e.getMessage());
            return null;
        }
    }

    private void writeCache(byte[] matrixBody, String dataVersion) {
        Path path = cachePath();
        try {
            Files.createDirectories(path.getParent());
            var node = objectMapper.createObjectNode();
            node.put("dataVersion", dataVersion);
            node.put("fetchedAt", nowText());
            node.set("matrix", objectMapper.readTree(matrixBody));
            Path temp = path.resolveSibling(path.getFileName() + ".tmp");
            Files.writeString(temp, objectMapper.writeValueAsString(node), StandardCharsets.UTF_8);
            try {
                Files.move(temp, path, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(temp, path, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (Exception e) {
            log.warn("hextech self data cache not saved: {}", e.getMessage());
        }
    }

    private JsonNode fetchJson(String url) {
        byte[] body = fetchBytes(url);
        if (body == null) {
            return null;
        }
        try {
            return objectMapper.readTree(body);
        } catch (Exception e) {
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
                return null;
            }
            return gunzipIfNeeded(response);
        } catch (Exception e) {
            log.debug("hextech self data fetch failed {}: {}", url, e.getMessage());
            return null;
        }
    }

    private byte[] gunzipIfNeeded(HttpResponse<byte[]> response) {
        String encoding = response.headers().firstValue("content-encoding").orElse("");
        if (!encoding.toLowerCase().contains("gzip")) {
            return response.body();
        }
        try (var stream = new java.util.zip.GZIPInputStream(new java.io.ByteArrayInputStream(response.body()))) {
            return stream.readAllBytes();
        } catch (Exception e) {
            return response.body();
        }
    }

    private String sha256(byte[] body) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        return HexFormat.of().formatHex(digest.digest(body));
    }

    private String nowText() {
        return java.time.ZonedDateTime.now(java.time.ZoneId.of("Asia/Shanghai"))
                .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isMissingNode() || value.isNull() ? null : value.asText();
    }

    /** 一个强化的自建战绩。 */
    public record Stat(int wins, int games, boolean lowSample, Double shrunkWinRate) {
        /** 收缩后的胜率优先；服务端没给就退回原始 wins/games。 */
        public double winRate() {
            if (shrunkWinRate != null) {
                return shrunkWinRate;
            }
            return games <= 0 ? 0d : (double) wins / games;
        }
    }

    /** 自建层整体状态。 */
    public record Summary(boolean available,
                          String dataVersion,
                          String generatedAt,
                          String patch,
                          int totalGames,
                          int totalPlayers,
                          int championCount,
                          String fetchedAt) {
    }

    record Snapshot(boolean available,
                    String dataVersion,
                    String generatedAt,
                    String patch,
                    int totalGames,
                    int totalPlayers,
                    int championCount,
                    String fetchedAt,
                    Map<Long, Map<Long, Stat>> index) {

        static Snapshot empty() {
            return new Snapshot(false, null, null, null, 0, 0, 0, null, Map.of());
        }
    }
}
