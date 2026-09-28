package io.rankpeek.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/**
 * Lightweight tag summary for list and session views.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserTagSummary {

    @Builder.Default
    private RecordStatus recordStatus = RecordStatus.NORMAL;

    private RecentData recentData;

    @Builder.Default
    private List<RankTag> tag = new ArrayList<>();
}
