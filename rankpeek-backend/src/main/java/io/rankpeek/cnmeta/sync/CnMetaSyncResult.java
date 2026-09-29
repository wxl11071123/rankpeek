package io.rankpeek.cnmeta.sync;

import java.time.Instant;

public record CnMetaSyncResult(
        Long jobId,
        String source,
        String patchKey,
        Integer queueId,
        String tierScope,
        String role,
        String status,
        Integer requestCount,
        Integer rowCount,
        String contentHash,
        String errorMessage,
        Instant startedAt,
        Instant finishedAt
) {
}
