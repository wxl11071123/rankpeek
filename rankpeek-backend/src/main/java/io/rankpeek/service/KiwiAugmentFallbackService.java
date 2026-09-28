package io.rankpeek.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
public class KiwiAugmentFallbackService {

    static final String DEFAULT_SOURCE_URL = "https://game.gtimg.cn/images/lol/act/img/js/kiwi/kiwi_augments.json";

    private static final Pattern HEX_ENTITY = Pattern.compile("&#x([0-9a-fA-F]+);");
    private static final Pattern DECIMAL_ENTITY = Pattern.compile("&#(\\d+);");

    private final boolean enabled;
    private final String sourceUrl;
    private final Duration ttl;
    private final Duration timeout;
    private final Clock clock;
    private final KiwiPayloadFetcher payloadFetcher;
    private final ObjectMapper objectMapper;

    private Map<Long, KiwiAugmentFallback> cachedFallbacks = Map.of();
    private Instant loadedAt;

    @Autowired
    public KiwiAugmentFallbackService(
            @Value("${rankpeek.assets.kiwi-augment-fallback.enabled:true}") boolean enabled,
            @Value("${rankpeek.assets.kiwi-augment-fallback.url:" + DEFAULT_SOURCE_URL + "}") String sourceUrl,
            @Value("${rankpeek.assets.kiwi-augment-fallback.ttl-hours:24}") long ttlHours,
            @Value("${rankpeek.assets.kiwi-augment-fallback.timeout-ms:2000}") long timeoutMs,
            ObjectMapper objectMapper
    ) {
        this(
                enabled,
                sourceUrl,
                Duration.ofHours(Math.max(1, ttlHours)),
                Duration.ofMillis(Math.max(100, timeoutMs)),
                Clock.systemUTC(),
                new HttpKiwiPayloadFetcher(),
                objectMapper
        );
    }

    KiwiAugmentFallbackService(
            boolean enabled,
            String sourceUrl,
            Duration ttl,
            Duration timeout,
            Clock clock,
            KiwiPayloadFetcher payloadFetcher,
            ObjectMapper objectMapper
    ) {
        this.enabled = enabled;
        this.sourceUrl = sourceUrl == null || sourceUrl.isBlank() ? DEFAULT_SOURCE_URL : sourceUrl.trim();
        this.ttl = ttl == null || ttl.isNegative() || ttl.isZero() ? Duration.ofHours(24) : ttl;
        this.timeout = timeout == null || timeout.isNegative() || timeout.isZero() ? Duration.ofSeconds(2) : timeout;
        this.clock = clock == null ? Clock.systemUTC() : clock;
        this.payloadFetcher = payloadFetcher;
        this.objectMapper = objectMapper == null ? new ObjectMapper() : objectMapper;
    }

    static KiwiAugmentFallbackService disabled() {
        return new KiwiAugmentFallbackService(
                false,
                DEFAULT_SOURCE_URL,
                Duration.ofHours(24),
                Duration.ofSeconds(2),
                Clock.systemUTC(),
                (url, timeout) -> "",
                new ObjectMapper()
        );
    }

    public synchronized Map<Long, KiwiAugmentFallback> getAugmentFallbacks() {
        if (!enabled) {
            return Map.of();
        }
        if (loadedAt != null && loadedAt.plus(ttl).isAfter(Instant.now(clock))) {
            return cachedFallbacks;
        }

        try {
            String payload = payloadFetcher.fetch(sourceUrl, timeout);
            Map<Long, KiwiAugmentFallback> parsed = parsePayload(payload);
            cachedFallbacks = parsed;
            loadedAt = Instant.now(clock);
            log.info("Loaded GTIMG Kiwi augment fallback metadata: {}", parsed.size());
        } catch (Exception e) {
            loadedAt = Instant.now(clock);
            log.warn("Failed to load GTIMG Kiwi augment fallback metadata: {}", e.getMessage());
        }
        return cachedFallbacks;
    }

    Map<Long, KiwiAugmentFallback> parsePayload(String payload) throws IOException {
        if (payload == null || payload.isBlank()) {
            return Map.of();
        }

        JsonNode root = objectMapper.readTree(payload);
        Map<Long, KiwiAugmentFallback> result = new LinkedHashMap<>();
        for (JsonNode node : extractPayloadEntries(root)) {
            KiwiAugmentFallback fallback = toFallback(node);
            if (fallback != null) {
                result.put(fallback.id(), fallback);
            }
        }
        return Map.copyOf(result);
    }

    private List<JsonNode> extractPayloadEntries(JsonNode node) {
        List<JsonNode> entries = new ArrayList<>();
        collectPayloadEntries(node, entries);
        return entries;
    }

