package io.rankpeek.cnmeta.sync;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class CnMetaSyncScheduler {
    private final CnMetaSyncProperties properties;
    private final CnMetaSyncService service;

    public CnMetaSyncScheduler(CnMetaSyncProperties properties, CnMetaSyncService service) {
        this.properties = properties;
        this.service = service;
    }

    @Scheduled(cron = "${rankpeek.cn-meta.sync.cron:0 30 4 * * *}", zone = "${rankpeek.cn-meta.sync.zone:Asia/Shanghai}")
    public void runConfiguredSync() {
        if (!Boolean.TRUE.equals(properties.enabled())) {
            return;
        }
        service.syncConfiguredMatrix("local-current");
    }
}
