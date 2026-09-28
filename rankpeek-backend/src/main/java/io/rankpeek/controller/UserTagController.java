package io.rankpeek.controller;

import io.rankpeek.model.ApiResponse;
import io.rankpeek.model.BatchUserTagSummaryRequest;
import io.rankpeek.model.UserTag;
import io.rankpeek.model.UserTagSummary;
import io.rankpeek.model.UserTagSummaryFromMatchesRequest;
import io.rankpeek.service.UserTagService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/user-tag")
@RequiredArgsConstructor
public class UserTagController {

    private final UserTagService userTagService;

    @GetMapping("/name/{name}")
    public ApiResponse<UserTag> getUserTagByName(
            @PathVariable String name,
            @RequestParam(defaultValue = "0") Integer mode) {
        return ApiResponse.success(userTagService.getUserTagByName(name, mode));
    }

    @GetMapping("/puuid/{puuid}")
    public ApiResponse<UserTag> getUserTagByPuuid(
            @PathVariable String puuid,
            @RequestParam(defaultValue = "0") Integer mode) {
        return ApiResponse.success(userTagService.getUserTagByPuuid(puuid, mode));
    }

    @PostMapping("/batch-summary")
    public ApiResponse<Map<String, UserTagSummary>> getUserTagBatchSummary(
            @RequestBody(required = false) BatchUserTagSummaryRequest request) {
        Integer mode = request != null ? request.getMode() : 0;
        return ApiResponse.success(userTagService.getUserTagSummaryBatch(
                request != null ? request.getPuuids() : null,
                mode
        ));
    }

    @PostMapping("/summary-from-matches")
    public ApiResponse<UserTagSummary> getUserTagSummaryFromMatches(
            @RequestBody(required = false) UserTagSummaryFromMatchesRequest request) {
        return ApiResponse.success(userTagService.getUserTagSummaryFromMatches(
                request != null ? request.getPuuid() : null,
                request != null ? request.getMode() : 0,
                request != null ? request.getMatches() : null
        ));
    }
}
