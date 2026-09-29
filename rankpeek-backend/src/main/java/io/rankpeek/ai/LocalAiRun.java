package io.rankpeek.ai;

import java.math.BigDecimal;

public record LocalAiRun(
        long id,
        String endpoint,
        String provider,
        String model,
        String status,
        String requestHash,
        String requestRawJson,
        String responseRawJson,
        String errorCode,
        String errorMessage,
        long promptTokens,
        long promptCacheHitTokens,
        long promptCacheMissTokens,
        long completionTokens,
        long totalTokens,
        BigDecimal inputCacheHitCny,
        BigDecimal inputCacheMissCny,
        BigDecimal outputCny,
        BigDecimal totalCny,
        long createdAt,
        long updatedAt
) {
}
