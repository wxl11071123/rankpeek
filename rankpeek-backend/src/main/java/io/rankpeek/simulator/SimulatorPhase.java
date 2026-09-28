package io.rankpeek.simulator;

public enum SimulatorPhase {
    IDLE,
    LOBBY,
    MATCHMAKING,
    READY_CHECK,
    CHAMP_SELECT,
    GAME_LOADING,
    IN_GAME,
    END_OF_GAME,
    POST_GAME;

    public SimulatorPhase next() {
        return switch (this) {
            case IDLE -> LOBBY;
            case LOBBY -> MATCHMAKING;
            case MATCHMAKING -> READY_CHECK;
            case READY_CHECK -> CHAMP_SELECT;
            case CHAMP_SELECT -> GAME_LOADING;
            case GAME_LOADING -> IN_GAME;
            case IN_GAME -> END_OF_GAME;
            case END_OF_GAME -> POST_GAME;
            case POST_GAME -> LOBBY;
        };
    }
}
