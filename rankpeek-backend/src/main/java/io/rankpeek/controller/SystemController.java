package io.rankpeek.controller;

import io.rankpeek.model.ApiResponse;
import io.rankpeek.model.AuthInfo;
import io.rankpeek.model.SystemIdentity;
import io.rankpeek.service.LcuHttpClient;
import io.rankpeek.service.SystemIdentityService;
import io.rankpeek.service.SystemShutdownService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.net.InetAddress;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/system")
@RequiredArgsConstructor
public class SystemController {

    private final SystemShutdownService shutdownService;
    private final SystemIdentityService identityService;
    private final LcuHttpClient lcuHttpClient;

    @GetMapping("/identity")
    public ApiResponse<SystemIdentity> identity() {
        return ApiResponse.success(identityService.getIdentity());
    }

    @PostMapping("/shutdown")
    public ApiResponse<Map<String, String>> shutdown(HttpServletRequest request) {
        if (!isLocalRequest(request)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "shutdown is only available from localhost");
        }

        boolean accepted = shutdownService.requestShutdown();
        return ApiResponse.success(Map.of(
                "status", accepted ? "shutting-down" : "already-requested"
        ));
    }

    @PostMapping("/lcu-auth")
    public ApiResponse<Void> updateLcuAuth(@RequestBody AuthInfo authInfo, HttpServletRequest request) {
        if (!isLocalRequest(request)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "lcu-auth is only available from localhost");
        }
        lcuHttpClient.setAuthInfo(authInfo);
        return ApiResponse.success();
    }

    private boolean isLocalRequest(HttpServletRequest request) {
        String remoteAddress = request.getRemoteAddr();
        if (remoteAddress == null || remoteAddress.isBlank()) {
            return false;
        }

        try {
            return InetAddress.getByName(remoteAddress).isLoopbackAddress();
        } catch (Exception ignored) {
            return "127.0.0.1".equals(remoteAddress) || "::1".equals(remoteAddress);
        }
    }
}
