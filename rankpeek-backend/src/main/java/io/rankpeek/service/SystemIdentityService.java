package io.rankpeek.service;

import io.rankpeek.config.LocalDataPathService;
import io.rankpeek.model.SystemIdentity;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

@Service
public class SystemIdentityService {

    private final LocalDataPathService localDataPathService;
    private final long pid;
    private final String startedAt;
    private final String instanceId;

    @Autowired
    public SystemIdentityService(
            LocalDataPathService localDataPathService,
            @Value("${RANKPEEK_BACKEND_INSTANCE_ID:}") String configuredInstanceId) {
        this(localDataPathService, configuredInstanceId, Clock.systemUTC());
    }

    SystemIdentityService(LocalDataPathService localDataPathService,
                          String configuredInstanceId,
                          Clock clock) {
        this.localDataPathService = localDataPathService;
        this.pid = ProcessHandle.current().pid();
        this.startedAt = Instant.now(clock).toString();
        this.instanceId = configuredInstanceId == null || configuredInstanceId.isBlank()
                ? UUID.randomUUID().toString()
                : configuredInstanceId.trim();
    }

    public SystemIdentity getIdentity() {
        return new SystemIdentity(
                pid,
                localDataPathService.getLocalDataRoot().toAbsolutePath().toString(),
                localDataPathService.getCacheDatabasePath().toAbsolutePath().toString(),
                startedAt,
                instanceId
        );
    }
}
