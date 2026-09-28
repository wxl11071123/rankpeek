package io.rankpeek.opgg;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class OpggChampionService implements OpggChampionDetailProvider, OpggChampionListProvider {
    private final OpggSourceClient sourceClient;
    private final Duration cacheTtl;
    private final Clock clock;
    private final OpggCacheProperties cacheProperties;
    private final OpggChampionCacheRepository cacheRepository;
    private final Map<String, DetailCacheEntry> detailCache = new ConcurrentHashMap<>();
    private final Map<String, ListCacheEntry> listCache = new ConcurrentHashMap<>();

    @Autowired
    public OpggChampionService(
            OpggSourceClient sourceClient,
            OpggSourceProperties properties,
            OpggCacheProperties cacheProperties,
            OpggChampionCacheRepository cacheRepository
    ) {
        this(
                sourceClient,
                Duration.ofSeconds(properties.cacheTtlSeconds()),
                Clock.systemUTC(),
                cacheProperties,
                cacheRepository
        );
    }

    OpggChampionService(OpggSourceClient sourceClient, Duration cacheTtl, Clock clock) {
        this(
                sourceClient,
                cacheTtl,
                clock,
                new OpggCacheProperties(false, "Asia/Shanghai", false, "0 20 4 * * *"),
                null
        );
    }

    OpggChampionService(
            OpggSourceClient sourceClient,
            Duration cacheTtl,
            Clock clock,
            OpggCacheProperties cacheProperties,
            OpggChampionCacheRepository cacheRepository
    ) {
        this.sourceClient = sourceClient;
        this.cacheTtl = cacheTtl;
        this.clock = clock;
        this.cacheProperties = cacheProperties;
        this.cacheRepository = cacheRepository;
    }

    @Override
    public OpggChampionDetail getChampionDetail(OpggChampionDetailQuery query) {
        String cacheKey = query.cacheKey();
        Instant now = clock.instant();
        if (databaseCacheEnabled()) {
            Optional<OpggChampionDetail> stored = cacheRepository.findFresh(query, now);
            if (stored.isPresent()) {
                OpggChampionDetail detail = stored.get();
                if (isUsableCachedDetail(query, detail)) {
                    detailCache.put(cacheKey, new DetailCacheEntry(detail, now.plus(cacheTtl)));
                    return detail;
                }
            }
        }

        DetailCacheEntry cached = detailCache.get(cacheKey);
        if (cached != null
                && now.isBefore(cached.expiresAt())
                && isUsableCachedDetail(query, cached.detail())) {
            return cached.detail();
        }

        try {
            OpggChampionDetail detail = sourceClient.fetchChampionDetail(query);
            Instant expiresAt = now.plus(cacheTtl);
            detailCache.put(cacheKey, new DetailCacheEntry(detail, expiresAt));
            if (databaseCacheEnabled()) {
                cacheRepository.save(query, detail, now, expiresAt);
            }
            return detail;
        } catch (OpggSourceException exception) {
            Optional<OpggChampionDetail> stale = databaseCacheEnabled()
                    ? cacheRepository.findAny(query)
                    : Optional.empty();
            if (stale.isPresent() && isUsableCachedDetail(query, stale.get())) {
                return stale.get();
            }
            if (cached != null && isUsableCachedDetail(query, cached.detail())) {
                return cached.detail();
            }
            throw exception;
        }
    }

    @Override
    public OpggChampionList getChampionList(OpggChampionListQuery query) {
        String cacheKey = query.cacheKey();
        Instant now = clock.instant();
        if (databaseCacheEnabled()) {
            Optional<OpggChampionList> stored = cacheRepository.findFresh(query, now);
            if (stored.isPresent()) {
                OpggChampionList list = stored.get();
                listCache.put(cacheKey, new ListCacheEntry(list, now.plus(cacheTtl)));
                return list;
            }
        }

        ListCacheEntry cached = listCache.get(cacheKey);
        if (cached != null && now.isBefore(cached.expiresAt())) {
            return cached.list();
        }

        try {
            OpggChampionList list = sourceClient.fetchChampionList(query);
            Instant expiresAt = now.plus(cacheTtl);
            listCache.put(cacheKey, new ListCacheEntry(list, expiresAt));
            if (databaseCacheEnabled()) {
                cacheRepository.save(query, list, now, expiresAt);
            }
            return list;
        } catch (OpggSourceException exception) {
            Optional<OpggChampionList> stale = databaseCacheEnabled()
                    ? cacheRepository.findAny(query)
                    : Optional.empty();
            if (stale.isPresent()) {
                return stale.get();
            }
            if (cached != null) {
                return cached.list();
            }
            throw exception;
        }
    }

    private boolean databaseCacheEnabled() {
        return cacheRepository != null
                && cacheProperties != null
                && Boolean.TRUE.equals(cacheProperties.cacheEnabled());
    }

    private boolean isUsableCachedDetail(OpggChampionDetailQuery query, OpggChampionDetail detail) {
        if (!"ranked".equals(query.mode())) {
            return true;
        }
        return detail.skillOrders() != null && !detail.skillOrders().isEmpty();
    }

    private record DetailCacheEntry(OpggChampionDetail detail, Instant expiresAt) {
    }

    private record ListCacheEntry(OpggChampionList list, Instant expiresAt) {
    }
}
