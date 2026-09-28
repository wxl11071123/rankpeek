package io.rankpeek.cnmeta.sync;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public class CnMetaSyncRepository {
    private final JdbcTemplate jdbcTemplate;

    private final RowMapper<CnMetaSyncJob> jobMapper = (rs, rowNum) -> new CnMetaSyncJob(
            rs.getLong("id"),
            rs.getString("source"),
            rs.getString("patch_key"),
            rs.getInt("queue_id"),
            rs.getString("tier_scope"),
            rs.getString("role"),
            rs.getString("status"),
            instantOrNull(rs.getObject("started_at", Long.class)),
            instantOrNull(rs.getObject("finished_at", Long.class)),
            rs.getString("error_message"),
            rs.getObject("request_count", Integer.class),
            rs.getObject("row_count", Integer.class),
            rs.getString("content_hash"),
            instantOrNull(rs.getObject("updated_at", Long.class))
    );

    public CnMetaSyncRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public CnMetaSyncJob createJob(String source, String patchKey, Integer queueId, String tierScope, String role, Instant startedAt) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    """
                            insert into cn_meta_sync_jobs (
                                source, patch_key, queue_id, tier_scope, role, status,
                                started_at, request_count, row_count, updated_at
                            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                    Statement.RETURN_GENERATED_KEYS
            );
            statement.setString(1, source);
            statement.setString(2, patchKey);
            statement.setInt(3, queueId);
            statement.setString(4, tierScope);
            statement.setString(5, role);
            statement.setString(6, "RUNNING");
            statement.setLong(7, startedAt.toEpochMilli());
            statement.setInt(8, 0);
            statement.setInt(9, 0);
            statement.setLong(10, startedAt.toEpochMilli());
            return statement;
        }, keyHolder);
        return findJobById(requireKey(keyHolder)).orElseThrow();
    }

    public void insertChampionStats(
            String source,
            String patchKey,
            Integer queueId,
            String tierScope,
            String role,
            List<CnMetaChampionStatRow> rows,
            Instant updatedAt
    ) {
        for (CnMetaChampionStatRow row : rows) {
            jdbcTemplate.update(
                    """
                            insert into cn_champion_meta (
                                source, patch_key, queue_id, tier_scope, champion_id, role,
                                win_rate, pick_rate, ban_rate, avg_kda, avg_gold,
                                avg_damage, avg_damage_taken, avg_heal, avg_duration_seconds,
                                avg_kills, avg_assists, avg_damage_share, avg_damage_taken_share,
                                rank_index, sample_note, data_source_note, updated_at
                            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                    source,
                    patchKey,
                    queueId,
                    row.tierScope() == null ? tierScope : row.tierScope(),
                    row.championId(),
                    row.role() == null ? role : row.role(),
                    row.winRate(),
                    row.pickRate(),
                    row.banRate(),
                    row.avgKda(),
                    row.avgGold(),
                    row.avgDamage(),
                    row.avgDamageTaken(),
                    row.avgHeal(),
                    row.avgDurationSeconds(),
                    row.avgKills(),
                    row.avgAssists(),
                    row.avgDamageShare(),
                    row.avgDamageTakenShare(),
                    row.rankIndex(),
                    row.sampleNote(),
                    row.dataSourceNote(),
                    updatedAt.toEpochMilli()
            );
        }
    }

    public CnMetaSyncJob updateJobFinished(
            Long jobId,
            String status,
            Integer requestCount,
            Integer rowCount,
            String contentHash,
            String errorMessage,
            Instant finishedAt
    ) {
        jdbcTemplate.update(
                """
                        update cn_meta_sync_jobs
                        set status = ?, request_count = ?, row_count = ?, content_hash = ?,
                            error_message = ?, finished_at = ?, updated_at = ?
                        where id = ?
                        """,
                status,
                requestCount,
                rowCount,
                contentHash,
                errorMessage,
                finishedAt.toEpochMilli(),
                finishedAt.toEpochMilli(),
                jobId
        );
        return findJobById(jobId).orElseThrow();
    }

    public List<CnMetaSyncJob> findRecentJobs(int limit) {
        int safeLimit = Math.max(1, Math.min(limit, 100));
        return jdbcTemplate.query(
                """
                        select *
                        from cn_meta_sync_jobs
                        order by started_at desc, id desc
                        limit %d
                        """.formatted(safeLimit),
                jobMapper
        );
    }

    public Optional<CnMetaSyncJob> findJobById(Long id) {
        return jdbcTemplate.query("select * from cn_meta_sync_jobs where id = ?", jobMapper, id)
                .stream()
                .findFirst();
    }

    private static Long requireKey(KeyHolder keyHolder) {
        Number key = keyHolder.getKey();
        if (key == null) {
            throw new IllegalStateException("CN meta sync job id was not generated");
        }
        return key.longValue();
    }

    private static Instant instantOrNull(Long epochMillis) {
        return epochMillis == null ? null : Instant.ofEpochMilli(epochMillis);
    }
}
