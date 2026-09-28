package io.rankpeek.ai;

public record AiProviderSettings(
        boolean enabled,
        String providerId,
        String baseUrl,
        String model,
        String apiKeyId,
        boolean apiKeySaved,
        String apiKeyMasked,
        boolean webSearchEnabled,
        boolean deepThinkingEnabled,
        AiProviderPricing pricing
) {
}
