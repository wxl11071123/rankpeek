package io.rankpeek.cnmeta.sync;

import java.time.LocalDate;
import java.util.List;

public record CnMetaSourcePayload(
        String source,
        String sourceUrl,
        String requestKey,
        Integer httpStatus,
        String rawContent,
        LocalDate dataDate,
        List<CnMetaChampionStatRow> rows
) {
    public CnMetaSourcePayload {
        rows = rows == null ? List.of() : List.copyOf(rows);
    }
}
