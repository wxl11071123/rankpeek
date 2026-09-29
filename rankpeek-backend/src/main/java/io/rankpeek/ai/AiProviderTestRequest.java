package io.rankpeek.ai;

public record AiProviderTestRequest(
        String providerId,
        String baseUrl,
        String model,
        String apiKey,
        String apiKeyId
) {
}
