package io.rankpeek.hextech;

import java.util.List;

/**
 * 强化榜的一行：101 的排名数据 + 本地定义（名称/稀有度/描述/图标）。
 *
 * <p>本地定义来自 LCU 的 cherry-augments（211 个海斗强化 100% 命中），因此前端一次请求即可拿到展示所需的全部字段。
 */
public record HextechAugmentBoardRow(
        long augmentId,
        String name,
        String rarity,
        String description,
        String iconPath,
        double winRate,
        int winRank,
        int winRankChange,
        double pickRate,
        int pickRank,
        int pickRankChange,
        List<Long> bestChampionIds
) {
}
