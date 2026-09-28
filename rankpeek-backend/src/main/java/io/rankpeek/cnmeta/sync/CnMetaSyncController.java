package io.rankpeek.cnmeta.sync;

import io.rankpeek.cnmeta.CnMetaRoles;
import io.rankpeek.model.ApiResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Locale;
import java.util.Set;

@RestController
@RequestMapping("/api/v1/cn-meta/sync")
public class CnMetaSyncController {
    private static final Set<String> ALLOWED_ROLES = Set.of("TOP", "JUNGLE", "MID", "ADC", "SUPPORT", CnMetaRoles.ALL);

    private final CnMetaSyncProperties properties;
    private final CnMetaSyncService service;

    public CnMetaSyncController(CnMetaSyncProperties properties, CnMetaSyncService service) {
        this.properties = properties;
        this.service = service;
    }

    @PostMapping("/mock-once")
    public ApiResponse<CnMetaSyncResult> mockOnce(
            @RequestParam String patchKey,
            @RequestParam(defaultValue = "420") Integer queueId,
            @RequestParam String tierScope,
            @RequestParam String role
    ) {
        SyncRequest request = validateSyncRequest(patchKey, queueId, tierScope, role);
        return ApiResponse.success(service.syncOnceWithSource(
                "mock",
                request.patchKey(),
                request.queueId(),
                request.tierScope(),
                request.role()
        ));
    }

    @PostMapping("/real-once")
    public ApiResponse<CnMetaSyncResult> realOnce(
            @RequestParam String patchKey,
            @RequestParam(defaultValue = "420") Integer queueId,
            @RequestParam String tierScope
    ) {
        SyncRequest request = validateSyncRequest(patchKey, queueId, tierScope, CnMetaRoles.ALL);
        return ApiResponse.success(service.syncOnceWithSource(
                "real",
                request.patchKey(),
                request.queueId(),
                request.tierScope(),
                CnMetaRoles.ALL
        ));
    }

    @PostMapping("/configured-matrix")
    public ApiResponse<List<CnMetaSyncResult>> configuredMatrix(@RequestParam String patchKey) {
        if (!Boolean.TRUE.equals(properties.enabled()) && !Boolean.TRUE.equals(properties.allowManual())) {
            throw new IllegalArgumentException("CN meta sync is disabled");
        }
        return ApiResponse.success(service.syncConfiguredMatrix(validatePatchKey(patchKey)));
    }

    @GetMapping("/jobs")
    public ApiResponse<List<CnMetaSyncJob>> jobs(@RequestParam(defaultValue = "20") Integer limit) {
        return ApiResponse.success(service.findRecentJobs(limit));
    }

    private SyncRequest validateSyncRequest(String patchKey, Integer queueId, String tierScope, String role) {
        String normalizedPatchKey = validatePatchKey(patchKey);
        if (queueId == null || queueId <= 0) {
            throw new IllegalArgumentException("queueId must be greater than 0");
        }
        String normalizedTier = normalizeUpper(tierScope, "tierScope");
        String normalizedRole = normalizeUpper(role, "role");
        if (!ALLOWED_ROLES.contains(normalizedRole)) {
            throw new IllegalArgumentException("role is not allowed");
        }
        return new SyncRequest(normalizedPatchKey, queueId, normalizedTier, normalizedRole);
    }

    private static String validatePatchKey(String patchKey) {
        String normalized = normalize(patchKey, "patchKey");
        if (normalized.length() > 32) {
            throw new IllegalArgumentException("patchKey must be 32 characters or fewer");
        }
        return normalized;
    }

    private static String normalizeUpper(String value, String field) {
        return normalize(value, field).toUpperCase(Locale.ROOT);
    }

    private static String normalize(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " is required");
        }
        return value.trim();
    }

    private record SyncRequest(String patchKey, Integer queueId, String tierScope, String role) {
    }
}
