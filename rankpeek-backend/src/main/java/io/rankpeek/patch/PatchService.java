package io.rankpeek.patch;

import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class PatchService {
    private final PatchRepository repository;

    public PatchService(PatchRepository repository) {
        this.repository = repository;
    }

    public Optional<PatchVersion> findCurrentPatch() {
        return repository.findCurrent();
    }

    public PatchVersion saveMockPatchVersion(String patchKey) {
        return repository.findByPatchKey(patchKey).orElseGet(() -> repository.insertMockPatch(patchKey));
    }

    public List<PatchChange> findPatchChanges(String patchKey) {
        return repository.findChanges(patchKey);
    }

    public boolean hasChampionChange(String patchKey, Integer championId) {
        return repository.hasChampionChange(patchKey, championId);
    }
}
