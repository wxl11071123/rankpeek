package io.rankpeek.cost;

import java.util.List;

public record CostEventListResponse(
        List<CostEvent> items
) {
}
