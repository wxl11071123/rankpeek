package io.rankpeek.ai;

public record AiProviderSettingsSaveRequest(
        boolean enabled,
        String providerId,
        String baseUrl,
        String model,
        String apiKey,
        String apiKeyId,
        boolean saveApiKey,
        boolean webSearchEnabled,
        boolean deepThinkingEnabled,
        AiProviderPricing pricing
) {
}
