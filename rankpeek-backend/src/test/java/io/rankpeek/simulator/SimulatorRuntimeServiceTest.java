package io.rankpeek.simulator;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SimulatorRuntimeServiceTest {

    @Test
    void initialStateIsIdleAndStoppedOnFirstRound() {
        SimulatorRuntimeService service = new SimulatorRuntimeService(new SimulatorFixtureService());

        SimulatorState state = service.state();

        assertThat(state.running()).isFalse();
        assertThat(state.roundIndex()).isZero();
        assertThat(state.phase()).isEqualTo(SimulatorPhase.IDLE);
        assertThat(state.step()).isZero();
        assertThat(state.source()).isEqualTo("simulator");
    }

    @Test
    void startAndNextAdvanceThroughLifecycle() {
        SimulatorRuntimeService service = new SimulatorRuntimeService(new SimulatorFixtureService());

        assertThat(service.start().state().phase()).isEqualTo(SimulatorPhase.LOBBY);
        assertThat(service.next().state().phase()).isEqualTo(SimulatorPhase.MATCHMAKING);
        assertThat(service.next().state().phase()).isEqualTo(SimulatorPhase.READY_CHECK);
        assertThat(service.next().state().phase()).isEqualTo(SimulatorPhase.CHAMP_SELECT);
        assertThat(service.next().state().phase()).isEqualTo(SimulatorPhase.GAME_LOADING);
        assertThat(service.next().state().phase()).isEqualTo(SimulatorPhase.IN_GAME);
        assertThat(service.next().state().phase()).isEqualTo(SimulatorPhase.END_OF_GAME);
        assertThat(service.next().state().phase()).isEqualTo(SimulatorPhase.POST_GAME);
    }

    @Test
    void postGameNextMovesToNextRoundLobbyAndCyclesAfterLastRound() {
        SimulatorFixtureService fixtureService = new SimulatorFixtureService();
        SimulatorRuntimeService service = new SimulatorRuntimeService(fixtureService);
        SimulatorFixtureModels.CycleFixture cycle = fixtureService.loadDefaultCycle();

        service.start();
        advanceTo(service, SimulatorPhase.POST_GAME);
        String firstMatchId = service.state().matchId();

        SimulatorSnapshot secondRoundLobby = service.next();

        assertThat(secondRoundLobby.state().phase()).isEqualTo(SimulatorPhase.LOBBY);
        assertThat(secondRoundLobby.state().roundIndex()).isEqualTo(1);
        assertThat(secondRoundLobby.state().matchId()).isNotEqualTo(firstMatchId);
        assertThat(secondRoundLobby.currentSummoner().championId())
                .isNotEqualTo(cycle.rounds().get(0).currentSummoner().championId());

        advanceTo(service, SimulatorPhase.POST_GAME);
        SimulatorSnapshot cycledLobby = service.next();

        assertThat(cycledLobby.state().phase()).isEqualTo(SimulatorPhase.LOBBY);
        assertThat(cycledLobby.state().roundIndex()).isZero();
        assertThat(cycledLobby.state().matchId()).isEqualTo(firstMatchId);
    }

    @Test
    void phaseSnapshotsExposeOnlyVisibleDataForCurrentLifecyclePoint() {
        SimulatorRuntimeService service = new SimulatorRuntimeService(new SimulatorFixtureService());
        service.start();

        advanceTo(service, SimulatorPhase.CHAMP_SELECT);
        SimulatorSnapshot champSelect = service.snapshot();

        assertThat(champSelect.source()).isEqualTo("simulator");
        assertThat(champSelect.teammates()).isNotEmpty();
        assertThat(champSelect.championSelect()).isNotNull();
        assertThat(champSelect.opponents()).isEmpty();

        SimulatorSnapshot gameLoading = service.next();

        assertThat(gameLoading.state().phase()).isEqualTo(SimulatorPhase.GAME_LOADING);
        assertThat(gameLoading.teammates()).isNotEmpty();
        assertThat(gameLoading.opponents()).isNotEmpty();
        assertThat(gameLoading.loadingScreen()).isNotNull();

        advanceTo(service, SimulatorPhase.END_OF_GAME);
        SimulatorSnapshot endOfGame = service.snapshot();

        assertThat(endOfGame.endOfGame()).isNotNull();
        assertThat(endOfGame.matchSummary()).isNotNull();

        SimulatorSnapshot postGame = service.next();

        assertThat(postGame.state().phase()).isEqualTo(SimulatorPhase.POST_GAME);
        assertThat(postGame.matchSummary()).isNotNull();
    }

    @Test
    void stopAndResetReturnToIdleWithoutPersistingProgress() {
        SimulatorRuntimeService service = new SimulatorRuntimeService(new SimulatorFixtureService());

        service.start();
        service.next();
        assertThat(service.stop().state().phase()).isEqualTo(SimulatorPhase.IDLE);
        assertThat(service.state().running()).isFalse();

        service.start();
        advanceTo(service, SimulatorPhase.POST_GAME);
        service.next();
        assertThat(service.state().roundIndex()).isEqualTo(1);

        SimulatorState reset = service.reset().state();

        assertThat(reset.phase()).isEqualTo(SimulatorPhase.IDLE);
        assertThat(reset.running()).isFalse();
        assertThat(reset.roundIndex()).isZero();
        assertThat(reset.step()).isZero();
    }

    private void advanceTo(SimulatorRuntimeService service, SimulatorPhase targetPhase) {
        int guard = 0;
        while (service.state().phase() != targetPhase && guard < 20) {
            service.next();
            guard++;
        }
        assertThat(service.state().phase()).isEqualTo(targetPhase);
    }
}
