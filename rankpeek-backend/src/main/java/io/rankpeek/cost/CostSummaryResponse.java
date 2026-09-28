package io.rankpeek.cost;

import java.math.BigDecimal;
import java.time.LocalDate;

public record CostSummaryResponse(
        LocalDate from,
        LocalDate to,
        BigDecimal totalCostCny
) {
}
