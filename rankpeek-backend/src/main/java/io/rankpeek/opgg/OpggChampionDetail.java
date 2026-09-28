package io.rankpeek.opgg;

import java.time.Instant;
import java.util.List;

public record OpggChampionDetail(
        int championId,
        String championName,
        String mode,
        String region,
        String tier,
        String position,
        String version,
        Instant updatedAt,
        OpggChampionStats stats,
        List<OpggBuildOption> summonerSpells,
        List<OpggBuildOption> runes,
        List<OpggBuildOption> skillOrders,
        List<OpggBuildOption> starterItems,
        List<OpggBuildOption> boots,
        List<OpggBuildOption> coreItems,
        List<OpggBuildOption> lastItems,
        List<OpggBuildOption> augments
) {
    public OpggChampionDetail {
        summonerSpells = summonerSpells == null ? List.of() : List.copyOf(summonerSpells);
        runes = runes == null ? List.of() : List.copyOf(runes);
        skillOrders = skillOrders == null ? List.of() : List.copyOf(skillOrders);
        starterItems = starterItems == null ? List.of() : List.copyOf(starterItems);
        boots = boots == null ? List.of() : List.copyOf(boots);
        coreItems = coreItems == null ? List.of() : List.copyOf(coreItems);
        lastItems = lastItems == null ? List.of() : List.copyOf(lastItems);
        augments = augments == null ? List.of() : List.copyOf(augments);
    }
}
