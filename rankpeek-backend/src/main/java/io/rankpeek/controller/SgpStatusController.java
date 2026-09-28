package io.rankpeek.controller;

import io.rankpeek.model.ApiResponse;
import io.rankpeek.sgp.SgpServerResolver;
import io.rankpeek.sgp.SgpStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/sgp")
@RequiredArgsConstructor
public class SgpStatusController {

    private final SgpServerResolver resolver;

    @GetMapping("/status")
    public ApiResponse<SgpStatus> getStatus() {
        return ApiResponse.success(resolver.resolveCurrentStatus());
    }
}
