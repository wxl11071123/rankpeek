package io.rankpeek.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Cached match-history fetch result.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MatchHistoryFetchResult {

    @Builder.Default
    private List<MatchHistory> matches = new ArrayList<>();

    private boolean rawEmpty;

    @Builder.Default
    private Map<Long, String> rawSummaryJsonByGameId = new LinkedHashMap<>();
}
