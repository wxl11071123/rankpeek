package io.rankpeek.opgg;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "rankpeek.opgg")
public record OpggSourceProperties(
        String baseUrl,
        String userAgent,
        int connectTimeoutMs,
        int readTimeoutMs,
        int maxResponseBytes,
        int cacheTtlSeconds
) {
    public OpggSourceProperties {
        if (baseUrl == null || baseUrl.isBlank()) {
            baseUrl = "https://lol-api-champion.op.gg";
        }
        if (userAgent == null || userAgent.isBlank()) {
            userAgent = "RankPeek/opgg-client";
        }
        if (connectTimeoutMs <= 0) {
            connectTimeoutMs = 5_000;
        }
        if (readTimeoutMs <= 0) {
            readTimeoutMs = 10_000;
        }
        if (maxResponseBytes <= 0) {
            maxResponseBytes = 2_000_000;
        }
        if (cacheTtlSeconds <= 0) {
            cacheTtlSeconds = 1_800;
        }
    }
}
