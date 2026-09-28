package io.rankpeek.cost;

import io.rankpeek.ai.AiTokenUsage;

import java.math.BigDecimal;

public record AiCostBreakdown(
        AiTokenUsage usage,
        AiPricing pricing,
        String currency,
        BigDecimal inputCacheHitCny,
        BigDecimal inputCacheMissCny,
        BigDecimal outputCny,
        BigDecimal totalCny
) {
}
