package io.rankpeek.ai;

import java.util.List;

public record AiProviderProfile(
        String id,
        String label,
        String dialect,
        String defaultBaseUrl,
        List<String> models,
        String apiKeyUrl,
        boolean supportsWebSearch,
        boolean supportsDeepThinking
) {
}
