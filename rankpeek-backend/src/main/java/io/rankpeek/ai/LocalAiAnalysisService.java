package io.rankpeek.ai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.rankpeek.cost.AiCostBreakdown;
import io.rankpeek.cost.AiPricing;
import io.rankpeek.cost.CostService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

@Service
public class LocalAiAnalysisService {

    private static final long STREAM_TIMEOUT_MS = 120_000L;

    private final AiProviderSettingsService settingsService;
    private final LocalAiRunRepository runRepository;
    private final LocalAiAnalysisStreamer streamer;
    private final ObjectMapper objectMapper;
    private final CostService costService;
    private final LocalAiPromptContextService promptContextService;

    private enum StreamOutputMode {
        TEXT,
        JSON_OBJECT,
        PREGAME_INSIGHTS
    }

    LocalAiAnalysisService(
            AiProviderSettingsService settingsService,
            LocalAiRunRepository runRepository,
            LocalAiAnalysisStreamer streamer,
            ObjectMapper objectMapper
    ) {
        this(settingsService, runRepository, streamer, objectMapper, null);
    }

    public LocalAiAnalysisService(
            AiProviderSettingsService settingsService,
            LocalAiRunRepository runRepository,
            LocalAiAnalysisStreamer streamer,
            ObjectMapper objectMapper,
            CostService costService
    ) {
        this(settingsService, runRepository, streamer, objectMapper, costService, null);
    }

    @Autowired
    public LocalAiAnalysisService(
            AiProviderSettingsService settingsService,
            LocalAiRunRepository runRepository,
            LocalAiAnalysisStreamer streamer,
            ObjectMapper objectMapper,
            CostService costService,
            LocalAiPromptContextService promptContextService
    ) {
        this.settingsService = settingsService;
        this.runRepository = runRepository;
        this.streamer = streamer;
        this.objectMapper = objectMapper;
        this.costService = costService;
        this.promptContextService = promptContextService;
    }

    public SseEmitter streamPregame(PregameAnalysisRequest request) {
        return stream("pregame", request, buildPregameMessages(request), "Pregame analysis", StreamOutputMode.PREGAME_INSIGHTS);
    }

    public SseEmitter streamPostgame(PostgameAnalysisRequest request) {
        return stream("postgame", request, buildPostgameMessages(request), "Postgame analysis", StreamOutputMode.JSON_OBJECT);
    }

    public CoachSummaryAnalysisResponse generateCoachSummary(CoachSummaryAnalysisRequest request) {
        StoredAiProviderSettings settings = settingsService.requireRunnableSettings();
        String requestRawJson = writeJson(request);
        long runId = runRepository.createStartedRun(
                "coach-summary",
                settings.providerId(),
                settings.model(),
                sha256(requestRawJson),
                requestRawJson
        );
        try {
            LocalAiAnalysisStreamer.StreamResult result = streamer.streamJson(
                    settings,
                    List.of(
                            new OpenAiChatMessage("system", blankToDefault(request.systemPrompt(), "Return JSON.")),
                            new OpenAiChatMessage("user", blankToDefault(request.userPrompt(), "Analyze this RankPeek snapshot."))
                    )
            );
            Map<String, Object> report = normalizeCoachSummaryReport(result.text(), request, result.usage(), settings);
            runRepository.markSucceeded(runId, writeJson(report), result.usage());
            recordCostIfAvailable(runId, "coach-summary", settings, result.usage());
            return new CoachSummaryAnalysisResponse(report, result.usage());
        } catch (Exception exception) {
            runRepository.markFailed(runId, errorCode(exception), exception.getMessage());
            throw exception;
        }
    }

    public LocalAiRunListResponse listRuns(String endpoint, String status, int limit, int offset) {
        return new LocalAiRunListResponse(runRepository.list(endpoint, status, limit, offset).stream()
                .map(LocalAiRunResponse::from)
                .toList());
    }

