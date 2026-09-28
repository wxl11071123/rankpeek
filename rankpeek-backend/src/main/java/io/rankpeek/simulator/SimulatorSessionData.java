package io.rankpeek.simulator;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.rankpeek.model.ChampionSelectSession;
import io.rankpeek.model.Lobby;
import io.rankpeek.model.SessionSummoner;
import io.rankpeek.model.Summoner;

import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record SimulatorSessionData(
        String source,
        SimulatorState state,
        boolean running,
        int roundIndex,
        String roundId,
        String matchId,
        long step,
        SimulatorPhase simulatorPhase,
        String phase,
        Integer queueId,
        String queueType,
        String typeCn,
        Summoner currentSummoner,
        Lobby lobby,
        List<SessionSummoner> teammates,
        List<SessionSummoner> opponents,
        List<SessionSummoner> teamOne,
        List<SessionSummoner> teamTwo,
        ChampionSelectSession championSelect,
        SimulatorFixtureModels.LoadingScreenFixture loadingScreen,
        SimulatorFixtureModels.EndOfGameFixture endOfGame,
        SimulatorFixtureModels.MatchSummaryFixture matchSummary
) {
    public SimulatorSessionData {
        teammates = teammates == null ? List.of() : List.copyOf(teammates);
        opponents = opponents == null ? List.of() : List.copyOf(opponents);
        teamOne = teamOne == null ? List.of() : List.copyOf(teamOne);
        teamTwo = teamTwo == null ? List.of() : List.copyOf(teamTwo);
    }
}
