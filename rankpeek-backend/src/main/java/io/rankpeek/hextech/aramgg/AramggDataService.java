package io.rankpeek.hextech.aramgg;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.rankpeek.config.LocalDataPathService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * aramgg 数据的抓取与缓存。
 *
 * <p>内存里只放"小"数据（强化定义、全局统计）；单英雄矩阵有 173×108 条，按英雄一个文件落盘
 * （{@code <localDataRoot>/hextech/aramgg/{dataVersion}/matrix/{id}.json}），按需读取并做少量 LRU 缓存。
 *
 * <p>额度：矩阵每个英雄 1 credit，全量 173 credits（免费额度 200/天）。抓取时按 ~1 req/s 节流，
 * 遇到 429 立即停止并保留已完成的部分。
 *
 * <p>正式分发走 {@link AramggBundleService}（从项目自己的服务器下载整包），直连 aramgg 的
 * {@code refreshMetadata/refreshMatrix} 只留作本地开发用；两条路写的是同一套磁盘布局。
 */
@Slf4j
@Service
public class AramggDataService {

    private static final int MATRIX_CACHE_SIZE = 24;
    private static final long THROTTLE_MS = 1100L;

    private final AramggClient client;
    private final LocalDataPathService pathService;
    private final ObjectMapper objectMapper;

    private volatile String dataVersion;
    private volatile Map<Long, AramggAugmentDefinition> definitions = Map.of();
    private volatile List<AramggAugmentStat> globalStats = List.of();
    private volatile List<Long> championIds = List.of();
    private volatile Instant refreshedAt;
    private volatile String lastError;

    private final Object topAugmentsLock = new Object();
    private Map<Long, List<AramggChampionAugment>> topAugmentsCache = Map.of();
    private String topAugmentsCacheKey = "";
    private volatile int matrixRevision;

