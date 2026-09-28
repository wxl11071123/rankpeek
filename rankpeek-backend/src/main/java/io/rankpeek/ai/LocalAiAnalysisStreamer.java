package io.rankpeek.ai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;

@Component
public class LocalAiAnalysisStreamer {

    private static final MediaType APPLICATION_JSON_UTF8 = new MediaType("application", "json", StandardCharsets.UTF_8);
    private static final Charset WINDOWS_1252 = Charset.forName("windows-1252");

    private final OpenAiCompatibleChatClient chatClient;
    private final ObjectMapper objectMapper;

    public LocalAiAnalysisStreamer(OpenAiCompatibleChatClient chatClient, ObjectMapper objectMapper) {
        this.chatClient = chatClient;
        this.objectMapper = objectMapper;
    }

    public StreamResult streamToEmitter(
            SseEmitter emitter,
            StoredAiProviderSettings settings,
            List<OpenAiChatMessage> messages,
            String sectionTitle
    ) {
        StringBuilder responseText = new StringBuilder();
        AtomicReference<AiTokenUsage> usage = new AtomicReference<>();
        sendEvent(emitter, "start", Map.of("type", "start", "title", "RankPeek local AI stream started"));
        sendEvent(emitter, "section", Map.of("type", "section", "title", sectionTitle));
        chatClient.streamChat(
                chatOptions(settings, false),
                messages,
                delta -> {
                    responseText.append(delta);
                    sendEvent(emitter, "delta", Map.of("type", "delta", "text", delta));
                },
                value -> {
                    usage.set(value);
                    sendEvent(emitter, "usage", Map.of("type", "usage", "usage", value));
                }
        );
        sendEvent(emitter, "done", Map.of("type", "done"));
        return new StreamResult(responseText.toString(), usage.get());
    }

    public StreamResult streamJsonToEmitter(
            SseEmitter emitter,
            StoredAiProviderSettings settings,
            List<OpenAiChatMessage> messages,
            String sectionTitle
    ) {
        StringBuilder responseText = new StringBuilder();
        AtomicReference<AiTokenUsage> usage = new AtomicReference<>();
        sendEvent(emitter, "start", Map.of("type", "start", "title", "RankPeek local AI stream started"));
        sendEvent(emitter, "section", Map.of("type", "section", "title", sectionTitle));
        chatClient.streamJsonChat(
                chatOptions(settings, true),
                messages,
                delta -> {
                    responseText.append(delta);
                    sendEvent(emitter, "delta", Map.of("type", "delta", "text", delta));
                },
                value -> {
                    usage.set(value);
                    sendEvent(emitter, "usage", Map.of("type", "usage", "usage", value));
                }
        );
        sendEvent(emitter, "done", Map.of("type", "done"));
        return new StreamResult(responseText.toString(), usage.get());
    }

    public StreamResult streamPregameInsightsToEmitter(
            SseEmitter emitter,
            StoredAiProviderSettings settings,
            List<OpenAiChatMessage> messages,
            String sectionTitle,
            Set<String> allowedPlayerKeys
    ) {
        StringBuilder responseText = new StringBuilder();
        StringBuilder lineBuffer = new StringBuilder();
        AtomicReference<AiTokenUsage> usage = new AtomicReference<>();
        sendEvent(emitter, "start", Map.of("type", "start", "title", "RankPeek local AI stream started"));
        sendEvent(emitter, "section", Map.of("type", "section", "title", sectionTitle));
        chatClient.streamChat(
                chatOptions(settings, false),
                messages,
                delta -> {
                    consumePregameDelta(emitter, responseText, lineBuffer, allowedPlayerKeys, delta);
                },
                value -> {
                    usage.set(value);
                    sendEvent(emitter, "usage", Map.of("type", "usage", "usage", value));
                }
        );
        flushPregameBuffer(emitter, responseText, lineBuffer, allowedPlayerKeys);
        sendEvent(emitter, "done", Map.of("type", "done"));
        return new StreamResult(responseText.toString(), usage.get());
    }

    public StreamResult streamJson(
            StoredAiProviderSettings settings,
            List<OpenAiChatMessage> messages
    ) {
        StringBuilder responseText = new StringBuilder();
        AtomicReference<AiTokenUsage> usage = new AtomicReference<>();
        chatClient.streamJsonChat(
                chatOptions(settings, true),
                messages,
                responseText::append,
                usage::set
        );
        return new StreamResult(responseText.toString(), usage.get());
    }

