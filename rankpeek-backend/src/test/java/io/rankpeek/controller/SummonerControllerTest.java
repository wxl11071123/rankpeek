package io.rankpeek.controller;

import io.rankpeek.model.ApiResponse;
import io.rankpeek.model.MatchHistory;
import io.rankpeek.model.MatchHistoryPageResponse;
import io.rankpeek.model.MatchTimelineFetchResult;
import io.rankpeek.model.Rank;
import io.rankpeek.model.RecordStatus;
import io.rankpeek.model.Summoner;
import io.rankpeek.service.LcuHttpClient;
import io.rankpeek.service.MatchHistoryService;
import io.rankpeek.service.RankService;
import io.rankpeek.service.SummonerService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SummonerControllerTest {

    @Mock
    private SummonerService summonerService;
    @Mock
    private RankService rankService;
    @Mock
    private MatchHistoryService matchHistoryService;
    @Mock
    private LcuHttpClient lcuHttpClient;

    private SummonerController controller;

    @BeforeEach
    void setUp() {
        controller = new SummonerController(
                summonerService,
                rankService,
                matchHistoryService,
                lcuHttpClient
        );
    }

    @Test
    void getMatchHistory_passesForceRefreshToService() {
        MatchHistory match = new MatchHistory();
        match.setGameId(1L);
        when(matchHistoryService.getMatchHistory("puuid-1", 0, 9, true)).thenReturn(List.of(match));

        ApiResponse<List<MatchHistory>> response = controller.getMatchHistory("puuid-1", 0, 9, true);

        assertThat(response.getData()).containsExactly(match);
        verify(matchHistoryService).getMatchHistory("puuid-1", 0, 9, true);
    }

    @Test
    void getFilteredMatchHistory_passesForceRefreshToService() {
        MatchHistory match = new MatchHistory();
        match.setGameId(2L);
        when(matchHistoryService.getFilteredMatchHistory("puuid-1", 0, 49, 420, 22, 10, true))
                .thenReturn(List.of(match));

        ApiResponse<List<MatchHistory>> response = controller.getFilteredMatchHistory(
                "puuid-1",
                0,
                49,
                420,
                22,
                10,
                true
        );

        assertThat(response.getData()).containsExactly(match);
        verify(matchHistoryService).getFilteredMatchHistory("puuid-1", 0, 49, 420, 22, 10, true);
    }

    @Test
    void getMatchHistoryPage_usesDefaultPageSizeAndAutoSource() {
        MatchHistoryPageResponse page = MatchHistoryPageResponse.builder()
                .matches(List.of(new MatchHistory()))
                .page(1)
                .pageSize(10)
                .hasNext(false)
                .source("auto")
                .recordStatus(RecordStatus.NORMAL)
                .build();
        when(matchHistoryService.getMatchHistoryPage("puuid-1", 1, 10, "auto", null, null, false, null))
                .thenReturn(page);

        ApiResponse<MatchHistoryPageResponse> response = controller.getMatchHistoryPage(
                "puuid-1",
                1,
                10,
                null,
                null,
                null,
                false
        );

        assertThat(response.getData()).isSameAs(page);
        verify(matchHistoryService).getMatchHistoryPage("puuid-1", 1, 10, "auto", null, null, false, null);
        verify(rankService, never()).getRankByPuuid("puuid-1");
    }

    @Test
    void getMatchHistoryPage_passesSgpSourceAndFiltersToService() {
        MatchHistoryPageResponse page = MatchHistoryPageResponse.builder()
                .matches(List.of())
                .page(2)
                .pageSize(5)
                .hasNext(false)
                .source("sgp")
                .recordStatus(RecordStatus.EMPTY)
                .build();
        when(matchHistoryService.getMatchHistoryPage("puuid-1", 2, 5, "sgp", 420, 22, true, null))
                .thenReturn(page);

        ApiResponse<MatchHistoryPageResponse> response = controller.getMatchHistoryPage(
                "puuid-1",
                2,
                5,
                "sgp",
                420,
                22,
                true
        );

        assertThat(response.getData()).isSameAs(page);
        verify(matchHistoryService).getMatchHistoryPage("puuid-1", 2, 5, "sgp", 420, 22, true, null);
        verify(rankService, never()).getRankByPuuid("puuid-1");
    }

    @Test
    void getRank_keepsExistingEndpointBehavior() {
        Rank rank = new Rank();
        when(rankService.getRankByPuuid("puuid-1")).thenReturn(rank);

        assertThat(controller.getRank("puuid-1").getData()).isSameAs(rank);
    }

    @Test
    void getGameTimeline_passesGameIdAndSourceToService() {
        MatchTimelineFetchResult result = MatchTimelineFetchResult.builder()
                .gameId(7001L)
                .status("FETCHED")
                .build();
        when(matchHistoryService.getGameTimelineById(7001L, "sgp", "HN1")).thenReturn(result);

        ApiResponse<MatchTimelineFetchResult> response = controller.getGameTimeline(7001L, "sgp", "HN1");

        assertThat(response.getData()).isSameAs(result);
        verify(matchHistoryService).getGameTimelineById(7001L, "sgp", "HN1");
    }

    @Test
    void getSummonerByPuuid_keepsExistingEndpointBehavior() {
        Summoner summoner = new Summoner();
        when(summonerService.getSummonerByPuuid("puuid-1")).thenReturn(summoner);

        assertThat(controller.getSummonerByPuuid("puuid-1").getData()).isSameAs(summoner);
    }
}
