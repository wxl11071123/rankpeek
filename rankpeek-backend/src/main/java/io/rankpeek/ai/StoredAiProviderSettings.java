package io.rankpeek.ai;

record StoredAiProviderSettings(
        boolean enabled,
        String providerId,
        String baseUrl,
        String model,
        String apiKeyEncrypted,
        String apiKeyMasked,
        String selectedApiKeyId,
        boolean webSearchEnabled,
        boolean deepThinkingEnabled,
        String pricingRawJson,
        long updatedAt
) {
}
