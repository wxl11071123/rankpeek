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
public class CacheClearResult {

    private boolean success;
    private String scope;
    private String mode;
    private String message;
    private List<String> cleared;
    private List<Failure> failed;
    private long deletedRows;
    private long databaseSizeBeforeBytes;
    private long databaseSizeAfterBytes;
    private boolean compacted;
    private long retentionDeletedRows;
    private long timestamp;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Failure {
        private String name;
        private String message;
    }
}
