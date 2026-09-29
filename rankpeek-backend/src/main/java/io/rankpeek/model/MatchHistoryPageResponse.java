package io.rankpeek.model;

import com.fasterxml.jackson.annotation.JsonInclude;
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
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public class MatchHistoryPageResponse {

    @Builder.Default
    private List<MatchHistory> matches = new ArrayList<>();

    private int page;
    private int pageSize;
    private boolean hasNext;
    private String source;
    private RecordStatus recordStatus;
    private String sgpServerId;

    @Builder.Default
    private List<String> warnings = new ArrayList<>();
}
