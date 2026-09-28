package io.rankpeek.opgg;

public interface OpggSourceClient {
    OpggChampionDetail fetchChampionDetail(OpggChampionDetailQuery query);

    OpggChampionList fetchChampionList(OpggChampionListQuery query);
}
