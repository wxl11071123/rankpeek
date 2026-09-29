package io.rankpeek.ai;

import java.util.Map;

public record PostgameAnalysisRequest(
        String mode,
        String snapshotSchemaVersion,
        Map<String, Object> snapshot
) {
}