    public LocalAiRunResponse getRun(long runId) {
        return runRepository.findById(runId)
                .map(LocalAiRunResponse::from)
                .orElseThrow(() -> new IllegalArgumentException("Local AI run not found: " + runId));
    }

    private SseEmitter stream(
            String endpoint,
            Object request,
            List<OpenAiChatMessage> messages,
            String sectionTitle,
            StreamOutputMode outputMode
    ) {
        SseEmitter emitter = new SseEmitter(STREAM_TIMEOUT_MS);
        CompletableFuture.runAsync(() -> runStream(endpoint, request, messages, sectionTitle, outputMode, emitter));
        return emitter;
    }

    private void runStream(
            String endpoint,
            Object request,
            List<OpenAiChatMessage> messages,
            String sectionTitle,
            StreamOutputMode outputMode,
            SseEmitter emitter
    ) {
        Long runId = null;
        try {
            StoredAiProviderSettings settings = settingsService.requireRunnableSettings();
            String requestRawJson = writeJson(request);
            runId = runRepository.createStartedRun(
                    endpoint,
                    settings.providerId(),
                    settings.model(),
                    sha256(requestRawJson),
                    requestRawJson
            );
            LocalAiAnalysisStreamer.StreamResult result = switch (outputMode) {
                case JSON_OBJECT -> streamer.streamJsonToEmitter(emitter, settings, messages, sectionTitle);
                case PREGAME_INSIGHTS -> streamer.streamPregameInsightsToEmitter(
                        emitter,
                        settings,
                        messages,
                        sectionTitle,
                        request instanceof PregameAnalysisRequest pregameRequest
                                ? readSelectedPlayerKeys(pregameRequest)
                                : Set.of()
                );
                case TEXT -> streamer.streamToEmitter(emitter, settings, messages, sectionTitle);
            };
            runRepository.markSucceeded(runId, result.text(), result.usage());
            recordCostIfAvailable(runId, endpoint, settings, result.usage());
            emitter.complete();
        } catch (LocalAiConfigurationException exception) {
            if (runId != null) {
                runRepository.markFailed(runId, LocalAiConfigurationException.CODE, exception.getMessage());
            }
            streamer.sendError(emitter, LocalAiConfigurationException.CODE, exception.getMessage());
            emitter.complete();
        } catch (Exception exception) {
            if (runId != null) {
                runRepository.markFailed(runId, errorCode(exception), exception.getMessage());
            }
            streamer.sendError(emitter, errorCode(exception), exception.getMessage());
            emitter.complete();
        }
    }

    private void recordCostIfAvailable(
            long runId,
            String endpoint,
            StoredAiProviderSettings settings,
            AiTokenUsage usage
    ) {
        if (costService == null || usage == null) {
            return;
        }
        try {
            AiCostBreakdown cost = costService.recordAiAnalysis(runId, endpoint, usage, pricingForSettings(settings));
            runRepository.updateCost(runId, cost);
        } catch (Exception ignored) {
            // Cost tracking should never make an otherwise successful local AI response fail.
        }
    }

