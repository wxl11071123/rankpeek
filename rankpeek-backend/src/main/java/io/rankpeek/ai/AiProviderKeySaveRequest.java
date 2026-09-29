package io.rankpeek.ai;

public record AiProviderKeySaveRequest(
        String providerId,
        String baseUrl,
        String name,
        String apiKey
) {
}
