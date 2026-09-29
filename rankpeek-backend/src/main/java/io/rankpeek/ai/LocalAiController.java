package io.rankpeek.ai;

import io.rankpeek.model.ApiResponse;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/v1/ai")
public class LocalAiController {

    private final LocalAiAnalysisService service;

    public LocalAiController(LocalAiAnalysisService service) {
        this.service = service;
    }

    @PostMapping(value = "/pregame/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter pregameStream(@RequestBody PregameAnalysisRequest request) {
        return service.streamPregame(request);
    }

    @PostMapping(value = "/postgame/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter postgameStream(@RequestBody PostgameAnalysisRequest request) {
        return service.streamPostgame(request);
    }

    @PostMapping("/coach-summary")
    public ApiResponse<CoachSummaryAnalysisResponse> coachSummary(@RequestBody CoachSummaryAnalysisRequest request) {
        return ApiResponse.success(service.generateCoachSummary(request));
    }

    @GetMapping("/runs")
    public ApiResponse<LocalAiRunListResponse> listRuns(
            @RequestParam(required = false) String endpoint,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(defaultValue = "0") int offset
    ) {
        return ApiResponse.success(service.listRuns(endpoint, status, limit, offset));
    }

    @GetMapping("/runs/{runId}")
    public ApiResponse<LocalAiRunResponse> getRun(@PathVariable long runId) {
        return ApiResponse.success(service.getRun(runId));
    }
}
