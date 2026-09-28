package io.rankpeek.ai;

record StoredAiProviderKey(
        String id,
        String providerId,
        String baseUrl,
        String name,
        String apiKeyEncrypted,
        String apiKeyMasked,
        long createdAt,
        long updatedAt
) {
}
