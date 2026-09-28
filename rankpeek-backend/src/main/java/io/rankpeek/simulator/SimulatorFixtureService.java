package io.rankpeek.simulator;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;

@Service
@ConditionalOnProperty(name = "rankpeek.simulator.enabled", havingValue = "true")
public class SimulatorFixtureService {
    public static final String DEFAULT_CYCLE_RESOURCE = "classpath:/simulator/v1/ranked-solo-cycle.json";

    private final ObjectMapper objectMapper;

    public SimulatorFixtureService() {
        this(new ObjectMapper().findAndRegisterModules());
    }

    public SimulatorFixtureService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public SimulatorFixtureModels.CycleFixture loadDefaultCycle() {
        return loadCycle(DEFAULT_CYCLE_RESOURCE);
    }

    public SimulatorFixtureModels.CycleFixture loadCycle(String resourcePath) {
        String normalizedPath = normalizeResourcePath(resourcePath);
        try (InputStream input = openResource(normalizedPath)) {
            if (input == null) {
                throw new IllegalArgumentException("Simulator fixture resource not found: " + resourcePath);
            }
            SimulatorFixtureModels.CycleFixture cycle =
                    objectMapper.readValue(input, SimulatorFixtureModels.CycleFixture.class);
            validateCycle(cycle, resourcePath);
            return cycle;
        } catch (IOException e) {
            throw new IllegalStateException("Failed to read simulator fixture resource: " + resourcePath, e);
        }
    }

    public SimulatorFixtureModels.PhaseFixture getPhaseFixture(SimulatorPhase phase) {
        return getPhaseFixture(loadDefaultCycle(), 0, phase);
    }

    public SimulatorFixtureModels.PhaseFixture getPhaseFixture(
            SimulatorFixtureModels.CycleFixture cycle,
            int roundIndex,
            SimulatorPhase phase
    ) {
        validateCycle(cycle, "provided cycle");
        if (roundIndex < 0 || roundIndex >= cycle.rounds().size()) {
            throw new IllegalArgumentException("Simulator round index out of range: " + roundIndex);
        }
        SimulatorFixtureModels.RoundFixture round = cycle.rounds().get(roundIndex);
        return switch (phase) {
            case IDLE -> phaseFixture(phase, round, null, List.of(), null, List.of(), null, null, null);
            case LOBBY, MATCHMAKING, READY_CHECK ->
                    phaseFixture(phase, round, round.lobby(), round.teammates(), null, List.of(), null, null, null);
            case CHAMP_SELECT ->
                    phaseFixture(phase, round, null, round.teammates(), round.championSelect(), List.of(), null, null, null);
            case GAME_LOADING, IN_GAME ->
                    phaseFixture(phase, round, null, round.teammates(), null, round.opponents(), round.loadingScreen(), null, null);
            case END_OF_GAME ->
                    phaseFixture(phase, round, null, round.teammates(), null, round.opponents(),
                            null, round.endOfGame(), round.matchSummary());
            case POST_GAME ->
                    phaseFixture(phase, round, null, round.teammates(), null, round.opponents(),
                            null, null, round.matchSummary());
        };
    }

    private SimulatorFixtureModels.PhaseFixture phaseFixture(
            SimulatorPhase phase,
            SimulatorFixtureModels.RoundFixture round,
            SimulatorFixtureModels.LobbyFixture lobby,
            List<SimulatorFixtureModels.PlayerFixture> teammates,
            SimulatorFixtureModels.ChampionSelectFixture championSelect,
            List<SimulatorFixtureModels.PlayerFixture> opponents,
            SimulatorFixtureModels.LoadingScreenFixture loadingScreen,
            SimulatorFixtureModels.EndOfGameFixture endOfGame,
            SimulatorFixtureModels.MatchSummaryFixture matchSummary
    ) {
        return new SimulatorFixtureModels.PhaseFixture(
                phase,
                round.roundId(),
                round.matchId(),
                round.queueId(),
                round.queueType(),
                round.typeCn(),
                round.currentSummoner(),
                lobby,
                teammates == null ? List.of() : teammates,
                championSelect,
                opponents == null ? List.of() : opponents,
                loadingScreen,
                endOfGame,
                matchSummary
        );
    }

