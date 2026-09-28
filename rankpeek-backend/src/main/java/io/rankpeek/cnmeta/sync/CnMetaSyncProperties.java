package io.rankpeek.cnmeta.sync;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;
import java.util.Map;

@ConfigurationProperties(prefix = "rankpeek.cn-meta.sync")
public record CnMetaSyncProperties(
        Boolean enabled,
        Boolean allowManual,
        String source,
        String cron,
        String zone,
        int requestDelayMs,
        int maxRetries,
        List<Integer> stopOnHttpStatus,
        int defaultQueueId,
        List<String> tiers,
        List<String> roles,
        Boolean realSourceEnabled,
        String realSourceBaseUrl,
        int realSourceSeasonId,
        int realSourceHeroId,
        int realSourcePosition,
        Map<String, String> realSourceTierValues,
        String userAgent,
        int connectTimeoutMs,
        int readTimeoutMs,
        int maxResponseBytes
) {
    public CnMetaSyncProperties {
        if (enabled == null) enabled = false;
        if (allowManual == null) allowManual = true;
        if (source == null || source.isBlank()) source = "mock";
        if (cron == null || cron.isBlank()) cron = "0 30 4 * * *";
        if (zone == null || zone.isBlank()) zone = "Asia/Shanghai";
        if (stopOnHttpStatus == null || stopOnHttpStatus.isEmpty()) stopOnHttpStatus = List.of(401, 403, 429);
        if (defaultQueueId <= 0) defaultQueueId = 420;
        if (tiers == null || tiers.isEmpty()) tiers = List.of("PLATINUM_PLUS");
        if (roles == null || roles.isEmpty()) roles = List.of("TOP", "JUNGLE", "MID", "ADC", "SUPPORT");
        if (realSourceEnabled == null) realSourceEnabled = false;
        if (realSourceBaseUrl == null) realSourceBaseUrl = "";
        if (realSourceSeasonId <= 0) realSourceSeasonId = 1;
        if (realSourceHeroId <= 0) realSourceHeroId = 1;
        if (realSourcePosition <= 0) realSourcePosition = 1;
        if (realSourceTierValues == null) realSourceTierValues = Map.of();
        if (userAgent == null || userAgent.isBlank()) userAgent = "RankPeek/local-cn-meta";
        if (connectTimeoutMs <= 0) connectTimeoutMs = 500;
        if (readTimeoutMs <= 0) readTimeoutMs = 2_000;
        if (maxResponseBytes <= 0) maxResponseBytes = 20_000;
    }
}
