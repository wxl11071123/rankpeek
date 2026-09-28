package io.rankpeek.controller;

import io.rankpeek.model.ApiResponse;
import io.rankpeek.model.TagConfig;
import io.rankpeek.service.TagConfigService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 标签配置控制器
 */
@RestController
@RequestMapping("/api/v1/tag-config")
@RequiredArgsConstructor
public class TagConfigController {

    private final TagConfigService tagConfigService;

    /**
     * 获取所有标签配置
     */
    @GetMapping
    public ApiResponse<List<TagConfig>> getAllTagConfigs() {
        return ApiResponse.success(tagConfigService.getAllTagConfigs());
    }

    /**
     * 保存标签配置列表
     */
    @PostMapping
    public ApiResponse<Void> saveTagConfigs(@RequestBody List<TagConfig> configs) {
        tagConfigService.saveTagConfigs(configs);
        return ApiResponse.success();
    }

    /**
     * 添加标签配置
     */
    @PostMapping("/add")
    public ApiResponse<Void> addTagConfig(@RequestBody TagConfig config) {
        tagConfigService.addTagConfig(config);
        return ApiResponse.success();
    }

    /**
     * 更新标签配置
     */
    @PutMapping("/{id}")
    public ApiResponse<Void> updateTagConfig(@PathVariable String id, @RequestBody TagConfig config) {
        config.setId(id);
        tagConfigService.updateTagConfig(id, config);
        return ApiResponse.success();
    }

    /**
     * 删除标签配置
     */
    @DeleteMapping("/{id}")
    public ApiResponse<Void> deleteTagConfig(@PathVariable String id) {
        tagConfigService.deleteTagConfig(id);
        return ApiResponse.success();
    }

    /**
     * 切换标签启用状态
     */
    @PostMapping("/{id}/toggle")
    public ApiResponse<Void> toggleTagConfig(@PathVariable String id) {
        tagConfigService.toggleTagConfig(id);
        return ApiResponse.success();
    }

    /**
     * 重置为默认配置
     */
    @PostMapping("/reset")
    public ApiResponse<Void> resetToDefault() {
        tagConfigService.resetToDefault();
        return ApiResponse.success();
    }

    /**
     * 获取默认标签配置
     */
    @GetMapping("/defaults")
    public ApiResponse<List<TagConfig>> getDefaultTags() {
        return ApiResponse.success(tagConfigService.getDefaultTags());
    }
}
