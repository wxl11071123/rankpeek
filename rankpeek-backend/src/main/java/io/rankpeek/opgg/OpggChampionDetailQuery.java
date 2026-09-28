package io.rankpeek.opgg;

import java.util.Locale;

public record OpggChampionDetailQuery(
        int championId,
        String mode,
        String region,
        String tier,
        String position
) {
    public OpggChampionDetailQuery {
        mode = normalize(mode);
        region = normalize(region);
        tier = normalize(tier);
        position = normalize(position);
    }

    String cacheKey() {
        return "%s|%s|%s|%s|%d".formatted(mode, region, tier, position, championId);
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
