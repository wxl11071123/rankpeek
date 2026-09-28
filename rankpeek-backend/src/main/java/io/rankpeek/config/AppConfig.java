package io.rankpeek.config;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import lombok.Data;

/**
 * 应用配置
 */
@Data
@Configuration
@ConfigurationProperties(prefix = "app")
public class AppConfig {

    /**
     * 设置项
     */
    private Settings settings = new Settings();

    /**
     * 动态配置存储
     */
    private final Map<String, Object> dynamicConfig = new ConcurrentHashMap<>();

    @Data
    public static class Settings {
        private Match match = new Match();
    }

    @Data
    public static class Match {
        /**
         * 战绩查询默认队列模式
         * 0=全部, 420=单双排, 440=灵活排位, 430=匹配, 450=大乱斗, 2400=海克斯大乱斗
         */
        private int defaultQueueMode = 0;
    }

    // ========== 便捷方法 ==========

    public int getDefaultMatchQueueMode() {
        return normalizeQueueMode(settings.getMatch().getDefaultQueueMode());
    }

    /**
     * 更新配置
     */
    public void updateConfig(String key, Object value) {
        dynamicConfig.put(key, value);

        // 同步更新内部设置
        updateInternalSettings(key, value);
    }

    private void updateInternalSettings(String key, Object value) {
        if ("settings".equals(key) && value instanceof Map<?, ?> settingsMap) {
            settingsMap.forEach((nestedKey, nestedValue) ->
                updateInternalSettings("settings." + nestedKey, nestedValue));
            return;
        }

        if ("settings.match".equals(key) && value instanceof Map<?, ?> matchMap) {
            matchMap.forEach((nestedKey, nestedValue) ->
                updateInternalSettings("settings.match." + nestedKey, nestedValue));
            return;
        }

        if (key.startsWith("settings.match.")) {
            String matchKey = key.substring("settings.match.".length());

            switch (matchKey) {
                case "defaultQueueMode" -> settings.getMatch().setDefaultQueueMode(normalizeQueueMode(toInt(value)));
            }
        }
    }

    private int toInt(Object value) {
        if (value instanceof Number n)
            return n.intValue();
        if (value instanceof String s) {
            try {
                return Integer.parseInt(s);
            } catch (NumberFormatException e) {
                return 0;
            }
        }
        if (value instanceof Map<?, ?> m && m.containsKey("value")) {
            return toInt(m.get("value"));
        }
        return 0;
    }

    private int normalizeQueueMode(int queueMode) {
        return switch (queueMode) {
            case 0, 420, 440, 430, 450, 2400 -> queueMode;
            default -> 0;
        };
    }

}
