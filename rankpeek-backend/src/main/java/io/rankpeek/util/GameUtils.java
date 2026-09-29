package io.rankpeek.util;

import io.rankpeek.constant.GameConstants;

/**
 * 游戏相关工具类
 */
public final class GameUtils {

    private GameUtils() {}

    /**
     * 格式化召唤师名称（带 tagLine）
     */
    public static String formatSummonerName(String gameName, String tagLine) {
        if (gameName == null || gameName.isEmpty()) {
            return "未知";
        }
        if (tagLine != null && !tagLine.isEmpty()) {
            return gameName + "#" + tagLine;
        }
        return gameName;
    }

    /**
     * 格式化段位显示
     */
    public static String formatTierDisplay(String tier, String division) {
        if (tier == null || tier.isEmpty() || "UNRANKED".equalsIgnoreCase(tier)) {
            return "未定级";
        }

        String tierCn = GameConstants.getTierCnName(tier);

        // 大师及以上没有段位
        if (isHighTier(tier)) {
            return tierCn;
        }

        return tierCn + " " + (division != null ? division : "");
    }

    /**
     * 格式化 LP 显示
     */
    public static String formatLpDisplay(Integer leaguePoints) {
        if (leaguePoints == null) {
            return "";
        }
        return leaguePoints + " LP";
    }

    /**
     * 计算胜率
     */
    public static int calculateWinRate(int wins, int losses) {
        int total = wins + losses;
        if (total == 0) {
            return 0;
        }
        return wins * 100 / total;
    }

    /**
     * 格式化胜率显示
     */
    public static String formatWinRateDisplay(int wins, int losses) {
        return calculateWinRate(wins, losses) + "%";
    }

    /**
     * 格式化 KDA
     */
    public static double calculateKda(int kills, int deaths, int assists) {
        if (deaths == 0) {
            return kills + assists;
        }
        return (double) (kills + assists) / deaths;
    }

    /**
     * 格式化 KDA 显示
     */
    public static String formatKdaDisplay(int kills, int deaths, int assists) {
        double kda = calculateKda(kills, deaths, assists);
        return String.format("%.1f", kda);
    }

    /**
     * 判断是否是高段位（大师及以上）
     */
    public static boolean isHighTier(String tier) {
        if (tier == null) return false;
        String upper = tier.toUpperCase();
        return "MASTER".equals(upper) || "GRANDMASTER".equals(upper) || "CHALLENGER".equals(upper);
    }

    /**
     * 格式化游戏时长（秒转为 mm:ss）
     */
    public static String formatGameDuration(int seconds) {
        int minutes = seconds / 60;
        int secs = seconds % 60;
        return String.format("%d:%02d", minutes, secs);
    }

    /**
     * 格式化游戏时长（秒转为中文）
     */
    public static String formatGameDurationCn(int seconds) {
        int minutes = seconds / 60;
        return minutes + "分钟";
    }
}
