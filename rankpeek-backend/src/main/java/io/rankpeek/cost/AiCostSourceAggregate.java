package io.rankpeek.cost;

import java.math.BigDecimal;

public record AiCostSourceAggregate(
        String source,
        long count,
        BigDecimal totalCostCny
) {
}
