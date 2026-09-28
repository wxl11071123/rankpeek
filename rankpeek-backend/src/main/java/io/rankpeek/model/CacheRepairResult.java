package io.rankpeek.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CacheRepairResult {

    private boolean success;
    private boolean repaired;
    private CacheStatus.Health health;
    private String message;
    private String quarantineDirectory;
    private List<String> movedFiles;
    private String lastError;
    private long timestamp;
}
