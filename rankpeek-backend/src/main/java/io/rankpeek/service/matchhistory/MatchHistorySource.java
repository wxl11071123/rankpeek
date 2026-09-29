package io.rankpeek.service.matchhistory;

import java.util.Locale;

public enum MatchHistorySource {
    LCU,
    SGP,
    AUTO,
    CACHE;

    public static MatchHistorySource fromRequest(String source) {
        if (source == null || source.isBlank()) {
            return AUTO;
        }
        return switch (source.trim().toUpperCase(Locale.ROOT)) {
            case "LCU" -> LCU;
            case "SGP" -> SGP;
            case "AUTO" -> AUTO;
            case "CACHE" -> CACHE;
            default -> throw new IllegalArgumentException("Unsupported match-history source: " + source);
        };
    }
}
