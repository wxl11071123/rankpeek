package io.rankpeek.cnmeta;

import io.rankpeek.cache.LocalCacheSchemaInitializer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.math.BigDecimal;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class CnMetaRepositoryTest {

    private CnMetaRepository repository;

    @BeforeEach
    void setUp() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:rankpeek-cnmeta-" + System.nanoTime()
                        + ";MODE=PostgreSQL;DATABASE_TO_UPPER=false;DB_CLOSE_DELAY=-1",
                "sa",
                ""
        );
        JdbcTemplate jdbcTemplate = new JdbcTemplate(dataSource);
        new LocalCacheSchemaInitializer(jdbcTemplate).initializeSchema();
        repository = new CnMetaRepository(jdbcTemplate);
    }

    @Test
    void latestChampionMetaReturnsNewestPatchForChampionAndTier() {
        repository.save(meta("26.09", "PLATINUM_PLUS", 81, "ADC", "0.5100"), Instant.parse("2026-05-01T00:00:00Z"));
        repository.save(meta("26.10", "PLATINUM_PLUS", 81, "ADC", "0.5300"), Instant.parse("2026-05-10T00:00:00Z"));
        repository.save(meta("26.11", "GOLD", 81, "ADC", "0.4900"), Instant.parse("2026-05-20T00:00:00Z"));

        assertThat(repository.findLatestChampionMeta(81, "PLATINUM_PLUS"))
                .singleElement()
                .satisfies(meta -> {
                    assertThat(meta.patchKey()).isEqualTo("26.10");
                    assertThat(meta.winRate()).isEqualByComparingTo("0.5300");
                });
    }

    @Test
    void championMetaListReturnsAllTierScopesForChampion() {
        repository.save(meta("26.10", "GOLD", 81, "ADC", "0.4900"), Instant.parse("2026-05-10T00:00:00Z"));
        repository.save(meta("26.10", "PLATINUM_PLUS", 81, "ADC", "0.5300"), Instant.parse("2026-05-10T00:01:00Z"));
        repository.save(meta("26.10", "PLATINUM_PLUS", 103, "MID", "0.5100"), Instant.parse("2026-05-10T00:02:00Z"));

        assertThat(repository.findChampionMeta(81))
                .extracting(CnChampionMeta::tierScope)
                .containsExactly("PLATINUM_PLUS", "GOLD");
    }

    private static CnChampionMeta meta(
            String patchKey,
            String tierScope,
            Integer championId,
            String role,
            String winRate
    ) {
        return new CnChampionMeta(
                "local-test",
                patchKey,
                420,
                tierScope,
                championId,
                role,
                new BigDecimal(winRate),
                new BigDecimal("0.1200"),
                new BigDecimal("0.0300"),
                new BigDecimal("3.25"),
                new BigDecimal("12100"),
                new BigDecimal("25000"),
                new BigDecimal("18000"),
                new BigDecimal("1200"),
                1800,
                new BigDecimal("6"),
                new BigDecimal("8"),
                new BigDecimal("0.28"),
                new BigDecimal("0.19"),
                8,
                "sample",
                "local fixture"
        );
    }
}
