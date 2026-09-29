package io.rankpeek.ai;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;

@Repository
public class AiProviderSettingsRepository {

    private static final String DEFAULT_SETTINGS_ID = "default";

    private final JdbcTemplate jdbcTemplate;

    public AiProviderSettingsRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<StoredAiProviderSettings> findDefault() {
        return jdbcTemplate.query("""
                SELECT enabled,
                       provider_id,
                       base_url,
                       model,
                       api_key_encrypted,
                       api_key_masked,
                       selected_api_key_id,
                       web_search_enabled,
                       deep_thinking_enabled,
                       pricing_raw_json,
                       updated_at
                FROM ai_provider_settings
                WHERE id = ?
                """, this::mapSettings, DEFAULT_SETTINGS_ID).stream().findFirst();
    }

    public void saveDefault(StoredAiProviderSettings settings) {
        jdbcTemplate.update("""
                MERGE INTO ai_provider_settings (
                    id,
                    enabled,
                    provider_id,
                    base_url,
                    model,
                    api_key_encrypted,
                    api_key_masked,
                    selected_api_key_id,
                    web_search_enabled,
                    deep_thinking_enabled,
                    pricing_raw_json,
                    updated_at
                ) KEY(id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                DEFAULT_SETTINGS_ID,
                settings.enabled(),
                settings.providerId(),
                settings.baseUrl(),
                settings.model(),
                settings.apiKeyEncrypted(),
                settings.apiKeyMasked(),
                settings.selectedApiKeyId(),
                settings.webSearchEnabled(),
                settings.deepThinkingEnabled(),
                settings.pricingRawJson(),
                settings.updatedAt());
    }

    public List<StoredAiProviderKey> listApiKeys(String providerId, String baseUrl) {
        return jdbcTemplate.query("""
                SELECT id,
                       provider_id,
                       base_url,
                       name,
                       api_key_encrypted,
                       api_key_masked,
                       created_at,
                       updated_at
                FROM ai_provider_keys
                WHERE provider_id = ?
                  AND base_url = ?
                ORDER BY created_at ASC, id ASC
                """, this::mapApiKey, providerId, baseUrl);
    }

    public Optional<StoredAiProviderKey> findApiKeyById(String id) {
        return jdbcTemplate.query("""
                SELECT id,
                       provider_id,
                       base_url,
                       name,
                       api_key_encrypted,
                       api_key_masked,
                       created_at,
                       updated_at
                FROM ai_provider_keys
                WHERE id = ?
                """, this::mapApiKey, id).stream().findFirst();
    }

    public void saveApiKey(StoredAiProviderKey key) {
        jdbcTemplate.update("""
                INSERT INTO ai_provider_keys (
                    id,
                    provider_id,
                    base_url,
                    name,
                    api_key_encrypted,
                    api_key_masked,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                key.id(),
                key.providerId(),
                key.baseUrl(),
                key.name(),
                key.apiKeyEncrypted(),
                key.apiKeyMasked(),
                key.createdAt(),
                key.updatedAt());
    }

    public void deleteApiKeyById(String id) {
        jdbcTemplate.update("DELETE FROM ai_provider_keys WHERE id = ?", id);
    }

    public void clearDefaultApiKeyIfSelected(String selectedApiKeyId, long updatedAt) {
        jdbcTemplate.update("""
                UPDATE ai_provider_settings
                SET api_key_encrypted = NULL,
                    api_key_masked = NULL,
                    selected_api_key_id = NULL,
                    updated_at = ?
                WHERE id = ?
                  AND selected_api_key_id = ?
                """, updatedAt, DEFAULT_SETTINGS_ID, selectedApiKeyId);
    }

    private StoredAiProviderSettings mapSettings(ResultSet rs, int rowNum) throws SQLException {
        return new StoredAiProviderSettings(
                rs.getBoolean("enabled"),
                rs.getString("provider_id"),
                rs.getString("base_url"),
                rs.getString("model"),
                rs.getString("api_key_encrypted"),
                rs.getString("api_key_masked"),
                rs.getString("selected_api_key_id"),
                rs.getBoolean("web_search_enabled"),
                rs.getBoolean("deep_thinking_enabled"),
                rs.getString("pricing_raw_json"),
                rs.getLong("updated_at")
        );
    }

    private StoredAiProviderKey mapApiKey(ResultSet rs, int rowNum) throws SQLException {
        return new StoredAiProviderKey(
                rs.getString("id"),
                rs.getString("provider_id"),
                rs.getString("base_url"),
                rs.getString("name"),
                rs.getString("api_key_encrypted"),
                rs.getString("api_key_masked"),
                rs.getLong("created_at"),
                rs.getLong("updated_at")
        );
    }
}
