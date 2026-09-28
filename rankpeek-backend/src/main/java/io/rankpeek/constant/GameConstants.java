package io.rankpeek.constant;

import java.util.Map;

/**
 * 游戏相关常量
 */
public class GameConstants {

    /**
     * 服务器 ID 到中文名映射
     */
    public static final Map<String, String> SERVER_ID_TO_NAME = Map.ofEntries(
            Map.entry("HN1", "艾欧尼亚"),
            Map.entry("HN10", "黑色玫瑰"),
            Map.entry("TJ100", "联盟四区"),
            Map.entry("TJ101", "联盟五区"),
            Map.entry("NJ100", "联盟一区"),
            Map.entry("GZ100", "联盟二区"),
            Map.entry("CQ100", "联盟三区"),
            Map.entry("BGP2", "峡谷之巅"),
            Map.entry("PBE", "体验服"),
            Map.entry("TW2", "台湾"),
            Map.entry("SG2", "新加坡"),
            Map.entry("PH2", "菲律宾"),
            Map.entry("VN2", "越南")
    );

    /**
     * 段位英文到中文映射
     */
    public static final Map<String, String> TIER_EN_TO_CN = Map.ofEntries(
            Map.entry("UNRANKED", "无"),
            Map.entry("IRON", "坚韧黑铁"),
            Map.entry("BRONZE", "英勇黄铜"),
            Map.entry("SILVER", "不屈白银"),
            Map.entry("GOLD", "荣耀黄金"),
            Map.entry("PLATINUM", "华贵铂金"),
            Map.entry("EMERALD", "流光翡翠"),
            Map.entry("DIAMOND", "璀璨钻石"),
            Map.entry("MASTER", "超凡大师"),
            Map.entry("GRANDMASTER", "傲世宗师"),
            Map.entry("CHALLENGER", "最强王者")
    );

    /**
     * 队列 ID 到中文名映射
     */
    public static final Map<Integer, String> QUEUE_ID_TO_CN = Map.ofEntries(
            Map.entry(0, "自定义"),
            Map.entry(420, "单排/双排"),
            Map.entry(440, "灵活排位"),
            Map.entry(430, "匹配模式"),
            Map.entry(450, "极地大乱斗"),
            Map.entry(460, "极地大乱斗（灵活）"),
            Map.entry(2400, "海克斯大乱斗"),
            Map.entry(700, "排位赛"),
            Map.entry(800, "扭曲丛林 - 人机"),
            Map.entry(810, "扭曲丛林 - 匹配"),
            Map.entry(820, "扭曲丛林 - 排位"),
            Map.entry(830, "人机 - 入门"),
            Map.entry(840, "人机 - 一般"),
            Map.entry(850, "人机 - 困难"),
            Map.entry(900, "极地大乱斗"),
            Map.entry(910, "水晶之痕"),
            Map.entry(920, "六杀模式"),
            Map.entry(940, "冠军杯赛"),
            Map.entry(950, "人机对战 - 血月杀"),
            Map.entry(960, "人机对战 - 星之守护者"),
            Map.entry(980, "虚拟试炼"),
            Map.entry(990, "Nexus Blitz"),
            Map.entry(1000, "奥德赛：提取"),
            Map.entry(1010, "入侵模式"),
            Map.entry(1020, "云顶之弈"),
            Map.entry(1030, "教程"),
            Map.entry(1040, "选人教程"),
            Map.entry(1050, "对战教程"),
            Map.entry(1060, "战斗教程"),
            Map.entry(1070, "试玩教程"),
            Map.entry(1090, "云顶之弈教程"),
            Map.entry(1100, "云顶之弈排位"),
            Map.entry(1110, "云顶之弈 - 匹配"),
            Map.entry(1130, "云顶之弈 - 超级排位"),
            Map.entry(1150, "斗魂竞技场"),
            Map.entry(1160, "斗魂竞技场 - 排位"),
            Map.entry(1170, "双城之战"),
            Map.entry(1180, "终极魔典"),
            Map.entry(1190, "终极魔典"),
            Map.entry(1200, "Nexus Blitz"),
            Map.entry(1300, "无视世界赛"),
            Map.entry(1400, "无视世界赛 - 排位"),
            Map.entry(1700, "斗魂竞技场"),
            Map.entry(1710, "斗魂竞技场 - 排位"),
            Map.entry(1900, "URF"),
            Map.entry(1910, "ARURF"),
            Map.entry(2000, "教程"),
            Map.entry(2010, "教程"),
            Map.entry(2020, "教程")
    );

    /**
     * 队列类型到中文名映射
     */
    public static final Map<String, String> QUEUE_TYPE_TO_CN = Map.ofEntries(
            Map.entry("ranked_solo_5x5", "单排/双排"),
            Map.entry("ranked_flex_sr", "灵活排位"),
            Map.entry("ranked_flex_tt", "扭曲丛林排位"),
            Map.entry("ranked_tft", "云顶之弈排位"),
            Map.entry("normal_5x5", "匹配模式"),
            Map.entry("normal_3x3", "扭曲丛林"),
            Map.entry("normal", "匹配模式"),
            Map.entry("aram", "极地大乱斗"),
            Map.entry("urf", "URF"),
            Map.entry("nexus_blitz", "Nexus Blitz"),
            Map.entry("custom", "自定义")
    );

    /**
     * 获取服务器中文名
     */
    public static String getServerName(String serverId) {
        if (serverId == null || serverId.isEmpty()) {
            return "暂无";
        }
        return SERVER_ID_TO_NAME.getOrDefault(serverId, serverId);
    }

    /**
     * 获取段位中文名
     */
    public static String getTierCnName(String tier) {
        if (tier == null || tier.isEmpty()) {
            return "无";
        }
        return TIER_EN_TO_CN.getOrDefault(tier.toUpperCase(), tier);
    }

    /**
     * 获取队列中文名
     */
    public static String getQueueCnName(Integer queueId) {
        if (queueId == null || queueId <= 0) {
            return "未知模式";
        }
        return QUEUE_ID_TO_CN.getOrDefault(queueId, "其他");
    }

    /**
     * 获取队列类型中文名
     */
    public static String getQueueTypeCnName(String queueType) {
        if (queueType == null || queueType.isEmpty()) {
            return "其他";
        }
        return QUEUE_TYPE_TO_CN.getOrDefault(queueType.toLowerCase(), "其他");
    }
}
