package io.rankpeek.hextech;

import java.util.List;

/**
 * 海斗强化榜的一行（来源：101 / 腾讯国服公开统计）。
 *
 * <p>原始打包格式（101 的 augmentlist，字段以 {@code _} 分隔、条目以 {@code #} 分隔）：
 * <pre>
 *   id_level_pickRate_pickRank_pickRankChange_winRate_winRank_winRankChange_bestChampionIds
 * </pre>
 * 其中 {@code bestChampionIds} 是逗号分隔的英雄 ID 列表。
 */
public record HextechAugmentRank(
        long augmentId,
        double pickRate,
        int pickRank,
        int pickRankChange,
        double winRate,
        int winRank,
        int winRankChange,
        List<Long> bestChampionIds
) {
}
