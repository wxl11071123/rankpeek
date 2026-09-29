package io.rankpeek.opgg;

import java.util.List;

public record OpggBuildOption(
        String label,
        List<Integer> ids,
        List<Integer> order,
        Long games,
        Double winRate,
        Double pickRate
) {
    public OpggBuildOption {
        ids = ids == null ? List.of() : List.copyOf(ids);
        order = order == null ? List.of() : List.copyOf(order);
    }
}
