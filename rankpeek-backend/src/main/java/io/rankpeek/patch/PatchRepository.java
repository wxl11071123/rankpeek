package io.rankpeek.patch;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public class PatchRepository {
    private final JdbcTemplate jdbcTemplate;

    private final RowMapper<PatchVersion> patchMapper = (rs, rowNum) -> new PatchVersion(
            rs.getLong("id"),
            rs.getString("patch_key"),
            rs.getString("ddragon_version"),
            rs.getString("game_version"),
            rs.getString("release_date") == null ? null : LocalDate.parse(rs.getString("release_date")),
            rs.getString("source_status"),
            instantOrNull(rs.getObject("detected_at", Long.class)),
            instantOrNull(rs.getObject("published_at", Long.class)),
            rs.getString("checksum")
    );

    private final RowMapper<PatchChange> changeMapper = (rs, rowNum) -> new PatchChange(
            rs.getLong("id"),
            rs.getString("patch_key"),
            rs.getString("target_type"),
            rs.getString("target_key"),
            rs.getString("target_name"),
            rs.getString("change_type"),
            rs.getString("field"),
            rs.getString("before_value"),
            rs.getString("after_value"),
            rs.getString("summary_zh"),
            rs.getString("summary_en"),
            rs.getBigDecimal("confidence"),
            instantOrNull(rs.getObject("created_at", Long.class))
    );

    public PatchRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<PatchVersion> findCurrent() {
        return jdbcTemplate.query(
                """
                        select *
                        from patch_versions
                        order by published_at desc, detected_at desc, id desc
                        limit 1
                        """,
                patchMapper
        ).stream().findFirst();
    }

    public Optional<PatchVersion> findByPatchKey(String patchKey) {
        return jdbcTemplate.query("select * from patch_versions where patch_key = ?", patchMapper, patchKey)
                .stream()
                .findFirst();
    }

    public PatchVersion insertMockPatch(String patchKey) {
        long now = Instant.now().toEpochMilli();
        jdbcTemplate.update(
                """
                        insert into patch_versions (
                            patch_key, ddragon_version, game_version, release_date,
                            source_status, detected_at, published_at, checksum, updated_at
                        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                patchKey,
                patchKey + ".mock-ddragon",
                patchKey + ".mock-game",
                LocalDate.now().toString(),
                "MOCK",
                now,
                now,
                "mock-checksum-" + patchKey,
                now
        );
        PatchVersion patchVersion = findByPatchKey(patchKey).orElseThrow();
        ensureMockChange(patchVersion);
        return patchVersion;
    }

    public void ensureMockChange(PatchVersion patchVersion) {
        Integer count = jdbcTemplate.queryForObject(
                "select count(*) from patch_changes where patch_key = ? and target_type = 'CHAMPION' and target_key = '81'",
                Integer.class,
                patchVersion.patchKey()
        );
        if (count != null && count > 0) {
            return;
        }
        long now = Instant.now().toEpochMilli();
        jdbcTemplate.update(
                """
                        insert into patch_changes (
                            patch_version_id, patch_key, target_type, target_key, target_name, change_type,
                            field, before_value, after_value, summary_zh, summary_en,
                            confidence, created_at, updated_at
                        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                patchVersion.id(),
                patchVersion.patchKey(),
                "CHAMPION",
                "81",
                "Ezreal",
                "MOCK_BALANCE",
                "q_damage",
                "100",
                "105",
                "本地补丁示例：伊泽瑞尔 Q 伤害上调。",
                "Local patch example: Ezreal Q damage increased.",
                "0.9500",
                now,
                now
        );
    }

    public List<PatchChange> findChanges(String patchKey) {
        return jdbcTemplate.query(
                "select * from patch_changes where patch_key = ? order by id",
                changeMapper,
                patchKey
        );
    }

    public boolean hasChampionChange(String patchKey, Integer championId) {
        Integer count = jdbcTemplate.queryForObject(
                """
                        select count(*)
                        from patch_changes
                        where patch_key = ? and target_type = 'CHAMPION' and target_key = ?
                        """,
                Integer.class,
                patchKey,
                String.valueOf(championId)
        );
        return count != null && count > 0;
    }

    private static Instant instantOrNull(Long epochMillis) {
        return epochMillis == null ? null : Instant.ofEpochMilli(epochMillis);
    }
}
