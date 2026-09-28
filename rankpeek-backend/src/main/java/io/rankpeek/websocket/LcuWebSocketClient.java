package io.rankpeek.websocket;

import io.rankpeek.model.AuthInfo;
import io.rankpeek.service.LcuHttpClient;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;
import org.springframework.stereotype.Service;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.net.URI;
import java.security.cert.X509Certificate;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;

@Service
@Slf4j
public class LcuWebSocketClient {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final List<Consumer<LcuEvent>> listeners = new CopyOnWriteArrayList<>();
    private final LcuHttpClient lcuHttpClient;

    private volatile WebSocketClient webSocketClient;
    private volatile AuthInfo authInfo;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private final AtomicBoolean connecting = new AtomicBoolean(false);
    private final AtomicInteger reconnectAttempts = new AtomicInteger(0);

    private ScheduledExecutorService scheduler;
    private ScheduledExecutorService heartbeatScheduler;
    private static final int MAX_RECONNECT_DELAY = 30;
    private static final int HEARTBEAT_INTERVAL = 30;
    private static final int CONNECT_TIMEOUT = 10000;

    public LcuWebSocketClient(LcuHttpClient lcuHttpClient) {
        this.lcuHttpClient = lcuHttpClient;
    }

    public record LcuEvent(String uri, JsonNode data, String eventType) {}

    public void addListener(Consumer<LcuEvent> listener) {
        listeners.add(listener);
    }

    public void removeListener(Consumer<LcuEvent> listener) {
        listeners.remove(listener);
    }

    public void connect(AuthInfo authInfo) {
        this.authInfo = authInfo;

        if (!running.get()) {
            running.set(true);
            reconnectAttempts.set(0);
            startScheduler();
        }

        if (!connecting.get() && !isConnected()) {
            scheduleConnect(0);
        }
    }

