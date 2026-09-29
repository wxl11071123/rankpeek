package io.rankpeek.cnmeta.sync;

public interface CnMetaSourceClient {
    String source();

    CnMetaSourcePayload fetchChampionStats(String patchKey, Integer queueId, String tierScope, String role);
}
