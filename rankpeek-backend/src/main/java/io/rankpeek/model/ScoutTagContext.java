package io.rankpeek.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ScoutTagContext {

    private String puuid;

    private Integer currentQueueId;

    private Integer currentChampionId;

    private String currentPosition;

    @Builder.Default
    private List<String> currentTeamPuuids = new ArrayList<>();
}
