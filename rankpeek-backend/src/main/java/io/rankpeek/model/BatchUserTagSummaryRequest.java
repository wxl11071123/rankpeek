package io.rankpeek.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/**
 * Batch summary request payload.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class BatchUserTagSummaryRequest {

    private Integer mode = 0;

    private List<String> puuids = new ArrayList<>();
}
