package io.rankpeek.hextech.aramgg;

/**
 * aramgg 的全局强化统计（来自 /data/augments-stats-raw.json 的 stats_json）。
 *
 * <p>注意双源：{@code source/region} 描述 tier/rank/pick_rate 的来源（腾讯国服），
 * {@code winRateSource/winRateRegion} 描述胜率的来源（aramgg 客户端上传，全球口径）。
 * 腾讯源不提供单英雄胜率与样本量，相关字段可能为 null —— 不要当成 0。
 */
public record AramggAugmentStat(
        long augmentId,
        String tier,
        String pickRate,
        String winRate,
        String numGames,
        String winRank,
        String winRankDelta,
        String useRank,
        String useRankDelta,
        String source,
        String region
) {
}
