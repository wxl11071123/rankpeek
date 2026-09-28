package io.rankpeek.service;

import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import io.rankpeek.constant.GameConstants;
import io.rankpeek.model.ChampionSelectSession;
import io.rankpeek.model.GameDetail;
import io.rankpeek.model.GameSession;
import io.rankpeek.model.Lobby;
import io.rankpeek.model.MatchHistory;
import io.rankpeek.model.Rank;
import io.rankpeek.model.SessionData;
import io.rankpeek.model.Summoner;
import io.rankpeek.model.WinRate;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * LCU 核心服务（协调层）
 * 协调各个子服务，提供统一接口
 * 
 * @deprecated 此类已废弃，请直接使用各子服务：
 *             - {@link SummonerService} - 召唤师服务
 *             - {@link RankService} - 段位服务
 *             - {@link MatchHistoryService} - 战绩服务
 *             - {@link GameFlowService} - 游戏流程服务
 *             - {@link ChampionSelectService} - 选人服务
 *             - {@link SessionAnalysisService} - 会话分析服务
 *             - {@link LcuConnectionManager} - 连接管理
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Deprecated(since = "0.0.4", forRemoval = true)
public class LcuService {

    private final LcuHttpClient lcuHttpClient;
    private final SummonerService summonerService;
    private final RankService rankService;
    private final MatchHistoryService matchHistoryService;
    private final GameFlowService gameFlowService;
    private final ChampionSelectService championSelectService;
    private final SessionAnalysisService sessionAnalysisService;
    private final LcuConnectionManager lcuConnectionManager;

    // ========== 委托给 SummonerService ==========

    @Deprecated(since = "0.0.4", forRemoval = true)
    public Summoner getMySummoner() {
        return summonerService.getMySummoner();
    }

    @Deprecated(since = "0.0.4", forRemoval = true)
    public Summoner getSummonerByPuuid(String puuid) {
        return summonerService.getSummonerByPuuid(puuid);
    }

    @Deprecated(since = "0.0.4", forRemoval = true)
    public Summoner getSummonerByName(String name) {
        return summonerService.getSummonerByName(name);
    }

    // ========== 委托给 RankService ==========

    @Deprecated(since = "0.0.4", forRemoval = true)
    public Rank getRankByPuuid(String puuid) {
        return rankService.getRankByPuuid(puuid);
    }

    // ========== 委托给 MatchHistoryService ==========

    @Deprecated(since = "0.0.4", forRemoval = true)
    public List<MatchHistory> getMatchHistory(String puuid, int begIndex, int endIndex) {
        return matchHistoryService.getMatchHistory(puuid, begIndex, endIndex);
    }

    @Deprecated(since = "0.0.4", forRemoval = true)
    public List<MatchHistory> getFilteredMatchHistory(String puuid, int begIndex, int endIndex,
            Integer queueId, Integer championId, int maxResults) {
        return matchHistoryService.getFilteredMatchHistory(puuid, begIndex, endIndex, queueId, championId, maxResults);
    }

    @Deprecated(since = "0.0.4", forRemoval = true)
    public String getPlatformName(String name) {
        Summoner summoner = getSummonerByName(name);
        if (summoner == null || summoner.getPuuid() == null) {
            return "暂无";
        }

        List<MatchHistory> matches = getMatchHistory(summoner.getPuuid(), 0, 1);
        if (matches.isEmpty() || matches.getFirst().getPlatformId() == null) {
            return "暂无";
        }

        return GameConstants.getServerName(matches.getFirst().getPlatformId());
    }

    @Deprecated(since = "0.0.4", forRemoval = true)
    public WinRate getWinRate(String puuid, Integer mode) {
        return matchHistoryService.getWinRate(puuid, mode);
    }

    @Deprecated(since = "0.0.4", forRemoval = true)
    public Map<String, WinRate> getRankedWinRates(String puuid) {
        return matchHistoryService.getRankedWinRates(puuid);
    }

    // ========== 委托给 GameFlowService ==========

    @Deprecated(since = "0.0.4", forRemoval = true)
    public String getGamePhase() {
        String phase = lcuConnectionManager.getCurrentPhase();
        return phase != null ? phase : gameFlowService.getGamePhase();
    }

    @Deprecated(since = "0.0.4", forRemoval = true)
    public Lobby getLobby() {
        return gameFlowService.getLobby();
    }

    @Deprecated(since = "0.0.4", forRemoval = true)
    public void startMatchmaking() {
        gameFlowService.startMatchmaking();
    }

    @Deprecated(since = "0.0.4", forRemoval = true)
    public void cancelMatchmaking() {
        gameFlowService.cancelMatchmaking();
    }

    @Deprecated(since = "0.0.4", forRemoval = true)
    public void acceptMatch() {
        gameFlowService.acceptMatch();
    }

    @Deprecated(since = "0.0.4", forRemoval = true)
    public boolean checkConnection() {
        return lcuConnectionManager.isConnected();
    }

    // ========== 委托给 ChampionSelectService ==========

    @Deprecated(since = "0.0.4", forRemoval = true)
    public ChampionSelectSession getChampionSelectSession() {
        return championSelectService.getChampionSelectSession();
    }

    @Deprecated(since = "0.0.4", forRemoval = true)
    public void pickChampion(int actionId, int championId, boolean completed) {
        championSelectService.pickChampion(actionId, championId, completed);
    }

    @Deprecated(since = "0.0.4", forRemoval = true)
    public void banChampion(int actionId, int championId, boolean completed) {
        championSelectService.banChampion(actionId, championId, completed);
    }

    // ========== 委托给 SessionAnalysisService ==========

    @Deprecated(since = "0.0.4", forRemoval = true)
    public SessionData getSessionData(Integer mode) {
        return sessionAnalysisService.getSessionData(mode);
    }

    // ========== 其他方法 ==========

    @Deprecated(since = "0.0.4", forRemoval = true)
    public GameDetail getGameDetailById(Long gameId) {
        String uri = String.format("lol-match-history/v1/games/%d", gameId);
        return lcuHttpClient.get(uri, GameDetail.class);
    }

    @Deprecated(since = "0.0.4", forRemoval = true)
    public GameSession getGameSession() {
        return lcuHttpClient.get("lol-gameflow/v1/session", GameSession.class);
    }
}
