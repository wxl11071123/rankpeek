package io.rankpeek.patch;

import java.time.Instant;
import java.time.LocalDate;

public record PatchVersion(
        Long id,
        String patchKey,
        String ddragonVersion,
        String gameVersion,
        LocalDate releaseDate,
        String sourceStatus,
        Instant detectedAt,
        Instant publishedAt,
        String checksum
) {
}
