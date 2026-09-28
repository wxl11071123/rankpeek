package io.rankpeek.ai;

import java.util.List;
import java.util.Map;

public record PregameAnalysisRequest(
        String mode,
        String patchKey,
        Integer queueId,
        Integer championId,
        String role,
        List<String> allyTeamTags,
        List<String> enemyTeamTags,
        String snapshotSchemaVersion,
        Map<String, Object> snapshot
) {
}
