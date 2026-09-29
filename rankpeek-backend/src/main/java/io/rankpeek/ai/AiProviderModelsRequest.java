package io.rankpeek.ai;

public record AiProviderModelsRequest(
        String providerId,
        String baseUrl,
        String apiKey,
        String apiKeyId
) {
}
