package io.rankpeek.constant;

/**
 * 队列类型工具类
 * 提供队列相关的判断方法
 */
public final class QueueType {

    // 队列 ID 常量
    public static final int QUEUE_SOLO_5X5 = 420;
    public static final int QUEUE_FLEX_SR = 440;
    public static final int QUEUE_NORMAL = 430;
    public static final int QUEUE_ARAM = 450;
    public static final int QUEUE_HEXTECH_ARAM = 2400;

    private QueueType() {}

    /**
     * 根据队列 ID 获取中文名称
     */
    public static String getQueueNameCn(Integer queueId) {
        return GameConstants.getQueueCnName(queueId);
    }

    /**
     * 判断是否是排位赛
     */
    public static boolean isRanked(Integer queueId) {
        if (queueId == null) return false;
        return queueId == QUEUE_SOLO_5X5 || queueId == QUEUE_FLEX_SR || queueId == 800 || queueId == 1020;
    }

    /**
     * 判断是否是大乱斗
     */
    public static boolean isAram(Integer queueId) {
        if (queueId == null) return false;
        return queueId == QUEUE_ARAM || queueId == 900 || queueId == QUEUE_HEXTECH_ARAM;
    }
}