    private List<OpenAiChatMessage> buildPregameMessages(PregameAnalysisRequest request) {
        String mode = nullToEmpty(request.mode());
        String snapshotText = appendLocalContext(
                formatPregameSnapshotText(request),
                promptContextService == null ? null : promptContextService.pregameContext(request)
        );
        return List.of(
                new OpenAiChatMessage(
                        "system",
                        """
                                你是 RankPeek 的英雄联盟赛前分析助手。只根据用户提供的 snapshot 分析，不准编造外部战绩。
                                你必须输出 player_insight_result.v1 的 NDJSON：每一行都是一个完整 JSON 对象，不要 Markdown、不要代码块、不要总评、不要额外解释。
                                每个对象字段固定为 playerKey、label、tone、text。tone 只能是 carry、stable、risk、weak、unknown。
                                """
                ),
                new OpenAiChatMessage(
                        "user",
                        """
                                请做赛前结构化分析。
                                schema: player_insight_result.v1
                                mode: %s
                                snapshotSchemaVersion: %s
                                allowedPlayerKeys:
                                %s
                                共同输出规则：
                                - 只输出 NDJSON，每行一个 JSON 对象。
                                - 必须为 allowedPlayerKeys 里的每个 playerKey 输出一行，不能输出其他 playerKey。
                                - label 必须使用当前模式允许的固定标签，不准自创。
                                - text 必须是 1 到 2 句话，不能有小标题、列表、编号或换行。
                                - text 不要出现召唤师名、用户ID、playerKey、puuid、#tag 或其他身份信息，只使用“你/我方N/敌方N”这类匿名称呼。
                                %s
                                snapshotText:
                                %s
                                """.formatted(
                                mode,
                                nullToEmpty(request.snapshotSchemaVersion()),
                                formatLines(readSelectedPlayerKeys(request).stream().toList()),
                                buildPregameModeRules(mode),
                                snapshotText
                        )
                )
        );
    }

