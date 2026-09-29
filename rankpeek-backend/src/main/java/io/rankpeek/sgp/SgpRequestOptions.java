package io.rankpeek.sgp;

import java.util.Map;

public record SgpRequestOptions(
        String sgpServerId,
        String baseUrl,
        String path,
        Map<String, String> queryParams
) {

    public SgpRequestOptions {
        queryParams = queryParams == null ? Map.of() : Map.copyOf(queryParams);
    }
}
