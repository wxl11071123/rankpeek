package io.rankpeek.service.matchhistory;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.rankpeek.model.GameDetail;
import io.rankpeek.model.MatchHistory;
import io.rankpeek.model.MatchHistoryFetchResult;
import io.rankpeek.service.LcuHttpClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LcuMatchHistoryProviderTest {

    @Mock
    private LcuHttpClient lcuHttpClient;

    private LcuMatchHistoryProvider provider;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        provider = new LcuMatchHistoryProvider(lcuHttpClient);
    }

    @Test
    void fetchMatchHistory_usesExistingLcuMatchHistoryUriAndKeepsRemakesForDisplay() {
        when(lcuHttpClient.getObjectMapper()).thenReturn(objectMapper);
        when(lcuHttpClient.get(
                "lol-match-history/v1/products/lol/puuid-1/matches?begIndex=0&endIndex=49",
                JsonNode.class
        )).thenReturn(flatHistoryResponse(
                game(1L, 1_800),
                game(2L, 120)
        ));

        MatchHistoryFetchResult result = provider.fetchMatchHistory("puuid-1", MatchHistoryQueryOptions.lcuDefault(false));

        assertThat(result.getMatches()).extracting(MatchHistory::getGameId).containsExactly(2L, 1L);
        assertThat(result.getMatches().get(0).getGameDuration()).isEqualTo(120);
        assertThat(result.isRawEmpty()).isFalse();
        verify(lcuHttpClient).get(
                "lol-match-history/v1/products/lol/puuid-1/matches?begIndex=0&endIndex=49",
                JsonNode.class
        );
    }

    @Test
    void fetchMatchHistory_readsNestedGamesWrapperLikeExistingService() {
        when(lcuHttpClient.getObjectMapper()).thenReturn(objectMapper);
        when(lcuHttpClient.get(
                "lol-match-history/v1/products/lol/puuid-1/matches?begIndex=0&endIndex=49",
                JsonNode.class
        )).thenReturn(nestedHistoryResponse(game(3L, 1_500)));

        MatchHistoryFetchResult result = provider.fetchMatchHistory("puuid-1", MatchHistoryQueryOptions.lcuDefault(false));

        assertThat(result.getMatches()).extracting(MatchHistory::getGameId).containsExactly(3L);
    }

    @Test
    void fetchGameDetail_usesExistingLcuGameDetailUri() {
        GameDetail detail = new GameDetail();
        detail.setGameId(99L);
        when(lcuHttpClient.get("lol-match-history/v1/games/99", GameDetail.class)).thenReturn(detail);

        GameDetail result = provider.fetchGameDetail(99L, MatchHistoryQueryOptions.lcuDefault(false));

        assertThat(result).isSameAs(detail);
        verify(lcuHttpClient).get("lol-match-history/v1/games/99", GameDetail.class);
    }

    @Test
    void supportsOnlyLcuCompatibleOptionsForNow() {
        assertThat(provider.source()).isEqualTo(MatchHistorySource.LCU);
        assertThat(provider.supports(MatchHistoryQueryOptions.lcuDefault(false))).isTrue();
        assertThat(provider.supports(new MatchHistoryQueryOptions(
                0,
                99,
                null,
                null,
                50,
                false,
                MatchHistorySource.SGP,
                null,
                null
        ))).isFalse();
    }

    private ObjectNode flatHistoryResponse(ObjectNode... games) {
        ObjectNode root = objectMapper.createObjectNode();
        for (ObjectNode game : games) {
            root.withArray("games").add(game);
        }
        return root;
    }

    private ObjectNode nestedHistoryResponse(ObjectNode... games) {
        ObjectNode root = objectMapper.createObjectNode();
        ObjectNode wrapper = root.putObject("games");
        for (ObjectNode game : games) {
            wrapper.withArray("games").add(game);
        }
        return root;
    }

    private ObjectNode game(long gameId, int gameDuration) {
        ObjectNode game = objectMapper.createObjectNode();
        game.put("gameId", gameId);
        game.put("gameCreation", 1_710_000_000_000L + gameId);
        game.put("gameDuration", gameDuration);
        return game;
    }
}
