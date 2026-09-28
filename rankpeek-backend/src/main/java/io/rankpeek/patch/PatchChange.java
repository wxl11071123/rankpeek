package io.rankpeek.patch;

import java.math.BigDecimal;
import java.time.Instant;

public record PatchChange(
        Long id,
        String patchKey,
        String targetType,
        String targetKey,
        String targetName,
        String changeType,
        String field,
        String beforeValue,
        String afterValue,
        String summaryZh,
        String summaryEn,
        BigDecimal confidence,
        Instant createdAt
) {
}
