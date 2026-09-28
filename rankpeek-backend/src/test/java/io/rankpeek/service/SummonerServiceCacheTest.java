package io.rankpeek.service;

import io.rankpeek.cache.MatchHistoryCacheRepository;
import io.rankpeek.model.Summoner;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SummonerServiceCacheTest {

    @Mock
    private LcuHttpClient lcuHttpClient;
    @Mock
    private MatchHistoryCacheRepository repository;

    private SummonerService service;

    @BeforeEach
    void setUp() {
        service = new SummonerService(lcuHttpClient, repository);
        service.init();
    }

    @Test
    void getSummonerByPuuid_usesDatabaseOnCacheMiss() {
        Summoner cached = createSummoner("puuid-1", "Tester", "CN1");
        when(repository.findSummonerByPuuid("puuid-1")).thenReturn(Optional.of(cached));

        assertThat(service.getSummonerByPuuid("puuid-1")).isSameAs(cached);
    }

    @Test
    void getSummonerByPuuid_fallsBackToDatabaseWhenLcuFails() {
        Summoner cached = createSummoner("puuid-1", "Tester", "CN1");
        when(repository.findSummonerByPuuid("puuid-1"))
                .thenReturn(Optional.empty())
                .thenReturn(Optional.of(cached));
        when(lcuHttpClient.<Summoner>get("lol-summoner/v2/summoners/puuid/puuid-1", Summoner.class))
                .thenThrow(new RuntimeException("LCU down"));

        assertThat(service.getSummonerByPuuid("puuid-1")).isSameAs(cached);
    }

    @Test
    void getSummonerByName_savesLcuResult() {
        Summoner fetched = createSummoner("puuid-1", "Tester", "CN1");
        when(lcuHttpClient.<Summoner>get("lol-summoner/v1/summoners/?name=Tester%23CN1", Summoner.class))
                .thenReturn(fetched);

        assertThat(service.getSummonerByName("Tester#CN1")).isSameAs(fetched);
        verify(repository).saveSummoner(fetched);
    }

    private Summoner createSummoner(String puuid, String gameName, String tagLine) {
        Summoner summoner = new Summoner();
        summoner.setPuuid(puuid);
        summoner.setGameName(gameName);
        summoner.setTagLine(tagLine);
        return summoner;
    }
}
