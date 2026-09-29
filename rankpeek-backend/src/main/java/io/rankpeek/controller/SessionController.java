package io.rankpeek.controller;

import io.rankpeek.model.*;
import io.rankpeek.service.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

/**
 * 会话控制器
 * 提供游戏会话相关接口
 */
@RestController
@RequestMapping("/api/v1/session")
@RequiredArgsConstructor
@Slf4j
public class SessionController {

    private final LcuHttpClient lcuHttpClient;
    private final GameFlowService gameFlowService;
    private final ChampionSelectService championSelectService;
    private final SessionAnalysisService sessionAnalysisService;
    private final SummonerService summonerService;

    /**
     * 获取游戏状态
     */
    @GetMapping("/game-state")
    public ApiResponse<GameState> getGameState() {
        GameState state = new GameState();

        try {
            boolean connected = lcuHttpClient.isConnected();
            state.setConnected(connected);

            if (!connected) {
                return ApiResponse.success(state);
            }
        } catch (Exception e) {
            log.warn("LCU connection check failed while building game state: {}", e.getMessage());
            state.setConnected(false);
            return ApiResponse.success(state);
        }

        try {
            state.setPhase(gameFlowService.getGamePhase());
        } catch (Exception e) {
            log.warn("LCU connected but game phase lookup failed: {}", e.getMessage());
        }

        try {
            state.setSummoner(summonerService.getMySummoner());
        } catch (Exception e) {
            log.warn("LCU connected but current summoner lookup failed: {}", e.getMessage());
        }

        return ApiResponse.success(state);
    }

    /**
     * 获取游戏阶段
     */
    @GetMapping("/phase")
    public ApiResponse<String> getGamePhase() {
        return ApiResponse.success(gameFlowService.getGamePhase());
    }

    /**
     * 获取大厅信息
     */
    @GetMapping("/lobby")
    public ApiResponse<Lobby> getLobby() {
        return ApiResponse.success(gameFlowService.getLobby());
    }

    /**
     * 获取选人会话
     */
    @GetMapping("/champion-select")
    public ApiResponse<ChampionSelectSession> getChampionSelectSession() {
        return ApiResponse.success(championSelectService.getChampionSelectSession());
    }

    /**
     * 开始匹配
     */
    @PostMapping("/matchmaking/start")
    public ApiResponse<Void> startMatchmaking() {
        gameFlowService.startMatchmaking();
        return ApiResponse.success();
    }

    /**
     * 取消匹配
     */
    @PostMapping("/matchmaking/cancel")
    public ApiResponse<Void> cancelMatchmaking() {
        gameFlowService.cancelMatchmaking();
        return ApiResponse.success();
    }

    /**
     * 接受对局
     */
    @PostMapping("/accept")
    public ApiResponse<Void> acceptMatch() {
        gameFlowService.acceptMatch();
        return ApiResponse.success();
    }

    /**
     * 检查连接状态
     */
    @GetMapping("/connected")
    public ApiResponse<Boolean> isConnected() {
        return ApiResponse.success(lcuHttpClient.isConnected());
    }

    /**
     * 获取完整会话数据（包含双方队伍所有玩家信息）
     * @param mode 队列模式（可选，<=0 表示全部）
     * @return 完整会话数据
     */
    @GetMapping("/data")
    public ApiResponse<SessionData> getSessionData(
            @RequestParam(required = false) Integer mode,
            @RequestParam(defaultValue = "false") boolean forceRefresh) {
        return ApiResponse.success(sessionAnalysisService.getSessionData(mode, forceRefresh));
    }
}
