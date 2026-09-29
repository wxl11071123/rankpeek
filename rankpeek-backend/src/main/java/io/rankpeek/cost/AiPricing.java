package io.rankpeek.cost;

import java.math.BigDecimal;

public record AiPricing(
        String provider,
        String model,
        String currency,
        BigDecimal inputCacheHitCnyPerMillionTokens,
        BigDecimal inputCacheMissCnyPerMillionTokens,
        BigDecimal outputCnyPerMillionTokens
) {
}
