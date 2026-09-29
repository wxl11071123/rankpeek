package io.rankpeek.opgg;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.rankpeek.cache.LocalCacheSchemaInitializer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class OpggChampionCacheRepositoryTest {

    private OpggChampionCacheRepository repository;

    @BeforeEach
    void setUp() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:rankpeek-opgg-" + System.nanoTime()
                        + ";MODE=PostgreSQL;DATABASE_TO_UPPER=false;DB_CLOSE_DELAY=-1",
                "sa",
                ""
        );
        JdbcTemplate jdbcTemplate = new JdbcTemplate(dataSource);
        new LocalCacheSchemaInitializer(jdbcTemplate).initializeSchema();
        repository = new OpggChampionCacheRepository(jdbcTemplate, new ObjectMapper().findAndRegisterModules());
    }

    @Test
    void cacheMissReturnsEmpty() {
        Instant now = Instant.parse("2026-05-31T08:00:00Z");

        assertThat(repository.findFresh(new OpggChampionListQuery("ranked", "kr", "emerald_plus"), now))
                .isEmpty();
        assertThat(repository.findFresh(new OpggChampionDetailQuery(103, "ranked", "kr", "emerald_plus", "mid"), now))
                .isEmpty();
    }

    @Test
    void savingChampionListCanBeReadByModeRegionAndTier() {
        OpggChampionListQuery query = new OpggChampionListQuery("ranked", "kr", "emerald_plus");
        Instant fetchedAt = Instant.parse("2026-05-31T08:00:00Z");
        Instant expiresAt = Instant.parse("2026-05-31T08:30:00Z");

        repository.save(query, championList(query, "16.10", 7), fetchedAt, expiresAt);

        assertThat(repository.findFresh(query, fetchedAt.plusSeconds(60)))
                .hasValueSatisfying(list -> {
                    assertThat(list.version()).isEqualTo("16.10");
                    assertThat(list.items()).singleElement()
                            .satisfies(item -> assertThat(item.rank()).isEqualTo(7));
                });
    }

    @Test
    void savingChampionDetailCanBeReadByChampionModeRegionTierAndPosition() {
        OpggChampionDetailQuery query = new OpggChampionDetailQuery(103, "ranked", "kr", "emerald_plus", "mid");
        Instant fetchedAt = Instant.parse("2026-05-31T08:00:00Z");
        Instant expiresAt = Instant.parse("2026-05-31T08:30:00Z");

        repository.save(query, detail(query, "16.10", 0.51), fetchedAt, expiresAt);

        assertThat(repository.findFresh(query, fetchedAt.plusSeconds(60)))
                .hasValueSatisfying(detail -> {
                    assertThat(detail.championId()).isEqualTo(103);
                    assertThat(detail.position()).isEqualTo("mid");
                    assertThat(detail.stats().winRate()).isEqualTo(0.51);
                    assertThat(detail.coreItems()).singleElement()
                            .satisfies(item -> assertThat(item.ids()).containsExactly(3118, 3152, 4645));
                });
    }

    @Test
    void expiredCacheIsIgnoredByFreshLookupsButRemainsAvailableForStaleFallback() {
        OpggChampionListQuery listQuery = new OpggChampionListQuery("ranked", "kr", "emerald_plus");
        OpggChampionDetailQuery detailQuery = new OpggChampionDetailQuery(103, "ranked", "kr", "emerald_plus", "mid");
        Instant fetchedAt = Instant.parse("2026-05-31T08:00:00Z");
        Instant expiresAt = Instant.parse("2026-05-31T08:30:00Z");
        Instant afterExpiry = expiresAt.plusSeconds(1);

        repository.save(listQuery, championList(listQuery, "16.10", 7), fetchedAt, expiresAt);
        repository.save(detailQuery, detail(detailQuery, "16.10", 0.51), fetchedAt, expiresAt);

        assertThat(repository.findFresh(listQuery, afterExpiry)).isEmpty();
        assertThat(repository.findFresh(detailQuery, afterExpiry)).isEmpty();
        assertThat(repository.findAny(listQuery)).isPresent();
        assertThat(repository.findAny(detailQuery)).isPresent();
    }

    private static OpggChampionDetail detail(OpggChampionDetailQuery query, String version, double winRate) {
        return new OpggChampionDetail(
                query.championId(),
                "Ahri",
                query.mode(),
                query.region(),
                query.tier(),
                query.position(),
                version,
                Instant.parse("2026-05-31T08:00:00Z"),
                new OpggChampionStats(1000, winRate, 0.12, 0.03, 2.6),
                List.of(new OpggBuildOption("spells", List.of(4, 12), List.of(), 100L, 0.52, 0.6)),
                List.of(),
                List.of(new OpggBuildOption("skills", List.of(1, 2, 3), List.of(1, 2, 3), 90L, 0.53, 0.5)),
                List.of(),
                List.of(),
                List.of(new OpggBuildOption("core", List.of(3118, 3152, 4645), List.of(), 70L, 0.54, 0.19)),
                List.of(new OpggBuildOption("last", List.of(3089), List.of(), 30L, 0.63, 0.12)),
                List.of()
        );
    }

    private static OpggChampionList championList(OpggChampionListQuery query, String version, int rank) {
        return new OpggChampionList(
                query.mode(),
                query.region(),
                query.tier(),
                version,
                Instant.parse("2026-05-31T08:00:00Z"),
                List.of(new OpggChampionListItem(
                        103,
                        1,
                        rank,
                        new OpggChampionStats(0, 0.51, 0.12, 0.03, 2.6),
                        List.of(new OpggChampionPositionStats(
                                "mid",
                                0,
                                2,
                                new OpggChampionStats(0, 0.50, 0.10, 0.03, 2.5),
                                List.of(new OpggChampionCounter(238, 1200, 590L))
                        ))
                ))
        );
    }
}
