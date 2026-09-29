package io.rankpeek.patch;

import io.rankpeek.model.ApiResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/patch")
public class PatchController {
    private final PatchService service;

    public PatchController(PatchService service) {
        this.service = service;
    }

    @GetMapping("/current")
    public ApiResponse<PatchVersion> currentPatch() {
        return ApiResponse.success(service.findCurrentPatch().orElseGet(() -> service.saveMockPatchVersion("26.09")));
    }

    @GetMapping("/{patchKey}/changes")
    public ApiResponse<List<PatchChange>> patchChanges(@PathVariable String patchKey) {
        return ApiResponse.success(service.findPatchChanges(patchKey));
    }
}
