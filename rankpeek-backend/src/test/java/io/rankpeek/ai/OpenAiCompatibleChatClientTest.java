package io.rankpeek.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class OpenAiCompatibleChatClientTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void streamChat_postsOpenAiCompatibleRequestAndParsesDeltaAndUsage() throws Exception {
        AtomicReference<String> requestBody = new AtomicReference<>();
        AtomicReference<String> authorizationHeader = new AtomicReference<>();
        HttpServer server = startSseServer(exchange -> {
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            authorizationHeader.set(exchange.getRequestHeaders().getFirst("Authorization"));
            byte[] body = """
                    data: {"model":"deepseek-v4-flash","choices":[{"delta":{"content":"hello"}}]}

                    data: {"model":"deepseek-v4-flash","choices":[{"delta":{"content":" world"}}]}

                    data: {"model":"deepseek-v4-flash","usage":{"prompt_tokens":10,"prompt_cache_hit_tokens":4,"prompt_cache_miss_tokens":6,"completion_tokens":3,"total_tokens":13},"choices":[{"delta":{}}]}

                    data: [DONE]

                    """.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });

        try {
            OpenAiCompatibleChatClient client = new OpenAiCompatibleChatClient(objectMapper);
            StringBuilder output = new StringBuilder();
            AtomicReference<AiTokenUsage> usage = new AtomicReference<>();

            client.streamChat(
                    new OpenAiCompatibleChatClient.ChatOptions(
                            "deepseek",
                            "http://127.0.0.1:" + server.getAddress().getPort(),
                            "deepseek-v4-flash",
                            "sk-test",
                            Duration.ofSeconds(2),
                            Duration.ofSeconds(2),
                            false,
                            false,
                            false
                    ),
                    List.of(
                            new OpenAiChatMessage("system", "You are RankPeek."),
                            new OpenAiChatMessage("user", "Analyze this match.")
                    ),
                    output::append,
                    usage::set
            );

            JsonNode body = objectMapper.readTree(requestBody.get());
            assertThat(authorizationHeader.get()).isEqualTo("Bearer sk-test");
            assertThat(body.path("model").asText()).isEqualTo("deepseek-v4-flash");
            assertThat(body.path("stream").asBoolean()).isTrue();
            assertThat(body.path("stream_options").path("include_usage").asBoolean()).isTrue();
            assertThat(body.path("messages")).hasSize(2);
            assertThat(body.has("max_tokens")).isFalse();
            assertThat(body.has("temperature")).isFalse();
            assertThat(output).hasToString("hello world");
            assertThat(usage.get()).isEqualTo(new AiTokenUsage(
                    "deepseek",
                    "deepseek-v4-flash",
                    10,
                    3,
                    13,
                    4,
                    6
            ));
        } finally {
            server.stop(0);
        }
    }

    @Test
    void streamJsonChat_requestsJsonObjectResponseAndDerivesCacheMissTokens() throws Exception {
        AtomicReference<String> requestBody = new AtomicReference<>();
        HttpServer server = startSseServer(exchange -> {
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] body = """
                    data: {"model":"custom-model","usage":{"prompt_tokens":10,"prompt_cache_hit_tokens":3,"completion_tokens":2,"total_tokens":12},"choices":[{"delta":{"content":"{}"}}]}

                    data: [DONE]

                    """.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });

        try {
            OpenAiCompatibleChatClient client = new OpenAiCompatibleChatClient(objectMapper);
            AtomicReference<AiTokenUsage> usage = new AtomicReference<>();

            client.streamJsonChat(
                    new OpenAiCompatibleChatClient.ChatOptions(
                            "custom-openai-compatible",
                            "http://127.0.0.1:" + server.getAddress().getPort(),
                            "custom-model",
                            "sk-test",
                            Duration.ofSeconds(2),
                            Duration.ofSeconds(2),
                            false,
                            false,
                            true
                    ),
                    List.of(new OpenAiChatMessage("user", "Return JSON.")),
                    ignored -> {
                    },
                    usage::set
            );

            JsonNode body = objectMapper.readTree(requestBody.get());
            assertThat(body.path("response_format").path("type").asText()).isEqualTo("json_object");
            assertThat(usage.get().promptCacheMissTokens()).isEqualTo(7);
        } finally {
            server.stop(0);
        }
    }

    @Test
    void streamChat_sendsQwenWebSearchAndThinkingFlagsWhenEnabled() throws Exception {
        AtomicReference<String> requestBody = new AtomicReference<>();
        HttpServer server = startSseServer(exchange -> {
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] body = """
                    data: {"model":"qwen-plus","choices":[{"delta":{}}]}

                    data: [DONE]

                    """.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });

        try {
            OpenAiCompatibleChatClient client = new OpenAiCompatibleChatClient(objectMapper);

            client.streamChat(
                    new OpenAiCompatibleChatClient.ChatOptions(
                            "qwen",
                            "http://127.0.0.1:" + server.getAddress().getPort(),
                            "qwen-plus",
                            "sk-test",
                            Duration.ofSeconds(2),
                            Duration.ofSeconds(2),
                            true,
                            true,
                            false
                    ),
                    List.of(new OpenAiChatMessage("user", "Search and think.")),
                    ignored -> {
                    },
                    ignored -> {
                    }
            );

            JsonNode body = objectMapper.readTree(requestBody.get());
            assertThat(body.path("enable_search").asBoolean()).isTrue();
            assertThat(body.path("enable_thinking").asBoolean()).isTrue();
            assertThat(body.has("max_tokens")).isFalse();
            assertThat(body.has("temperature")).isFalse();
        } finally {
            server.stop(0);
        }
    }

    @Test
    void streamJsonChat_disablesQwenThinkingBecauseJsonModeIsIncompatible() throws Exception {
        AtomicReference<String> requestBody = new AtomicReference<>();
        HttpServer server = startSseServer(exchange -> {
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] body = """
                    data: {"model":"qwen-plus","choices":[{"delta":{"content":"{}"}}]}

                    data: [DONE]

                    """.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });

        try {
            OpenAiCompatibleChatClient client = new OpenAiCompatibleChatClient(objectMapper);

            client.streamJsonChat(
                    new OpenAiCompatibleChatClient.ChatOptions(
                            "qwen",
                            "http://127.0.0.1:" + server.getAddress().getPort(),
                            "qwen-plus",
                            "sk-test",
                            Duration.ofSeconds(2),
                            Duration.ofSeconds(2),
                            true,
                            true,
                            true
                    ),
                    List.of(new OpenAiChatMessage("user", "Return JSON.")),
                    ignored -> {
                    },
                    ignored -> {
                    }
            );

            JsonNode body = objectMapper.readTree(requestBody.get());
            assertThat(body.path("response_format").path("type").asText()).isEqualTo("json_object");
            assertThat(body.path("enable_search").asBoolean()).isTrue();
            assertThat(body.path("enable_thinking").asBoolean()).isFalse();
        } finally {
            server.stop(0);
        }
    }

    @Test
    void listModels_getsOpenAiCompatibleModels() throws Exception {
        AtomicReference<String> requestMethod = new AtomicReference<>();
        AtomicReference<String> authorizationHeader = new AtomicReference<>();
        HttpServer server = startServer("/models", exchange -> {
            requestMethod.set(exchange.getRequestMethod());
            authorizationHeader.set(exchange.getRequestHeaders().getFirst("Authorization"));
            byte[] body = """
                    {"object":"list","data":[{"id":"free-model-a"},{"id":"free-model-b"},{"object":"model"}]}
                    """.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });

        try {
            OpenAiCompatibleChatClient client = new OpenAiCompatibleChatClient(objectMapper);

            List<String> models = client.listModels(new OpenAiCompatibleChatClient.ChatOptions(
                    "custom-openai-compatible",
                    "http://127.0.0.1:" + server.getAddress().getPort() + "/",
                    "ignored",
                    "sk-test",
                    Duration.ofSeconds(2),
                    Duration.ofSeconds(2),
                    false,
                    false,
                    false
            ));

            assertThat(requestMethod.get()).isEqualTo("GET");
            assertThat(authorizationHeader.get()).isEqualTo("Bearer sk-test");
            assertThat(models).containsExactly("free-model-a", "free-model-b");
        } finally {
            server.stop(0);
        }
    }

    private HttpServer startSseServer(ExchangeHandler handler) throws IOException {
        return startServer("/chat/completions", handler);
    }

    private HttpServer startServer(String path, ExchangeHandler handler) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(path, handler::handle);
        server.start();
        return server;
    }

    @FunctionalInterface
    private interface ExchangeHandler {
        void handle(HttpExchange exchange) throws IOException;
    }
}
