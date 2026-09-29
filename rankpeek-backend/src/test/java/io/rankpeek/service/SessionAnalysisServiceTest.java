package io.rankpeek.service;

import io.rankpeek.model.Lobby;
import io.rankpeek.model.MatchHistory;
import io.rankpeek.model.Rank;
import io.rankpeek.model.RankTag;
import io.rankpeek.model.ScoutTagContext;
import io.rankpeek.model.ScoutTagSample;
import io.rankpeek.model.GameSession;
import io.rankpeek.model.Summoner;
import io.rankpeek.model.ChampionSelectSession;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.concurrent.Executor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SessionAnalysisServiceTest {

    @Mock
    private SummonerService summonerService;
    @Mock
    private RankService rankService;
    @Mock
    private MatchHistoryRefreshService matchHistoryRefreshService;
    @Mock
    private GameFlowService gameFlowService;
    @Mock
    private ChampionSelectService championSelectService;
    @Mock
    private ScoutTagSampleService scoutTagSampleService;
    @Mock
    private ScoutTagRuleService scoutTagRuleService;

    private SessionAnalysisService service;

    @BeforeEach
    void setUp() {
        Executor directExecutor = Runnable::run;
        service = new SessionAnalysisService(
                summonerService,
                rankService,
                matchHistoryRefreshService,
                gameFlowService,
                championSelectService,
                scoutTagSampleService,
                scoutTagRuleService,
                directExecutor
        );
    }

    @Test
    void lobbyPhaseBuildsLobbyMembersWithCurrentModeScoutSample() {
        Summoner me = new Summoner();
        me.setPuuid("my-puuid");
        when(summonerService.getMySummoner()).thenReturn(me);
        when(gameFlowService.getGamePhase()).thenReturn("Lobby");

        Lobby lobby = new Lobby();
        Lobby.GameConfig gameConfig = new Lobby.GameConfig();
        gameConfig.setQueueId(2400);
        lobby.setGameConfig(gameConfig);
        Lobby.Member member = new Lobby.Member();
        member.setPuuid("player-puuid");
        member.setPosition("UTILITY");
        lobby.setMembers(List.of(member));
        when(gameFlowService.getLobby()).thenReturn(lobby);

        Summoner summoner = new Summoner();
        summoner.setPuuid("player-puuid");
        when(summonerService.getSummonerByPuuid("player-puuid")).thenReturn(summoner);
        when(rankService.getRankByPuuid("player-puuid")).thenReturn(new Rank());
        ScoutTagSample sample = stubScout("player-puuid", 2400, createMatches(20, 2400));

        var data = service.getSessionData(null, true);

        assertThat(data.getPhase()).isEqualTo("Lobby");
        assertThat(data.isEmpty()).isFalse();
        assertThat(data.isStale()).isFalse();
        assertThat(data.getSource()).isEqualTo("LOBBY");
        assertThat(data.getQueueId()).isEqualTo(2400);
        assertThat(data.getCurrentSummoner()).isSameAs(me);
        assertThat(data.getTeamOne()).hasSize(1);
        assertThat(data.getTeamTwo()).isEmpty();
        assertThat(data.getTeamOne().getFirst().getChampionId()).isZero();
        assertThat(data.getTeamOne().getFirst().getSelectedPosition()).isEqualTo("UTILITY");
        assertThat(data.getTeamOne().getFirst().getPosition()).isEqualTo("UTILITY");
        assertThat(data.getTeamOne().getFirst().getSummoner().getPuuid()).isEqualTo("player-puuid");
        assertThat(data.getTeamOne().getFirst().getMatchHistory()).hasSize(20);
        assertThat(data.getTeamOne().getFirst().getUserTag()).isNotNull();
        assertThat(data.getSessionKey()).contains("phase:Lobby", "queue:2400", "me:my-puuid", "player-puuid");
        verify(scoutTagSampleService).getCurrentModeSample("player-puuid", 2400, 50, 20);
        verify(scoutTagRuleService).buildTags(
                org.mockito.ArgumentMatchers.argThat(context ->
                        context.getCurrentQueueId() == 2400
                                && context.getCurrentTeamPuuids().contains("player-puuid")
                                && "UTILITY".equals(context.getCurrentPosition())
                                && Integer.valueOf(0).equals(context.getCurrentChampionId())),
                eq(sample)
        );
    }

    @Test
    void matchmakingPhaseBuildsLobbyMembersWithCurrentModeScoutSample() {
        Summoner me = new Summoner();
        me.setPuuid("my-puuid");
        when(summonerService.getMySummoner()).thenReturn(me);
        when(gameFlowService.getGamePhase()).thenReturn("Matchmaking");

        Lobby lobby = new Lobby();
        Lobby.GameConfig gameConfig = new Lobby.GameConfig();
        gameConfig.setQueueId(2400);
        lobby.setGameConfig(gameConfig);
        Lobby.Member member = new Lobby.Member();
        member.setPuuid("player-puuid");
        member.setPosition("UTILITY");
        lobby.setMembers(List.of(member));
        when(gameFlowService.getLobby()).thenReturn(lobby);

        Summoner summoner = new Summoner();
        summoner.setPuuid("player-puuid");
        when(summonerService.getSummonerByPuuid("player-puuid")).thenReturn(summoner);
        when(rankService.getRankByPuuid("player-puuid")).thenReturn(new Rank());
        stubScout("player-puuid", 2400, createMatches(20, 2400));

        var data = service.getSessionData(null, true);

        assertThat(data.getPhase()).isEqualTo("Matchmaking");
        assertThat(data.isEmpty()).isFalse();
        assertThat(data.getSource()).isEqualTo("LOBBY");
        assertThat(data.getQueueId()).isEqualTo(2400);
        assertThat(data.getTeamOne()).hasSize(1);
        assertThat(data.getTeamOne().getFirst().getSummoner().getPuuid()).isEqualTo("player-puuid");
        assertThat(data.getTeamOne().getFirst().getMatchHistory()).hasSize(20);
        assertThat(data.getSessionKey()).contains("phase:Matchmaking", "queue:2400", "me:my-puuid", "player-puuid");
        verify(scoutTagSampleService).getCurrentModeSample("player-puuid", 2400, 50, 20);
    }

    @Test
    void nonePhaseReturnsEmptySessionWithoutCurrentSessionLookup() {
        Summoner me = new Summoner();
        me.setPuuid("my-puuid");
        when(summonerService.getMySummoner()).thenReturn(me);
        when(gameFlowService.getGamePhase()).thenReturn("None");

        var data = service.getSessionData(null);

        assertEmptySession(data, "None");
        verify(gameFlowService, never()).getGameSession();
        verifyNoInteractions(scoutTagSampleService, scoutTagRuleService);
    }

    @Test
    void endOfGamePhaseReturnsEmptySessionWithoutPreviousTeams() {
        Summoner me = new Summoner();
        me.setPuuid("my-puuid");
        when(summonerService.getMySummoner()).thenReturn(me);
        when(gameFlowService.getGamePhase()).thenReturn("EndOfGame");

        var data = service.getSessionData(420);

        assertEmptySession(data, "EndOfGame");
        verify(gameFlowService, never()).getGameSession();
        verifyNoInteractions(scoutTagSampleService, scoutTagRuleService);
    }

    @Test
    void champSelectPhaseUsesGameSessionQueueId() {
        Summoner me = new Summoner();
        me.setPuuid("my-puuid");
        when(summonerService.getMySummoner()).thenReturn(me);
        when(gameFlowService.getGamePhase()).thenReturn("ChampSelect");

        ChampionSelectSession selectSession = new ChampionSelectSession();
        ChampionSelectSession.Player player = new ChampionSelectSession.Player();
        player.setPuuid("player-puuid");
        player.setChampionId(901);
        player.setSelectedPosition("UTILITY");
        player.setAssignedPosition("BOTTOM");
        player.setTeamPosition("SUPPORT");
        player.setIndividualPosition("support");
        selectSession.setMyTeam(List.of(player));
        selectSession.setTheirTeam(List.of());
        when(championSelectService.getChampionSelectSession()).thenReturn(selectSession);
        when(gameFlowService.getGameSession()).thenReturn(gameSession(1700, List.of(), List.of()));

        Summoner summoner = new Summoner();
        summoner.setPuuid("player-puuid");
        when(summonerService.getSummonerByPuuid("player-puuid")).thenReturn(summoner);
        when(rankService.getRankByPuuid("player-puuid")).thenReturn(new Rank());
        stubScout("player-puuid", 1700, createMatches(20, 1700));

        var data = service.getSessionData(420);

        assertThat(data.getQueueId()).isEqualTo(1700);
        assertThat(data.getTeamOne()).hasSize(1);
        assertThat(data.getTeamOne().getFirst().getSelectedPosition()).isEqualTo("UTILITY");
        assertThat(data.getTeamOne().getFirst().getAssignedPosition()).isEqualTo("BOTTOM");
        assertThat(data.getTeamOne().getFirst().getTeamPosition()).isEqualTo("SUPPORT");
        assertThat(data.getTeamOne().getFirst().getIndividualPosition()).isEqualTo("support");
        assertThat(data.getTeamOne().getFirst().getPosition()).isEqualTo("UTILITY");
        assertThat(data.getCurrentSummoner()).isSameAs(me);
        verify(scoutTagSampleService).getCurrentModeSample("player-puuid", 1700, 50, 20);
    }

    @Test
    void champSelectPhaseReturnsEmptyWhenCurrentSessionIsMissing() {
        Summoner me = new Summoner();
        me.setPuuid("my-puuid");
        when(summonerService.getMySummoner()).thenReturn(me);
        when(gameFlowService.getGamePhase()).thenReturn("ChampSelect");
        when(championSelectService.getChampionSelectSession()).thenReturn(null);

        var data = service.getSessionData(null);

        assertEmptySession(data, "ChampSelect");
        verify(gameFlowService, never()).getGameSession();
        verifyNoInteractions(scoutTagSampleService, scoutTagRuleService);
    }

    @Test
    void inProgressReturnsEmptyWhenCurrentGameSessionIsMissing() {
        Summoner me = new Summoner();
        me.setPuuid("my-puuid");
        when(summonerService.getMySummoner()).thenReturn(me);
        when(gameFlowService.getGamePhase()).thenReturn("InProgress");
        when(gameFlowService.getGameSession()).thenReturn(null);

        var data = service.getSessionData(null);

        assertEmptySession(data, "InProgress");
        verifyNoInteractions(scoutTagSampleService, scoutTagRuleService);
    }

    @Test
    void gameStartWithValidGameSessionReturnsActivePlayers() {
        Summoner me = new Summoner();
        me.setPuuid("my-puuid");
        when(summonerService.getMySummoner()).thenReturn(me);
        when(gameFlowService.getGamePhase()).thenReturn("GameStart");

        GameSession.OnePlayer ally = gamePlayer("my-puuid", 221, "MIDDLE");
        GameSession.OnePlayer enemy = gamePlayer("enemy-puuid", 222, "TOP");
        when(gameFlowService.getGameSession()).thenReturn(gameSession(123L, 420, List.of(ally), List.of(enemy)));

        stubPlayerProfile("my-puuid");
        stubPlayerProfile("enemy-puuid");
        stubScout("my-puuid", 420, createMatches(20, 420));
        stubScout("enemy-puuid", 420, createMatches(20, 420));

        var data = service.getSessionData(null, true);

        assertThat(data.getPhase()).isEqualTo("GameStart");
        assertThat(data.isEmpty()).isFalse();
        assertThat(data.isStale()).isFalse();
        assertThat(data.getSource()).isEqualTo("GAME_SESSION");
        assertThat(data.getGameId()).isEqualTo(123L);
        assertThat(data.getQueueId()).isEqualTo(420);
        assertThat(data.getTeamOne()).hasSize(1);
        assertThat(data.getTeamTwo()).hasSize(1);
        assertThat(data.getTeamOne().getFirst().getSummoner().getPuuid()).isEqualTo("my-puuid");
        assertThat(data.getTeamTwo().getFirst().getSummoner().getPuuid()).isEqualTo("enemy-puuid");
        assertThat(data.getTeamOne().getFirst().getSelectedPosition()).isEqualTo("MIDDLE");
        assertThat(data.getTeamOne().getFirst().getPosition()).isEqualTo("MIDDLE");
        assertThat(data.getTeamTwo().getFirst().getSelectedPosition()).isEqualTo("TOP");
        assertThat(data.getTeamTwo().getFirst().getPosition()).isEqualTo("TOP");
        assertThat(data.getCurrentSummoner()).isSameAs(me);
        assertThat(data.getSessionKey()).contains("phase:GameStart", "game:123", "queue:420", "my-puuid", "enemy-puuid");
    }

    @Test
    void gameStartUsesGameSessionQueueIdAndChampionSelectionsForScoutSamples() {
        Summoner me = new Summoner();
        me.setPuuid("my-puuid");
        when(summonerService.getMySummoner()).thenReturn(me);
        when(gameFlowService.getGamePhase()).thenReturn("GameStart");

        GameSession session = gameSession(456L, 1700, List.of(), List.of());
        session.getGameData().setPlayerChampionSelections(List.of(
                championSelection("my-puuid", 901),
                championSelection("enemy-puuid", 902)
        ));
        when(gameFlowService.getGameSession()).thenReturn(session);

        stubPlayerProfile("my-puuid");
        stubPlayerProfile("enemy-puuid");
        ScoutTagSample sample = stubScout("my-puuid", 1700, createMatches(20, 1700));
        stubScout("enemy-puuid", 1700, createMatches(20, 1700));

        var data = service.getSessionData(null, true);

        assertThat(data.getPhase()).isEqualTo("GameStart");
        assertThat(data.isEmpty()).isFalse();
        assertThat(data.getSource()).isEqualTo("GAME_SESSION");
        assertThat(data.getQueueId()).isEqualTo(1700);
        assertThat(data.getTeamOne()).hasSize(1);
        assertThat(data.getTeamTwo()).hasSize(1);
        assertThat(data.getTeamOne().getFirst().getChampionId()).isEqualTo(901);
        assertThat(data.getTeamTwo().getFirst().getChampionId()).isEqualTo(902);
        verify(scoutTagSampleService).getCurrentModeSample("my-puuid", 1700, 50, 20);
        verify(scoutTagRuleService).buildTags(
                org.mockito.ArgumentMatchers.argThat(context ->
                        context.getCurrentQueueId() == 1700
                                && context.getCurrentTeamPuuids().contains("my-puuid")
                                && Integer.valueOf(901).equals(context.getCurrentChampionId())),
                eq(sample)
        );
    }

    @Test
    void gameStartWithoutCurrentGameSessionReturnsTransientEmptySource() {
        Summoner me = new Summoner();
        me.setPuuid("my-puuid");
        when(summonerService.getMySummoner()).thenReturn(me);
        when(gameFlowService.getGamePhase()).thenReturn("GameStart");
        when(gameFlowService.getGameSession()).thenReturn(null);

        var data = service.getSessionData(null);

        assertEmptySession(data, "GameStart");
        assertThat(data.getSource()).isEqualTo("GAMESTART_TRANSIENT_EMPTY");
        verifyNoInteractions(scoutTagSampleService, scoutTagRuleService);
    }

    @Test
    void lobbyPhaseWithMissingLobbyReturnsLobbyEmptyWithoutGameSessionLookup() {
        Summoner me = new Summoner();
        me.setPuuid("my-puuid");
        when(summonerService.getMySummoner()).thenReturn(me);
        when(gameFlowService.getGamePhase()).thenReturn("Lobby");
        when(gameFlowService.getLobby()).thenReturn(null);

        var data = service.getSessionData(null);

        assertEmptySession(data, "Lobby");
        assertThat(data.getSource()).isEqualTo("LOBBY_EMPTY");
        verify(gameFlowService, never()).getGameSession();
        verifyNoInteractions(scoutTagSampleService, scoutTagRuleService);
    }

    @Test
    void activeGameSessionIncludesSessionKeyFromGameIdentityAndParticipants() {
        Summoner me = new Summoner();
        me.setPuuid("my-puuid");
        when(summonerService.getMySummoner()).thenReturn(me);
        when(gameFlowService.getGamePhase()).thenReturn("InProgress");

        GameSession.OnePlayer player = new GameSession.OnePlayer();
        player.setPuuid("player-puuid");
        player.setChampionId(221);
        when(gameFlowService.getGameSession()).thenReturn(gameSession(123L, 420, List.of(player), List.of()));

        Summoner summoner = new Summoner();
        summoner.setPuuid("player-puuid");
        when(summonerService.getSummonerByPuuid("player-puuid")).thenReturn(summoner);
        when(rankService.getRankByPuuid("player-puuid")).thenReturn(new Rank());
        stubScout("player-puuid", 420, createMatches(20, 420));

        var data = service.getSessionData(null, true);

        assertThat(data.isEmpty()).isFalse();
        assertThat(data.isStale()).isFalse();
        assertThat(data.getGameId()).isEqualTo(123L);
        assertThat(data.getSessionKey()).contains("phase:InProgress");
        assertThat(data.getSessionKey()).contains("game:123");
        assertThat(data.getSessionKey()).contains("queue:420");
        assertThat(data.getSessionKey()).contains("me:my-puuid");
        assertThat(data.getSessionKey()).contains("player-puuid");
        assertThat(data.getSessionKey()).contains("champion:221");
    }

    @Test
    void sessionKeyChangesWhenGameIdentityOrParticipantsChange() {
        Summoner me = new Summoner();
        me.setPuuid("my-puuid");
        when(summonerService.getMySummoner()).thenReturn(me);
        when(gameFlowService.getGamePhase()).thenReturn("InProgress");

        GameSession.OnePlayer firstPlayer = new GameSession.OnePlayer();
        firstPlayer.setPuuid("first-player");
        firstPlayer.setChampionId(11);
        GameSession.OnePlayer secondPlayer = new GameSession.OnePlayer();
        secondPlayer.setPuuid("second-player");
        secondPlayer.setChampionId(22);
        when(gameFlowService.getGameSession()).thenReturn(
                gameSession(111L, 420, List.of(firstPlayer), List.of()),
                gameSession(222L, 420, List.of(secondPlayer), List.of())
        );

        var first = service.getSessionData(null);
        var second = service.getSessionData(null);

        assertThat(first.getSessionKey()).isNotBlank();
        assertThat(second.getSessionKey()).isNotBlank();
        assertThat(second.getSessionKey()).isNotEqualTo(first.getSessionKey());
    }

    @Test
    void gamePhaseUsesGameSessionQueueId() {
        Summoner me = new Summoner();
        me.setPuuid("my-puuid");
        when(summonerService.getMySummoner()).thenReturn(me);
        when(gameFlowService.getGamePhase()).thenReturn("InProgress");

        GameSession.OnePlayer player = new GameSession.OnePlayer();
        player.setPuuid("player-puuid");
        player.setChampionId(221);
        player.setSelectedPosition("MIDDLE");
        when(gameFlowService.getGameSession()).thenReturn(gameSession(2400, List.of(player), List.of()));

        Summoner summoner = new Summoner();
        summoner.setPuuid("player-puuid");
        when(summonerService.getSummonerByPuuid("player-puuid")).thenReturn(summoner);
        when(rankService.getRankByPuuid("player-puuid")).thenReturn(new Rank());
        ScoutTagSample sample = stubScout("player-puuid", 2400, createMatches(20, 2400));

        var data = service.getSessionData(null);

        assertThat(data.getQueueId()).isEqualTo(2400);
        verify(scoutTagSampleService).getCurrentModeSample("player-puuid", 2400, 50, 20);
        verify(scoutTagRuleService).buildTags(
                org.mockito.ArgumentMatchers.argThat(context ->
                        context.getCurrentQueueId() == 2400
                                && context.getCurrentTeamPuuids().contains("player-puuid")
                                && "MIDDLE".equals(context.getCurrentPosition())
                                && Integer.valueOf(221).equals(context.getCurrentChampionId())),
                eq(sample)
        );
    }

    @Test
    void scoutRecentDataIncludesGoldAndDamageRatesForGamingDamageConversion() {
        Summoner me = new Summoner();
        me.setPuuid("my-puuid");
        when(summonerService.getMySummoner()).thenReturn(me);
        when(gameFlowService.getGamePhase()).thenReturn("InProgress");

        GameSession.OnePlayer player = new GameSession.OnePlayer();
        player.setPuuid("player-puuid");
        player.setChampionId(221);
        when(gameFlowService.getGameSession()).thenReturn(gameSession(420, List.of(player), List.of()));

        Summoner summoner = new Summoner();
        summoner.setPuuid("player-puuid");
        when(summonerService.getSummonerByPuuid("player-puuid")).thenReturn(summoner);
        when(rankService.getRankByPuuid("player-puuid")).thenReturn(new Rank());

        stubScout("player-puuid", 420, List.of(createMatchWithParticipantStats("player-puuid", 10000, 20000, 10000, 20000)));

        var data = service.getSessionData(null);
        var recentData = data.getTeamOne().getFirst().getUserTag().getRecentData();

        assertThat(recentData.getAverageGold()).isEqualTo(10000);
        assertThat(recentData.getAverageDamageDealtToChampions()).isEqualTo(20000);
        assertThat(recentData.getGoldRate()).isEqualTo(50);
        assertThat(recentData.getDamageDealtToChampionsRate()).isEqualTo(50);
    }

    @Test
    void scoutRecentDataDoesNotTreatMissingDamageConversionFieldsAsZero() {
        Summoner me = new Summoner();
        me.setPuuid("my-puuid");
        when(summonerService.getMySummoner()).thenReturn(me);
        when(gameFlowService.getGamePhase()).thenReturn("InProgress");

        GameSession.OnePlayer player = new GameSession.OnePlayer();
        player.setPuuid("player-puuid");
        player.setChampionId(221);
        when(gameFlowService.getGameSession()).thenReturn(gameSession(420, List.of(player), List.of()));

        Summoner summoner = new Summoner();
        summoner.setPuuid("player-puuid");
        when(summonerService.getSummonerByPuuid("player-puuid")).thenReturn(summoner);
        when(rankService.getRankByPuuid("player-puuid")).thenReturn(new Rank());

        stubScout("player-puuid", 420, List.of(
                createMatchWithParticipantStats("player-puuid", 10000, 20000, 10000, 20000),
                createMatchWithMissingEconomyStats("player-puuid")
        ));

        var data = service.getSessionData(null);
        var recentData = data.getTeamOne().getFirst().getUserTag().getRecentData();

        assertThat(recentData.getAverageGold()).isEqualTo(10000);
        assertThat(recentData.getAverageDamageDealtToChampions()).isEqualTo(20000);
        assertThat(recentData.getGoldRate()).isEqualTo(50);
        assertThat(recentData.getDamageDealtToChampionsRate()).isEqualTo(50);
    }

    @Test
    void scoutRecentDataCalculatesDamageConversionFromSingleParticipantStats() {
        Summoner me = new Summoner();
        me.setPuuid("my-puuid");
        when(summonerService.getMySummoner()).thenReturn(me);
        when(gameFlowService.getGamePhase()).thenReturn("InProgress");

        GameSession.OnePlayer player = new GameSession.OnePlayer();
        player.setPuuid("player-puuid");
        player.setChampionId(221);
        when(gameFlowService.getGameSession()).thenReturn(gameSession(420, List.of(player), List.of()));

        Summoner summoner = new Summoner();
        summoner.setPuuid("player-puuid");
        when(summonerService.getSummonerByPuuid("player-puuid")).thenReturn(summoner);
        when(rankService.getRankByPuuid("player-puuid")).thenReturn(new Rank());

        stubScout("player-puuid", 420, List.of(createSingleParticipantMatch("player-puuid", 12345, 23456)));

        var data = service.getSessionData(null);
        var recentData = data.getTeamOne().getFirst().getUserTag().getRecentData();

        assertThat(recentData.getAverageGold()).isEqualTo(12345);
        assertThat(recentData.getAverageDamageDealtToChampions()).isEqualTo(23456);
    }

    @Test
    void scoutChampionRecentDataUsesCurrentChampionFromFiftyGameLookback() {
        Summoner me = new Summoner();
        me.setPuuid("my-puuid");
        when(summonerService.getMySummoner()).thenReturn(me);
        when(gameFlowService.getGamePhase()).thenReturn("InProgress");

        GameSession.OnePlayer player = new GameSession.OnePlayer();
        player.setPuuid("player-puuid");
        player.setChampionId(221);
        when(gameFlowService.getGameSession()).thenReturn(gameSession(420, List.of(player), List.of()));

        Summoner summoner = new Summoner();
        summoner.setPuuid("player-puuid");
        when(summonerService.getSummonerByPuuid("player-puuid")).thenReturn(summoner);
        when(rankService.getRankByPuuid("player-puuid")).thenReturn(new Rank());

        stubScout("player-puuid", 420, List.of(
                createChampionMatchWithParticipantStats("player-puuid", 221, true, 10, 2, 8, 12000, 24000, 12000, 12000),
                createChampionMatchWithParticipantStats("player-puuid", 221, false, 4, 4, 6, 10000, 16000, 10000, 24000),
                createChampionMatchWithParticipantStats("player-puuid", 222, true, 20, 1, 10, 15000, 50000, 15000, 10000),
                createChampionMatchWithParticipantStats("player-puuid", 221, true, 9, 3, 3, 11000, 22000, 11000, 22000)
        ));

        var data = service.getSessionData(null);
        var championRecentData = data.getTeamOne().getFirst().getUserTag().getChampionRecentData();

        assertThat(championRecentData).isNotNull();
        assertThat(championRecentData.getSelectWins()).isEqualTo(2);
        assertThat(championRecentData.getSelectLosses()).isEqualTo(1);
        assertThat(championRecentData.getKills()).isEqualTo(7.7);
        assertThat(championRecentData.getDeaths()).isEqualTo(3.0);
        assertThat(championRecentData.getAssists()).isEqualTo(5.7);
        assertThat(championRecentData.getKda()).isEqualTo(4.4);
        assertThat(championRecentData.getAverageGold()).isEqualTo(11000);
        assertThat(championRecentData.getAverageDamageDealtToChampions()).isEqualTo(20666);
        assertThat(championRecentData.getDamageDealtToChampionsRate()).isEqualTo(52);
    }

    @Test
    void preGroupMarkersUseOnlyCurrentSideRepeatedSameTeamMatches() {
        Summoner me = new Summoner();
        me.setPuuid("ally-a");
        when(summonerService.getMySummoner()).thenReturn(me);
        when(gameFlowService.getGamePhase()).thenReturn("InProgress");

        GameSession.OnePlayer allyA = gamePlayer("ally-a", 11, "JUNGLE");
        GameSession.OnePlayer allyB = gamePlayer("ally-b", 12, "MIDDLE");
        GameSession.OnePlayer enemyC = gamePlayer("enemy-c", 13, "TOP");
        when(gameFlowService.getGameSession()).thenReturn(gameSession(420, List.of(allyA, allyB), List.of(enemyC)));

        stubPlayerProfile("ally-a");
        stubPlayerProfile("ally-b");
        stubPlayerProfile("enemy-c");
        stubScout("ally-a", 420, List.of(
                createEncounterMatch("ally-a", "ally-b", true),
                createEncounterMatch("ally-a", "ally-b", true),
                createEncounterMatch("ally-a", "ally-b", true),
                createEncounterMatch("ally-a", "enemy-c", true),
                createEncounterMatch("ally-a", "enemy-c", true),
                createEncounterMatch("ally-a", "enemy-c", true)
        ));
        stubScout("ally-b", 420, List.of(
                createEncounterMatch("ally-b", "ally-a", true),
                createEncounterMatch("ally-b", "ally-a", true),
                createEncounterMatch("ally-b", "ally-a", true)
        ));
        stubScout("enemy-c", 420, List.of(
                createEncounterMatch("enemy-c", "ally-a", true),
                createEncounterMatch("enemy-c", "ally-a", true),
                createEncounterMatch("enemy-c", "ally-a", true)
        ));

        var data = service.getSessionData(null);

        var allyAMarker = data.getTeamOne().get(0).getPreGroupMarkers();
        var allyBMarker = data.getTeamOne().get(1).getPreGroupMarkers();
        var enemyCMarker = data.getTeamTwo().getFirst().getPreGroupMarkers();
        assertThat(allyAMarker.getName()).isNotBlank();
        assertThat(allyBMarker.getName()).isEqualTo(allyAMarker.getName());
        assertThat(enemyCMarker.getName()).isBlank();
    }

    private List<MatchHistory> createMatches(int count, int queueId) {
        return createMixedMatches(count, count, queueId, queueId + 1);
    }

    private List<MatchHistory> createMixedMatches(int count, int selectedCount, int selectedQueueId, int otherQueueId) {
        return java.util.stream.IntStream.range(0, count)
                .mapToObj(index -> {
                    MatchHistory history = new MatchHistory();
                    history.setQueueId(index < selectedCount ? selectedQueueId : otherQueueId);
                    return history;
                })
                .toList();
    }

    private ScoutTagSample stubScout(String puuid, int queueId, List<MatchHistory> history) {
        ScoutTagSample sample = ScoutTagSample.builder()
                .puuid(puuid)
                .currentQueueId(queueId)
                .lookbackMatches(history)
                .currentModeMatches(history)
                .source("SGP")
                .build();
        when(scoutTagSampleService.getCurrentModeSample(puuid, queueId, 50, 20)).thenReturn(sample);
        when(scoutTagRuleService.buildTags(any(ScoutTagContext.class), eq(sample))).thenReturn(List.of(
                RankTag.builder().tagName("高胜率").good(true).build()
        ));
        return sample;
    }

    private void stubPlayerProfile(String puuid) {
        Summoner summoner = new Summoner();
        summoner.setPuuid(puuid);
        when(summonerService.getSummonerByPuuid(puuid)).thenReturn(summoner);
        when(rankService.getRankByPuuid(puuid)).thenReturn(new Rank());
    }

    private ScoutTagContext anyContextWithQueueAndTeam(int queueId, List<String> teamPuuids) {
        return org.mockito.ArgumentMatchers.argThat(context ->
                context != null
                        && context.getCurrentQueueId() == queueId
                        && context.getCurrentTeamPuuids().containsAll(teamPuuids));
    }

    private MatchHistory createMatchWithParticipantStats(
            String puuid,
            int goldEarned,
            int damageDealt,
            int teammateGoldEarned,
            int teammateDamageDealt
    ) {
        MatchHistory history = new MatchHistory();
        history.setQueueId(420);

        MatchHistory.Participant participant = participant(1, 100, goldEarned, damageDealt);
        MatchHistory.Participant teammate = participant(2, 100, teammateGoldEarned, teammateDamageDealt);
        history.setParticipants(List.of(participant, teammate));

        MatchHistory.ParticipantIdentity identity = new MatchHistory.ParticipantIdentity();
        identity.setParticipantId(1);
        MatchHistory.Player player = new MatchHistory.Player();
        player.setPuuid(puuid);
        identity.setPlayer(player);
        history.setParticipantIdentities(List.of(identity));

        return history;
    }

    private MatchHistory createMatchWithMissingEconomyStats(String puuid) {
        MatchHistory history = new MatchHistory();
        history.setQueueId(420);

        MatchHistory.Participant participant = participant(1, 100, 0, 0);
        participant.getStats().setGoldEarned(null);
        participant.getStats().setTotalDamageDealtToChampions(null);
        MatchHistory.Participant teammate = participant(2, 100, 0, 0);
        teammate.getStats().setGoldEarned(null);
        teammate.getStats().setTotalDamageDealtToChampions(null);
        history.setParticipants(List.of(participant, teammate));

        MatchHistory.ParticipantIdentity identity = new MatchHistory.ParticipantIdentity();
        identity.setParticipantId(1);
        MatchHistory.Player player = new MatchHistory.Player();
        player.setPuuid(puuid);
        identity.setPlayer(player);
        history.setParticipantIdentities(List.of(identity));

        return history;
    }

    private MatchHistory createSingleParticipantMatch(String puuid, int goldEarned, int damageDealt) {
        MatchHistory history = new MatchHistory();
        history.setQueueId(420);
        history.setParticipants(List.of(participant(1, 100, goldEarned, damageDealt)));

        MatchHistory.ParticipantIdentity identity = new MatchHistory.ParticipantIdentity();
        identity.setParticipantId(1);
        MatchHistory.Player player = new MatchHistory.Player();
        player.setPuuid(puuid);
        identity.setPlayer(player);
        history.setParticipantIdentities(List.of(identity));

        return history;
    }

    private MatchHistory createChampionMatchWithParticipantStats(
            String puuid,
            int championId,
            boolean win,
            int kills,
            int deaths,
            int assists,
            int goldEarned,
            int damageDealt,
            int teammateGoldEarned,
            int teammateDamageDealt
    ) {
        MatchHistory history = createMatchWithParticipantStats(
                puuid,
                goldEarned,
                damageDealt,
                teammateGoldEarned,
                teammateDamageDealt
        );
        MatchHistory.Participant participant = history.getParticipants().getFirst();
        participant.setChampionId(championId);
        participant.getStats().setWin(win);
        participant.getStats().setKills(kills);
        participant.getStats().setDeaths(deaths);
        participant.getStats().setAssists(assists);
        return history;
    }

    private MatchHistory createEncounterMatch(String selfPuuid, String otherPuuid, boolean sameTeam) {
        MatchHistory history = new MatchHistory();
        history.setQueueId(420);
        history.setParticipants(List.of(
                participant(1, 100, 10000, 20000),
                participant(2, sameTeam ? 100 : 200, 10000, 20000)
        ));
        history.setParticipantIdentities(List.of(
                participantIdentity(1, selfPuuid),
                participantIdentity(2, otherPuuid)
        ));
        return history;
    }

    private MatchHistory.ParticipantIdentity participantIdentity(int participantId, String puuid) {
        MatchHistory.ParticipantIdentity identity = new MatchHistory.ParticipantIdentity();
        identity.setParticipantId(participantId);
        MatchHistory.Player player = new MatchHistory.Player();
        player.setPuuid(puuid);
        identity.setPlayer(player);
        return identity;
    }

    private MatchHistory.Participant participant(int participantId, int teamId, int goldEarned, int damageDealt) {
        MatchHistory.Participant participant = new MatchHistory.Participant();
        participant.setParticipantId(participantId);
        participant.setTeamId(teamId);
        MatchHistory.Stats stats = new MatchHistory.Stats();
        stats.setWin(true);
        stats.setKills(6);
        stats.setDeaths(3);
        stats.setAssists(9);
        stats.setGoldEarned(goldEarned);
        stats.setTotalDamageDealtToChampions(damageDealt);
        participant.setStats(stats);
        return participant;
    }

    private GameSession gameSession(int queueId, List<GameSession.OnePlayer> teamOne, List<GameSession.OnePlayer> teamTwo) {
        return gameSession(null, queueId, teamOne, teamTwo);
    }

    private GameSession gameSession(Long gameId, int queueId, List<GameSession.OnePlayer> teamOne, List<GameSession.OnePlayer> teamTwo) {
        GameSession session = new GameSession();
        GameSession.GameData gameData = new GameSession.GameData();
        gameData.setGameId(gameId);
        GameSession.Queue queue = new GameSession.Queue();
        queue.setId(queueId);
        queue.setType("RANKED_SOLO_5x5");
        gameData.setQueue(queue);
        gameData.setTeamOne(teamOne);
        gameData.setTeamTwo(teamTwo);
        session.setGameData(gameData);
        return session;
    }

    private GameSession.OnePlayer gamePlayer(String puuid, int championId, String position) {
        GameSession.OnePlayer player = new GameSession.OnePlayer();
        player.setPuuid(puuid);
        player.setChampionId(championId);
        player.setSelectedPosition(position);
        return player;
    }

    private GameSession.PlayerChampionSelection championSelection(String puuid, int championId) {
        GameSession.PlayerChampionSelection selection = new GameSession.PlayerChampionSelection();
        selection.setPuuid(puuid);
        selection.setChampionId(championId);
        return selection;
    }

    private void assertEmptySession(io.rankpeek.model.SessionData data, String phase) {
        assertThat(data.getPhase()).isEqualTo(phase);
        assertThat(data.isEmpty()).isTrue();
        assertThat(data.isStale()).isFalse();
        assertThat(data.getSessionKey()).isNull();
        assertThat(data.getTeamOne()).isEmpty();
        assertThat(data.getTeamTwo()).isEmpty();
    }
}
