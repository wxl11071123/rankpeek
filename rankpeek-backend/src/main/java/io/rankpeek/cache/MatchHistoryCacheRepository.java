package io.rankpeek.cache;

import io.rankpeek.model.GameDetail;
import io.rankpeek.model.MatchDataScopeCache;
import io.rankpeek.model.MatchHistory;
import io.rankpeek.model.MatchHistoryFetchResult;
import io.rankpeek.model.MatchTimeline;
import io.rankpeek.model.Rank;
import io.rankpeek.model.Summoner;

import java.util.List;
import java.util.Map;
import java.util.Optional;

public interface MatchHistoryCacheRepository {

    Optional<MatchHistoryFetchResult> findRecentMatchHistory(String puuid, int limit);

    void saveMatchHistory(String puuid, List<MatchHistory> matches);

    Optional<GameDetail> findGameDetail(Long gameId);

    void saveGameDetail(GameDetail detail);

    void saveSgpRawSummaries(Map<Long, String> rawSummaryJsonByGameId);

    void saveSgpRawDetail(Long gameId, String rawDetailJson, String status, String lastError);

    void saveSgpTimeline(Long gameId, MatchTimeline timeline, String rawTimelineJson, String status, String lastError);

    Optional<MatchDataScopeCache> findMatchDataScope(Long gameId);

    Optional<Summoner> findSummonerByPuuid(String puuid);

    Optional<Summoner> findSummonerByName(String gameName, String tagLine);

    void saveSummoner(Summoner summoner);

    Optional<Rank> findRank(String puuid);

    void saveRank(String puuid, Rank rank);

    void updatePlayerFetchState(String puuid, List<MatchHistory> matches, String status, String lastError);

    Optional<Long> getMatchUpdatedAt(String puuid);

    void trimPlayerMatchIndex(String puuid, int keepCount);
}
