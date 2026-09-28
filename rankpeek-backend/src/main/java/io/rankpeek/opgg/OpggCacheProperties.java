package io.rankpeek.opgg;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "rankpeek.opgg")
public record OpggCacheProperties(
        Boolean cacheEnabled,
        String cacheZone,
        Boolean cleanupEnabled,
        String cleanupCron
) {
    public OpggCacheProperties {
        if (cacheEnabled == null) {
            cacheEnabled = true;
        }
        if (cacheZone == null || cacheZone.isBlank()) {
            cacheZone = "Asia/Shanghai";
        }
        if (cleanupEnabled == null) {
            cleanupEnabled = true;
        }
        if (cleanupCron == null || cleanupCron.isBlank()) {
            cleanupCron = "0 20 4 * * *";
        }
    }
}
