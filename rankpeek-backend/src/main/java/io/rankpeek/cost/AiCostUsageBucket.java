package io.rankpeek.cost;

import java.math.BigDecimal;

public record AiCostUsageBucket(
        String key,
        long count,
        BigDecimal totalCostCny
) {
}
