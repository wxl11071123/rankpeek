package io.rankpeek.cnmeta.sync;

import org.springframework.stereotype.Component;

@Component
public class RealCnMetaSourceClient implements CnMetaSourceClient {
    private final CnMetaSyncProperties properties;

    public RealCnMetaSourceClient(CnMetaSyncProperties properties) {
        this.properties = properties;
    }

    @Override
    public String source() {
        return "real-101";
    }

    @Override
    public CnMetaSourcePayload fetchChampionStats(String patchKey, Integer queueId, String tierScope, String role) {
        if (!Boolean.TRUE.equals(properties.realSourceEnabled())) {
            throw new CnMetaSourceException("Real 101 CN meta source is disabled");
        }
        throw new CnMetaSourceException("Real 101 CN meta source is not configured");
    }
}