    private final Map<Long, AramggChampionMatrix> matrixCache =
            new LinkedHashMap<>(MATRIX_CACHE_SIZE, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<Long, AramggChampionMatrix> eldest) {
                    return size() > MATRIX_CACHE_SIZE;
                }
            };

    @Autowired
    public AramggDataService(AramggClient client, LocalDataPathService pathService, ObjectMapper objectMapper) {
        this.client = client;
        this.pathService = pathService;
        this.objectMapper = objectMapper == null ? new ObjectMapper() : objectMapper;
        loadFromDisk();
    }

    /**
     * 数据包换新后重新读盘，并让所有缓存失效。
     *
     * <p>用事件而不是直接依赖 {@link AramggBundleService}，避免两个 Service 互相注入成环。
     */
    @EventListener
    public synchronized void onBundleUpdated(AramggBundleService.UpdatedEvent event) {
        synchronized (matrixCache) {
            matrixCache.clear();
        }
        synchronized (topAugmentsLock) {
            topAugmentsCache = Map.of();
            topAugmentsCacheKey = "";
        }
        matrixRevision++;
        loadFromDisk();
        log.info("aramgg 数据包换新，已重新载入: version={} 定义={} 全局统计={} 英雄={}",
                event.version(), definitions.size(), globalStats.size(), championIds.size());
    }

    public boolean isConfigured() {
        return client.isConfigured();
    }

    public Map<Long, AramggAugmentDefinition> definitions() {
        return definitions;
    }

    public List<AramggAugmentStat> globalStats() {
        return globalStats;
    }

    /** 抓取元数据：配置(0) + 定义(1) + 全局统计(1) + 英雄列表(1)，共约 3 credits。 */
    public synchronized void refreshMetadata() throws Exception {
        if (!isConfigured()) {
            throw new IllegalStateException("未配置 aramgg API Key");
        }
        String config = client.fetchConfig();
        String version = readDataVersion(config);
        if (version != null) {
            dataVersion = version;
        }
        String definitionsBody = client.fetchAugmentDefinitions();
        String statsBody = client.fetchAugmentStats();
        String championsBody = client.fetchChampions();

        definitions = AramggParser.parseAugmentDefinitions(definitionsBody);
        globalStats = AramggParser.parseAugmentStats(statsBody);
        championIds = AramggParser.parseChampionIds(championsBody);

        writeRaw("definitions.json", definitionsBody);
        writeRaw("global-stats.json", statsBody);
        writeRaw("champions.json", championsBody);

        refreshedAt = Instant.now();
        lastError = null;
        matrixRevision++;
        log.info("aramgg 元数据已更新: dataVersion={}, 定义={}, 全局统计={}, 英雄={}, 剩余额度={}",
                dataVersion, definitions.size(), globalStats.size(), championIds.size(),
                client.getLastCreditsRemaining());
    }

    /**
     * 抓取全部英雄的强化矩阵（已存在的跳过），约 1 credit/英雄。
     *
     * @return 本次实际抓取的英雄数
     */
    public synchronized int refreshMatrix(Collection<Long> ids) throws Exception {
        if (!isConfigured()) {
            throw new IllegalStateException("未配置 aramgg API Key");
        }
        Collection<Long> targets = (ids == null || ids.isEmpty()) ? championIds : ids;
        int fetched = 0;
        for (Long championId : targets) {
            if (championId == null || championId <= 0) {
                continue;
            }
            Path target = matrixPath(championId);
            if (Files.exists(target)) {
                continue;
            }
            try {
                String body = client.fetchChampionMatrix(championId);
                Files.createDirectories(target.getParent());
                Files.writeString(target, body);
                fetched++;
                Thread.sleep(THROTTLE_MS);
            } catch (Exception e) {
                lastError = e.getMessage();
                log.warn("抓取英雄 {} 的强化矩阵失败，停止本轮: {}", championId, e.getMessage());
                break;
            }
        }
        if (fetched > 0) {
            matrixRevision++;
            log.info("aramgg 矩阵抓取完成: 本次 {} 个英雄, 剩余额度={}", fetched, client.getLastCreditsRemaining());
        }
        return fetched;
    }

    /** 读取单英雄矩阵（磁盘 → 解析 → 小缓存）。 */
    public Optional<AramggChampionMatrix> championMatrix(long championId) {
        synchronized (matrixCache) {
            AramggChampionMatrix cached = matrixCache.get(championId);
            if (cached != null) {
                return Optional.of(cached);
            }
        }
        Path path = matrixPath(championId);
        if (!Files.exists(path)) {
            return Optional.empty();
        }
        try {
            AramggChampionMatrix parsed = AramggParser.parseChampionMatrix(Files.readString(path), championId);
            synchronized (matrixCache) {
                matrixCache.put(championId, parsed);
            }
            return Optional.of(parsed);
        } catch (Exception e) {
            log.warn("读取英雄 {} 的矩阵失败: {}", championId, e.getMessage());
            return Optional.empty();
        }
    }

    /**
     * 每个英雄的 top N 强化（按矩阵 rank 升序）。
     *
     * <p>要读 173 个矩阵文件，所以结果按数据版本缓存；refresh 时失效。
     */
    public java.util.Map<Long, List<AramggChampionAugment>> topAugments(int limit) {
        String cacheKey = (dataVersion == null ? "?" : dataVersion) + ":" + limit + ":" + matrixRevision;
        synchronized (topAugmentsLock) {
            if (cacheKey.equals(topAugmentsCacheKey)) {
                return topAugmentsCache;
            }
            java.util.Map<Long, List<AramggChampionAugment>> result = new java.util.HashMap<>();
            for (Long championId : championIds) {
                championMatrix(championId).ifPresent(matrix -> {
                    List<AramggChampionAugment> top = matrix.augments().stream()
                            .sorted(java.util.Comparator.comparingInt(
                                    (AramggChampionAugment row) -> parseRankOrMax(row.rank())))
                            .limit(limit)
                            .toList();
                    if (!top.isEmpty()) {
                        result.put(championId, top);
                    }
                });
            }
            topAugmentsCache = result;
            topAugmentsCacheKey = cacheKey;
            log.info("海斗英雄顶级强化已计算: {} 个英雄, 每个前 {} 个", result.size(), limit);
            return result;
        }
    }

    private static int parseRankOrMax(String value) {
        try {
            return value == null || value.isBlank() ? Integer.MAX_VALUE : Integer.parseInt(value.trim());
        } catch (NumberFormatException e) {
            return Integer.MAX_VALUE;
        }
    }

    /** 已落盘的矩阵英雄数。 */
    public int matrixFileCount() {
        Path dir = matrixDir();
        if (!Files.isDirectory(dir)) {
            return 0;
        }
        try (var stream = Files.list(dir)) {
            return (int) stream.filter(p -> p.getFileName().toString().endsWith(".json")).count();
        } catch (Exception e) {
            return 0;
        }
    }

    public Status status() {
        return new Status(
                isConfigured(),
                dataVersion,
                refreshedAt == null ? null : refreshedAt.toString(),
                definitions.size(),
                globalStats.size(),
                championIds.size(),
                matrixFileCount(),
                client.getLastCreditsRemaining(),
                lastError
        );
    }

    private void loadFromDisk() {
        try {
            Path base = baseDir();
            if (!Files.isDirectory(base)) {
                return;
            }
            Path definitionsPath = base.resolve("definitions.json");
            Path statsPath = base.resolve("global-stats.json");
            Path championsPath = base.resolve("champions.json");
            if (Files.exists(definitionsPath)) {
                definitions = AramggParser.parseAugmentDefinitions(Files.readString(definitionsPath));
            }
            if (Files.exists(statsPath)) {
                globalStats = AramggParser.parseAugmentStats(Files.readString(statsPath));
            }
            if (Files.exists(championsPath)) {
                championIds = AramggParser.parseChampionIds(Files.readString(championsPath));
            }
            if (championIds.isEmpty()) {
                // 服务器下发的数据包里没有 champions.json，英雄列表直接取矩阵目录
                championIds = readChampionIdsFromMatrixDir();
            }
            Path versionPath = base.resolve("data-version.txt");
            if (Files.exists(versionPath)) {
                dataVersion = Files.readString(versionPath).trim();
            }
            if (!definitions.isEmpty() || !globalStats.isEmpty()) {
                log.info("aramgg 缓存已载入: dataVersion={}, 定义={}, 全局统计={}", dataVersion, definitions.size(), globalStats.size());
            }
        } catch (Exception e) {
            log.warn("载入 aramgg 缓存失败: {}", e.getMessage());
        }
    }

    private String readDataVersion(String configBody) {
        try {
            return objectMapper.readTree(configBody).path("dataVersion").asText(null);
        } catch (Exception e) {
            return null;
        }
    }

    /** 从矩阵目录反推英雄列表（每个英雄一个 {id}.json）。 */
    private List<Long> readChampionIdsFromMatrixDir() {
        Path dir = matrixDir();
        if (!Files.isDirectory(dir)) {
            return List.of();
        }
        try (var stream = Files.list(dir)) {
            return stream.map(path -> path.getFileName().toString())
                    .filter(name -> name.endsWith(".json"))
                    .map(name -> name.substring(0, name.length() - 5))
                    .map(name -> {
                        try {
                            return Long.valueOf(name);
                        } catch (NumberFormatException e) {
                            return null;
                        }
                    })
                    .filter(java.util.Objects::nonNull)
                    .sorted()
                    .toList();
        } catch (Exception e) {
            return List.of();
        }
    }

    private Path baseDir() {
        return pathService.getLocalDataRoot().resolve("hextech").resolve("aramgg");
    }

    private Path matrixDir() {
        return baseDir().resolve("matrix");
    }

    private Path matrixPath(long championId) {
        return matrixDir().resolve(championId + ".json");
    }

    private void writeRaw(String name, String body) throws Exception {
        Path path = baseDir().resolve(name);
        Files.createDirectories(path.getParent());
        Files.writeString(path, body);
        if (dataVersion != null) {
            Files.writeString(baseDir().resolve("data-version.txt"), dataVersion);
        }
    }

    /** 状态 DTO。 */
    public record Status(
            boolean configured,
            String dataVersion,
            String refreshedAt,
            int definitionCount,
            int globalStatCount,
            int championCount,
            int matrixCount,
            String creditsRemaining,
            String lastError
    ) {
    }
}
