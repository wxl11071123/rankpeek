package io.rankpeek.ai;

import java.math.BigDecimal;

public record AiProviderPricing(
        String currency,
        BigDecimal inputCacheHitCnyPerMillionTokens,
        BigDecimal inputCacheMissCnyPerMillionTokens,
        BigDecimal outputCnyPerMillionTokens
) {
}
