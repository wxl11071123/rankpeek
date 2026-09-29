package io.rankpeek.service.matchhistory;

public record MatchHistoryQueryOptions(
        int begIndex,
        int endIndex,
        Integer queueId,
        Integer championId,
        Integer maxResults,
        boolean forceRefresh,
        MatchHistorySource preferredSource,
        String sgpServerId,
        String tag
) {

    private static final int DEFAULT_BEG_INDEX = 0;
    private static final int DEFAULT_END_INDEX = 99;
    private static final int DEFAULT_MAX_RESULTS = 50;

    public static MatchHistoryQueryOptions lcuDefault(boolean forceRefresh) {
        return defaultFor(MatchHistorySource.LCU, forceRefresh);
    }

    public static MatchHistoryQueryOptions defaultFor(MatchHistorySource preferredSource, boolean forceRefresh) {
        return new MatchHistoryQueryOptions(
                DEFAULT_BEG_INDEX,
                DEFAULT_END_INDEX,
                null,
                null,
                DEFAULT_MAX_RESULTS,
                forceRefresh,
                preferredSource == null ? MatchHistorySource.AUTO : preferredSource,
                null,
                null
        );
    }

    public static MatchHistoryQueryOptions forLimit(MatchHistorySource preferredSource,
                                                    boolean forceRefresh,
                                                    int maxResults) {
        int normalizedMaxResults = Math.max(1, maxResults);
        return new MatchHistoryQueryOptions(
                DEFAULT_BEG_INDEX,
                normalizedMaxResults - 1,
                null,
                null,
                normalizedMaxResults,
                forceRefresh,
                preferredSource == null ? MatchHistorySource.AUTO : preferredSource,
                null,
                null
        );
    }
}
