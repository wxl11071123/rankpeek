package io.rankpeek.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.rankpeek.model.Summoner;
import io.rankpeek.service.LcuHttpClient;
import io.rankpeek.service.SummonerService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DebugLcuControllerTest {

    @Mock
    private LcuHttpClient lcuHttpClient;
    @Mock
    private SummonerService summonerService;

    private DebugLcuController controller;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        controller = new DebugLcuController(lcuHttpClient, summonerService);
    }

    @Test
    void matchHistoryLimit_usesCurrentSummonerWhenPuuidIsMissingAndRequestsRawLcuRanges() {
        Summoner summoner = new Summoner();
        summoner.setPuuid("me-puuid");
        when(summonerService.getMySummoner()).thenReturn(summoner);
        when(lcuHttpClient.get(anyString(), eq(JsonNode.class))).thenReturn(flatResponse());

        DebugLcuController.LcuMatchHistoryLimitDebugResponse response =
                controller.matchHistoryLimit(null, 20, 100);

        assertThat(response.puuid()).isEqualTo("me-puuid");
        verify(summonerService).getMySummoner();
        verify(lcuHttpClient, atLeastOnce()).get(
                "lol-match-history/v1/products/lol/me-puuid/matches?begIndex=0&endIndex=19",
                JsonNode.class
        );
        verify(lcuHttpClient, atLeastOnce()).get(
                "lol-match-history/v1/products/lol/me-puuid/matches?begIndex=0&endIndex=49",
                JsonNode.class
        );
        verify(lcuHttpClient, atLeastOnce()).get(
                "lol-match-history/v1/products/lol/me-puuid/matches?begIndex=20&endIndex=39",
                JsonNode.class
        );
        verify(lcuHttpClient, atLeastOnce()).get(
                "lol-match-history/v1/products/lol/me-puuid/matches?begIndex=40&endIndex=59",
                JsonNode.class
        );
        verify(lcuHttpClient, atLeastOnce()).get(
                "lol-match-history/v1/products/lol/me-puuid/matches?begIndex=60&endIndex=79",
                JsonNode.class
        );
        verify(lcuHttpClient, atLeastOnce()).get(
                "lol-match-history/v1/products/lol/me-puuid/matches?begIndex=80&endIndex=99",
                JsonNode.class
        );
        verify(lcuHttpClient, atLeastOnce()).get(
                "lol-match-history/v1/products/lol/me-puuid/matches?begIndex=0&endIndex=99",
                JsonNode.class
        );
        verify(lcuHttpClient, atLeastOnce()).get(
                "lol-match-history/v1/products/lol/me-puuid/matches?begIndex=100&endIndex=119",
                JsonNode.class
        );
    }

    @Test
    void matchHistoryLimit_usesExplicitPuuidWithoutReadingCurrentSummoner() {
        when(lcuHttpClient.get(anyString(), eq(JsonNode.class))).thenReturn(flatResponse());

        DebugLcuController.LcuMatchHistoryLimitDebugResponse response =
                controller.matchHistoryLimit(" target-puuid ", 20, 0);

        assertThat(response.puuid()).isEqualTo("target-puuid");
        verify(summonerService, never()).getMySummoner();
        verify(lcuHttpClient, atLeastOnce()).get(
                "lol-match-history/v1/products/lol/target-puuid/matches?begIndex=0&endIndex=19",
                JsonNode.class
        );
    }

    @Test
    void matchHistoryLimit_parsesFlatAndNestedGamesAndAggregatesPagedScan() {
        when(lcuHttpClient.get(anyString(), eq(JsonNode.class))).thenAnswer(invocation -> {
            String uri = invocation.getArgument(0);
            if (uri.contains("begIndex=0&endIndex=49")) {
                return nestedResponse(game(1L, 420, 1_710_000_000_000L, 1_800), game(3L, 420, 1_709_000_000_000L, 900));
            }
            if (uri.contains("begIndex=0&endIndex=19")) {
                return flatResponse(game(1L, 420, 1_710_000_000_000L, 1_800), game(2L, 450, 1_709_500_000_000L, 200));
            }
            if (uri.contains("begIndex=20&endIndex=39")) {
                return nestedResponse(game(3L, 420, 1_709_000_000_000L, 900), game(4L, 440, 1_708_000_000_000L, 1_200));
            }
            return flatResponse();
        });

        DebugLcuController.LcuMatchHistoryLimitDebugResponse response =
                controller.matchHistoryLimit("puuid-1", 20, 40);

        DebugLcuController.RangeResult zeroToFortyNine = response.singleRangeResults().stream()
                .filter(result -> result.begIndex() == 0 && result.endIndex() == 49)
                .findFirst()
                .orElseThrow();

        assertThat(zeroToFortyNine.rawCount()).isEqualTo(2);
        assertThat(zeroToFortyNine.distinctGameIds()).isEqualTo(2);
        assertThat(zeroToFortyNine.queueCount()).containsEntry("420", 2L);

        DebugLcuController.PagedScanResult pagedScan = response.pagedScan();
        assertThat(pagedScan.totalRawRows()).isEqualTo(4);
        assertThat(pagedScan.totalDistinctGameIds()).isEqualTo(4);
        assertThat(pagedScan.validAfterDurationFilter()).isEqualTo(3);
        assertThat(pagedScan.shortGameCount()).isEqualTo(1);
        assertThat(pagedScan.duplicateGameIds()).isZero();
        assertThat(pagedScan.firstEmptyBegIndex()).isEqualTo(40);
        assertThat(pagedScan.queueCount())
                .containsEntry("420", 2L)
                .containsEntry("440", 1L)
                .containsEntry("450", 1L);
        assertThat(response.conclusion().canPageBeyond20()).isTrue();
    }

    @Test
    void matchHistoryLimit_doesNotTreatRepeatedFirstPageAsPagingBeyond20() {
        when(lcuHttpClient.get(anyString(), eq(JsonNode.class))).thenReturn(
                flatResponse(
                        game(1L, 420, 1_710_000_000_000L, 1_800),
                        game(2L, 420, 1_709_000_000_000L, 900)
                )
        );

        DebugLcuController.LcuMatchHistoryLimitDebugResponse response =
                controller.matchHistoryLimit("puuid-1", 20, 40);

        assertThat(response.pagedScan().totalRawRows()).isEqualTo(6);
        assertThat(response.pagedScan().totalDistinctGameIds()).isEqualTo(2);
        assertThat(response.pagedScan().duplicateGameIds()).isEqualTo(4);
        assertThat(response.pagedScan().queueCount()).containsEntry("420", 2L);
        assertThat(response.pagedScan().rawQueueCount()).containsEntry("420", 6L);
        assertThat(response.conclusion().canPageBeyond20()).isFalse();
    }

    private ObjectNode flatResponse(ObjectNode... games) {
        ObjectNode root = objectMapper.createObjectNode();
        ArrayNode gamesNode = root.putArray("games");
        for (ObjectNode game : games) {
            gamesNode.add(game);
        }
        return root;
    }

    private ObjectNode nestedResponse(ObjectNode... games) {
        ObjectNode root = objectMapper.createObjectNode();
        ObjectNode wrapper = root.putObject("games");
        ArrayNode gamesNode = wrapper.putArray("games");
        for (ObjectNode game : games) {
            gamesNode.add(game);
        }
        return root;
    }

    private ObjectNode game(long gameId, int queueId, long gameCreation, int gameDuration) {
        ObjectNode game = objectMapper.createObjectNode();
        game.put("gameId", gameId);
        game.put("queueId", queueId);
        game.put("gameCreation", gameCreation);
        game.put("gameDuration", gameDuration);
        return game;
    }
}
