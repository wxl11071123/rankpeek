package io.rankpeek.model;

public record SystemIdentity(
        long pid,
        String localDataRoot,
        String cacheDatabasePath,
        String startedAt,
        String instanceId
) {
}
