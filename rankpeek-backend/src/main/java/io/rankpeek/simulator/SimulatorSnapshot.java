package io.rankpeek.simulator;

import java.util.List;
import java.util.Map;

public record SimulatorSnapshot(
        String source,
        SimulatorState state,
        Integer queueId,
        String queueType,
        String typeCn,
        Map<String, Object> payload,
        SimulatorFixtureModels.PlayerFixture currentSummoner,
        SimulatorFixtureModels.LobbyFixture lobby,
        List<SimulatorFixtureModels.PlayerFixture> teammates,
        SimulatorFixtureModels.ChampionSelectFixture championSelect,
        List<SimulatorFixtureModels.PlayerFixture> opponents,
        SimulatorFixtureModels.LoadingScreenFixture loadingScreen,
        SimulatorFixtureModels.EndOfGameFixture endOfGame,
        SimulatorFixtureModels.MatchSummaryFixture matchSummary
) {
    public SimulatorSnapshot {
        teammates = teammates == null ? List.of() : List.copyOf(teammates);
        opponents = opponents == null ? List.of() : List.copyOf(opponents);
        payload = payload == null ? Map.of() : Map.copyOf(payload);
    }
}
