package io.rankpeek.esports;

public record LplChampionUsage(
        String source,
        String patchKey,
        Integer championId,
        String role,
        String tournament,
        String split,
        String team,
        String playerName,
        Integer kills,
        Integer deaths,
        Integer assists
) {
}
