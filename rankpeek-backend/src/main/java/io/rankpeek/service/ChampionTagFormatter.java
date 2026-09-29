package io.rankpeek.service;

final class ChampionTagFormatter {

    private static final String UNKNOWN_CHAMPION_NAME = "未知英雄";
    private static final String SIGNATURE_SUFFIX = "绝活哥";
    private static final String STRUGGLE_SUFFIX = "绝症哥";

    private ChampionTagFormatter() {
    }

    static String signatureTagName(AssetService assetService, Integer championId) {
        String championName = resolveChampionName(assetService, championId);
        return championName == null ? SIGNATURE_SUFFIX : championName + SIGNATURE_SUFFIX;
    }

    static String struggleTagName(AssetService assetService, Integer championId) {
        String championName = resolveChampionName(assetService, championId);
        return championName == null ? STRUGGLE_SUFFIX : championName + STRUGGLE_SUFFIX;
    }

    static boolean isSignatureTagName(String name) {
        return name != null && name.endsWith(SIGNATURE_SUFFIX);
    }

    static boolean isStruggleTagName(String name) {
        return name != null && name.endsWith(STRUGGLE_SUFFIX);
    }

    private static String resolveChampionName(AssetService assetService, Integer championId) {
        if (assetService == null || championId == null || championId <= 0) {
            return null;
        }

        try {
            String name = assetService.getChampionName(championId.longValue());
            if (name != null && !name.isBlank() && !UNKNOWN_CHAMPION_NAME.equals(name)) {
                return name;
            }
        } catch (Exception ignored) {
            return null;
        }

        return null;
    }
}
