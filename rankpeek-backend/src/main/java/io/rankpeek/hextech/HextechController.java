package io.rankpeek.hextech;

import io.rankpeek.hextech.aramgg.AramggBundleService;
import io.rankpeek.hextech.aramgg.AramggChampionMatrix;
import io.rankpeek.hextech.aramgg.AramggDataService;
import io.rankpeek.hextech.aramgg.AramggChampionAugment;
import io.rankpeek.model.ApiResponse;
import io.rankpeek.service.AssetService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.net.InetAddress;
import java.util.List;

/**
 * 海斗（海克斯大乱斗）数据接口。
 *
 * <p>数据来源：101.qq.com（腾讯国服公开统计快照），按日更新，本地缓存。
 */
@RestController
@RequestMapping("/api/v1/hextech")
@RequiredArgsConstructor
public class HextechController {

    private final HextechDataService dataService;
    private final AssetService assetService;
    private final AramggDataService aramggDataService;
    private final AramggBundleService aramggBundleService;
    private final HextechContributionService contributionService;
    private final HextechSelfDataService selfDataService;
    private final io.rankpeek.service.ChampionSelectService championSelectService;
    private final io.rankpeek.service.GameFlowService gameFlowService;
    private final io.rankpeek.service.SummonerService summonerService;

    /** 数据状态：日期 / 来源 / 条数 / 上次错误。 */
    @GetMapping("/status")
    public ApiResponse<HextechDataService.Status> status() {
        return ApiResponse.success(dataService.status());
    }

    /** 强化榜（含本地定义：名称/稀有度/描述/图标）。 */
    @GetMapping("/augments")
    public ApiResponse<List<HextechAugmentBoardRow>> augments() {
        List<HextechAugmentBoardRow> rows = dataService.getSnapshot().augments().stream()
                .map(this::toBoardRow)
                .toList();
        return ApiResponse.success(rows);
    }

