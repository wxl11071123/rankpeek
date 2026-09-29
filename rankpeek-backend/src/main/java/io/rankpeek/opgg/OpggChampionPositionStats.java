package io.rankpeek.opgg;

import java.util.List;

public record OpggChampionPositionStats(
        String position,
        Integer tier,
        Integer rank,
        OpggChampionStats stats,
        List<OpggChampionCounter> counters
) {
    public OpggChampionPositionStats {
        counters = counters == null ? List.of() : List.copyOf(counters);
    }
}
