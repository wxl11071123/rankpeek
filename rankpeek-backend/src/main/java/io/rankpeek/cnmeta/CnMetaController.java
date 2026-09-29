package io.rankpeek.cnmeta;

import io.rankpeek.model.ApiResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/cn-meta")
public class CnMetaController {
    private final CnMetaService service;

    public CnMetaController(CnMetaService service) {
        this.service = service;
    }

    @GetMapping("/champions/{championId}/latest")
    public ApiResponse<List<CnChampionMeta>> latestChampionMeta(
            @PathVariable Integer championId,
            @RequestParam String tierScope
    ) {
        return ApiResponse.success(service.findLatestChampionMeta(championId, tierScope));
    }

    @GetMapping("/champions/{championId}")
    public ApiResponse<List<CnChampionMeta>> championMeta(
            @PathVariable Integer championId,
            @RequestParam(required = false) String patchKey,
            @RequestParam(defaultValue = "ALL") String role,
            @RequestParam(required = false) String tierScope
    ) {
        if (patchKey == null || patchKey.isBlank() || tierScope == null || tierScope.isBlank()) {
            return ApiResponse.success(service.findChampionMeta(championId));
        }
        return ApiResponse.success(service.findChampionMeta(patchKey, championId, role, tierScope));
    }
}
