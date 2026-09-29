package io.rankpeek.service;

import io.rankpeek.cache.MatchHistoryCacheRepository;
import io.rankpeek.model.Rank;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RankServiceCacheTest {

    @Mock
    private LcuHttpClient lcuHttpClient;
    @Mock
    private MatchHistoryCacheRepository repository;

    private RankService service;

    @BeforeEach
    void setUp() {
        service = new RankService(lcuHttpClient, repository);
        service.init();
    }

    @Test
    void getRankByPuuid_fetchesLcuBeforeDatabaseCache() {
        Rank fresh = createRank("EMERALD");
        when(lcuHttpClient.get("lol-ranked/v1/ranked-stats/puuid-1", Rank.class)).thenReturn(fresh);

        assertThat(service.getRankByPuuid("puuid-1")).isSameAs(fresh);

        verify(repository, never()).findRank("puuid-1");
        verify(repository).saveRank("puuid-1", fresh);
    }

    @Test
    void getRankByPuuid_fallsBackToDatabaseOnLcuFailure() {
        Rank stale = createRank("GOLD");
        when(lcuHttpClient.get("lol-ranked/v1/ranked-stats/puuid-2", Rank.class))
                .thenThrow(new RuntimeException("LCU down"));
        when(repository.findRank("puuid-2")).thenReturn(Optional.of(stale));

        assertThat(service.getRankByPuuid("puuid-2")).isSameAs(stale);
        verify(lcuHttpClient).get("lol-ranked/v1/ranked-stats/puuid-2", Rank.class);
    }

    @Test
    void getRankByPuuid_savesLcuResult() {
        Rank fetched = createRank("PLATINUM");
        when(lcuHttpClient.get("lol-ranked/v1/ranked-stats/puuid-1", Rank.class)).thenReturn(fetched);

        assertThat(service.getRankByPuuid("puuid-1")).isSameAs(fetched);
        verify(repository).saveRank("puuid-1", fetched);
    }

    private Rank createRank(String tier) {
        Rank rank = new Rank();
        Rank.QueueMap queueMap = new Rank.QueueMap();
        Rank.QueueInfo solo = new Rank.QueueInfo();
        solo.setTier(tier);
        solo.setWins(10);
        solo.setLosses(5);
        queueMap.setRankedSolo5x5(solo);
        rank.setQueueMap(queueMap);
        return rank;
    }
}
