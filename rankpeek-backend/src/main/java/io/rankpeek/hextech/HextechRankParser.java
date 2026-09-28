package io.rankpeek.hextech;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;

/**
 * 解析 101（腾讯国服公开统计）的海斗排行榜接口。
 *
 * <p>两个接口的返回都被包了一层 {@code data._fieldValues}，其 value 是一个 JSON 字符串，
 * 真正的数据藏在里面（{@code augmentlist} / {@code listcollect}），并且是自定义的紧凑打包格式。
 * 本类只做纯解析，不做网络请求，便于单测。
 */
public final class HextechRankParser {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private HextechRankParser() {
    }

    /** 强化榜接口的解析结果（含腾讯的统计日期）。 */
    public record AugmentPage(String dataDate, List<HextechAugmentRank> rows) {
    }

    /**
     * 解析强化榜：/go/battle_info/odp_proxy/fuwen_aram_rune_rank_v2
     */
    public static AugmentPage parseAugmentRank(String responseBody) {
        JsonNode inner = unwrapFieldValues(responseBody);
        if (inner == null) {
            return new AugmentPage(null, List.of());
        }
        String dataDate = text(inner, "dtstatdate");
        String packed = text(inner, "augmentlist");
        return new AugmentPage(dataDate, parseAugmentList(packed));
    }

    /**
     * 解析英雄榜：/go/battle_info/odp_proxy/fuwen_aram_hero_rank_v2
     */
    public static List<HextechChampionRank> parseChampionRank(String responseBody) {
        JsonNode inner = unwrapFieldValues(responseBody);
        if (inner == null) {
            return List.of();
        }
        return parseChampionList(text(inner, "listcollect"));
    }

    /**
     * 解开 data._fieldValues 的外层包装，返回里面的业务对象。
     *
     * <p>上游可能返回 HTML 错误页（例如站点维护中），因此解析失败一律按"无数据"处理，
     * 由调用方决定是否回退到本地缓存。
     */
    private static JsonNode unwrapFieldValues(String responseBody) {
        if (responseBody == null || responseBody.isBlank()) {
            return null;
        }
        try {
            JsonNode root = MAPPER.readTree(responseBody);
            JsonNode fieldValues = root.path("data").path("_fieldValues");
            if (!fieldValues.isObject() || fieldValues.isEmpty()) {
                return null;
            }
            JsonNode first = fieldValues.elements().next();
            if (!first.isTextual()) {
                return null;
            }
            return MAPPER.readTree(first.asText());
        } catch (Exception e) {
            return null;
        }
    }

    static List<HextechAugmentRank> parseAugmentList(String packed) {
        List<HextechAugmentRank> rows = new ArrayList<>();
        if (packed == null || packed.isBlank()) {
            return rows;
        }
        for (String entry : packed.split("#")) {
            if (entry.isBlank()) {
                continue;
            }
            String[] f = entry.split("_");
            if (f.length < 8) {
                continue;
            }
            try {
                rows.add(new HextechAugmentRank(
                        Long.parseLong(f[0].trim()),
                        parseDouble(f[2]),
                        parseInt(f[3]),
                        parseInt(f[4]),
                        parseDouble(f[5]),
                        parseInt(f[6]),
                        parseInt(f[7]),
                        parseChampionIds(f.length > 8 ? f[8] : "")
                ));
            } catch (NumberFormatException ignored) {
                // 单条脏数据不影响整体
            }
        }
        return rows;
    }

    static List<HextechChampionRank> parseChampionList(String packed) {
        List<HextechChampionRank> rows = new ArrayList<>();
        if (packed == null || packed.isBlank()) {
            return rows;
        }
        for (String block : packed.split("#")) {
            if (block.isBlank()) {
                continue;
            }
            String[] head = block.split("_", 6);
            if (head.length < 6) {
                continue;
            }
            try {
                rows.add(new HextechChampionRank(
                        Long.parseLong(head[0].trim()),
                        parseInt(head[1]),
                        head[2].trim(),
                        parseDouble(head[3]),
                        parseDouble(head[4]),
                        parsePartners(head[5])
                ));
            } catch (NumberFormatException ignored) {
                // 单条脏数据不影响整体
            }
        }
        return rows;
    }

    private static List<HextechChampionRank.Partner> parsePartners(String packed) {
        List<HextechChampionRank.Partner> partners = new ArrayList<>();
        if (packed == null || packed.isBlank()) {
            return partners;
        }
        for (String entry : packed.split("&")) {
            String[] f = entry.split(",");
            if (f.length < 4) {
                continue;
            }
            try {
                partners.add(new HextechChampionRank.Partner(
                        Long.parseLong(f[0].trim()),
                        parseDouble(f[1]),
                        parseDouble(f[2]),
                        parseInt(f[3])
                ));
            } catch (NumberFormatException ignored) {
                // 忽略
            }
        }
        return partners;
    }

    private static List<Long> parseChampionIds(String packed) {
        List<Long> ids = new ArrayList<>();
        if (packed == null || packed.isBlank()) {
            return ids;
        }
        for (String part : packed.split(",")) {
            String trimmed = part.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            try {
                ids.add(Long.parseLong(trimmed));
            } catch (NumberFormatException ignored) {
                // 忽略
            }
        }
        return ids;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value != null && value.isTextual() ? value.asText() : null;
    }

    private static double parseDouble(String raw) {
        return Double.parseDouble(raw.trim());
    }

    private static int parseInt(String raw) {
        return Integer.parseInt(raw.trim());
    }
}
