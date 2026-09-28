package io.rankpeek.ai;

public record LocalAiRunResponse(
        long id,
        String endpoint,
        String provider,
        String model,
        String status,
        String requestHash,
        String responseRawJson,
        String errorCode,
        String errorMessage,
        long promptTokens,
        long promptCacheHitTokens,
        long promptCacheMissTokens,
        long completionTokens,
        long totalTokens,
        long createdAt,
        long updatedAt
) {
    public static LocalAiRunResponse from(LocalAiRun run) {
        return new LocalAiRunResponse(
                run.id(),
                run.endpoint(),
                run.provider(),
                run.model(),
                run.status(),
                run.requestHash(),
                run.responseRawJson(),
                run.errorCode(),
                run.errorMessage(),
                run.promptTokens(),
                run.promptCacheHitTokens(),
                run.promptCacheMissTokens(),
                run.completionTokens(),
                run.totalTokens(),
                run.createdAt(),
                run.updatedAt()
        );
    }
}
