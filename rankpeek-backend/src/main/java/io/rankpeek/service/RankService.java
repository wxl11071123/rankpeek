package io.rankpeek.service;

import io.rankpeek.cache.MatchHistoryCacheRepository;
import io.rankpeek.model.Rank;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Optional;
import java.util.concurrent.TimeUnit;

/**
 * 段位数据服务
 * 提供召唤师段位信息查询功能
 */
@Slf4j
@Service
public class RankService {

    private final LcuHttpClient lcuHttpClient;
    private final MatchHistoryCacheRepository cacheRepository;

    private Cache<String, Rank> rankCache;

    @Autowired
    public RankService(LcuHttpClient lcuHttpClient,
                       ObjectProvider<MatchHistoryCacheRepository> cacheRepositoryProvider) {
        this(lcuHttpClient, cacheRepositoryProvider.getIfAvailable());
    }

    public RankService(LcuHttpClient lcuHttpClient) {
        this(lcuHttpClient, (MatchHistoryCacheRepository) null);
    }

    public RankService(LcuHttpClient lcuHttpClient, MatchHistoryCacheRepository cacheRepository) {
        this.lcuHttpClient = lcuHttpClient;
        this.cacheRepository = cacheRepository;
    }

    @PostConstruct
    public void init() {
        this.rankCache = Caffeine.newBuilder()
                .maximumSize(500)
                .expireAfterWrite(5, TimeUnit.MINUTES)
                .build();
        log.info("段位服务初始化完成");
    }

    /**
     * 获取召唤师段位信息
     */
    public Rank getRankByPuuid(String puuid) {
        try {
            String uri = String.format("lol-ranked/v1/ranked-stats/%s", puuid);
            Rank rank = lcuHttpClient.get(uri, Rank.class);
            logRank(rank);
            if (rank != null) {
                rankCache.put(puuid, rank);
                saveRankToLocalCache(puuid, rank);
                return rank;
            }
            return findFallbackRank(puuid).orElse(null);
        } catch (Exception e) {
            Optional<Rank> fallback = findFallbackRank(puuid);
            if (fallback.isPresent()) {
                return fallback.get();
            }
            if (e instanceof RuntimeException runtimeException) {
                throw runtimeException;
            }
            throw new RuntimeException(e);
        }
    }

    private Optional<Rank> findFallbackRank(String puuid) {
        Rank memoryRank = rankCache.getIfPresent(puuid);
        if (memoryRank != null) {
            return Optional.of(memoryRank);
        }

        Optional<Rank> databaseRank = findCachedRank(puuid);
        databaseRank.ifPresent(rank -> rankCache.put(puuid, rank));
        return databaseRank;
    }

    private Optional<Rank> findCachedRank(String puuid) {
        if (cacheRepository == null) {
            return Optional.empty();
        }
        return cacheRepository.findRank(puuid);
    }

    private void saveRankToLocalCache(String puuid, Rank rank) {
        if (cacheRepository != null) {
            cacheRepository.saveRank(puuid, rank);
        }
    }

    private void logRank(Rank rank) {
        if (rank == null || rank.getQueueMap() == null) {
            return;
        }
        if (rank.getQueueMap().getRankedSolo5x5() != null) {
            var solo = rank.getQueueMap().getRankedSolo5x5();
            log.info("单双排段位原始数据 - tier: {}, wins: {}, losses: {}, games: {}",
                    solo.getTier(), solo.getWins(), solo.getLosses(), solo.getGames());
        }
        if (rank.getQueueMap().getRankedFlexSr() != null) {
            var flex = rank.getQueueMap().getRankedFlexSr();
            log.info("灵活组排段位原始数据 - tier: {}, wins: {}, losses: {}, games: {}",
                    flex.getTier(), flex.getWins(), flex.getLosses(), flex.getGames());
        }
    }

    /**
     * 刷新指定召唤师段位缓存
     */
    public void refreshCache(String puuid) {
        rankCache.invalidate(puuid);
    }

    /**
     * 刷新所有缓存
     */
    public void refreshAllCache() {
        rankCache.invalidateAll();
    }
}
