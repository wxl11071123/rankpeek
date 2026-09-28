package io.rankpeek.hextech.aramgg;

/**
 * aramgg 的"单英雄 × 单强化"统计（来自 /data/champion-augments/{championId}.json）。
 *
 * <p>腾讯源提供 tier/rank/pick_rate；winRate/numGames 来自 aramgg 客户端上传（全球），
 * 样本不足时为 null（实测安妮 108 条中 10 条为 null）。
 */
public record AramggChampionAugment(
        long augmentId,
        String tier,
        String rank,
        String total,
        String pickRate,
        String winRate,
        String numGames,
        String winRateSource,
        String winRateRegion
) {
}
