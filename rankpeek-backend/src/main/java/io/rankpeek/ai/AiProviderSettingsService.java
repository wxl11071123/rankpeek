package io.rankpeek.ai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class AiProviderSettingsService {

    private static final String DEFAULT_PROVIDER_ID = "deepseek";
    private static final String DEFAULT_BASE_URL = "https://api.deepseek.com";
    private static final String DEFAULT_MODEL = "deepseek-v4-flash";
    private static final String DEEPSEEK_API_KEY_URL = "https://platform.deepseek.com/api_keys";
    private static final String QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
    private static final String QWEN_API_KEY_URL = "https://bailian.console.aliyun.com/?apiKey=1#/api-key";
    private static final String MIMO_BASE_URL = "https://api.xiaomimimo.com/v1";
    private static final String MIMO_API_KEY_URL = "https://platform.xiaomimimo.com/#/console/api-keys";
    private static final String MINIMAX_BASE_URL = "https://api.minimaxi.com/v1";
    private static final String MINIMAX_API_KEY_URL = "https://platform.minimaxi.com/user-center/basic-information/interface-key";
    private static final String GLM_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
    private static final String GLM_API_KEY_URL = "https://bigmodel.cn/usercenter/proj-mgmt/apikeys";
    private static final String CONFIGURATION_REQUIRED_MESSAGE = "Please configure AI provider and API key first.";

    private final AiProviderSettingsRepository repository;
    private final ObjectMapper objectMapper;
    private final OpenAiCompatibleChatClient chatClient;

    @Autowired
    public AiProviderSettingsService(
            AiProviderSettingsRepository repository,
            OpenAiCompatibleChatClient chatClient
    ) {
        this(repository, new ObjectMapper(), chatClient);
    }

    AiProviderSettingsService(AiProviderSettingsRepository repository) {
        this(repository, new ObjectMapper(), null);
    }

    AiProviderSettingsService(AiProviderSettingsRepository repository, ObjectMapper objectMapper) {
        this(repository, objectMapper, null);
    }

    AiProviderSettingsService(
            AiProviderSettingsRepository repository,
            ObjectMapper objectMapper,
            OpenAiCompatibleChatClient chatClient
    ) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.chatClient = chatClient;
    }

    public static List<AiProviderProfile> defaultProviderProfiles() {
        return List.of(
                new AiProviderProfile(
                        "deepseek",
                        "DeepSeek",
                        "openai-compatible",
                        DEFAULT_BASE_URL,
                        List.of(),
                        DEEPSEEK_API_KEY_URL,
                        false,
                        true
                ),
                new AiProviderProfile(
                        "qwen",
                        "Qwen / 通义千问",
                        "openai-compatible",
                        QWEN_BASE_URL,
                        List.of(),
                        QWEN_API_KEY_URL,
                        true,
                        true
                ),
                new AiProviderProfile(
                        "mimo",
                        "MiMo / 小米",
                        "openai-compatible",
                        MIMO_BASE_URL,
                        List.of(),
                        MIMO_API_KEY_URL,
                        false,
                        true
                ),
                new AiProviderProfile(
                        "minimax",
                        "MiniMax",
                        "openai-compatible",
                        MINIMAX_BASE_URL,
                        List.of(),
                        MINIMAX_API_KEY_URL,
                        false,
                        true
                ),
                new AiProviderProfile(
                        "glm",
                        "GLM / 智谱",
                        "openai-compatible",
                        GLM_BASE_URL,
                        List.of(),
                        GLM_API_KEY_URL,
                        true,
                        true
                ),
                new AiProviderProfile(
                        "custom-openai-compatible",
                        "自定义厂商（OpenAI Key 兼容）",
                        "openai-compatible",
                        "",
                        List.of(),
                        null,
                        true,
                        true
                )
        );
    }

    public List<AiProviderProfile> listProviderProfiles() {
        return defaultProviderProfiles();
    }

    public List<AiProviderKey> listApiKeys(String providerId, String baseUrl) {
        String normalizedProviderId = normalizeProviderId(providerId);
        String normalizedBaseUrl = normalizeBaseUrlForTest(baseUrl, normalizedProviderId);
        return repository.listApiKeys(normalizedProviderId, normalizedBaseUrl).stream()
                .map(this::toPublicKey)
                .toList();
    }

    public AiProviderKey saveApiKey(AiProviderKeySaveRequest request) {
        String providerId = normalizeProviderId(request == null ? null : request.providerId());
        String baseUrl = normalizeBaseUrl(
                request == null ? null : request.baseUrl(),
                providerId,
                true
        );
        String rawKey = trimToEmpty(request == null ? null : request.apiKey());
        if (rawKey.isBlank()) {
            throw new IllegalArgumentException("apiKey is required");
        }

        String maskedKey = maskApiKey(rawKey);
        String name = trimToEmpty(request == null ? null : request.name());
        if (name.isBlank()) {
            name = providerLabelFor(providerId) + "-" + maskedKey;
        }
        long now = System.currentTimeMillis();
        StoredAiProviderKey stored = new StoredAiProviderKey(
                UUID.randomUUID().toString(),
                providerId,
                baseUrl,
                name,
                rawKey,
                maskedKey,
                now,
                now
        );
        repository.saveApiKey(stored);
        return toPublicKey(stored);
    }

    @Transactional
    public void deleteApiKey(String apiKeyId) {
        String normalizedApiKeyId = trimToEmpty(apiKeyId);
        if (normalizedApiKeyId.isBlank()) {
            throw new IllegalArgumentException("apiKeyId is required");
        }
        repository.deleteApiKeyById(normalizedApiKeyId);
        repository.clearDefaultApiKeyIfSelected(normalizedApiKeyId, System.currentTimeMillis());
    }

    public AiProviderSettings getSettings() {
        return repository.findDefault()
                .map(this::toPublicSettings)
                .orElseGet(this::defaultSettings);
    }

    StoredAiProviderSettings requireRunnableSettings() {
        StoredAiProviderSettings settings = repository.findDefault()
                .orElseThrow(() -> new LocalAiConfigurationException("Please configure AI provider and API key first."));
        if (!settings.enabled()
                || isBlank(settings.providerId())
                || isBlank(settings.baseUrl())
                || isBlank(settings.model())
                || isBlank(settings.apiKeyEncrypted())) {
            throw new LocalAiConfigurationException("Please configure AI provider and API key first.");
        }
        return settings;
    }

    public AiProviderSettings saveSettings(AiProviderSettingsSaveRequest request) {
        StoredAiProviderSettings existing = repository.findDefault().orElse(null);
        String providerId = normalizeProviderId(request.providerId());
        String baseUrl = normalizeBaseUrl(request.baseUrl(), providerId, request.enabled());
        String model = normalizeModel(request.model(), request.enabled());
        ApiKeyStorage apiKeyStorage = resolveApiKeyStorage(request, existing, providerId, baseUrl);
        AiProviderPricing pricing = normalizePricing(request.pricing());
        StoredAiProviderSettings stored = new StoredAiProviderSettings(
                request.enabled(),
                providerId,
                baseUrl,
                model,
                apiKeyStorage.rawKey(),
                apiKeyStorage.maskedKey(),
                apiKeyStorage.keyId(),
                request.webSearchEnabled(),
                request.deepThinkingEnabled(),
                writePricing(pricing),
                System.currentTimeMillis()
        );
        repository.saveDefault(stored);
        return toPublicSettings(stored);
    }

    public AiProviderTestResponse testProvider(AiProviderTestRequest request) {
        AiProviderTestConfiguration configuration = resolveTestConfiguration(request);
        if (!configuration.configured()) {
            return new AiProviderTestResponse(
                    false,
                    configuration.providerId(),
                    configuration.model(),
                    CONFIGURATION_REQUIRED_MESSAGE
            );
        }

        try {
            effectiveChatClient().streamJsonChat(
                    new OpenAiCompatibleChatClient.ChatOptions(
                            configuration.providerId(),
                            configuration.baseUrl(),
                            configuration.model(),
                            configuration.apiKey(),
                            Duration.ofSeconds(5),
                            Duration.ofSeconds(15),
                            false,
                            false,
                            true
                    ),
                    List.of(
                            new OpenAiChatMessage(
                                    "system",
                                    "You are RankPeek's AI provider connection tester. Reply only with a JSON object."
                            ),
                            new OpenAiChatMessage("user", "Return {\"ok\":true}.")
                    ),
                    ignored -> {
                    },
                    ignored -> {
                    }
            );
            return new AiProviderTestResponse(
                    true,
                    configuration.providerId(),
                    configuration.model(),
                    "AI provider connection succeeded."
            );
        } catch (AiProviderException | IllegalArgumentException exception) {
            return new AiProviderTestResponse(
                    false,
                    configuration.providerId(),
                    configuration.model(),
                    exception.getMessage()
            );
        }
    }

    public AiProviderModelsResponse listModels(AiProviderModelsRequest request) {
        AiProviderModelListConfiguration configuration = resolveModelListConfiguration(request);
        if (!configuration.configured()) {
            throw new IllegalArgumentException(CONFIGURATION_REQUIRED_MESSAGE);
        }

        try {
            List<String> models = effectiveChatClient().listModels(
                    new OpenAiCompatibleChatClient.ChatOptions(
                            configuration.providerId(),
                            configuration.baseUrl(),
                            "models",
                            configuration.apiKey(),
                            Duration.ofSeconds(5),
                            Duration.ofSeconds(15),
                            false,
                            false,
                            false
                    )
            );
            return new AiProviderModelsResponse(models);
        } catch (AiProviderException | IllegalArgumentException exception) {
            throw new IllegalArgumentException("Unable to refresh AI provider models: " + exception.getMessage(), exception);
        }
    }

    private AiProviderTestConfiguration resolveTestConfiguration(AiProviderTestRequest request) {
        StoredAiProviderSettings existing = repository.findDefault().orElse(null);
        String providerId = normalizeProviderId(firstNonBlank(
                request == null ? null : request.providerId(),
                existing == null ? null : existing.providerId(),
                DEFAULT_PROVIDER_ID
        ));
        String baseUrl = normalizeBaseUrlForTest(firstNonBlank(
                request == null ? null : request.baseUrl(),
                existing == null ? null : existing.baseUrl(),
                defaultBaseUrlForProvider(providerId)
        ), providerId);
        String model = blankToDefault(firstNonBlank(
                request == null ? null : request.model(),
                existing == null ? null : existing.model(),
                DEFAULT_MODEL
        ), DEFAULT_MODEL);
        String apiKey = resolveEffectiveApiKey(
                request == null ? null : request.apiKey(),
                request == null ? null : request.apiKeyId(),
                existing,
                providerId,
                baseUrl
        );
        return new AiProviderTestConfiguration(
                providerId,
                baseUrl,
                model,
                apiKey,
                !baseUrl.isBlank() && !model.isBlank() && !apiKey.isBlank()
        );
    }

    private AiProviderModelListConfiguration resolveModelListConfiguration(AiProviderModelsRequest request) {
        StoredAiProviderSettings existing = repository.findDefault().orElse(null);
        String providerId = normalizeProviderId(firstNonBlank(
                request == null ? null : request.providerId(),
                existing == null ? null : existing.providerId(),
                DEFAULT_PROVIDER_ID
        ));
        String baseUrl = normalizeBaseUrlForTest(firstNonBlank(
                request == null ? null : request.baseUrl(),
                existing == null ? null : existing.baseUrl(),
                defaultBaseUrlForProvider(providerId)
        ), providerId);
        String apiKey = resolveEffectiveApiKey(
                request == null ? null : request.apiKey(),
                request == null ? null : request.apiKeyId(),
                existing,
                providerId,
                baseUrl
        );
        return new AiProviderModelListConfiguration(
                providerId,
                baseUrl,
                apiKey,
                !baseUrl.isBlank() && !apiKey.isBlank()
        );
    }

    private OpenAiCompatibleChatClient effectiveChatClient() {
        return chatClient == null ? new OpenAiCompatibleChatClient(objectMapper) : chatClient;
    }

    private AiProviderSettings defaultSettings() {
        return new AiProviderSettings(
                false,
                DEFAULT_PROVIDER_ID,
                DEFAULT_BASE_URL,
                DEFAULT_MODEL,
                null,
                false,
                null,
                false,
                false,
                null
        );
    }

    private AiProviderSettings toPublicSettings(StoredAiProviderSettings settings) {
        return new AiProviderSettings(
                settings.enabled(),
                blankToDefault(settings.providerId(), DEFAULT_PROVIDER_ID),
                blankToDefault(settings.baseUrl(), DEFAULT_BASE_URL),
                blankToDefault(settings.model(), DEFAULT_MODEL),
                settings.selectedApiKeyId(),
                !isBlank(settings.apiKeyEncrypted()),
                isBlank(settings.apiKeyEncrypted()) ? null : settings.apiKeyMasked(),
                settings.webSearchEnabled(),
                settings.deepThinkingEnabled(),
                readPricing(settings.pricingRawJson())
        );
    }

    private String normalizeProviderId(String providerId) {
        return blankToDefault(providerId, DEFAULT_PROVIDER_ID).toLowerCase(Locale.ROOT);
    }

    private String normalizeBaseUrl(String baseUrl, String providerId, boolean enabled) {
        String normalized = blankToDefault(baseUrl, defaultBaseUrlForProvider(providerId));
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        if (enabled && normalized.isBlank()) {
            throw new IllegalArgumentException("baseUrl is required when AI is enabled");
        }
        return normalized;
    }

    private String normalizeBaseUrlForTest(String baseUrl, String providerId) {
        String normalized = blankToDefault(baseUrl, defaultBaseUrlForProvider(providerId));
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    private String normalizeModel(String model, boolean enabled) {
        String normalized = enabled ? trimToEmpty(model) : blankToDefault(model, DEFAULT_MODEL);
        if (enabled && normalized.isBlank()) {
            throw new IllegalArgumentException("model is required when AI is enabled");
        }
        return blankToDefault(normalized, DEFAULT_MODEL);
    }

    private ApiKeyStorage resolveApiKeyStorage(
            AiProviderSettingsSaveRequest request,
            StoredAiProviderSettings existing,
            String providerId,
            String baseUrl) {
        String requestKey = trimToEmpty(request.apiKey());
        if (!requestKey.isBlank()) {
            return new ApiKeyStorage(requestKey, maskApiKey(requestKey), null);
        }
        String requestKeyId = trimToEmpty(request.apiKeyId());
        if (!requestKeyId.isBlank()) {
            StoredAiProviderKey key = requireStoredApiKey(requestKeyId, providerId, baseUrl);
            return new ApiKeyStorage(key.apiKeyEncrypted(), key.apiKeyMasked(), key.id());
        }
        if (request.saveApiKey() && existing != null && !isBlank(existing.apiKeyEncrypted())) {
            return new ApiKeyStorage(existing.apiKeyEncrypted(), existing.apiKeyMasked(), existing.selectedApiKeyId());
        }
        if (existing != null && !isBlank(existing.apiKeyEncrypted())) {
            return new ApiKeyStorage(existing.apiKeyEncrypted(), existing.apiKeyMasked(), existing.selectedApiKeyId());
        }
        return new ApiKeyStorage(null, null, null);
    }

    private String resolveStoredApiKey(String apiKeyId, String providerId, String baseUrl) {
        String normalizedKeyId = trimToEmpty(apiKeyId);
        if (normalizedKeyId.isBlank()) {
            return "";
        }
        return requireStoredApiKey(normalizedKeyId, providerId, baseUrl).apiKeyEncrypted();
    }

    private String resolveEffectiveApiKey(
            String requestKey,
            String requestKeyId,
            StoredAiProviderSettings existing,
            String providerId,
            String baseUrl) {
        String rawKey = trimToEmpty(requestKey);
        if (!rawKey.isBlank()) {
            return rawKey;
        }
        String storedKey = resolveStoredApiKey(requestKeyId, providerId, baseUrl);
        if (!storedKey.isBlank()) {
            return storedKey;
        }
        return trimToEmpty(existing == null ? null : existing.apiKeyEncrypted());
    }

    private StoredAiProviderKey requireStoredApiKey(String apiKeyId, String providerId, String baseUrl) {
        StoredAiProviderKey key = repository.findApiKeyById(apiKeyId)
                .orElseThrow(() -> new IllegalArgumentException("apiKeyId is not found"));
        if (!key.providerId().equals(providerId) || !key.baseUrl().equals(baseUrl)) {
            throw new IllegalArgumentException("apiKeyId does not match provider and baseUrl");
        }
        return key;
    }

    private String maskApiKey(String apiKey) {
        if (apiKey == null || apiKey.isBlank()) {
            return null;
        }
        String trimmed = apiKey.trim();
        if (trimmed.length() <= 8) {
            return "****";
        }
        return trimmed.substring(0, 3) + "****" + trimmed.substring(trimmed.length() - 4);
    }

    private AiProviderPricing normalizePricing(AiProviderPricing pricing) {
        if (pricing == null) {
            return null;
        }
        BigDecimal inputCacheHit = positiveOrNull(pricing.inputCacheHitCnyPerMillionTokens());
        BigDecimal inputCacheMiss = positiveOrNull(pricing.inputCacheMissCnyPerMillionTokens());
        BigDecimal output = positiveOrNull(pricing.outputCnyPerMillionTokens());
        if (inputCacheHit == null && inputCacheMiss == null && output == null) {
            return null;
        }
        return new AiProviderPricing(
                blankToDefault(pricing.currency(), "CNY"),
                inputCacheHit,
                inputCacheMiss,
                output
        );
    }

    private BigDecimal positiveOrNull(BigDecimal value) {
        if (value == null || value.compareTo(BigDecimal.ZERO) < 0) {
            return null;
        }
        return value;
    }

    private String writePricing(AiProviderPricing pricing) {
        if (pricing == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(pricing);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("pricing is not serializable", exception);
        }
    }

    private AiProviderPricing readPricing(String rawJson) {
        if (isBlank(rawJson)) {
            return null;
        }
        try {
            return normalizePricing(objectMapper.readValue(rawJson, AiProviderPricing.class));
        } catch (JsonProcessingException exception) {
            return null;
        }
    }

    private String defaultBaseUrlForProvider(String providerId) {
        return defaultProviderProfiles().stream()
                .filter(profile -> profile.id().equals(providerId))
                .map(AiProviderProfile::defaultBaseUrl)
                .findFirst()
                .orElse("");
    }

    private String providerLabelFor(String providerId) {
        return defaultProviderProfiles().stream()
                .filter(profile -> profile.id().equals(providerId))
                .map(AiProviderProfile::label)
                .findFirst()
                .orElse(providerId);
    }

    private AiProviderKey toPublicKey(StoredAiProviderKey key) {
        return new AiProviderKey(
                key.id(),
                key.providerId(),
                key.baseUrl(),
                key.name(),
                key.apiKeyMasked(),
                key.createdAt(),
                key.updatedAt()
        );
    }

    private String blankToDefault(String value, String defaultValue) {
        return isBlank(value) ? defaultValue : value.trim();
    }

    private String trimToEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (!isBlank(value)) {
                return value.trim();
            }
        }
        return "";
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private record ApiKeyStorage(String rawKey, String maskedKey, String keyId) {
    }

    private record AiProviderTestConfiguration(
            String providerId,
            String baseUrl,
            String model,
            String apiKey,
            boolean configured
    ) {
    }

    private record AiProviderModelListConfiguration(
            String providerId,
            String baseUrl,
            String apiKey,
            boolean configured
    ) {
    }
}
