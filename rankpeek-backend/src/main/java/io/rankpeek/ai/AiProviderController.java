package io.rankpeek.ai;

import io.rankpeek.model.ApiResponse;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/ai")
public class AiProviderController {

    private final AiProviderSettingsService service;

    public AiProviderController(AiProviderSettingsService service) {
        this.service = service;
    }

    @GetMapping("/providers")
    public ApiResponse<Map<String, Object>> providers() {
        return ApiResponse.success(Map.of("providers", service.listProviderProfiles()));
    }

    @GetMapping("/settings")
    public ApiResponse<AiProviderSettings> settings() {
        return ApiResponse.success(service.getSettings());
    }

    @GetMapping("/keys")
    public ApiResponse<AiProviderKeysResponse> keys(
            @RequestParam String providerId,
            @RequestParam(required = false, defaultValue = "") String baseUrl
    ) {
        return ApiResponse.success(new AiProviderKeysResponse(service.listApiKeys(providerId, baseUrl)));
    }

    @PostMapping("/keys")
    public ApiResponse<AiProviderKey> saveKey(@RequestBody AiProviderKeySaveRequest request) {
        return ApiResponse.success(service.saveApiKey(request));
    }

    @DeleteMapping("/keys/{id}")
    public ApiResponse<Map<String, Object>> deleteKey(@PathVariable String id) {
        service.deleteApiKey(id);
        return ApiResponse.success(Map.of("deleted", true));
    }

    @PutMapping("/settings")
    public ApiResponse<AiProviderSettings> save(@RequestBody AiProviderSettingsSaveRequest request) {
        return ApiResponse.success(service.saveSettings(request));
    }

    @PostMapping("/test")
    public ApiResponse<AiProviderTestResponse> test(@RequestBody AiProviderTestRequest request) {
        return ApiResponse.success(service.testProvider(request));
    }

    @PostMapping("/models")
    public ApiResponse<AiProviderModelsResponse> models(@RequestBody AiProviderModelsRequest request) {
        return ApiResponse.success(service.listModels(request));
    }
}