    private List<OpenAiChatMessage> buildPostgameMessages(PostgameAnalysisRequest request) {
        String mode = "praise".equalsIgnoreCase(nullToEmpty(request.mode())) ? "praise" : "review";
        String task = "praise".equals(mode)
                ? """
                        请只输出 JSON，不要 Markdown、代码块或额外解释。JSON schemaVersion 固定为 postgame_praise_result.v1。
                        输出结构：
                        {
                          "schemaVersion": "postgame_praise_result.v1",
                          "headline": "AI 自拟一句赛后爽文标题",
                          "paragraphs": [
                            "第一段正文",
                            "第二段正文，可省略"
                          ]
                        }
                        核心定位：夸夸机是赛后爽文嘴替，不是教练、不是分析师、不是熟人聊天。像赛后弹幕精选 + 嘴替短文，可以夸张、护短、有情绪，但每一句夸都必须能被 snapshot 中的事实支撑。
                        目标：
                        - 只围绕当前用户，也就是 playerFacts 中带有【你｜...】的玩家进行分析。
                        - 必须结合【你】的英雄、位置、胜负；数据只挑最能撑起情绪的关键事实，不要写成数据报告，不要机械罗列 KDA、伤害、参团率。
                        - 优先围绕【你】所选英雄和位置来解释这局为什么爽、为什么不该背锅、为什么有价值。
                        - 输出中文，语气要像爽文嘴替，不像 AI 助手、客服、教练报告、战术复盘或普通聊天。
                        - 标题和正文都要有情绪、有画面感，但不能编造不存在的数据。
                        - 可以点名队友或对手的英雄和位置，用来描述局势或帮用户说话；不要暴露召唤师名，不要把某个玩家钉成战犯，也不要辱骂。
                        - 不能把百分比自动写成全队最高、第一、MVP、最强、唯一支柱等排名结论，除非 playerFacts、teamFacts、timelineFacts 或 snapshot 明确给出排名。
                        - 例如只有伤害占比 19%、经济转化 20% 这类百分比时，只能说“有输出/经济贡献”，不能说“全队最高”或“队内第一”。
                        - 优先引用 playerFacts 里的“排名：”和“高光：”事实；如果出现“个人镀层”，可以按个人镀层贡献描述，不要写成全队镀层。
                        情绪方向：
                        - 赢局：大力吹，强调用户是胜利核心、节奏发动机、关键输出/承伤/牵制点；可以写“这把你就是主角”，但必须用 snapshot 事实撑住。
                        - 输局：强力护短，强调“你已经把能做的打满了”，把失败写成局势、阵容、节奏、资源交换多因素结果；可以替用户挡锅，但不能辱骂或攻击队友。
                        - 数据好看时直接把最亮的 2 到 4 个事实写成爽点；数据不好看时，从英雄职责、承伤、牵制、开团、视野、资源让渡、装备/符文思路里找合理贡献。
                        - 不要频繁使用“兄弟”“哥们”“牛逼”“赢麻了”等生硬网感词；偶尔可以有劲，但不要像在装熟。
                        输出规则：
                        - headline 像一句赛后爽文标题，短、有劲、贴英雄和胜负。
                        - headline 不要使用固定模板“这把真不能全怪你”；赢局不要用“不背锅”“不能怪你”类标题，必须按英雄、位置、胜负和表现自拟。
                        - paragraphs 必须是 1 到 2 段正文，正文最多两段；不设硬性字数，内容多少跟着这局事实走，事实够多就大胆展开，事实少就短一点；不要为了凑字灌水，也不要因为怕长只写成几句。
                        - 不能有小标题、列表、编号、项目符号；paragraphs 里的每一项只能是自然正文。
                        - 不要写“总结来说”“从数据看”“首先/其次/最后”。
                        - 必须提到【你】的英雄和位置。
                        - 不要输出教学建议，不要给下局任务，不要制造压力。
                        - 不要出现召唤师名。
                        - 如果数据不足，就明确说“这局数据不完整，但从已有信息看...”。
                        """
                : """
                        请只输出 JSON，不要 Markdown、代码块或额外解释。JSON schemaVersion 固定为 postgame_review_result.v1。
                        输出结构：
                        {
                          "schemaVersion": "postgame_review_result.v1",
                          "levels": [
                            {"label": "夯", "players": [{"playerRef": "你｜我方打野｜凯隐", "championName": "凯隐", "phrase": "短语说明"}]},
                            {"label": "顶级", "players": []},
                            {"label": "人上人", "players": []},
                            {"label": "NPC", "players": []},
                            {"label": "拉完了", "players": []}
                          ],
                          "summary": "一段根据对局内容写出的客观总结。"
                        }
                        规则：
                        - levels 必须且只能包含五档：夯、顶级、人上人、NPC、拉完了。
                        - 必须覆盖 playerFacts 里的全部 10 个玩家，每个玩家只能出现一次。
                        - playerRef 直接使用 playerFacts 中【】内的标识，不要编造召唤师名。
                        - championName 使用 playerRef 里的英雄名。
                        - phrase 是每个玩家的一句短语说明，尽量客观，避免脏话。
                        - summary 放在前端生成的图片里，写一段客观复盘总结，不要重复列流水账。
                        - 可以引用 playerFacts 里的“排名：”“高光：”“个人镀层”事实；没有明确排名标签时，不要自行推断“全队最高、第一、MVP”。
                        """;
        return List.of(
                new OpenAiChatMessage(
                        "system",
                        buildPostgameSystemPrompt(mode)
                ),
                new OpenAiChatMessage(
                        "user",
                        """
                                %s
                                mode: %s
                                snapshotSchemaVersion: %s
                                snapshotText:
                                %s
                                """.formatted(
                                task,
                                mode,
                                nullToEmpty(request.snapshotSchemaVersion()),
                                formatPostgameSnapshotText(request.snapshot())
                        )
                )
        );
    }

    private static String buildPregameModeRules(String mode) {
        if ("opponent".equalsIgnoreCase(mode)) {
            return """
                    对手模式规则：
                    - 只分析敌方阵营，不评价我方。
                    - label 只能从：代中代、小代、npc、突破口、？？？。
                    - tone 必须按 label 映射：代中代 -> carry，小代 -> risk，npc -> stable，突破口 -> weak，？？？ -> unknown。
                    - 每个敌方玩家只做状态总结：根据位置、近期状态、tag 和关键数据概括威胁程度或可突破程度。
                    - 不给用户操作建议，不写前期注意点、针对方案、gank/入侵/控资源建议。
                    - 查不到战绩、读取失败、隐藏战绩或样本不足时优先使用“？？？”和 unknown，只总结为信息有限。
                    """;
        }

        return """
                队友模式规则：
                - 只分析我方阵营，不评价敌方玩家。
                - label 只能从：上等马、中等马、下等马、？？？马。
                - tone 必须按 label 映射：上等马 -> carry，中等马 -> stable，下等马 -> risk，？？？马 -> unknown。
                - 非用户队友只做状态总结：根据位置、近期状态、tag 和关键数据概括这个人的可靠程度或风险，不给操作建议、不写配合/规避方案。
                - 用户本人写状态总结 + 一句轻量本局思路提醒；提醒只基于用户当前位置和队友整体状态，不要展开成教学或路线清单。
                - 查不到战绩、读取失败、隐藏战绩或样本不足时优先使用“？？？马”和 unknown，只总结为信息有限，不给操作建议。
                """;
    }

