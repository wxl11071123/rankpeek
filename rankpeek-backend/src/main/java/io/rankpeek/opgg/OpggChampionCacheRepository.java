package io.rankpeek.opgg;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

@Repository
public class OpggChampionCacheRepository {
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public OpggChampionCacheRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public Optional<OpggChampionList> findFresh(OpggChampionListQuery query, Instant now) {
        return findList(query, "and expires_at > ?", now.toEpochMilli());
    }

    public Optional<OpggChampionDetail> findFresh(OpggChampionDetailQuery query, Instant now) {
        return findDetail(query, "and expires_at > ?", now.toEpochMilli());
    }

    public Optional<OpggChampionList> findAny(OpggChampionListQuery query) {
        return findList(query, "", null);
    }

    public Optional<OpggChampionDetail> findAny(OpggChampionDetailQuery query) {
        return findDetail(query, "", null);
    }

    @Transactional
    public void save(
            OpggChampionListQuery query,
            OpggChampionList list,
            Instant fetchedAt,
            Instant expiresAt
    ) {
        String rawJson = writeList(list);
        int updated = jdbcTemplate.update(
                """
                        update opgg_champion_list_cache
                        set mode = ?, region = ?, tier = ?, raw_json = ?, fetched_at = ?, expires_at = ?
                        where cache_key = ?
                        """,
                query.mode(),
                query.region(),
                query.tier(),
                rawJson,
                fetchedAt.toEpochMilli(),
                expiresAt.toEpochMilli(),
                query.cacheKey()
        );
        if (updated > 0) {
            return;
        }
        try {
            jdbcTemplate.update(
                    """
                            insert into opgg_champion_list_cache (
                                cache_key, mode, region, tier, raw_json, fetched_at, expires_at
                            ) values (?, ?, ?, ?, ?, ?, ?)
                            """,
                    query.cacheKey(),
                    query.mode(),
                    query.region(),
                    query.tier(),
                    rawJson,
                    fetchedAt.toEpochMilli(),
                    expiresAt.toEpochMilli()
            );
        } catch (DuplicateKeyException exception) {
            save(query, list, fetchedAt, expiresAt);
        }
    }

    @Transactional
    public void save(
            OpggChampionDetailQuery query,
            OpggChampionDetail detail,
            Instant fetchedAt,
            Instant expiresAt
    ) {
        String rawJson = writeDetail(detail);
        int updated = jdbcTemplate.update(
                """
                        update opgg_champion_detail_cache
                        set champion_id = ?, mode = ?, region = ?, tier = ?, position = ?,
                            raw_json = ?, fetched_at = ?, expires_at = ?
                        where cache_key = ?
                        """,
                query.championId(),
                query.mode(),
                query.region(),
                query.tier(),
                query.position(),
                rawJson,
                fetchedAt.toEpochMilli(),
                expiresAt.toEpochMilli(),
                query.cacheKey()
        );
        if (updated > 0) {
            return;
        }
        try {
            jdbcTemplate.update(
                    """
                            insert into opgg_champion_detail_cache (
                                cache_key, champion_id, mode, region, tier, position,
                                raw_json, fetched_at, expires_at
                            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                    query.cacheKey(),
                    query.championId(),
                    query.mode(),
                    query.region(),
                    query.tier(),
                    query.position(),
                    rawJson,
                    fetchedAt.toEpochMilli(),
                    expiresAt.toEpochMilli()
            );
        } catch (DuplicateKeyException exception) {
            save(query, detail, fetchedAt, expiresAt);
        }
    }

    public int deleteExpiredBefore(Instant cutoff) {
        long cutoffMillis = cutoff.toEpochMilli();
        int deletedDetails = jdbcTemplate.update(
                "delete from opgg_champion_detail_cache where expires_at < ?",
                cutoffMillis
        );
        int deletedLists = jdbcTemplate.update(
                "delete from opgg_champion_list_cache where expires_at < ?",
                cutoffMillis
        );
        return deletedDetails + deletedLists;
    }

    private Optional<OpggChampionList> findList(
            OpggChampionListQuery query,
            String extraWhere,
            Long epochMillis
    ) {
        String sql = """
                select raw_json
                from opgg_champion_list_cache
                where cache_key = ?
                """ + extraWhere;
        Object[] args = epochMillis == null
                ? new Object[]{query.cacheKey()}
                : new Object[]{query.cacheKey(), epochMillis};
        return jdbcTemplate.query(
                sql,
                (rs, rowNum) -> readList(rs.getString("raw_json")),
                args
        ).stream().findFirst();
    }

    private Optional<OpggChampionDetail> findDetail(
            OpggChampionDetailQuery query,
            String extraWhere,
            Long epochMillis
    ) {
        String sql = """
                select raw_json
                from opgg_champion_detail_cache
                where cache_key = ?
                """ + extraWhere;
        Object[] args = epochMillis == null
                ? new Object[]{query.cacheKey()}
                : new Object[]{query.cacheKey(), epochMillis};
        return jdbcTemplate.query(
                sql,
                (rs, rowNum) -> readDetail(rs.getString("raw_json")),
                args
        ).stream().findFirst();
    }

    private OpggChampionDetail readDetail(String rawJson) {
        try {
            return objectMapper.readValue(rawJson, OpggChampionDetail.class);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Unable to read cached OP.GG champion detail", exception);
        }
    }

    private String writeDetail(OpggChampionDetail detail) {
        try {
            return objectMapper.writeValueAsString(detail);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Unable to write cached OP.GG champion detail", exception);
        }
    }

    private OpggChampionList readList(String rawJson) {
        try {
            return objectMapper.readValue(rawJson, OpggChampionList.class);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Unable to read cached OP.GG champion list", exception);
        }
    }

    private String writeList(OpggChampionList list) {
        try {
            return objectMapper.writeValueAsString(list);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Unable to write cached OP.GG champion list", exception);
        }
    }
}
