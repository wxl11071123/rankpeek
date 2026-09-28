package io.rankpeek.ai;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import io.rankpeek.cost.AiCostBreakdown;

import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Repository
public class LocalAiRunRepository {

    private final JdbcTemplate jdbcTemplate;

    public LocalAiRunRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public long createStartedRun(
            String endpoint,
            String provider,
            String model,
            String requestHash,
            String requestRawJson
    ) {
        long now = System.currentTimeMillis();
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    INSERT INTO ai_analysis_runs (
                        endpoint,
                        provider,
                        model,
                        status,
                        request_hash,
                        request_raw_json,
                        created_at,
                        updated_at
                    ) VALUES (?, ?, ?, 'started', ?, ?, ?, ?)
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, endpoint);
            ps.setString(2, provider);
            ps.setString(3, model);
            ps.setString(4, requestHash);
            ps.setString(5, requestRawJson);
            ps.setLong(6, now);
            ps.setLong(7, now);
            return ps;
        }, keyHolder);
        Number key = keyHolder.getKey();
        if (key == null) {
            throw new IllegalStateException("Failed to create local AI run");
        }
        return key.longValue();
    }

    public void markSucceeded(long id, String responseRawJson, AiTokenUsage usage) {
        AiTokenUsage safeUsage = usage == null
                ? new AiTokenUsage("", "", 0, 0, 0, 0, 0)
                : usage;
        jdbcTemplate.update("""
                UPDATE ai_analysis_runs
                SET status = 'succeeded',
                    response_raw_json = ?,
                    provider = CASE WHEN ? = '' THEN provider ELSE ? END,
                    model = CASE WHEN ? = '' THEN model ELSE ? END,
                    error_code = NULL,
                    error_message = NULL,
                    prompt_tokens = ?,
                    prompt_cache_hit_tokens = ?,
                    prompt_cache_miss_tokens = ?,
                    completion_tokens = ?,
                    total_tokens = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                responseRawJson,
                safeUsage.provider(),
                safeUsage.provider(),
                safeUsage.model(),
                safeUsage.model(),
                safeUsage.promptTokens(),
                safeUsage.promptCacheHitTokens(),
                safeUsage.promptCacheMissTokens(),
                safeUsage.completionTokens(),
                safeUsage.totalTokens(),
                System.currentTimeMillis(),
                id);
    }

    public void markFailed(long id, String errorCode, String errorMessage) {
        jdbcTemplate.update("""
                UPDATE ai_analysis_runs
                SET status = 'failed',
                    error_code = ?,
                    error_message = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                errorCode,
                errorMessage,
                System.currentTimeMillis(),
                id);
    }

    public void updateCost(long id, AiCostBreakdown cost) {
        if (cost == null || cost.totalCny() == null) {
            return;
        }
        jdbcTemplate.update("""
                UPDATE ai_analysis_runs
                SET input_cache_hit_cny = ?,
                    input_cache_miss_cny = ?,
                    output_cny = ?,
                    total_cny = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                zeroIfNull(cost.inputCacheHitCny()),
                zeroIfNull(cost.inputCacheMissCny()),
                zeroIfNull(cost.outputCny()),
                cost.totalCny(),
                System.currentTimeMillis(),
                id);
    }

    public Optional<LocalAiRun> findById(long id) {
        return jdbcTemplate.query("""
                SELECT *
                FROM ai_analysis_runs
                WHERE id = ?
                """, this::mapRun, id).stream().findFirst();
    }

    public List<LocalAiRun> list(String endpoint, String status, int limit, int offset) {
        StringBuilder sql = new StringBuilder("SELECT * FROM ai_analysis_runs WHERE 1 = 1");
        List<Object> args = new ArrayList<>();
        if (endpoint != null && !endpoint.isBlank()) {
            sql.append(" AND endpoint = ?");
            args.add(endpoint.trim());
        }
        if (status != null && !status.isBlank()) {
            sql.append(" AND status = ?");
            args.add(status.trim());
        }
        sql.append(" ORDER BY created_at DESC LIMIT ? OFFSET ?");
        args.add(Math.max(1, Math.min(limit, 100)));
        args.add(Math.max(0, offset));
        return jdbcTemplate.query(sql.toString(), this::mapRun, args.toArray());
    }

    private LocalAiRun mapRun(ResultSet rs, int rowNum) throws SQLException {
        return new LocalAiRun(
                rs.getLong("id"),
                rs.getString("endpoint"),
                rs.getString("provider"),
                rs.getString("model"),
                rs.getString("status"),
                rs.getString("request_hash"),
                rs.getString("request_raw_json"),
                rs.getString("response_raw_json"),
                rs.getString("error_code"),
                rs.getString("error_message"),
                rs.getLong("prompt_tokens"),
                rs.getLong("prompt_cache_hit_tokens"),
                rs.getLong("prompt_cache_miss_tokens"),
                rs.getLong("completion_tokens"),
                rs.getLong("total_tokens"),
                readBigDecimal(rs, "input_cache_hit_cny"),
                readBigDecimal(rs, "input_cache_miss_cny"),
                readBigDecimal(rs, "output_cny"),
                readBigDecimal(rs, "total_cny"),
                rs.getLong("created_at"),
                rs.getLong("updated_at")
        );
    }

    private BigDecimal readBigDecimal(ResultSet rs, String columnName) throws SQLException {
        BigDecimal value = rs.getBigDecimal(columnName);
        return value == null ? BigDecimal.ZERO : value;
    }

    private BigDecimal zeroIfNull(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}