    private static String formatPregameSnapshotText(PregameAnalysisRequest request) {
        boolean opponentMode = "opponent".equalsIgnoreCase(nullToEmpty(request.mode()));
        List<String> primary = opponentMode ? request.enemyTeamTags() : request.allyTeamTags();
        List<String> fallback = opponentMode ? request.allyTeamTags() : request.enemyTeamTags();
        return formatLines(primary == null || primary.isEmpty() ? fallback : primary);
    }

    private static String buildPostgameSystemPrompt(String mode) {
        String schema = "praise".equals(mode) ? "postgame_praise_result.v1" : "postgame_review_result.v1";
        return """
                你是 RankPeek 的英雄联盟赛后复盘助手。只根据用户提供的 postgame snapshot 分析，不臆造不存在的数据。
                必须输出可被 JSON.parse 解析的 %s。
                RP指数是 RankPeek 根据 timeline 计算的单局表现曲线，范围 0-10，5.0 为中性，计算依据包括经济、等级、CS、击杀参与、死亡、关键资源和视野；当前 postgame snapshot 只提供每名玩家的终局 RP，不提供完整曲线或采样序列。
                """.formatted(schema);
    }

    private static String formatPostgameSnapshotText(Map<String, Object> snapshot) {
        if (snapshot == null) {
            return "数据不足：postgame snapshot 缺失。";
        }
        Object rawBrief = snapshot.get("analysisBrief");
        if (!(rawBrief instanceof Map<?, ?> brief)) {
            return "数据不足：analysisBrief 缺失。";
        }

        List<String> sections = new ArrayList<>();
        appendSnapshotTextSection(sections, "对局信息", readStringList(brief, "matchFacts"));
        appendSnapshotTextSection(sections, "队伍信息", readStringList(brief, "teamFacts"));
        appendSnapshotTextSection(sections, "玩家信息", readStringList(brief, "playerFacts"));
        appendSnapshotTextSection(sections, "时间轴与 RP", readStringList(brief, "timelineFacts"));
        appendSnapshotTextSection(sections, "数据质量", readStringList(brief, "dataQualityFacts"));
        return sections.isEmpty() ? "数据不足：analysisBrief 没有可读事实。" : String.join("\n", sections);
    }

    private static void appendSnapshotTextSection(List<String> sections, String title, List<String> facts) {
        if (facts.isEmpty()) {
            return;
        }
        StringBuilder builder = new StringBuilder(title).append("：");
        for (String fact : facts) {
            builder.append("\n- ").append(fact);
        }
        sections.add(builder.toString());
    }

    private static List<String> readStringList(Map<?, ?> source, String key) {
        Object rawValue = source.get(key);
        if (!(rawValue instanceof List<?> values)) {
            return List.of();
        }
        return values.stream()
                .filter(String.class::isInstance)
                .map(String.class::cast)
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .toList();
    }

    private static Set<String> readSelectedPlayerKeys(PregameAnalysisRequest request) {
        Set<String> playerKeys = new LinkedHashSet<>();
        List<Map<String, Object>> players = readSelectedSnapshotPlayers(request);
        for (int index = 0; index < players.size(); index += 1) {
            String key = readPlayerKey(players.get(index), index);
            if (!key.isBlank()) {
                playerKeys.add(key);
            }
        }
        return playerKeys;
    }

