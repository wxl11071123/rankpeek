package io.rankpeek.simulator;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@ConditionalOnProperty(name = "rankpeek.simulator.enabled", havingValue = "true")
public class SimulatorRuntimeService {
    private final SimulatorFixtureService fixtureService;
    private final SimulatorFixtureModels.CycleFixture cycle;

    private boolean running;
    private int roundIndex;
    private SimulatorPhase phase;
    private long step;

    public SimulatorRuntimeService(SimulatorFixtureService fixtureService) {
        this.fixtureService = fixtureService;
        this.cycle = fixtureService.loadDefaultCycle();
        this.running = false;
        this.roundIndex = 0;
        this.phase = SimulatorPhase.IDLE;
        this.step = 0L;
    }

    public synchronized SimulatorState state() {
        return buildState();
    }

    public synchronized SimulatorSnapshot snapshot() {
        return buildSnapshot();
    }

    public synchronized SimulatorSnapshot start() {
        running = true;
        phase = SimulatorPhase.LOBBY;
        return buildSnapshot();
    }

    public synchronized SimulatorSnapshot stop() {
        running = false;
        phase = SimulatorPhase.IDLE;
        return buildSnapshot();
    }

    public synchronized SimulatorSnapshot reset() {
        running = false;
        roundIndex = 0;
        phase = SimulatorPhase.IDLE;
        step = 0L;
        return buildSnapshot();
    }

    public synchronized SimulatorSnapshot next() {
        if (phase == SimulatorPhase.POST_GAME) {
            roundIndex = (roundIndex + 1) % cycle.rounds().size();
            phase = SimulatorPhase.LOBBY;
        } else {
            phase = phase.next();
        }
        running = true;
        step++;
        return buildSnapshot();
    }

    public synchronized SimulatorSnapshot setPhase(SimulatorPhase phase) {
        if (phase == null) {
            throw new IllegalArgumentException("Simulator phase is required");
        }
        this.phase = phase;
        this.running = phase != SimulatorPhase.IDLE;
        return buildSnapshot();
    }

    public synchronized SimulatorSnapshot setRound(int roundIndex) {
        if (roundIndex < 0 || roundIndex >= cycle.rounds().size()) {
            throw new IllegalArgumentException("Simulator round index out of range: " + roundIndex);
        }
        this.roundIndex = roundIndex;
        return buildSnapshot();
    }

    private SimulatorState buildState() {
        SimulatorFixtureModels.RoundFixture round = currentRound();
        return new SimulatorState(
                running,
                roundIndex,
                phase,
                round.roundId(),
                round.matchId(),
                step,
                SimulatorState.SOURCE
        );
    }

    private SimulatorSnapshot buildSnapshot() {
        SimulatorFixtureModels.PhaseFixture fixture = fixtureService.getPhaseFixture(cycle, roundIndex, phase);
        return switch (phase) {
            case IDLE -> snapshot(
                    fixture,
                    null,
                    List.of(),
                    null,
                    List.of(),
                    null,
                    null,
                    null
            );
            case LOBBY, MATCHMAKING, READY_CHECK -> snapshot(
                    fixture,
                    fixture.lobby(),
                    List.of(),
                    null,
                    List.of(),
                    null,
                    null,
                    null
            );
            case CHAMP_SELECT -> snapshot(
                    fixture,
                    null,
                    fixture.teammates(),
                    fixture.championSelect(),
                    List.of(),
                    null,
                    null,
                    null
            );
            case GAME_LOADING, IN_GAME -> snapshot(
                    fixture,
                    null,
                    fixture.teammates(),
                    null,
                    fixture.opponents(),
                    fixture.loadingScreen(),
                    null,
                    null
            );
            case END_OF_GAME -> snapshot(
                    fixture,
                    null,
                    List.of(),
                    null,
                    List.of(),
                    null,
                    fixture.endOfGame(),
                    fixture.matchSummary()
            );
            case POST_GAME -> snapshot(
                    fixture,
                    null,
                    List.of(),
                    null,
                    List.of(),
                    null,
                    null,
                    fixture.matchSummary()
            );
        };
    }

    private SimulatorSnapshot snapshot(
            SimulatorFixtureModels.PhaseFixture fixture,
            SimulatorFixtureModels.LobbyFixture lobby,
            List<SimulatorFixtureModels.PlayerFixture> teammates,
            SimulatorFixtureModels.ChampionSelectFixture championSelect,
            List<SimulatorFixtureModels.PlayerFixture> opponents,
            SimulatorFixtureModels.LoadingScreenFixture loadingScreen,
            SimulatorFixtureModels.EndOfGameFixture endOfGame,
            SimulatorFixtureModels.MatchSummaryFixture matchSummary
    ) {
        return new SimulatorSnapshot(
                SimulatorState.SOURCE,
                buildState(),
                fixture.queueId(),
                fixture.queueType(),
                fixture.typeCn(),
                phasePayload(),
                fixture.currentSummoner(),
                lobby,
                teammates,
                championSelect,
                opponents,
                loadingScreen,
                endOfGame,
                matchSummary
        );
    }

    private Map<String, Object> phasePayload() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("source", SimulatorState.SOURCE);
        payload.put("phase", phase.name());
        payload.put("running", running);
        payload.put("roundIndex", roundIndex);
        payload.put("step", step);
        payload.put("status", phaseStatus());
        return payload;
    }

    private String phaseStatus() {
        return switch (phase) {
            case IDLE -> "idle";
            case LOBBY -> "lobby";
            case MATCHMAKING -> "searching";
            case READY_CHECK -> "ready_check_pending_manual_advance";
            case CHAMP_SELECT -> "champ_select";
            case GAME_LOADING -> "loading_screen";
            case IN_GAME -> "in_game";
            case END_OF_GAME -> "end_of_game";
            case POST_GAME -> "post_game";
        };
    }

    private SimulatorFixtureModels.RoundFixture currentRound() {
        return cycle.rounds().get(roundIndex);
    }
}
