package io.rankpeek.esports;

import io.rankpeek.model.ApiResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/esports/lpl")
public class LplEsportsController {
    private final LplEsportsService service;

    public LplEsportsController(LplEsportsService service) {
        this.service = service;
    }

    @GetMapping("/champions/{championId}")
    public ApiResponse<List<LplChampionUsage>> championUsage(
            @PathVariable Integer championId,
            @RequestParam String patchKey,
            @RequestParam String role
    ) {
        return ApiResponse.success(service.findChampionUsage(patchKey, championId, role));
    }
}