    private void startScheduler() {
        if (scheduler != null && !scheduler.isShutdown()) {
            return;
        }
        scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "lcu-websocket-reconnect");
            t.setDaemon(true);
            return t;
        });
    }

    private void stopSchedulers() {
        if (scheduler != null && !scheduler.isShutdown()) {
            scheduler.shutdown();
            scheduler = null;
        }
        stopHeartbeat();
    }

    private void scheduleConnect(int delaySeconds) {
        if (!running.get()) {
            return;
        }

        int delay = delaySeconds > 0 ? delaySeconds : Math.min(reconnectAttempts.get() * 2, MAX_RECONNECT_DELAY);
        log.debug("计划在 {} 秒后连接 WebSocket", delay);

        if (scheduler == null || scheduler.isShutdown()) {
            startScheduler();
        }

        scheduler.schedule(() -> {
            if (running.get() && !connecting.get() && !isConnected()) {
                doConnectAsync();
            }
        }, delay, TimeUnit.SECONDS);
    }

    private void doConnectAsync() {
        if (!connecting.compareAndSet(false, true)) {
            return;
        }

        try {
            AuthInfo currentAuth = lcuHttpClient.getOrRefreshAuth();
            if (currentAuth == null) {
                log.warn("无法获取认证信息，稍后重试");
                reconnectAttempts.incrementAndGet();
                scheduleConnect(-1);
                return;
            }

            this.authInfo = currentAuth;
            doConnect(currentAuth);
        } catch (Exception e) {
            log.error("连接准备失败: {}", e.getMessage());
            reconnectAttempts.incrementAndGet();
            scheduleConnect(-1);
        } finally {
            connecting.set(false);
        }
    }

    private void doConnect(AuthInfo auth) throws Exception {
        String wsUrl = auth.buildWsUrl();
        log.info("正在连接 LCU WebSocket: {}", wsUrl);

        SSLContext sslContext = SSLContext.getInstance("TLS");
        sslContext.init(null, new TrustManager[]{new X509TrustManager() {
            @Override
            public void checkClientTrusted(X509Certificate[] chain, String authType) {}
            @Override
            public void checkServerTrusted(X509Certificate[] chain, String authType) {}
            @Override
            public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
        }}, new java.security.SecureRandom());

        String authHeader = auth.toBasicAuth();

        WebSocketClient newClient = new WebSocketClient(URI.create(wsUrl)) {
            @Override
            public void onOpen(ServerHandshake handshake) {
                log.info("LCU WebSocket 已连接");
                reconnectAttempts.set(0);
                startHeartbeat();

                send("[5,\"OnJsonApiEvent\"]");
                log.debug("已订阅 OnJsonApiEvent");

                send("[5,\"OnJsonApiEvent_lol-gameflow_v1_gameflow-phase\"]");
                send("[5,\"OnJsonApiEvent_lol-champ-select_v1_session\"]");
                send("[5,\"OnJsonApiEvent_lol-lobby_v2_lobby\"]");
                log.debug("已订阅关键事件");
            }

            @Override
            public void onMessage(String message) {
                if (message == null || message.isEmpty()) {
                    return;
                }
                try {
                    JsonNode root = objectMapper.readTree(message);
                    if (root.isArray() && root.size() >= 3) {
                        int opcode = root.get(0).asInt();
                        String eventName = root.get(1).asText();
                        if (opcode == 8 && eventName.startsWith("OnJsonApiEvent")) {
                            handleEvent(root.get(2));
                        }
                    }
                } catch (Exception e) {
                    log.debug("解析 WebSocket 消息失败: {}", e.getMessage());
                }
            }

            @Override
            public void onClose(int code, String reason, boolean remote) {
                log.info("LCU WebSocket 已关闭: code={}, reason={}, remote={}", code, reason, remote);
                stopHeartbeat();

                if (running.get()) {
                    reconnectAttempts.incrementAndGet();
                    int delay = Math.min(reconnectAttempts.get() * 2, MAX_RECONNECT_DELAY);
                    log.info("将在 {} 秒后尝试重新连接...", delay);
                    scheduleConnect(delay);
                }
            }

            @Override
            public void onError(Exception ex) {
                log.warn("LCU WebSocket 错误: {}", ex.getMessage());
            }
        };

        newClient.setSocketFactory(sslContext.getSocketFactory());
        newClient.addHeader("Authorization", authHeader);
        newClient.setConnectionLostTimeout(HEARTBEAT_INTERVAL);

        closeWebSocket();
        webSocketClient = newClient;
        newClient.connectBlocking(CONNECT_TIMEOUT, TimeUnit.MILLISECONDS);
    }

    private void startHeartbeat() {
        stopHeartbeat();

        heartbeatScheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "lcu-websocket-heartbeat");
            t.setDaemon(true);
            return t;
        });

        heartbeatScheduler.scheduleAtFixedRate(() -> {
            try {
                if (webSocketClient != null && webSocketClient.isOpen()) {
                    webSocketClient.sendPing();
                    log.trace("发送 Ping");
                }
            } catch (Exception e) {
                log.debug("Ping 发送失败: {}", e.getMessage());
            }
        }, HEARTBEAT_INTERVAL, HEARTBEAT_INTERVAL, TimeUnit.SECONDS);
    }

    private void stopHeartbeat() {
        if (heartbeatScheduler != null && !heartbeatScheduler.isShutdown()) {
            heartbeatScheduler.shutdown();
            heartbeatScheduler = null;
        }
    }

    private void handleEvent(JsonNode eventData) {
        try {
            String uri = eventData.has("uri") ? eventData.get("uri").asText() : null;
            String eventType = eventData.has("eventType") ? eventData.get("eventType").asText() : null;
            JsonNode data = eventData.has("data") ? eventData.get("data") : null;

            if (uri != null && isInterestingEvent(uri)) {
                log.debug("收到 LCU 事件: uri={}, eventType={}", uri, eventType);
                LcuEvent event = new LcuEvent(uri, data, eventType);

                for (Consumer<LcuEvent> listener : listeners) {
                    try {
                        listener.accept(event);
                    } catch (Exception e) {
                        log.error("事件处理器错误: {}", e.getMessage());
                    }
                }
            }
        } catch (Exception e) {
            log.error("处理事件失败: {}", e.getMessage());
        }
    }

    private boolean isInterestingEvent(String uri) {
        return uri != null && (
            uri.equals("/lol-gameflow/v1/gameflow-phase") ||
            uri.startsWith("/lol-champ-select/") ||
            uri.startsWith("/lol-lobby/") ||
            uri.equals("/lol-gameflow/v1/session")
        );
    }

    private void closeWebSocket() {
        WebSocketClient oldClient = webSocketClient;
        webSocketClient = null;
        if (oldClient != null) {
            try {
                oldClient.closeBlocking();
            } catch (Exception e) {
                log.debug("关闭旧 WebSocket 时出错: {}", e.getMessage());
            }
        }
    }

    public void disconnect() {
        running.set(false);
        closeWebSocket();
        stopSchedulers();
        log.info("LCU WebSocket 已断开");
    }

    public boolean isConnected() {
        WebSocketClient client = webSocketClient;
        return running.get() && client != null && client.isOpen();
    }

    public int getReconnectAttempts() {
        return reconnectAttempts.get();
    }

    public void forceReconnect() {
        log.info("强制重新连接 LCU WebSocket");
        closeWebSocket();
        stopHeartbeat();
        reconnectAttempts.set(0);
        scheduleConnect(0);
    }
}
