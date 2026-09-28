package io.rankpeek.ai;

import java.util.Map;

public record CoachSummaryAnalysisResponse(
        Map<String, Object> report,
        AiTokenUsage usage
) {
}
