package io.rankpeek.cost;

import io.rankpeek.model.ApiResponse;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/v1/costs")
public class CostController {

    private final CostService service;

    public CostController(CostService service) {
        this.service = service;
    }

    @GetMapping("/summary")
    public ApiResponse<CostSummaryResponse> summary(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        return ApiResponse.success(service.summary(from, to));
    }

    @GetMapping("/events")
    public ApiResponse<CostEventListResponse> events(
            @RequestParam(required = false) String type,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(defaultValue = "0") int offset
    ) {
        return ApiResponse.success(service.listEvents(type, limit, offset));
    }

    @GetMapping("/ai-usage-summary")
    public ApiResponse<AiCostUsageSummaryResponse> aiUsageSummary() {
        return ApiResponse.success(service.aiUsageSummary());
    }
}
