package io.rankpeek.opgg;

@FunctionalInterface
public interface OpggChampionDetailProvider {
    OpggChampionDetail getChampionDetail(OpggChampionDetailQuery query);
}