    private HextechAugmentBoardRow toBoardRow(HextechAugmentRank rank) {
        AssetService.AugmentMetadata meta = assetService.getAugmentMetadata(rank.augmentId()).orElse(null);
        String description = meta == null ? null
                : (hasText(meta.tooltip()) ? meta.tooltip() : meta.description());
        return new HextechAugmentBoardRow(
                rank.augmentId(),
                meta == null ? null : meta.name(),
                meta == null ? null : meta.rarity(),
                description,
                assetService.getAugmentIconPath(rank.augmentId()),
                rank.winRate(),
                rank.winRank(),
                rank.winRankChange(),
                rank.pickRate(),
                rank.pickRank(),
                rank.pickRankChange(),
                rank.bestChampionIds()
        );
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    /**
     * 英雄榜：101 排名 + 该英雄的顶级强化（arammgg 矩阵，按 rank 取前 3）。
     *
     * <p>没配置 aramgg Key 时 topAugments 为空数组，前端应隐藏该列。
     */
    @GetMapping("/champions")
    public ApiResponse<List<HextechChampionBoardRow>> champions() {
        java.util.Map<Long, List<AramggChampionAugment>> topAugments = aramggDataService.topAugments(3);
        List<HextechChampionBoardRow> rows = dataService.getSnapshot().champions().stream()
                .map(rank -> new HextechChampionBoardRow(
                        rank.championId(),
                        rank.winRank(),
                        rank.rankChangeText(),
                        rank.winRate(),
                        rank.pickRate(),
                        topAugments.getOrDefault(rank.championId(), List.of()).stream()
                                .map(this::toBoardAugment)
                                .toList()))
                .toList();
        return ApiResponse.success(rows);
    }

    private HextechChampionBoardRow.Augment toBoardAugment(AramggChampionAugment augment) {
        AssetService.AugmentMetadata meta = assetService.getAugmentMetadata(augment.augmentId()).orElse(null);
        return new HextechChampionBoardRow.Augment(
                augment.augmentId(),
                meta == null ? null : meta.name(),
                meta == null ? null : meta.rarity(),
                assetService.getAugmentIconPath(augment.augmentId()),
                augment.rank(),
                augment.pickRate(),
                augment.winRate()
        );
    }

    /**
     * 单英雄详情：101 排名 + aramgg 强化矩阵（合并本地名称/稀有度/图标）。
     *
     * <p>没有配置 aramgg Key 时，只返回 101 的排名信息，augments 为空数组。
     */
    @GetMapping("/champion/{championId}")
    public ApiResponse<HextechChampionDetail> championDetail(@PathVariable long championId) {
        HextechChampionRank rank = dataService.getSnapshot().champions().stream()
                .filter(row -> row.championId() == championId)
                .findFirst()
                .orElse(null);

        AramggChampionMatrix matrix = aramggDataService.championMatrix(championId).orElse(null);
        java.util.Map<Long, RankedAugment> ranked = rankAugments(matrix);

        List<HextechChampionDetail.AugmentRow> augments = matrix == null ? List.of()
                : matrix.augments().stream()
                        .map(augment -> toAugmentRow(championId, augment, ranked.get(augment.augmentId())))
                        .sorted(java.util.Comparator.comparingInt(
                                (HextechChampionDetail.AugmentRow row) -> parseIntOrMax(row.rank())))
                        .toList();

        return ApiResponse.success(new HextechChampionDetail(
                championId,
                rank == null ? null : rank.winRank(),
                rank == null ? null : rank.rankChangeText(),
                rank == null ? null : rank.winRate(),
                rank == null ? null : rank.pickRate(),
                matrix == null ? null : matrix.source(),
                matrix == null ? null : matrix.region(),
                augments
        ));
    }

    /**
     * 全部强化定义（id + 名称 + 稀有度），给 OCR 当匹配候选集。
     *
     * <p>注意：101 榜单只有被统计到的 211 个强化，游戏里还有没进榜单的（例如「裁决使」），
     * 只拿榜单当候选会漏识别。
     */
    @GetMapping("/augment-definitions")
    public ApiResponse<List<AugmentDefinition>> augmentDefinitions() {
        return ApiResponse.success(assetService.getAllAugmentMetadata().stream()
                .filter(meta -> meta.name() != null && !meta.name().isBlank())
                .map(meta -> new AugmentDefinition(meta.id(), meta.name(), meta.rarity()))
                .toList());
    }

    /** OCR 匹配候选：强化 id + 名称 + 稀有度。 */
    public record AugmentDefinition(long augmentId, String name, String rarity) {
    }

    // ---------- 局内悬浮窗 ----------

    /**
     * 只读游戏阶段：主进程用它决定「要不要起局内贴片」，比 /overlay 便宜得多
     * （不查英雄、不拼强化明细，1~5 秒轮询也不会拖慢后端）。
     */
    @GetMapping("/phase")
    public ApiResponse<PhaseData> phase() {
        String phase = null;
        try {
            phase = gameFlowService.getGamePhase();
        } catch (Exception e) {
            // LCU 未连接：phase 保持 null，调用方按"不在对局"处理
        }
        return ApiResponse.success(new PhaseData(phase));
    }

    /** 游戏阶段（LCU gameflow）。 */
    public record PhaseData(String phase) {
    }

    /**
     * 悬浮窗数据：自动识别当前英雄（选人阶段或局内）并返回该英雄的强化排行。
     *
     * <p>英雄识别顺序：选人会话的 localPlayerCellId → 局内 teamOne/teamTwo 的 puuid。
     * 识别不到时 championId 为 null，前端提示玩家手动选择英雄。
     */
    @GetMapping("/overlay")
    public ApiResponse<OverlayData> overlay(@RequestParam(required = false) Long championId) {
        String phase = null;
        try {
            phase = gameFlowService.getGamePhase();
        } catch (Exception e) {
            // LCU 未连接时 phase 为 null，不影响返回空数据
        }
        Long resolved = championId != null && championId > 0 ? championId : resolveCurrentChampionId();
        String source = resolved == null ? null
                : (championId != null && championId > 0 ? "manual" : currentChampionSource);
        HextechChampionDetail detail = resolved == null ? null : championDetail(resolved).getData();
        return ApiResponse.success(new OverlayData(phase, resolved, source, detail));
    }

    /** 最近一次英雄识别的来源，用于前端显示（champ-select / in-game）。 */
    private volatile String currentChampionSource;

    private Long resolveCurrentChampionId() {
        try {
            Long fromSelect = championIdFromChampionSelect();
            if (fromSelect != null) {
                currentChampionSource = "champ-select";
                return fromSelect;
            }
        } catch (Exception e) {
            // 不在选人阶段
        }
        try {
            Long fromGame = championIdFromGameSession();
            if (fromGame != null) {
                currentChampionSource = "in-game";
            }
            return fromGame;
        } catch (Exception e) {
            return null;
        }
    }

    private Long championIdFromChampionSelect() {
        io.rankpeek.model.ChampionSelectSession session = championSelectService.getChampionSelectSession();
        if (session == null || session.getMyTeam() == null) {
            return null;
        }
        Integer localCellId = session.getLocalPlayerCellId();
        String myPuuid = myPuuid();
        for (io.rankpeek.model.ChampionSelectSession.Player player : session.getMyTeam()) {
            if (player == null) {
                continue;
            }
            boolean isMe = (localCellId != null && localCellId.equals(player.getCellId()))
                    || (myPuuid != null && myPuuid.equals(player.getPuuid()));
            if (!isMe) {
                continue;
            }
            if (player.getChampionId() != null && player.getChampionId() > 0) {
                return player.getChampionId().longValue();
            }
            if (player.getChampionPickIntent() != null && player.getChampionPickIntent() > 0) {
                return player.getChampionPickIntent().longValue();
            }
        }
        return null;
    }

    private Long championIdFromGameSession() {
        io.rankpeek.model.GameSession gameSession = gameFlowService.getGameSession();
        if (gameSession == null) {
            return null;
        }
        String myPuuid = myPuuid();
        if (myPuuid == null) {
            return null;
        }
        io.rankpeek.model.GameSession.GameData gameData = gameSession.getGameData();
        if (gameData == null) {
            return null;
        }
        for (java.util.List<io.rankpeek.model.GameSession.OnePlayer> team :
                java.util.List.of(gameData.getTeamOne(), gameData.getTeamTwo())) {
            if (team == null) {
                continue;
            }
            for (io.rankpeek.model.GameSession.OnePlayer player : team) {
                if (player != null && myPuuid.equals(player.getPuuid())
                        && player.getChampionId() != null && player.getChampionId() > 0) {
                    return player.getChampionId().longValue();
                }
            }
        }
        return null;
    }

    private String myPuuid() {
        try {
            io.rankpeek.model.Summoner me = summonerService.getMySummoner();
            return me == null ? null : me.getPuuid();
        } catch (Exception e) {
            return null;
        }
    }

    /** 悬浮窗数据：当前阶段 + 当前英雄 + 该英雄的强化明细。 */
    public record OverlayData(String phase, Long championId, String championSource, HextechChampionDetail detail) {
    }

    // ---------- 匿名数据贡献（只有玩家同意后才上传；撤回后立即停止） ----------

    /** 贡献状态：是否已同意、待上传局数、上次上传结果。 */
    @GetMapping("/contribution")
    public ApiResponse<HextechContributionService.Status> contributionStatus() {
        return ApiResponse.success(contributionService.status());
    }

    /** 同意 / 撤回同意。 */
    @PostMapping("/contribution/enabled")
    public ApiResponse<HextechContributionService.Status> setContributionEnabled(
            @RequestParam boolean enabled) {
        contributionService.setEnabled(enabled);
        return ApiResponse.success(contributionService.status());
    }

    /** 上传前给玩家看的字段说明与示例（不含任何真实数据）。 */
    @GetMapping("/contribution/preview")
    public ApiResponse<HextechContributionService.Preview> contributionPreview() {
        return ApiResponse.success(contributionService.preview());
    }

    /** 立即上传（仅本机可调用，且必须已同意）。 */
    @PostMapping("/contribution/upload")
    public ApiResponse<HextechContributionService.Status> contributionUpload(
            jakarta.servlet.http.HttpServletRequest request) {
        if (!isLocalRequest(request)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "hextech upload is only available from localhost");
        }
        try {
            return ApiResponse.success(contributionService.uploadNow());
        } catch (IllegalStateException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, e.getMessage());
        }
    }

    /** 自建层数据状态：版本 / 总局数 / 覆盖英雄数。 */
    @GetMapping("/self-data")
    public ApiResponse<HextechSelfDataService.Summary> selfDataStatus() {
        return ApiResponse.success(selfDataService.summary());
    }

    /** 立即检查自建层新版本（仅本机可调用）。 */
    @PostMapping("/self-data/refresh")
    public ApiResponse<HextechSelfDataService.Summary> selfDataRefresh(
            jakarta.servlet.http.HttpServletRequest request) {
        if (!isLocalRequest(request)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "hextech self data refresh is only available from localhost");
        }
        selfDataService.refreshIfStale();
        return ApiResponse.success(selfDataService.summary());
    }

    /** 胜率权重：0.6 win + 0.4 pick。两个分量先各自转成英雄内百分位再加权。 */
    static final double WEIGHT_WIN_RATE = 0.6d;
    static final double WEIGHT_PICK_RATE = 0.4d;

    /** 自算出来的名次与梯队（覆盖 aramgg 给的 tier/rank）。 */
    record RankedAugment(int rank, String tier) {
    }

    /**
     * 自算「最适配」排序。
     *
     * <p>为什么不直接用 aramgg 给的 {@code rank}：实测那个字段基本就是选取率排名
     * （21644 条样本上 Spearman(rank, pickRate) = -0.905，而对着胜率只有 -0.525），
     * 于是会出现"选取率最高但胜率垫底"的强化排在第一位。
     *
     * <p>为什么也不能只看胜率：小样本的胜率不可信，几场全胜就会被顶到第一。
     *
     * <p>为什么必须先转百分位：pick 的跨度约 19 倍（0.4%~7.5%），win 只有 1.6 倍（32%~51%）。
     * 直接按原始值加权的话，选取率会把权重整个吃掉，设多少都没意义。
     */
    private java.util.Map<Long, RankedAugment> rankAugments(AramggChampionMatrix matrix) {
        if (matrix == null || matrix.augments().isEmpty()) {
            return java.util.Map.of();
        }
        List<AramggChampionAugment> rows = matrix.augments();
        int n = rows.size();
        double[] win = new double[n];
        double[] pick = new double[n];
        for (int i = 0; i < n; i++) {
            win[i] = parseDoubleOrZero(rows.get(i).winRate());
            pick[i] = parseDoubleOrZero(rows.get(i).pickRate());
        }
        Integer[] order = new Integer[n];
        for (int i = 0; i < n; i++) {
            order[i] = i;
        }
        java.util.Arrays.sort(order, (a, b) -> Double.compare(
                WEIGHT_WIN_RATE * percentile(win, win[b]) + WEIGHT_PICK_RATE * percentile(pick, pick[b]),
                WEIGHT_WIN_RATE * percentile(win, win[a]) + WEIGHT_PICK_RATE * percentile(pick, pick[a])));

        java.util.Map<Long, RankedAugment> result = new java.util.HashMap<>();
        for (int pos = 0; pos < n; pos++) {
            double q = (double) pos / n;
            String tier = q < 0.15d ? "1" : q < 0.40d ? "2" : q < 0.70d ? "3" : "4";
            result.put(rows.get(order[pos]).augmentId(), new RankedAugment(pos + 1, tier));
        }
        return result;
    }

    /** 在数组里不比 v 大的比例，即百分位（0~1，越大越好）。 */
    private static double percentile(double[] values, double v) {
        int below = 0;
        for (double x : values) {
            if (x <= v) {
                below++;
            }
        }
        return (double) below / values.length;
    }

    private HextechChampionDetail.AugmentRow toAugmentRow(long championId, AramggChampionAugment augment) {
        return toAugmentRow(championId, augment, null);
    }

    /** {@code ranked} 非空时用它覆盖 aramgg 的 tier/rank（其余字段照旧）。 */
    private HextechChampionDetail.AugmentRow toAugmentRow(long championId, AramggChampionAugment augment,
                                                          RankedAugment ranked) {
        AssetService.AugmentMetadata meta = assetService.getAugmentMetadata(augment.augmentId()).orElse(null);
        HextechSelfDataService.Stat self = selfDataService.find(championId, augment.augmentId()).orElse(null);
        return new HextechChampionDetail.AugmentRow(
                augment.augmentId(),
                meta == null ? null : meta.name(),
                meta == null ? null : meta.rarity(),
                assetService.getAugmentIconPath(augment.augmentId()),
                ranked == null ? augment.tier() : ranked.tier(),
                ranked == null ? augment.rank() : String.valueOf(ranked.rank()),
                augment.total(),
                augment.pickRate(),
                augment.winRate(),
                augment.numGames(),
                augment.winRateRegion(),
                self == null ? null : formatPercent(self.winRate()),
                self == null ? null : String.valueOf(self.games())
        );
    }

    private String formatPercent(double rate) {
        return String.format(java.util.Locale.ROOT, "%.1f%%", rate * 100d);
    }

    private int parseIntOrMax(String value) {
        try {
            return value == null || value.isBlank() ? Integer.MAX_VALUE : Integer.parseInt(value.trim());
        } catch (NumberFormatException e) {
            return Integer.MAX_VALUE;
        }
    }

    private double parseDoubleOrZero(String value) {
        try {
            return value == null || value.isBlank() ? 0d : Double.parseDouble(value.trim());
        } catch (NumberFormatException e) {
            return 0d;
        }
    }

    // ---------- aramgg（第三方 API，需要 Key；未配置时前端应降级到 101 数据） ----------

    /** aramgg 数据状态：是否配置 Key、数据版本、矩阵已落盘数量、剩余额度。 */
    @GetMapping("/aramgg/status")
    public ApiResponse<AramggDataService.Status> aramggStatus() {
        return ApiResponse.success(aramggDataService.status());
    }

    /**
     * 刷新 aramgg 数据（仅本机可调用）。
     *
     * @param matrix 是否同时抓取全部英雄的强化矩阵（约 1 credit/英雄，全量 173）
     * @param championIds 只抓指定英雄（逗号分隔），用于小批量试跑
     */
    @PostMapping("/aramgg/refresh")
    public ApiResponse<AramggDataService.Status> aramggRefresh(
            @RequestParam(defaultValue = "false") boolean matrix,
            @RequestParam(required = false) String championIds,
            jakarta.servlet.http.HttpServletRequest request) {
        if (!isLocalRequest(request)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "hextech refresh is only available from localhost");
        }
        try {
            aramggDataService.refreshMetadata();
            if (matrix) {
                aramggDataService.refreshMatrix(parseIds(championIds));
            }
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "aramgg 刷新失败: " + e.getMessage());
        }
        return ApiResponse.success(aramggDataService.status());
    }

    // ---------- 数据包分发（从项目自己的服务器下载，客户端不需要 aramgg Key） ----------

    /**
     * 数据包状态：下载状态 / 数据版本 / 更新时间 / 下次自动检查时间。
     *
     * <p>前端的「数据状态」块（圆环 + 数据版本 + 更新时间 + 检查更新）读这个接口。
     */
    @GetMapping("/data-package")
    public ApiResponse<AramggBundleService.Summary> dataPackageStatus() {
        return ApiResponse.success(aramggBundleService.summary());
    }

    /** 手动「检查更新」：无视下载 CD（仅本机可调用）。 */
    @PostMapping("/data-package/check")
    public ApiResponse<AramggBundleService.Summary> dataPackageCheck(
            jakarta.servlet.http.HttpServletRequest request) {
        if (!isLocalRequest(request)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "hextech data package check is only available from localhost");
        }
        return ApiResponse.success(aramggBundleService.check(true));
    }

    /** 单英雄的强化矩阵（含 aramgg 的 tier/rank/选取率/胜率）。 */
    @GetMapping("/aramgg/champion/{championId}")
    public ApiResponse<AramggChampionMatrix> aramggChampionMatrix(@PathVariable long championId) {
        return ApiResponse.success(aramggDataService.championMatrix(championId).orElse(null));
    }

    private java.util.List<Long> parseIds(String raw) {
        if (raw == null || raw.isBlank()) {
            return java.util.List.of();
        }
        java.util.List<Long> ids = new java.util.ArrayList<>();
        for (String part : raw.split(",")) {
            try {
                ids.add(Long.parseLong(part.trim()));
            } catch (NumberFormatException ignored) {
                // 忽略非法输入
            }
        }
        return ids;
    }

    /** 强制刷新（仅本机可调用）。 */
    @PostMapping("/refresh")
    public ApiResponse<HextechDataService.Status> refresh(jakarta.servlet.http.HttpServletRequest request) {
        if (!isLocalRequest(request)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "hextech refresh is only available from localhost");
        }
        try {
            dataService.refresh();
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "海斗数据刷新失败: " + e.getMessage());
        }
        return ApiResponse.success(dataService.status());
    }

    private boolean isLocalRequest(jakarta.servlet.http.HttpServletRequest request) {
        String remoteAddress = request.getRemoteAddr();
        if (remoteAddress == null || remoteAddress.isBlank()) {
            return false;
        }
        try {
            return InetAddress.getByName(remoteAddress).isLoopbackAddress();
        } catch (Exception ignored) {
            return "127.0.0.1".equals(remoteAddress) || "::1".equals(remoteAddress);
        }
    }
}
