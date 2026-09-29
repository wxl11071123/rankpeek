package io.rankpeek.opgg;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class RealOpggSourceClient implements OpggSourceClient {
    private final OpggSourceProperties properties;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    @Autowired
    public RealOpggSourceClient(OpggSourceProperties properties, ObjectMapper objectMapper) {
        this(properties, objectMapper, Clock.systemUTC());
    }

    RealOpggSourceClient(OpggSourceProperties properties, ObjectMapper objectMapper, Clock clock) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    @Override
    public OpggChampionDetail fetchChampionDetail(OpggChampionDetailQuery query) {
        String version = fetchLatestVersion(query.region(), query.mode());
        URI detailUri = buildDetailUri(query, version);
        String rawContent = fetchJson(detailUri);
        return parseDetail(rawContent, query, version, detailUri.toString());
    }

    @Override
    public OpggChampionList fetchChampionList(OpggChampionListQuery query) {
        String version = fetchLatestVersion(query.region(), query.mode());
        URI listUri = buildListUri(query, version);
        String rawContent = fetchJson(listUri);
        return parseList(rawContent, query, version, listUri.toString());
    }

    private String fetchLatestVersion(String region, String mode) {
        URI versionsUri = buildUri("/api/%s/champions/%s/versions".formatted(encodePath(region), encodePath(mode)), Map.of());
        String rawContent = fetchJson(versionsUri);
        try {
            JsonNode root = objectMapper.readTree(rawContent);
            JsonNode data = root.path("data");
            if (!data.isArray() || data.isEmpty() || data.get(0).asText("").isBlank()) {
                throw new OpggSourceException("OP.GG versions response did not contain a usable version");
            }
            return data.get(0).asText();
        } catch (IOException exception) {
            throw new OpggSourceException("Failed to parse OP.GG versions response", exception);
        }
    }

    private URI buildDetailUri(OpggChampionDetailQuery query, String version) {
        String path;
        if ("arena".equals(query.mode())) {
            path = "/api/%s/champions/%s/%d".formatted(encodePath(query.region()), encodePath(query.mode()), query.championId());
        } else {
            String positionSegment = "aram".equals(query.mode()) ? "none" : query.position();
            path = "/api/%s/champions/%s/%d/%s".formatted(
                    encodePath(query.region()),
                    encodePath(query.mode()),
                    query.championId(),
                    encodePath(positionSegment)
            );
        }
        Map<String, String> queryParams = new LinkedHashMap<>();
        queryParams.put("tier", query.tier());
        queryParams.put("version", version);
        return buildUri(path, queryParams);
    }

    private URI buildListUri(OpggChampionListQuery query, String version) {
        String path = "/api/%s/champions/%s".formatted(encodePath(query.region()), encodePath(query.mode()));
        Map<String, String> queryParams = new LinkedHashMap<>();
        queryParams.put("tier", query.tier());
        queryParams.put("version", version);
        return buildUri(path, queryParams);
    }

    private URI buildUri(String path, Map<String, String> queryParams) {
        String baseUrl = properties.baseUrl();
        StringBuilder builder = new StringBuilder();
        builder.append(baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl);
        builder.append(path);
        List<String> parts = new ArrayList<>();
        for (Map.Entry<String, String> entry : queryParams.entrySet()) {
            if (entry.getValue() != null && !entry.getValue().isBlank()) {
                parts.add(encodeQuery(entry.getKey()) + "=" + encodeQuery(entry.getValue()));
            }
        }
        if (!parts.isEmpty()) {
            builder.append('?').append(String.join("&", parts));
        }
        try {
            return URI.create(builder.toString());
        } catch (IllegalArgumentException exception) {
            throw new OpggSourceException("OP.GG source URL is invalid: " + exception.getMessage());
        }
    }

    private String fetchJson(URI uri) {
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(properties.connectTimeoutMs()))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofMillis(properties.readTimeoutMs()))
                .header("User-Agent", properties.userAgent())
                .header("Accept", "application/json")
                .GET()
                .build();

        try {
            HttpResponse<InputStream> response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
            String rawContent = readBounded(response.body(), properties.maxResponseBytes());
            int status = response.statusCode();
            if (status < 200 || status >= 300) {
                throw new OpggSourceException("OP.GG source returned HTTP " + status);
            }
            if (containsRiskControl(rawContent)) {
                throw new OpggSourceException("OP.GG source returned a risk-control page");
            }
            return rawContent;
        } catch (OpggSourceException exception) {
            throw exception;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new OpggSourceException("OP.GG source request interrupted", exception);
        } catch (IOException exception) {
            throw new OpggSourceException("OP.GG source request failed: " + exception.getMessage(), exception);
        }
    }

    private OpggChampionDetail parseDetail(String rawContent, OpggChampionDetailQuery query, String version, String sourceUrl) {
        try {
            JsonNode data = objectMapper.readTree(rawContent).path("data");
            if (data.isMissingNode() || data.isNull()) {
                throw new OpggSourceException("OP.GG champion detail response did not contain data");
            }
            JsonNode summary = data.path("summary");
            JsonNode statsNode = resolveStatsNode(summary, query.position());
            return new OpggChampionDetail(
                    query.championId(),
                    text(summary.path("name")),
                    query.mode(),
                    query.region(),
                    query.tier(),
                    query.position(),
                    version,
                    Instant.now(clock),
                    parseStats(statsNode),
                    parseOptions(data.path("summoner_spells"), "summoner_spells", 4),
                    parseRuneOptions(data.path("runes"), 4),
                    parseSkillOptions(data.path("skill_masteries"), 4),
                    parseOptions(data.path("starter_items"), "starter_items", 4),
                    parseOptions(data.path("boots"), "boots", 4),
                    parseOptions(data.path("core_items"), "core_items", 5),
                    parseOptions(data.path("last_items"), "last_items", 15),
                    List.of()
            );
        } catch (OpggSourceException exception) {
            throw exception;
        } catch (IOException exception) {
            throw new OpggSourceException("Failed to parse OP.GG champion detail response from " + sourceUrl, exception);
        }
    }

    private OpggChampionList parseList(String rawContent, OpggChampionListQuery query, String version, String sourceUrl) {
        try {
            JsonNode root = objectMapper.readTree(rawContent);
            JsonNode data = root.path("data");
            if (!data.isArray()) {
                throw new OpggSourceException("OP.GG champion list response did not contain data");
            }
            String responseVersion = text(root.path("meta").path("version"));
            List<OpggChampionListItem> items = new ArrayList<>();
            for (JsonNode item : data) {
                Integer championId = nullableInt(item, "id");
                if (championId == null || championId <= 0) {
                    continue;
                }
                JsonNode averageStats = item.path("average_stats");
                items.add(new OpggChampionListItem(
                        championId,
                        nullableInt(averageStats, "tier"),
                        nullableInt(averageStats, "rank"),
                        parseStats(averageStats),
                        parsePositionStats(item.path("positions"))
                ));
            }
            return new OpggChampionList(
                    query.mode(),
                    query.region(),
                    query.tier(),
                    responseVersion == null ? version : responseVersion,
                    Instant.now(clock),
                    items
            );
        } catch (OpggSourceException exception) {
            throw exception;
        } catch (IOException exception) {
            throw new OpggSourceException("Failed to parse OP.GG champion list response from " + sourceUrl, exception);
        }
    }

    private JsonNode resolveStatsNode(JsonNode summary, String position) {
        if (position != null && !position.isBlank() && !"none".equals(position)) {
            JsonNode positions = summary.path("positions");
            if (positions.isArray()) {
                for (JsonNode item : positions) {
                    String name = item.path("name").asText("").toLowerCase(Locale.ROOT);
                    if (matchesPosition(name, position)) {
                        JsonNode stats = item.path("stats");
                        if (!stats.isMissingNode() && !stats.isNull()) {
                            return stats;
                        }
                    }
                }
            }
        }
        return summary.path("average_stats");
    }

    private static boolean matchesPosition(String sourcePosition, String requestedPosition) {
        return sourcePosition.equals(requestedPosition)
                || ("middle".equals(sourcePosition) && "mid".equals(requestedPosition))
                || ("bottom".equals(sourcePosition) && "adc".equals(requestedPosition))
                || ("utility".equals(sourcePosition) && "support".equals(requestedPosition));
    }

    private static OpggChampionStats parseStats(JsonNode node) {
        return new OpggChampionStats(
                longValue(node, "play"),
                doubleValue(node, "win_rate"),
                doubleValue(node, "pick_rate"),
                doubleValue(node, "ban_rate"),
                doubleValue(node, "kda")
        );
    }

    private static List<OpggChampionPositionStats> parsePositionStats(JsonNode array) {
        List<OpggChampionPositionStats> positions = new ArrayList<>();
        if (!array.isArray()) {
            return positions;
        }
        for (JsonNode node : array) {
            String position = normalizePosition(text(node.path("name")));
            JsonNode stats = node.path("stats");
            JsonNode tierData = stats.path("tier_data");
            positions.add(new OpggChampionPositionStats(
                    position,
                    nullableInt(tierData, "tier"),
                    nullableInt(tierData, "rank"),
                    parseStats(stats),
                    parseCounters(node.path("counters"))
            ));
        }
        return positions;
    }

    private static List<OpggChampionCounter> parseCounters(JsonNode array) {
        List<OpggChampionCounter> counters = new ArrayList<>();
        if (!array.isArray()) {
            return counters;
        }
        for (JsonNode node : array) {
            Integer championId = nullableInt(node, "champion_id");
            if (championId == null || championId <= 0) {
                continue;
            }
            counters.add(new OpggChampionCounter(
                    championId,
                    longValue(node, "play"),
                    nullableLong(node, "win")
            ));
        }
        return counters;
    }

    private static List<OpggBuildOption> parseOptions(JsonNode array, String label, int limit) {
        List<OpggBuildOption> options = new ArrayList<>();
        if (!array.isArray()) {
            return options;
        }
        for (JsonNode node : array) {
            List<Integer> ids = intList(node.path("ids"));
            if (ids.isEmpty()) {
                continue;
            }
            options.add(parseOption(label, ids, node));
            if (options.size() >= limit) {
                break;
            }
        }
        return options;
    }

    private static List<OpggBuildOption> parseRuneOptions(JsonNode array, int limit) {
        List<OpggBuildOption> options = new ArrayList<>();
        if (!array.isArray()) {
            return options;
        }
        for (JsonNode node : array) {
            List<Integer> ids = intList(node.path("ids"));
            if (ids.isEmpty()) {
                addPositiveId(ids, node.path("primary_page_id"));
                addPositiveId(ids, node.path("secondary_page_id"));
                ids.addAll(intList(node.path("primary_rune_ids")));
                ids.addAll(intList(node.path("secondary_rune_ids")));
                ids.addAll(intList(node.path("stat_mod_ids")));
            }
            if (ids.isEmpty()) {
                continue;
            }
            options.add(parseOption("runes", ids, node));
            if (options.size() >= limit) {
                break;
            }
        }
        return options;
    }

    private static List<OpggBuildOption> parseSkillOptions(JsonNode array, int limit) {
        List<OpggBuildOption> options = new ArrayList<>();
        if (!array.isArray()) {
            return options;
        }
        for (JsonNode node : array) {
            List<Integer> ids = skillIdList(node.path("ids"));
            List<Integer> fallbackOrder = new ArrayList<>();
            fallbackOrder.addAll(skillIdList(node.path("order")));
            fallbackOrder.addAll(skillIdList(node.path("skill_order")));
            if (ids.isEmpty()) {
                ids.addAll(fallbackOrder);
            }
            if (ids.isEmpty()) {
                continue;
            }
            JsonNode builds = node.path("builds");
            if (builds.isArray() && !builds.isEmpty()) {
                for (JsonNode build : builds) {
                    List<Integer> order = skillIdList(build.path("order"));
                    if (order.isEmpty()) {
                        order.addAll(skillIdList(build.path("skill_order")));
                    }
                    if (order.isEmpty()) {
                        continue;
                    }
                    options.add(parseOption("skill_order", ids, order, build));
                    if (options.size() >= limit) {
                        return options;
                    }
                }
            } else {
                options.add(parseOption("skill_order", ids, fallbackOrder, node));
            }
            if (options.size() >= limit) {
                break;
            }
        }
        return options;
    }

    private static OpggBuildOption parseOption(String label, List<Integer> ids, JsonNode node) {
        return parseOption(label, ids, List.of(), node);
    }

    private static OpggBuildOption parseOption(String label, List<Integer> ids, List<Integer> order, JsonNode node) {
        Long games = nullableLong(node, "play");
        Double winRate = doubleValue(node, "win_rate");
        if (winRate == null && games != null && games > 0) {
            Long wins = nullableLong(node, "win");
            if (wins != null) {
                winRate = wins.doubleValue() / games.doubleValue();
            }
        }
        return new OpggBuildOption(
                label,
                List.copyOf(ids),
                List.copyOf(order),
                games,
                winRate,
                doubleValue(node, "pick_rate")
        );
    }

    private static List<Integer> intList(JsonNode node) {
        List<Integer> ids = new ArrayList<>();
        if (!node.isArray()) {
            return ids;
        }
        for (JsonNode item : node) {
            addPositiveId(ids, item);
        }
        return ids;
    }

    private static List<Integer> skillIdList(JsonNode node) {
        List<Integer> ids = new ArrayList<>();
        if (!node.isArray()) {
            return ids;
        }
        for (JsonNode item : node) {
            addSkillId(ids, item);
        }
        return ids;
    }

    private static void addPositiveId(List<Integer> ids, JsonNode node) {
        if (node.canConvertToInt() && node.asInt() > 0) {
            ids.add(node.asInt());
        }
    }

    private static void addSkillId(List<Integer> ids, JsonNode node) {
        if (node.canConvertToInt()) {
            int value = node.asInt();
            if (value >= 1 && value <= 4) {
                ids.add(value);
            }
            return;
        }
        if (!node.isTextual()) {
            return;
        }
        switch (node.asText("").trim().toUpperCase(Locale.ROOT)) {
            case "Q" -> ids.add(1);
            case "W" -> ids.add(2);
            case "E" -> ids.add(3);
            case "R" -> ids.add(4);
            default -> {
                // Ignore unknown source tokens instead of failing the whole OP.GG response.
            }
        }
    }


    private static long longValue(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.canConvertToLong() ? value.asLong() : 0L;
    }

    private static Long nullableLong(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.canConvertToLong() ? value.asLong() : null;
    }

    private static Integer nullableInt(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.canConvertToInt() ? value.asInt() : null;
    }

    private static Double doubleValue(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isNumber() ? value.asDouble() : null;
    }

    private static String text(JsonNode node) {
        String value = node.asText("");
        return value.isBlank() ? null : value;
    }

    private static String normalizePosition(String value) {
        if (value == null || value.isBlank()) {
            return "none";
        }
        String normalized = value.trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "middle" -> "mid";
            case "bottom" -> "adc";
            case "utility" -> "support";
            default -> normalized;
        };
    }

    private static String encodePath(String value) {
        return encodeQuery(value).replace("%2F", "/");
    }

    private static String encodeQuery(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static String readBounded(InputStream inputStream, int maxBytes) throws IOException {
        try (inputStream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = inputStream.read(buffer)) != -1) {
                total += read;
                if (total > maxBytes) {
                    throw new OpggSourceException("OP.GG source response exceeded configured byte limit");
                }
                output.write(buffer, 0, read);
            }
            return output.toString(StandardCharsets.UTF_8);
        }
    }

    private static boolean containsRiskControl(String rawContent) {
        String lower = rawContent.toLowerCase(Locale.ROOT);
        return lower.contains("captcha") || lower.contains("risk control");
    }
}
