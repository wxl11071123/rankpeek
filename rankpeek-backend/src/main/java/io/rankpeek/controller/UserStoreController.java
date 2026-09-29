package io.rankpeek.controller;

import io.rankpeek.model.ApiResponse;
import io.rankpeek.model.UserStoreSnapshot;
import io.rankpeek.model.UserStoreStatus;
import io.rankpeek.service.UserStoreService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/user-store")
@RequiredArgsConstructor
public class UserStoreController {

    private final UserStoreService userStoreService;

    @GetMapping("/status")
    public ApiResponse<UserStoreStatus> getStatus() {
        return ApiResponse.success(userStoreService.getStatus());
    }

    @GetMapping("/export")
    public ApiResponse<UserStoreSnapshot> exportUserStore() {
        return ApiResponse.success(userStoreService.getSnapshot());
    }

    @PostMapping("/import")
    public ApiResponse<UserStoreStatus> importUserStore(
            @RequestParam(defaultValue = "false") boolean confirm,
            @RequestBody UserStoreSnapshot snapshot) {
        if (!confirm) {
            throw new IllegalArgumentException("confirm=true is required");
        }
        userStoreService.saveSnapshot(snapshot);
        return ApiResponse.success(userStoreService.getStatus());
    }
}