    private static List<Map<String, Object>> readSelectedSnapshotPlayers(PregameAnalysisRequest request) {
        Map<String, Object> snapshot = request.snapshot() == null ? Map.of() : request.snapshot();
        if (snapshot.isEmpty()) {
            return List.of();
        }

        List<Map<String, Object>> selectedPlayers = toPlayerMaps(snapshot.get("selectedPlayers"));
        if (!selectedPlayers.isEmpty()) {
            return selectedPlayers;
        }

        String mode = nullToEmpty(request.mode()).toLowerCase();
        if ("opponent".equals(mode)) {
            List<Map<String, Object>> opponentSnapshotPlayers = readTeamSnapshotPlayers(snapshot, "opponentSnapshot");
            if (!opponentSnapshotPlayers.isEmpty()) {
                return opponentSnapshotPlayers;
            }
            return toPlayerMaps(snapshot.get("enemyTeam"));
        }

        List<Map<String, Object>> teammateSnapshotPlayers = readTeamSnapshotPlayers(snapshot, "teammateSnapshot");
        if (!teammateSnapshotPlayers.isEmpty()) {
            return teammateSnapshotPlayers;
        }
        return toPlayerMaps(snapshot.get("allyTeam"));
    }

    private static List<Map<String, Object>> readTeamSnapshotPlayers(Map<String, Object> snapshot, String key) {
        Object value = snapshot.get(key);
        if (!(value instanceof Map<?, ?> map)) {
            return List.of();
        }
        return toPlayerMaps(map.get("players"));
    }

