package io.rankpeek.simulator;

public record SimulatorState(
        boolean running,
        int roundIndex,
        SimulatorPhase phase,
        String roundId,
        String matchId,
        long step,
        String source
) {
    public static final String SOURCE = "simulator";
}
