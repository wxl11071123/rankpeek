package io.rankpeek.cost;

import java.math.BigDecimal;
import java.util.Locale;
import java.util.Optional;

public final class AiPricingCatalog {

    private AiPricingCatalog() {
    }

    public static Optional<AiPricing> forModel(String provider, String model) {
        String normalizedProvider = normalize(provider);
        String normalizedModel = normalize(model);
        if (!"deepseek".equals(normalizedProvider)) {
            return Optional.empty();
        }
        return switch (normalizedModel) {
            case "deepseek-v4-pro" -> Optional.of(new AiPricing(
                    "deepseek",
                    "deepseek-v4-pro",
                    "CNY",
                    new BigDecimal("0.025"),
                    new BigDecimal("3"),
                    new BigDecimal("6")
            ));
            case "deepseek-reasoner" -> Optional.of(new AiPricing(
                    "deepseek",
                    "deepseek-reasoner",
                    "CNY",
                    BigDecimal.ONE,
                    new BigDecimal("4"),
                    new BigDecimal("16")
            ));
            case "deepseek-v4-flash", "deepseek-chat" -> Optional.of(new AiPricing(
                    "deepseek",
                    normalizedModel,
                    "CNY",
                    new BigDecimal("0.02"),
                    BigDecimal.ONE,
                    new BigDecimal("2")
            ));
            default -> Optional.empty();
        };
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
