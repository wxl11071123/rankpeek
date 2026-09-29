package io.rankpeek.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CacheStatus {

    public enum Health {
        OK,
        DISABLED,
        RECOVERED,
        CORRUPT,
        LOCKED,
        ERROR
    }

    private boolean enabled;
    private Health health;
    private String databasePath;
    private long databaseSizeBytes;
    private String lastError;
    private String lastRecoveryDirectory;
    private boolean databaseExists;
    private boolean lockFileExists;

    private long summonerCount;
    private long rankCount;
    private long matchCount;
    private long gameDetailCount;
    private long participantCount;
    private long playerMatchIndexCount;
    private long trackedPlayerCount;

    private Long latestMatchCreation;

    private long orphanMatchCount;
    private long orphanGameDetailCount;
    private long orphanParticipantCount;
    private long orphanDataScopeCount;
    private long quarantineCount;
    private long traceFileCount;
    private long corruptFileCount;
}
