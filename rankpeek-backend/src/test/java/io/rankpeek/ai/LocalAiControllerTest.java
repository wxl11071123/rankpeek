package io.rankpeek.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import io.rankpeek.cache.LocalCacheSchemaInitializer;
import io.rankpeek.cost.AiCostCalculator;
import io.rankpeek.cost.CostRollup;
import io.rankpeek.cost.CostRepository;
import io.rankpeek.cost.CostService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class LocalAiControllerTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    private JdbcTemplate jdbcTemplate;
    private AiProviderSettingsService settingsService;
    private LocalAiRunRepository runRepository;
    private CostRepository costRepository;
    private MockMvc mockMvc;
    private HttpServer aiServer;
    private AtomicInteger aiRequestCount;
    private AtomicReference<JsonNode> aiRequestBody;

    @BeforeEach
    void setUp() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:rankpeek-local-ai-controller-" + System.nanoTime()
                        + ";MODE=PostgreSQL;DATABASE_TO_UPPER=false;DB_CLOSE_DELAY=-1",
                "sa",
                ""
        );
        jdbcTemplate = new JdbcTemplate(dataSource);
        new LocalCacheSchemaInitializer(jdbcTemplate).initializeSchema();
        AiProviderSettingsRepository settingsRepository = new AiProviderSettingsRepository(jdbcTemplate);
        settingsService = new AiProviderSettingsService(settingsRepository);
        runRepository = new LocalAiRunRepository(jdbcTemplate);
        costRepository = new CostRepository(jdbcTemplate, objectMapper);
        LocalAiAnalysisService service = new LocalAiAnalysisService(
                settingsService,
                runRepository,
                new LocalAiAnalysisStreamer(new OpenAiCompatibleChatClient(objectMapper), objectMapper),
                objectMapper,
                new CostService(costRepository, new AiCostCalculator())
        );
        mockMvc = MockMvcBuilders.standaloneSetup(new LocalAiController(service)).build();
    }

    @AfterEach
    void tearDown() {
        if (aiServer != null) {
            aiServer.stop(0);
        }
    }

    @Test
    void pregameStreamWithoutAuthorizationReturnsProviderConfigurationErrorWhenMissingSettings() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/v1/ai/pregame/stream")
                        .contentType(MediaType.APPLICATION_JSON)
                        .accept(MediaType.TEXT_EVENT_STREAM)
                        .content("""
                                {
                                  "mode": "teammate",
                                  "snapshotSchemaVersion": "gaming_ai_input_snapshot.v1",
                                  "snapshot": {}
                                }
                                """))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(result))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("event:error")))
                .andExpect(content().string(containsString("AI_PROVIDER_NOT_CONFIGURED")))
                .andExpect(content().string(not(containsString("Authorization"))));
    }

    @Test
    void successfulPregameStreamEmitsPlayerInsightUsageAndDoneWithoutAuthorization() throws Exception {
        configureSuccessfulProvider("""
                data: {"model":"deepseek-v4-flash","choices":[{"delta":{"content":"{\\\"playerKey\\\":\\\"name:W#1234:141\\\",\\\"label\\\":\\\"上等马\\\",\\\"tone\\\":\\\"carry\\\",\\\"text\\\":\\\"近期状态稳定，可以信任。\\\"}\\n"}}]}

                data: {"model":"deepseek-v4-flash","usage":{"prompt_tokens":10,"prompt_cache_hit_tokens":4,"prompt_cache_miss_tokens":6,"completion_tokens":3,"total_tokens":13},"choices":[{"delta":{}}]}

                data: [DONE]

                """);

        MvcResult result = mockMvc.perform(post("/api/v1/ai/pregame/stream")
                        .contentType(MediaType.APPLICATION_JSON)
                        .accept(MediaType.TEXT_EVENT_STREAM)
                        .content("""
                                {
                                  "mode": "teammate",
                                  "queueId": 420,
                                  "allyTeamTags": ["ally | W#1234 | champion=141"],
                                  "enemyTeamTags": [],
                                  "snapshotSchemaVersion": "gaming_ai_input_snapshot.v1",
                                  "snapshot": {
                                    "mode": "teammate",
                                    "selectedPlayers": [
                                      {"displayName": "W#1234", "championId": 141}
                                    ]
                                  }
                                }
                                """))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(result))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("event:start")))
                .andExpect(content().string(containsString("event:player_insight")))
                .andExpect(content().string(containsString("name:W#1234:141")))
                .andExpect(content().string(containsString("\"label\"")))
                .andExpect(content().string(not(containsString("event:delta"))))
                .andExpect(content().string(containsString("event:usage")))
                .andExpect(content().string(containsString("promptCacheHitTokens")))
                .andExpect(content().string(containsString("event:done")));

        assertThat(aiRequestCount.get()).isEqualTo(1);
        String messages = aiRequestBody.get().path("messages").toString();
        assertThat(messages).contains("player_insight_result.v1", "allowedPlayerKeys");
        assertThat(runRepository.list("pregame", "succeeded", 20, 0)).hasSize(1);
        assertThat(runRepository.list("pregame", "succeeded", 20, 0).getFirst().totalCny())
                .isPositive();
        assertThat(costRepository.listEvents("ai_analysis", 20, 0)).isEmpty();
        CostRollup rollup = costRepository.findCostRollup();
        assertThat(rollup).isNotNull();
        assertThat(rollup.pregameCount()).isEqualTo(1);
        assertThat(rollup.pregameTotalCny()).isPositive();
    }

    @Test
    void pregameStreamRepairsMojibakeAndNormalizesBarePuuidKeys() throws Exception {
        String mojibakeLabel = mojibake("上等马");
        String mojibakeText = mojibake("近期状态稳定，可以信任。");
        configureSuccessfulProvider("""
                data: {"model":"deepseek-v4-flash","choices":[{"delta":{"content":"{\\\"playerKey\\\":\\\"ally-puuid\\\",\\\"label\\\":\\\"%s\\\",\\\"tone\\\":\\\"carry\\\",\\\"text\\\":\\\"%s\\\"}\\n"}}]}

                data: [DONE]

                """.formatted(mojibakeLabel, mojibakeText));

        MvcResult result = mockMvc.perform(post("/api/v1/ai/pregame/stream")
                        .contentType(MediaType.APPLICATION_JSON)
                        .accept(MediaType.TEXT_EVENT_STREAM)
                        .content("""
                                {
                                  "mode": "teammate",
                                  "queueId": 420,
                                  "allyTeamTags": ["当前snapshot时间：2026-06-03T00:00:00.000Z。模式：单双排。阵营：我方。\\n\\n你 战绩状态：正常。"],
                                  "enemyTeamTags": [],
                                  "snapshotSchemaVersion": "gaming_ai_input_snapshot.v2",
                                  "snapshot": {
                                    "mode": "teammate",
                                    "teammateSnapshot": {
                                      "players": [
                                        {"key": "puuid:ally-puuid", "isSelf": true, "summaryLine": "你 战绩状态：正常。"}
                                      ]
                                    }
                                  }
                                }
                                """))
                .andExpect(request().asyncStarted())
                .andReturn();

        MvcResult streamResult = mockMvc.perform(asyncDispatch(result))
                .andExpect(status().isOk())
                .andReturn();
        String streamBody = streamResult.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(streamBody)
                .contains("event:player_insight", "puuid:ally-puuid", "上等马", "近期状态稳定，可以信任。")
                .doesNotContain(mojibakeLabel);

        LocalAiRun run = runRepository.list("pregame", "succeeded", 20, 0).getFirst();
        assertThat(run.responseRawJson()).contains("puuid:ally-puuid", "上等马", "近期状态稳定，可以信任。");
        assertThat(run.responseRawJson()).doesNotContain(mojibakeLabel);
    }

    @Test
    void postgameStreamDoesNotRequireAuthorization() throws Exception {
        configureSuccessfulProvider("""
                data: {"model":"deepseek-v4-flash","choices":[{"delta":{"content":"{\\\"schemaVersion\\\":\\\"postgame_review_result.v1\\\",\\\"levels\\\":[{\\\"label\\\":\\\"夯\\\",\\\"players\\\":[]}],\\\"summary\\\":\\\"客观总结\\\"}"}}]}

                data: {"model":"deepseek-v4-flash","usage":{"prompt_tokens":10,"prompt_cache_hit_tokens":4,"prompt_cache_miss_tokens":6,"completion_tokens":3,"total_tokens":13},"choices":[{"delta":{}}]}

                data: [DONE]

                """);

        MvcResult result = mockMvc.perform(post("/api/v1/ai/postgame/stream")
                        .contentType(MediaType.APPLICATION_JSON)
                        .accept(MediaType.TEXT_EVENT_STREAM)
                        .content("""
                                {
                                  "mode": "review",
                                  "snapshotSchemaVersion": "postgame_ai_input_snapshot.v1",
                                  "snapshot": {
                                    "mode": "review",
                                    "rawPrivateField": "SHOULD_NOT_BE_SENT",
                                    "analysisBrief": {
                                      "matchFacts": ["排位胜利 28 分钟"],
                                      "playerFacts": ["【你｜我方打野｜凯隐】KDA 7/2/9，排名：经济第一"]
                                    }
                                  }
                                }
                                """))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(result))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("event:start")))
                .andExpect(content().string(containsString("postgame_review_result.v1")))
                .andExpect(content().string(containsString("event:done")));

        JsonNode body = aiRequestBody.get();
        assertThat(body.path("response_format").path("type").asText()).isEqualTo("json_object");
        String messages = body.path("messages").toString();
        assertThat(messages).contains("postgame_review_result.v1", "夯", "顶级", "人上人", "NPC", "拉完了");
        assertThat(messages).contains("排位胜利 28 分钟", "【你｜我方打野｜凯隐】");
        assertThat(messages).doesNotContain("SHOULD_NOT_BE_SENT", "rawPrivateField");
    }

    @Test
    void postgamePraiseStreamRequestsPraiseJsonSchema() throws Exception {
        configureSuccessfulProvider("""
                data: {"model":"deepseek-v4-flash","choices":[{"delta":{"content":"{\\\"schemaVersion\\\":\\\"postgame_praise_result.v1\\\",\\\"headline\\\":\\\"凯隐就是节奏答案\\\",\\\"paragraphs\\\":[\\\"你这把凯隐打野把节奏扛住了。\\\"]}"}}]}

                data: [DONE]

                """);

        MvcResult result = mockMvc.perform(post("/api/v1/ai/postgame/stream")
                        .contentType(MediaType.APPLICATION_JSON)
                        .accept(MediaType.TEXT_EVENT_STREAM)
                        .content("""
                                {
                                  "mode": "praise",
                                  "snapshotSchemaVersion": "postgame_ai_input_snapshot.v1",
                                  "snapshot": {
                                    "analysisBrief": {
                                      "playerFacts": ["【你｜我方打野｜凯隐】胜利，高光：前期带起节奏"]
                                    }
                                  }
                                }
                                """))
                .andExpect(request().asyncStarted())
                .andReturn();

        mockMvc.perform(asyncDispatch(result))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("postgame_praise_result.v1")))
                .andExpect(content().string(containsString("event:done")));

        JsonNode body = aiRequestBody.get();
        assertThat(body.path("response_format").path("type").asText()).isEqualTo("json_object");
        String messages = body.path("messages").toString();
        assertThat(messages).contains("postgame_praise_result.v1", "赛后爽文嘴替", "只围绕当前用户");
        assertThat(messages).doesNotContain("postgame_review_result.v1");
    }

    @Test
    void coachSummaryDoesNotRequireAuthorizationAndReturnsReport() throws Exception {
        configureSuccessfulProvider("""
                data: {"model":"deepseek-v4-flash","choices":[{"delta":{"content":"{\\\"verdict\\\":{\\\"label\\\":\\\"B+\\\"}}"}}]}

                data: {"model":"deepseek-v4-flash","usage":{"prompt_tokens":10,"prompt_cache_hit_tokens":4,"prompt_cache_miss_tokens":6,"completion_tokens":3,"total_tokens":13},"choices":[{"delta":{}}]}

                data: [DONE]

                """);

        mockMvc.perform(post("/api/v1/ai/coach-summary")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "inputHash": "hash-1",
                                  "snapshotSchemaVersion": "coach_summary_input_snapshot.v1",
                                  "promptVersion": "coach_summary_prompt.v1",
                                  "dataQualityConfidence": "high",
                                  "systemPrompt": "Return JSON",
                                  "userPrompt": "Analyze"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.report.verdict.label").value("B+"))
                .andExpect(jsonPath("$.data.usage.promptTokens").value(10));
    }

    @Test
    void coachSummaryNormalizesWrappedSparseJsonReport() throws Exception {
        configureSuccessfulProvider("""
                data: {"model":"deepseek-v4-flash","choices":[{"delta":{"content":"{\\\"report\\\":{\\\"headline\\\":\\\"状态报告\\\",\\\"overview\\\":\\\"整体节奏稳定。\\\",\\\"verdict\\\":{\\\"label\\\":\\\"B+\\\"}}}"}}]}

                data: {"model":"deepseek-v4-flash","usage":{"prompt_tokens":10,"prompt_cache_hit_tokens":4,"prompt_cache_miss_tokens":6,"completion_tokens":3,"total_tokens":13},"choices":[{"delta":{}}]}

                data: [DONE]

                """);

        mockMvc.perform(post("/api/v1/ai/coach-summary")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "inputHash": "hash-1",
                                  "snapshotSchemaVersion": "coach_summary_input_snapshot.v1",
                                  "promptVersion": "coach_summary_prompt.v1",
                                  "dataQualityConfidence": "high",
                                  "systemPrompt": "Return JSON",
                                  "userPrompt": "Analyze"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.report.schemaVersion").value("coach_summary_report.v1"))
                .andExpect(jsonPath("$.data.report.analysisType").value("coach_summary"))
                .andExpect(jsonPath("$.data.report.inputHash").value("hash-1"))
                .andExpect(jsonPath("$.data.report.title").value("状态报告"))
                .andExpect(jsonPath("$.data.report.summary").value("整体节奏稳定。"))
                .andExpect(jsonPath("$.data.report.verdict.label").value("B+"))
                .andExpect(jsonPath("$.data.report.verdict.score").value(50))
                .andExpect(jsonPath("$.data.report.verdict.confidence").value("high"))
                .andExpect(jsonPath("$.data.report.metadata.modelName").value("deepseek-v4-flash"))
                .andExpect(jsonPath("$.data.report.metadata.promptVersion").value("coach_summary_prompt.v1"))
                .andExpect(jsonPath("$.data.report.metadata.snapshotSchemaVersion").value("coach_summary_input_snapshot.v1"))
                .andExpect(jsonPath("$.data.report.keyFindings.length()").value(0))
                .andExpect(jsonPath("$.data.report.trainingPlan.length()").value(0))
                .andExpect(jsonPath("$.data.report.championAdvice.length()").value(0))
                .andExpect(jsonPath("$.data.report.chartBlocks.length()").value(0))
                .andExpect(jsonPath("$.data.report.warnings.length()").value(0));
    }

    @Test
    void runsCanBeListedAndFetchedThroughController() throws Exception {
        long runId = runRepository.createStartedRun("pregame", "deepseek", "deepseek-v4-flash", "hash", "{}");
        runRepository.markFailed(runId, "TEST_ERROR", "failed for test");

        mockMvc.perform(get("/api/v1/ai/runs?status=failed"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].id").value(runId))
                .andExpect(jsonPath("$.data.items[0].status").value("failed"));

        mockMvc.perform(get("/api/v1/ai/runs/" + runId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(runId))
                .andExpect(jsonPath("$.data.errorCode").value("TEST_ERROR"));
    }

    private void configureSuccessfulProvider() throws Exception {
        configureSuccessfulProvider("""
                data: {"model":"deepseek-v4-flash","choices":[{"delta":{"content":"RankPeek local AI response"}}]}

                data: {"model":"deepseek-v4-flash","usage":{"prompt_tokens":10,"prompt_cache_hit_tokens":4,"prompt_cache_miss_tokens":6,"completion_tokens":3,"total_tokens":13},"choices":[{"delta":{}}]}

                data: [DONE]

                """);
    }

    private void configureSuccessfulProvider(String sseBody) throws Exception {
        aiRequestCount = new AtomicInteger();
        aiRequestBody = new AtomicReference<>();
        aiServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        aiServer.createContext("/chat/completions", exchange -> respondWithSse(exchange, sseBody));
        aiServer.start();
        settingsService.saveSettings(new AiProviderSettingsSaveRequest(
                true,
                "deepseek",
                "http://127.0.0.1:" + aiServer.getAddress().getPort(),
                "deepseek-v4-flash",
                "sk-test",
                null,
                true,
                false,
                false,
                new AiProviderPricing(
                        "CNY",
                        new BigDecimal("0.02"),
                        new BigDecimal("1"),
                        new BigDecimal("2")
                )
        ));
    }

    private String mojibake(String value) {
        return new String(value.getBytes(StandardCharsets.UTF_8), StandardCharsets.ISO_8859_1);
    }

    private void respondWithSse(HttpExchange exchange, String sseBody) throws IOException {
        aiRequestCount.incrementAndGet();
        JsonNode request = objectMapper.readTree(exchange.getRequestBody());
        aiRequestBody.set(request);
        assertThat(exchange.getRequestHeaders().getFirst("Authorization")).isEqualTo("Bearer sk-test");
        assertThat(request.path("stream").asBoolean()).isTrue();
        byte[] body = sseBody.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
        exchange.sendResponseHeaders(200, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }
}
