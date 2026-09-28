package io.rankpeek.ai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;

@Component
public class OpenAiCompatibleChatClient {

    private static final Duration DEFAULT_CONNECT_TIMEOUT = Duration.ofSeconds(5);
    private static final Duration DEFAULT_READ_TIMEOUT = Duration.ofSeconds(30);

    private final ObjectMapper objectMapper;

    public OpenAiCompatibleChatClient(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public void streamChat(
            ChatOptions options,
            List<OpenAiChatMessage> messages,
            Consumer<String> onDelta,
            Consumer<AiTokenUsage> onUsage
    ) {
        stream(options, messages, onDelta, onUsage, false);
    }

    public void streamJsonChat(
            ChatOptions options,
            List<OpenAiChatMessage> messages,
            Consumer<String> onDelta,
            Consumer<AiTokenUsage> onUsage
    ) {
        stream(options, messages, onDelta, onUsage, true);
    }

    public List<String> listModels(ChatOptions options) {
        ChatOptions normalized = options.normalized();
        if (normalized.apiKey().isBlank()) {
            throw new AiProviderException("AI provider API key is not configured");
        }

        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(normalized.connectTimeout())
                .build();
        HttpRequest request = HttpRequest.newBuilder(URI.create(normalized.modelsUrl()))
                .timeout(normalized.readTimeout())
                .header("Authorization", "Bearer " + normalized.apiKey())
                .header("Accept", "application/json")
                .GET()
                .build();

        HttpResponse<String> response;
        try {
            response = client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new AiProviderException("AI provider models request was interrupted", exception);
        } catch (HttpTimeoutException exception) {
            throw new AiProviderException("AI provider models request timed out", exception);
        } catch (IOException exception) {
            throw new AiProviderException("AI provider models request failed", exception);
        }

        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new AiProviderException("AI provider models request failed: HTTP " + response.statusCode());
        }
        return parseModelList(response.body());
    }

    private void stream(
            ChatOptions options,
            List<OpenAiChatMessage> messages,
            Consumer<String> onDelta,
            Consumer<AiTokenUsage> onUsage,
            boolean jsonObjectResponse
    ) {
        ChatOptions normalized = options.normalized();
        if (normalized.apiKey().isBlank()) {
            throw new AiProviderException("AI provider API key is not configured");
        }

        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(normalized.connectTimeout())
                .build();
        HttpRequest request = HttpRequest.newBuilder(URI.create(normalized.chatCompletionsUrl()))
                .timeout(normalized.readTimeout())
                .header("Authorization", "Bearer " + normalized.apiKey())
                .header("Content-Type", "application/json")
                .header("Accept", "text/event-stream")
                .POST(HttpRequest.BodyPublishers.ofString(
                        buildRequestBody(normalized, messages, jsonObjectResponse || normalized.jsonObjectResponse()),
                        StandardCharsets.UTF_8
                ))
                .build();

        HttpResponse<java.io.InputStream> response;
        try {
            response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new AiProviderException("AI provider request was interrupted", exception);
        } catch (HttpTimeoutException exception) {
            throw new AiProviderException("AI provider request timed out", exception);
        } catch (IOException exception) {
            throw new AiProviderException("AI provider request failed", exception);
        }

        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new AiProviderException("AI provider request failed: HTTP " + response.statusCode());
        }

