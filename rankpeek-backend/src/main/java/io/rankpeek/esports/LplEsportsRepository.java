package io.rankpeek.esports;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public class LplEsportsRepository {
    private final JdbcTemplate jdbcTemplate;

    private final RowMapper<LplChampionUsage> usageMapper = (rs, rowNum) -> new LplChampionUsage(
            rs.getString("source"),
            rs.getString("patch_key"),
            rs.getInt("champion_id"),
            rs.getString("role"),
            rs.getString("tournament"),
            rs.getString("split"),
            rs.getString("team"),
            rs.getString("player_name"),
            rs.getInt("kills"),
            rs.getInt("deaths"),
            rs.getInt("assists")
    );

    public LplEsportsRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public LplChampionUsage saveMockUsage(String patchKey, Integer championId, String role) {
        List<LplChampionUsage> existing = findChampionUsage(patchKey, championId, role);
        if (!existing.isEmpty()) {
            return existing.getFirst();
        }
        jdbcTemplate.update(
                """
                        insert into lpl_champion_usage (
                            source, patch_key, champion_id, role, tournament, split,
                            team, player_name, kills, deaths, assists, updated_at
                        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                "mock-lpl",
                patchKey,
                championId,
                role,
                "LPL",
                "LOCAL",
                "MOCK_BLUE",
                "MockPlayer",
                5,
                1,
                7,
                Instant.now().toEpochMilli()
        );
        return findChampionUsage(patchKey, championId, role).getFirst();
    }

    public List<LplChampionUsage> findChampionUsage(String patchKey, Integer championId, String role) {
        return jdbcTemplate.query(
                """
                        select *
                        from lpl_champion_usage
                        where patch_key = ? and champion_id = ? and role = ?
                        order by updated_at desc, id desc
                        """,
                usageMapper,
                patchKey,
                championId,
                role
        );
    }
}
