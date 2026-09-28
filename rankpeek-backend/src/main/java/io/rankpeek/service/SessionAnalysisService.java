package io.rankpeek.service;

import io.rankpeek.constant.GameConstants;
import io.rankpeek.model.*;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.stream.Collectors;

/**
 * 会话数据分析服务
 * 提供游戏会话数据处理、队伍分析、玩家信息聚合功能
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SessionAnalysisService {

    private final SummonerService summonerService;
    private final RankService rankService;
    private final MatchHistoryRefreshService matchHistoryRefreshService;
    private final GameFlowService gameFlowService;
    private final ChampionSelectService championSelectService;
    private final ScoutTagSampleService scoutTagSampleService;
    private final ScoutTagRuleService scoutTagRuleService;

    @Qualifier("dataLoaderExecutor")
    private final Executor dataLoaderExecutor;

    // ========== 可配置常量 ==========
    /** 近期战绩查询数量 */
    private static final int SCOUT_LOOKBACK_LIMIT = 50;
    private static final int SCOUT_SAMPLE_LIMIT = 20;
    private static final Set<String> LOBBY_DISPLAY_PHASES = Set.of("Lobby", "Matchmaking", "ReadyCheck");
    private static final Set<String> ACTIVE_GAME_PHASES = Set.of("GameStart", "InProgress");
    /** 预组队判定阈值：同队场次 */
    private static final int PRE_GROUP_FRIEND_THRESHOLD = 3;
    /** 预组队最小人数 */
    private static final int PRE_GROUP_MIN_MEMBERS = 2;

    @PostConstruct
    public void init() {
        log.info("会话数据分析服务初始化完成");
    }

    /**
     * 获取完整会话数据（包含所有玩家信息）
     */
    public SessionData getSessionData(Integer mode) {
        return getSessionData(mode, false);
    }

    public SessionData getSessionData(Integer mode, boolean forceRefresh) {
        Summoner mySummoner = summonerService.getMySummoner();
        if (mySummoner == null) {
            log.warn("无法获取当前召唤师信息");
            return emptySession("None", "NO_SUMMONER");
        }

        String phase;
        try {
            phase = gameFlowService.getGamePhase();
        } catch (Exception e) {
            log.warn("Failed to resolve gameflow phase while building session data: {}", e.getMessage());
            return emptySession("None", "PHASE_UNAVAILABLE");
        }
        log.info("getSessionData: phase={}, myPuuid={}", phase, mySummoner.getPuuid() != null ? mySummoner.getPuuid().substring(0, Math.min(8, mySummoner.getPuuid().length())) : "null");

        if ("ChampSelect".equals(phase)) {
            return processChampSelectPhase(mySummoner, mode);
        }

        if (LOBBY_DISPLAY_PHASES.contains(phase)) {
            return processLobbyPhase(phase, mySummoner, mode);
        }

        if (!ACTIVE_GAME_PHASES.contains(phase)) {
            return emptySession(phase, "INACTIVE_PHASE");
        }

        return processGamePhase(phase, mySummoner, mode);
    }

    private SessionData processChampSelectPhase(Summoner mySummoner, Integer mode) {
        ChampionSelectSession selectSession = championSelectService.getChampionSelectSession();
        if (selectSession == null) {
            log.warn("ChampSelect session is unavailable; returning empty session data");
            return emptySession("ChampSelect", "CHAMP_SELECT_EMPTY");
        }

        List<ChampionSelectSession.Player> myTeam = selectSession.getMyTeam();
        List<ChampionSelectSession.Player> theirTeam = selectSession.getTheirTeam();
        if (!hasAnyChampSelectPlayer(myTeam, theirTeam)) {
            return emptySession("ChampSelect", "CHAMP_SELECT_EMPTY");
        }
        log.info("ChampSelect 直接模式: myTeam={}, theirTeam={}",
                myTeam != null ? myTeam.size() : 0,
                theirTeam != null ? theirTeam.size() : 0);

        Integer queueId = resolveQueueIdFromGameSession();
        int currentQueueId = resolveCurrentQueueId(queueId);
        log.info("Scout current queue resolved: phase=ChampSelect, queueId={}, source=GAME_SESSION", currentQueueId);
        String typeCn = "未知模式";
        String queueType = "";
        if (currentQueueId > 0) {
            typeCn = GameConstants.getQueueCnName(currentQueueId);
        }

        List<SessionSummoner> teamOne = buildTeamFromChampSelectPlayers(myTeam, currentQueueId);
        List<SessionSummoner> teamTwo = buildTeamFromChampSelectPlayers(theirTeam, currentQueueId);

        ensureMyTeamIsFirst(teamOne, teamTwo, mySummoner.getPuuid());

        addPreGroupMarkers(teamOne, teamTwo, currentQueueId);
        insertMeetGamersRecord(teamOne, teamTwo, mySummoner.getPuuid());
        rememberSessionPuuids(teamOne, teamTwo);
        long now = System.currentTimeMillis();

        return SessionData.builder()
                .phase("ChampSelect")
                .sessionKey(buildChampSelectSessionKey(selectSession, currentQueueId, mySummoner.getPuuid()))
                .gameId(selectSession.getGameId())
                .empty(false)
                .stale(false)
                .source("CHAMP_SELECT")
                .createdAt(now)
                .updatedAt(now)
                .queueType(queueType)
                .typeCn(typeCn)
                .queueId(currentQueueId)
                .currentSummoner(mySummoner)
                .teamOne(teamOne)
                .teamTwo(teamTwo)
                .build();
    }

    private Integer resolveQueueIdFromGameSession() {
        try {
            GameSession session = gameFlowService.getGameSession();
            if (session != null && session.getGameData() != null && session.getGameData().getQueue() != null) {
                return session.getGameData().getQueue().getId();
            }
        } catch (Exception e) {
            log.debug("从 GameSession 获取 queueId 失败: {}", e.getMessage());
        }
        return null;
    }

    private List<SessionSummoner> buildTeamFromChampSelectPlayers(List<ChampionSelectSession.Player> players, int currentQueueId) {
        if (players == null || players.isEmpty()) {
            return List.of();
        }

        List<String> teamPuuids = collectChampSelectTeamPuuids(players);
        List<CompletableFuture<SessionSummoner>> futures = players.stream()
                .map(p -> CompletableFuture.supplyAsync(
                        () -> processChampSelectPlayer(p, currentQueueId, teamPuuids),
                        dataLoaderExecutor))
                .toList();

        return futures.stream()
                .map(CompletableFuture::join)
                .toList();
    }

    private List<String> collectChampSelectTeamPuuids(List<ChampionSelectSession.Player> players) {
        if (players == null || players.isEmpty()) {
            return List.of();
        }
        return players.stream()
                .filter(Objects::nonNull)
                .map(ChampionSelectSession.Player::getPuuid)
                .filter(this::hasText)
                .toList();
    }

    private SessionSummoner processChampSelectPlayer(ChampionSelectSession.Player player,
                                                     int currentQueueId,
                                                     List<String> teamPuuids) {
        String puuid = player.getPuuid();
        Integer championId = player.getChampionId() != null ? player.getChampionId() : 0;

        if (puuid == null || puuid.isEmpty()) {
            log.debug("ChampSelect 玩家 puuid 为空, cellId={}", player.getCellId());
            return buildEmptySessionSummoner(championId);
        }

        try {
            Summoner summoner = safeGetSummoner(puuid);
            Rank rank = safeGetRank(puuid);
            ScoutTagSample sample = safeGetScoutSample(puuid, currentQueueId);
            String position = currentPosition(player);
            UserTag userTag = buildScoutUserTag(puuid, currentQueueId, championId, position, teamPuuids, sample);
            List<MatchHistory> history = sample != null ? sample.getCurrentModeMatches() : List.of();

            return SessionSummoner.builder()
                    .championId(championId)
                    .championKey(championId > 0 ? "champion_" + championId : "")
                    .selectedPosition(player.getSelectedPosition())
                    .assignedPosition(player.getAssignedPosition())
                    .teamPosition(player.getTeamPosition())
                    .individualPosition(player.getIndividualPosition())
                    .position(position)
                    .summoner(summoner != null ? summoner : new Summoner())
                    .matchHistory(history != null ? history : List.of())
                    .userTag(userTag != null ? userTag : UserTag.builder().build())
                    .rank(rank != null ? rank : new Rank())
                    .meetGames(List.of())
                    .preGroupMarkers(PreGroupMarker.empty())
                    .isLoading(false)
                    .build();
        } catch (Exception e) {
            log.warn("获取 ChampSelect 玩家信息失败: puuid={}, error={}", puuid, e.getMessage());
            return buildEmptySessionSummoner(championId);
        }
    }

    private void ensureMyTeamIsFirst(List<SessionSummoner> teamOne, List<SessionSummoner> teamTwo, String myPuuid) {
        if (myPuuid == null || teamOne == null) {
            return;
        }

        boolean iAmInTeamOne = teamOne.stream()
                .anyMatch(s -> s.getSummoner() != null && myPuuid.equals(s.getSummoner().getPuuid()));

        if (!iAmInTeamOne && teamTwo != null && !teamTwo.isEmpty()) {
            List<SessionSummoner> temp = new ArrayList<>(teamOne);
            teamOne.clear();
            teamOne.addAll(teamTwo);
            teamTwo.clear();
            teamTwo.addAll(temp);
        }
    }

    private SessionData processGamePhase(String phase, Summoner mySummoner, Integer mode) {
        GameSession session = gameFlowService.getGameSession();
        if (session == null || session.getGameData() == null) {
            if ("GameStart".equals(phase)) {
                log.info("GameStart 阶段，session 数据不完整");
                return emptySession(phase, "GAMESTART_TRANSIENT_EMPTY");
            }
            log.warn("阶段 {} 但 session 数据为空", phase);
            return emptySession(phase, emptyGameSessionSource(phase));
        }

        if (!hasAnyGamePlayer(session)) {
            return emptySession(phase, emptyGameSessionSource(phase));
        }

        log.info("GamePhase: phase={}, teamOne={}, teamTwo={}, selections={}",
                phase,
                session.getGameData().getTeamOne() != null ? session.getGameData().getTeamOne().size() : 0,
                session.getGameData().getTeamTwo() != null ? session.getGameData().getTeamTwo().size() : 0,
                session.getGameData().getPlayerChampionSelections() != null ? session.getGameData().getPlayerChampionSelections().size() : 0);

        if (isTeamDataIncomplete(session)) {
            supplementFromChampSelect(session);
        }

        ensureMyTeamIsTeamOne(session, mySummoner);
        fillMissingPlayers(session);
        log.info("处理后: teamOne={}, teamTwo={}",
                session.getGameData().getTeamOne() != null ? session.getGameData().getTeamOne().size() : 0,
                session.getGameData().getTeamTwo() != null ? session.getGameData().getTeamTwo().size() : 0);

        Integer queueId = 0;
        String queueType = "";
        String typeCn = "未知模式";

        if (session.getGameData().getQueue() != null) {
            queueId = session.getGameData().getQueue().getId();
            queueType = session.getGameData().getQueue().getType();

            typeCn = GameConstants.getQueueTypeCnName(queueType);
            if ("其他".equals(typeCn) && queueId > 0) {
                typeCn = GameConstants.getQueueCnName(queueId);
            }
        }

        int currentQueueId = resolveCurrentQueueId(queueId);
        log.info("Scout current queue resolved: phase={}, queueId={}, source=GAME_SESSION", phase, currentQueueId);
        List<SessionSummoner> teamOne = processTeam(session.getGameData().getTeamOne(), currentQueueId);
        List<SessionSummoner> teamTwo = processTeam(session.getGameData().getTeamTwo(), currentQueueId);

        addPreGroupMarkers(teamOne, teamTwo, currentQueueId);
        insertMeetGamersRecord(teamOne, teamTwo, mySummoner.getPuuid());
        rememberSessionPuuids(teamOne, teamTwo);
        long now = System.currentTimeMillis();

        return SessionData.builder()
                .phase(phase)
                .sessionKey(buildGameSessionKey(phase, session, currentQueueId, mySummoner.getPuuid()))
                .gameId(session.getGameData().getGameId())
                .empty(false)
                .stale(false)
                .source("GAME_SESSION")
                .createdAt(now)
                .updatedAt(now)
                .queueType(queueType)
                .typeCn(typeCn)
                .queueId(currentQueueId)
                .currentSummoner(mySummoner)
                .teamOne(teamOne)
                .teamTwo(teamTwo)
                .build();
    }

    /**
     * 处理大厅阶段数据
     * 从 Lobby API 获取队列信息和队友列表
     */
    private SessionData processLobbyPhase(String phase, Summoner mySummoner, Integer mode) {
        try {
            Lobby lobby = gameFlowService.getLobby();
            if (lobby == null) {
                return emptySession(phase, "LOBBY_EMPTY");
            }

            // 获取队列 ID
            Integer queueId = lobby.getQueueId();
            String queueSource = queueId != null ? "LOBBY_QUEUE" : "UNKNOWN";
            if (queueId == null && lobby.getGameConfig() != null) {
                queueId = lobby.getGameConfig().getQueueId();
                queueSource = queueId != null ? "LOBBY_GAME_CONFIG" : "UNKNOWN";
            }
            int currentQueueId = resolveCurrentQueueId(queueId);
            log.info("Scout current queue resolved: phase={}, queueId={}, source={}", phase, currentQueueId, queueSource);

            // 获取队列名称
            String typeCn = "未知模式";
            if (currentQueueId > 0) {
                typeCn = GameConstants.getQueueCnName(currentQueueId);
            }

            // 从 Lobby 成员构建队伍数据
            List<SessionSummoner> teamOne = buildTeamFromLobbyMembers(lobby.getMembers(), currentQueueId);
            long now = System.currentTimeMillis();

            return SessionData.builder()
                .phase(phase)
                .sessionKey(buildLobbySessionKey(phase, lobby, currentQueueId, mySummoner != null ? mySummoner.getPuuid() : null))
                .empty(teamOne.isEmpty())
                .stale(false)
                .source("LOBBY")
                .createdAt(now)
                .updatedAt(now)
                .queueType("")
                .typeCn(typeCn)
                .queueId(currentQueueId)
                .currentSummoner(mySummoner)
                .teamOne(teamOne)
                .teamTwo(List.of())
                .build();
        } catch (Exception e) {
            log.warn("获取大厅数据失败: {}", e.getMessage());
            return emptySession(phase, "LOBBY_ERROR");
        }
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private SessionData emptySession(String phase, String source) {
        long now = System.currentTimeMillis();
        return SessionData.builder()
                .phase(hasText(phase) ? phase : "None")
                .sessionKey(null)
                .gameId(null)
                .empty(true)
                .stale(false)
                .source(source)
                .createdAt(now)
                .updatedAt(now)
                .queueType("")
                .typeCn("")
                .queueId(0)
                .teamOne(List.of())
                .teamTwo(List.of())
                .build();
    }

    private String emptyGameSessionSource(String phase) {
        return "GameStart".equals(phase) ? "GAMESTART_TRANSIENT_EMPTY" : "GAME_SESSION_EMPTY";
    }

    private boolean hasAnyChampSelectPlayer(List<ChampionSelectSession.Player> myTeam,
                                            List<ChampionSelectSession.Player> theirTeam) {
        return hasAnyChampSelectPlayer(myTeam) || hasAnyChampSelectPlayer(theirTeam);
    }

    private boolean hasAnyChampSelectPlayer(List<ChampionSelectSession.Player> players) {
        return players != null && players.stream().anyMatch(Objects::nonNull);
    }

    private boolean hasAnyGamePlayer(GameSession session) {
        if (session == null || session.getGameData() == null) {
            return false;
        }
        GameSession.GameData gameData = session.getGameData();
        return hasAnyGamePlayer(gameData.getTeamOne())
                || hasAnyGamePlayer(gameData.getTeamTwo())
                || hasAnyChampionSelection(gameData.getPlayerChampionSelections());
    }

    private boolean hasAnyGamePlayer(List<GameSession.OnePlayer> players) {
        return players != null && players.stream().anyMatch(Objects::nonNull);
    }

    private boolean hasAnyChampionSelection(List<GameSession.PlayerChampionSelection> selections) {
        return selections != null && selections.stream().anyMatch(Objects::nonNull);
    }

    private String buildChampSelectSessionKey(ChampionSelectSession session, int queueId, String myPuuid) {
        return String.join("|",
                "phase:ChampSelect",
                "game:" + keyPart(session != null ? session.getGameId() : null),
                "queue:" + queueId,
                "me:" + keyPart(myPuuid),
                "ally:" + champSelectFingerprints(session != null ? session.getMyTeam() : null),
                "enemy:" + champSelectFingerprints(session != null ? session.getTheirTeam() : null)
        );
    }

    private String buildGameSessionKey(String phase, GameSession session, int queueId, String myPuuid) {
        GameSession.GameData gameData = session != null ? session.getGameData() : null;
        return String.join("|",
                "phase:" + keyPart(phase),
                "game:" + keyPart(gameData != null ? gameData.getGameId() : null),
                "queue:" + queueId,
                "me:" + keyPart(myPuuid),
                "ally:" + gamePlayerFingerprints(gameData != null ? gameData.getTeamOne() : null),
                "enemy:" + gamePlayerFingerprints(gameData != null ? gameData.getTeamTwo() : null),
                "selections:" + championSelectionFingerprints(gameData != null ? gameData.getPlayerChampionSelections() : null)
        );
    }

    private String buildLobbySessionKey(String phase, Lobby lobby, int queueId, String myPuuid) {
        return String.join("|",
                "phase:" + keyPart(phase),
                "lobby:" + keyPart(lobby != null ? lobby.getLobbyId() : null),
                "queue:" + queueId,
                "me:" + keyPart(myPuuid),
                "members:" + lobbyMemberFingerprints(lobby != null ? lobby.getMembers() : null)
        );
    }

    private List<String> champSelectFingerprints(List<ChampionSelectSession.Player> players) {
        if (players == null || players.isEmpty()) {
            return List.of();
        }
        return players.stream()
                .filter(Objects::nonNull)
                .map(player -> "puuid:" + keyPart(player.getPuuid())
                        + "|summoner:" + keyPart(player.getSummonerId())
                        + "|cell:" + keyPart(player.getCellId())
                        + "|champion:" + keyPart(player.getChampionId()))
                .sorted()
                .toList();
    }

    private List<String> gamePlayerFingerprints(List<GameSession.OnePlayer> players) {
        if (players == null || players.isEmpty()) {
            return List.of();
        }
        return players.stream()
                .filter(Objects::nonNull)
                .map(player -> "puuid:" + keyPart(player.getPuuid())
                        + "|champion:" + keyPart(player.getChampionId()))
                .sorted()
                .toList();
    }

    private List<String> lobbyMemberFingerprints(List<Lobby.Member> members) {
        if (members == null || members.isEmpty()) {
            return List.of();
        }
        return members.stream()
                .filter(Objects::nonNull)
                .map(member -> "puuid:" + keyPart(member.getPuuid())
                        + "|summoner:" + keyPart(member.getSummonerId())
                        + "|team:" + keyPart(member.getTeamId()))
                .sorted()
                .toList();
    }

    private List<String> championSelectionFingerprints(List<GameSession.PlayerChampionSelection> selections) {
        if (selections == null || selections.isEmpty()) {
            return List.of();
        }
        return selections.stream()
                .filter(Objects::nonNull)
                .map(selection -> "puuid:" + keyPart(selection.getPuuid())
                        + "|champion:" + keyPart(selection.getChampionId()))
                .sorted()
                .toList();
    }

    private String keyPart(Object value) {
        if (value == null) {
            return "";
        }
        return String.valueOf(value).trim();
    }

    /**
     * 从 Lobby 成员构建队伍数据
     */
    private List<SessionSummoner> buildTeamFromLobbyMembers(List<Lobby.Member> members, int currentQueueId) {
        if (members == null || members.isEmpty()) {
            return List.of();
        }

        List<String> teamPuuids = collectLobbyTeamPuuids(members);
        List<CompletableFuture<SessionSummoner>> futures = members.stream()
            .map(member -> CompletableFuture.supplyAsync(
                () -> processLobbyMember(member, currentQueueId, teamPuuids),
                dataLoaderExecutor))
            .toList();

        return futures.stream()
            .map(CompletableFuture::join)
            .filter(Objects::nonNull)
            .toList();
    }

    private List<String> collectLobbyTeamPuuids(List<Lobby.Member> members) {
        if (members == null || members.isEmpty()) {
            return List.of();
        }
        return members.stream()
                .filter(Objects::nonNull)
                .map(Lobby.Member::getPuuid)
                .filter(this::hasText)
                .toList();
    }

    /**
     * 处理单个 Lobby 成员
     */
    private SessionSummoner processLobbyMember(Lobby.Member member, int currentQueueId, List<String> teamPuuids) {
        String puuid = member.getPuuid();
        if (puuid == null || puuid.isEmpty()) {
            return null;
        }

        try {
            Summoner summoner = safeGetSummoner(puuid);
            Rank rank = safeGetRank(puuid);
            ScoutTagSample sample = safeGetScoutSample(puuid, currentQueueId);
            String position = member.getPosition();
            UserTag userTag = buildScoutUserTag(puuid, currentQueueId, 0, position, teamPuuids, sample);
            List<MatchHistory> history = sample != null ? sample.getCurrentModeMatches() : List.of();

            return SessionSummoner.builder()
                .championId(0)
                .championKey("")
                .selectedPosition(position)
                .position(position)
                .summoner(summoner != null ? summoner : new Summoner())
                .matchHistory(history != null ? history : List.of())
                .userTag(userTag != null ? userTag : UserTag.builder().build())
                .rank(rank != null ? rank : new Rank())
                .meetGames(List.of())
                .preGroupMarkers(PreGroupMarker.empty())
                .isLoading(false)
                .build();
        } catch (Exception e) {
            log.warn("获取大厅成员信息失败: puuid={}, error={}", puuid, e.getMessage());
            return null;
        }
    }

    private boolean isTeamDataIncomplete(GameSession session) {
        int teamOneSize = session.getGameData().getTeamOne() != null ? session.getGameData().getTeamOne().size() : 0;
        int teamTwoSize = session.getGameData().getTeamTwo() != null ? session.getGameData().getTeamTwo().size() : 0;
        return teamOneSize < 5 || teamTwoSize < 5;
    }

    private void supplementFromChampSelect(GameSession session) {
        try {
            ChampionSelectSession selectSession = championSelectService.getChampionSelectSession();
            if (selectSession == null) {
                return;
            }

            int teamOneSize = session.getGameData().getTeamOne() != null ? session.getGameData().getTeamOne().size() : 0;
            int teamTwoSize = session.getGameData().getTeamTwo() != null ? session.getGameData().getTeamTwo().size() : 0;

            if (teamOneSize < 5 && selectSession.getMyTeam() != null) {
                session.getGameData().setTeamOne(
                        selectSession.getMyTeam().stream()
                                .map(p -> {
                                    GameSession.OnePlayer player = new GameSession.OnePlayer();
                                    player.setChampionId(p.getChampionId());
                                    player.setPuuid(p.getPuuid());
                                    player.setSelectedPosition(p.getSelectedPosition());
                                    player.setAssignedPosition(p.getAssignedPosition());
                                    player.setTeamPosition(p.getTeamPosition());
                                    player.setIndividualPosition(p.getIndividualPosition());
                                    return player;
                                })
                                .toList());
                log.info("从 ChampSelect 会话补充 teamOne 数据: {}", selectSession.getMyTeam().size());
            }

            if (teamTwoSize < 5 && selectSession.getTheirTeam() != null) {
                session.getGameData().setTeamTwo(
                        selectSession.getTheirTeam().stream()
                                .map(p -> {
                                    GameSession.OnePlayer player = new GameSession.OnePlayer();
                                    player.setChampionId(p.getChampionId());
                                    player.setPuuid(p.getPuuid());
                                    player.setSelectedPosition(p.getSelectedPosition());
                                    player.setAssignedPosition(p.getAssignedPosition());
                                    player.setTeamPosition(p.getTeamPosition());
                                    player.setIndividualPosition(p.getIndividualPosition());
                                    return player;
                                })
                                .toList());
                log.info("从 ChampSelect 会话补充 teamTwo 数据: {}", selectSession.getTheirTeam().size());
            }
        } catch (Exception e) {
            log.warn("从 ChampSelect 会话补充数据失败: {}", e.getMessage());
        }
    }

    /**
     * 确保我方在 teamOne
     */
    private void ensureMyTeamIsTeamOne(GameSession session, Summoner mySummoner) {
        String myPuuid = mySummoner.getPuuid();
        if (myPuuid == null) {
            return;
        }

        List<GameSession.OnePlayer> teamOne = session.getGameData().getTeamOne();
        List<GameSession.OnePlayer> teamTwo = session.getGameData().getTeamTwo();

        if (teamOne == null || teamOne.isEmpty()) {
            return;
        }

        boolean iAmInTeamOne = teamOne.stream()
                .anyMatch(p -> myPuuid.equals(p.getPuuid()));

        if (!iAmInTeamOne && teamTwo != null && !teamTwo.isEmpty()) {
            session.getGameData().setTeamOne(teamTwo);
            session.getGameData().setTeamTwo(teamOne);
        }
    }

    /**
     * 补全缺失的玩家信息
     * 当 gameData.teamOne/teamTwo 不完整时，从 playerChampionSelections 补全
     */
    private void fillMissingPlayers(GameSession session) {
        List<GameSession.PlayerChampionSelection> selections = session.getGameData().getPlayerChampionSelections();
        if (selections == null || selections.isEmpty()) {
            return;
        }

        int teamOneSize = session.getGameData().getTeamOne() != null ? session.getGameData().getTeamOne().size() : 0;
        int teamTwoSize = session.getGameData().getTeamTwo() != null ? session.getGameData().getTeamTwo().size() : 0;

        if (teamOneSize >= 5 && teamTwoSize >= 5) {
            return;
        }

        int halfSize = selections.size() / 2;
        if (halfSize == 0) {
            return;
        }

        boolean useSecondHalf = shouldUseSecondHalfForTeamOne(session, selections);

        List<GameSession.PlayerChampionSelection> teamOneSelections = useSecondHalf
                ? selections.subList(halfSize, selections.size())
                : selections.subList(0, halfSize);
        List<GameSession.PlayerChampionSelection> teamTwoSelections = useSecondHalf
                ? selections.subList(0, halfSize)
                : selections.subList(halfSize, selections.size());

        if (teamOneSize < 5) {
            session.getGameData().setTeamOne(buildPlayersFromSelections(teamOneSelections));
        }
        if (teamTwoSize < 5) {
            session.getGameData().setTeamTwo(buildPlayersFromSelections(teamTwoSelections));
        }
    }

    /**
     * 判断是否应该使用 selections 的后半部分填充 teamOne
     */
    private boolean shouldUseSecondHalfForTeamOne(GameSession session,
            List<GameSession.PlayerChampionSelection> selections) {
        List<GameSession.OnePlayer> teamOne = session.getGameData().getTeamOne();
        if (teamOne == null || teamOne.isEmpty()) {
            return false;
        }

        Set<String> teamOnePuuids = teamOne.stream()
                .map(GameSession.OnePlayer::getPuuid)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        if (teamOnePuuids.isEmpty()) {
            return false;
        }

        int halfSize = selections.size() / 2;

        long firstHalfMatch = selections.subList(0, halfSize).stream()
                .filter(s -> s.getPuuid() != null && teamOnePuuids.contains(s.getPuuid()))
                .count();

        long secondHalfMatch = selections.subList(halfSize, selections.size()).stream()
                .filter(s -> s.getPuuid() != null && teamOnePuuids.contains(s.getPuuid()))
                .count();

        return secondHalfMatch > firstHalfMatch;
    }

    /**
     * 从 selections 构建玩家列表
     */
    private List<GameSession.OnePlayer> buildPlayersFromSelections(
            List<GameSession.PlayerChampionSelection> selections) {
        return selections.stream()
                .map(s -> {
                    GameSession.OnePlayer p = new GameSession.OnePlayer();
                    p.setChampionId(s.getChampionId());
                    p.setPuuid(s.getPuuid());
                    p.setSelectedPosition("");
                    return p;
                })
                .toList();
    }

    /**
     * 处理队伍数据（使用指定线程池并行处理）
     */
    private List<SessionSummoner> processTeam(List<GameSession.OnePlayer> team, int currentQueueId) {
        if (team == null || team.isEmpty()) {
            return List.of();
        }

        List<String> teamPuuids = collectGameTeamPuuids(team);
        List<CompletableFuture<SessionSummoner>> futures = team.stream()
                .map(player -> CompletableFuture.supplyAsync(
                        () -> processPlayer(player, currentQueueId, teamPuuids),
                        dataLoaderExecutor))
                .toList();

        return futures.stream()
                .map(CompletableFuture::join)
                .toList();
    }

    private List<String> collectGameTeamPuuids(List<GameSession.OnePlayer> team) {
        if (team == null || team.isEmpty()) {
            return List.of();
        }
        return team.stream()
                .filter(Objects::nonNull)
                .map(GameSession.OnePlayer::getPuuid)
                .filter(this::hasText)
                .toList();
    }

    /**
     * 处理单个玩家数据（串行获取各数据，避免嵌套并行）
     */
    private SessionSummoner processPlayer(GameSession.OnePlayer player, int currentQueueId, List<String> teamPuuids) {
        String puuid = player.getPuuid();
        Integer championId = player.getChampionId();

        if (puuid == null || puuid.isEmpty()) {
            return buildEmptySessionSummoner(championId);
        }

        try {
            // 串行获取数据（外层已并行处理10个玩家，此处无需再嵌套并行）
            Summoner summoner = safeGetSummoner(puuid);
            Rank rank = safeGetRank(puuid);
            ScoutTagSample sample = safeGetScoutSample(puuid, currentQueueId);
            String position = currentPosition(player);
            UserTag userTag = buildScoutUserTag(
                    puuid,
                    currentQueueId,
                    championId,
                    position,
                    teamPuuids,
                    sample
            );
            List<MatchHistory> history = sample != null ? sample.getCurrentModeMatches() : List.of();

            return SessionSummoner.builder()
                    .championId(championId)
                    .championKey("champion_" + championId)
                    .selectedPosition(player.getSelectedPosition())
                    .assignedPosition(player.getAssignedPosition())
                    .teamPosition(player.getTeamPosition())
                    .individualPosition(player.getIndividualPosition())
                    .position(position)
                    .summoner(summoner != null ? summoner : new Summoner())
                    .matchHistory(history != null ? history : List.of())
                    .userTag(userTag != null ? userTag : UserTag.builder().build())
                    .rank(rank != null ? rank : new Rank())
                    .meetGames(List.of())
                    .preGroupMarkers(PreGroupMarker.empty())
                    .isLoading(false)
                    .build();

        } catch (Exception e) {
            log.warn("获取玩家信息失败：puuid={}, championId={}, error={}", puuid, championId, e.getMessage());
            return buildEmptySessionSummoner(championId);
        }
    }

    // ========== 安全获取数据方法 ==========

    private Summoner safeGetSummoner(String puuid) {
        try {
            return summonerService.getSummonerByPuuid(puuid);
        } catch (Exception e) {
            log.warn("获取召唤师信息失败：puuid={}, error={}", puuid, e.getMessage());
            return null;
        }
    }

    private Rank safeGetRank(String puuid) {
        try {
            return rankService.getRankByPuuid(puuid);
        } catch (Exception e) {
            log.warn("获取段位信息失败：puuid={}, error={}", puuid, e.getMessage());
            return null;
        }
    }

    private ScoutTagSample safeGetScoutSample(String puuid, int currentQueueId) {
        try {
            return scoutTagSampleService.getCurrentModeSample(puuid, currentQueueId, SCOUT_LOOKBACK_LIMIT, SCOUT_SAMPLE_LIMIT);
        } catch (Exception e) {
            log.warn("获取对战信息页 scout 样本失败：puuid={}, error={}", puuid, e.getMessage());
            return ScoutTagSample.builder()
                    .puuid(puuid)
                    .currentQueueId(currentQueueId)
                    .lookbackMatches(List.of())
                    .currentModeMatches(List.of())
                    .source("EMPTY")
                    .build();
        }
    }

    private UserTag buildScoutUserTag(String puuid,
                                      int currentQueueId,
                                      Integer championId,
                                      String currentPosition,
                                      List<String> teamPuuids,
                                      ScoutTagSample sample) {
        ScoutTagSample safeSample = sample != null ? sample : ScoutTagSample.builder()
                .puuid(puuid)
                .currentQueueId(currentQueueId)
                .lookbackMatches(List.of())
                .currentModeMatches(List.of())
                .source("EMPTY")
                .build();
        ScoutTagContext context = ScoutTagContext.builder()
                .puuid(puuid)
                .currentQueueId(currentQueueId)
                .currentChampionId(championId)
                .currentPosition(currentPosition)
                .currentTeamPuuids(teamPuuids != null ? teamPuuids : List.of())
                .build();
        List<RankTag> tags;
        try {
            tags = scoutTagRuleService.buildTags(context, safeSample);
        } catch (Exception e) {
            log.warn("生成对战信息页 scout 标签失败：puuid={}, error={}", puuid, e.getMessage());
            tags = List.of();
        }

        return UserTag.builder()
                .recordStatus(resolveScoutRecordStatus(safeSample))
                .recentData(calculateScoutRecentData(puuid, currentQueueId, safeSample.getCurrentModeMatches()))
                .championRecentData(calculateScoutChampionRecentData(
                        puuid,
                        currentQueueId,
                        championId,
                        safeSample.getLookbackMatches()
                ))
                .tag(tags)
                .build();
    }

    private RecordStatus resolveScoutRecordStatus(ScoutTagSample sample) {
        if (sample == null || "EMPTY".equals(sample.getSource())) {
            return RecordStatus.ERROR;
        }
        if (sample.getLookbackMatches() == null || sample.getLookbackMatches().isEmpty()) {
            return RecordStatus.EMPTY;
        }
        return RecordStatus.NORMAL;
    }

    private RecentData calculateScoutRecentData(String puuid, int currentQueueId, List<MatchHistory> matches) {
        int count = 0;
        int wins = 0;
        int losses = 0;
        double kills = 0;
        double deaths = 0;
        double assists = 0;
        double totalGroupRate = 0;
        double totalGoldRate = 0;
        double totalDamageRate = 0;
        int conversionMetricCount = 0;
        int goldRateCount = 0;
        int damageRateCount = 0;
        long totalGold = 0;
        long totalDamage = 0;

        for (MatchHistory match : matches != null ? matches : List.<MatchHistory>of()) {
            MatchHistory.Participant participant = findParticipant(match, puuid);
            if (participant == null || participant.getStats() == null) {
                continue;
            }
            MatchHistory.Stats stats = participant.getStats();
            count++;
            kills += intValue(stats.getKills());
            deaths += intValue(stats.getDeaths());
            assists += intValue(stats.getAssists());
            totalGroupRate += calculateKillParticipationRate(match, participant);
            if (isPositive(stats.getGoldEarned()) && isPositive(stats.getTotalDamageDealtToChampions())) {
                conversionMetricCount++;
                totalGold += stats.getGoldEarned();
                totalDamage += stats.getTotalDamageDealtToChampions();
            }
            Double goldRate = calculateGoldShareRate(match, participant);
            if (goldRate != null) {
                goldRateCount++;
                totalGoldRate += goldRate;
            }
            Double damageRate = calculateDamageShareRate(match, participant);
            if (damageRate != null) {
                damageRateCount++;
                totalDamageRate += damageRate;
            }
            if (Boolean.TRUE.equals(stats.getWin())) {
                wins++;
            } else {
                losses++;
            }
        }

        double kda = deaths > 0 ? (kills + assists) / deaths : kills + assists;
        return RecentData.builder()
                .kda(count > 0 ? round1(kda) : null)
                .kills(count > 0 ? round1(kills / count) : null)
                .deaths(count > 0 ? round1(deaths / count) : null)
                .assists(count > 0 ? round1(assists / count) : null)
                .selectMode(currentQueueId)
                .selectModeCn(currentQueueId == 0 ? "全部模式" : GameConstants.getQueueCnName(currentQueueId))
                .selectWins(wins)
                .selectLosses(losses)
                .groupRate(count > 0 ? (int) Math.round(totalGroupRate / count) : null)
                .averageGold(conversionMetricCount > 0 ? (int) (totalGold / conversionMetricCount) : null)
                .goldRate(goldRateCount > 0 ? (int) Math.round(totalGoldRate / goldRateCount) : null)
                .averageDamageDealtToChampions(conversionMetricCount > 0 ? (int) (totalDamage / conversionMetricCount) : null)
                .damageDealtToChampionsRate(damageRateCount > 0 ? (int) Math.round(totalDamageRate / damageRateCount) : null)
                .oneGamePlayersMap(Map.of())
                .build();
    }

    private RecentData calculateScoutChampionRecentData(
            String puuid,
            int currentQueueId,
            Integer championId,
            List<MatchHistory> lookbackMatches
    ) {
        if (championId == null || championId <= 0 || lookbackMatches == null || lookbackMatches.isEmpty()) {
            return null;
        }

        List<MatchHistory> championMatches = new ArrayList<>();
        for (MatchHistory match : lookbackMatches) {
            if (!matchesCurrentQueue(match, currentQueueId)) {
                continue;
            }
            MatchHistory.Participant participant = findParticipant(match, puuid);
            if (participant != null && championId.equals(participant.getChampionId())) {
                championMatches.add(match);
            }
        }

        return championMatches.isEmpty()
                ? null
                : calculateScoutRecentData(puuid, currentQueueId, championMatches);
    }

    private boolean matchesCurrentQueue(MatchHistory match, int currentQueueId) {
        if (match == null) {
            return false;
        }
        return currentQueueId <= 0 || (match.getQueueId() != null && match.getQueueId() == currentQueueId);
    }

    private MatchHistory.Participant findParticipant(MatchHistory match, String puuid) {
        if (match == null || match.getParticipants() == null || match.getParticipants().isEmpty()) {
            return null;
        }
        Integer participantId = findParticipantId(match, puuid);
        if (participantId != null) {
            for (MatchHistory.Participant participant : match.getParticipants()) {
                if (participantId.equals(participant.getParticipantId())) {
                    return participant;
                }
            }
        }
        return match.getParticipants().size() == 1 ? match.getParticipants().getFirst() : null;
    }

    private double calculateKillParticipationRate(MatchHistory match, MatchHistory.Participant participant) {
        if (match.getParticipants() == null || participant.getStats() == null) {
            return 0;
        }

        int teamKills = 0;
        for (MatchHistory.Participant teammate : match.getParticipants()) {
            if (participant.getTeamId() != null
                    && participant.getTeamId().equals(teammate.getTeamId())
                    && teammate.getStats() != null) {
                teamKills += intValue(teammate.getStats().getKills());
            }
        }

        if (teamKills <= 0) {
            return 0;
        }

        double impact = intValue(participant.getStats().getKills()) + intValue(participant.getStats().getAssists());
        return impact * 100.0 / teamKills;
    }

    private Double calculateGoldShareRate(MatchHistory match, MatchHistory.Participant participant) {
        return calculateTeamRate(match, participant, MatchMetric.GOLD);
    }

    private Double calculateDamageShareRate(MatchHistory match, MatchHistory.Participant participant) {
        return calculateTeamRate(match, participant, MatchMetric.DAMAGE);
    }

    private Double calculateTeamRate(MatchHistory match, MatchHistory.Participant participant, MatchMetric metric) {
        if (match.getParticipants() == null || participant.getStats() == null) {
            return null;
        }

        Integer participantValue = metric == MatchMetric.GOLD
                ? participant.getStats().getGoldEarned()
                : participant.getStats().getTotalDamageDealtToChampions();
        if (!isPositive(participantValue)) {
            return null;
        }

        long teamTotal = 0;
        for (MatchHistory.Participant teammate : match.getParticipants()) {
            if (participant.getTeamId() != null
                    && participant.getTeamId().equals(teammate.getTeamId())
                    && teammate.getStats() != null) {
                Integer teammateValue = metric == MatchMetric.GOLD
                        ? intValue(teammate.getStats().getGoldEarned())
                        : intValue(teammate.getStats().getTotalDamageDealtToChampions());
                if (isPositive(teammateValue)) {
                    teamTotal += teammateValue;
                }
            }
        }

        if (teamTotal <= 0) {
            return null;
        }

        return participantValue * 100.0 / teamTotal;
    }

    private Integer findParticipantId(MatchHistory match, String puuid) {
        if (match.getParticipantIdentities() == null || puuid == null) {
            return null;
        }
        for (MatchHistory.ParticipantIdentity identity : match.getParticipantIdentities()) {
            if (identity != null
                    && identity.getPlayer() != null
                    && puuid.equals(identity.getPlayer().getPuuid())) {
                return identity.getParticipantId();
            }
        }
        return null;
    }

    private int intValue(Integer value) {
        return value == null ? 0 : value;
    }

    private boolean isPositive(Integer value) {
        return value != null && value > 0;
    }

    private double round1(double value) {
        return Math.round(value * 10.0) / 10.0;
    }

    private int resolveCurrentQueueId(Integer currentQueueId) {
        return currentQueueId != null && currentQueueId > 0 ? currentQueueId : 0;
    }

    private String currentPosition(ChampionSelectSession.Player player) {
        if (player == null) {
            return null;
        }
        return firstText(
                player.getSelectedPosition(),
                player.getAssignedPosition(),
                player.getTeamPosition(),
                player.getIndividualPosition()
        );
    }

    private String currentPosition(GameSession.OnePlayer player) {
        if (player == null) {
            return null;
        }
        return firstText(
                player.getSelectedPosition(),
                player.getAssignedPosition(),
                player.getTeamPosition(),
                player.getIndividualPosition()
        );
    }

    private String firstText(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (hasText(value)) {
                return value;
            }
        }
        return null;
    }

    /**
     * 构建空的 SessionSummoner
     */
    private SessionSummoner buildEmptySessionSummoner(Integer championId) {
        return SessionSummoner.builder()
                .championId(championId)
                .championKey(championId != null ? "champion_" + championId : "champion_unknown")
                .summoner(new Summoner())
                .matchHistory(List.of())
                .userTag(UserTag.builder().build())
                .rank(new Rank())
                .meetGames(List.of())
                .preGroupMarkers(PreGroupMarker.empty())
                .isLoading(false)
                .build();
    }

    /**
     * 标记预组队
     */
    private void addPreGroupMarkers(List<SessionSummoner> teamOne, List<SessionSummoner> teamTwo, int currentQueueId) {
        // 安全获取所有有效 puuid
        if (!isRankedPreGroupQueue(currentQueueId)) {
            return;
        }

        // 查找所有可能的预组队
        List<List<String>> allMaybeTeams = new ArrayList<>();
        allMaybeTeams.addAll(findPreGroupsInTeam(teamOne, currentQueueId));
        allMaybeTeams.addAll(findPreGroupsInTeam(teamTwo, currentQueueId));

        // 合并并去重
        List<List<String>> mergedTeams = removeSubsets(allMaybeTeams);

        // 预组队标记
        PreGroupMarker[] markers = createPreGroupMarkers();

        // 建立 puuid -> SessionSummoner 映射
        Map<String, SessionSummoner> puuidToSummoner = new HashMap<>();
        addSummonerMappings(puuidToSummoner, teamOne);
        addSummonerMappings(puuidToSummoner, teamTwo);

        // 应用标记
        int markerIndex = 0;
        for (List<String> team : mergedTeams) {
            if (markerIndex >= markers.length)
                break;

            long markedCount = tryApplyMarker(team, puuidToSummoner, markers[markerIndex]);
            if (markedCount >= PRE_GROUP_MIN_MEMBERS) {
                markerIndex++;
            }
        }
    }

    /**
     * 添加有效的 puuid 到集合
     */
    private void addValidPuuids(Set<String> puuids, List<SessionSummoner> team) {
        if (team == null)
            return;
        team.stream()
                .filter(s -> s != null && s.getSummoner() != null && s.getSummoner().getPuuid() != null)
                .forEach(s -> puuids.add(s.getSummoner().getPuuid()));
    }

    private void rememberSessionPuuids(List<SessionSummoner> teamOne, List<SessionSummoner> teamTwo) {
        Set<String> puuids = new HashSet<>();
        addValidPuuids(puuids, teamOne);
        addValidPuuids(puuids, teamTwo);
        matchHistoryRefreshService.rememberSessionPuuids(puuids);
    }

    /**
     * 在队伍中查找预组队
     */
    private List<List<String>> findPreGroupsInTeam(List<SessionSummoner> team, int currentQueueId) {
        Map<String, Integer> memberOrder = new LinkedHashMap<>();
        if (team == null) {
            return List.of();
        }
        for (SessionSummoner summoner : team) {
            String puuid = sessionSummonerPuuid(summoner);
            if (hasText(puuid) && !memberOrder.containsKey(puuid)) {
                memberOrder.put(puuid, memberOrder.size());
            }
        }
        if (memberOrder.size() < PRE_GROUP_MIN_MEMBERS) {
            return List.of();
        }

        Map<PreGroupPair, PreGroupPairStats> pairStats = collectPreGroupPairStats(team, memberOrder.keySet());
        List<PreGroupPairStats> confirmedPairs = pairStats.values().stream()
                .filter(stats -> stats.sameTeamCount() >= PRE_GROUP_FRIEND_THRESHOLD && stats.oppositeTeamCount() == 0)
                .sorted((left, right) -> {
                    int countCompare = Integer.compare(right.sameTeamCount(), left.sameTeamCount());
                    if (countCompare != 0) {
                        return countCompare;
                    }
                    int leftMin = Math.min(memberOrder.getOrDefault(left.pair.left(), Integer.MAX_VALUE),
                            memberOrder.getOrDefault(left.pair.right(), Integer.MAX_VALUE));
                    int rightMin = Math.min(memberOrder.getOrDefault(right.pair.left(), Integer.MAX_VALUE),
                            memberOrder.getOrDefault(right.pair.right(), Integer.MAX_VALUE));
                    return Integer.compare(leftMin, rightMin);
                })
                .toList();

        if (confirmedPairs.isEmpty()) {
            return List.of();
        }

        return currentQueueId == 420
                ? buildDisjointDuoPreGroups(confirmedPairs, memberOrder)
                : buildConnectedPreGroups(confirmedPairs, memberOrder);
    }

    private boolean isRankedPreGroupQueue(int queueId) {
        return queueId == 420 || queueId == 440;
    }

    private String sessionSummonerPuuid(SessionSummoner summoner) {
        if (summoner == null || summoner.getSummoner() == null) {
            return null;
        }
        return summoner.getSummoner().getPuuid();
    }

    private Map<PreGroupPair, PreGroupPairStats> collectPreGroupPairStats(
            List<SessionSummoner> team,
            Set<String> currentSidePuuids
    ) {
        Map<PreGroupPair, PreGroupPairStats> pairStats = new LinkedHashMap<>();
        if (team == null || currentSidePuuids == null || currentSidePuuids.size() < PRE_GROUP_MIN_MEMBERS) {
            return pairStats;
        }

        for (SessionSummoner summoner : team) {
            String sourcePuuid = sessionSummonerPuuid(summoner);
            if (!hasText(sourcePuuid)) {
                continue;
            }
            List<MatchHistory> history = summoner.getMatchHistory() != null ? summoner.getMatchHistory() : List.of();
            int limit = Math.min(20, history.size());
            for (int index = 0; index < limit; index++) {
                MatchHistory match = history.get(index);
                if (match == null || match.getQueueId() == null || !isRankedPreGroupQueue(match.getQueueId())) {
                    continue;
                }
                MatchHistory.Participant sourceParticipant = findParticipant(match, sourcePuuid);
                if (sourceParticipant == null || sourceParticipant.getTeamId() == null) {
                    continue;
                }
                for (String otherPuuid : currentSidePuuids) {
                    if (sourcePuuid.equals(otherPuuid)) {
                        continue;
                    }
                    MatchHistory.Participant otherParticipant = findParticipant(match, otherPuuid);
                    if (otherParticipant == null || otherParticipant.getTeamId() == null) {
                        continue;
                    }

                    PreGroupPair pair = PreGroupPair.of(sourcePuuid, otherPuuid);
                    PreGroupPairStats stats = pairStats.computeIfAbsent(pair, PreGroupPairStats::new);
                    String gameKey = preGroupGameKey(match, index, sourcePuuid);
                    if (sourceParticipant.getTeamId().equals(otherParticipant.getTeamId())) {
                        stats.addSameTeamGame(gameKey);
                    } else {
                        stats.addOppositeTeamGame(gameKey);
                    }
                }
            }
        }

        return pairStats;
    }

    private String preGroupGameKey(MatchHistory match, int index, String sourcePuuid) {
        if (match != null && match.getGameId() != null) {
            return String.valueOf(match.getGameId());
        }
        return sourcePuuid + ":" + index + ":" + System.identityHashCode(match);
    }

    private List<List<String>> buildDisjointDuoPreGroups(
            List<PreGroupPairStats> confirmedPairs,
            Map<String, Integer> memberOrder
    ) {
        List<List<String>> groups = new ArrayList<>();
        Set<String> used = new HashSet<>();
        for (PreGroupPairStats stats : confirmedPairs) {
            String left = stats.pair.left();
            String right = stats.pair.right();
            if (used.contains(left) || used.contains(right)) {
                continue;
            }
            groups.add(sortPreGroup(List.of(left, right), memberOrder));
            used.add(left);
            used.add(right);
        }
        return groups;
    }

    private List<List<String>> buildConnectedPreGroups(
            List<PreGroupPairStats> confirmedPairs,
            Map<String, Integer> memberOrder
    ) {
        Map<String, Set<String>> graph = new LinkedHashMap<>();
        for (String puuid : memberOrder.keySet()) {
            graph.put(puuid, new LinkedHashSet<>());
        }
        for (PreGroupPairStats stats : confirmedPairs) {
            graph.computeIfAbsent(stats.pair.left(), ignored -> new LinkedHashSet<>()).add(stats.pair.right());
            graph.computeIfAbsent(stats.pair.right(), ignored -> new LinkedHashSet<>()).add(stats.pair.left());
        }

        List<List<String>> groups = new ArrayList<>();
        Set<String> visited = new HashSet<>();
        for (String puuid : memberOrder.keySet()) {
            if (visited.contains(puuid)) {
                continue;
            }
            List<String> component = new ArrayList<>();
            Deque<String> stack = new ArrayDeque<>();
            stack.push(puuid);
            visited.add(puuid);
            while (!stack.isEmpty()) {
                String current = stack.pop();
                component.add(current);
                for (String next : graph.getOrDefault(current, Set.of())) {
                    if (visited.add(next)) {
                        stack.push(next);
                    }
                }
            }
            if (component.size() >= PRE_GROUP_MIN_MEMBERS) {
                groups.add(sortPreGroup(component, memberOrder));
            }
        }

        groups.sort(Comparator.comparingInt(group -> group.stream()
                .mapToInt(puuid -> memberOrder.getOrDefault(puuid, Integer.MAX_VALUE))
                .min()
                .orElse(Integer.MAX_VALUE)));
        return groups;
    }

    private List<String> sortPreGroup(Collection<String> group, Map<String, Integer> memberOrder) {
        return group.stream()
                .sorted(Comparator.comparingInt(puuid -> memberOrder.getOrDefault(puuid, Integer.MAX_VALUE)))
                .toList();
    }

    /**
     * 建立 puuid 到 SessionSummoner 的映射
     */
    private void addSummonerMappings(Map<String, SessionSummoner> map, List<SessionSummoner> team) {
        if (team == null)
            return;
        team.stream()
                .filter(s -> s != null && s.getSummoner() != null && s.getSummoner().getPuuid() != null)
                .forEach(s -> map.put(s.getSummoner().getPuuid(), s));
    }

    /**
     * 创建预组队标记数组
     */
    private PreGroupMarker[] createPreGroupMarkers() {
        return new PreGroupMarker[] {
                PreGroupMarker.builder().name("队伍 1").type("success").build(),
                PreGroupMarker.builder().name("队伍 2").type("warning").build(),
                PreGroupMarker.builder().name("队伍 3").type("error").build(),
                PreGroupMarker.builder().name("队伍 4").type("info").build()
        };
    }

    /**
     * 尝试应用预组队标记，返回标记的玩家数量
     */
    private long tryApplyMarker(List<String> group, Map<String, SessionSummoner> puuidToSummoner,
            PreGroupMarker marker) {
        long markedCount = 0;
        for (String puuid : group) {
            SessionSummoner summoner = puuidToSummoner.get(puuid);
            if (summoner != null && canApplyMarker(summoner)) {
                summoner.setPreGroupMarkers(marker);
                markedCount++;
            }
        }
        return markedCount;
    }

    /**
     * 判断是否可以应用预组队标记
     */
    private boolean canApplyMarker(SessionSummoner summoner) {
        PreGroupMarker currentMarker = summoner.getPreGroupMarkers();
        return currentMarker == null || currentMarker.getName() == null || currentMarker.getName().isEmpty();
    }

    /**
     * 查找预组队成员
     */
    /**
     * 插入遇到过的玩家记录
     */
    private void insertMeetGamersRecord(List<SessionSummoner> teamOne, List<SessionSummoner> teamTwo, String myPuuid) {
        if (myPuuid == null)
            return;

        // 找到自己的记录
        SessionSummoner myRecord = findMyRecord(teamOne, myPuuid);
        if (myRecord == null) {
            return;
        }

        Map<String, List<OneGamePlayer>> myMap = getMeetGamesMap(myRecord);
        if (myMap == null || myMap.isEmpty()) {
            return;
        }

        // 为队友设置遇到记录
        setMeetGamesForTeam(teamOne, myMap, myPuuid);
        setMeetGamesForTeam(teamTwo, myMap, myPuuid);
    }

    /**
     * 查找自己的记录
     */
    private SessionSummoner findMyRecord(List<SessionSummoner> team, String myPuuid) {
        if (team == null)
            return null;
        return team.stream()
                .filter(s -> s != null && s.getSummoner() != null && myPuuid.equals(s.getSummoner().getPuuid()))
                .findFirst()
                .orElse(null);
    }

    /**
     * 获取遇到过的玩家映射
     */
    private Map<String, List<OneGamePlayer>> getMeetGamesMap(SessionSummoner summoner) {
        if (summoner.getUserTag() != null &&
                summoner.getUserTag().getRecentData() != null) {
            return summoner.getUserTag().getRecentData().getOneGamePlayersMap();
        }
        return null;
    }

    /**
     * 为队伍设置遇到记录
     */
    private void setMeetGamesForTeam(List<SessionSummoner> team, Map<String, List<OneGamePlayer>> myMap,
            String myPuuid) {
        if (team == null)
            return;

        for (SessionSummoner s : team) {
            if (s == null || s.getSummoner() == null)
                continue;

            String puuid = s.getSummoner().getPuuid();
            if (puuid == null || puuid.equals(myPuuid))
                continue;

            if (myMap.containsKey(puuid)) {
                s.setMeetGames(myMap.get(puuid));
            }
        }
    }

    /**
     * 去重并保留最大范围的数组
     */
    private List<List<String>> removeSubsets(List<List<String>> arrays) {
        if (arrays == null || arrays.isEmpty()) {
            return List.of();
        }

        // 按大小降序排序
        List<List<String>> sortedArrays = new ArrayList<>(arrays);
        sortedArrays.sort((a, b) -> Integer.compare(b.size(), a.size()));

        List<List<String>> result = new ArrayList<>();
        for (List<String> arr : sortedArrays) {
            if (arr == null || arr.isEmpty())
                continue;

            boolean isSubset = result.stream().anyMatch(resArr -> isSubset(arr, resArr));
            if (!isSubset) {
                result.add(arr);
            }
        }
        return result;
    }

    /**
     * 判断 a 是否是 b 的子集
     */
    private boolean isSubset(List<String> a, List<String> b) {
        if (a == null || b == null || a.size() >= b.size()) {
            return false;
        }
        return new HashSet<>(b).containsAll(a);
    }

    private record PreGroupPair(String left, String right) {
        private static PreGroupPair of(String first, String second) {
            if (first.compareTo(second) <= 0) {
                return new PreGroupPair(first, second);
            }
            return new PreGroupPair(second, first);
        }
    }

    private static final class PreGroupPairStats {
        private final PreGroupPair pair;
        private final Set<String> sameTeamGames = new HashSet<>();
        private final Set<String> oppositeTeamGames = new HashSet<>();

        private PreGroupPairStats(PreGroupPair pair) {
            this.pair = pair;
        }

        private void addSameTeamGame(String gameKey) {
            sameTeamGames.add(gameKey);
        }

        private void addOppositeTeamGame(String gameKey) {
            oppositeTeamGames.add(gameKey);
        }

        private int sameTeamCount() {
            return sameTeamGames.size();
        }

        private int oppositeTeamCount() {
            return oppositeTeamGames.size();
        }
    }

    private enum MatchMetric {
        GOLD,
        DAMAGE
    }
}
