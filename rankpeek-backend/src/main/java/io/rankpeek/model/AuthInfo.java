package io.rankpeek.model;

import lombok.Data;

import java.util.Base64;

/**
 * LCU 认证信息
 */
@Data
public class AuthInfo {
    /**
     * 认证 Token
     */
    private String token;

    /**
     * LCU 服务端口
     */
    private String port;

    /**
     * 进程 PID
     */
    private Integer pid;

    /**
     * 生成 Basic Auth 头
     */
    public String toBasicAuth() {
        String credentials = "riot:%s".formatted(token);
        return "Basic %s".formatted(Base64.getEncoder().encodeToString(credentials.getBytes()));
    }

    /**
     * 构建 LCU URL
     */
    public String buildUrl(String uri) {
        String path = uri.startsWith("/") ? uri.substring(1) : uri;
        return String.format("https://127.0.0.1:%s/%s", port, path);
    }

    /**
     * 构建 WebSocket URL
     */
    public String buildWsUrl() {
        return String.format("wss://127.0.0.1:%s", port);
    }

    /**
     * 检查是否有效
     */
    public boolean isValid() {
        return token != null && !token.isEmpty() && port != null && !port.isEmpty();
    }
}
