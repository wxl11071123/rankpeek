package io.rankpeek.opgg;

public record OpggChampionCounter(
        int championId,
        long games,
        Long wins
) {
}
