package io.rankpeek.cnmeta;

import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class CnMetaService {
    private final CnMetaRepository repository;

    public CnMetaService(CnMetaRepository repository) {
        this.repository = repository;
    }

    public List<CnChampionMeta> findLatestChampionMeta(Integer championId, String tierScope) {
        return repository.findLatestChampionMeta(championId, tierScope);
    }

    public List<CnChampionMeta> findChampionMeta(String patchKey, Integer championId, String role, String tierScope) {
        return repository.findChampionMeta(patchKey, championId, role, tierScope);
    }

    public List<CnChampionMeta> findChampionMeta(Integer championId) {
        return repository.findChampionMeta(championId);
    }
}
