package io.rankpeek.simulator;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class SimulatorFixtureServiceTest {

    @Test
    void simulatorPhaseAdvancesThroughLifecycleAndLoopsAfterPostGame() {
        assertThat(SimulatorPhase.IDLE.next()).isEqualTo(SimulatorPhase.LOBBY);
        assertThat(SimulatorPhase.LOBBY.next()).isEqualTo(SimulatorPhase.MATCHMAKING);
        assertThat(SimulatorPhase.MATCHMAKING.next()).isEqualTo(SimulatorPhase.READY_CHECK);
        assertThat(SimulatorPhase.READY_CHECK.next()).isEqualTo(SimulatorPhase.CHAMP_SELECT);
        assertThat(SimulatorPhase.CHAMP_SELECT.next()).isEqualTo(SimulatorPhase.GAME_LOADING);
        assertThat(SimulatorPhase.GAME_LOADING.next()).isEqualTo(SimulatorPhase.IN_GAME);
        assertThat(SimulatorPhase.IN_GAME.next()).isEqualTo(SimulatorPhase.END_OF_GAME);
        assertThat(SimulatorPhase.END_OF_GAME.next()).isEqualTo(SimulatorPhase.POST_GAME);
        assertThat(SimulatorPhase.POST_GAME.next()).isEqualTo(SimulatorPhase.LOBBY);
    }

    @Test
    void loadDefaultCycleReturnsAtLeastTwoCompleteRounds() {
        SimulatorFixtureService service = new SimulatorFixtureService();

        SimulatorFixtureModels.CycleFixture cycle = service.loadDefaultCycle();

        assertThat(cycle.rounds()).hasSizeGreaterThanOrEqualTo(2);
        assertThat(cycle.rounds())
                .allSatisfy(round -> {
                    assertThat(round.matchId()).startsWith("SIM-MATCH-");
                    assertThat(round.currentSummoner()).isNotNull();
                    assertThat(round.lobby()).isNotNull();
                    assertThat(round.teammates()).isNotEmpty();
                    assertThat(round.championSelect()).isNotNull();
                    assertThat(round.opponents()).isNotEmpty();
                    assertThat(round.loadingScreen()).isNotNull();
                    assertThat(round.endOfGame()).isNotNull();
                    assertThat(round.matchSummary()).isNotNull();
                });
    }

    @Test
    void defaultCycleUsesDifferentMatchIdsAcrossRounds() {
        SimulatorFixtureService service = new SimulatorFixtureService();

        SimulatorFixtureModels.CycleFixture cycle = service.loadDefaultCycle();
        List<SimulatorFixtureModels.RoundFixture> rounds = cycle.rounds();

        assertThat(rounds.get(0).matchId()).isNotEqualTo(rounds.get(1).matchId());
    }

    @Test
    void champSelectPhaseExposesTeammatesWithoutOpponents() {
        SimulatorFixtureService service = new SimulatorFixtureService();

        SimulatorFixtureModels.PhaseFixture fixture = service.getPhaseFixture(SimulatorPhase.CHAMP_SELECT);

        assertThat(fixture.phase()).isEqualTo(SimulatorPhase.CHAMP_SELECT);
        assertThat(fixture.teammates()).isNotEmpty();
        assertThat(fixture.championSelect()).isNotNull();
        assertThat(fixture.opponents()).isEmpty();
    }

    @Test
    void gameLoadingPhaseExposesOpponents() {
        SimulatorFixtureService service = new SimulatorFixtureService();

        SimulatorFixtureModels.PhaseFixture fixture = service.getPhaseFixture(SimulatorPhase.GAME_LOADING);

        assertThat(fixture.phase()).isEqualTo(SimulatorPhase.GAME_LOADING);
        assertThat(fixture.teammates()).isNotEmpty();
        assertThat(fixture.opponents()).isNotEmpty();
        assertThat(fixture.loadingScreen()).isNotNull();
    }

    @Test
    void endAndPostGamePhasesExposeMatchSummary() {
        SimulatorFixtureService service = new SimulatorFixtureService();

        SimulatorFixtureModels.PhaseFixture endOfGame = service.getPhaseFixture(SimulatorPhase.END_OF_GAME);
        SimulatorFixtureModels.PhaseFixture postGame = service.getPhaseFixture(SimulatorPhase.POST_GAME);

        assertThat(endOfGame.endOfGame()).isNotNull();
        assertThat(endOfGame.matchSummary()).isNotNull();
        assertThat(postGame.matchSummary()).isNotNull();
        assertThat(postGame.matchSummary().matchId()).startsWith("SIM-MATCH-");
    }
}
