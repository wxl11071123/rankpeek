package io.rankpeek.cost;

import io.rankpeek.ai.AiTokenUsage;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;

@Component
public class AiCostCalculator {

    private static final BigDecimal ONE_MILLION = new BigDecimal("1000000");

    public AiCostBreakdown calculate(AiTokenUsage usage, AiPricing pricing) {
        if (pricing == null) {
            return unknown(usage);
        }
        BigDecimal inputCacheHitCny = cost(usage.promptCacheHitTokens(), pricing.inputCacheHitCnyPerMillionTokens());
        BigDecimal inputCacheMissCny = cost(usage.promptCacheMissTokens(), pricing.inputCacheMissCnyPerMillionTokens());
        BigDecimal outputCny = cost(usage.completionTokens(), pricing.outputCnyPerMillionTokens());
        return new AiCostBreakdown(
                usage,
                pricing,
                pricing.currency(),
                inputCacheHitCny,
                inputCacheMissCny,
                outputCny,
                inputCacheHitCny.add(inputCacheMissCny).add(outputCny).stripTrailingZeros()
        );
    }

    public AiCostBreakdown unknown(AiTokenUsage usage) {
        return new AiCostBreakdown(usage, null, "CNY", null, null, null, null);
    }

    private BigDecimal cost(long tokens, BigDecimal cnyPerMillionTokens) {
        if (tokens <= 0 || cnyPerMillionTokens == null) {
            return BigDecimal.ZERO;
        }
        return BigDecimal.valueOf(tokens)
                .multiply(cnyPerMillionTokens)
                .divide(ONE_MILLION, 18, RoundingMode.HALF_UP)
                .stripTrailingZeros();
    }
}
