package io.rankpeek.simulator;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SimulatorSessionMapperTest {

    private final SimulatorRuntimeService runtimeService = new SimulatorRuntimeService(new SimulatorFixtureService());
    private final SimulatorSessionMapper mapper = new SimulatorSessionMapper();

    @Test
    void idleSessionDataDoesNotExposePlayers() {
        SimulatorSessionData sessionData = mapper.toSessionData(runtimeService.snapshot());

        assertThat(sessionData.source()).isEqualTo("simulator");
        assertThat(sessionData.phase()).isEqualTo("None");
        assertThat(sessionData.roundIndex()).isZero();
        assertThat(sessionData.step()).isZero();
        assertThat(sessionData.teammates()).isEmpty();
        assertThat(sessionData.opponents()).isEmpty();
        assertThat(sessionData.teamOne()).isEmpty();
        assertThat(sessionData.teamTwo()).isEmpty();
    }

    @Test
    void champSelectSessionDataExposesTeammatesButNoOpponents() {
        runtimeService.start();
        advanceTo(SimulatorPhase.CHAMP_SELECT);

        SimulatorSessionData sessionData = mapper.toSessionData(runtimeService.snapshot());

        assertThat(sessionData.source()).isEqualTo("simulator");
        assertThat(sessionData.phase()).isEqualTo("ChampSelect");
        assertThat(sessionData.simulatorPhase()).isEqualTo(SimulatorPhase.CHAMP_SELECT);
        assertThat(sessionData.roundIndex()).isZero();
        assertThat(sessionData.step()).isEqualTo(3);
        assertThat(sessionData.currentSummoner().getPuuid()).startsWith("sim-puuid-");
        assertThat(sessionData.teammates()).isNotEmpty();
        assertThat(sessionData.teamOne()).isNotEmpty();
        assertThat(sessionData.opponents()).isEmpty();
        assertThat(sessionData.teamTwo()).isEmpty();
        assertThat(sessionData.championSelect()).isNotNull();
        assertThat(sessionData.championSelect().getTheirTeam()).isEmpty();
        assertThat(sessionData.teammates().getFirst().getSummoner().getPuuid()).startsWith("sim-puuid-");
        assertThat(sessionData.teammates().getFirst().getMatchHistory()).isNotEmpty();
        assertThat(sessionData.teammates().getFirst().getRank().getQueueMap().getRankedSolo5x5()).isNotNull();
    }

    @Test
    void gameLoadingSessionDataExposesOpponents() {
        runtimeService.start();
        advanceTo(SimulatorPhase.GAME_LOADING);

        SimulatorSessionData sessionData = mapper.toSessionData(runtimeService.snapshot());

        assertThat(sessionData.phase()).isEqualTo("GameStart");
        assertThat(sessionData.teammates()).isNotEmpty();
        assertThat(sessionData.opponents()).isNotEmpty();
        assertThat(sessionData.teamOne()).isNotEmpty();
        assertThat(sessionData.teamTwo()).isNotEmpty();
        assertThat(sessionData.loadingScreen()).isNotNull();
        assertThat(sessionData.opponents().getFirst().getSummoner().getPuuid()).startsWith("sim-puuid-");
    }

    @Test
    void endAndPostGameSessionDataExposeMatchSummary() {
        runtimeService.start();
        advanceTo(SimulatorPhase.END_OF_GAME);

        SimulatorSessionData endOfGame = mapper.toSessionData(runtimeService.snapshot());

        assertThat(endOfGame.phase()).isEqualTo("EndOfGame");
        assertThat(endOfGame.endOfGame()).isNotNull();
        assertThat(endOfGame.matchSummary()).isNotNull();
        assertThat(endOfGame.matchSummary().matchId()).isEqualTo(endOfGame.matchId());

        SimulatorSessionData postGame = mapper.toSessionData(runtimeService.next());

        assertThat(postGame.phase()).isEqualTo("PostGame");
        assertThat(postGame.matchSummary()).isNotNull();
        assertThat(postGame.matchSummary().matchId()).isEqualTo(postGame.matchId());
    }

    @Test
    void nextRoundSessionDataUsesDifferentMatchIdAndChampion() {
        runtimeService.start();
        advanceTo(SimulatorPhase.CHAMP_SELECT);
        SimulatorSessionData firstChampSelect = mapper.toSessionData(runtimeService.snapshot());
        String firstMatchId = firstChampSelect.matchId();
        Integer firstChampionId = firstChampSelect.teammates().getFirst().getChampionId();

        advanceTo(SimulatorPhase.POST_GAME);
        SimulatorSessionData secondRoundLobby = mapper.toSessionData(runtimeService.next());

        assertThat(secondRoundLobby.phase()).isEqualTo("Lobby");
        assertThat(secondRoundLobby.roundIndex()).isEqualTo(1);
        assertThat(secondRoundLobby.matchId()).isNotEqualTo(firstMatchId);
        assertThat(secondRoundLobby.currentSummoner().getPuuid()).isEqualTo("sim-puuid-current");

        advanceTo(SimulatorPhase.CHAMP_SELECT);
        SimulatorSessionData secondChampSelect = mapper.toSessionData(runtimeService.snapshot());

        assertThat(secondChampSelect.teammates().getFirst().getChampionId()).isNotEqualTo(firstChampionId);
    }

    private void advanceTo(SimulatorPhase targetPhase) {
        int guard = 0;
        while (runtimeService.state().phase() != targetPhase && guard < 20) {
            runtimeService.next();
            guard++;
        }
        assertThat(runtimeService.state().phase()).isEqualTo(targetPhase);
    }
}
