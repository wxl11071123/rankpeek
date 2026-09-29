package io.rankpeek.esports;

import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class LplEsportsService {
    private final LplEsportsRepository repository;

    public LplEsportsService(LplEsportsRepository repository) {
        this.repository = repository;
    }

    public LplChampionUsage saveMockUsage(String patchKey, Integer championId, String role) {
        return repository.saveMockUsage(patchKey, championId, role);
    }

    public List<LplChampionUsage> findChampionUsage(String patchKey, Integer championId, String role) {
        return repository.findChampionUsage(patchKey, championId, role);
    }
}
