package io.rankpeek.opgg;

import java.util.Locale;

public record OpggChampionListQuery(
        String mode,
        String region,
        String tier
) {
    public OpggChampionListQuery {
        mode = normalize(mode);
        region = normalize(region);
        tier = normalize(tier);
    }

    String cacheKey() {
        return "%s|%s|%s".formatted(mode, region, tier);
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
