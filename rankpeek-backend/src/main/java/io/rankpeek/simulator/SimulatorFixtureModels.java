package io.rankpeek.simulator;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;
import java.util.Map;

public final class SimulatorFixtureModels {
    private SimulatorFixtureModels() {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record CycleFixture(
            String schemaVersion,
            String description,
            List<RoundFixture> rounds
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record RoundFixture(
            String roundId,
            String matchId,
            Integer queueId,
            String queueType,
            String typeCn,
            PlayerFixture currentSummoner,
            LobbyFixture lobby,
            List<PlayerFixture> teammates,
            ChampionSelectFixture championSelect,
            List<PlayerFixture> opponents,
            LoadingScreenFixture loadingScreen,
            EndOfGameFixture endOfGame,
            MatchSummaryFixture matchSummary
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PhaseFixture(
            SimulatorPhase phase,
            String roundId,
            String matchId,
            Integer queueId,
            String queueType,
            String typeCn,
            PlayerFixture currentSummoner,
            LobbyFixture lobby,
            List<PlayerFixture> teammates,
            ChampionSelectFixture championSelect,
            List<PlayerFixture> opponents,
            LoadingScreenFixture loadingScreen,
            EndOfGameFixture endOfGame,
            MatchSummaryFixture matchSummary
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PlayerFixture(
            String puuid,
            String gameName,
            String tagLine,
            String displayName,
            Long summonerId,
            Integer profileIconId,
            Integer championId,
            String championKey,
            String team,
            RankFixture rank,
            UserTagFixture userTag,
            List<RecentMatchFixture> recentMatches
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record RankFixture(
            String queueType,
            String tier,
            String division,
            Integer leaguePoints,
            Integer wins,
            Integer losses
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record UserTagFixture(
            String recordStatus,
            List<String> tags,
            Map<String, Object> recentData
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record RecentMatchFixture(
            String matchId,
            Integer championId,
            Boolean win,
            Integer kills,
            Integer deaths,
            Integer assists,
            Integer queueId,
            Long gameCreation,
            Long endedAt
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record LobbyFixture(
            Integer queueId,
            String queueType,
            String typeCn,
            List<PlayerFixture> members
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ChampionSelectFixture(
            List<PlayerFixture> teamOne,
            List<PlayerFixture> teamTwo,
            List<ChampionActionFixture> actions
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ChampionActionFixture(
            Integer actionId,
            String type,
            String actorPuuid,
            Integer championId,
            Boolean completed
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record LoadingScreenFixture(
            List<PlayerFixture> teamOne,
            List<PlayerFixture> teamTwo,
            List<ChampionSelectionFixture> championSelections
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ChampionSelectionFixture(
            String puuid,
            Integer championId,
            String team
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record EndOfGameFixture(
            String matchId,
            Boolean win,
            Long gameCreation,
            Long endedAt,
            Integer gameDurationSeconds,
            MatchSummaryFixture matchSummary
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record MatchSummaryFixture(
            String matchId,
            Integer queueId,
            Boolean win,
            Long gameCreation,
            Long endedAt,
            Integer gameDurationSeconds,
            List<PlayerResultFixture> participants
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PlayerResultFixture(
            String puuid,
            String team,
            Integer championId,
            Boolean win,
            Integer kills,
            Integer deaths,
            Integer assists
    ) {
    }
}
