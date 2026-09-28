package io.rankpeek.opgg;

@FunctionalInterface
public interface OpggChampionListProvider {
    OpggChampionList getChampionList(OpggChampionListQuery query);
}