    private static List<Map<String, Object>> toPlayerMaps(Object value) {
        if (!(value instanceof List<?> list)) {
            return List.of();
        }

        List<Map<String, Object>> players = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> map) {
                Map<String, Object> player = new LinkedHashMap<>();
                for (Map.Entry<?, ?> entry : map.entrySet()) {
                    if (entry.getKey() instanceof String key) {
                        player.put(key, entry.getValue());
                    }
                }
                players.add(player);
            }
        }
        return players;
    }

    private static String readPlayerKey(Map<String, Object> player, int index) {
        String key = readString(player.get("key"));
        if (!key.isBlank()) {
            return key;
        }

        String puuid = readString(player.get("puuid"));
        if (!puuid.isBlank()) {
            return "puuid:" + puuid;
        }

        String displayName = readString(player.get("displayName"));
        if (!displayName.isBlank()) {
            return "name:" + displayName + ":" + readChampionKeyPart(player.get("championId"));
        }

        return "player:" + index;
    }

    private static String readChampionKeyPart(Object value) {
        if (value instanceof Number number) {
            return String.valueOf(number.intValue());
        }
        String text = readString(value);
        return text.isBlank() ? "unknown" : text;
    }

    private static String readString(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private static String formatLines(List<String> values) {
        if (values == null || values.isEmpty()) {
            return "- none";
        }
        return values.stream()
                .map(value -> "- " + nullToEmpty(value))
                .reduce((left, right) -> left + "\n" + right)
                .orElse("- none");
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Local AI request is not serializable", exception);
        }
    }

    private Map<String, Object> parseJsonObject(String text) {
        try {
            return objectMapper.readValue(text, new TypeReference<>() {
            });
        } catch (JsonProcessingException exception) {
            throw new AiProviderException("Local AI JSON response is invalid", exception);
        }
    }

    private Map<String, Object> normalizeCoachSummaryReport(
            String rawContent,
            CoachSummaryAnalysisRequest request,
            AiTokenUsage usage,
            StoredAiProviderSettings settings
    ) {
        String json = extractJsonObject(rawContent);
        ObjectNode root;
        try {
            JsonNode node = objectMapper.readTree(json);
            node = unwrapCoachSummaryEnvelope(node);
            if (!node.isObject()) {
                throw new AiProviderException("Local AI coach summary report is not a JSON object");
            }
            root = (ObjectNode) node;
        } catch (JsonProcessingException exception) {
            throw new AiProviderException("Local AI coach summary report is not valid JSON", exception);
        }

        root.put("schemaVersion", "coach_summary_report.v1");
        root.put("analysisType", "coach_summary");
        root.put("inputHash", requireNonBlank(request.inputHash(), "Coach summary inputHash is empty"));
        normalizeCoachSummaryTextFields(root);

        ObjectNode metadata = readOrCreateObject(root, "metadata");
        metadata.put("modelName", usage == null ? settings.model() : usage.model());
        metadata.put("promptVersion", blankToDefault(request.promptVersion(), "coach_summary_prompt.v1"));
        metadata.put("generatedAt", Instant.now().toString());
        metadata.put("snapshotSchemaVersion", blankToDefault(request.snapshotSchemaVersion(), "coach_summary_input_snapshot.v1"));
        metadata.put("dataQualityConfidence", normalizeConfidence(request.dataQualityConfidence()));

        requireTextField(root, "title");
        requireTextField(root, "summary");
        normalizeCoachSummaryVerdict(root, request);
        if (!root.path("verdict").isObject()) {
            throw new AiProviderException("Local AI coach summary report missing verdict");
        }
        ensureArrayField(root, "keyFindings");
        ensureArrayField(root, "trainingPlan");
        ensureArrayField(root, "championAdvice");
        ensureArrayField(root, "chartBlocks");
        ensureArrayField(root, "warnings");

        return objectMapper.convertValue(root, new TypeReference<>() {
        });
    }

    private static JsonNode unwrapCoachSummaryEnvelope(JsonNode node) {
        if (!node.isObject() || hasCoachSummaryShape(node)) {
            return node;
        }
        for (String fieldName : List.of("report", "result", "data")) {
            JsonNode child = node.path(fieldName);
            if (child.isObject() && hasCoachSummaryShape(child)) {
                return child;
            }
        }
        return node;
    }

    private static boolean hasCoachSummaryShape(JsonNode node) {
        return !readFirstText(node, "title", "headline", "reportTitle", "summary").isBlank()
                || node.path("verdict").isObject();
    }

    private static void normalizeCoachSummaryTextFields(ObjectNode root) {
        putTextIfMissing(root, "title",
                readFirstText(root, "headline", "reportTitle", "name", "topic"));
        if (isBlank(readText(root, "title"))) {
            JsonNode verdict = root.path("verdict");
            putTextIfMissing(root, "title", readFirstText(verdict, "label", "title"));
        }
        putTextIfMissing(root, "summary",
                readFirstText(root, "overview", "abstract", "finalSummary"));
        if (isBlank(readText(root, "summary"))) {
            JsonNode verdict = root.path("verdict");
            putTextIfMissing(root, "summary", readFirstText(verdict, "summary", "label"));
        }
    }

    private static void normalizeCoachSummaryVerdict(ObjectNode root, CoachSummaryAnalysisRequest request) {
        ObjectNode verdict = readOrCreateObject(root, "verdict");
        putTextIfMissing(verdict, "label", readText(root, "title"));
        if (!verdict.path("score").canConvertToInt()) {
            verdict.put("score", 50);
        }
        String confidence = normalizeConfidence(readText(verdict, "confidence"));
        if (confidence.equals("medium") && isBlank(readText(verdict, "confidence"))) {
            confidence = normalizeConfidence(request.dataQualityConfidence());
        }
        verdict.put("confidence", confidence);
        putTextIfMissing(verdict, "summary", readText(root, "summary"));
    }

    private static void putTextIfMissing(ObjectNode root, String fieldName, String value) {
        if (!isBlank(readText(root, fieldName)) || isBlank(value)) {
            return;
        }
        root.put(fieldName, value.trim());
    }

    private static String readFirstText(JsonNode node, String... fieldNames) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return "";
        }
        for (String fieldName : fieldNames) {
            String value = readText(node, fieldName);
            if (!value.isBlank()) {
                return value;
            }
        }
        return "";
    }

    private static ObjectNode readOrCreateObject(ObjectNode root, String fieldName) {
        JsonNode existing = root.get(fieldName);
        if (existing instanceof ObjectNode objectNode) {
            return objectNode;
        }
        return root.putObject(fieldName);
    }

    private static void ensureArrayField(ObjectNode root, String fieldName) {
        if (!root.path(fieldName).isArray()) {
            root.putArray(fieldName);
        }
    }

    private static void requireTextField(ObjectNode root, String fieldName) {
        if (!root.path(fieldName).isTextual() || root.path(fieldName).asText().isBlank()) {
            throw new AiProviderException("Local AI coach summary report missing " + fieldName);
        }
    }

    private static String extractJsonObject(String rawContent) {
        String trimmed = nullToEmpty(rawContent);
        if (trimmed.isBlank()) {
            throw new AiProviderException("Local AI coach summary report is empty");
        }

        if (trimmed.startsWith("```")) {
            int firstLineEnd = trimmed.indexOf('\n');
            int lastFence = trimmed.lastIndexOf("```");
            if (firstLineEnd >= 0 && lastFence > firstLineEnd) {
                trimmed = trimmed.substring(firstLineEnd + 1, lastFence).trim();
            }
        }

        int start = trimmed.indexOf('{');
        int end = trimmed.lastIndexOf('}');
        if (start < 0 || end <= start) {
            throw new AiProviderException("Local AI coach summary report does not contain JSON");
        }
        return trimmed.substring(start, end + 1);
    }

    private static String readText(JsonNode node, String fieldName) {
        JsonNode field = node.path(fieldName);
        return field.isTextual() ? field.asText().trim() : "";
    }

    private static String normalizeConfidence(String value) {
        return switch (nullToEmpty(value).toLowerCase()) {
            case "high", "medium", "low" -> nullToEmpty(value).toLowerCase();
            default -> "medium";
        };
    }

    private static String requireNonBlank(String value, String message) {
        if (isBlank(value)) {
            throw new AiProviderException(message);
        }
        return value.trim();
    }

    private AiPricing pricingForSettings(StoredAiProviderSettings settings) {
        if (settings.pricingRawJson() != null && !settings.pricingRawJson().isBlank()) {
            try {
                AiProviderPricing pricing = objectMapper.readValue(settings.pricingRawJson(), AiProviderPricing.class);
                return new AiPricing(
                        settings.providerId(),
                        settings.model(),
                        blankToDefault(pricing.currency(), "CNY"),
                        nonNegative(pricing.inputCacheHitCnyPerMillionTokens()),
                        nonNegative(pricing.inputCacheMissCnyPerMillionTokens()),
                        nonNegative(pricing.outputCnyPerMillionTokens())
                );
            } catch (JsonProcessingException ignored) {
                return null;
            }
        }
        return null;
    }

    private BigDecimal nonNegative(BigDecimal value) {
        if (value == null || value.compareTo(BigDecimal.ZERO) < 0) {
            return null;
        }
        return value;
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available", exception);
        }
    }

    private String errorCode(Exception exception) {
        if (exception instanceof LocalAiConfigurationException) {
            return LocalAiConfigurationException.CODE;
        }
        return exception instanceof AiProviderException ? "AI_PROVIDER_ERROR" : "LOCAL_AI_ERROR";
    }

    private static String blankToDefault(String value, String defaultValue) {
        return isBlank(value) ? defaultValue : value.trim();
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private String appendLocalContext(String prompt, String localContext) {
        if (localContext == null || localContext.isBlank()) {
            return prompt;
        }
        return prompt + "\n\n" + localContext;
    }
}
