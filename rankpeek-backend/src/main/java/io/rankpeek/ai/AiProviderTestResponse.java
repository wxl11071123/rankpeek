package io.rankpeek.ai;

public record AiProviderTestResponse(
        boolean configured,
        String providerId,
        String model,
        String message
) {
}
