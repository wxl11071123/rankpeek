package io.rankpeek.cnmeta.sync;

import java.time.Instant;

public record CnMetaSourceDocument(
        Long id,
        Long syncJobId,
        String source,
        String sourceUrl,
        String requestKey,
        Integer httpStatus,
        String rawContent,
        String contentHash,
        Instant fetchedAt,
        Instant createdAt
) {
}
