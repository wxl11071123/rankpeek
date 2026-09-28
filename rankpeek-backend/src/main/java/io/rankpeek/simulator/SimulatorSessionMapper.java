package io.rankpeek.simulator;

import io.rankpeek.model.ChampionSelectSession;
import io.rankpeek.model.Lobby;
import io.rankpeek.model.MatchHistory;
import io.rankpeek.model.Rank;
import io.rankpeek.model.RankTag;
import io.rankpeek.model.RecentData;
import io.rankpeek.model.RecordStatus;
import io.rankpeek.model.SessionSummoner;
import io.rankpeek.model.Summoner;
import io.rankpeek.model.UserTag;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.IntStream;

@Service
@ConditionalOnProperty(name = "rankpeek.simulator.enabled", havingValue = "true")
public class SimulatorSessionMapper {

    public SimulatorSessionData toSessionData(SimulatorSnapshot snapshot) {
        Objects.requireNonNull(snapshot, "Simulator snapshot is required");
        SimulatorState state = snapshot.state();
        List<SessionSummoner> teammates = mapSessionSummoners(snapshot.teammates(), snapshot);
        List<SessionSummoner> opponents = mapSessionSummoners(snapshot.opponents(), snapshot);
        List<SessionSummoner> teamOne = visibleTeamOne(state.phase(), teammates);
        List<SessionSummoner> teamTwo = visibleTeamTwo(state.phase(), opponents);

        return new SimulatorSessionData(
                SimulatorState.SOURCE,
                state,
                state.running(),
                state.roundIndex(),
                state.roundId(),
                state.matchId(),
                state.step(),
                state.phase(),
                toSessionPhase(state.phase()),
                snapshot.queueId(),
                snapshot.queueType(),
                snapshot.typeCn(),
                mapSummoner(snapshot.currentSummoner()),
                mapLobby(snapshot.lobby(), state.roundId()),
                teammates,
                opponents,
                teamOne,
                teamTwo,
                mapChampionSelect(snapshot.championSelect(), state.matchId()),
                visibleLoadingScreen(state.phase(), snapshot.loadingScreen()),
                visibleEndOfGame(state.phase(), snapshot.endOfGame()),
                visibleMatchSummary(state.phase(), snapshot.matchSummary())
        );
    }

    private List<SessionSummoner> visibleTeamOne(SimulatorPhase phase, List<SessionSummoner> teammates) {
        return switch (phase) {
            case CHAMP_SELECT, GAME_LOADING, IN_GAME -> teammates;
            default -> List.of();
        };
    }

    private List<SessionSummoner> visibleTeamTwo(SimulatorPhase phase, List<SessionSummoner> opponents) {
        return switch (phase) {
            case GAME_LOADING, IN_GAME -> opponents;
            default -> List.of();
        };
    }

    private SimulatorFixtureModels.LoadingScreenFixture visibleLoadingScreen(
            SimulatorPhase phase,
            SimulatorFixtureModels.LoadingScreenFixture loadingScreen
    ) {
        return phase == SimulatorPhase.GAME_LOADING || phase == SimulatorPhase.IN_GAME ? loadingScreen : null;
    }

    private SimulatorFixtureModels.EndOfGameFixture visibleEndOfGame(
            SimulatorPhase phase,
            SimulatorFixtureModels.EndOfGameFixture endOfGame
    ) {
        return phase == SimulatorPhase.END_OF_GAME ? endOfGame : null;
    }

    private SimulatorFixtureModels.MatchSummaryFixture visibleMatchSummary(
            SimulatorPhase phase,
            SimulatorFixtureModels.MatchSummaryFixture matchSummary
    ) {
        return phase == SimulatorPhase.END_OF_GAME || phase == SimulatorPhase.POST_GAME ? matchSummary : null;
    }

    private String toSessionPhase(SimulatorPhase phase) {
        return switch (phase) {
            case IDLE -> "None";
            case LOBBY -> "Lobby";
            case MATCHMAKING -> "Matchmaking";
            case READY_CHECK -> "ReadyCheck";
            case CHAMP_SELECT -> "ChampSelect";
            case GAME_LOADING -> "GameStart";
            case IN_GAME -> "InProgress";
            case END_OF_GAME -> "EndOfGame";
            case POST_GAME -> "PostGame";
        };
    }

    private List<SessionSummoner> mapSessionSummoners(
            List<SimulatorFixtureModels.PlayerFixture> players,
            SimulatorSnapshot snapshot
    ) {
        if (players == null || players.isEmpty()) {
            return List.of();
        }
        return players.stream()
                .map(player -> mapSessionSummoner(player, snapshot))
                .toList();
    }

