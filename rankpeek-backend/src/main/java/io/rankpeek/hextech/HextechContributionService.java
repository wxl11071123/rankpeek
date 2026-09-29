package io.rankpeek.hextech;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.rankpeek.config.LocalDataPathService;
import io.rankpeek.model.GameDetail;
import io.rankpeek.model.MatchHistory;
import io.rankpeek.model.Summoner;
import io.rankpeek.patch.PatchService;
import io.rankpeek.patch.PatchVersion;
import io.rankpeek.service.MatchHistoryService;
import io.rankpeek.service.SummonerService;
import io.rankpeek.service.UserStoreService;
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
import java.util.LinkedHashMap;
import java.util.Map;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * 海斗匿名数据贡献服务。
 *
 * <p>红线（见 docs/hextech-data-plan.md §5）：只有玩家在「海斗」页明确同意后才会上传；
 * 上传内容完全匿名 —— 只有游戏版本、对局时间、英雄 ID、强化 ID、胜负，
 * <b>绝不包含</b> PUUID / 昵称 / tagLine / 账号 / 聊天等任何可定位到个人的字段。
 *
 * <p>去重用的 gameKey 是 sha256("rankpeek-hextech-v1:" + platformId + ":gameId")：单向哈希，
 * 服务器无法反推对局，且同一局在所有客户端算出同一个值。早期「掺本机随机盐」的实现已废弃
 * （见 docs/ACCEPTANCE-2026-09-26.md §4）。installId 是本机随机 ID，与账号无关，服务器只保存它的哈希。
 */
@Slf4j
@Service
public class HextechContributionService {

    static final int QUEUE_HEXTECH_ARAM = 2400;
    static final int SCHEMA_VERSION = 1;
    /** 每次上传最多带几局，避免单次请求过大。 */
    static final int MAX_GAMES_PER_UPLOAD = 3;
    /** 扫描最近多少局战绩来找海斗对局。 */
    static final int SCAN_MATCH_COUNT = 20;
    /** 状态文件里最多记住多少个已上传对局哈希。 */
    static final int MAX_REMEMBERED_GAME_KEYS = 500;
    /** 待上传列表的缓存时长：避免每次打开页面都重新拉战绩。 */
    static final long SCAN_CACHE_MILLIS = 5 * 60 * 1000L;
    /** 客户端版本号：上报和 User-Agent 都用它，别在多处写字面量。 */
    public static final String APP_VERSION = "1.1.2";
    /** 会话在过期前多久就提前换新的。 */
    static final long SESSION_REFRESH_MARGIN_SECONDS = 300L;
    /** 服务端下发的上传策略；地址同样来自 HextechEndpoints。 */
    static final String POLICY_FILE_NAME = "upload-policy.json";

    private static final DateTimeFormatter TIMESTAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final SummonerService summonerService;
    private final MatchHistoryService matchHistoryService;
    private final UserStoreService userStoreService;
    private final LocalDataPathService localDataPathService;
    private final ObjectMapper objectMapper;
    private final PatchService patchService;
    private final String ingestUrl;
    private final String sessionUrl;
    private final String policyUrl;
    private final Duration timeout;
    private final HttpClient httpClient;
    private final Object stateLock = new Object();

    private volatile CachedScan cachedScan;
    /** 短期上传会话（服务端签发，两小时有效）。丢了就重新申请。 */
    private volatile Session session;
    /** 服务端下发的上传策略。 */
    private volatile UploadPolicy policy = UploadPolicy.defaults();

    @Autowired
    public HextechContributionService(
            SummonerService summonerService,
            MatchHistoryService matchHistoryService,
            UserStoreService userStoreService,
            LocalDataPathService localDataPathService,
            ObjectMapper objectMapper,
            PatchService patchService,
            @Value("${rankpeek.hextech.ingest-url:}") String ingestUrl,
            @Value("${rankpeek.hextech.session-url:}") String sessionUrl,
            @Value("${rankpeek.hextech.policy-url:}") String policyUrl,
            @Value("${rankpeek.hextech.timeout-ms:8000}") long timeoutMs) {
        this(summonerService, matchHistoryService, userStoreService, localDataPathService, objectMapper,
                patchService, ingestUrl, sessionUrl, policyUrl,
                Duration.ofMillis(timeoutMs <= 0 ? 8000 : timeoutMs), null);
    }

