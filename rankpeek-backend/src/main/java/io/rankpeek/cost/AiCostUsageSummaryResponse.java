package io.rankpeek.cost;

import java.util.List;

public record AiCostUsageSummaryResponse(
        List<AiCostUsageBucket> items
) {
}
