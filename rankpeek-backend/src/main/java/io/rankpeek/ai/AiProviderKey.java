package io.rankpeek.ai;

public record AiProviderKey(
        String id,
        String providerId,
        String baseUrl,
        String name,
        String apiKeyMasked,
        long createdAt,
        long updatedAt
) {
}