    HextechContributionService(SummonerService summonerService,
                               MatchHistoryService matchHistoryService,
                               UserStoreService userStoreService,
                               LocalDataPathService localDataPathService,
                               ObjectMapper objectMapper,
                               PatchService patchService,
                               String ingestUrl,
                               String sessionUrl,
                               String policyUrl,
                               Duration timeout,
                               HttpClient httpClient) {
        this.summonerService = summonerService;
        this.matchHistoryService = matchHistoryService;
        this.userStoreService = userStoreService;
        this.localDataPathService = localDataPathService;
        this.objectMapper = objectMapper;
        this.patchService = patchService;
        this.ingestUrl = HextechEndpoints.resolve(HextechEndpoints.INGEST_URL, ingestUrl);
        this.sessionUrl = resolveSessionUrl(this.ingestUrl, sessionUrl);
        this.policyUrl = HextechEndpoints.resolve(HextechEndpoints.POLICY_URL, policyUrl);
        this.timeout = timeout == null || timeout.isZero() || timeout.isNegative() ? Duration.ofSeconds(8) : timeout;
        this.httpClient = httpClient != null ? httpClient : HttpClient.newBuilder()
                .connectTimeout(this.timeout)
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    /**
     * 服务端下发的上传策略。
     *
     * <p>意义是"不发版就能调上传压力"：想临时关掉上传、想缩小每批局数、想只收当前版本的对局，
     * 改服务器上那个 JSON 就行。客户端拉不到就用本地缓存，缓存也没有就用内置默认值 ——
     * 策略文件永远不该成为"传不上去"的原因。
     */
    record UploadPolicy(boolean enabled, int maxGamesPerUpload, String targetGamePatch) {

        static UploadPolicy defaults() {
            return new UploadPolicy(true, MAX_GAMES_PER_UPLOAD, null);
        }

        /** 这一局该不该传：策略里指定了目标版本就只传那个版本。 */
        boolean acceptsPatch(String patch) {
            if (targetGamePatch == null || targetGamePatch.isBlank()) {
                return true;
            }
            return targetGamePatch.equals(patch);
        }
    }

    /** 启动时先读本地缓存（离线也能用上次的策略）。 */
    @jakarta.annotation.PostConstruct
    public void loadPolicyFromDisk() {
        Path path = policyPath();
        try {
            if (!Files.isRegularFile(path)) {
                return;
            }
            UploadPolicy cached = parsePolicy(objectMapper.readTree(Files.readString(path, StandardCharsets.UTF_8)));
            if (cached != null) {
                policy = cached;
                log.info("hextech upload policy loaded from cache: enabled={} maxGames={} targetPatch={}",
                        cached.enabled(), cached.maxGamesPerUpload(), cached.targetGamePatch());
            }
        } catch (Exception e) {
            log.debug("hextech upload policy cache unreadable: {}", e.getMessage());
        }
    }

    /** 每 6 小时拉一次策略；拉不到就继续用缓存。 */
    @Scheduled(initialDelay = 60_000L, fixedDelay = 6L * 60L * 60L * 1000L)
    public void refreshPolicy() {
        try {
            HttpResult result = get(policyUrl);
            if (!result.ok()) {
                log.debug("hextech upload policy fetch failed: {}", result.describe());
                return;
            }
            UploadPolicy next = parsePolicy(objectMapper.readTree(result.body()));
            if (next == null) {
                return;
            }
            policy = next;
            Path path = policyPath();
            Files.createDirectories(path.getParent());
            Files.writeString(path, result.body(), StandardCharsets.UTF_8);
            log.info("hextech upload policy updated: enabled={} maxGames={} targetPatch={}",
                    next.enabled(), next.maxGamesPerUpload(), next.targetGamePatch());
        } catch (Exception e) {
            log.debug("hextech upload policy refresh skipped: {}", e.getMessage());
        }
    }

    /** 解析并夹紧取值：服务端给什么都不能让客户端越界。（包级可见：给策略测试用） */
    UploadPolicy parsePolicy(com.fasterxml.jackson.databind.JsonNode root) {
        com.fasterxml.jackson.databind.JsonNode node = root.path("hextechUpload");
        if (node.isMissingNode() || !node.isObject()) {
            return null;
        }
        boolean enabled = node.path("enabled").asBoolean(true);
        int maxGames = node.path("maxGamesPerUpload").asInt(MAX_GAMES_PER_UPLOAD);
        maxGames = Math.max(1, Math.min(MAX_GAMES_PER_UPLOAD, maxGames));
        String patch = node.path("targetGamePatch").asText(null);
        if (patch != null && !patch.matches("\\d{1,3}\\.\\d{1,3}")) {
            patch = null;
        }
        return new UploadPolicy(enabled, maxGames, patch);
    }

    private Path policyPath() {
        return localDataPathService.getLocalDataRoot().resolve("hextech").resolve(POLICY_FILE_NAME);
    }

    /** 玩家是否已同意上传，且本构建确实配置了上传目标。 */
    public boolean isEnabled() {
        return uploadConfigured() && userStoreService.isHextechContributionEnabled();
    }

    /**
     * 本构建是否配置了上传目标。
     *
     * <p>开源构建里没有 endpoints.properties，这里就是 false —— 于是不扫描、不上传、
     * 界面上也不会出现「开始贡献」，从根上杜绝「克隆一份就往我们服务器传数据」。
     */
    public boolean uploadConfigured() {
        return !ingestUrl.isBlank();
    }

    public void setEnabled(boolean enabled) {
        userStoreService.setHextechContributionEnabled(enabled);
        cachedScan = null;
        log.info("hextech contribution {}", enabled ? "enabled" : "disabled");
    }

    /** 状态：开关、待上传局数、上次结果。扫描带缓存，打开页面时不会每次都打战绩接口。 */
    public Status status() {
        State state = loadState();
        List<PendingGame> pending = isEnabled() ? scanPendingGames(state, false) : List.of();
        return new Status(
                isEnabled(),
                uploadConfigured(),
                describeIngestHost(),
                pending.size(),
                state.uploadedGameKeys().size(),
                contributedThisPatch(state),
                state.lastUploadAt(),
                state.lastUploadMessage(),
                maskInstallId(state.installId())
        );
    }

    /**
     * 本期（当前游戏版本）里玩家贡献了多少局。
     *
     * <p>只统计「上传时记下了 patch、且 patch 等于当前版本」的对局。升级前的老记录没有 patch，
     * 因此不计入 —— 这个数字只会少报，不会多报。
     */
    private int contributedThisPatch(State state) {
        String patch = currentPatch();
        if (patch == null || patch.isBlank()) {
            return 0;
        }
        return (int) state.uploadedGamePatches().values().stream()
                .filter(patch::equals)
                .count();
    }

    /** 将要发送的字段说明 + 合成示例（不含任何真实数据）。 */
    public Preview preview() {
        ObjectNode sample = objectMapper.createObjectNode();
        sample.put("schemaVersion", SCHEMA_VERSION);
        sample.put("installId", "rp-<本机随机ID，与账号无关>");
        sample.put("appVersion", APP_VERSION);
        sample.put("platform", "win32");
        ArrayNode games = sample.putArray("games");
        ObjectNode game = games.addObject();
        game.put("gameKey", "<这一局的去重编号：同一局所有玩家算出同一个值，只跟对局有关、不含账号信息>");
        game.put("patch", "16.19");
        game.put("queueId", QUEUE_HEXTECH_ARAM);
        game.put("playedAt", 1758700000000L);
        ArrayNode players = game.putArray("players");
        ObjectNode player = players.addObject();
        player.put("championId", 875);
        player.putArray("augmentIds").add(1001).add(1002).add(1003).add(1004);
        player.put("win", true);

        String sampleJson;
        try {
            sampleJson = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(sample);
        } catch (Exception e) {
            sampleJson = "{}";
        }

        return new Preview(
                SCHEMA_VERSION,
                List.of(
                        "游戏版本 —— 这一局是哪个版本打的",
                        "对局时间 —— 什么时候打的",
                        "每个玩家选的英雄",
                        "每个玩家拿到的强化（最多 4 个）",
                        "这局赢没赢",
                        "一个去重编号 —— 同一局所有玩家算出同一个值，只跟对局有关、不含账号信息",
                        "本机随机编号 —— 与账号无关，服务器只保存它的哈希"
                ),
                List.of(
                        "昵称 / 召唤师名",
                        "账号信息（PUUID、登录名等）",
                        "聊天记录",
                        "任何能定位到你个人的信息"
                ),
                sampleJson
        );
    }

    /** 手动触发一次上传（只在已同意时可用；正常流程靠定时静默上传）。 */
    public Status uploadNow() {
        if (!isEnabled()) {
            throw new IllegalStateException("尚未同意上传海斗数据");
        }
        return uploadPending();
    }

    /**
     * 静默上传：同意之后玩家不用点任何按钮。
     *
     * <p>每 10 分钟看一次最近战绩，把还没传过的海斗对局补上（一次最多 {@value #MAX_GAMES_PER_UPLOAD} 局）。
     * 同一局由 gameKey 去重，本机记过就不再传，所以一局最多上传一次。
     */
    @Scheduled(initialDelay = 120_000L, fixedDelay = 10 * 60 * 1000L)
    public void autoUploadIfDue() {
        if (!isEnabled() || !policy.enabled()) {
            return;
        }
        try {
            uploadPending();
        } catch (Exception e) {
            log.debug("hextech auto upload skipped: {}", e.getMessage());
        }
    }

    /** 真正干活的上传：扫描待传对局 -> 发送 -> 记录已传哈希。同一时刻只允许一个。 */
    private synchronized Status uploadPending() {
        State state = loadState();
        List<PendingGame> pending = scanPendingGames(state, true);
        if (pending.isEmpty()) {
            return status();
        }

        UploadPolicy current = policy;
        if (!current.enabled()) {
            return status();
        }
        // 策略可以缩小每批局数、也可以只收指定版本的对局（不合的留在待传列表里，不是丢掉）
        List<PendingGame> eligible = pending.stream()
                .filter(game -> current.acceptsPatch(game.patch()))
                .toList();
        if (eligible.isEmpty()) {
            return status();
        }
        List<PendingGame> batch = eligible.subList(0, Math.min(current.maxGamesPerUpload(), eligible.size()));
        int players = batch.stream().mapToInt(game -> game.players().size()).sum();
        UploadOutcome outcome = sendBatch(state, batch);

        if (outcome.ok()) {
            List<String> keys = new ArrayList<>(state.uploadedGameKeys());
            Map<String, String> patches = new LinkedHashMap<>(state.uploadedGamePatches());
            batch.stream()
                    .filter(game -> outcome.settled().contains(game.gameKey()))
                    .forEach(game -> {
                        keys.add(game.gameKey());
                        patches.put(game.gameKey(), game.patch());
                    });
            while (keys.size() > MAX_REMEMBERED_GAME_KEYS) {
                patches.remove(keys.remove(0));
            }
            int accepted = outcome.accepted();
            int duplicates = outcome.duplicates();
            String message = duplicates > 0
                    ? "已上传 " + accepted + " 局 / " + players + " 名玩家（" + duplicates + " 局重复已跳过）"
                    : "已上传 " + accepted + " 局 / " + players + " 名玩家";
            State next = new State(state.installId(), keys,
                    ZonedDateTime.now(ZoneId.of("Asia/Shanghai")).format(TIMESTAMP),
                    message, state.lastHeartbeatDay(), patches);
            saveState(next);
            cachedScan = null;
            log.info("hextech contribution uploaded accepted={} duplicates={} players={}",
                    accepted, duplicates, players);
            return status();
        }

        State next = new State(state.installId(), state.uploadedGameKeys(),
                state.lastUploadAt(), "上传失败：" + outcome.message(), state.lastHeartbeatDay(),
                state.uploadedGamePatches());
        saveState(next);
        log.warn("hextech contribution upload failed: {}", outcome.message());
        return status();
    }

    /** 每天最多一次心跳，用来统计日活；未同意时完全不上报。 */
    @Scheduled(initialDelay = 180_000L, fixedDelay = 6 * 60 * 60 * 1000L)
    public void heartbeatIfDue() {
        if (!isEnabled()) {
            return;
        }
        try {
            State state = loadState();
            String today = LocalDate.now(ZoneId.of("Asia/Shanghai")).toString();
            if (today.equals(state.lastHeartbeatDay())) {
                return;
            }
            String url = heartbeatUrl();
            if (url == null) {
                return;
            }
            ObjectNode payload = objectMapper.createObjectNode();
            payload.put("installId", state.installId());
            payload.put("day", today);
            payload.put("version", APP_VERSION);
            String patch = currentPatch();
            if (patch != null) {
                payload.put("patch", patch);
            }
            payload.put("mode", "hextech");
            payload.put("os", System.getProperty("os.name", "unknown"));
            HttpResult result = send(url, payload, null);
            if (result.ok()) {
                saveState(new State(state.installId(), state.uploadedGameKeys(),
                        state.lastUploadAt(), state.lastUploadMessage(), today,
                        state.uploadedGamePatches()));
            }
        } catch (Exception e) {
            log.debug("hextech heartbeat skipped: {}", e.getMessage());
        }
    }

    // ------------------------------------------------------------------ 内部实现

    /** 会话地址默认从上传地址推出来，避免两处配置各写一遍。 */
    static String resolveSessionUrl(String ingestUrl, String configured) {
        if (configured != null && !configured.isBlank()) {
            return configured.trim();
        }
        if (ingestUrl != null && ingestUrl.endsWith("/upload/batch")) {
            return ingestUrl.substring(0, ingestUrl.length() - "/upload/batch".length()) + "/upload/session";
        }
        return ingestUrl;
    }

    private String heartbeatUrl() {
        if (ingestUrl.endsWith("/upload/batch")) {
            return ingestUrl.substring(0, ingestUrl.length() - "/upload/batch".length()) + "/telemetry/heartbeat";
        }
        return null;
    }

    private HttpResult send(String url, ObjectNode payload, String token) {
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url))
                    .timeout(timeout)
                    .header("Content-Type", "application/json")
                    .header("User-Agent", "RankPeek/" + APP_VERSION);
            if (token != null && !token.isBlank()) {
                builder.header("Authorization", "Bearer " + token);
            }
            HttpRequest request = builder
                    .POST(HttpRequest.BodyPublishers.ofString(
                            objectMapper.writeValueAsString(payload), StandardCharsets.UTF_8))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return new HttpResult(response.statusCode(), response.body());
        } catch (Exception e) {
            return new HttpResult(0, "网络错误：" + e.getMessage());
        }
    }

    /** 拉静态文件（策略是 nginx 直接发的 JSON，只能 GET）。 */
    private HttpResult get(String url) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(timeout)
                    .header("User-Agent", "RankPeek/" + APP_VERSION)
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return new HttpResult(response.statusCode(), response.body());
        } catch (Exception e) {
            return new HttpResult(0, "网络错误：" + e.getMessage());
        }
    }

    /** 换一个短期上传会话；拿不到就返回 null（本轮不上传，下次再试）。 */
    private String ensureSession(State state) {
        Session current = session;
        if (current != null
                && current.expiresAt().isAfter(Instant.now().plusSeconds(SESSION_REFRESH_MARGIN_SECONDS))) {
            return current.token();
        }
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("schemaVersion", SCHEMA_VERSION);
        payload.put("installId", state.installId());
        payload.put("appVersion", APP_VERSION);
        payload.put("platform", System.getProperty("os.name", "win32"));
        HttpResult result = send(sessionUrl, payload, null);
        if (!result.ok()) {
            log.warn("hextech upload session failed: {}", result.describe());
            return null;
        }
        try {
            com.fasterxml.jackson.databind.JsonNode data = objectMapper.readTree(result.body()).path("data");
            String token = data.path("token").asText(null);
            if (token == null || token.isBlank()) {
                log.warn("hextech upload session response has no token");
                return null;
            }
            String expiresAt = data.path("expiresAt").asText(null);
            Instant expires = expiresAt == null || expiresAt.isBlank()
                    ? Instant.now().plusSeconds(3600L) : Instant.parse(expiresAt);
            session = new Session(token, expires);
            return token;
        } catch (Exception e) {
            log.warn("hextech upload session unreadable: {}", e.getMessage());
            return null;
        }
    }

    /** 发一批；401 说明会话过期，丢掉重申请一次再试。（包级可见：给协议测试用） */
    UploadOutcome sendBatch(State state, List<PendingGame> batch) {
        String token = ensureSession(state);
        if (token == null) {
            return new UploadOutcome(false, Set.of(), 0, 0, "拿不到上传会话");
        }
        HttpResult result = send(ingestUrl, buildUploadPayload(state, batch), token);
        if (result.status() == 401) {
            session = null;
            String retryToken = ensureSession(state);
            if (retryToken == null) {
                return new UploadOutcome(false, Set.of(), 0, 0, "上传会话失效");
            }
            result = send(ingestUrl, buildUploadPayload(state, batch), retryToken);
        }
        if (!result.ok()) {
            return new UploadOutcome(false, Set.of(), 0, 0, result.describe());
        }
        return readAcknowledgements(result, batch);
    }

    /**
     * 读逐条回执：只有服务端明确认下的对局才不再重传。
     *
     * <p>一条坏数据不该拖累同一批里的其它对局，所以这里是逐条判断，
     * 而不是"整批 200 就全当成功"。
     */
    private UploadOutcome readAcknowledgements(HttpResult result, List<PendingGame> batch) {
        try {
            com.fasterxml.jackson.databind.JsonNode data = objectMapper.readTree(result.body()).path("data");
            Set<String> settled = new LinkedHashSet<>();
            for (com.fasterxml.jackson.databind.JsonNode ack : data.path("acknowledgements")) {
                String status = ack.path("status").asText("");
                boolean retryable = ack.path("retryable").asBoolean(false);
                boolean done = "inserted".equals(status) || "duplicate".equals(status)
                        || ("rejected".equals(status) && !retryable);
                if (done) {
                    settled.add(ack.path("gameKey").asText(""));
                }
            }
            if (settled.isEmpty() && !batch.isEmpty()) {
                // 服务端没给逐条回执（旧版）：整批按成功处理，保持兼容
                batch.forEach(game -> settled.add(game.gameKey()));
            }
            return new UploadOutcome(true, settled,
                    data.path("accepted").asInt(0), data.path("duplicates").asInt(0), "");
        } catch (Exception e) {
            return new UploadOutcome(false, Set.of(), 0, 0, "回执解析失败：" + e.getMessage());
        }
    }

    /** HTTP 结果：状态码 + 原始响应体（回执要逐条读，不能只看状态码）。 */
    private record HttpResult(int status, String body) {
        boolean ok() {
            return status == 200;
        }

        String describe() {
            String trimmed = body == null ? "" : body.trim();
            return status + " " + (trimmed.length() <= 160 ? trimmed : trimmed.substring(0, 160) + "…");
        }
    }

    /** 短期上传会话。 */
    private record Session(String token, Instant expiresAt) {
    }

    /**
     * 一次上传的结果。
     *
     * @param settled 服务端已明确回执的对局（inserted / duplicate / 不可重试的 rejected），不再重传
     */
    record UploadOutcome(boolean ok, Set<String> settled, int accepted, int duplicates, String message) {
    }

    private ObjectNode buildUploadPayload(State state, List<PendingGame> games) {
        ObjectNode root = objectMapper.createObjectNode();
        root.put("schemaVersion", SCHEMA_VERSION);
        root.put("installId", state.installId());
        root.put("appVersion", APP_VERSION);
        root.put("platform", System.getProperty("os.name", "win32"));
        ArrayNode gamesNode = root.putArray("games");
        for (PendingGame game : games) {
            ObjectNode node = gamesNode.addObject();
            node.put("gameKey", game.gameKey());
            node.put("patch", game.patch());
            node.put("queueId", QUEUE_HEXTECH_ARAM);
            if (game.playedAt() != null) {
                node.put("playedAt", game.playedAt());
            }
            ArrayNode players = node.putArray("players");
            for (PlayerRecord player : game.players()) {
                ObjectNode playerNode = players.addObject();
                playerNode.put("championId", player.championId());
                ArrayNode augmentIds = playerNode.putArray("augmentIds");
                player.augmentIds().forEach(augmentIds::add);
                playerNode.put("win", player.win());
            }
        }
        return root;
    }

    private List<PendingGame> scanPendingGames(State state, boolean force) {
        long now = System.currentTimeMillis();
        CachedScan cached = this.cachedScan;
        if (!force && cached != null && now - cached.at() < SCAN_CACHE_MILLIS) {
            return cached.games();
        }
        List<PendingGame> games = collectPendingGames(state);
        this.cachedScan = new CachedScan(now, games);
        return games;
    }

    private List<PendingGame> collectPendingGames(State state) {
        Summoner me;
        try {
            me = summonerService.getMySummoner();
        } catch (Exception e) {
            log.debug("hextech contribution: no LCU summoner ({})", e.getMessage());
            return List.of();
        }
        if (me == null || me.getPuuid() == null) {
            return List.of();
        }

        List<MatchHistory> matches;
        try {
            matches = matchHistoryService.getMatchHistory(me.getPuuid(), 0, SCAN_MATCH_COUNT);
        } catch (Exception e) {
            log.debug("hextech contribution: match history unavailable ({})", e.getMessage());
            return List.of();
        }
        if (matches == null || matches.isEmpty()) {
            return List.of();
        }

        List<PendingGame> pending = new ArrayList<>();
        int hextechGames = 0;
        for (MatchHistory match : matches) {
            if (match == null || match.getGameId() == null) {
                continue;
            }
            if (match.getQueueId() == null || match.getQueueId() != QUEUE_HEXTECH_ARAM) {
                continue;
            }
            String key = gameKey(match.getPlatformId(), match.getGameId());
            if (state.uploadedGameKeys().contains(key)) {
                continue;
            }
            // 只统计「还没传过、这次真去组装了」的对局 —— 放在已上传判断之后，
            // 否则每次「全都传过了」的正常扫描都会误报成"组装失败"
            hextechGames++;
            GameDetail detail;
            try {
                detail = matchHistoryService.getGameDetailById(match.getGameId());
            } catch (Exception e) {
                log.debug("hextech contribution: detail {} unavailable ({})", match.getGameId(), e.getMessage());
                continue;
            }
            PendingGame game = toPendingGame(key, match, detail);
            if (game != null) {
                pending.add(game);
            }
        }
        if (pending.isEmpty() && hextechGames > 0) {
            // 静默失败最要命：以前这里一声不吭，玩家只会觉得"贡献开了却没数据"
            log.warn("hextech contribution: 有 {} 局待传海斗拉不到对局详情或版本号，本批跳过", hextechGames);
        }
        return pending;
    }

    private PendingGame toPendingGame(String key, MatchHistory match, GameDetail detail) {
        if (detail == null || detail.getParticipants() == null) {
            return null;
        }
        List<PlayerRecord> players = new ArrayList<>();
        for (GameDetail.GameParticipant participant : detail.getParticipants()) {
            if (participant == null || participant.getChampionId() == null) {
                continue;
            }
            GameDetail.Stats stats = participant.getStats();
            if (stats == null) {
                continue;
            }
            List<Integer> augmentIds = new ArrayList<>();
            for (Integer augmentId : new Integer[]{
                    stats.getPlayerAugment1(), stats.getPlayerAugment2(),
                    stats.getPlayerAugment3(), stats.getPlayerAugment4()}) {
                if (augmentId != null && augmentId > 0 && !augmentIds.contains(augmentId)) {
                    augmentIds.add(augmentId);
                }
            }
            players.add(new PlayerRecord(participant.getChampionId(), augmentIds,
                    Boolean.TRUE.equals(stats.getWin())));
        }
        if (players.isEmpty()) {
            return null;
        }

        // patch 的口径必须和服务端聚合用的键一致，否则同一批数据会被拆成两个版本。
        // 主力来源是服务端下发的 patch；对局自带版本号只在它可用时才用
        // （实测 SGP / LCU 的战绩摘要和对局详情都不带 gameVersion，基本走不到）。
        String patch = currentPatch();
        if (patch == null) {
            patch = patchFromGameVersion(detail.getGameVersion());
        }
        if (patch == null) {
            patch = patchFromGameVersion(match.getGameVersion());
        }
        if (patch == null) {
            // 认不出这局属于哪个版本：宁可不传，也不往库里塞 "unknown" 这种脏标签
            return null;
        }
        return new PendingGame(key, patch, match.getGameCreation(), players);
    }

    /**
     * 从游戏版本号推出 patch（{@code 16.19.820.7193} -&gt; {@code 16.19}）。
     *
     * <p>本来想用它做到"每局标自己的版本"，但实测（2026-09-29）SGP 和 LCU 两边的
     * 战绩摘要与对局详情都不带 {@code gameVersion}，它几乎永远是 null。
     * 所以现在退居兜底，主力来源是 {@link #currentPatch()}（服务端口径）。
     * 取不到返回 null，由调用方决定跳过还是兜底。
     */
    static String patchFromGameVersion(String gameVersion) {
        if (gameVersion == null || gameVersion.isBlank()) {
            return null;
        }
        String[] parts = gameVersion.trim().split("\\.");
        if (parts.length < 2) {
            return null;
        }
        try {
            return String.format(java.util.Locale.ROOT, "%d.%02d",
                    Integer.parseInt(parts[0].trim()), Integer.parseInt(parts[1].trim()));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /**
     * 这一批对局该记成哪个 patch。
     *
     * <p>先看本机 patch 表（历史遗留，通常为空），再用服务端下发的自建数据快照里的 patch ——
     * 那是服务端自己聚合用的键，口径天然一致。
     *
     * <p><b>拿不到就返回 {@code null}，绝不编一个字符串顶上。</b>服务端用
     * {@code ^[0-9]{1,3}.[0-9]{1,3}$} 校验 patch；1.1.1 的兜底值是字面量 {@code "unknown"}，
     * 结果整批上传被 400 拒收，而且重试一万次也不会变（实测某台机器连续 9 次上传全被拒）。
     */
    String currentPatch() {
        try {
            String stored = patchService.findCurrentPatch().map(PatchVersion::patchKey).orElse(null);
            if (isValidPatch(stored)) {
                return stored.trim();
            }
        } catch (Exception e) {
            // 本机 patch 表是可选的历史遗留：读不到就往下走
        }
        String fromServer = serverDataPatch();
        return isValidPatch(fromServer) ? fromServer.trim() : null;
    }

    /** patch 的服务端校验规则，两边必须一致 —— 不一致就是整批上传失败。 */
    static boolean isValidPatch(String patch) {
        return patch != null && patch.trim().matches("^[0-9]{1,3}\\.[0-9]{1,3}$");
    }

    /**
     * 服务端下发的自建数据快照里带的 patch。
     *
     * <p>就是 {@code <localDataRoot>/hextech/self-data.json} 里的 {@code matrix.patch}，
     * 由 {@link HextechSelfDataService} 写入，和服务端聚合自建数据时用的是同一个键。
     */
    private String serverDataPatch() {
        if (localDataPathService == null) {
            return null;
        }
        Path path = localDataPathService.getLocalDataRoot().resolve("hextech").resolve("self-data.json");
        try {
            if (!Files.isRegularFile(path)) {
                return null;
            }
            return objectMapper.readTree(Files.readString(path, StandardCharsets.UTF_8))
                    .path("matrix")
                    .path("patch")
                    .asText(null);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 对局去重键。
     *
     * <p><b>跨客户端一致</b>：同一局会被最多 10 名玩家各自的客户端上传，只有所有客户端算出
     * 同一个键，服务器才能把这局只计一次。所以输入必须是双方都知道的确定值（对局标识 + 对局日期），
     * **不能掺入本机随机盐**。
     *
     * <p><b>为什么不再掺日期</b>：早期实现把「对局发生的自然日」也算进哈希，本意是让键每天轮换。
     * 但日期来自对局创建时间，上游一旦没给这个时间戳就退化成空串 —— 同一局在不同客户端上会算出
     * 两个键，于是被重复计数。现在只按「平台 + 对局 ID」算：同一场比赛永远只有一个键。
     *
     * <p>这确实让键变成了一个稳定的对局伪匿名标识（单向哈希，不含任何人）。但它标识的是
     * <b>对局</b>不是<b>人</b>，服务端也只拿它做去重，不违反"不收集用户数据"这条线。
     * 去重记录因此必须长期保留：聚合结果是明细层的派生值，不会跟着墓碑一起回退，
     * 按时间删墓碑等于给"等两天再传一遍"留洞。
     */
    static String gameKey(String platformId, long gameId) {
        try {
            String material = "rankpeek-hextech-v1:" + (platformId == null ? "" : platformId)
                    + ":" + gameId;
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(material.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("无法生成对局哈希", e);
        }
    }

    private String describeIngestHost() {
        try {
            URI uri = URI.create(ingestUrl);
            String host = uri.getHost();
            return host == null ? "未配置" : host + (uri.getPort() > 0 ? ":" + uri.getPort() : "");
        } catch (Exception e) {
            return "未配置";
        }
    }

    private String maskInstallId(String installId) {
        if (installId == null || installId.length() <= 8) {
            return installId == null ? "" : installId;
        }
        return installId.substring(0, 8) + "…";
    }

    private Path statePath() {
        return localDataPathService.getLocalDataRoot().resolve("hextech").resolve("contribution-state.json");
    }

    private State loadState() {
        synchronized (stateLock) {
            Path path = statePath();
            try {
                if (Files.isRegularFile(path)) {
                    State stored = objectMapper.readValue(Files.readString(path, StandardCharsets.UTF_8), State.class);
                    if (stored.installId() != null) {
                        return new State(stored.installId(),
                                stored.uploadedGameKeys() == null ? List.of() : stored.uploadedGameKeys(),
                                stored.lastUploadAt(), stored.lastUploadMessage(), stored.lastHeartbeatDay(),
                                stored.uploadedGamePatches() == null ? Map.of() : stored.uploadedGamePatches());
                    }
                }
            } catch (Exception e) {
                log.warn("hextech contribution state unreadable, recreating: {}", e.getMessage());
            }
            State created = new State(
                    "rp-" + UUID.randomUUID(),
                    List.of(), null, null, null);
            saveState(created);
            return created;
        }
    }

    private void saveState(State state) {
        synchronized (stateLock) {
            Path path = statePath();
            try {
                Files.createDirectories(path.getParent());
                Path temp = path.resolveSibling(path.getFileName() + ".tmp");
                Files.writeString(temp, objectMapper.writeValueAsString(state), StandardCharsets.UTF_8);
                try {
                    Files.move(temp, path, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
                } catch (AtomicMoveNotSupportedException e) {
                    Files.move(temp, path, StandardCopyOption.REPLACE_EXISTING);
                }
            } catch (Exception e) {
                log.warn("hextech contribution state not saved: {}", e.getMessage());
            }
        }
    }

    /**
     * 本机状态：随机身份 + 已上传对局哈希。
     *
     * <p>{@code uploadedGamePatches} 记录每个已上传对局属于哪个 patch，用来算「本期贡献了几局」。
     * 它是后加的字段，老状态文件里没有 —— 反序列化后为 null，由 {@link #loadState()} 兜底成空表，
     * 于是老对局不计入本期（只少报，不多报）。
     */
    record State(String installId,
                 List<String> uploadedGameKeys,
                 String lastUploadAt,
                 String lastUploadMessage,
                 String lastHeartbeatDay,
                 Map<String, String> uploadedGamePatches) {

        State(String installId,
              List<String> uploadedGameKeys,
              String lastUploadAt,
              String lastUploadMessage,
              String lastHeartbeatDay) {
            this(installId, uploadedGameKeys, lastUploadAt, lastUploadMessage, lastHeartbeatDay, Map.of());
        }
    }

    record CachedScan(long at, List<PendingGame> games) {
    }

    record PendingGame(String gameKey, String patch, Long playedAt, List<PlayerRecord> players) {
    }

    record PlayerRecord(int championId, List<Integer> augmentIds, boolean win) {
    }

    /** 对外状态。 */
    public record Status(boolean enabled,
                         boolean uploadConfigured,
                         String ingestHost,
                         int pendingGames,
                         int uploadedGames,
                         int contributedThisPatch,
                         String lastUploadAt,
                         String lastUploadMessage,
                         String installIdHint) {
    }

    /** 上传前给玩家看的字段说明。 */
    public record Preview(int schemaVersion,
                          List<String> fields,
                          List<String> neverUploaded,
                          String sampleJson) {
    }
}
