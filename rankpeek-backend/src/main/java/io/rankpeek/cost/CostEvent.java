package io.rankpeek.cost;

import java.math.BigDecimal;

public record CostEvent(
        long id,
        String eventType,
        String provider,
        String model,
        String source,
        BigDecimal amountCny,
        String currency,
        long quantity,
        String metadataRawJson,
        long createdAt
) {
}
