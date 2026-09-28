package io.rankpeek.hextech;

import java.util.List;

/**
 * 单个英雄的海斗详情：101 的英雄排名 + aramgg 的强化矩阵（已合并本地定义）。
 *
 * <p>数据口径提醒：{@code tier/rank/pickRate} 来自腾讯国服统计，{@code winRate/numGames} 来自
 * aramgg 客户端上传（全球口径），样本不足时 winRate 为 null —— 前端不要当成 0。
 */
public record HextechChampionDetail(
        long championId,
        Integer winRank,
        String rankChangeText,
        Double winRate,
        Double pickRate,
        String matrixSource,
        String matrixRegion,
        List<AugmentRow> augments
) {

    /** 该英雄身上的一个强化。 */
    public record AugmentRow(
            long augmentId,
            String name,
            String rarity,
            String iconPath,
            String tier,
            String rank,
            String total,
            String pickRate,
            String winRate,
            String numGames,
            String winRateRegion,
            /** 自建层：国服该英雄该强化的胜率（玩家贡献，未同意贡献时为 null）。 */
            String selfWinRate,
            /** 自建层：样本局数。 */
            String selfGames
    ) {
    }
}
