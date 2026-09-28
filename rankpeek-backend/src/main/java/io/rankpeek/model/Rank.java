package io.rankpeek.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

/**
 * 段位信息模型
 * 对应 LCU API: lol-ranked/v1/ranked-stats/{puuid}
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class Rank {

    @JsonProperty("queueMap")
    private QueueMap queueMap;

    /**
     * 各队列段位信息映射
     */
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class QueueMap {
        @JsonProperty("RANKED_SOLO_5x5")
        private QueueInfo rankedSolo5x5;

        @JsonProperty("RANKED_FLEX_SR")
        private QueueInfo rankedFlexSr;
    }

    /**
     * 单队列段位信息
     */
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class QueueInfo {
        /**
         * 队列类型
         */
        @JsonProperty("queueType")
        private String queueType;

        /**
         * 段位（如 GOLD, PLATINUM）
         */
        @JsonProperty("tier")
        private String tier;

        /**
         * 级别（如 I, II, III, IV）
         */
        @JsonProperty("division")
        private String division;

        /**
         * 胜点
         */
        @JsonProperty("leaguePoints")
        private Integer leaguePoints;

        /**
         * 胜场
         */
        @JsonProperty("wins")
        private Integer wins;

        /**
         * 败场 - 可能从 losses 或 games 字段获取
         */
        @JsonProperty("losses")
        private Integer losses;

        /**
         * 总场次（某些 API 版本可能只返回这个字段）
         */
        @JsonProperty("games")
        private Integer games;

        /**
         * 历史最高段位
         */
        @JsonProperty("highestTier")
        private String highestTier;

        /**
         * 历史最高级别
         */
        @JsonProperty("highestDivision")
        private String highestDivision;

        /**
         * 是否处于定级赛
         */
        @JsonProperty("isProvisional")
        private Boolean isProvisional;

        /**
         * 获取败场
         * 如果 API 没有返回 losses，尝试从 games - wins 计算
         */
        public Integer getLosses() {
            Integer derivedLosses = deriveLossesFromGames();
            if (derivedLosses != null) {
                return derivedLosses;
            }
            if (losses != null) {
                if (losses == 0 && getWins() > 0) {
                    return null;
                }
                return Math.max(0, losses);
            }
            return null;
        }

        /**
         * 获取胜场，确保不为 null
         */
        public Integer getWins() {
            return wins != null ? wins : 0;
        }

        /**
         * 获取显示用的段位字符串
         */
        public String getDisplayRank() {
            if (tier == null || tier.isEmpty() || "UNRANKED".equalsIgnoreCase(tier)) {
                return "未定级";
            }
            return tier + " " + (division != null && !"NA".equals(division) ? division : "") + " " + leaguePoints + "LP";
        }

        /**
         * 获取总场次
         */
        public Integer getTotalGames() {
            if (games != null && games >= 0) {
                return games;
            }
            Integer normalizedLosses = getLosses();
            if (normalizedLosses == null) {
                return null;
            }
            return getWins() + normalizedLosses;
        }

        /**
         * 计算胜率
         */
        public double calculateWinRate() {
            Integer total = getTotalGames();
            if (total == null || total == 0) return 0.0;
            return getWins() * 100.0 / total;
        }

        private Integer deriveLossesFromGames() {
            if (games != null && wins != null && games >= wins) {
                return games - wins;
            }
            return null;
        }
    }
}
