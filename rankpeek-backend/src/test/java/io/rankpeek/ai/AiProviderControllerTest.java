package io.rankpeek.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.math.BigDecimal;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AiProviderControllerTest {

    private AiProviderSettingsService service;
    private MockMvc mockMvc;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        service = mock(AiProviderSettingsService.class);
        mockMvc = MockMvcBuilders.standaloneSetup(new AiProviderController(service)).build();
        objectMapper = new ObjectMapper();
    }

    @Test
    void providers_returnsDomesticPresetProfilesWithCustomLast() throws Exception {
        when(service.listProviderProfiles()).thenReturn(AiProviderSettingsService.defaultProviderProfiles());

        mockMvc.perform(get("/api/v1/ai/providers"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.providers[0].id").value("deepseek"))
                .andExpect(jsonPath("$.data.providers[0].dialect").value("openai-compatible"))
                .andExpect(jsonPath("$.data.providers[0].defaultBaseUrl").value("https://api.deepseek.com"))
                .andExpect(jsonPath("$.data.providers[0].apiKeyUrl").value("https://platform.deepseek.com/api_keys"))
                .andExpect(jsonPath("$.data.providers[0].models.length()").value(0))
                .andExpect(jsonPath("$.data.providers[1].id").value("qwen"))
                .andExpect(jsonPath("$.data.providers[1].defaultBaseUrl").value("https://dashscope.aliyuncs.com/compatible-mode/v1"))
                .andExpect(jsonPath("$.data.providers[1].models.length()").value(0))
                .andExpect(jsonPath("$.data.providers[1].supportsWebSearch").value(true))
                .andExpect(jsonPath("$.data.providers[1].supportsDeepThinking").value(true))
                .andExpect(jsonPath("$.data.providers[2].id").value("mimo"))
                .andExpect(jsonPath("$.data.providers[2].label").value("MiMo / 小米"))
                .andExpect(jsonPath("$.data.providers[2].defaultBaseUrl").value("https://api.xiaomimimo.com/v1"))
                .andExpect(jsonPath("$.data.providers[2].models.length()").value(0))
                .andExpect(jsonPath("$.data.providers[2].apiKeyUrl").value("https://platform.xiaomimimo.com/#/console/api-keys"))
                .andExpect(jsonPath("$.data.providers[3].id").value("minimax"))
                .andExpect(jsonPath("$.data.providers[3].label").value("MiniMax"))
                .andExpect(jsonPath("$.data.providers[3].defaultBaseUrl").value("https://api.minimaxi.com/v1"))
                .andExpect(jsonPath("$.data.providers[3].models.length()").value(0))
                .andExpect(jsonPath("$.data.providers[4].id").value("glm"))
                .andExpect(jsonPath("$.data.providers[4].defaultBaseUrl").value("https://open.bigmodel.cn/api/paas/v4"))
                .andExpect(jsonPath("$.data.providers[4].models.length()").value(0))
                .andExpect(jsonPath("$.data.providers[5].id").value("custom-openai-compatible"))
                .andExpect(jsonPath("$.data.providers[5].label").value("自定义厂商（OpenAI Key 兼容）"))
                .andExpect(jsonPath("$.data.providers[5].apiKeyUrl").doesNotExist());
    }

    @Test
    void settings_returnsMaskedSettingsWithoutRawApiKey() throws Exception {
        when(service.getSettings()).thenReturn(new AiProviderSettings(
                true,
                "deepseek",
                "https://api.deepseek.com",
                "deepseek-v4-flash",
                "key-1",
                true,
                "sk-****abcd",
                true,
                false,
                null
        ));

        mockMvc.perform(get("/api/v1/ai/settings"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.providerId").value("deepseek"))
                .andExpect(jsonPath("$.data.apiKeyId").value("key-1"))
                .andExpect(jsonPath("$.data.apiKeySaved").value(true))
                .andExpect(jsonPath("$.data.apiKeyMasked").value("sk-****abcd"))
                .andExpect(jsonPath("$.data.apiKey").doesNotExist())
                .andExpect(jsonPath("$.data.webSearchEnabled").value(true))
                .andExpect(jsonPath("$.data.deepThinkingEnabled").value(false))
                .andExpect(jsonPath("$.data.temperature").doesNotExist())
                .andExpect(jsonPath("$.data.maxTokens").doesNotExist())
                .andExpect(jsonPath("$.data.pricing").doesNotExist());
    }

    @Test
    void saveSettings_delegatesToServiceAndReturnsMaskedSettings() throws Exception {
        AiProviderSettingsSaveRequest request = new AiProviderSettingsSaveRequest(
                true,
                "deepseek",
                "https://api.deepseek.com",
                "deepseek-v4-flash",
                "sk-raw-secret",
                "key-1",
                true,
                true,
                true,
                new AiProviderPricing(
                        "CNY",
                        new BigDecimal("0.02"),
                        new BigDecimal("1"),
                        new BigDecimal("2")
                )
        );
        when(service.saveSettings(any(AiProviderSettingsSaveRequest.class))).thenReturn(new AiProviderSettings(
                true,
                "deepseek",
                "https://api.deepseek.com",
                "deepseek-v4-flash",
                "key-1",
                true,
                "sk-****cret",
                true,
                true,
                request.pricing()
        ));

        mockMvc.perform(put("/api/v1/ai/settings")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.enabled").value(true))
                .andExpect(jsonPath("$.data.apiKeyId").value("key-1"))
                .andExpect(jsonPath("$.data.webSearchEnabled").value(true))
                .andExpect(jsonPath("$.data.deepThinkingEnabled").value(true))
                .andExpect(jsonPath("$.data.apiKeyMasked").value("sk-****cret"))
                .andExpect(jsonPath("$.data.apiKey").doesNotExist());
    }

    @Test
    void testProvider_delegatesToServiceAndReturnsConnectionResult() throws Exception {
        AiProviderTestRequest request = new AiProviderTestRequest(
                "deepseek",
                "https://api.deepseek.com",
                "deepseek-v4-flash",
                "sk-unsaved-test",
                null
        );
        when(service.testProvider(any(AiProviderTestRequest.class))).thenReturn(new AiProviderTestResponse(
                true,
                "deepseek",
                "deepseek-v4-flash",
                "AI provider connection succeeded."
        ));

        mockMvc.perform(post("/api/v1/ai/test")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.configured").value(true))
                .andExpect(jsonPath("$.data.providerId").value("deepseek"))
                .andExpect(jsonPath("$.data.model").value("deepseek-v4-flash"))
                .andExpect(jsonPath("$.data.apiKey").doesNotExist());
    }

    @Test
    void listModels_delegatesToServiceAndReturnsModelIds() throws Exception {
        AiProviderModelsRequest request = new AiProviderModelsRequest(
                "custom-openai-compatible",
                "https://provider.example/v1",
                "sk-unsaved-test",
                null
        );
        when(service.listModels(any(AiProviderModelsRequest.class))).thenReturn(new AiProviderModelsResponse(
                List.of("free-model-a", "free-model-b")
        ));

        mockMvc.perform(post("/api/v1/ai/models")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.models[0]").value("free-model-a"))
                .andExpect(jsonPath("$.data.models[1]").value("free-model-b"))
                .andExpect(jsonPath("$.data.apiKey").doesNotExist());
    }

    @Test
    void apiKeys_delegatesToServiceAndReturnsMaskedKeys() throws Exception {
        when(service.listApiKeys("deepseek", "https://api.deepseek.com")).thenReturn(List.of(
                new AiProviderKey(
                        "key-1",
                        "deepseek",
                        "https://api.deepseek.com",
                        "DeepSeek-sk-****ceab",
                        "sk-****ceab",
                        100L,
                        200L
                ),
                new AiProviderKey(
                        "key-2",
                        "deepseek",
                        "https://api.deepseek.com",
                        "DeepSeek-sk-****ceab",
                        "sk-****abcd",
                        101L,
                        201L
                )
        ));

        mockMvc.perform(get("/api/v1/ai/keys")
                        .param("providerId", "deepseek")
                        .param("baseUrl", "https://api.deepseek.com"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.keys[0].id").value("key-1"))
                .andExpect(jsonPath("$.data.keys[0].name").value("DeepSeek-sk-****ceab"))
                .andExpect(jsonPath("$.data.keys[0].apiKeyMasked").value("sk-****ceab"))
                .andExpect(jsonPath("$.data.keys[0].apiKey").doesNotExist())
                .andExpect(jsonPath("$.data.keys[1].name").value("DeepSeek-sk-****ceab"));
    }

    @Test
    void saveApiKey_delegatesToServiceAndReturnsMaskedKey() throws Exception {
        AiProviderKeySaveRequest request = new AiProviderKeySaveRequest(
                "deepseek",
                "https://api.deepseek.com",
                "",
                "sk-raw-secret"
        );
        when(service.saveApiKey(any(AiProviderKeySaveRequest.class))).thenReturn(new AiProviderKey(
                "key-1",
                "deepseek",
                "https://api.deepseek.com",
                "DeepSeek-sk-****cret",
                "sk-****cret",
                100L,
                100L
        ));

        mockMvc.perform(post("/api/v1/ai/keys")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").value("key-1"))
                .andExpect(jsonPath("$.data.name").value("DeepSeek-sk-****cret"))
                .andExpect(jsonPath("$.data.apiKeyMasked").value("sk-****cret"))
                .andExpect(jsonPath("$.data.apiKey").doesNotExist());
    }

    @Test
    void deleteApiKey_delegatesToServiceWithoutReturningRawKey() throws Exception {
        mockMvc.perform(delete("/api/v1/ai/keys/key-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.deleted").value(true))
                .andExpect(jsonPath("$.data.apiKey").doesNotExist());

        verify(service).deleteApiKey("key-1");
    }
}
