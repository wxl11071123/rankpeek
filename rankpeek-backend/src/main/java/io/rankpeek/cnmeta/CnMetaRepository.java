package io.rankpeek.cnmeta;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public class CnMetaRepository {
    private final JdbcTemplate jdbcTemplate;

    private final RowMapper<CnChampionMeta> metaMapper = (rs, rowNum) -> new CnChampionMeta(
            rs.getString("source"),
            rs.getString("patch_key"),
            rs.getInt("queue_id"),
            rs.getString("tier_scope"),
            rs.getInt("champion_id"),
            rs.getString("role"),
            rs.getBigDecimal("win_rate"),
            rs.getBigDecimal("pick_rate"),
            rs.getBigDecimal("ban_rate"),
            rs.getBigDecimal("avg_kda"),
            rs.getBigDecimal("avg_gold"),
            rs.getBigDecimal("avg_damage"),
            rs.getBigDecimal("avg_damage_taken"),
            rs.getBigDecimal("avg_heal"),
            rs.getObject("avg_duration_seconds", Integer.class),
            rs.getBigDecimal("avg_kills"),
            rs.getBigDecimal("avg_assists"),
            rs.getBigDecimal("avg_damage_share"),
            rs.getBigDecimal("avg_damage_taken_share"),
            rs.getObject("rank_index", Integer.class),
            rs.getString("sample_note"),
            rs.getString("data_source_note")
    );

    public CnMetaRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void save(CnChampionMeta meta, Instant updatedAt) {
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
                meta.source(),
                meta.patchKey(),
                meta.queueId(),
                meta.tierScope(),
                meta.championId(),
                meta.role(),
                meta.winRate(),
                meta.pickRate(),
                meta.banRate(),
                meta.avgKda(),
                meta.avgGold(),
                meta.avgDamage(),
                meta.avgDamageTaken(),
                meta.avgHeal(),
                meta.avgDurationSeconds(),
                meta.avgKills(),
                meta.avgAssists(),
                meta.avgDamageShare(),
                meta.avgDamageTakenShare(),
                meta.rankIndex(),
                meta.sampleNote(),
                meta.dataSourceNote(),
                updatedAt.toEpochMilli()
        );
    }

    public List<CnChampionMeta> findLatestChampionMeta(Integer championId, String tierScope) {
        return jdbcTemplate.query(
                """
                        select *
                        from cn_champion_meta
                        where champion_id = ? and tier_scope = ?
                        order by updated_at desc, patch_key desc, id desc
                        limit 1
                        """,
                metaMapper,
                championId,
                tierScope
        );
    }

    public List<CnChampionMeta> findChampionMeta(Integer championId) {
        return jdbcTemplate.query(
                """
                        select *
                        from cn_champion_meta
                        where champion_id = ?
                        order by updated_at desc, tier_scope asc, id desc
                        """,
                metaMapper,
                championId
        );
    }

    public List<CnChampionMeta> findChampionMeta(String patchKey, Integer championId, String role, String tierScope) {
        List<CnChampionMeta> exact = findChampionMetaByRole(patchKey, championId, role, tierScope);
        if (!exact.isEmpty() || CnMetaRoles.ALL.equalsIgnoreCase(role)) {
            return exact;
        }
        return findChampionMetaByRole(patchKey, championId, CnMetaRoles.ALL, tierScope);
    }

    private List<CnChampionMeta> findChampionMetaByRole(
            String patchKey,
            Integer championId,
            String role,
            String tierScope
    ) {
        return jdbcTemplate.query(
                """
                        select *
                        from cn_champion_meta
                        where patch_key = ? and champion_id = ? and role = ? and tier_scope = ?
                        order by updated_at desc, id desc
                        """,
                metaMapper,
                patchKey,
                championId,
                role,
                tierScope
        );
    }
}
