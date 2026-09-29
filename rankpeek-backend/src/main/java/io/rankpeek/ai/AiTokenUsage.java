package io.rankpeek.ai;

public record AiTokenUsage(
        String provider,
        String model,
        long promptTokens,
        long completionTokens,
        long totalTokens,
        long promptCacheHitTokens,
        long promptCacheMissTokens
) {
}