    public void sendError(SseEmitter emitter, String code, String message) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "error");
        payload.put("code", code);
        payload.put("message", message);
        sendEvent(emitter, "error", payload);
    }

    private OpenAiCompatibleChatClient.ChatOptions chatOptions(
            StoredAiProviderSettings settings,
            boolean jsonObjectResponse
    ) {
        return new OpenAiCompatibleChatClient.ChatOptions(
                settings.providerId(),
                settings.baseUrl(),
                settings.model(),
                settings.apiKeyEncrypted(),
                Duration.ofSeconds(5),
                Duration.ofSeconds(60),
                settings.webSearchEnabled(),
                settings.deepThinkingEnabled(),
                jsonObjectResponse
        );
    }

    private void sendEvent(SseEmitter emitter, String eventName, Object payload) {
        try {
            emitter.send(SseEmitter.event()
                    .name(eventName)
                    .data(payload, APPLICATION_JSON_UTF8));
        } catch (Exception exception) {
            throw new AiProviderException("Local AI stream delivery failed", exception);
        }
    }

    private void consumePregameDelta(
            SseEmitter emitter,
            StringBuilder responseText,
            StringBuilder buffer,
            Set<String> allowedPlayerKeys,
            String delta
    ) {
        buffer.append(delta);
        int newlineIndex = buffer.indexOf("\n");
        while (newlineIndex >= 0) {
            String line = buffer.substring(0, newlineIndex);
            buffer.delete(0, newlineIndex + 1);
            appendStoredPregameLine(responseText, sendPregameInsightLine(emitter, allowedPlayerKeys, line));
            newlineIndex = buffer.indexOf("\n");
        }
    }

    private void flushPregameBuffer(
            SseEmitter emitter,
            StringBuilder responseText,
            StringBuilder buffer,
            Set<String> allowedPlayerKeys
    ) {
        if (buffer.toString().trim().isEmpty()) {
            return;
        }
        appendStoredPregameLine(responseText, sendPregameInsightLine(emitter, allowedPlayerKeys, buffer.toString()));
        buffer.setLength(0);
    }

    private String sendPregameInsightLine(SseEmitter emitter, Set<String> allowedPlayerKeys, String line) {
        String trimmed = line == null ? "" : line.trim();
        if (trimmed.isEmpty()) {
            return "";
        }

        JsonNode node;
        try {
            node = objectMapper.readTree(trimmed);
        } catch (JsonProcessingException exception) {
            throw new AiProviderException("Local AI pregame insight is not valid NDJSON", exception);
        }

        String playerKey = normalizePregamePlayerKey(readText(node, "playerKey"), allowedPlayerKeys);
        String label = repairUtf8Mojibake(readText(node, "label"));
        String text = repairUtf8Mojibake(readText(node, "text"));
        if (playerKey.isBlank() || label.isBlank() || text.isBlank()) {
            throw new AiProviderException("Local AI pregame insight missing required fields");
        }
        if (allowedPlayerKeys != null && !allowedPlayerKeys.isEmpty() && !allowedPlayerKeys.contains(playerKey)) {
            throw new AiProviderException("Local AI pregame insight playerKey is not allowed");
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "player_insight");
        payload.put("playerKey", playerKey);
        payload.put("label", label);
        payload.put("tone", normalizeTone(readText(node, "tone")));
        payload.put("text", text);
        sendEvent(emitter, "player_insight", payload);

        Map<String, Object> storedPayload = new LinkedHashMap<>();
        storedPayload.put("playerKey", playerKey);
        storedPayload.put("label", label);
        storedPayload.put("tone", payload.get("tone"));
        storedPayload.put("text", text);
        return writeJson(storedPayload);
    }

    private void appendStoredPregameLine(StringBuilder responseText, String line) {
        if (line == null || line.isBlank()) {
            return;
        }
        if (!responseText.isEmpty()) {
            responseText.append('\n');
        }
        responseText.append(line);
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new AiProviderException("Local AI pregame insight serialization failed", exception);
        }
    }

    private static String normalizePregamePlayerKey(String playerKey, Set<String> allowedPlayerKeys) {
        String normalized = playerKey == null ? "" : playerKey.trim();
        if (normalized.isBlank() || allowedPlayerKeys == null || allowedPlayerKeys.isEmpty()) {
            return normalized;
        }
        return normalized;
    }

    private static String repairUtf8Mojibake(String value) {
        if (value == null || value.isBlank()) {
            return value == null ? "" : value.trim();
        }
        String trimmed = value.trim();
        if (containsCjkOrFullwidth(trimmed) || trimmed.chars().noneMatch(character -> character > 0x7F)) {
            return trimmed;
        }
        for (Charset charset : List.of(StandardCharsets.ISO_8859_1, WINDOWS_1252)) {
            String repaired = new String(trimmed.getBytes(charset), StandardCharsets.UTF_8).trim();
            if (containsCjkOrFullwidth(repaired)) {
                return repaired;
            }
        }
        return trimmed;
    }

    private static boolean containsCjkOrFullwidth(String value) {
        if (value == null || value.isBlank()) {
            return false;
        }
        return value.chars().anyMatch(character ->
                (character >= 0x3400 && character <= 0x9FFF)
                        || (character >= 0xFF00 && character <= 0xFFEF)
        );
    }

    private static String readText(JsonNode node, String fieldName) {
        JsonNode field = node.path(fieldName);
        return field.isTextual() ? field.asText().trim() : "";
    }

    private static String normalizeTone(String tone) {
        return switch (tone == null ? "" : tone.trim()) {
            case "carry", "stable", "risk", "weak", "unknown" -> tone.trim();
            default -> "unknown";
        };
    }

    public record StreamResult(
            String text,
            AiTokenUsage usage
    ) {
    }
}