    private String normalizeResourcePath(String resourcePath) {
        if (resourcePath == null || resourcePath.isBlank()) {
            throw new IllegalArgumentException("Simulator fixture resource path is required");
        }
        String path = resourcePath.trim();
        if (path.startsWith("classpath:")) {
            path = path.substring("classpath:".length());
        }
        while (path.startsWith("/")) {
            path = path.substring(1);
        }
        if (path.isBlank()) {
            throw new IllegalArgumentException("Simulator fixture resource path is empty");
        }
        return path;
    }

    private InputStream openResource(String normalizedPath) {
        ClassLoader contextLoader = Thread.currentThread().getContextClassLoader();
        InputStream input = contextLoader == null ? null : contextLoader.getResourceAsStream(normalizedPath);
        if (input != null) {
            return input;
        }
        return SimulatorFixtureService.class.getClassLoader().getResourceAsStream(normalizedPath);
    }

    private void validateCycle(SimulatorFixtureModels.CycleFixture cycle, String source) {
        if (cycle == null) {
            throw new IllegalArgumentException("Simulator fixture cycle is missing: " + source);
        }
        requireText(cycle.schemaVersion(), "schemaVersion");
        requireNonEmpty(cycle.rounds(), "rounds");
        if (cycle.rounds().size() < 2) {
            throw new IllegalArgumentException("Simulator fixture must contain at least two rounds");
        }
        for (int index = 0; index < cycle.rounds().size(); index++) {
            validateRound(cycle.rounds().get(index), "rounds[" + index + "]");
        }
    }

    private void validateRound(SimulatorFixtureModels.RoundFixture round, String path) {
        if (round == null) {
            throw new IllegalArgumentException("Simulator fixture " + path + " is missing");
        }
        requireText(round.roundId(), path + ".roundId");
        requireText(round.matchId(), path + ".matchId");
        if (!round.matchId().startsWith("SIM-MATCH-")) {
            throw new IllegalArgumentException("Simulator fixture " + path + ".matchId must start with SIM-MATCH-");
        }
        requireObject(round.currentSummoner(), path + ".currentSummoner");
        validatePlayer(round.currentSummoner(), path + ".currentSummoner");
        requireObject(round.lobby(), path + ".lobby");
        requireNonEmpty(round.teammates(), path + ".teammates");
        round.teammates().forEach(player -> validatePlayer(player, path + ".teammates[]"));
        requireObject(round.championSelect(), path + ".championSelect");
        requireNonEmpty(round.championSelect().teamOne(), path + ".championSelect.teamOne");
        requireNonEmpty(round.opponents(), path + ".opponents");
        round.opponents().forEach(player -> validatePlayer(player, path + ".opponents[]"));
        requireObject(round.loadingScreen(), path + ".loadingScreen");
        requireNonEmpty(round.loadingScreen().teamOne(), path + ".loadingScreen.teamOne");
        requireNonEmpty(round.loadingScreen().teamTwo(), path + ".loadingScreen.teamTwo");
        requireObject(round.endOfGame(), path + ".endOfGame");
        requireObject(round.matchSummary(), path + ".matchSummary");
        requireText(round.matchSummary().matchId(), path + ".matchSummary.matchId");
    }

    private void validatePlayer(SimulatorFixtureModels.PlayerFixture player, String path) {
        requireObject(player, path);
        requireText(player.puuid(), path + ".puuid");
        if (!player.puuid().startsWith("sim-puuid-")) {
            throw new IllegalArgumentException("Simulator fixture " + path + ".puuid must start with sim-puuid-");
        }
        if (isBlank(player.displayName()) && (isBlank(player.gameName()) || isBlank(player.tagLine()))) {
            throw new IllegalArgumentException("Simulator fixture " + path + " requires displayName or gameName/tagLine");
        }
        requireObject(player.summonerId(), path + ".summonerId");
        requireObject(player.profileIconId(), path + ".profileIconId");
        requireObject(player.championId(), path + ".championId");
        requireText(player.team(), path + ".team");
        requireObject(player.rank(), path + ".rank");
        requireObject(player.userTag(), path + ".userTag");
        requireNonEmpty(player.recentMatches(), path + ".recentMatches");
    }

    private void requireText(String value, String path) {
        if (isBlank(value)) {
            throw new IllegalArgumentException("Simulator fixture missing required field: " + path);
        }
    }

    private void requireObject(Object value, String path) {
        if (value == null) {
            throw new IllegalArgumentException("Simulator fixture missing required field: " + path);
        }
    }

    private void requireNonEmpty(List<?> value, String path) {
        if (value == null || value.isEmpty()) {
            throw new IllegalArgumentException("Simulator fixture missing required list: " + path);
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
