package io.rankpeek.service;

import io.rankpeek.event.ChampionSelectUpdatedEvent;
import io.rankpeek.event.GamePhaseChangedEvent;
import io.rankpeek.event.LobbyUpdatedEvent;
import io.rankpeek.model.Lobby;
import io.rankpeek.websocket.LcuWebSocketClient;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

@Service
@Slf4j
@RequiredArgsConstructor
public class LcuConnectionManager {

    private final LcuHttpClient lcuHttpClient;
    private final LcuWebSocketClient webSocketClient;
    private final ApplicationEventPublisher eventPublisher;

    private volatile String currentPhase;
    private final AtomicBoolean connected = new AtomicBoolean(false);
    private final AtomicInteger consecutiveFailures = new AtomicInteger(0);
    private ScheduledExecutorService scheduler;

    private static final int MAX_FAILURES_BEFORE_WARNING = 3;
    private static final int CONNECTION_CHECK_INTERVAL = 3;

    @EventListener(ApplicationReadyEvent.class)
    public void init() {
        log.info("初始化 LCU 连接管理器...");

        webSocketClient.addListener(this::handleLcuEvent);
        startConnectionMonitor();
    }

    @PreDestroy
    public void destroy() {
        log.info("关闭 LCU 连接管理器...");
        if (scheduler != null && !scheduler.isShutdown()) {
            scheduler.shutdown();
        }
        webSocketClient.disconnect();
    }

    private void startConnectionMonitor() {
        scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "lcu-connection-monitor");
            t.setDaemon(true);
            return t;
        });

        scheduler.scheduleAtFixedRate(() -> {
            try {
                boolean wasConnected = connected.get();
                boolean nowConnected = checkAndConnect();

                if (nowConnected) {
                    consecutiveFailures.set(0);
                } else {
                    int failures = consecutiveFailures.incrementAndGet();
                    if (failures == MAX_FAILURES_BEFORE_WARNING) {
                        log.warn("LCU connection check failed {} times: {}", failures, lcuHttpClient.getLastConnectionFailureReason());
                    }
                }

                if (nowConnected != wasConnected) {
                    connected.set(nowConnected);
                    log.info("LCU 连接状态变化: {} -> {}", wasConnected, nowConnected);
                    eventPublisher.publishEvent(new GamePhaseChangedEvent(this, null, currentPhase));
                }
            } catch (Exception e) {
                log.error("连接监控错误: {}", e.getMessage());
            }
        }, 0, CONNECTION_CHECK_INTERVAL, TimeUnit.SECONDS);
    }

    private boolean checkAndConnect() {
        try {
            if (!lcuHttpClient.isConnected()) {
                return false;
            }

            if (!webSocketClient.isConnected()) {
                var authInfo = lcuHttpClient.getOrRefreshAuth();
                if (authInfo != null) {
                    webSocketClient.connect(authInfo);
                    return true;
                }
                return false;
            }
            return true;
        } catch (Exception e) {
            log.debug("LCU 连接检查失败: {}", e.getMessage());
            return false;
        }
    }

    private void handleLcuEvent(LcuWebSocketClient.LcuEvent event) {
        String uri = event.uri();

        if ("/lol-gameflow/v1/gameflow-phase".equals(uri)) {
            if (event.data() != null && event.data().isTextual()) {
                String newPhase = event.data().asText();
                String oldPhase = currentPhase;
                currentPhase = newPhase;

                log.info("游戏阶段变化: {} -> {}", oldPhase, newPhase);
                eventPublisher.publishEvent(new GamePhaseChangedEvent(this, oldPhase, newPhase));
            }
        }

        if (uri != null && uri.startsWith("/lol-champ-select/")) {
            eventPublisher.publishEvent(new ChampionSelectUpdatedEvent(this, event.data()));
        }

        if (uri != null && uri.startsWith("/lol-lobby/")) {
            try {
                Lobby lobby = lcuHttpClient.get("lol-lobby/v2/lobby", Lobby.class);
                eventPublisher.publishEvent(new LobbyUpdatedEvent(this, lobby));
            } catch (Exception e) {
                log.debug("获取大厅数据失败: {}", e.getMessage());
            }
        }
    }

    public boolean isConnected() {
        return connected.get();
    }

    public String getCurrentPhase() {
        return currentPhase;
    }

    public int getConsecutiveFailures() {
        return consecutiveFailures.get();
    }
}
