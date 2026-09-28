package io.rankpeek.model;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class MatchTimelineFetchResult {
    private Long gameId;
    private MatchTimeline timeline;
    private String rawDetailJson;
    private String rawTimelineJson;
    private String status;
    private String lastError;
}
