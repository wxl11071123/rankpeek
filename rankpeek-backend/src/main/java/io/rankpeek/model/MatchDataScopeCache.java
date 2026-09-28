package io.rankpeek.model;

import lombok.Data;

@Data
public class MatchDataScopeCache {
    private Long gameId;
    private String source;
    private String rawSummaryJson;
    private String rawDetailJson;
    private String rawTimelineJson;
    private MatchTimeline timeline;
    private String summaryStatus;
    private String detailStatus;
    private String timelineStatus;
    private Long fetchedAt;
    private Integer schemaVersion;
    private String lastError;
    private Long updatedAt;
}
