package io.rankpeek.ai;

import io.rankpeek.cache.LocalCacheSchemaInitializer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class LocalAiRunRepositoryTest {

    private JdbcTemplate jdbcTemplate;
    private LocalAiRunRepository repository;

    @BeforeEach
    void setUp() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:rankpeek-ai-runs-" + System.nanoTime()
                        + ";MODE=PostgreSQL;DATABASE_TO_UPPER=false;DB_CLOSE_DELAY=-1",
                "sa",
                ""
        );
        jdbcTemplate = new JdbcTemplate(dataSource);
        new LocalCacheSchemaInitializer(jdbcTemplate).initializeSchema();
        repository = new LocalAiRunRepository(jdbcTemplate);
    }

    @Test
    void initializeSchema_createsAiAnalysisRunsTable() {
        List<String> columns = jdbcTemplate.queryForList("""
                SELECT COLUMN_NAME
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'ai_analysis_runs'
                """, String.class);

        assertThat(columns).contains(
                "id",
                "endpoint",
                "provider",
                "model",
                "status",
                "request_hash",
                "request_raw_json",
                "response_raw_json",
                "error_code",
                "error_message",
                "prompt_tokens",
                "prompt_cache_hit_tokens",
                "prompt_cache_miss_tokens",
                "completion_tokens",
                "total_tokens",
                "created_at",
                "updated_at"
        );
    }

    @Test
    void createStartedThenMarkSucceededPersistsUsageAndCanBeListed() {
        long runId = repository.createStartedRun(
                "pregame",
                "deepseek",
                "deepseek-v4-flash",
                "hash-1",
                "{\"mode\":\"teammate\"}"
        );

        repository.markSucceeded(
                runId,
                "{\"text\":\"ok\"}",
                new AiTokenUsage("deepseek", "deepseek-v4-flash", 10, 3, 13, 4, 6)
        );

        LocalAiRun run = repository.findById(runId).orElseThrow();
        assertThat(run.status()).isEqualTo("succeeded");
        assertThat(run.promptTokens()).isEqualTo(10);
        assertThat(run.promptCacheHitTokens()).isEqualTo(4);
        assertThat(run.promptCacheMissTokens()).isEqualTo(6);
        assertThat(run.completionTokens()).isEqualTo(3);
        assertThat(run.totalTokens()).isEqualTo(13);
        assertThat(run.responseRawJson()).contains("ok");

        assertThat(repository.list("pregame", "succeeded", 20, 0))
                .extracting(LocalAiRun::id)
                .containsExactly(runId);
    }

    @Test
    void markFailedPersistsErrorCodeAndMessage() {
        long runId = repository.createStartedRun(
                "postgame",
                "deepseek",
                "deepseek-v4-flash",
                "hash-2",
                "{}"
        );

        repository.markFailed(runId, "AI_PROVIDER_NOT_CONFIGURED", "Please configure AI provider");

        LocalAiRun run = repository.findById(runId).orElseThrow();
        assertThat(run.status()).isEqualTo("failed");
        assertThat(run.errorCode()).isEqualTo("AI_PROVIDER_NOT_CONFIGURED");
        assertThat(run.errorMessage()).contains("configure");
        assertThat(repository.list(null, "failed", 20, 0))
                .extracting(LocalAiRun::id)
                .containsExactly(runId);
    }
}
