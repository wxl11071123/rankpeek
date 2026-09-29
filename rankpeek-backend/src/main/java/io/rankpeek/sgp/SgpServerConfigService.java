package io.rankpeek.sgp;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.util.List;
import java.util.Optional;

@Slf4j
@Service
public class SgpServerConfigService {

    private final ObjectMapper objectMapper;
    private final Resource configResource;
    private volatile SgpServerConfig cachedConfig;

    public SgpServerConfigService(ObjectMapper objectMapper,
                                  @Value("classpath:sgp/league-servers.json") Resource configResource) {
        this.objectMapper = objectMapper;
        this.configResource = configResource;
    }

    public Optional<SgpServerEntry> findByPlatformId(String platformId) {
        if (platformId == null || platformId.isBlank()) {
            return Optional.empty();
        }
        return loadConfig().getServers().stream()
                .filter(entry -> entry.matchesPlatformId(platformId))
                .findFirst();
    }

    public List<SgpServerEntry> listServers() {
        return List.copyOf(loadConfig().getServers());
    }

    private SgpServerConfig loadConfig() {
        SgpServerConfig config = cachedConfig;
        if (config != null) {
            return config;
        }
        synchronized (this) {
            if (cachedConfig == null) {
                cachedConfig = readConfig();
            }
            return cachedConfig;
        }
    }

    private SgpServerConfig readConfig() {
        if (configResource == null || !configResource.exists()) {
            log.warn("SGP 区服配置文件不存在");
            return new SgpServerConfig();
        }
        try (InputStream inputStream = configResource.getInputStream()) {
            SgpServerConfig config = objectMapper.readValue(inputStream, SgpServerConfig.class);
            if (config.getServers() == null) {
                config.setServers(List.of());
            }
            return config;
        } catch (Exception e) {
            log.warn("读取 SGP 区服配置失败: {}", e.getMessage());
            return new SgpServerConfig();
        }
    }
}
