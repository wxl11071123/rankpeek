package io.rankpeek.hextech.aramgg;

import java.util.List;

/** 单个英雄的强化矩阵 + 元信息。 */
public record AramggChampionMatrix(
        long championId,
        String patch,
        String dataDate,
        String source,
        String region,
        List<AramggChampionAugment> augments
) {

    public boolean isEmpty() {
        return augments == null || augments.isEmpty();
    }
}
