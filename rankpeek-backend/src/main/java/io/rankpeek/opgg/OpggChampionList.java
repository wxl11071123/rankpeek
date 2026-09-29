package io.rankpeek.opgg;

import java.time.Instant;
import java.util.List;

public record OpggChampionList(
        String mode,
        String region,
        String tier,
        String version,
        Instant updatedAt,
        List<OpggChampionListItem> items
) {
    public OpggChampionList {
        items = items == null ? List.of() : List.copyOf(items);
    }
}
