package io.rankpeek.cache;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class LocalCacheSchemaInitializer {

    private final JdbcTemplate jdbcTemplate;
    private final LocalCacheRecoveryCoordinator recoveryCoordinator;

    @Autowired
    public LocalCacheSchemaInitializer(JdbcTemplate jdbcTemplate, LocalCacheRecoveryCoordinator recoveryCoordinator) {
        this.jdbcTemplate = jdbcTemplate;
        this.recoveryCoordinator = recoveryCoordinator;
    }

    public LocalCacheSchemaInitializer(JdbcTemplate jdbcTemplate, LocalCacheRecoveryService recoveryService) {
        this(jdbcTemplate, recoveryService == null
                ? null
                : new LocalCacheRecoveryCoordinator(recoveryService, java.time.Clock.systemDefaultZone()));
    }

    public LocalCacheSchemaInitializer(JdbcTemplate jdbcTemplate) {
        this(jdbcTemplate, (LocalCacheRecoveryCoordinator) null);
    }

    @PostConstruct
    public void initializeSchema() {
        initializeSchemaIfPossible();
    }

    public boolean initializeSchemaIfPossible() {
        try {
            runSchemaInitialization();
            log.info("Local cache schema is ready");
            return true;
        } catch (Exception e) {
            return recoverAndRetry(e);
        }
    }

    private boolean recoverAndRetry(Exception initializationError) {
        if (recoveryCoordinator == null || !recoveryCoordinator.isRecoverableCorruption(initializationError)) {
            log.warn("Failed to initialize local cache schema; persistent cache will be skipped when unavailable: rootCause={}",
                    rootCauseSummary(initializationError),
                    initializationError);
            return false;
        }

        log.warn("Detected local H2 cache corruption during schema initialization: rootCause={}",
                recoveryCoordinator.rootCauseSummary(initializationError),
                initializationError);
        LocalCacheRecoveryCoordinator.CoordinatedRecoveryResult recoveryResult =
                recoveryCoordinator.recoverIfCorrupt(initializationError, "schema.initialize", false);
        if (!recoveryResult.recovered()) {
            log.warn("Detected local H2 cache corruption, but recovery failed; persistent cache will be disabled: {}",
                    recoveryResult.message(),
                    recoveryFailure(recoveryResult, initializationError));
            return false;
        }

        try {
            runSchemaInitialization();
            log.info("Local cache schema is ready after quarantining corrupt H2 cache files");
            return true;
        } catch (Exception retryError) {
            log.warn("Failed to initialize local cache schema after H2 cache recovery; persistent cache will be disabled: rootCause={}",
                    rootCauseSummary(retryError),
                    retryError);
            return false;
        }
    }

    private String rootCauseSummary(Throwable error) {
        if (recoveryCoordinator != null) {
            return recoveryCoordinator.rootCauseSummary(error);
        }
        Throwable current = error;
        while (current.getCause() != null) {
            current = current.getCause();
        }
        String message = current.getMessage();
        if (message == null || message.isBlank()) {
            message = error.getMessage();
        }
        return current.getClass().getSimpleName() + ": " + message;
    }

    private Throwable recoveryFailure(
            LocalCacheRecoveryCoordinator.CoordinatedRecoveryResult recoveryResult,
            Throwable fallback) {
        if (recoveryResult.recoveryResult() == null || recoveryResult.recoveryResult().failure() == null) {
            return fallback;
        }
        return recoveryResult.recoveryResult().failure();
    }

    private void runSchemaInitialization() {
        createTables();
        migrateTables();
        createIndexes();
    }

    private void createTables() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS summoner_cache (
                    puuid VARCHAR(128) PRIMARY KEY,
                    game_name VARCHAR(255),
                    tag_line VARCHAR(64),
                    summoner_name VARCHAR(255),
                    profile_icon_id INT,
                    summoner_level INT,
                    platform_id VARCHAR(64),
                    raw_json CLOB,
                    updated_at BIGINT
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS rank_cache (
                    puuid VARCHAR(128) PRIMARY KEY,
                    raw_json CLOB,
                    updated_at BIGINT
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS match_cache (
                    game_id BIGINT PRIMARY KEY,
                    queue_id INT,
                    queue_name VARCHAR(255),
                    game_mode VARCHAR(64),
                    game_type VARCHAR(64),
                    map_id INT,
                    game_creation BIGINT,
                    game_duration INT,
                    platform_id VARCHAR(64),
                    raw_json CLOB,
                    updated_at BIGINT
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS game_detail_cache (
                    game_id BIGINT PRIMARY KEY,
                    raw_json CLOB,
                    updated_at BIGINT
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS match_data_scope_cache (
                    game_id BIGINT PRIMARY KEY,
                    source VARCHAR(32),
                    summary_raw_json CLOB,
                    detail_raw_json CLOB,
                    timeline_raw_json CLOB,
                    timeline_json CLOB,
                    summary_status VARCHAR(64),
                    detail_status VARCHAR(64),
                    timeline_status VARCHAR(64),
                    fetched_at BIGINT,
                    schema_version INT DEFAULT 1,
                    last_error VARCHAR(2000),
                    updated_at BIGINT
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS match_participant_cache (
                    game_id BIGINT,
                    puuid VARCHAR(128),
                    participant_id INT,
                    team_id INT,
                    champion_id INT,
                    spell1_id INT,
                    spell2_id INT,
                    win BOOLEAN,
                    kills INT,
                    deaths INT,
                    assists INT,
                    gold_earned INT,
                    total_damage_dealt_to_champions INT,
                    total_damage_taken INT,
                    total_minions_killed INT,
                    neutral_minions_killed INT,
                    game_name VARCHAR(255),
                    tag_line VARCHAR(64),
                    summoner_name VARCHAR(255),
                    raw_json CLOB,
                    updated_at BIGINT,
                    PRIMARY KEY(game_id, puuid)
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS player_match_index (
                    puuid VARCHAR(128),
                    game_id BIGINT,
                    game_creation BIGINT,
                    queue_id INT,
                    champion_id INT,
                    win BOOLEAN,
                    updated_at BIGINT,
                    PRIMARY KEY(puuid, game_id)
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS player_fetch_state (
                    puuid VARCHAR(128) PRIMARY KEY,
                    latest_game_id BIGINT,
                    latest_game_creation BIGINT,
                    match_updated_at BIGINT,
                    rank_updated_at BIGINT,
                    summoner_updated_at BIGINT,
                    last_error VARCHAR(2000),
                    status VARCHAR(64),
                    updated_at BIGINT
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS ai_provider_settings (
                    id VARCHAR(64) PRIMARY KEY,
                    enabled BOOLEAN,
                    provider_id VARCHAR(128),
                    base_url VARCHAR(1000),
                    model VARCHAR(255),
                    api_key_encrypted CLOB,
                    api_key_masked VARCHAR(128),
                    selected_api_key_id VARCHAR(64),
                    web_search_enabled BOOLEAN,
                    deep_thinking_enabled BOOLEAN,
                    pricing_raw_json CLOB,
                    updated_at BIGINT
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS ai_provider_keys (
                    id VARCHAR(64) PRIMARY KEY,
                    provider_id VARCHAR(128),
                    base_url VARCHAR(1000),
                    name VARCHAR(255),
                    api_key_encrypted CLOB,
                    api_key_masked VARCHAR(128),
                    created_at BIGINT,
                    updated_at BIGINT
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS ai_analysis_runs (
                    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                    endpoint VARCHAR(64),
                    provider VARCHAR(128),
                    model VARCHAR(255),
                    status VARCHAR(32),
                    request_hash VARCHAR(128),
                    request_raw_json CLOB,
                    response_raw_json CLOB,
                    error_code VARCHAR(128),
                    error_message VARCHAR(2000),
                    prompt_tokens BIGINT DEFAULT 0,
                    prompt_cache_hit_tokens BIGINT DEFAULT 0,
                    prompt_cache_miss_tokens BIGINT DEFAULT 0,
                    completion_tokens BIGINT DEFAULT 0,
                    total_tokens BIGINT DEFAULT 0,
                    input_cache_hit_cny DECIMAL(18,12) DEFAULT 0,
                    input_cache_miss_cny DECIMAL(18,12) DEFAULT 0,
                    output_cny DECIMAL(18,12) DEFAULT 0,
                    total_cny DECIMAL(18,12) DEFAULT 0,
                    created_at BIGINT,
                    updated_at BIGINT
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS cost_events (
                    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                    event_type VARCHAR(64),
                    provider VARCHAR(128),
                    model VARCHAR(255),
                    source VARCHAR(128),
                    amount_cny DECIMAL(18,12),
                    currency VARCHAR(16),
                    quantity BIGINT,
                    metadata_raw_json CLOB,
                    created_at BIGINT
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS cost_rollups (
                    id INT PRIMARY KEY,
                    current_month_key VARCHAR(7),
                    current_month_total_cny DECIMAL(18,12) DEFAULT 0,
                    last_month_key VARCHAR(7),
                    last_month_total_cny DECIMAL(18,12) DEFAULT 0,
                    today_key VARCHAR(10),
                    today_total_cny DECIMAL(18,12) DEFAULT 0,
                    coach_count BIGINT DEFAULT 0,
                    coach_total_cny DECIMAL(18,12) DEFAULT 0,
                    pregame_count BIGINT DEFAULT 0,
                    pregame_total_cny DECIMAL(18,12) DEFAULT 0,
                    postgame_count BIGINT DEFAULT 0,
                    postgame_total_cny DECIMAL(18,12) DEFAULT 0,
                    updated_at BIGINT
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS opgg_champion_list_cache (
                    cache_key VARCHAR(255) PRIMARY KEY,
                    mode VARCHAR(64),
                    region VARCHAR(64),
                    tier VARCHAR(128),
                    raw_json CLOB,
                    fetched_at BIGINT,
                    expires_at BIGINT
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS opgg_champion_detail_cache (
                    cache_key VARCHAR(255) PRIMARY KEY,
                    champion_id INT,
                    mode VARCHAR(64),
                    region VARCHAR(64),
                    tier VARCHAR(128),
                    position VARCHAR(64),
                    raw_json CLOB,
                    fetched_at BIGINT,
                    expires_at BIGINT
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS cn_champion_meta (
                    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                    source VARCHAR(128),
                    patch_key VARCHAR(64),
                    queue_id INT,
                    tier_scope VARCHAR(128),
                    champion_id INT,
                    role VARCHAR(64),
                    win_rate DECIMAL(18,8),
                    pick_rate DECIMAL(18,8),
                    ban_rate DECIMAL(18,8),
                    avg_kda DECIMAL(18,4),
                    avg_gold DECIMAL(18,4),
                    avg_damage DECIMAL(18,4),
                    avg_damage_taken DECIMAL(18,4),
                    avg_heal DECIMAL(18,4),
                    avg_duration_seconds INT,
                    avg_kills DECIMAL(18,4),
                    avg_assists DECIMAL(18,4),
                    avg_damage_share DECIMAL(18,8),
                    avg_damage_taken_share DECIMAL(18,8),
                    rank_index INT,
                    sample_note VARCHAR(2000),
                    data_source_note VARCHAR(2000),
                    updated_at BIGINT
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS cn_meta_sync_jobs (
                    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                    source VARCHAR(128),
                    patch_key VARCHAR(64),
                    queue_id INT,
                    tier_scope VARCHAR(128),
                    role VARCHAR(64),
                    status VARCHAR(64),
                    started_at BIGINT,
                    finished_at BIGINT,
                    error_message VARCHAR(4000),
                    request_count INT,
                    row_count INT,
                    content_hash VARCHAR(128),
                    updated_at BIGINT
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS patch_versions (
                    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                    patch_key VARCHAR(64),
                    ddragon_version VARCHAR(128),
                    game_version VARCHAR(128),
                    release_date VARCHAR(32),
                    source_status VARCHAR(64),
                    detected_at BIGINT,
                    published_at BIGINT,
                    checksum VARCHAR(255),
                    updated_at BIGINT
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS patch_changes (
                    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                    patch_version_id BIGINT,
                    patch_key VARCHAR(64),
                    target_type VARCHAR(64),
                    target_key VARCHAR(128),
                    target_name VARCHAR(255),
                    change_type VARCHAR(128),
                    field VARCHAR(128),
                    before_value VARCHAR(2000),
                    after_value VARCHAR(2000),
                    summary_zh VARCHAR(4000),
                    summary_en VARCHAR(4000),
                    confidence DECIMAL(18,8),
                    created_at BIGINT,
                    updated_at BIGINT
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS lpl_champion_usage (
                    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                    source VARCHAR(128),
                    patch_key VARCHAR(64),
                    champion_id INT,
                    role VARCHAR(64),
                    tournament VARCHAR(128),
                    split VARCHAR(128),
                    team VARCHAR(128),
                    player_name VARCHAR(255),
                    kills INT,
                    deaths INT,
                    assists INT,
                    updated_at BIGINT
                )
                """);

        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS playstyle_cards (
                    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                    patch_key VARCHAR(64),
                    champion_id INT,
                    role VARCHAR(64),
                    card_json CLOB,
                    updated_at BIGINT
                )
                """);
    }

    private void migrateTables() {
        addColumnIfMissing("match_data_scope_cache", "source VARCHAR(32)");
        addColumnIfMissing("match_data_scope_cache", "summary_raw_json CLOB");
        addColumnIfMissing("match_data_scope_cache", "detail_raw_json CLOB");
        addColumnIfMissing("match_data_scope_cache", "timeline_raw_json CLOB");
        addColumnIfMissing("match_data_scope_cache", "timeline_json CLOB");
        addColumnIfMissing("match_data_scope_cache", "summary_status VARCHAR(64)");
        addColumnIfMissing("match_data_scope_cache", "detail_status VARCHAR(64)");
        addColumnIfMissing("match_data_scope_cache", "timeline_status VARCHAR(64)");
        addColumnIfMissing("match_data_scope_cache", "fetched_at BIGINT");
        addColumnIfMissing("match_data_scope_cache", "schema_version INT DEFAULT 1");
        addColumnIfMissing("match_data_scope_cache", "last_error VARCHAR(2000)");
        addColumnIfMissing("match_data_scope_cache", "updated_at BIGINT");
        addColumnIfMissing("ai_provider_settings", "enabled BOOLEAN");
        addColumnIfMissing("ai_provider_settings", "provider_id VARCHAR(128)");
        addColumnIfMissing("ai_provider_settings", "base_url VARCHAR(1000)");
        addColumnIfMissing("ai_provider_settings", "model VARCHAR(255)");
        addColumnIfMissing("ai_provider_settings", "api_key_encrypted CLOB");
        addColumnIfMissing("ai_provider_settings", "api_key_masked VARCHAR(128)");
        addColumnIfMissing("ai_provider_settings", "selected_api_key_id VARCHAR(64)");
        addColumnIfMissing("ai_provider_settings", "web_search_enabled BOOLEAN");
        addColumnIfMissing("ai_provider_settings", "deep_thinking_enabled BOOLEAN");
        addColumnIfMissing("ai_provider_settings", "pricing_raw_json CLOB");
        addColumnIfMissing("ai_provider_settings", "updated_at BIGINT");
        addColumnIfMissing("ai_provider_keys", "provider_id VARCHAR(128)");
        addColumnIfMissing("ai_provider_keys", "base_url VARCHAR(1000)");
        addColumnIfMissing("ai_provider_keys", "name VARCHAR(255)");
        addColumnIfMissing("ai_provider_keys", "api_key_encrypted CLOB");
        addColumnIfMissing("ai_provider_keys", "api_key_masked VARCHAR(128)");
        addColumnIfMissing("ai_provider_keys", "created_at BIGINT");
        addColumnIfMissing("ai_provider_keys", "updated_at BIGINT");
        addColumnIfMissing("ai_analysis_runs", "endpoint VARCHAR(64)");
        addColumnIfMissing("ai_analysis_runs", "provider VARCHAR(128)");
        addColumnIfMissing("ai_analysis_runs", "model VARCHAR(255)");
        addColumnIfMissing("ai_analysis_runs", "status VARCHAR(32)");
        addColumnIfMissing("ai_analysis_runs", "request_hash VARCHAR(128)");
        addColumnIfMissing("ai_analysis_runs", "request_raw_json CLOB");
        addColumnIfMissing("ai_analysis_runs", "response_raw_json CLOB");
        addColumnIfMissing("ai_analysis_runs", "error_code VARCHAR(128)");
        addColumnIfMissing("ai_analysis_runs", "error_message VARCHAR(2000)");
        addColumnIfMissing("ai_analysis_runs", "prompt_tokens BIGINT DEFAULT 0");
        addColumnIfMissing("ai_analysis_runs", "prompt_cache_hit_tokens BIGINT DEFAULT 0");
        addColumnIfMissing("ai_analysis_runs", "prompt_cache_miss_tokens BIGINT DEFAULT 0");
        addColumnIfMissing("ai_analysis_runs", "completion_tokens BIGINT DEFAULT 0");
        addColumnIfMissing("ai_analysis_runs", "total_tokens BIGINT DEFAULT 0");
        addColumnIfMissing("ai_analysis_runs", "input_cache_hit_cny DECIMAL(18,12) DEFAULT 0");
        addColumnIfMissing("ai_analysis_runs", "input_cache_miss_cny DECIMAL(18,12) DEFAULT 0");
        addColumnIfMissing("ai_analysis_runs", "output_cny DECIMAL(18,12) DEFAULT 0");
        addColumnIfMissing("ai_analysis_runs", "total_cny DECIMAL(18,12) DEFAULT 0");
        addColumnIfMissing("ai_analysis_runs", "created_at BIGINT");
        addColumnIfMissing("ai_analysis_runs", "updated_at BIGINT");
        addColumnIfMissing("cost_events", "event_type VARCHAR(64)");
        addColumnIfMissing("cost_events", "provider VARCHAR(128)");
        addColumnIfMissing("cost_events", "model VARCHAR(255)");
        addColumnIfMissing("cost_events", "source VARCHAR(128)");
        addColumnIfMissing("cost_events", "amount_cny DECIMAL(18,12)");
        addColumnIfMissing("cost_events", "currency VARCHAR(16)");
        addColumnIfMissing("cost_events", "quantity BIGINT");
        addColumnIfMissing("cost_events", "metadata_raw_json CLOB");
        addColumnIfMissing("cost_events", "created_at BIGINT");
        addColumnIfMissing("cost_rollups", "current_month_key VARCHAR(7)");
        addColumnIfMissing("cost_rollups", "current_month_total_cny DECIMAL(18,12) DEFAULT 0");
        addColumnIfMissing("cost_rollups", "last_month_key VARCHAR(7)");
        addColumnIfMissing("cost_rollups", "last_month_total_cny DECIMAL(18,12) DEFAULT 0");
        addColumnIfMissing("cost_rollups", "today_key VARCHAR(10)");
        addColumnIfMissing("cost_rollups", "today_total_cny DECIMAL(18,12) DEFAULT 0");
        addColumnIfMissing("cost_rollups", "coach_count BIGINT DEFAULT 0");
        addColumnIfMissing("cost_rollups", "coach_total_cny DECIMAL(18,12) DEFAULT 0");
        addColumnIfMissing("cost_rollups", "pregame_count BIGINT DEFAULT 0");
        addColumnIfMissing("cost_rollups", "pregame_total_cny DECIMAL(18,12) DEFAULT 0");
        addColumnIfMissing("cost_rollups", "postgame_count BIGINT DEFAULT 0");
        addColumnIfMissing("cost_rollups", "postgame_total_cny DECIMAL(18,12) DEFAULT 0");
        addColumnIfMissing("cost_rollups", "updated_at BIGINT");
        addColumnIfMissing("opgg_champion_list_cache", "cache_key VARCHAR(255)");
        addColumnIfMissing("opgg_champion_list_cache", "mode VARCHAR(64)");
        addColumnIfMissing("opgg_champion_list_cache", "region VARCHAR(64)");
        addColumnIfMissing("opgg_champion_list_cache", "tier VARCHAR(128)");
        addColumnIfMissing("opgg_champion_list_cache", "raw_json CLOB");
        addColumnIfMissing("opgg_champion_list_cache", "fetched_at BIGINT");
        addColumnIfMissing("opgg_champion_list_cache", "expires_at BIGINT");
        addColumnIfMissing("opgg_champion_detail_cache", "cache_key VARCHAR(255)");
        addColumnIfMissing("opgg_champion_detail_cache", "champion_id INT");
        addColumnIfMissing("opgg_champion_detail_cache", "mode VARCHAR(64)");
        addColumnIfMissing("opgg_champion_detail_cache", "region VARCHAR(64)");
        addColumnIfMissing("opgg_champion_detail_cache", "tier VARCHAR(128)");
        addColumnIfMissing("opgg_champion_detail_cache", "position VARCHAR(64)");
        addColumnIfMissing("opgg_champion_detail_cache", "raw_json CLOB");
        addColumnIfMissing("opgg_champion_detail_cache", "fetched_at BIGINT");
        addColumnIfMissing("opgg_champion_detail_cache", "expires_at BIGINT");
        addColumnIfMissing("cn_champion_meta", "updated_at BIGINT");
        addColumnIfMissing("cn_meta_sync_jobs", "status VARCHAR(64)");
        addColumnIfMissing("cn_meta_sync_jobs", "started_at BIGINT");
        addColumnIfMissing("cn_meta_sync_jobs", "finished_at BIGINT");
        addColumnIfMissing("cn_meta_sync_jobs", "row_count INT");
        addColumnIfMissing("cn_meta_sync_jobs", "error_message VARCHAR(4000)");
        addColumnIfMissing("patch_versions", "updated_at BIGINT");
        addColumnIfMissing("patch_changes", "updated_at BIGINT");
        addColumnIfMissing("lpl_champion_usage", "updated_at BIGINT");
        addColumnIfMissing("playstyle_cards", "updated_at BIGINT");
    }

    private void addColumnIfMissing(String tableName, String columnDefinition) {
        jdbcTemplate.execute("ALTER TABLE " + tableName + " ADD COLUMN IF NOT EXISTS " + columnDefinition);
    }

    private void createIndexes() {
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_player_match_index_recent
                ON player_match_index(puuid, game_creation DESC)
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_player_match_index_filter
                ON player_match_index(puuid, queue_id, champion_id, game_creation DESC)
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_match_participant_cache_puuid
                ON match_participant_cache(puuid)
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_match_cache_creation
                ON match_cache(game_creation DESC)
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_match_data_scope_updated
                ON match_data_scope_cache(updated_at DESC)
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_ai_analysis_runs_recent
                ON ai_analysis_runs(created_at DESC)
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_ai_provider_keys_lookup
                ON ai_provider_keys(provider_id, base_url, created_at)
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_cost_events_recent
                ON cost_events(created_at DESC)
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_opgg_champion_list_lookup
                ON opgg_champion_list_cache(mode, region, tier, expires_at DESC)
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_opgg_champion_detail_lookup
                ON opgg_champion_detail_cache(champion_id, mode, region, tier, position, expires_at DESC)
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_cn_champion_meta_latest
                ON cn_champion_meta(champion_id, tier_scope, updated_at DESC)
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_cn_meta_sync_jobs_recent
                ON cn_meta_sync_jobs(started_at DESC, id DESC)
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_patch_versions_current
                ON patch_versions(published_at DESC, detected_at DESC)
                """);
        jdbcTemplate.execute("""
                CREATE INDEX IF NOT EXISTS idx_lpl_champion_usage_lookup
                ON lpl_champion_usage(patch_key, champion_id, role, updated_at DESC)
                """);
    }
}
