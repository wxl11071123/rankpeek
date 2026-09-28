package io.rankpeek.hextech;

import java.util.List;

/**
 * 英雄榜的一行：101 的英雄排名 + 该英雄的顶级强化（来自 aramgg 矩阵，按 rank 取前几个）。
 */
public record HextechChampionBoardRow(
        long championId,
        int winRank,
        String rankChangeText,
        double winRate,
        double pickRate,
        List<Augment> topAugments
) {

    /** 英雄榜里展示用的精简强化信息。 */
    public record Augment(
            long augmentId,
            String name,
            String rarity,
            String iconPath,
            String rank,
            String pickRate,
            String winRate
    ) {
    }
}
