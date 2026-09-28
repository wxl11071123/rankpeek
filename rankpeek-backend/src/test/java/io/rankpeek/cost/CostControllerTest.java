package io.rankpeek.cost;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.rankpeek.ai.AiTokenUsage;
import io.rankpeek.cache.LocalCacheSchemaInitializer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CostControllerTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    private CostService service;
    private CostRepository repository;
    private JdbcTemplate jdbcTemplate;
    private MutableClock clock;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:rankpeek-cost-" + System.nanoTime()
                        + ";MODE=PostgreSQL;DATABASE_TO_UPPER=false;DB_CLOSE_DELAY=-1",
                "sa",
                ""
        );
        jdbcTemplate = new JdbcTemplate(dataSource);
        new LocalCacheSchemaInitializer(jdbcTemplate).initializeSchema();
        repository = new CostRepository(jdbcTemplate, objectMapper);
        clock = new MutableClock(Instant.parse("2026-06-01T10:00:00Z"), ZoneId.of("UTC"));
        service = new CostService(repository, new AiCostCalculator(), clock);
        mockMvc = MockMvcBuilders.standaloneSetup(new CostController(service)).build();
    }

    @Test
    void recordsAiAnalysisCostInRollingAggregateWithoutRawEvents() throws Exception {
        AiCostBreakdown cost = service.recordAiAnalysis(
                10L,
                "pregame",
                new AiTokenUsage("deepseek", "deepseek-v4-flash", 300, 300, 600, 100, 200),
                AiPricingCatalog.forModel("deepseek", "deepseek-v4-flash").orElseThrow()
        );

        assertThat(cost.totalCny()).isEqualByComparingTo("0.000802");
        assertThat(repository.listEvents("ai_analysis", 20, 0)).isEmpty();
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM cost_events", Long.class)).isZero();
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM cost_rollups", Long.class)).isEqualTo(1L);

        mockMvc.perform(get("/api/v1/costs/summary?from=2026-06-01&to=2026-06-01"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalCostCny").value(0.000802));
        mockMvc.perform(get("/api/v1/costs/ai-usage-summary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[1].key").value("pregame"))
                .andExpect(jsonPath("$.data.items[1].count").value(1))
                .andExpect(jsonPath("$.data.items[1].totalCostCny").value(0.000802));
    }

    @Test
    void summaryOnlyReturnsAiTotalCostAndManualEndpointsAreGone() throws Exception {
        service.recordAiAnalysis(
                12L,
                "postgame",
                new AiTokenUsage("deepseek", "deepseek-v4-flash", 300, 300, 600, 100, 200),
                AiPricingCatalog.forModel("deepseek", "deepseek-v4-flash").orElseThrow()
        );

        mockMvc.perform(get("/api/v1/costs/summary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalCostCny").value(0.000802))
                .andExpect(jsonPath("$.data.aiCostCny").doesNotExist())
                .andExpect(jsonPath("$.data.manualCostCny").doesNotExist());

        mockMvc.perform(get("/api/v1/costs/manual"))
                .andExpect(status().isNotFound());
    }

    @Test
    void eventsEndpointNoLongerExposesRawCostRows() throws Exception {
        service.recordAiAnalysis(
                11L,
                "postgame",
                new AiTokenUsage("deepseek", "deepseek-v4-pro", 300, 300, 600, 100, 200),
                AiPricingCatalog.forModel("deepseek", "deepseek-v4-pro").orElseThrow()
        );

        mockMvc.perform(get("/api/v1/costs/events?type=ai_analysis"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(0));
    }

    @Test
    void monthlyCostRollupMovesCurrentMonthIntoPreviousMonthAndResetsToday() throws Exception {
        clock.setInstant(Instant.parse("2026-05-31T12:00:00Z"));
        service.recordAiAnalysis(
                30L,
                "coach-summary",
                new AiTokenUsage("deepseek", "deepseek-v4-flash", 300, 300, 600, 100, 200),
                AiPricingCatalog.forModel("deepseek", "deepseek-v4-flash").orElseThrow()
        );

        clock.setInstant(Instant.parse("2026-06-01T01:00:00Z"));

        mockMvc.perform(get("/api/v1/costs/summary?from=2026-05-01&to=2026-05-31"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalCostCny").value(0.000802));
        mockMvc.perform(get("/api/v1/costs/summary?from=2026-06-01&to=2026-06-01"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalCostCny").value(0));

        service.recordAiAnalysis(
                31L,
                "postgame-review",
                new AiTokenUsage("deepseek", "deepseek-v4-flash", 300, 300, 600, 100, 200),
                AiPricingCatalog.forModel("deepseek", "deepseek-v4-flash").orElseThrow()
        );

        mockMvc.perform(get("/api/v1/costs/summary?from=2026-06-01&to=2026-06-01"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalCostCny").value(0.000802));
        mockMvc.perform(get("/api/v1/costs/ai-usage-summary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].count").value(1))
                .andExpect(jsonPath("$.data.items[2].count").value(1));
    }

    @Test
    void aiUsageSummaryReturnsThreeLocalAnalysisBuckets() throws Exception {
        service.recordAiAnalysis(
                21L,
                "coach-summary",
                new AiTokenUsage("deepseek", "deepseek-v4-flash", 300, 300, 600, 100, 200),
                AiPricingCatalog.forModel("deepseek", "deepseek-v4-flash").orElseThrow()
        );
        service.recordAiAnalysis(
                22L,
                "pregame",
                new AiTokenUsage("deepseek", "deepseek-v4-flash", 100, 200, 300, 50, 50),
                AiPricingCatalog.forModel("deepseek", "deepseek-v4-flash").orElseThrow()
        );
        service.recordAiAnalysis(
                23L,
                "postgame-review",
                new AiTokenUsage("deepseek", "deepseek-v4-pro", 300, 300, 600, 100, 200),
                AiPricingCatalog.forModel("deepseek", "deepseek-v4-pro").orElseThrow()
        );
        service.recordAiAnalysis(
                24L,
                "postgame",
                new AiTokenUsage("deepseek", "deepseek-v4-flash", 300, 300, 600, 100, 200),
                AiPricingCatalog.forModel("deepseek", "deepseek-v4-flash").orElseThrow()
        );

        mockMvc.perform(get("/api/v1/costs/ai-usage-summary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(3))
                .andExpect(jsonPath("$.data.items[0].key").value("coach"))
                .andExpect(jsonPath("$.data.items[0].count").value(1))
                .andExpect(jsonPath("$.data.items[0].totalCostCny").value(0.000802))
                .andExpect(jsonPath("$.data.items[1].key").value("pregame"))
                .andExpect(jsonPath("$.data.items[1].count").value(1))
                .andExpect(jsonPath("$.data.items[2].key").value("postgame"))
                .andExpect(jsonPath("$.data.items[2].count").value(2));
    }

    private static final class MutableClock extends Clock {
        private Instant instant;
        private final ZoneId zoneId;

        private MutableClock(Instant instant, ZoneId zoneId) {
            this.instant = instant;
            this.zoneId = zoneId;
        }

        void setInstant(Instant instant) {
            this.instant = instant;
        }

        @Override
        public ZoneId getZone() {
            return zoneId;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return new MutableClock(instant, zone);
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
