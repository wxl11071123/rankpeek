package io.rankpeek.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@Builder(toBuilder = true)
@NoArgsConstructor
@AllArgsConstructor
public class ScoutTagSample {

    private String puuid;

    private Integer currentQueueId;

    @Builder.Default
    private List<MatchHistory> lookbackMatches = new ArrayList<>();

    @Builder.Default
    private List<MatchHistory> currentModeMatches = new ArrayList<>();

    private String source;
}
