package io.rankpeek.hextech;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.rankpeek.config.LocalDataPathService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;

/**
 * 海斗排行榜数据的抓取与缓存。
 *
 * <p>策略：数据按日更新，所以"当天已抓过就不重复抓"；磁盘缓存在
 * {@code <localDataRoot>/hextech/snapshot.json}，进程重启后直接复用。
 * 抓取失败时保留上一份快照（离线可用），并记录状态供前端展示。
 */
@Slf4j
@Service
public class HextechDataService {

    private static final ZoneId CN_ZONE = ZoneId.of("Asia/Shanghai");
    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final String SOURCE = "101.qq.com";

    private final HextechRankSourceClient sourceClient;
    private final LocalDataPathService pathService;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    private volatile HextechSnapshot snapshot = HextechSnapshot.empty();
    private volatile String lastError;
    private volatile Instant lastAttemptAt;

    @Autowired
    public HextechDataService(HextechRankSourceClient sourceClient,
                              LocalDataPathService pathService,
                              ObjectMapper objectMapper) {
        this(sourceClient, pathService, objectMapper, Clock.systemUTC());
    }

    HextechDataService(HextechRankSourceClient sourceClient,
                       LocalDataPathService pathService,
                       ObjectMapper objectMapper,
                       Clock clock) {
        this.sourceClient = sourceClient;
        this.pathService = pathService;
        this.objectMapper = objectMapper == null ? new ObjectMapper() : objectMapper;
        this.clock = clock == null ? Clock.systemUTC() : clock;
    }

    /** 读取快照：磁盘缓存 → 过期则抓取 → 失败则回退旧数据。 */
    public HextechSnapshot getSnapshot() {
        if (!snapshot.isEmpty() && isFresh(snapshot)) {
            return snapshot;
        }
        Optional<HextechSnapshot> cached = readDiskSnapshot();
        if (cached.isPresent()) {
            snapshot = cached.get();
            if (isFresh(snapshot)) {
                return snapshot;
            }
        }
        try {
            refresh();
        } catch (Exception e) {
            lastError = e.getMessage();
            log.warn("海斗数据刷新失败，继续使用上一份快照: {}", e.getMessage());
        }
        return snapshot;
    }

    /** 强制刷新（供定时任务与调试接口使用）。 */
    public synchronized HextechSnapshot refresh() throws Exception {
        lastAttemptAt = Instant.now(clock);
        String augmentBody = sourceClient.fetchAugmentRank();
        HextechRankParser.AugmentPage page = HextechRankParser.parseAugmentRank(augmentBody);
        String dataDate = page.dataDate() != null ? page.dataDate() : today();

        List<HextechChampionRank> champions = List.of();
        try {
            champions = HextechRankParser.parseChampionRank(sourceClient.fetchChampionRank(dataDate));
        } catch (Exception e) {
            // 英雄榜失败不影响强化榜
            log.warn("海斗英雄榜抓取失败: {}", e.getMessage());
        }

        HextechSnapshot fresh = new HextechSnapshot(dataDate, SOURCE, Instant.now(clock), page.rows(), champions);
        if (fresh.isEmpty()) {
            throw new IllegalStateException("101 返回的数据为空");
        }
        snapshot = fresh;
        lastError = null;
        writeDiskSnapshot(fresh);
        log.info("海斗数据已更新: 日期={}, 强化={}, 英雄={}", dataDate, fresh.augments().size(), fresh.champions().size());
        return fresh;
    }

    /** 状态信息，供前端展示"数据日期 / 是否离线 / 上次错误"。 */
    public Status status() {
        HextechSnapshot current = getSnapshot();
        return new Status(
                current.dataDate(),
                current.source(),
                current.fetchedAt() == null ? null : current.fetchedAt().toString(),
                current.augments().size(),
                current.champions().size(),
                lastError,
                lastAttemptAt == null ? null : lastAttemptAt.toString()
        );
    }

    /** 每天 05:40（国服时间）后台刷新一次；应用没运行时由惰性检查兜底。 */
    @Scheduled(cron = "${rankpeek.hextech.refresh-cron:0 40 5 * * *}", zone = "Asia/Shanghai")
    public void scheduledRefresh() {
        try {
            if (isFresh(snapshot)) {
                return;
            }
            refresh();
        } catch (Exception e) {
            lastError = e.getMessage();
            log.warn("海斗数据定时刷新失败: {}", e.getMessage());
        }
    }

    private boolean isFresh(HextechSnapshot candidate) {
        if (candidate == null || candidate.fetchedAt() == null) {
            return false;
        }
        LocalDate fetchedDay = candidate.fetchedAt().atZone(CN_ZONE).toLocalDate();
        return fetchedDay.isEqual(LocalDate.now(clock.withZone(CN_ZONE)));
    }

    private String today() {
        return LocalDate.now(clock.withZone(CN_ZONE)).format(DATE_FORMAT);
    }

    Path snapshotPath() {
        return pathService.getLocalDataRoot().resolve("hextech").resolve("snapshot.json");
    }

    private Optional<HextechSnapshot> readDiskSnapshot() {
        Path path = snapshotPath();
        try {
            if (!Files.exists(path)) {
                return Optional.empty();
            }
            return Optional.of(objectMapper.readValue(Files.readString(path), HextechSnapshot.class));
        } catch (Exception e) {
            log.warn("读取海斗缓存失败: {}", e.getMessage());
            return Optional.empty();
        }
    }

    private void writeDiskSnapshot(HextechSnapshot value) {
        Path path = snapshotPath();
        try {
            Files.createDirectories(path.getParent());
            Path tmp = path.resolveSibling("snapshot.json.tmp");
            Files.writeString(tmp, objectMapper.writeValueAsString(value));
            Files.move(tmp, path, StandardCopyOption.REPLACE_EXISTING);
        } catch (Exception e) {
            log.warn("写入海斗缓存失败: {}", e.getMessage());
        }
    }

    /** 状态 DTO。 */
    public record Status(
            String dataDate,
            String source,
            String fetchedAt,
            int augmentCount,
            int championCount,
            String lastError,
            String lastAttemptAt
    ) {
    }
}
