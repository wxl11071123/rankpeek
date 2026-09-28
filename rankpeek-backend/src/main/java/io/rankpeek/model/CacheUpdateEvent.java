package io.rankpeek.model;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class CacheUpdateEvent {

    private String type;
    private String puuid;
    private String reason;
    private List<String> updatedScopes;
    private long timestamp;
}
