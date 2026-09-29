package io.rankpeek.cost;

import java.math.BigDecimal;

public record CostRollup(
        String currentMonthKey,
        BigDecimal currentMonthTotalCny,
        String lastMonthKey,
        BigDecimal lastMonthTotalCny,
        String todayKey,
        BigDecimal todayTotalCny,
        long coachCount,
        BigDecimal coachTotalCny,
        long pregameCount,
        BigDecimal pregameTotalCny,
        long postgameCount,
        BigDecimal postgameTotalCny,
        long updatedAt
) {
}
