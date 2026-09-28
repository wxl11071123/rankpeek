package io.rankpeek.hextech;

import java.time.Instant;
import java.util.List;

/**
 * 一次抓取的完整快照（101 的数据按日更新，dataDate 为腾讯的统计日期，形如 20260925）。
 */
public record HextechSnapshot(
        String dataDate,
        String source,
        Instant fetchedAt,
        List<HextechAugmentRank> augments,
        List<HextechChampionRank> champions
) {

    public static HextechSnapshot empty() {
        return new HextechSnapshot(null, null, null, List.of(), List.of());
    }

    public boolean isEmpty() {
        return augments.isEmpty() && champions.isEmpty();
    }
}
