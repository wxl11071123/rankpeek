package io.rankpeek.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

/**
 * 游戏状态事件
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class GameState {

    /**
     * 是否已连接到 LCU
     */
    private boolean connected;

    /**
     * 当前游戏阶段
     */
    private String phase;

    /**
     * 当前召唤师信息
     */
    private Summoner summoner;

    /**
     * 时间戳
     */
    private Long timestamp;

    public GameState() {
        this.timestamp = System.currentTimeMillis();
    }

    public static GameState disconnected() {
        GameState state = new GameState();
        state.setConnected(false);
        return state;
    }

    public static GameState connected(String phase, Summoner summoner) {
        GameState state = new GameState();
        state.setConnected(true);
        state.setPhase(phase);
        state.setSummoner(summoner);
        return state;
    }
}
