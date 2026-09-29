package io.rankpeek.cost;

import io.rankpeek.ai.AiTokenUsage;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class AiCostCalculatorTest {

    private final AiCostCalculator calculator = new AiCostCalculator();

    @Test
    void calculatesDeepSeekV4FlashMainlandCost() {
        AiCostBreakdown cost = calculator.calculate(
                new AiTokenUsage("deepseek", "deepseek-v4-flash", 300, 300, 600, 100, 200),
                AiPricingCatalog.forModel("deepseek", "deepseek-v4-flash").orElseThrow()
        );

        assertThat(cost.inputCacheHitCny()).isEqualByComparingTo("0.000002");
        assertThat(cost.inputCacheMissCny()).isEqualByComparingTo("0.0002");
        assertThat(cost.outputCny()).isEqualByComparingTo("0.0006");
        assertThat(cost.totalCny()).isEqualByComparingTo("0.000802");
    }

    @Test
    void calculatesDeepSeekV4ProMainlandCost() {
        AiCostBreakdown cost = calculator.calculate(
                new AiTokenUsage("deepseek", "deepseek-v4-pro", 300, 300, 600, 100, 200),
                AiPricingCatalog.forModel("deepseek", "deepseek-v4-pro").orElseThrow()
        );

        assertThat(cost.inputCacheHitCny()).isEqualByComparingTo("0.0000025");
        assertThat(cost.inputCacheMissCny()).isEqualByComparingTo("0.0006");
        assertThat(cost.outputCny()).isEqualByComparingTo("0.0018");
        assertThat(cost.totalCny()).isEqualByComparingTo("0.0024025");
    }

    @Test
    void calculatesCustomPricingWithSamePerMillionFormula() {
        AiCostBreakdown cost = calculator.calculate(
                new AiTokenUsage("custom", "free-model", 200, 300, 500, 100, 200),
                new AiPricing(
                        "custom",
                        "free-model",
                        "CNY",
                        BigDecimal.ZERO,
                        new BigDecimal("2"),
                        new BigDecimal("8")
                )
        );

        assertThat(cost.inputCacheHitCny()).isEqualByComparingTo("0");
        assertThat(cost.inputCacheMissCny()).isEqualByComparingTo("0.0004");
        assertThat(cost.outputCny()).isEqualByComparingTo("0.0024");
        assertThat(cost.totalCny()).isEqualByComparingTo("0.0028");
    }

    @Test
    void unknownPricingKeepsUsageAndLeavesCostUnknown() {
        AiTokenUsage usage = new AiTokenUsage("unknown", "free-model", 10, 5, 15, 0, 10);

        AiCostBreakdown cost = calculator.unknown(usage);

        assertThat(cost.totalCny()).isNull();
        assertThat(cost.usage()).isEqualTo(usage);
    }
}
