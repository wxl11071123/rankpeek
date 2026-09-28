package io.rankpeek.service.matchhistory;

import com.fasterxml.jackson.databind.JsonNode;
import io.rankpeek.model.GameDetail;
import io.rankpeek.model.MatchHistory;
import io.rankpeek.model.MatchHistoryFetchResult;
import io.rankpeek.service.LcuHttpClient;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
@RequiredArgsConstructor
public class LcuMatchHistoryProvider implements MatchHistoryProvider {

    private static final int DEFAULT_PAGE_SIZE = 50;
    private static final int DEFAULT_LOOKBACK_END_INDEX = 99;

    private final LcuHttpClient lcuHttpClient;

    @Override
    public MatchHistorySource source() {
        return MatchHistorySource.LCU;
    }

    @Override
    public MatchHistoryFetchResult fetchMatchHistory(String puuid, MatchHistoryQueryOptions options) {
        MatchHistoryQueryOptions queryOptions = options == null
                ? MatchHistoryQueryOptions.lcuDefault(false)
                : options;
        int begIndex = Math.max(0, queryOptions.begIndex());
        int endIndex = queryOptions.endIndex() >= begIndex
                ? queryOptions.endIndex()
                : DEFAULT_LOOKBACK_END_INDEX;
        int maxResults = queryOptions.maxResults() != null && queryOptions.maxResults() > 0
                ? queryOptions.maxResults()
                : DEFAULT_PAGE_SIZE;

        List<MatchHistory> matches = new ArrayList<>();
        int currentBegIndex = begIndex;

        while (currentBegIndex <= endIndex && matches.size() < maxResults) {
            int currentEndIndex = Math.min(currentBegIndex + maxResults - 1, endIndex);
            String uri = String.format("lol-match-history/v1/products/lol/%s/matches?begIndex=%d&endIndex=%d",
                    puuid, currentBegIndex, currentEndIndex);

            JsonNode response = lcuHttpClient.get(uri, JsonNode.class);
            JsonNode gamesNode = extractGamesNode(response);
            if (gamesNode == null || !gamesNode.isArray() || gamesNode.isEmpty()) {
                break;
            }

            for (JsonNode game : gamesNode) {
                matches.add(lcuHttpClient.getObjectMapper().convertValue(game, MatchHistory.class));
            }

            if (gamesNode.size() < currentEndIndex - currentBegIndex + 1) {
                break;
            }
            currentBegIndex = currentEndIndex + 1;
        }

        matches.sort(Comparator.comparingLong(this::gameCreationOrMin).reversed());
        if (matches.size() > maxResults) {
            matches = new ArrayList<>(matches.subList(0, maxResults));
        }

        return MatchHistoryFetchResult.builder()
                .matches(matches)
                .rawEmpty(matches.isEmpty())
                .build();
    }

    @Override
    public GameDetail fetchGameDetail(Long gameId, MatchHistoryQueryOptions options) {
        String uri = String.format("lol-match-history/v1/games/%d", gameId);
        return lcuHttpClient.get(uri, GameDetail.class);
    }

    @Override
    public boolean supports(MatchHistoryQueryOptions options) {
        if (options == null || options.preferredSource() == null) {
            return true;
        }
        return options.preferredSource() == MatchHistorySource.LCU
                || options.preferredSource() == MatchHistorySource.AUTO;
    }

    private JsonNode extractGamesNode(JsonNode response) {
        if (response == null) {
            return null;
        }
        JsonNode gamesWrapper = response.get("games");
        if (gamesWrapper == null) {
            return null;
        }
        if (gamesWrapper.isArray()) {
            return gamesWrapper;
        }
        return gamesWrapper.get("games");
    }

    private long gameCreationOrMin(MatchHistory match) {
        return match.getGameCreation() == null ? Long.MIN_VALUE : match.getGameCreation();
    }
}
