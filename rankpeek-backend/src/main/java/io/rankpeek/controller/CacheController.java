package io.rankpeek.controller;

import io.rankpeek.model.ApiResponse;
import io.rankpeek.model.CacheClearResult;
import io.rankpeek.model.CacheRepairResult;
import io.rankpeek.model.CacheStatus;
import io.rankpeek.service.CacheMaintenanceService;
import io.rankpeek.service.CacheRepairService;
import io.rankpeek.service.CacheStatusService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/cache")
@RequiredArgsConstructor
public class CacheController {

    private final CacheStatusService cacheStatusService;
    private final CacheMaintenanceService cacheMaintenanceService;
    private final CacheRepairService cacheRepairService;

    @GetMapping("/status")
    public ApiResponse<CacheStatus> getCacheStatus() {
        return ApiResponse.success(cacheStatusService.getStatus());
    }

    @PostMapping("/clear")
    public ApiResponse<CacheClearResult> clearCache(
            @RequestParam(defaultValue = "all") String scope,
            @RequestParam(defaultValue = "false") boolean confirm,
            @RequestParam(defaultValue = "normal") String mode) {
        return ApiResponse.success(cacheMaintenanceService.clearCache(scope, confirm, mode));
    }

    @PostMapping("/repair")
    public ApiResponse<CacheRepairResult> repairCache(
            @RequestParam(defaultValue = "false") boolean confirm) {
        return ApiResponse.success(cacheRepairService.repair(confirm));
    }
}
