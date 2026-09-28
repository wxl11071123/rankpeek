package io.rankpeek.hextech.aramgg;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 解析 aramgg 数据 API 的几种行格式。
 *
 * <p>它们都是"数组 + 内嵌 JSON 字符串"的紧凑格式：
 * <ul>
 *   <li>全局强化统计：{@code [augmentId, statsJson, version, date, source]}</li>
 *   <li>单英雄矩阵：{@code [championId, statsJson, version, date]}</li>
 *   <li>强化定义：{@code {"1002": {id, name, displayName, description, ...}}}</li>
 * </ul>
 * 与 101 一样，解析失败一律降级为"无数据"，不抛异常。
 */
public final class AramggParser {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private AramggParser() {
    }

    /** 解析 /data/augments-stats-raw.json */
    public static List<AramggAugmentStat> parseAugmentStats(String body) {
        List<AramggAugmentStat> rows = new ArrayList<>();
        JsonNode root = readTree(body);
        if (root == null || !root.isArray()) {
            return rows;
        }
        for (JsonNode row : root) {
            if (!row.isArray() || row.size() < 2) {
                continue;
            }
            JsonNode stats = readTree(row.get(1).asText());
            if (stats == null) {
                continue;
            }
            rows.add(new AramggAugmentStat(
                    row.get(0).asLong(),
                    text(stats, "tier"),
                    text(stats, "pick_rate"),
                    text(stats, "win_rate"),
                    text(stats, "num_games"),
                    text(stats, "win_rank"),
                    text(stats, "win_rank_delta"),
                    text(stats, "use_rank"),
                    text(stats, "use_rank_delta"),
                    text(stats, "source"),
                    text(stats, "region")
            ));
        }
        return rows;
    }

    /** 解析 /data/champion-augments/{championId}.json */
    public static AramggChampionMatrix parseChampionMatrix(String body, long fallbackChampionId) {
        JsonNode root = readTree(body);
        if (root == null || !root.isArray() || root.isEmpty()) {
            return new AramggChampionMatrix(fallbackChampionId, null, null, null, null, List.of());
        }
        JsonNode row = root.get(0);
        if (!row.isArray() || row.size() < 2) {
            return new AramggChampionMatrix(fallbackChampionId, null, null, null, null, List.of());
        }
        long championId = row.get(0).asLong(fallbackChampionId);
        String patch = row.size() > 2 ? row.get(2).asText(null) : null;
        String date = row.size() > 3 ? row.get(3).asText(null) : null;

        JsonNode stats = readTree(row.get(1).asText());
        if (stats == null) {
            return new AramggChampionMatrix(championId, patch, date, null, null, List.of());
        }
        List<AramggChampionAugment> augments = new ArrayList<>();
        JsonNode augmentNodes = stats.path("augments");
        if (augmentNodes.isObject()) {
            augmentNodes.fields().forEachRemaining(entry -> {
                long augmentId;
                try {
                    augmentId = Long.parseLong(entry.getKey());
                } catch (NumberFormatException e) {
                    return;
                }
                JsonNode value = entry.getValue();
                augments.add(new AramggChampionAugment(
                        augmentId,
                        text(value, "tier"),
                        text(value, "rank"),
                        text(value, "total"),
                        text(value, "pick_rate"),
                        text(value, "win_rate"),
                        text(value, "num_games"),
                        text(value, "win_rate_source"),
                        text(value, "win_rate_region")
                ));
            });
        }
        return new AramggChampionMatrix(
                championId,
                patch,
                date,
                text(stats, "source"),
                text(stats, "region"),
                augments
        );
    }

    /** 解析 /data/aram-mayhem-augments.zh_cn.json */
    public static Map<Long, AramggAugmentDefinition> parseAugmentDefinitions(String body) {
        Map<Long, AramggAugmentDefinition> definitions = new LinkedHashMap<>();
        JsonNode root = readTree(body);
        if (root == null || !root.isObject()) {
            return definitions;
        }
        root.fields().forEachRemaining(entry -> {
            JsonNode node = entry.getValue();
            if (node == null || !node.isObject()) {
                return;
            }
            long id = node.path("id").asLong(0);
            if (id <= 0) {
                return;
            }
            definitions.put(id, new AramggAugmentDefinition(
                    id,
                    text(node, "name"),
                    text(node, "displayName"),
                    text(node, "description"),
                    text(node, "tooltip"),
                    node.path("rarity").asInt(0),
                    node.path("enabled").asBoolean(true),
                    text(node, "iconSmall"),
                    text(node, "iconLarge")
            ));
        });
        return definitions;
    }

    /** 从 /champions.json 里取英雄 ID 列表。 */
    public static List<Long> parseChampionIds(String body) {
        List<Long> ids = new ArrayList<>();
        JsonNode root = readTree(body);
        if (root == null) {
            return ids;
        }
        JsonNode data = root.path("data");
        if (!data.isArray()) {
            return ids;
        }
        for (JsonNode node : data) {
            long id = node.path("id").asLong(0);
            if (id > 0) {
                ids.add(id);
            }
        }
        return ids;
    }

    private static JsonNode readTree(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return MAPPER.readTree(raw);
        } catch (Exception e) {
            return null;
        }
    }

    private static String text(JsonNode node, String field) {
        if (node == null) {
            return null;
        }
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) {
            return null;
        }
        return value.isTextual() ? value.asText() : value.asText();
    }
}