    private SessionSummoner mapSessionSummoner(
            SimulatorFixtureModels.PlayerFixture player,
            SimulatorSnapshot snapshot
    ) {
        return SessionSummoner.builder()
                .championId(player.championId())
                .championKey(player.championKey() != null ? player.championKey() : "champion_" + player.championId())
                .summoner(mapSummoner(player))
                .matchHistory(mapRecentMatches(player, snapshot))
                .userTag(mapUserTag(player.userTag()))
                .rank(mapRank(player.rank()))
                .meetGames(List.of())
                .preGroupMarkers(null)
                .isLoading(false)
                .build();
    }

    private Summoner mapSummoner(SimulatorFixtureModels.PlayerFixture player) {
        if (player == null) {
            return null;
        }
        Summoner summoner = new Summoner();
        summoner.setPuuid(player.puuid());
        summoner.setGameName(player.gameName());
        summoner.setTagLine(player.tagLine());
        summoner.setSummonerId(player.summonerId());
        summoner.setProfileIconId(player.profileIconId());
        summoner.setSummonerLevel(300);
        return summoner;
    }

    private Rank mapRank(SimulatorFixtureModels.RankFixture fixture) {
        Rank rank = new Rank();
        Rank.QueueMap queueMap = new Rank.QueueMap();
        Rank.QueueInfo queueInfo = new Rank.QueueInfo();
        if (fixture != null) {
            queueInfo.setQueueType(fixture.queueType());
            queueInfo.setTier(fixture.tier());
            queueInfo.setDivision(fixture.division());
            queueInfo.setLeaguePoints(fixture.leaguePoints());
            queueInfo.setWins(fixture.wins());
            queueInfo.setLosses(fixture.losses());
        }
        queueMap.setRankedSolo5x5(queueInfo);
        rank.setQueueMap(queueMap);
        return rank;
    }

    private UserTag mapUserTag(SimulatorFixtureModels.UserTagFixture fixture) {
        if (fixture == null) {
            return UserTag.builder().recordStatus(RecordStatus.EMPTY).recentData(RecentData.builder().build()).build();
        }
        return UserTag.builder()
                .recordStatus(mapRecordStatus(fixture.recordStatus()))
                .recentData(mapRecentData(fixture.recentData()))
                .tag(mapRankTags(fixture.tags()))
                .build();
    }

