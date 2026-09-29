package io.rankpeek.ai;

import io.rankpeek.cache.LocalCacheSchemaInitializer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.math.BigDecimal;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;

class AiProviderSettingsServiceTest {

    private JdbcTemplate jdbcTemplate;
    private AiProviderSettingsService service;

    @BeforeEach
    void setUp() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:rankpeek-ai-provider-" + System.nanoTime()
                        + ";MODE=PostgreSQL;DATABASE_TO_UPPER=false;DB_CLOSE_DELAY=-1",
                "sa",
                ""
        );
        jdbcTemplate = new JdbcTemplate(dataSource);
        new LocalCacheSchemaInitializer(jdbcTemplate).initializeSchema();
        service = new AiProviderSettingsService(new AiProviderSettingsRepository(jdbcTemplate));
    }

    @Test
    void initializeSchema_createsAiProviderSettingsTable() {
        List<String> columns = jdbcTemplate.queryForList("""
                SELECT COLUMN_NAME
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'ai_provider_settings'
                """, String.class);

        assertThat(columns).contains(
                "id",
                "enabled",
                "provider_id",
                "base_url",
                "model",
                "api_key_encrypted",
                "api_key_masked",
                "selected_api_key_id",
                "web_search_enabled",
                "deep_thinking_enabled",
                "pricing_raw_json",
                "updated_at"
        );
        assertThat(columns).doesNotContain("temperature", "max_tokens");

        List<String> keyColumns = jdbcTemplate.queryForList("""
                SELECT COLUMN_NAME
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = 'ai_provider_keys'
                """, String.class);
        assertThat(keyColumns).contains(
                "id",
                "provider_id",
                "base_url",
                "name",
                "api_key_encrypted",
                "api_key_masked",
                "created_at",
                "updated_at"
        );
    }

    @Test
    void getSettings_returnsDeepSeekDefaultsWithoutRawApiKey() {
        AiProviderSettings settings = service.getSettings();

        assertThat(settings.enabled()).isFalse();
        assertThat(settings.providerId()).isEqualTo("deepseek");
        assertThat(settings.baseUrl()).isEqualTo("https://api.deepseek.com");
        assertThat(settings.model()).isEqualTo("deepseek-v4-flash");
        assertThat(settings.apiKeyId()).isNull();
        assertThat(settings.apiKeySaved()).isFalse();
        assertThat(settings.apiKeyMasked()).isNull();
        assertThat(settings.webSearchEnabled()).isFalse();
        assertThat(settings.deepThinkingEnabled()).isFalse();
        assertThat(settings.pricing()).isNull();
    }

    @Test
    void saveSettings_normalizesBaseUrlMasksApiKeyPersistsModesAndOptionalPricing() {
        AiProviderSettings settings = service.saveSettings(new AiProviderSettingsSaveRequest(
                true,
                "deepseek",
                " https://api.deepseek.com/// ",
                "deepseek-v4-pro",
                "sk-1234567890abcdef",
                null,
                true,
                true,
                true,
                new AiProviderPricing(
                        "CNY",
                        new BigDecimal("0.025"),
                        new BigDecimal("3"),
                        new BigDecimal("6")
                )
        ));

        assertThat(settings.enabled()).isTrue();
        assertThat(settings.baseUrl()).isEqualTo("https://api.deepseek.com");
        assertThat(settings.model()).isEqualTo("deepseek-v4-pro");
        assertThat(settings.apiKeyId()).isNull();
        assertThat(settings.apiKeySaved()).isTrue();
        assertThat(settings.apiKeyMasked()).isEqualTo("sk-****cdef");
        assertThat(settings.webSearchEnabled()).isTrue();
        assertThat(settings.deepThinkingEnabled()).isTrue();
        assertThat(settings.pricing().inputCacheHitCnyPerMillionTokens()).isEqualByComparingTo("0.025");

        String storedKey = jdbcTemplate.queryForObject(
                "SELECT api_key_encrypted FROM ai_provider_settings WHERE id = 'default'",
                String.class
        );
        assertThat(storedKey).isEqualTo("sk-1234567890abcdef");
        assertThat(service.getSettings().apiKeyMasked()).isEqualTo("sk-****cdef");
    }

    @Test
    void saveSettings_prefillsDomesticProviderBaseUrlAndKeepsBlankPricing() {
        AiProviderSettings settings = service.saveSettings(new AiProviderSettingsSaveRequest(
                true,
                "qwen",
                "   ",
                "qwen-plus",
                "sk-qwen",
                null,
                true,
                true,
                false,
                null
        ));

        assertThat(settings.providerId()).isEqualTo("qwen");
        assertThat(settings.baseUrl()).isEqualTo("https://dashscope.aliyuncs.com/compatible-mode/v1");
        assertThat(settings.webSearchEnabled()).isTrue();
        assertThat(settings.deepThinkingEnabled()).isFalse();
        assertThat(settings.pricing()).isNull();
        assertThat(service.getSettings().pricing()).isNull();
    }

    @Test
    void saveSettings_rejectsBlankModelWhenEnabled() {
        assertThatThrownBy(() -> service.saveSettings(new AiProviderSettingsSaveRequest(
                true,
                "deepseek",
                "https://api.deepseek.com",
                " ",
                "sk-test",
                null,
                true,
                false,
                false,
                null
        ))).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("model");
    }

    @Test
    void testProvider_returnsNotConfiguredWhenApiKeyIsMissing() {
        AiProviderTestResponse response = service.testProvider(new AiProviderTestRequest(
                "deepseek",
                "https://api.deepseek.com",
                "deepseek-v4-flash",
                "",
                null
        ));

        assertThat(response.configured()).isFalse();
        assertThat(response.providerId()).isEqualTo("deepseek");
        assertThat(response.model()).isEqualTo("deepseek-v4-flash");
        assertThat(response.message()).contains("configure AI provider");
    }

    @Test
    void testProvider_usesUnsavedRequestValuesWithSavedApiKey() {
        service.saveSettings(new AiProviderSettingsSaveRequest(
                true,
                "deepseek",
                "https://api.deepseek.com",
                "deepseek-v4-flash",
                "sk-saved-secret",
                null,
                true,
                false,
                false,
                null
        ));
        OpenAiCompatibleChatClient chatClient = mock(OpenAiCompatibleChatClient.class);
        AtomicReference<OpenAiCompatibleChatClient.ChatOptions> options = new AtomicReference<>();
        doAnswer(invocation -> {
            options.set(invocation.getArgument(0));
            return null;
        }).when(chatClient).streamJsonChat(any(OpenAiCompatibleChatClient.ChatOptions.class), anyList(), any(), any());
        service = new AiProviderSettingsService(
                new AiProviderSettingsRepository(jdbcTemplate),
                chatClient
        );

        AiProviderTestResponse response = service.testProvider(new AiProviderTestRequest(
                "custom-openai-compatible",
                " https://provider.example/v1/// ",
                "free-model",
                "",
                null
        ));

        assertThat(response.configured()).isTrue();
        assertThat(response.providerId()).isEqualTo("custom-openai-compatible");
        assertThat(response.model()).isEqualTo("free-model");
        assertThat(response.message()).contains("succeeded");
        assertThat(options.get().baseUrl()).isEqualTo("https://provider.example/v1");
        assertThat(options.get().model()).isEqualTo("free-model");
        assertThat(options.get().apiKey()).isEqualTo("sk-saved-secret");
        assertThat(options.get().webSearchEnabled()).isFalse();
        assertThat(options.get().deepThinkingEnabled()).isFalse();
    }

    @Test
    void listModels_usesUnsavedBaseUrlAndFallsBackToSavedApiKey() {
        service.saveSettings(new AiProviderSettingsSaveRequest(
                true,
                "deepseek",
                "https://api.deepseek.com",
                "deepseek-v4-flash",
                "sk-saved-secret",
                null,
                true,
                false,
                false,
                null
        ));
        OpenAiCompatibleChatClient chatClient = mock(OpenAiCompatibleChatClient.class);
        AtomicReference<OpenAiCompatibleChatClient.ChatOptions> options = new AtomicReference<>();
        doAnswer(invocation -> {
            options.set(invocation.getArgument(0));
            return List.of("free-model-a", "free-model-b");
        }).when(chatClient).listModels(any(OpenAiCompatibleChatClient.ChatOptions.class));
        service = new AiProviderSettingsService(
                new AiProviderSettingsRepository(jdbcTemplate),
                chatClient
        );

        AiProviderModelsResponse response = service.listModels(new AiProviderModelsRequest(
                "custom-openai-compatible",
                " https://provider.example/v1/// ",
                "",
                null
        ));

        assertThat(response.models()).containsExactly("free-model-a", "free-model-b");
        assertThat(options.get().providerId()).isEqualTo("custom-openai-compatible");
        assertThat(options.get().baseUrl()).isEqualTo("https://provider.example/v1");
        assertThat(options.get().model()).isEqualTo("models");
        assertThat(options.get().apiKey()).isEqualTo("sk-saved-secret");
    }

    @Test
    void saveApiKey_usesDefaultProviderNameWhenNameIsBlankMasksKeyAndAllowsDuplicateNames() {
        AiProviderKey first = service.saveApiKey(new AiProviderKeySaveRequest(
                "deepseek",
                " https://api.deepseek.com/// ",
                " ",
                "sk-1234567890abcdef"
        ));
        AiProviderKey second = service.saveApiKey(new AiProviderKeySaveRequest(
                "deepseek",
                "https://api.deepseek.com",
                first.name(),
                "sk-abcdef1234567890"
        ));

        assertThat(first.id()).isNotBlank();
        assertThat(first.providerId()).isEqualTo("deepseek");
        assertThat(first.baseUrl()).isEqualTo("https://api.deepseek.com");
        assertThat(first.name()).isEqualTo("DeepSeek-sk-****cdef");
        assertThat(first.apiKeyMasked()).isEqualTo("sk-****cdef");
        assertThat(second.name()).isEqualTo(first.name());

        List<AiProviderKey> keys = service.listApiKeys("deepseek", "https://api.deepseek.com");
        assertThat(keys).extracting(AiProviderKey::id).containsExactlyInAnyOrder(first.id(), second.id());
    }

    @Test
    void saveSettings_canSelectStoredApiKeyByIdWithoutRawKeyInRequest() {
        AiProviderKey key = service.saveApiKey(new AiProviderKeySaveRequest(
                "deepseek",
                "https://api.deepseek.com",
                "RankPeek primary",
                "sk-selected-secret"
        ));

        AiProviderSettings settings = service.saveSettings(new AiProviderSettingsSaveRequest(
                true,
                "deepseek",
                "https://api.deepseek.com",
                "deepseek-v4-flash",
                "",
                key.id(),
                false,
                false,
                false,
                null
        ));

        assertThat(settings.apiKeyId()).isEqualTo(key.id());
        assertThat(settings.apiKeyMasked()).isEqualTo("sk-****cret");

        String storedKey = jdbcTemplate.queryForObject(
                "SELECT api_key_encrypted FROM ai_provider_settings WHERE id = 'default'",
                String.class
        );
        assertThat(storedKey).isEqualTo("sk-selected-secret");
    }

    @Test
    void listModels_usesSelectedStoredApiKeyId() {
        AiProviderKey key = service.saveApiKey(new AiProviderKeySaveRequest(
                "custom-openai-compatible",
                "https://provider.example/v1",
                "free key",
                "sk-selected-model-key"
        ));
        OpenAiCompatibleChatClient chatClient = mock(OpenAiCompatibleChatClient.class);
        AtomicReference<OpenAiCompatibleChatClient.ChatOptions> options = new AtomicReference<>();
        doAnswer(invocation -> {
            options.set(invocation.getArgument(0));
            return List.of("free-model-a");
        }).when(chatClient).listModels(any(OpenAiCompatibleChatClient.ChatOptions.class));
        service = new AiProviderSettingsService(
                new AiProviderSettingsRepository(jdbcTemplate),
                chatClient
        );

        AiProviderModelsResponse response = service.listModels(new AiProviderModelsRequest(
                "custom-openai-compatible",
                "https://provider.example/v1",
                "",
                key.id()
        ));

        assertThat(response.models()).containsExactly("free-model-a");
        assertThat(options.get().apiKey()).isEqualTo("sk-selected-model-key");
    }

    @Test
    void deleteApiKey_removesStoredKeyAndClearsDefaultSettingsWhenSelected() {
        AiProviderKey key = service.saveApiKey(new AiProviderKeySaveRequest(
                "deepseek",
                "https://api.deepseek.com",
                "RankPeek primary",
                "sk-selected-secret"
        ));
        service.saveSettings(new AiProviderSettingsSaveRequest(
                true,
                "deepseek",
                "https://api.deepseek.com",
                "deepseek-v4-flash",
                "",
                key.id(),
                false,
                false,
                false,
                null
        ));

        service.deleteApiKey(key.id());

        assertThat(service.listApiKeys("deepseek", "https://api.deepseek.com")).isEmpty();
        AiProviderSettings settings = service.getSettings();
        assertThat(settings.apiKeyId()).isNull();
        assertThat(settings.apiKeySaved()).isFalse();
        assertThat(settings.apiKeyMasked()).isNull();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT api_key_encrypted FROM ai_provider_settings WHERE id = 'default'",
                String.class
        )).isNull();
    }

    @Test
    void deleteApiKey_keepsDefaultSettingsWhenDeletingUnselectedKey() {
        AiProviderKey selected = service.saveApiKey(new AiProviderKeySaveRequest(
                "deepseek",
                "https://api.deepseek.com",
                "Selected",
                "sk-selected-secret"
        ));
        AiProviderKey unused = service.saveApiKey(new AiProviderKeySaveRequest(
                "deepseek",
                "https://api.deepseek.com",
                "Unused",
                "sk-unused-secret"
        ));
        service.saveSettings(new AiProviderSettingsSaveRequest(
                true,
                "deepseek",
                "https://api.deepseek.com",
                "deepseek-v4-flash",
                "",
                selected.id(),
                false,
                false,
                false,
                null
        ));

        service.deleteApiKey(unused.id());

        assertThat(service.listApiKeys("deepseek", "https://api.deepseek.com"))
                .extracting(AiProviderKey::id)
                .containsExactly(selected.id());
        AiProviderSettings settings = service.getSettings();
        assertThat(settings.apiKeyId()).isEqualTo(selected.id());
        assertThat(settings.apiKeySaved()).isTrue();
        assertThat(settings.apiKeyMasked()).isEqualTo("sk-****cret");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT api_key_encrypted FROM ai_provider_settings WHERE id = 'default'",
                String.class
        )).isEqualTo("sk-selected-secret");
    }
}
