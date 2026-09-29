package io.rankpeek.cost;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

@Repository
public class CostRepository {

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public CostRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public long insertEvent(
            String eventType,
            String provider,
            String model,
            String source,
            BigDecimal amountCny,
            String currency,
            long quantity,
            Object metadata
    ) {
        long now = System.currentTimeMillis();
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    INSERT INTO cost_events (
                        event_type,
                        provider,
                        model,
                        source,
                        amount_cny,
                        currency,
                        quantity,
                        metadata_raw_json,
                        created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, eventType);
            ps.setString(2, provider);
            ps.setString(3, model);
            ps.setString(4, source);
            ps.setBigDecimal(5, amountCny);
            ps.setString(6, currency);
            ps.setLong(7, quantity);
            ps.setString(8, writeJson(metadata));
            ps.setLong(9, now);
            return ps;
        }, keyHolder);
        Number key = keyHolder.getKey();
        return key == null ? 0L : key.longValue();
    }

    public List<CostEvent> listEvents(String eventType, int limit, int offset) {
        StringBuilder sql = new StringBuilder("SELECT * FROM cost_events WHERE 1 = 1");
        List<Object> args = new ArrayList<>();
        if (eventType != null && !eventType.isBlank()) {
            sql.append(" AND event_type = ?");
            args.add(eventType.trim());
        }
        sql.append(" ORDER BY created_at DESC LIMIT ? OFFSET ?");
        args.add(Math.max(1, Math.min(limit, 100)));
        args.add(Math.max(0, offset));
        return jdbcTemplate.query(sql.toString(), this::mapEvent, args.toArray());
    }

    public BigDecimal sumEventsBetween(long fromInclusive, long toInclusive, String eventType) {
        BigDecimal result = jdbcTemplate.queryForObject("""
                SELECT COALESCE(SUM(amount_cny), 0)
                FROM cost_events
                WHERE created_at >= ?
                  AND created_at <= ?
                  AND (? IS NULL OR event_type = ?)
                """, BigDecimal.class, fromInclusive, toInclusive, eventType, eventType);
        return result == null ? BigDecimal.ZERO : result;
    }

    public List<AiCostSourceAggregate> listAiAnalysisCostBySource() {
        return jdbcTemplate.query("""
                SELECT
                    source,
                    COUNT(*) AS event_count,
                    COALESCE(SUM(amount_cny), 0) AS total_cost_cny
                FROM cost_events
                WHERE event_type = 'ai_analysis'
                GROUP BY source
                """, (rs, rowNum) -> new AiCostSourceAggregate(
                rs.getString("source"),
                rs.getLong("event_count"),
                rs.getBigDecimal("total_cost_cny")
        ));
    }

    public CostRollup findCostRollup() {
        List<CostRollup> rows = jdbcTemplate.query("""
                SELECT *
                FROM cost_rollups
                WHERE id = 1
                """, this::mapRollup);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    public void upsertCostRollup(CostRollup rollup) {
        int updated = jdbcTemplate.update("""
                UPDATE cost_rollups
                SET current_month_key = ?,
                    current_month_total_cny = ?,
                    last_month_key = ?,
                    last_month_total_cny = ?,
                    today_key = ?,
                    today_total_cny = ?,
                    coach_count = ?,
                    coach_total_cny = ?,
                    pregame_count = ?,
                    pregame_total_cny = ?,
                    postgame_count = ?,
                    postgame_total_cny = ?,
                    updated_at = ?
                WHERE id = 1
                """,
                rollup.currentMonthKey(),
                rollup.currentMonthTotalCny(),
                rollup.lastMonthKey(),
                rollup.lastMonthTotalCny(),
                rollup.todayKey(),
                rollup.todayTotalCny(),
                rollup.coachCount(),
                rollup.coachTotalCny(),
                rollup.pregameCount(),
                rollup.pregameTotalCny(),
                rollup.postgameCount(),
                rollup.postgameTotalCny(),
                rollup.updatedAt()
        );
        if (updated > 0) {
            return;
        }

        jdbcTemplate.update("""
                INSERT INTO cost_rollups (
                    id,
                    current_month_key,
                    current_month_total_cny,
                    last_month_key,
                    last_month_total_cny,
                    today_key,
                    today_total_cny,
                    coach_count,
                    coach_total_cny,
                    pregame_count,
                    pregame_total_cny,
                    postgame_count,
                    postgame_total_cny,
                    updated_at
                ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                rollup.currentMonthKey(),
                rollup.currentMonthTotalCny(),
                rollup.lastMonthKey(),
                rollup.lastMonthTotalCny(),
                rollup.todayKey(),
                rollup.todayTotalCny(),
                rollup.coachCount(),
                rollup.coachTotalCny(),
                rollup.pregameCount(),
                rollup.pregameTotalCny(),
                rollup.postgameCount(),
                rollup.postgameTotalCny(),
                rollup.updatedAt()
        );
    }

    public void deleteAllEvents() {
        jdbcTemplate.update("DELETE FROM cost_events");
    }

    private CostEvent mapEvent(ResultSet rs, int rowNum) throws SQLException {
        return new CostEvent(
                rs.getLong("id"),
                rs.getString("event_type"),
                rs.getString("provider"),
                rs.getString("model"),
                rs.getString("source"),
                rs.getBigDecimal("amount_cny"),
                rs.getString("currency"),
                rs.getLong("quantity"),
                rs.getString("metadata_raw_json"),
                rs.getLong("created_at")
        );
    }

    private CostRollup mapRollup(ResultSet rs, int rowNum) throws SQLException {
        return new CostRollup(
                rs.getString("current_month_key"),
                nullToZero(rs.getBigDecimal("current_month_total_cny")),
                rs.getString("last_month_key"),
                nullToZero(rs.getBigDecimal("last_month_total_cny")),
                rs.getString("today_key"),
                nullToZero(rs.getBigDecimal("today_total_cny")),
                rs.getLong("coach_count"),
                nullToZero(rs.getBigDecimal("coach_total_cny")),
                rs.getLong("pregame_count"),
                nullToZero(rs.getBigDecimal("pregame_total_cny")),
                rs.getLong("postgame_count"),
                nullToZero(rs.getBigDecimal("postgame_total_cny")),
                rs.getLong("updated_at")
        );
    }

    private static BigDecimal nullToZero(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private String writeJson(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Cost metadata is not serializable", exception);
        }
    }
}