    private RecordStatus mapRecordStatus(String status) {
        if (status == null || status.isBlank() || "OK".equalsIgnoreCase(status)) {
            return RecordStatus.NORMAL;
        }
        try {
            return RecordStatus.valueOf(status.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return RecordStatus.NORMAL;
        }
    }

    private RecentData mapRecentData(Map<String, Object> data) {
        return RecentData.builder()
                .selectWins(asInteger(data, "selectWins"))
                .selectLosses(asInteger(data, "selectLosses"))
                .kda(asDouble(data, "kda"))
                .kills(asDouble(data, "kills"))
                .deaths(asDouble(data, "deaths"))
                .assists(asDouble(data, "assists"))
                .averageGold(asInteger(data, "averageGold"))
                .averageDamageDealtToChampions(asInteger(data, "averageDamageDealtToChampions"))
                .build();
    }

    private List<RankTag> mapRankTags(List<String> tags) {
        if (tags == null || tags.isEmpty()) {
            return List.of();
        }
        return tags.stream()
                .filter(tag -> tag != null && !tag.isBlank())
                .map(tag -> RankTag.builder()
                        .good(true)
                        .tagName(tag)
                        .tagDesc("simulator")
                        .build())
                .toList();
    }

    private List<MatchHistory> mapRecentMatches(
            SimulatorFixtureModels.PlayerFixture player,
            SimulatorSnapshot snapshot
    ) {
        if (player.recentMatches() == null || player.recentMatches().isEmpty()) {
            return List.of();
        }
        return player.recentMatches().stream()
                .map(match -> mapRecentMatch(match, player, snapshot))
                .toList();
    }

    private MatchHistory mapRecentMatch(
            SimulatorFixtureModels.RecentMatchFixture fixture,
            SimulatorFixtureModels.PlayerFixture player,
            SimulatorSnapshot snapshot
    ) {
        MatchHistory match = new MatchHistory();
        match.setGameId(pseudoGameId(fixture.matchId()));
        match.setGameMode("CLASSIC");
        match.setGameType("MATCHED_GAME");
        match.setQueueId(fixture.queueId() != null ? fixture.queueId() : snapshot.queueId());
        match.setQueueName(snapshot.typeCn());
        match.setGameCreation(fixture.gameCreation());
        match.setGameDuration(durationSeconds(fixture.gameCreation(), fixture.endedAt()));
        match.setPlatformId("SIM");
        match.setMapId(11);
        match.setRemake(false);
        match.setParticipants(List.of(mapParticipant(fixture, player)));
        match.setParticipantIdentities(List.of(mapParticipantIdentity(player)));
        return match;
    }

    private MatchHistory.Participant mapParticipant(
            SimulatorFixtureModels.RecentMatchFixture fixture,
            SimulatorFixtureModels.PlayerFixture player
    ) {
        MatchHistory.Participant participant = new MatchHistory.Participant();
        participant.setParticipantId(1);
        participant.setTeamId("teamTwo".equals(player.team()) ? 200 : 100);
        participant.setChampionId(fixture.championId() != null ? fixture.championId() : player.championId());
        participant.setSpell1Id(4);
        participant.setSpell2Id(14);
        participant.setTeamPosition("UNKNOWN");
        participant.setIndividualPosition("UNKNOWN");
        participant.setStats(mapStats(fixture));
        return participant;
    }

    private MatchHistory.Stats mapStats(SimulatorFixtureModels.RecentMatchFixture fixture) {
        MatchHistory.Stats stats = new MatchHistory.Stats();
        stats.setWin(fixture.win());
        stats.setKills(fixture.kills());
        stats.setDeaths(fixture.deaths());
        stats.setAssists(fixture.assists());
        stats.setGoldEarned(12000);
        stats.setTotalMinionsKilled(180);
        stats.setNeutralMinionsKilled(0);
        stats.setTotalDamageDealtToChampions(22000);
        stats.setTotalDamageTaken(18000);
        stats.setVisionScore(22);
        stats.setPerk0(8005);
        stats.setPerkPrimaryStyle(8000);
        stats.setPerkSubStyle(8100);
        return stats;
    }

    private MatchHistory.ParticipantIdentity mapParticipantIdentity(SimulatorFixtureModels.PlayerFixture player) {
        MatchHistory.ParticipantIdentity identity = new MatchHistory.ParticipantIdentity();
        identity.setParticipantId(1);
        MatchHistory.Player matchPlayer = new MatchHistory.Player();
        matchPlayer.setSummonerId(player.summonerId());
        matchPlayer.setSummonerName(player.displayName());
        matchPlayer.setGameName(player.gameName());
        matchPlayer.setTagLine(player.tagLine());
        matchPlayer.setPuuid(player.puuid());
        matchPlayer.setPlatformId("SIM");
        identity.setPlayer(matchPlayer);
        return identity;
    }

    private Lobby mapLobby(SimulatorFixtureModels.LobbyFixture fixture, String roundId) {
        if (fixture == null) {
            return null;
        }
        Lobby lobby = new Lobby();
        lobby.setLobbyId("SIM-LOBBY-" + roundId);
        lobby.setQueueId(fixture.queueId());
        Lobby.GameConfig gameConfig = new Lobby.GameConfig();
        gameConfig.setQueueId(fixture.queueId());
        gameConfig.setGameMode("CLASSIC");
        gameConfig.setIsCustom(false);
        lobby.setGameConfig(gameConfig);
        List<Lobby.Member> members = new ArrayList<>();
        for (int index = 0; index < fixture.members().size(); index++) {
            SimulatorFixtureModels.PlayerFixture player = fixture.members().get(index);
            Lobby.Member member = new Lobby.Member();
            member.setPuuid(player.puuid());
            member.setSummonerName(player.displayName());
            member.setSummonerId(player.summonerId());
            member.setIsLeader(index == 0);
            member.setReady(true);
            member.setTeamId(100);
            members.add(member);
        }
        lobby.setMembers(members);
        return lobby;
    }

    private ChampionSelectSession mapChampionSelect(
            SimulatorFixtureModels.ChampionSelectFixture fixture,
            String matchId
    ) {
        if (fixture == null) {
            return null;
        }
        ChampionSelectSession session = new ChampionSelectSession();
        session.setGameId(pseudoGameId(matchId));
        session.setLocalPlayerCellId(0);
        ChampionSelectSession.Timer timer = new ChampionSelectSession.Timer();
        timer.setPhase("PLANNING");
        timer.setTotalTimeInPhase(30000);
        timer.setTimeLeftInPhase(18000);
        session.setTimer(timer);
        session.setMyTeam(mapChampionSelectPlayers(fixture.teamOne()));
        session.setTheirTeam(mapChampionSelectPlayers(fixture.teamTwo()));
        session.setActions(mapChampionSelectActions(fixture.actions(), fixture.teamOne(), fixture.teamTwo()));
        return session;
    }

    private List<ChampionSelectSession.Player> mapChampionSelectPlayers(
            List<SimulatorFixtureModels.PlayerFixture> players
    ) {
        if (players == null || players.isEmpty()) {
            return List.of();
        }
        return IntStream.range(0, players.size())
                .mapToObj(index -> mapChampionSelectPlayer(players.get(index), index))
                .toList();
    }

    private ChampionSelectSession.Player mapChampionSelectPlayer(
            SimulatorFixtureModels.PlayerFixture player,
            int cellId
    ) {
        ChampionSelectSession.Player selectPlayer = new ChampionSelectSession.Player();
        selectPlayer.setCellId(cellId);
        selectPlayer.setPuuid(player.puuid());
        selectPlayer.setSummonerId(player.summonerId());
        selectPlayer.setChampionId(player.championId());
        selectPlayer.setChampionPickIntent(player.championId());
        selectPlayer.setAssignedPosition("UNKNOWN");
        selectPlayer.setSelectedPosition("UNKNOWN");
        selectPlayer.setTeamPosition("UNKNOWN");
        selectPlayer.setIndividualPosition("UNKNOWN");
        selectPlayer.setSpell1Id(4);
        selectPlayer.setSpell2Id(14);
        return selectPlayer;
    }

    private List<List<ChampionSelectSession.Action>> mapChampionSelectActions(
            List<SimulatorFixtureModels.ChampionActionFixture> actions,
            List<SimulatorFixtureModels.PlayerFixture> teamOne,
            List<SimulatorFixtureModels.PlayerFixture> teamTwo
    ) {
        if (actions == null || actions.isEmpty()) {
            return List.of();
        }
        return actions.stream()
                .map(action -> List.of(mapChampionSelectAction(action, teamOne, teamTwo)))
                .toList();
    }

    private ChampionSelectSession.Action mapChampionSelectAction(
            SimulatorFixtureModels.ChampionActionFixture fixture,
            List<SimulatorFixtureModels.PlayerFixture> teamOne,
            List<SimulatorFixtureModels.PlayerFixture> teamTwo
    ) {
        ChampionSelectSession.Action action = new ChampionSelectSession.Action();
        action.setId(fixture.actionId());
        action.setActorCellId(resolveCellId(fixture.actorPuuid(), teamOne, teamTwo));
        action.setActionType(fixture.type());
        action.setChampionId(fixture.championId());
        action.setCompleted(fixture.completed());
        action.setIsInProgress(false);
        return action;
    }

    private Integer resolveCellId(
            String actorPuuid,
            List<SimulatorFixtureModels.PlayerFixture> teamOne,
            List<SimulatorFixtureModels.PlayerFixture> teamTwo
    ) {
        List<SimulatorFixtureModels.PlayerFixture> players = new ArrayList<>();
        if (teamOne != null) {
            players.addAll(teamOne);
        }
        if (teamTwo != null) {
            players.addAll(teamTwo);
        }
        for (int index = 0; index < players.size(); index++) {
            if (Objects.equals(actorPuuid, players.get(index).puuid())) {
                return index;
            }
        }
        return 0;
    }

    private Integer asInteger(Map<String, Object> data, String key) {
        Object value = data == null ? null : data.get(key);
        if (value instanceof Number number) {
            return number.intValue();
        }
        return null;
    }

    private Double asDouble(Map<String, Object> data, String key) {
        Object value = data == null ? null : data.get(key);
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        return null;
    }

    private Integer durationSeconds(Long startedAt, Long endedAt) {
        if (startedAt == null || endedAt == null || endedAt < startedAt) {
            return null;
        }
        return Math.toIntExact((endedAt - startedAt) / 1000L);
    }

    private Long pseudoGameId(String value) {
        if (value == null || value.isBlank()) {
            return 0L;
        }
        String digits = value.replaceAll("\\D+", "");
        if (!digits.isBlank()) {
            return Long.parseLong(digits);
        }
        return (long) Math.abs(value.hashCode());
    }
}
