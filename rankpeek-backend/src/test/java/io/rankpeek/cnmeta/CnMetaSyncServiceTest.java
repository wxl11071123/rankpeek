package io.rankpeek.cnmeta;

import io.rankpeek.cache.LocalCacheSchemaInitializer;
import io.rankpeek.cnmeta.sync.CnMetaChampionStatRow;
import io.rankpeek.cnmeta.sync.CnMetaSourceClient;
import io.rankpeek.cnmeta.sync.CnMetaSourceException;
import io.rankpeek.cnmeta.sync.CnMetaSourcePayload;
import io.rankpeek.cnmeta.sync.CnMetaSyncJob;
import io.rankpeek.cnmeta.sync.CnMetaSyncProperties;
import io.rankpeek.cnmeta.sync.CnMetaSyncRepository;
import io.rankpeek.cnmeta.sync.CnMetaSyncResult;
import io.rankpeek.cnmeta.sync.CnMetaSyncService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class CnMetaSyncServiceTest {

    private CnMetaRepository metaRepository;
    private CnMetaSyncRepository syncRepository;

    @BeforeEach
    void setUp() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:rankpeek-cnmeta-sync-" + System.nanoTime()
                        + ";MODE=PostgreSQL;DATABASE_TO_UPPER=false;DB_CLOSE_DELAY=-1",
                "sa",
                ""
        );
        JdbcTemplate jdbcTemplate = new JdbcTemplate(dataSource);
        new LocalCacheSchemaInitializer(jdbcTemplate).initializeSchema();
        metaRepository = new CnMetaRepository(jdbcTemplate);
        syncRepository = new CnMetaSyncRepository(jdbcTemplate);
    }

    @Test
    void syncJobRecordsStatusRowCountStartedFinishedAndError() {
        CnMetaSyncService service = service(new FixtureSourceClient(false, "0.5200"));

        CnMetaSyncResult success = service.syncOnceWithSource("fixture", "26.10", 420, "PLATINUM_PLUS", "ADC");

        assertThat(success.status()).isEqualTo("SUCCESS");
        assertThat(success.rowCount()).isEqualTo(1);
        assertThat(success.startedAt()).isNotNull();
        assertThat(success.finishedAt()).isNotNull();
        assertThat(success.errorMessage()).isNull();

        CnMetaSyncService failingService = service(new FixtureSourceClient(true, "0.0000"));
        CnMetaSyncResult failure = failingService.syncOnceWithSource("fixture", "26.11", 420, "PLATINUM_PLUS", "ADC");

        assertThat(failure.status()).isEqualTo("FAILED");
        assertThat(failure.rowCount()).isZero();
        assertThat(failure.startedAt()).isNotNull();
        assertThat(failure.finishedAt()).isNotNull();
        assertThat(failure.errorMessage()).contains("source unavailable");

        assertThat(syncRepository.findRecentJobs(10))
                .extracting(CnMetaSyncJob::status)
                .containsExactly("FAILED", "SUCCESS");
    }

    @Test
    void failedSyncKeepsPreviousUsableData() {
        CnMetaSyncService service = service(new FixtureSourceClient(false, "0.5200"));
        service.syncOnceWithSource("fixture", "26.10", 420, "PLATINUM_PLUS", "ADC");

        CnMetaSyncService failingService = service(new FixtureSourceClient(true, "0.0000"));
        CnMetaSyncResult failure = failingService.syncOnceWithSource("fixture", "26.11", 420, "PLATINUM_PLUS", "ADC");

        assertThat(failure.status()).isEqualTo("FAILED");
        assertThat(metaRepository.findLatestChampionMeta(81, "PLATINUM_PLUS"))
                .singleElement()
                .satisfies(meta -> {
                    assertThat(meta.patchKey()).isEqualTo("26.10");
                    assertThat(meta.winRate()).isEqualByComparingTo("0.5200");
                });
    }

    private CnMetaSyncService service(CnMetaSourceClient sourceClient) {
        return new CnMetaSyncService(
                new CnMetaSyncProperties(
                        false,
                        true,
                        "fixture",
                        "0 30 4 * * *",
                        "Asia/Shanghai",
                        0,
                        0,
                        List.of(401, 403, 429),
                        420,
                        List.of("PLATINUM_PLUS"),
                        List.of("ADC"),
                        true,
                        "",
                        1,
                        81,
                        1,
                        Map.of("PLATINUM_PLUS", "10"),
                        "RankPeek/local-test",
                        500,
                        2000,
                        20000
                ),
                syncRepository,
                List.of(sourceClient)
        );
    }

    private static final class FixtureSourceClient implements CnMetaSourceClient {
        private final boolean failing;
        private final String winRate;

        private FixtureSourceClient(boolean failing, String winRate) {
            this.failing = failing;
            this.winRate = winRate;
        }

        @Override
        public String source() {
            return "fixture";
        }

        @Override
        public CnMetaSourcePayload fetchChampionStats(String patchKey, Integer queueId, String tierScope, String role) {
            if (failing) {
                throw new CnMetaSourceException("source unavailable");
            }
            return new CnMetaSourcePayload(
                    "fixture",
                    "fixture://cn-meta",
                    "%s|%d|%s|%s".formatted(patchKey, queueId, tierScope, role),
                    200,
                    "fixture-" + winRate,
                    LocalDate.of(2026, 5, 31),
                    List.of(new CnMetaChampionStatRow(
                            81,
                            role,
                            tierScope,
                            new BigDecimal(winRate),
                            new BigDecimal("0.1200"),
                            new BigDecimal("0.0300"),
                            new BigDecimal("3.25"),
                            new BigDecimal("12100"),
                            new BigDecimal("0.28"),
                            new BigDecimal("0.19"),
                            8,
                            "fixture",
                            new BigDecimal("25000"),
                            new BigDecimal("18000"),
                            new BigDecimal("1200"),
                            1800,
                            new BigDecimal("6"),
                            new BigDecimal("8"),
                            "fixture source"
                    ))
            );
        }
    }
}
