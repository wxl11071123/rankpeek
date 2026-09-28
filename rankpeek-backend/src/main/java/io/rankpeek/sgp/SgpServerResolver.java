package io.rankpeek.sgp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.rankpeek.service.LcuHttpClient;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class SgpServerResolver {

    private static final String REGION_LOCALE_URI = "riotclient/region-locale";
    private static final String TENCENT_COARSE_PLATFORM = "CN";
    private static final Set<String> TENCENT_PLATFORM_IDS = Set.of(
            "HN1", "HN10", "TJ100", "TJ101", "NJ100", "GZ100", "CQ100", "BGP2"
    );

    private final SgpServerConfigService configService;
    private final LcuHttpClient lcuHttpClient;
    private final SgpTokenService tokenService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public SgpStatus resolveCurrentStatus() {
        SgpAuthState authState = tokenService.getAuthState();
        String platformId = readCurrentPlatformId(authState);
        if (platformId == null || platformId.isBlank()) {
            return SgpStatus.builder()
                    .supported(false)
                    .tokenReady(authState.isReady())
                    .authState(authState)
                    .message("无法获取当前 LCU 区服状态")
                    .build();
        }
        if (isTencentCoarsePlatform(platformId)) {
            return tencentPlatformMissingStatus(authState);
        }
        return resolveStatus(platformId, authState);
    }

    public SgpStatus resolveStatus(String platformId) {
        return resolveStatus(platformId, tokenService.getAuthState());
    }

    private SgpStatus resolveStatus(String platformId, SgpAuthState authState) {
        if (isTencentCoarsePlatform(platformId)) {
            return tencentPlatformMissingStatus(authState);
        }

        Optional<SgpServerEntry> server = configService.findByPlatformId(platformId);
        if (server.isEmpty()) {
            return SgpStatus.builder()
                    .supported(false)
                    .platformId(normalize(platformId))
                    .tokenReady(authState.isReady())
                    .authState(authState)
                    .message("当前区服暂不支持 SGP: " + platformId)
                    .build();
        }
        return toStatus(server.get(), authState);
    }

    private SgpStatus toStatus(SgpServerEntry entry, SgpAuthState authState) {
        boolean matchHistorySupported = entry.isMatchHistorySupported();
        boolean commonSupported = entry.isCommonSupported();
        return SgpStatus.builder()
                .supported(matchHistorySupported)
                .platformId(entry.getPlatformId())
                .sgpServerId(entry.getSgpServerId())
                .matchHistorySupported(matchHistorySupported)
                .commonSupported(commonSupported)
                .tokenReady(authState.isReady())
                .authState(authState)
                .matchHistoryBaseUrl(entry.getMatchHistoryBaseUrl())
                .commonBaseUrl(entry.getCommonBaseUrl())
                .message(matchHistorySupported
                        ? "当前区服支持 SGP match-history"
                        : "当前区服暂不支持 SGP match-history")
                .build();
    }

    private String readCurrentPlatformId(SgpAuthState authState) {
        JsonNode regionLocale = readRegionLocale();
        String regionPlatformId = readPlatformIdFromRegionLocale(regionLocale);
        if (isTencentCoarsePlatform(regionPlatformId)) {
            String tencentPlatformId = readConfiguredPlatformId(regionLocale, authState);
            return tencentPlatformId != null ? tencentPlatformId : regionPlatformId;
        }
        if (regionPlatformId != null) {
            return regionPlatformId;
        }

        return readPlatformIdFromLeagueSessionToken(authState);
    }

    private JsonNode readRegionLocale() {
        try {
            return lcuHttpClient.get(REGION_LOCALE_URI, JsonNode.class);
        } catch (Exception e) {
            return null;
        }
    }

    private String readPlatformIdFromRegionLocale(JsonNode regionLocale) {
        return firstText(regionLocale, "platformId", "region", "webRegion");
    }

    private String readConfiguredPlatformId(JsonNode regionLocale, SgpAuthState authState) {
        List<String> candidates = new ArrayList<>();
        candidates.addAll(platformCandidatesFromJson(regionLocale));
        candidates.addAll(platformCandidatesFromLeagueSessionToken(authState));
        return firstUsableConfiguredPlatformId(candidates);
    }

    private String readPlatformIdFromLeagueSessionToken(SgpAuthState authState) {
        List<String> candidates = platformCandidatesFromLeagueSessionToken(authState);
        String configuredPlatformId = firstUsableConfiguredPlatformId(candidates);
        if (configuredPlatformId != null) {
            return configuredPlatformId;
        }
        return candidates.stream().findFirst().orElse(null);
    }

    private List<String> platformCandidatesFromLeagueSessionToken(SgpAuthState authState) {
        if (authState == null || authState.getLeagueSessionToken() == null || authState.getLeagueSessionToken().isBlank()) {
            return List.of();
        }
        String[] parts = authState.getLeagueSessionToken().split("\\.");
        if (parts.length < 2) {
            return List.of();
        }
        try {
            byte[] payloadBytes = Base64.getUrlDecoder().decode(parts[1]);
            JsonNode payload = objectMapper.readTree(new String(payloadBytes, StandardCharsets.UTF_8));
            return platformCandidatesFromJson(payload);
        } catch (Exception ignored) {
            return List.of();
        }
    }

    private List<String> platformCandidatesFromJson(JsonNode node) {
        if (node == null || node.isNull()) {
            return List.of();
        }
        LinkedHashSet<String> candidates = new LinkedHashSet<>();
        addCandidate(candidates, firstText(node, "platformId", "cpid"));
        JsonNode data = node.get("dat");
        addCandidate(candidates, firstText(data, "r", "region", "platformId", "cpid"));
        JsonNode lol = node.get("lol");
        addCandidate(candidates, firstText(lol, "cpid", "platformId", "region"));
        addCandidate(candidates, firstText(node, "reg", "region", "webRegion"));
        collectStringCandidates(node, candidates);
        return List.copyOf(candidates);
    }

    private void collectStringCandidates(JsonNode node, LinkedHashSet<String> candidates) {
        if (node == null || node.isNull()) {
            return;
        }
        if (node.isTextual()) {
            addCandidate(candidates, node.asText());
            addTencentEdgeCandidates(candidates, node.asText());
            return;
        }
        if (node.isArray()) {
            node.forEach(child -> collectStringCandidates(child, candidates));
            return;
        }
        if (node.isObject()) {
            node.properties().forEach(entry -> collectStringCandidates(entry.getValue(), candidates));
        }
    }

    private void addTencentEdgeCandidates(LinkedHashSet<String> candidates, String value) {
        if (value == null || value.isBlank()) {
            return;
        }
        String lowerValue = value.toLowerCase(Locale.ROOT);
        for (String platformId : TENCENT_PLATFORM_IDS) {
            String lowerPlatformId = platformId.toLowerCase(Locale.ROOT);
            if (lowerValue.contains(lowerPlatformId + "-")
                    || lowerValue.contains(lowerPlatformId + "_")
                    || lowerValue.contains(lowerPlatformId + ".")
                    || lowerValue.endsWith(lowerPlatformId)) {
                candidates.add(platformId);
            }
        }
    }

    private void addCandidate(LinkedHashSet<String> candidates, String value) {
        String normalized = normalize(value);
        if (normalized == null) {
            return;
        }
        if (normalized.startsWith("TENCENT_") && normalized.length() > "TENCENT_".length()) {
            candidates.add(normalized.substring("TENCENT_".length()));
        }
        candidates.add(normalized);
    }

    private String firstUsableConfiguredPlatformId(List<String> candidates) {
        return candidates.stream()
                .filter(candidate -> !isTencentCoarsePlatform(candidate))
                .filter(candidate -> configService.findByPlatformId(candidate).isPresent())
                .findFirst()
                .orElse(null);
    }

    private SgpStatus tencentPlatformMissingStatus(SgpAuthState authState) {
        return SgpStatus.builder()
                .supported(false)
                .platformId(TENCENT_COARSE_PLATFORM)
                .tokenReady(authState.isReady())
                .authState(authState)
                .message("腾讯服 region-locale 只返回 CN，无法识别细分区服")
                .build();
    }

    private boolean isTencentCoarsePlatform(String platformId) {
        String normalized = normalize(platformId);
        return TENCENT_COARSE_PLATFORM.equals(normalized) || "TENCENT".equals(normalized);
    }

    private String firstText(JsonNode node, String... fieldNames) {
        if (node == null || node.isNull()) {
            return null;
        }
        for (String fieldName : fieldNames) {
            JsonNode value = node.get(fieldName);
            if (value != null && value.isTextual() && !value.asText().isBlank()) {
                return normalize(value.asText());
            }
        }
        return null;
    }

    private String normalize(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim().toUpperCase();
    }
}
