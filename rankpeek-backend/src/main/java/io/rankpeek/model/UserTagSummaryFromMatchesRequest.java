package io.rankpeek.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/**
 * Summary request that reuses already loaded match history.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class UserTagSummaryFromMatchesRequest {

    private String puuid;

    private Integer mode = 0;

    private List<MatchHistory> matches = new ArrayList<>();
}
