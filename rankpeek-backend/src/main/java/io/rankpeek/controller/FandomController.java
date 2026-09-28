package io.rankpeek.controller;

import io.rankpeek.model.ApiResponse;
import io.rankpeek.model.AramBalanceData;
import io.rankpeek.service.FandomService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Fandom 数据控制器
 */
@RestController
@RequestMapping("/api/v1/fandom")
@RequiredArgsConstructor
public class FandomController {

    private final FandomService fandomService;

    /**
     * 更新 Fandom 数据
     */
    @PostMapping("/update")
    public ApiResponse<String> updateFandomData() {
        return ApiResponse.success(fandomService.updateAramBalanceData());
    }

    /**
     * 获取英雄 ARAM 平衡数据
     */
    @GetMapping("/aram/{championId}")
    public ApiResponse<AramBalanceData> getAramBalance(@PathVariable Integer championId) {
        return ApiResponse.success(fandomService.getAramBalance(championId));
    }

    /**
     * 获取所有 ARAM 平衡数据
     */
    @GetMapping("/aram")
    public ApiResponse<Map<Integer, AramBalanceData>> getAllAramBalance() {
        return ApiResponse.success(fandomService.getAllAramBalance());
    }

    /**
     * 检查数据状态
     */
    @GetMapping("/status")
    public ApiResponse<Map<String, Object>> getStatus() {
        return ApiResponse.success(Map.of(
                "hasData", fandomService.hasData(),
                "message", fandomService.hasData() ? "数据已加载" : "数据未加载，请点击更新"
        ));
    }
}
