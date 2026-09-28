package io.rankpeek.model;

import lombok.Getter;

/**
 * 游戏阶段常量
 */
@Getter
public enum GamePhase {
    NONE("None", "未连接"),
    LOBBY("Lobby", "大厅"),
    MATCHMAKING("Matchmaking", "匹配中"),
    READYCHECK("ReadyCheck", "确认对局"),
    CHAMPSELECT("ChampSelect", "选择英雄"),
    GAMESTART("GameStart", "游戏开始"),
    IN_PROGRESS("InProgress", "游戏中"),
    WAITING_FOR_STATS("WaitingForStats", "等待结算"),
    PRE_END_OF_GAME("PreEndOfGame", "游戏结束前"),
    END_OF_GAME("EndOfGame", "游戏结束"),
    RECONNECT("Reconnect", "重新连接");

    private final String code;
    private final String description;

    GamePhase(String code, String description) {
        this.code = code;
        this.description = description;
    }

    public static GamePhase fromCode(String code) {
        if (code == null) return NONE;
        for (GamePhase phase : values()) {
            if (phase.code.equalsIgnoreCase(code)) {
                return phase;
            }
        }
        return NONE;
    }
}