        parseSseResponse(response, normalized.providerId(), normalized.model(), onDelta, onUsage);
    }

    private String buildRequestBody(
            ChatOptions options,
            List<OpenAiChatMessage> messages,
            boolean jsonObjectResponse
    ) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", options.model());
        body.put("stream", true);
        body.put("stream_options", Map.of("include_usage", true));
        applyProviderModeOptions(body, options, jsonObjectResponse);
        if (jsonObjectResponse) {
            body.put("response_format", Map.of("type", "json_object"));
        }
        body.put("messages", messages.stream()
                .map(message -> Map.of(
                        "role", message.role(),
                        "content", message.content()
                ))
                .toList());
        try {
            return objectMapper.writeValueAsString(body);
        } catch (JsonProcessingException exception) {
            throw new AiProviderException("AI provider request body serialization failed", exception);
        }
    }

    private void applyProviderModeOptions(Map<String, Object> body, ChatOptions options, boolean jsonObjectResponse) {
        switch (options.providerId()) {
            case "deepseek" -> applyThinkingBody(body, options.deepThinkingEnabled());
            case "qwen" -> {
                body.put("enable_thinking", jsonObjectResponse ? false : options.deepThinkingEnabled());
                if (options.webSearchEnabled()) {
                    body.put("enable_search", true);
                }
            }
            case "mimo" -> applyThinkingBody(body, options.deepThinkingEnabled());
            case "glm" -> {
                applyThinkingBody(body, options.deepThinkingEnabled());
                if (options.webSearchEnabled()) {
                    body.put("tools", List.of(Map.of("type", "web_search")));
                }
            }
            default -> {
            }
        }
    }

    private void applyThinkingBody(Map<String, Object> body, boolean enabled) {
        body.put("thinking", Map.of("type", enabled ? "enabled" : "disabled"));
        if (enabled) {
            body.put("reasoning_effort", "high");
        }
    }

    private void parseSseResponse(
            HttpResponse<java.io.InputStream> response,
            String providerId,
            String fallbackModel,
            Consumer<String> onDelta,
            Consumer<AiTokenUsage> onUsage
    ) {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                String trimmed = line.trim();
                if (!trimmed.startsWith("data:")) {
                    continue;
                }

                String data = trimmed.substring("data:".length()).trim();
                if (data.isEmpty()) {
                    continue;
                }
                if ("[DONE]".equals(data)) {
                    return;
                }

                JsonNode root = readStreamChunk(data);
                JsonNode usage = root.get("usage");
                if (usage != null && usage.isObject()) {
                    onUsage.accept(readTokenUsage(providerId, root, usage, fallbackModel));
                }

                String content = readDeltaContent(root);
                if (!content.isEmpty()) {
                    onDelta.accept(content);
                }
            }
        } catch (IOException exception) {
            throw new AiProviderException("AI provider stream response failed", exception);
        }
    }

    private JsonNode readStreamChunk(String data) {
        try {
            return objectMapper.readTree(data);
        } catch (JsonProcessingException exception) {
            throw new AiProviderException("AI provider stream response is not valid JSON", exception);
        }
    }

    private String readDeltaContent(JsonNode root) {
        JsonNode content = root.path("choices").path(0).path("delta").path("content");
        return content.isTextual() ? content.asText() : "";
    }

    private AiTokenUsage readTokenUsage(
            String providerId,
            JsonNode root,
            JsonNode usage,
            String fallbackModel
    ) {
        long promptTokens = readLong(usage, "prompt_tokens");
        long cacheHitTokens = readPromptCacheHitTokens(usage);
        long cacheMissTokens = usage.has("prompt_cache_miss_tokens")
                ? readLong(usage, "prompt_cache_miss_tokens")
                : Math.max(0, promptTokens - cacheHitTokens);
        return new AiTokenUsage(
                providerId,
                readModel(root, fallbackModel),
                promptTokens,
                readLong(usage, "completion_tokens"),
                readLong(usage, "total_tokens"),
                cacheHitTokens,
                cacheMissTokens
        );
    }

    private long readPromptCacheHitTokens(JsonNode usage) {
        if (usage.has("prompt_cache_hit_tokens")) {
            return readLong(usage, "prompt_cache_hit_tokens");
        }
        JsonNode cachedTokens = usage.path("prompt_tokens_details").path("cached_tokens");
        return cachedTokens.canConvertToLong() ? cachedTokens.asLong() : 0L;
    }

    private String readModel(JsonNode root, String fallbackModel) {
        JsonNode model = root.path("model");
        return model.isTextual() && !model.asText().isBlank() ? model.asText() : fallbackModel;
    }

    private long readLong(JsonNode node, String fieldName) {
        JsonNode value = node.path(fieldName);
        return value.canConvertToLong() ? value.asLong() : 0L;
    }

    private List<String> parseModelList(String body) {
        try {
            JsonNode root = objectMapper.readTree(body);
            Set<String> models = new LinkedHashSet<>();
            collectModelIds(root.path("data"), models);
            collectModelIds(root.path("models"), models);
            return List.copyOf(models);
        } catch (JsonProcessingException exception) {
            throw new AiProviderException("AI provider models response is not valid JSON", exception);
        }
    }

    private void collectModelIds(JsonNode node, Set<String> models) {
        if (!node.isArray()) {
            return;
        }
        for (JsonNode item : node) {
            String model = "";
            if (item.isTextual()) {
                model = item.asText();
            } else {
                JsonNode id = item.path("id");
                if (id.isTextual()) {
                    model = id.asText();
                }
            }
            if (!model.isBlank()) {
                models.add(model.trim());
            }
        }
    }

    public record ChatOptions(
            String providerId,
            String baseUrl,
            String model,
            String apiKey,
            Duration connectTimeout,
            Duration readTimeout,
            boolean webSearchEnabled,
            boolean deepThinkingEnabled,
            boolean jsonObjectResponse
    ) {
        private ChatOptions normalized() {
            return new ChatOptions(
                    blankToDefault(providerId, "openai-compatible"),
                    normalizeBaseUrl(baseUrl),
                    blankToDefault(model, "default"),
                    apiKey == null ? "" : apiKey.trim(),
                    connectTimeout == null ? DEFAULT_CONNECT_TIMEOUT : connectTimeout,
                    readTimeout == null ? DEFAULT_READ_TIMEOUT : readTimeout,
                    webSearchEnabled,
                    deepThinkingEnabled,
                    jsonObjectResponse
            );
        }

        private String chatCompletionsUrl() {
            return baseUrl + "/chat/completions";
        }

        private String modelsUrl() {
            return baseUrl + "/models";
        }

        private static String normalizeBaseUrl(String value) {
            String normalized = blankToDefault(value, "");
            while (normalized.endsWith("/")) {
                normalized = normalized.substring(0, normalized.length() - 1);
            }
            if (normalized.isBlank()) {
                throw new AiProviderException("AI provider base URL is not configured");
            }
            return normalized;
        }

        private static String blankToDefault(String value, String defaultValue) {
            return value == null || value.isBlank() ? defaultValue : value.trim();
        }
    }
}