    private void collectPayloadEntries(JsonNode node, List<JsonNode> entries) {
        if (node == null || node.isNull()) {
            return;
        }
        if (node.isArray()) {
            node.forEach(child -> collectPayloadEntries(child, entries));
            return;
        }
        if (!node.isObject()) {
            return;
        }
        if (readId(node) != null) {
            entries.add(node);
            return;
        }

        for (String wrapper : List.of("data", "augments", "kiwi_augments", "kiwiAugments", "list", "items", "result")) {
            JsonNode wrapped = node.get(wrapper);
            if (wrapped != null) {
                collectPayloadEntries(wrapped, entries);
            }
        }
        if (!entries.isEmpty()) {
            return;
        }

        node.properties().forEach(entry -> collectPayloadEntries(entry.getValue(), entries));
    }

    private KiwiAugmentFallback toFallback(JsonNode node) {
        Long id = readId(node);
        if (id == null) {
            return null;
        }

        String tooltip = cleanTooltipText(firstText(node, "tooltip"));
        String desc = cleanTooltipText(firstText(node, "desc"));
        String description = firstNonBlank(tooltip, desc);
        return new KiwiAugmentFallback(
                id,
                firstText(node, "name_cn", "nameCn", "name"),
                description,
                tooltip,
                desc,
                firstText(node, "level", "rarity")
        );
    }

    private Long readId(JsonNode node) {
        for (String field : List.of("augmentID", "augmentId", "id")) {
            JsonNode value = node.get(field);
            Long id = normalizeId(value);
            if (id != null) {
                return id;
            }
        }
        return null;
    }

    private Long normalizeId(JsonNode value) {
        if (value == null || value.isNull()) {
            return null;
        }
        if (value.isIntegralNumber()) {
            long id = value.longValue();
            return id > 0 ? id : null;
        }
        if (value.isTextual()) {
            try {
                long id = Long.parseLong(value.asText().trim());
                return id > 0 ? id : null;
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private String firstText(JsonNode node, String... fields) {
        for (String field : fields) {
            JsonNode value = node.get(field);
            if (value != null && value.isTextual() && !value.asText().isBlank()) {
                return value.asText().trim();
            }
        }
        return "";
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return "";
    }

    private String cleanTooltipText(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }

        return decodeHtmlEntities(value)
                .replaceAll("\\r\\n?", "\n")
                .replaceAll("(?i)<br\\s*/?>", "\n")
                .replaceAll("(?i)</(?:p|div|li|ul|ol|tr|table|maintext|stats|rules)>", "\n")
                .replaceAll("(?i)<li(?:\\s[^>]*)?>", "\n")
                .replaceAll("\\{\\{[\\s\\S]*?}}", "")
                .replaceAll("@[^@\\s]+@", "\n")
                .replaceAll("(?i)%i:[^%\\s]+%?", "")
                .replaceAll("<[^>]*>", "")
                .replaceAll("[ \\t\\f\\x0B]+", " ")
                .replaceAll(" *\\n+ *", "\n")
                .replaceAll("\\n{2,}", "\n")
                .trim();
    }

    private String decodeHtmlEntities(String value) {
        String decoded = value
                .replace("&nbsp;", " ")
                .replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .replace("&apos;", "'");
        decoded = replaceNumericEntities(decoded, HEX_ENTITY, 16);
        return replaceNumericEntities(decoded, DECIMAL_ENTITY, 10);
    }

    private String replaceNumericEntities(String value, Pattern pattern, int radix) {
        Matcher matcher = pattern.matcher(value);
        StringBuilder result = new StringBuilder();
        while (matcher.find()) {
            try {
                int codePoint = Integer.parseInt(matcher.group(1), radix);
                matcher.appendReplacement(result, Matcher.quoteReplacement(new String(Character.toChars(codePoint))));
            } catch (RuntimeException ignored) {
                matcher.appendReplacement(result, Matcher.quoteReplacement(matcher.group(0)));
            }
        }
        matcher.appendTail(result);
        return result.toString();
    }

    @FunctionalInterface
    interface KiwiPayloadFetcher {
        String fetch(String url, Duration timeout) throws Exception;
    }

    private static class HttpKiwiPayloadFetcher implements KiwiPayloadFetcher {
        @Override
        public String fetch(String url, Duration timeout) throws IOException, InterruptedException {
            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(timeout)
                    .followRedirects(HttpClient.Redirect.NORMAL)
                    .build();
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(timeout)
                    .header("Accept", "application/json,text/plain,*/*")
                    .header("User-Agent", "RankPeek/kiwi-augment-fallback")
                    .GET()
                    .build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IOException("HTTP " + response.statusCode());
            }
            return response.body();
        }
    }

    public record KiwiAugmentFallback(
            long id,
            String name,
            String description,
            String tooltip,
            String desc,
            String rarity
    ) {
    }
}
