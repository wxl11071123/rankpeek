package io.rankpeek.opgg;

public record OpggChampionStats(
        long games,
        Double winRate,
        Double pickRate,
        Double banRate,
        Double kda
) {
}
