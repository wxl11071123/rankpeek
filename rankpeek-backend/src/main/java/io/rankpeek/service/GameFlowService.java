package io.rankpeek.service;

import io.rankpeek.model.GameSession;
import io.rankpeek.model.Lobby;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 游戏流程控制服务
 * 提供游戏匹配、接受对局等流程控制功能
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GameFlowService {

    private final LcuHttpClient lcuHttpClient;

    @PostConstruct
    public void init() {
        log.info("游戏流程服务初始化完成");
    }

    /**
     * 获取当前游戏阶段
     */
    public String getGamePhase() {
        return lcuHttpClient.get("lol-gameflow/v1/gameflow-phase", String.class);
    }

    /**
     * 获取大厅信息
     */
    public Lobby getLobby() {
        return lcuHttpClient.get("lol-lobby/v2/lobby", Lobby.class);
    }

    /**
     * 开始匹配
     */
    public void startMatchmaking() {
        lcuHttpClient.post("lol-lobby/v2/lobby/matchmaking/search", null, Void.class);
        log.info("已开始匹配");
    }

    /**
     * 取消匹配
     */
    public void cancelMatchmaking() {
        lcuHttpClient.delete("lol-lobby/v2/lobby/matchmaking/search", Void.class);
        log.info("已取消匹配");
    }

    /**
     * 接受对局
     */
    public void acceptMatch() {
        lcuHttpClient.post("lol-matchmaking/v1/ready-check/accept", null, Void.class);
        log.info("已接受对局");
    }

    /**
     * 检查 LCU 连接状态
     */
    public boolean isConnected() {
        try {
            getGamePhase();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * 获取游戏会话数据
     */
    public GameSession getGameSession() {
        return lcuHttpClient.get("lol-gameflow/v1/session", GameSession.class);
    }
}
