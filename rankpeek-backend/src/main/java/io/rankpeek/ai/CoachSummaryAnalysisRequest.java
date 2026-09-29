package io.rankpeek.ai;

public record CoachSummaryAnalysisRequest(
        String inputHash,
        String snapshotSchemaVersion,
        String promptVersion,
        String dataQualityConfidence,
        String systemPrompt,
        String userPrompt
) {
}
