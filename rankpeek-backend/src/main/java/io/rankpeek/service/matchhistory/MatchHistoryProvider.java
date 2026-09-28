package io.rankpeek.service.matchhistory;

import io.rankpeek.model.GameDetail;
import io.rankpeek.model.MatchHistoryFetchResult;
import io.rankpeek.model.MatchTimelineFetchResult;

public interface MatchHistoryProvider {

    MatchHistorySource source();

    MatchHistoryFetchResult fetchMatchHistory(String puuid, MatchHistoryQueryOptions options);

    GameDetail fetchGameDetail(Long gameId, MatchHistoryQueryOptions options);

    default MatchTimelineFetchResult fetchGameTimeline(Long gameId, MatchHistoryQueryOptions options) {
        return MatchTimelineFetchResult.builder()
                .gameId(gameId)
                .status("UNAVAILABLE")
                .lastError("Timeline is not supported by this match-history provider")
                .build();
    }

    boolean supports(MatchHistoryQueryOptions options);
}
