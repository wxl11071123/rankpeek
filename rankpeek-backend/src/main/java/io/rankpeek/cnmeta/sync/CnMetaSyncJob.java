package io.rankpeek.cnmeta.sync;

import java.time.Instant;

public record CnMetaSyncJob(
        Long id,
        String source,
        String patchKey,
        Integer queueId,
        String tierScope,
        String role,
        String status,
        Instant startedAt,
        Instant finishedAt,
        String errorMessage,
        Integer requestCount,
        Integer rowCount,
        String contentHash,
        Instant createdAt
) {
}
