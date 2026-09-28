package io.rankpeek.hextech.aramgg;

/** aramgg 的强化定义（来自 /data/aram-mayhem-augments.zh_cn.json）。 */
public record AramggAugmentDefinition(
        long id,
        String name,
        String displayName,
        String description,
        String tooltip,
        int rarity,
        boolean enabled,
        String iconSmall,
        String iconLarge
) {
}
