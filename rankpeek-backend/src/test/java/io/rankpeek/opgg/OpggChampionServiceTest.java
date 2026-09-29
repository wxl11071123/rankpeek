package io.rankpeek.opgg;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.rankpeek.cache.LocalCacheSchemaInitializer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OpggChampionServiceTest {

    private final MutableClock clock = new MutableClock(Instant.parse("2026-05-31T08:00:00Z"));
    private OpggChampionCacheRepository repository;
    private FakeSourceClient sourceClient;
    private OpggChampionService service;

    @BeforeEach
    void setUp() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:rankpeek-opgg-service-" + System.nanoTime()
                        + ";MODE=PostgreSQL;DATABASE_TO_UPPER=false;DB_CLOSE_DELAY=-1",
                "sa",
                ""
        );
        JdbcTemplate jdbcTemplate = new JdbcTemplate(dataSource);
        new LocalCacheSchemaInitializer(jdbcTemplate).initializeSchema();
        repository = new OpggChampionCacheRepository(jdbcTemplate, new ObjectMapper().findAndRegisterModules());
        sourceClient = new FakeSourceClient();
        service = new OpggChampionService(
                sourceClient,
                Duration.ofMinutes(30),
                clock,
                new OpggCacheProperties(true, "Asia/Shanghai", false, "0 20 4 * * *"),
                repository
        );
    }

    @Test
    void returnsFreshDatabaseCacheBeforeCallingSource() {
        OpggChampionListQuery query = new OpggChampionListQuery("ranked", "kr", "emerald_plus");
        repository.save(
                query,
                championList(query, "16.10", 7),
                clock.instant().minusSeconds(60),
                clock.instant().plusSeconds(60)
        );
        sourceClient.failLists = true;

        OpggChampionList list = service.getChampionList(query);

        assertThat(list.version()).isEqualTo("16.10");
        assertThat(sourceClient.listCalls).isZero();
    }

    @Test
    void fetchesAndStoresWhenCacheIsMissing() {
        OpggChampionListQuery query = new OpggChampionListQuery("ranked", "kr", "emerald_plus");
        sourceClient.nextList = championList(query, "16.11", 3);

        OpggChampionList list = service.getChampionList(query);

        assertThat(list.version()).isEqualTo("16.11");
        assertThat(sourceClient.listCalls).isEqualTo(1);
        assertThat(repository.findFresh(query, clock.instant().plusSeconds(60)))
                .hasValueSatisfying(cached -> assertThat(cached.version()).isEqualTo("16.11"));
    }

    @Test
    void returnsStaleCacheWhenSourceFails() {
        OpggChampionListQuery query = new OpggChampionListQuery("ranked", "kr", "emerald_plus");
        repository.save(
                query,
                championList(query, "16.10", 7),
                clock.instant().minusSeconds(3600),
                clock.instant().minusSeconds(60)
        );
        sourceClient.failLists = true;

        OpggChampionList list = service.getChampionList(query);

        assertThat(list.version()).isEqualTo("16.10");
        assertThat(sourceClient.listCalls).isEqualTo(1);
    }

    @Test
    void throwsWhenSourceFailsAndNoUsableCacheExists() {
        OpggChampionListQuery query = new OpggChampionListQuery("ranked", "kr", "emerald_plus");
        sourceClient.failLists = true;

        assertThatThrownBy(() -> service.getChampionList(query))
                .isInstanceOf(OpggSourceException.class)
                .hasMessageContaining("OP.GG source failed");
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

    private static final class FakeSourceClient implements OpggSourceClient {
        private int listCalls;
        private boolean failLists;
        private OpggChampionList nextList;

        @Override
        public OpggChampionDetail fetchChampionDetail(OpggChampionDetailQuery query) {
            throw new OpggSourceException("OP.GG detail source failed");
        }

        @Override
        public OpggChampionList fetchChampionList(OpggChampionListQuery query) {
            listCalls += 1;
            if (failLists) {
                throw new OpggSourceException("OP.GG source failed");
            }
            if (nextList == null) {
                throw new OpggSourceException("OP.GG source failed");
            }
            return nextList;
        }
    }

    private static final class MutableClock extends Clock {
        private Instant instant;

        private MutableClock(Instant instant) {
            this.instant = instant;
        }

        @Override
        public ZoneId getZone() {
            return ZoneId.of("UTC");
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return instant;
        }
    }
}
