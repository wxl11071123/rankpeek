package io.rankpeek.service;

import io.rankpeek.constant.QueueType;
import io.rankpeek.cache.MatchHistoryCacheRepository;
import io.rankpeek.model.GameDetail;
import io.rankpeek.model.MatchDataScopeCache;
import io.rankpeek.model.MatchHistory;
import io.rankpeek.model.MatchHistoryFetchResult;
import io.rankpeek.model.MatchHistoryPageResponse;
import io.rankpeek.model.MatchTimeline;
import io.rankpeek.model.MatchTimelineFetchResult;
import io.rankpeek.model.Rank;
import io.rankpeek.model.RecordStatus;
import io.rankpeek.model.Summoner;
import io.rankpeek.model.WinRate;
import io.rankpeek.service.matchhistory.MatchHistoryProvider;
import io.rankpeek.service.matchhistory.MatchHistoryQueryOptions;
import io.rankpeek.service.matchhistory.MatchHistorySource;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import jakarta.annotation.PreDestroy;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Match-history service.
 */
@Slf4j
@Service
public class MatchHistoryService {

    private static final int SUMMONERS_RIFT_MAP_ID = 11;
    private static final int VISIBLE_MATCH_HISTORY_LIMIT = 50;
    private static final int MATCH_HISTORY_PAGE_LIMIT = 200;
    private static final int DEFAULT_MATCH_HISTORY_PAGE_SIZE = 20;
    private static final long MATCH_HISTORY_CACHE_MAX_WEIGHT = 2_000;
    private static final long GAME_DETAIL_CACHE_MAX_ENTRIES = 200;
    private static final int CACHE_WRITE_THREADS = 1;
    private static final int CACHE_WRITE_QUEUE_CAPACITY = 64;
    private static final int SGP_BACKFILL_THREADS = 2;
    private static final int SGP_BACKFILL_QUEUE_CAPACITY = 64;
    private static final int SGP_TIMELINE_BACKFILL_PER_PAGE = 5;
    private static final int SGP_MATCH_HISTORY_MAX_ATTEMPTS = 3;
    private static final int MIN_TRUSTED_SGP_FORCE_REFRESH_ROWS = 2;
    private static final int REMAKE_MAX_GAME_DURATION_SECONDS = 300;
    private static final AtomicInteger CACHE_WRITE_THREAD_SEQUENCE = new AtomicInteger();
    private static final AtomicInteger SGP_BACKFILL_THREAD_SEQUENCE = new AtomicInteger();
    private static final Set<String> MATCH_HISTORY_CACHE_WRITE_IN_FLIGHT = ConcurrentHashMap.newKeySet();
    private static final Set<Long> SGP_TIMELINE_BACKFILL_IN_FLIGHT = ConcurrentHashMap.newKeySet();
    private static final String POSITION_TOP = "TOP";
    private static final String POSITION_JUNGLE = "JUNGLE";
    private static final String POSITION_MIDDLE = "MIDDLE";
    private static final String POSITION_BOTTOM = "BOTTOM";
    private static final String POSITION_SUPPORT = "SUPPORT";
    private static final List<String> TEAM_ORDER_POSITIONS = List.of(
            POSITION_TOP,
            POSITION_JUNGLE,
            POSITION_MIDDLE,
            POSITION_BOTTOM,
            POSITION_SUPPORT
    );

    private final Map<MatchHistorySource, MatchHistoryProvider> matchHistoryProviders;
    private final MatchHistoryCacheRepository cacheRepository;
    private final ExecutorService cacheWriteExecutor;
    private final ExecutorService sgpBackfillExecutor;

    /**
     * 召唤师查询（补玩家名用）。用 setter 注入：这个类有一堆给测试用的构造器，
     * 不想为了一个可选依赖把它们全改一遍。
     */
    private SummonerService summonerService;

    @Autowired(required = false)
    public void setSummonerService(SummonerService summonerService) {
        this.summonerService = summonerService;
    }

    private Cache<String, MatchHistoryFetchResult> matchHistoryCache;
    private Cache<String, GameDetail> gameDetailCache;

    @Autowired
    public MatchHistoryService(List<MatchHistoryProvider> matchHistoryProviders,
                               ObjectProvider<MatchHistoryCacheRepository> cacheRepositoryProvider) {
        this(matchHistoryProviders, cacheRepositoryProvider.getIfAvailable());
    }

    public MatchHistoryService(MatchHistoryProvider matchHistoryProvider) {
        this(List.of(matchHistoryProvider), (MatchHistoryCacheRepository) null);
    }

    public MatchHistoryService(MatchHistoryProvider matchHistoryProvider, MatchHistoryCacheRepository cacheRepository) {
        this(List.of(matchHistoryProvider), cacheRepository);
    }

    public MatchHistoryService(List<MatchHistoryProvider> matchHistoryProviders) {
        this(matchHistoryProviders, (MatchHistoryCacheRepository) null);
    }

    public MatchHistoryService(List<MatchHistoryProvider> matchHistoryProviders, MatchHistoryCacheRepository cacheRepository) {
        this(matchHistoryProviders, cacheRepository, createCacheWriteExecutor(), createSgpBackfillExecutor());
    }

    MatchHistoryService(List<MatchHistoryProvider> matchHistoryProviders,
                        MatchHistoryCacheRepository cacheRepository,
                        ExecutorService cacheWriteExecutor,
                        ExecutorService sgpBackfillExecutor) {
        this.matchHistoryProviders = indexProviders(matchHistoryProviders);
        this.cacheRepository = cacheRepository;
        this.cacheWriteExecutor = cacheWriteExecutor;
        this.sgpBackfillExecutor = sgpBackfillExecutor;
    }

    private static ExecutorService createCacheWriteExecutor() {
        return new ThreadPoolExecutor(
                CACHE_WRITE_THREADS,
                CACHE_WRITE_THREADS,
                0L,
                TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(CACHE_WRITE_QUEUE_CAPACITY),
                runnable -> {
                    Thread thread = new Thread(runnable,
                            "match-history-cache-write-" + CACHE_WRITE_THREAD_SEQUENCE.incrementAndGet());
                    thread.setDaemon(true);
                    return thread;
                },
                new ThreadPoolExecutor.AbortPolicy()
        );
    }

    private static ExecutorService createSgpBackfillExecutor() {
        return new ThreadPoolExecutor(
                SGP_BACKFILL_THREADS,
                SGP_BACKFILL_THREADS,
                0L,
                TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(SGP_BACKFILL_QUEUE_CAPACITY),
                runnable -> {
                    Thread thread = new Thread(runnable,
                            "sgp-match-backfill-" + SGP_BACKFILL_THREAD_SEQUENCE.incrementAndGet());
                    thread.setDaemon(true);
                    return thread;
                },
                new ThreadPoolExecutor.AbortPolicy()
        );
    }

    private Map<MatchHistorySource, MatchHistoryProvider> indexProviders(List<MatchHistoryProvider> providers) {
        Map<MatchHistorySource, MatchHistoryProvider> indexed = new HashMap<>();
        if (providers == null || providers.isEmpty()) {
            return indexed;
        }

        MatchHistoryProvider firstProvider = null;
        for (MatchHistoryProvider provider : providers) {
            if (provider == null) {
                continue;
            }
            if (firstProvider == null) {
                firstProvider = provider;
            }
            MatchHistorySource providerSource = provider.source();
            if (providerSource != null && providerSource != MatchHistorySource.AUTO
                    && providerSource != MatchHistorySource.CACHE) {
                indexed.put(providerSource, provider);
            }
        }

        if (!indexed.containsKey(MatchHistorySource.LCU) && firstProvider != null && providers.size() == 1) {
            indexed.put(MatchHistorySource.LCU, firstProvider);
        }
        return indexed;
    }

    @PostConstruct
    public void init() {
        this.matchHistoryCache = Caffeine.newBuilder()
                .maximumWeight(MATCH_HISTORY_CACHE_MAX_WEIGHT)
                .weigher((String key, MatchHistoryFetchResult result) -> matchHistoryCacheWeight(result))
                .expireAfterWrite(10, TimeUnit.MINUTES)
                .build();
        this.gameDetailCache = Caffeine.newBuilder()
                .maximumSize(GAME_DETAIL_CACHE_MAX_ENTRIES)
                .expireAfterWrite(30, TimeUnit.MINUTES)
                .build();
        log.info("战绩服务初始化完成");
    }

    @PreDestroy
    public void shutdownAsyncExecutors() {
        shutdownExecutor("match-history cache write", cacheWriteExecutor);
        shutdownExecutor("SGP match backfill", sgpBackfillExecutor);
    }

    private void shutdownExecutor(String name, ExecutorService executor) {
        if (executor == null) {
            return;
        }

        log.info("Shutting down {} executor", name);
        executor.shutdown();
        try {
            if (executor.awaitTermination(5, TimeUnit.SECONDS)) {
                log.info("{} executor stopped gracefully", name);
                return;
            }
            log.warn("{} executor did not stop within timeout; forcing shutdown", name);
            List<Runnable> droppedTasks = executor.shutdownNow();
            log.warn("{} executor forced shutdown; droppedTasks={}", name, droppedTasks.size());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            List<Runnable> droppedTasks = executor.shutdownNow();
            log.warn("{} executor shutdown interrupted; forced shutdown; droppedTasks={}",
                    name,
                    droppedTasks.size());
        }
    }

    private int matchHistoryCacheWeight(MatchHistoryFetchResult result) {
        if (result == null || result.getMatches() == null || result.getMatches().isEmpty()) {
            return 1;
        }
        return Math.max(1, result.getMatches().size());
    }

    private ResolvedProvider resolveProvider(MatchHistoryQueryOptions options) {
        MatchHistorySource preferredSource = normalizeSource(options == null ? null : options.preferredSource());
        if (preferredSource == MatchHistorySource.AUTO) {
            MatchHistoryProvider sgpProvider = matchHistoryProviders.get(MatchHistorySource.SGP);
            if (sgpProvider != null) {
                try {
                    sgpProvider.supports(options);
                } catch (Exception e) {
                    log.debug("SGP match-history support check failed; SGP will still be attempted: {}",
                            e.getMessage());
                }
                return new ResolvedProvider(sgpProvider, MatchHistorySource.SGP);
            }
            return requireProvider(MatchHistorySource.LCU);
        }
        return requireProvider(preferredSource);
    }

    private ResolvedProvider requireProvider(MatchHistorySource source) {
        MatchHistoryProvider provider = matchHistoryProviders.get(source);
        if (provider == null) {
            throw new IllegalStateException("Match-history provider not configured: " + source);
        }
        return new ResolvedProvider(provider, source);
    }

    private MatchHistorySource normalizeSource(MatchHistorySource source) {
        return source == null ? MatchHistorySource.AUTO : source;
    }

    private boolean usesDatabaseCache(MatchHistorySource source) {
        MatchHistorySource normalizedSource = normalizeSource(source);
        return normalizedSource == MatchHistorySource.LCU
                || normalizedSource == MatchHistorySource.SGP
                || normalizedSource == MatchHistorySource.CACHE;
    }

    private boolean shouldReadDatabaseBeforeProvider(MatchHistoryQueryOptions options, MatchHistorySource resolvedSource) {
        MatchHistorySource preferredSource = normalizeSource(options == null ? null : options.preferredSource());
        return usesDatabaseCache(resolvedSource) || preferredSource == MatchHistorySource.CACHE;
    }

    private boolean shouldReadGameDetailDatabaseBeforeProvider(MatchHistoryQueryOptions options,
                                                               MatchHistorySource resolvedSource) {
        MatchHistorySource preferredSource = normalizeSource(options == null ? null : options.preferredSource());
        if (preferredSource == MatchHistorySource.SGP) {
            return false;
        }
        return shouldReadDatabaseBeforeProvider(options, resolvedSource);
    }

    private boolean isAutoSgpAttempt(MatchHistoryQueryOptions options, MatchHistorySource resolvedSource) {
        return normalizeSource(options == null ? null : options.preferredSource()) == MatchHistorySource.AUTO
                && resolvedSource == MatchHistorySource.SGP;
    }

    private boolean isExplicitSgpAttempt(MatchHistoryQueryOptions options, MatchHistorySource resolvedSource) {
        return normalizeSource(options == null ? null : options.preferredSource()) == MatchHistorySource.SGP
                && resolvedSource == MatchHistorySource.SGP;
    }

    private MatchHistoryQueryOptions withPreferredSource(MatchHistoryQueryOptions options, MatchHistorySource source) {
        MatchHistoryQueryOptions safeOptions = options == null
                ? MatchHistoryQueryOptions.defaultFor(source, false)
                : options;
        return new MatchHistoryQueryOptions(
                safeOptions.begIndex(),
                safeOptions.endIndex(),
                safeOptions.queueId(),
                safeOptions.championId(),
                safeOptions.maxResults(),
                safeOptions.forceRefresh(),
                source,
                safeOptions.sgpServerId(),
                safeOptions.tag()
        );
    }

    private MatchHistoryQueryOptions withSgpServerId(MatchHistoryQueryOptions options, String sgpServerId) {
        MatchHistoryQueryOptions safeOptions = options == null
                ? MatchHistoryQueryOptions.defaultFor(MatchHistorySource.AUTO, false)
                : options;
        String normalizedSgpServerId = sgpServerId == null || sgpServerId.isBlank()
                ? safeOptions.sgpServerId()
                : sgpServerId.trim();
        return new MatchHistoryQueryOptions(
                safeOptions.begIndex(),
                safeOptions.endIndex(),
                safeOptions.queueId(),
                safeOptions.championId(),
                safeOptions.maxResults(),
                safeOptions.forceRefresh(),
                safeOptions.preferredSource(),
                normalizedSgpServerId,
                safeOptions.tag()
        );
    }

    private String matchHistoryCacheKey(String puuid, MatchHistoryQueryOptions options, MatchHistorySource source) {
        return String.join("|",
                normalizeSource(source).name(),
                cachePart(options == null ? null : options.sgpServerId()),
                cachePart(options == null ? null : options.tag()),
                cachePart(puuid));
    }

    private String gameDetailCacheKey(Long gameId, MatchHistoryQueryOptions options, MatchHistorySource source) {
        return String.join("|",
                normalizeSource(source).name(),
                cachePart(options == null ? null : options.sgpServerId()),
                cachePart(options == null ? null : options.tag()),
                String.valueOf(gameId));
    }

    private String cachePart(String value) {
        return value == null || value.isBlank() ? "-" : value.trim();
    }

    private String formatSource(MatchHistorySource source) {
        return normalizeSource(source).name().toLowerCase(Locale.ROOT);
    }

    /**
     * Returns the cached raw fetch result for a player.
     */
    public MatchHistoryFetchResult getMatchHistoryFetchResult(String puuid) {
        return getMatchHistoryFetchResult(puuid, false, MatchHistorySource.AUTO);
    }

    /**
     * Returns the raw fetch result for a player, optionally bypassing the in-memory cache.
     */
    public MatchHistoryFetchResult getMatchHistoryFetchResult(String puuid, boolean forceRefresh) {
        return getMatchHistoryFetchResult(puuid, forceRefresh, MatchHistorySource.AUTO);
    }

    public MatchHistoryFetchResult getMatchHistoryFetchResult(String puuid, boolean forceRefresh, String source) {
        return getMatchHistoryFetchResult(puuid, forceRefresh, MatchHistorySource.fromRequest(source));
    }

    public MatchHistoryFetchResult getMatchHistoryFetchResult(String puuid,
                                                              boolean forceRefresh,
                                                              MatchHistorySource source) {
        return loadMatchHistory(puuid, forceRefresh, source).result();
    }

    private FetchedMatchHistory loadMatchHistory(String puuid, boolean forceRefresh, MatchHistorySource source) {
        MatchHistoryQueryOptions options = MatchHistoryQueryOptions.defaultFor(normalizeSource(source), forceRefresh);
        return loadMatchHistory(puuid, options);
    }

    private FetchedMatchHistory loadMatchHistory(String puuid, MatchHistoryQueryOptions options) {
        if (normalizeSource(options == null ? null : options.preferredSource()) == MatchHistorySource.CACHE) {
            return loadCachedMatchHistory(puuid, options);
        }

        ResolvedProvider resolvedProvider = resolveProvider(options);
        String cacheKey = matchHistoryCacheKey(puuid, options, resolvedProvider.source());

        if (options.forceRefresh()) {
            log.info("Force refreshing match history fetch result: puuid={}, source={}",
                    puuidPrefix(puuid), resolvedProvider.source());
            matchHistoryCache.invalidate(cacheKey);
            return fetchProviderMatchHistoryWithDatabaseFallback(puuid, options, resolvedProvider, cacheKey);
        }

        MatchHistoryFetchResult memoryResult = matchHistoryCache.getIfPresent(cacheKey);
        if (memoryResult != null && isCachedMatchHistoryCompleteForOptions(memoryResult, options)) {
            return new FetchedMatchHistory(memoryResult, resolvedProvider.source(), options);
        }

        Optional<MatchHistoryFetchResult> databaseResult = shouldReadDatabaseBeforeProvider(options, resolvedProvider.source())
                ? findCompleteCachedMatchHistory(puuid, resolvedProvider.source(), options)
                : Optional.empty();
        if (databaseResult.isPresent()) {
            matchHistoryCache.put(cacheKey, databaseResult.get());
            return new FetchedMatchHistory(databaseResult.get(), resolvedProvider.source(), options);
        }

        return fetchProviderMatchHistoryWithDatabaseFallback(puuid, options, resolvedProvider, cacheKey);
    }

    private FetchedMatchHistory loadCachedMatchHistory(String puuid, MatchHistoryQueryOptions options) {
        MatchHistoryQueryOptions safeOptions = options == null
                ? MatchHistoryQueryOptions.defaultFor(MatchHistorySource.CACHE, false)
                : options;
        String cacheKey = matchHistoryCacheKey(puuid, safeOptions, MatchHistorySource.CACHE);

        if (!safeOptions.forceRefresh()) {
            MatchHistoryFetchResult memoryResult = matchHistoryCache.getIfPresent(cacheKey);
            if (memoryResult != null && isCachedMatchHistoryCompleteForOptions(memoryResult, safeOptions)) {
                return new FetchedMatchHistory(memoryResult, MatchHistorySource.CACHE, safeOptions);
            }
        } else {
            matchHistoryCache.invalidate(cacheKey);
        }

        MatchHistoryFetchResult result = findCachedMatchHistory(puuid, MatchHistorySource.CACHE, safeOptions)
                .orElseGet(() -> MatchHistoryFetchResult.builder()
                        .matches(List.of())
                        .rawEmpty(true)
                        .build());
        matchHistoryCache.put(cacheKey, result);
        return new FetchedMatchHistory(result, MatchHistorySource.CACHE, safeOptions);
    }

    /**
     * Fetch visible match history.
     */
    public List<MatchHistory> getMatchHistory(String puuid, int begIndex, int endIndex) {
        return getMatchHistory(puuid, begIndex, endIndex, false, MatchHistorySource.AUTO);
    }

    /**
     * Fetch visible match history with an explicit provider fetch limit.
     * SGP is preferred so session analysis can scan beyond LCU's visible 20-row cap.
     */
    public List<MatchHistory> getMatchHistory(String puuid, int begIndex, int endIndex, int fetchLimit) {
        int normalizedFetchLimit = Math.max(1, Math.max(fetchLimit, endIndex + 1));
        return getMatchHistoryWithLimit(puuid, begIndex, endIndex, normalizedFetchLimit, MatchHistorySource.AUTO);
    }

    private List<MatchHistory> getMatchHistoryWithLimit(String puuid,
                                                        int begIndex,
                                                        int endIndex,
                                                        int fetchLimit,
                                                        MatchHistorySource source) {
        MatchHistoryQueryOptions queryOptions = MatchHistoryQueryOptions.forLimit(
                source,
                false,
                fetchLimit
        );
        FetchedMatchHistory fetched = loadMatchHistory(puuid, queryOptions);
        List<MatchHistory> matches = fetched.result().getMatches();
        List<MatchHistory> sliced = sliceMatches(matches, begIndex, endIndex);
        return ensureRosterForVisibleMatches(puuid, matches, sliced, fetched.source(), false);
    }

    /**
     * Fetch visible match history, optionally bypassing the in-memory cache.
     */
    public List<MatchHistory> getMatchHistory(String puuid, int begIndex, int endIndex, boolean forceRefresh) {
        return getMatchHistory(puuid, begIndex, endIndex, forceRefresh, MatchHistorySource.AUTO);
    }

    public List<MatchHistory> getMatchHistory(String puuid,
                                              int begIndex,
                                              int endIndex,
                                              boolean forceRefresh,
                                              String source) {
        return getMatchHistory(puuid, begIndex, endIndex, forceRefresh, MatchHistorySource.fromRequest(source));
    }

    public List<MatchHistory> getMatchHistory(String puuid,
                                              int begIndex,
                                              int endIndex,
                                              boolean forceRefresh,
                                              MatchHistorySource source) {
        if (forceRefresh) {
            log.info("Force refreshing match history request: puuid={}, begIndex={}, endIndex={}, source={}",
                    puuidPrefix(puuid), begIndex, endIndex, normalizeSource(source));
        }
        FetchedMatchHistory fetched = loadMatchHistory(puuid, forceRefresh, source);
        List<MatchHistory> matches = fetched.result().getMatches();
        List<MatchHistory> sliced = sliceMatches(matches, begIndex, endIndex);
        return ensureRosterForVisibleMatches(
                puuid,
                matches,
                sliced,
                fetched.source(),
                shouldHydrateVisibleMatchesFromDetail(source)
        );
    }

    /**
     * Resolve display status from the current fetch result and rank signal.
     */
    public RecordStatus resolveRecordStatus(MatchHistoryFetchResult fetchResult, Rank rank) {
        if (fetchResult == null) {
            return RecordStatus.ERROR;
        }
        if (!fetchResult.getMatches().isEmpty()) {
            return RecordStatus.NORMAL;
        }
        if (fetchResult.isRawEmpty() && hasRankEvidence(rank)) {
            return RecordStatus.PRIVATE;
        }
        return fetchResult.isRawEmpty() ? RecordStatus.EMPTY : RecordStatus.ERROR;
    }

    public MatchHistoryPageResponse getMatchHistoryPage(String puuid,
                                                        int page,
                                                        int pageSize,
                                                        String source,
                                                        Integer queueId,
                                                        Integer championId,
                                                        boolean forceRefresh,
                                                        Rank rank) {
        int normalizedPage = Math.max(1, page);
        int normalizedPageSize = normalizeMatchHistoryPageSize(pageSize);
        int begIndex = (normalizedPage - 1) * normalizedPageSize;
        int endIndex = begIndex + normalizedPageSize - 1;
        MatchHistorySource requestedSource = source == null || source.isBlank()
                ? MatchHistorySource.AUTO
                : MatchHistorySource.fromRequest(source);
        int fetchLimit = normalizeMatchHistoryFetchLimit(normalizedPage, normalizedPageSize, queueId, championId);

        MatchHistoryQueryOptions queryOptions = MatchHistoryQueryOptions.forLimit(
                requestedSource,
                forceRefresh,
                fetchLimit
        );
        FetchedMatchHistory fetched = loadMatchHistory(puuid, queryOptions);
        List<MatchHistory> allMatches = fetched.result().getMatches();
        List<MatchHistory> filteredMatches = filterMatches(allMatches, puuid, queueId, championId);
        List<MatchHistory> visibleMatches = filteredMatches.size() > MATCH_HISTORY_PAGE_LIMIT
                ? new ArrayList<>(filteredMatches.subList(0, MATCH_HISTORY_PAGE_LIMIT))
                : filteredMatches;
        List<MatchHistory> pageMatches = sliceMatches(visibleMatches, begIndex, endIndex);
        if (pageMatches.size() > normalizedPageSize) {
            pageMatches = new ArrayList<>(pageMatches.subList(0, normalizedPageSize));
        }
        if (shouldFallbackFromSgpPage(puuid, pageMatches, fetched.source())) {
            log.warn("SGP match-history page missing renderable current-player summaries: puuid={}, source={}",
                    puuidPrefix(puuid), requestedSource);
            Optional<MatchHistoryPageResponse> cachedFallback = getCachedMatchHistoryPage(
                    puuid,
                    normalizedPage,
                    normalizedPageSize,
                    queueId,
                    championId,
                    rank
            );
            if (cachedFallback.isPresent()) {
                return cachedFallback.get();
            }
        }
        pageMatches = ensureRosterForVisibleMatches(puuid, allMatches, pageMatches, fetched.source(), false);

        return MatchHistoryPageResponse.builder()
                .matches(pageMatches)
                .page(normalizedPage)
                .pageSize(normalizedPageSize)
                .hasNext(endIndex + 1 < visibleMatches.size())
                .source(formatSource(fetched.source()))
                .recordStatus(resolveRecordStatus(fetched.result(), rank))
                .sgpServerId(fetched.options().sgpServerId())
                .build();
    }

    private void scheduleSgpTimelineBackfill(List<MatchHistory> pageMatches, FetchedMatchHistory fetched) {
        if (fetched == null || fetched.source() != MatchHistorySource.SGP
                || cacheRepository == null || pageMatches == null || pageMatches.isEmpty()) {
            return;
        }

        MatchHistoryProvider sgpProvider = matchHistoryProviders.get(MatchHistorySource.SGP);
        if (sgpProvider == null) {
            return;
        }

        pageMatches.stream()
                .filter(match -> match != null && match.getGameId() != null)
                .filter(match -> needsSgpTimelineBackfill(match.getGameId()))
                .limit(SGP_TIMELINE_BACKFILL_PER_PAGE)
                .forEach(match -> submitSgpTimelineBackfill(sgpProvider, match.getGameId(), fetched.options()));
    }

    private boolean needsSgpTimelineBackfill(Long gameId) {
        if (gameId == null || cacheRepository == null) {
            return false;
        }

        Optional<MatchDataScopeCache> scope = cacheRepository.findMatchDataScope(gameId);
        if (scope.isEmpty()) {
            return true;
        }

        MatchDataScopeCache cachedScope = scope.get();
        return !isTerminalSgpBackfillStatus(cachedScope.getDetailStatus())
                || !isTerminalSgpBackfillStatus(cachedScope.getTimelineStatus());
    }

    private boolean isTerminalSgpBackfillStatus(String status) {
        if (status == null || status.isBlank()) {
            return false;
        }
        return switch (status.toUpperCase(Locale.ROOT)) {
            case "FETCHED", "EMPTY", "FAILED" -> true;
            default -> false;
        };
    }

    private void submitSgpTimelineBackfill(MatchHistoryProvider sgpProvider,
                                           Long gameId,
                                           MatchHistoryQueryOptions options) {
        if (!SGP_TIMELINE_BACKFILL_IN_FLIGHT.add(gameId)) {
            return;
        }

        try {
            sgpBackfillExecutor.execute(() -> {
                try {
                    MatchTimelineFetchResult result = sgpProvider.fetchGameTimeline(gameId, options);
                    String status = result == null || result.getStatus() == null ? "UNKNOWN" : result.getStatus();
                    String lastError = result == null ? null : result.getLastError();
                    cacheRepository.saveSgpRawDetail(
                            gameId,
                            result == null ? null : result.getRawDetailJson(),
                            status,
                            lastError
                    );
                    cacheRepository.saveSgpTimeline(
                            gameId,
                            result == null ? null : result.getTimeline(),
                            result == null ? null : result.getRawTimelineJson(),
                            status,
                            lastError
                    );
                } catch (Exception e) {
                    log.warn("SGP timeline backfill failed: gameId={}, error={}", gameId, e.getMessage());
                    log.debug("SGP timeline backfill failure details", e);
                    cacheRepository.saveSgpRawDetail(gameId, null, "FAILED", e.getMessage());
                    cacheRepository.saveSgpTimeline(gameId, null, null, "FAILED", e.getMessage());
                } finally {
                    SGP_TIMELINE_BACKFILL_IN_FLIGHT.remove(gameId);
                }
            });
        } catch (RejectedExecutionException e) {
            SGP_TIMELINE_BACKFILL_IN_FLIGHT.remove(gameId);
            log.warn("SGP timeline backfill queue is full, skipping gameId={}", gameId);
            log.debug("SGP timeline backfill rejected", e);
        }
    }

    private boolean shouldFallbackFromSgpPage(String puuid, List<MatchHistory> pageMatches, MatchHistorySource source) {
        return source == MatchHistorySource.SGP
                && pageMatches != null
                && !pageMatches.isEmpty()
                && pageMatches.stream().anyMatch(match -> !hasRenderableCurrentParticipant(match, puuid));
    }

    private Optional<MatchHistoryPageResponse> getCachedMatchHistoryPage(String puuid,
                                                                         int page,
                                                                         int pageSize,
                                                                         Integer queueId,
                                                                         Integer championId,
                                                                         Rank rank) {
        if (cacheRepository == null) {
            return Optional.empty();
        }

        MatchHistoryPageResponse response = getMatchHistoryPage(
                puuid,
                page,
                pageSize,
                "cache",
                queueId,
                championId,
                false,
                rank
        );
        return response.getMatches() == null || response.getMatches().isEmpty()
                ? Optional.empty()
                : Optional.of(response);
    }

    private int normalizeMatchHistoryPageSize(int pageSize) {
        if (pageSize <= 0) {
            return DEFAULT_MATCH_HISTORY_PAGE_SIZE;
        }
        return Math.min(pageSize, MATCH_HISTORY_PAGE_LIMIT);
    }

    private int normalizeMatchHistoryFetchLimit(int page, int pageSize) {
        long requestedRows = (long) Math.max(1, page) * Math.max(1, pageSize);
        long rowsWithLookahead = requestedRows + 1;
        return (int) Math.min(MATCH_HISTORY_PAGE_LIMIT, rowsWithLookahead);
    }

    private int normalizeMatchHistoryFetchLimit(int page,
                                                int pageSize,
                                                Integer queueId,
                                                Integer championId) {
        if (hasMatchHistoryFilters(queueId, championId)) {
            return MATCH_HISTORY_PAGE_LIMIT;
        }
        return normalizeMatchHistoryFetchLimit(page, pageSize);
    }

    private boolean hasMatchHistoryFilters(Integer queueId, Integer championId) {
        return (queueId != null && queueId > 0) || (championId != null && championId > 0);
    }

    private FetchedMatchHistory fetchProviderMatchHistoryWithDatabaseFallback(String puuid,
                                                                             MatchHistoryQueryOptions options,
                                                                             ResolvedProvider resolvedProvider,
                                                                             String cacheKey) {
        int maxAttempts = maxProviderMatchHistoryAttempts(resolvedProvider.source());
        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                MatchHistoryFetchResult result = resolvedProvider.provider().fetchMatchHistory(puuid, options);
                if (shouldRejectSgpForceRefreshResult(puuid, options, resolvedProvider.source(), result)) {
                    throw new IllegalStateException("SGP summary missing renderable current-player data");
                }
                saveProviderMatchHistoryToLocalCache(puuid, result, resolvedProvider.source());
                MatchHistoryFetchResult cacheableResult = withoutRawSummaryJson(result);
                matchHistoryCache.put(cacheKey, cacheableResult);
                return new FetchedMatchHistory(cacheableResult, resolvedProvider.source(), options);
            } catch (Exception e) {
                if (attempt < maxAttempts) {
                    log.warn("Retrying match history fetch from {}: puuid={}, attempt={}/{}, error={}",
                            resolvedProvider.source(),
                            puuidPrefix(puuid),
                            attempt + 1,
                            maxAttempts,
                            e.getMessage());
                    continue;
                }

                log.warn("Failed to fetch match history from {}, puuid={}, attempts={}, error={}",
                        resolvedProvider.source(), puuidPrefix(puuid), maxAttempts, e.getMessage());
                log.debug("{} match-history failure details", resolvedProvider.source(), e);
                if (usesDatabaseCache(resolvedProvider.source()) && cacheRepository != null) {
                    cacheRepository.updatePlayerFetchState(puuid, List.of(), "ERROR", e.getMessage());
                }
                Optional<MatchHistoryFetchResult> fallback =
                        findCachedMatchHistory(puuid, resolvedProvider.source(), options);
                if (fallback.isPresent()) {
                    MatchHistoryQueryOptions cacheOptions = withPreferredSource(options, MatchHistorySource.CACHE);
                    String fallbackCacheKey = matchHistoryCacheKey(puuid, cacheOptions, MatchHistorySource.CACHE);
                    matchHistoryCache.put(fallbackCacheKey, fallback.get());
                    return new FetchedMatchHistory(fallback.get(), MatchHistorySource.CACHE, cacheOptions);
                }
                throw propagateMatchHistoryFailure(e);
            }
        }
        throw new IllegalStateException("Match-history provider failed without an exception");
    }

    private RuntimeException propagateMatchHistoryFailure(Exception e) {
        if (e instanceof RuntimeException runtimeException) {
            return runtimeException;
        }
        return new IllegalStateException(e.getMessage(), e);
    }

    private int maxProviderMatchHistoryAttempts(MatchHistorySource source) {
        return source == MatchHistorySource.SGP ? SGP_MATCH_HISTORY_MAX_ATTEMPTS : 1;
    }

    private MatchHistoryFetchResult withoutRawSummaryJson(MatchHistoryFetchResult result) {
        if (result == null) {
            return MatchHistoryFetchResult.builder()
                    .rawEmpty(true)
                    .build();
        }
        return MatchHistoryFetchResult.builder()
                .matches(result.getMatches())
                .rawEmpty(result.isRawEmpty())
                .build();
    }

    private boolean shouldRejectSgpForceRefreshResult(String puuid,
                                                      MatchHistoryQueryOptions options,
                                                      MatchHistorySource source,
                                                      MatchHistoryFetchResult result) {
        if (source != MatchHistorySource.SGP || options == null || !options.forceRefresh()
                || result == null || result.getMatches() == null || result.getMatches().isEmpty()) {
            return false;
        }

        int expectedVisibleRows = expectedVisibleRowsForQualityCheck(options, result.getMatches().size());
        if (result.getMatches().stream()
                .limit(expectedVisibleRows)
                .anyMatch(match -> !hasRenderableCurrentParticipant(match, puuid))) {
            return true;
        }

        return shouldRejectSparseSgpForceRefreshResult(puuid, options, result.getMatches());
    }

    private boolean shouldRejectSparseSgpForceRefreshResult(String puuid,
                                                            MatchHistoryQueryOptions options,
                                                            List<MatchHistory> matches) {
        if (matches == null || matches.size() >= MIN_TRUSTED_SGP_FORCE_REFRESH_ROWS
                || hasMatchHistoryFilters(options)) {
            return false;
        }

        boolean onlyShortOrRemake = matches.size() == 1 && isShortOrRemakeMatch(matches.getFirst());
        if (onlyShortOrRemake) {
            return true;
        }

        return hasMoreTrustedCachedMatchHistory(puuid, options, matches.size());
    }

    private boolean hasMatchHistoryFilters(MatchHistoryQueryOptions options) {
        return options != null
                && ((options.queueId() != null && options.queueId() > 0)
                || (options.championId() != null && options.championId() > 0));
    }

    private boolean isShortOrRemakeMatch(MatchHistory match) {
        if (match == null) {
            return false;
        }
        if (Boolean.TRUE.equals(match.getRemake())) {
            return true;
        }
        return match.getGameDuration() != null
                && match.getGameDuration() > 0
                && match.getGameDuration() < REMAKE_MAX_GAME_DURATION_SECONDS;
    }

    private boolean hasMoreTrustedCachedMatchHistory(String puuid,
                                                     MatchHistoryQueryOptions options,
                                                     int remoteMatchCount) {
        if (cacheRepository == null) {
            return false;
        }
        try {
            Optional<MatchHistoryFetchResult> cached = cacheRepository.findRecentMatchHistory(
                    puuid,
                    cacheLookupLimit(options)
            );
            if (cached.isEmpty() || cached.get().getMatches() == null) {
                return false;
            }
            long renderableCachedCount = cached.get().getMatches().stream()
                    .filter(match -> hasRenderableCurrentParticipant(match, puuid))
                    .count();
            return renderableCachedCount > remoteMatchCount;
        } catch (Exception e) {
            log.debug("Failed to inspect cached match history for SGP force-refresh quality gate, puuid={}",
                    puuidPrefix(puuid), e);
            return false;
        }
    }

    private int expectedVisibleRowsForQualityCheck(MatchHistoryQueryOptions options, int matchCount) {
        int requestedRows = options.maxResults() == null || options.maxResults() <= 1
                ? DEFAULT_MATCH_HISTORY_PAGE_SIZE
                : options.maxResults() - 1;
        return Math.max(1, Math.min(matchCount, requestedRows));
    }

    private Optional<MatchHistoryFetchResult> findCachedMatchHistory(String puuid, MatchHistorySource source) {
        return findCachedMatchHistory(puuid, source, null);
    }

    private Optional<MatchHistoryFetchResult> findCachedMatchHistory(String puuid,
                                                                    MatchHistorySource source,
                                                                    MatchHistoryQueryOptions options) {
        if (!usesDatabaseCache(source) || cacheRepository == null) {
            return Optional.empty();
        }
        return cacheRepository.findRecentMatchHistory(puuid, cacheLookupLimit(options));
    }

    private Optional<MatchHistoryFetchResult> findCompleteCachedMatchHistory(String puuid,
                                                                            MatchHistorySource source,
                                                                            MatchHistoryQueryOptions options) {
        Optional<MatchHistoryFetchResult> cached = findCachedMatchHistory(puuid, source, options);
        if (cached.isEmpty() || isCachedMatchHistoryCompleteForOptions(cached.get(), options)) {
            return cached;
        }

        log.info("Ignoring partial match-history cache before provider fetch: puuid={}, cachedRows={}, requestedRows={}",
                puuidPrefix(puuid),
                cachedMatchCount(cached.get()),
                cacheLookupLimit(options));
        return Optional.empty();
    }

    private boolean isCachedMatchHistoryCompleteForOptions(MatchHistoryFetchResult result,
                                                           MatchHistoryQueryOptions options) {
        if (result == null) {
            return false;
        }
        if (result.isRawEmpty()) {
            return true;
        }
        List<MatchHistory> matches = result.getMatches();
        return matches != null && matches.size() >= requiredCachedRowsForOptions(options);
    }

    private int cachedMatchCount(MatchHistoryFetchResult result) {
        return result == null || result.getMatches() == null ? 0 : result.getMatches().size();
    }

    private int requiredCachedRowsForOptions(MatchHistoryQueryOptions options) {
        int lookupLimit = cacheLookupLimit(options);
        return Math.max(1, lookupLimit - 1);
    }

    private int cacheLookupLimit(MatchHistoryQueryOptions options) {
        if (options == null || options.maxResults() == null || options.maxResults() <= 0) {
            return VISIBLE_MATCH_HISTORY_LIMIT;
        }
        return Math.min(MATCH_HISTORY_PAGE_LIMIT, options.maxResults());
    }

    private void saveMatchHistoryToLocalCache(String puuid, List<MatchHistory> matches, MatchHistorySource source) {
        if (usesDatabaseCache(source) && cacheRepository != null && matches != null && !matches.isEmpty()) {
            cacheRepository.saveMatchHistory(puuid, matches);
        }
    }

    private void saveProviderMatchHistoryToLocalCache(String puuid,
                                                      MatchHistoryFetchResult result,
                                                      MatchHistorySource source) {
        List<MatchHistory> matches = result == null ? null : result.getMatches();
        if (source != MatchHistorySource.SGP) {
            saveMatchHistoryToLocalCache(puuid, matches, source);
            return;
        }
        if (!usesDatabaseCache(source) || cacheRepository == null || matches == null) {
            return;
        }

        List<MatchHistory> snapshot = filterRenderableCurrentPlayerMatches(puuid, matches);
        if (snapshot.size() < matches.size()) {
            log.info("Filtered incomplete SGP match history rows before async local cache save: puuid={}, filtered={}, kept={}",
                    puuidPrefix(puuid), matches.size() - snapshot.size(), snapshot.size());
        }
        if (snapshot.isEmpty()) {
            return;
        }
        if (!MATCH_HISTORY_CACHE_WRITE_IN_FLIGHT.add(puuid)) {
            log.debug("Skipping duplicate SGP match history cache write while previous write is in flight: puuid={}, matches={}",
                    puuidPrefix(puuid), snapshot.size());
            return;
        }
        try {
            cacheWriteExecutor.execute(() -> {
                try {
                    if (!snapshot.isEmpty()) {
                        cacheRepository.saveMatchHistory(puuid, snapshot);
                    }
                } catch (Exception e) {
                    log.warn("Failed to write SGP match history cache asynchronously: puuid={}, matches={}, error={}",
                            puuidPrefix(puuid), snapshot.size(), e.getMessage());
                    log.debug("SGP async match-history cache write failure details", e);
                } finally {
                    MATCH_HISTORY_CACHE_WRITE_IN_FLIGHT.remove(puuid);
                }
            });
        } catch (RejectedExecutionException e) {
            MATCH_HISTORY_CACHE_WRITE_IN_FLIGHT.remove(puuid);
            log.warn("SGP match history cache write queue is full, skipping async save: puuid={}, matches={}",
                    puuidPrefix(puuid), snapshot.size());
            log.debug("SGP async match-history cache write rejected", e);
        }
    }

    private List<MatchHistory> filterRenderableCurrentPlayerMatches(String puuid, List<MatchHistory> matches) {
        if (matches == null || matches.isEmpty()) {
            return List.of();
        }
        return matches.stream()
                .filter(match -> hasRenderableCurrentParticipant(match, puuid))
                .toList();
    }

    private List<MatchHistory> sliceMatches(List<MatchHistory> matches, int begIndex, int endIndex) {
        if (matches == null || matches.isEmpty()) {
            return List.of();
        }

        int beg = Math.max(0, begIndex);
        int end = Math.min(endIndex + 1, matches.size());
        if (beg >= end) {
            return List.of();
        }

        return new ArrayList<>(matches.subList(beg, end));
    }

    private boolean hasRankEvidence(Rank rank) {
        if (rank == null || rank.getQueueMap() == null) {
            return false;
        }
        return hasGames(rank.getQueueMap().getRankedSolo5x5()) || hasGames(rank.getQueueMap().getRankedFlexSr());
    }

    private boolean hasGames(Rank.QueueInfo queueInfo) {
        if (queueInfo == null) {
            return false;
        }
        Integer totalGames = queueInfo.getTotalGames();
        if (totalGames != null && totalGames > 0) {
            return true;
        }
        if (queueInfo.getTier() != null && !"UNRANKED".equalsIgnoreCase(queueInfo.getTier())) {
            return true;
        }
        return queueInfo.getHighestTier() != null && !queueInfo.getHighestTier().isBlank();
    }

    /**
     * Fetch one game timeline.
     */
    public MatchTimelineFetchResult getGameTimelineById(Long gameId) {
        return getGameTimelineById(gameId, MatchHistorySource.AUTO);
    }

    public MatchTimelineFetchResult getGameTimelineById(Long gameId, String source) {
        return getGameTimelineById(gameId, source, null);
    }

    public MatchTimelineFetchResult getGameTimelineById(Long gameId, String source, String sgpServerId) {
        return getGameTimelineById(gameId, MatchHistorySource.fromRequest(source), sgpServerId);
    }

    public MatchTimelineFetchResult getGameTimelineById(Long gameId, MatchHistorySource source) {
        return getGameTimelineById(gameId, source, null);
    }

    public MatchTimelineFetchResult getGameTimelineById(Long gameId, MatchHistorySource source, String sgpServerId) {
        MatchHistoryQueryOptions options = withSgpServerId(
                MatchHistoryQueryOptions.defaultFor(normalizeSource(source), false),
                sgpServerId
        );
        Optional<MatchTimelineFetchResult> cachedTimeline = loadCachedGameTimeline(gameId);
        if (cachedTimeline.isPresent() && shouldUseCachedGameTimeline(cachedTimeline.get(), options)) {
            return cachedTimeline.get();
        }
        if (normalizeSource(options.preferredSource()) == MatchHistorySource.CACHE) {
            return unavailableTimelineResult(gameId, "Timeline is not available in cache");
        }

        ResolvedProvider resolvedProvider;
        try {
            resolvedProvider = resolveProvider(options);
        } catch (Exception e) {
            log.warn("Timeline provider is unavailable, gameId={}, error={}", gameId, e.getMessage());
            return unavailableTimelineResult(gameId, e.getMessage());
        }

        try {
            MatchTimelineFetchResult result = resolvedProvider.provider().fetchGameTimeline(gameId, options);
            result = normalizeTimelineFetchResult(gameId, result);
            if (resolvedProvider.source() == MatchHistorySource.SGP && cacheRepository != null) {
                cacheRepository.saveSgpRawDetail(
                        gameId,
                        result.getRawDetailJson(),
                        result.getStatus(),
                        result.getLastError()
                );
                cacheRepository.saveSgpTimeline(
                        gameId,
                        result.getTimeline(),
                        result.getRawTimelineJson(),
                        result.getStatus(),
                        result.getLastError()
                );
            }
            return result;
        } catch (Exception e) {
            log.warn("Failed to fetch game timeline from {}, gameId={}, error={}",
                    resolvedProvider.source(), gameId, e.getMessage());
            log.debug("{} game-timeline failure details", resolvedProvider.source(), e);
            if (isAutoSgpAttempt(options, resolvedProvider.source())) {
                return getGameTimelineById(gameId, MatchHistorySource.LCU);
            }
            return unavailableTimelineResult(gameId, e.getMessage());
        }
    }

    private Optional<MatchTimelineFetchResult> loadCachedGameTimeline(Long gameId) {
        if (gameId == null || cacheRepository == null) {
            return Optional.empty();
        }

        return cacheRepository.findMatchDataScope(gameId)
                .filter(scope -> isTerminalSgpBackfillStatus(scope.getTimelineStatus()))
                .map(scope -> MatchTimelineFetchResult.builder()
                        .gameId(scope.getGameId() == null ? gameId : scope.getGameId())
                        .timeline(scope.getTimeline())
                        .rawDetailJson(scope.getRawDetailJson())
                        .rawTimelineJson(scope.getRawTimelineJson())
                        .status(scope.getTimelineStatus())
                        .lastError(scope.getLastError())
                        .build());
    }

    private boolean shouldUseCachedGameTimeline(MatchTimelineFetchResult cachedTimeline,
                                                MatchHistoryQueryOptions options) {
        if (cachedTimeline == null) {
            return false;
        }
        String sgpServerId = options == null ? null : options.sgpServerId();
        if (sgpServerId == null || sgpServerId.isBlank()) {
            return true;
        }
        return "FETCHED".equalsIgnoreCase(cachedTimeline.getStatus()) && hasTimelineFrames(cachedTimeline);
    }

    private MatchTimelineFetchResult normalizeTimelineFetchResult(Long gameId, MatchTimelineFetchResult result) {
        if (result == null) {
            return unavailableTimelineResult(gameId, "Timeline provider returned no result");
        }
        if (result.getGameId() == null) {
            result.setGameId(gameId);
        }
        if (result.getStatus() == null || result.getStatus().isBlank()) {
            result.setStatus(hasTimelineFrames(result) ? "FETCHED" : "EMPTY");
        }
        return result;
    }

    private boolean hasTimelineFrames(MatchTimelineFetchResult result) {
        return result != null
                && result.getTimeline() != null
                && result.getTimeline().getFrames() != null
                && !result.getTimeline().getFrames().isEmpty();
    }

    private MatchTimelineFetchResult unavailableTimelineResult(Long gameId, String lastError) {
        return MatchTimelineFetchResult.builder()
                .gameId(gameId)
                .status("UNAVAILABLE")
                .lastError(lastError)
                .build();
    }

    /**
     * Fetch one game detail.
     */
    public GameDetail getGameDetailById(Long gameId) {
        return getGameDetailById(gameId, MatchHistorySource.AUTO);
    }

    public GameDetail getGameDetailById(Long gameId, String source) {
        return getGameDetailById(gameId, MatchHistorySource.fromRequest(source));
    }

    public GameDetail getGameDetailById(Long gameId, MatchHistorySource source) {
        return getGameDetailById(gameId, source, false);
    }

    public GameDetail getGameDetailById(Long gameId, String source, boolean sgpOnly) {
        return getGameDetailById(gameId, source, sgpOnly, null);
    }

    public GameDetail getGameDetailById(Long gameId, String source, boolean sgpOnly, String sgpServerId) {
        return getGameDetailById(gameId, MatchHistorySource.fromRequest(source), sgpOnly, sgpServerId);
    }

    public GameDetail getGameDetailById(Long gameId, MatchHistorySource source, boolean sgpOnly) {
        return getGameDetailById(gameId, source, sgpOnly, null);
    }

    public GameDetail getGameDetailById(Long gameId, MatchHistorySource source, boolean sgpOnly, String sgpServerId) {
        MatchHistorySource requestedSource = sgpOnly ? MatchHistorySource.SGP : normalizeSource(source);
        MatchHistoryQueryOptions options = withSgpServerId(
                MatchHistoryQueryOptions.defaultFor(requestedSource, false),
                sgpServerId
        );
        if (normalizeSource(options.preferredSource()) == MatchHistorySource.CACHE) {
            return loadCachedGameDetail(gameId).orElse(null);
        }

        ResolvedProvider resolvedProvider = resolveProvider(options);
        String cacheKey = gameDetailCacheKey(gameId, options, resolvedProvider.source());

        GameDetail memoryDetail = gameDetailCache.getIfPresent(cacheKey);
        if (shouldUseCachedGameDetail(memoryDetail, options, resolvedProvider.source())) {
            return memoryDetail;
        }
        if (memoryDetail != null) {
            gameDetailCache.invalidate(cacheKey);
        }

        Optional<GameDetail> databaseDetail = shouldReadGameDetailDatabaseBeforeProvider(options, resolvedProvider.source())
                ? loadCachedGameDetail(gameId)
                : Optional.empty();
        if (databaseDetail.isPresent()) {
            GameDetail detail = databaseDetail.get();
            if (shouldUseCachedGameDetail(detail, options, resolvedProvider.source())) {
                gameDetailCache.put(cacheKey, detail);
                return detail;
            }
        }

        try {
            GameDetail detail = resolvedProvider.provider().fetchGameDetail(gameId, options);
            if (!sgpOnly) {
                detail = hydrateSgpDetailParticipantsFromLcu(gameId, detail, resolvedProvider.source());
            }
            if (!isRenderableGameDetail(detail)) {
                throw new IllegalStateException("Game detail missing renderable participant stats");
            }
            enrichParticipantStats(detail);
            detail = attachSummonerNamesToDetail(detail);
            hydrateObjectiveEventActors(detail);
            if (!sgpOnly && isAutoSgpAttempt(options, resolvedProvider.source())) {
                detail = mergeLcuObjectiveFallback(gameId, detail);
            }
            if (resolvedProvider.source() == MatchHistorySource.SGP) {
                detail = hydrateTurretPlateObjectivesFromTimeline(gameId, detail, options.sgpServerId());
            }
            if (usesDatabaseCache(resolvedProvider.source()) && cacheRepository != null) {
                cacheRepository.saveGameDetail(detail);
            }
            gameDetailCache.put(cacheKey, detail);
            return detail;
        } catch (Exception e) {
            log.warn("Failed to fetch game detail from {}, gameId={}, error={}",
                    resolvedProvider.source(), gameId, e.getMessage());
            log.debug("{} game-detail failure details", resolvedProvider.source(), e);
            // An explicit SGP request stays strict: it must never be answered with cached or LCU-derived
            // data (see getGameDetailById_sourceSgpDoesNotFallbackToLcuOrCacheWhenProviderFails).
            if (isExplicitSgpAttempt(options, resolvedProvider.source())) {
                throw e;
            }
            Optional<GameDetail> fallback = loadCachedGameDetail(gameId);
            if (fallback.isPresent() && shouldUseCachedGameDetail(fallback.get(), options, resolvedProvider.source())) {
                GameDetail detail = fallback.get();
                gameDetailCache.put(cacheKey, detail);
                return detail;
            }
            if (isAutoSgpAttempt(options, resolvedProvider.source())) {
                log.warn("SGP game detail failed in auto mode, falling back to LCU: gameId={}", gameId);
                return getGameDetailById(gameId, MatchHistorySource.LCU);
            }
            if (fallback.isPresent()) {
                GameDetail detail = fallback.get();
                gameDetailCache.put(cacheKey, detail);
                return detail;
            }
            throw e;
        }
    }

    private GameDetail hydrateSgpDetailParticipantsFromLcu(Long gameId,
                                                           GameDetail detail,
                                                           MatchHistorySource resolvedSource) {
        if (isRenderableGameDetail(detail) || resolvedSource != MatchHistorySource.SGP || !hasTeamObjectives(detail)) {
            return detail;
        }
        MatchHistoryProvider lcuProvider = matchHistoryProviders.get(MatchHistorySource.LCU);
        if (lcuProvider == null) {
            return detail;
        }

        try {
            GameDetail lcuDetail = lcuProvider.fetchGameDetail(
                    gameId,
                    MatchHistoryQueryOptions.defaultFor(MatchHistorySource.LCU, false)
            );
            if (!isRenderableGameDetail(lcuDetail)) {
                return detail;
            }
            hydrateRenderableFields(detail, lcuDetail);
            hydrateObjectiveEventActors(detail);
            mergeLcuFallbackObjectiveDetails(detail, lcuDetail);
        } catch (Exception lcuError) {
            log.warn("LCU participant backfill for SGP game detail failed: gameId={}, error={}",
                    gameId, lcuError.getMessage());
            log.debug("LCU participant backfill failure details", lcuError);
        }
        return detail;
    }

    private void hydrateRenderableFields(GameDetail target, GameDetail source) {
        if (target == null || source == null) {
            return;
        }
        if (target.getGameId() == null) {
            target.setGameId(source.getGameId());
        }
        if (target.getGameMode() == null || target.getGameMode().isBlank()) {
            target.setGameMode(source.getGameMode());
        }
        if (target.getGameType() == null || target.getGameType().isBlank()) {
            target.setGameType(source.getGameType());
        }
        if (target.getMapId() == null) {
            target.setMapId(source.getMapId());
        }
        if (target.getQueueId() == null) {
            target.setQueueId(source.getQueueId());
        }
        if (target.getGameDuration() == null) {
            target.setGameDuration(source.getGameDuration());
        }
        if (target.getGameCreation() == null) {
            target.setGameCreation(source.getGameCreation());
        }
        target.setParticipantIdentities(source.getParticipantIdentities());
        target.setParticipants(source.getParticipants());
    }

    private void hydrateObjectiveEventActors(GameDetail detail) {
        if (detail == null
                || detail.getParticipants() == null
                || detail.getParticipants().isEmpty()
                || detail.getTeamObjectives() == null
                || detail.getTeamObjectives().isEmpty()) {
            return;
        }

        Map<Integer, GameDetail.GameParticipant> participantById = new HashMap<>();
        for (GameDetail.GameParticipant participant : detail.getParticipants()) {
            if (participant == null || participant.getParticipantId() == null) {
                continue;
            }
            participantById.put(participant.getParticipantId(), participant);
        }
        if (participantById.isEmpty()) {
            return;
        }

        for (GameDetail.TeamObjectiveSummary summary : detail.getTeamObjectives()) {
            if (summary == null || summary.getObjectiveEvents() == null || summary.getObjectiveEvents().isEmpty()) {
                continue;
            }
            for (GameDetail.TeamObjectiveEvent event : summary.getObjectiveEvents()) {
                hydrateObjectiveEventActor(summary, event, participantById);
            }
        }
    }

    private void hydrateObjectiveEventActor(
            GameDetail.TeamObjectiveSummary summary,
            GameDetail.TeamObjectiveEvent event,
            Map<Integer, GameDetail.GameParticipant> participantById
    ) {
        if (event == null || event.getParticipantId() == null) {
            return;
        }
        GameDetail.GameParticipant actor = participantById.get(event.getParticipantId());
        if (actor == null || actor.getParticipantId() == null) {
            return;
        }
        if (actor.getTeamId() != null && event.getTeamId() != null && !actor.getTeamId().equals(event.getTeamId())) {
            return;
        }
        if (actor.getTeamId() != null && summary.getTeamId() != null && !actor.getTeamId().equals(summary.getTeamId())) {
            return;
        }
        if (event.getTeamId() == null && actor.getTeamId() != null) {
            event.setTeamId(actor.getTeamId());
        }
        if ((event.getChampionId() == null || event.getChampionId() <= 0)
                && actor.getChampionId() != null
                && actor.getChampionId() > 0) {
            event.setChampionId(actor.getChampionId());
        }
    }

    private void mergeLcuFallbackObjectiveDetails(GameDetail target, GameDetail source) {
        if (target == null || source == null || !hasTeamObjectives(source)) {
            return;
        }
        List<GameDetail.TeamObjectiveSummary> fallbackSummaries = source.getTeamObjectives().stream()
                .map(this::toLcuFallbackObjectiveSummary)
                .filter(summary -> summary != null && summary.hasData())
                .toList();
        if (fallbackSummaries.isEmpty()) {
            return;
        }
        if (!hasTeamObjectives(target)) {
            target.setTeamObjectives(fallbackSummaries);
            return;
        }
        target.setTeamObjectives(mergeLcuFallbackObjectiveDetails(
                target.getTeamObjectives(),
                fallbackSummaries
        ));
    }

    private boolean shouldUseCachedGameDetail(GameDetail detail,
                                              MatchHistoryQueryOptions options,
                                              MatchHistorySource resolvedSource) {
        return isRenderableGameDetail(detail) && hasCompleteRankedObjectiveDetails(detail, options, resolvedSource);
    }

    private boolean hasCompleteRankedObjectiveDetails(GameDetail detail,
                                                      MatchHistoryQueryOptions options,
                                                      MatchHistorySource resolvedSource) {
        if (detail == null) {
            return false;
        }
        MatchHistorySource preferredSource = normalizeSource(options == null ? null : options.preferredSource());
        MatchHistorySource effectiveSource = preferredSource == MatchHistorySource.AUTO
                ? normalizeSource(resolvedSource)
                : preferredSource;
        if (effectiveSource == MatchHistorySource.CACHE) {
            return true;
        }
        if (!QueueType.isRanked(detail.getQueueId())) {
            return true;
        }
        if (!hasTeamObjectives(detail)) {
            return false;
        }
        if (effectiveSource == MatchHistorySource.LCU) {
            return true;
        }
        if (hasMissingFallbackObjectiveFields(detail)) {
            return false;
        }
        if (isRankedSummonersRiftDetail(detail) && hasMissingTurretPlateObjectiveFields(detail)) {
            return false;
        }
        if (isRankedSummonersRiftDetail(detail) && hasMissingTurretPlateEventDetails(detail)) {
            return false;
        }
        return hasTypedDragonDetailsWhenDragonsWereKilled(detail);
    }

    private boolean isRankedSummonersRiftDetail(GameDetail detail) {
        return detail != null
                && QueueType.isRanked(detail.getQueueId())
                && Integer.valueOf(SUMMONERS_RIFT_MAP_ID).equals(detail.getMapId());
    }

    private boolean hasTeamObjectives(GameDetail detail) {
        return detail != null && detail.getTeamObjectives() != null && !detail.getTeamObjectives().isEmpty();
    }

    private boolean hasMissingFallbackObjectiveFields(GameDetail detail) {
        if (!hasTeamObjectives(detail)) {
            return true;
        }
        return detail.getTeamObjectives().stream().anyMatch(summary ->
                summary == null
                        || summary.getTeamId() == null
                        || summary.getBans() == null
                        || summary.getBans().isEmpty()
                        || summary.getHeraldKills() == null
                        || summary.getVoidGrubKills() == null
        );
    }

    private boolean hasMissingTurretPlateObjectiveFields(GameDetail detail) {
        if (!hasTeamObjectives(detail)) {
            return true;
        }
        return detail.getTeamObjectives().stream().anyMatch(summary ->
                summary == null
                        || summary.getTeamId() == null
                        || summary.getTurretPlateKills() == null
        );
    }

    private boolean hasMissingTurretPlateEventDetails(GameDetail detail) {
        if (!hasTeamObjectives(detail)) {
            return true;
        }
        int turretPlateKills = detail.getTeamObjectives().stream()
                .filter(summary -> summary != null)
                .mapToInt(summary -> Math.max(0, summary.getTurretPlateKills() == null ? 0 : summary.getTurretPlateKills()))
                .sum();
        if (turretPlateKills <= 0) {
            return false;
        }
        return detail.getTeamObjectives().stream()
                .filter(summary -> summary != null && summary.getObjectiveEvents() != null)
                .flatMap(summary -> summary.getObjectiveEvents().stream())
                .noneMatch(event -> event != null && "turretPlate".equals(event.getKind()));
    }

    private boolean hasTypedDragonDetailsWhenDragonsWereKilled(GameDetail detail) {
        if (!hasTeamObjectives(detail)) {
            return false;
        }
        int dragonKills = detail.getTeamObjectives().stream()
                .filter(summary -> summary != null)
                .mapToInt(summary -> Math.max(0, summary.getDragonKills() == null ? 0 : summary.getDragonKills()))
                .sum();
        if (dragonKills <= 0) {
            return true;
        }
        int typedDragonKills = detail.getTeamObjectives().stream()
                .filter(summary -> summary != null && summary.getDragonKillsByType() != null)
                .flatMap(summary -> summary.getDragonKillsByType().values().stream())
                .filter(count -> count != null && count > 0)
                .mapToInt(Integer::intValue)
                .sum();
        return typedDragonKills > 0;
    }

    private GameDetail mergeLcuObjectiveFallback(Long gameId, GameDetail detail) {
        if (!shouldMergeLcuObjectiveFallback(detail)) {
            return detail;
        }
        MatchHistoryProvider lcuProvider = matchHistoryProviders.get(MatchHistorySource.LCU);
        if (lcuProvider == null) {
            return detail;
        }

        try {
            GameDetail lcuDetail = lcuProvider.fetchGameDetail(
                    gameId,
                    MatchHistoryQueryOptions.defaultFor(MatchHistorySource.LCU, false)
            );
            mergeLcuFallbackObjectiveDetails(detail, lcuDetail);
        } catch (Exception lcuError) {
            log.warn("LCU team objectives backfill failed: gameId={}, error={}", gameId, lcuError.getMessage());
            log.debug("LCU team objectives backfill failure details", lcuError);
        }
        return detail;
    }

    private boolean shouldMergeLcuObjectiveFallback(GameDetail detail) {
        if (detail == null || !QueueType.isRanked(detail.getQueueId())) {
            return false;
        }
        return !hasTeamObjectives(detail) || hasMissingFallbackObjectiveFields(detail);
    }

    private GameDetail hydrateTurretPlateObjectivesFromTimeline(Long gameId, GameDetail detail, String sgpServerId) {
        if (!shouldHydrateTurretPlateObjectives(detail)) {
            return detail;
        }

        try {
            MatchTimelineFetchResult timelineResult = getGameTimelineById(gameId, MatchHistorySource.SGP, sgpServerId);
            if (timelineResult == null || timelineResult.getTimeline() == null) {
                return detail;
            }
            applyTimelineTurretPlateCounts(
                    detail,
                    countTimelineTurretPlatesByTakerTeam(detail, timelineResult.getTimeline())
            );
            addTimelineTurretPlateObjectiveEvents(detail, timelineResult.getTimeline());
        } catch (Exception timelineError) {
            log.warn("SGP turret plate timeline backfill failed: gameId={}, error={}",
                    gameId, timelineError.getMessage());
            log.debug("SGP turret plate timeline backfill failure details", timelineError);
        }
        return detail;
    }

    private boolean shouldHydrateTurretPlateObjectives(GameDetail detail) {
        return isRankedSummonersRiftDetail(detail)
                && (hasMissingTurretPlateObjectiveFields(detail) || hasMissingTurretPlateEventDetails(detail));
    }

    private Map<Integer, Integer> countTimelineTurretPlatesByTakerTeam(GameDetail detail, MatchTimeline timeline) {
        Map<Integer, Integer> teamByParticipantId = teamByParticipantId(detail);
        Map<Integer, Integer> counts = new HashMap<>();
        if (timeline == null || timeline.getEvents() == null) {
            return counts;
        }
        for (MatchTimeline.TimelineEvent event : timeline.getEvents()) {
            if (event == null || !"TURRET_PLATE_DESTROYED".equals(event.getEventType())) {
                continue;
            }
            Integer takerTeamId = resolveTurretPlateTakerTeamId(event, teamByParticipantId);
            if (takerTeamId == null) {
                continue;
            }
            counts.merge(takerTeamId, 1, Integer::sum);
        }
        return counts;
    }

    private Map<Integer, Integer> teamByParticipantId(GameDetail detail) {
        Map<Integer, Integer> teamByParticipantId = new HashMap<>();
        if (detail == null || detail.getParticipants() == null) {
            return teamByParticipantId;
        }
        for (GameDetail.GameParticipant participant : detail.getParticipants()) {
            if (participant == null || participant.getParticipantId() == null || participant.getTeamId() == null) {
                continue;
            }
            teamByParticipantId.put(participant.getParticipantId(), participant.getTeamId());
        }
        return teamByParticipantId;
    }

    private Map<Integer, GameDetail.GameParticipant> participantById(GameDetail detail) {
        Map<Integer, GameDetail.GameParticipant> participantById = new HashMap<>();
        if (detail == null || detail.getParticipants() == null) {
            return participantById;
        }
        for (GameDetail.GameParticipant participant : detail.getParticipants()) {
            if (participant == null || participant.getParticipantId() == null) {
                continue;
            }
            participantById.put(participant.getParticipantId(), participant);
        }
        return participantById;
    }

    private Integer resolveTurretPlateTakerTeamId(
            MatchTimeline.TimelineEvent event,
            Map<Integer, Integer> teamByParticipantId
    ) {
        Integer actorTeamId = teamByParticipantId.get(event.getKillerId());
        if (isSummonersRiftTeamId(actorTeamId)) {
            return actorTeamId;
        }
        actorTeamId = teamByParticipantId.get(event.getParticipantId());
        if (isSummonersRiftTeamId(actorTeamId)) {
            return actorTeamId;
        }
        return opposingSummonersRiftTeamId(event.getTeamId());
    }

    private void applyTimelineTurretPlateCounts(GameDetail detail, Map<Integer, Integer> counts) {
        if (detail == null) {
            return;
        }
        List<GameDetail.TeamObjectiveSummary> summaries = mutableTeamObjectiveSummaries(detail);
        for (Integer teamId : knownTeamIds(detail)) {
            GameDetail.TeamObjectiveSummary summary = teamObjectiveSummaryFor(summaries, teamId);
            int timelineCount = Math.max(0, counts.getOrDefault(teamId, 0));
            Integer existingCount = summary.getTurretPlateKills();
            if (existingCount == null || timelineCount > existingCount) {
                summary.setTurretPlateKills(timelineCount);
            }
        }
    }

    private void addTimelineTurretPlateObjectiveEvents(GameDetail detail, MatchTimeline timeline) {
        if (detail == null || timeline == null || timeline.getEvents() == null) {
            return;
        }
        Map<Integer, GameDetail.GameParticipant> participantById = participantById(detail);
        if (participantById.isEmpty()) {
            return;
        }

        List<GameDetail.TeamObjectiveSummary> summaries = mutableTeamObjectiveSummaries(detail);
        for (MatchTimeline.TimelineEvent event : timeline.getEvents()) {
            if (event == null || !"TURRET_PLATE_DESTROYED".equals(event.getEventType())) {
                continue;
            }
            GameDetail.GameParticipant actor = resolveTurretPlateActor(event, participantById);
            if (actor == null || !isSummonersRiftTeamId(actor.getTeamId())) {
                continue;
            }
            GameDetail.TeamObjectiveSummary summary = teamObjectiveSummaryFor(summaries, actor.getTeamId());
            addTimelineTurretPlateObjectiveEvent(summary, actor, event);
        }
    }

    private GameDetail.GameParticipant resolveTurretPlateActor(
            MatchTimeline.TimelineEvent event,
            Map<Integer, GameDetail.GameParticipant> participantById
    ) {
        GameDetail.GameParticipant actor = participantById.get(event.getKillerId());
        if (actor != null) {
            return actor;
        }
        return participantById.get(event.getParticipantId());
    }

    private void addTimelineTurretPlateObjectiveEvent(
            GameDetail.TeamObjectiveSummary summary,
            GameDetail.GameParticipant actor,
            MatchTimeline.TimelineEvent timelineEvent
    ) {
        if (summary == null || actor == null || actor.getParticipantId() == null || actor.getTeamId() == null) {
            return;
        }
        if (summary.getObjectiveEvents() == null) {
            summary.setObjectiveEvents(new ArrayList<>());
        }
        if (hasObjectiveEvent(
                summary,
                "turretPlate",
                actor.getTeamId(),
                actor.getParticipantId(),
                timelineEvent.getTimestamp()
        )) {
            return;
        }

        GameDetail.TeamObjectiveEvent event = new GameDetail.TeamObjectiveEvent();
        event.setKind("turretPlate");
        event.setTeamId(actor.getTeamId());
        event.setParticipantId(actor.getParticipantId());
        event.setChampionId(actor.getChampionId());
        event.setTimestamp(timelineEvent.getTimestamp());
        summary.getObjectiveEvents().add(event);
    }

    private boolean hasObjectiveEvent(
            GameDetail.TeamObjectiveSummary summary,
            String kind,
            Integer teamId,
            Integer participantId,
            Long timestamp
    ) {
        if (summary.getObjectiveEvents() == null) {
            return false;
        }
        for (GameDetail.TeamObjectiveEvent event : summary.getObjectiveEvents()) {
            if (event == null) {
                continue;
            }
            boolean sameTimestamp = timestamp == null
                    ? event.getTimestamp() == null
                    : timestamp.equals(event.getTimestamp());
            if (kind.equals(event.getKind())
                    && teamId.equals(event.getTeamId())
                    && participantId.equals(event.getParticipantId())
                    && sameTimestamp) {
                return true;
            }
        }
        return false;
    }

    private List<GameDetail.TeamObjectiveSummary> mutableTeamObjectiveSummaries(GameDetail detail) {
        List<GameDetail.TeamObjectiveSummary> summaries = new ArrayList<>(
                detail.getTeamObjectives() == null ? List.of() : detail.getTeamObjectives()
        );
        detail.setTeamObjectives(summaries);
        return summaries;
    }

    private List<Integer> knownTeamIds(GameDetail detail) {
        List<Integer> teamIds = new ArrayList<>();
        if (detail != null && detail.getTeamObjectives() != null) {
            for (GameDetail.TeamObjectiveSummary summary : detail.getTeamObjectives()) {
                addKnownTeamId(teamIds, summary == null ? null : summary.getTeamId());
            }
        }
        if (detail != null && detail.getParticipants() != null) {
            for (GameDetail.GameParticipant participant : detail.getParticipants()) {
                addKnownTeamId(teamIds, participant == null ? null : participant.getTeamId());
            }
        }
        if (teamIds.isEmpty()) {
            teamIds.add(100);
            teamIds.add(200);
        }
        return teamIds;
    }

    private void addKnownTeamId(List<Integer> teamIds, Integer teamId) {
        if (isSummonersRiftTeamId(teamId) && !teamIds.contains(teamId)) {
            teamIds.add(teamId);
        }
    }

    private GameDetail.TeamObjectiveSummary teamObjectiveSummaryFor(
            List<GameDetail.TeamObjectiveSummary> summaries,
            Integer teamId
    ) {
        for (GameDetail.TeamObjectiveSummary summary : summaries) {
            if (summary != null && teamId.equals(summary.getTeamId())) {
                return summary;
            }
        }
        GameDetail.TeamObjectiveSummary summary = new GameDetail.TeamObjectiveSummary();
        summary.setTeamId(teamId);
        summaries.add(summary);
        return summary;
    }

    private boolean isSummonersRiftTeamId(Integer teamId) {
        return Integer.valueOf(100).equals(teamId) || Integer.valueOf(200).equals(teamId);
    }

    private Integer opposingSummonersRiftTeamId(Integer teamId) {
        if (Integer.valueOf(100).equals(teamId)) {
            return 200;
        }
        if (Integer.valueOf(200).equals(teamId)) {
            return 100;
        }
        return null;
    }

    private GameDetail.TeamObjectiveSummary toLcuFallbackObjectiveSummary(GameDetail.TeamObjectiveSummary source) {
        if (source == null || source.getTeamId() == null) {
            return null;
        }
        GameDetail.TeamObjectiveSummary fallback = new GameDetail.TeamObjectiveSummary();
        fallback.setTeamId(source.getTeamId());
        fallback.setBans(source.getBans() == null ? new ArrayList<>() : new ArrayList<>(source.getBans()));
        fallback.setTurretKills(source.getTurretKills());
        fallback.setInhibitorKills(source.getInhibitorKills());
        fallback.setTurretPlateKills(source.getTurretPlateKills());
        fallback.setBaronKills(source.getBaronKills());
        fallback.setDragonKills(source.getDragonKills());
        fallback.setElderDragonKills(source.getElderDragonKills());
        fallback.setHeraldKills(source.getHeraldKills());
        fallback.setVoidGrubKills(source.getVoidGrubKills());
        return fallback;
    }

    private List<GameDetail.TeamObjectiveSummary> mergeLcuFallbackObjectiveDetails(
            List<GameDetail.TeamObjectiveSummary> targetSummaries,
            List<GameDetail.TeamObjectiveSummary> sourceSummaries
    ) {
        List<GameDetail.TeamObjectiveSummary> merged = new ArrayList<>(
                targetSummaries == null ? List.of() : targetSummaries
        );
        if (sourceSummaries == null || sourceSummaries.isEmpty()) {
            return merged;
        }

        for (GameDetail.TeamObjectiveSummary sourceSummary : sourceSummaries) {
            if (sourceSummary == null || sourceSummary.getTeamId() == null) {
                continue;
            }
            GameDetail.TeamObjectiveSummary targetSummary = merged.stream()
                    .filter(summary -> summary != null && sourceSummary.getTeamId().equals(summary.getTeamId()))
                    .findFirst()
                    .orElse(null);
            if (targetSummary == null) {
                merged.add(sourceSummary);
                continue;
            }
            mergeLcuFallbackObjectiveDetail(targetSummary, sourceSummary);
        }
        return merged;
    }

    private void mergeLcuFallbackObjectiveDetail(
            GameDetail.TeamObjectiveSummary target,
            GameDetail.TeamObjectiveSummary source
    ) {
        if ((target.getBans() == null || target.getBans().isEmpty())
                && source.getBans() != null && !source.getBans().isEmpty()) {
            target.setBans(new ArrayList<>(source.getBans()));
        }
        if (shouldMergePositiveFallbackCount(target.getTurretKills(), source.getTurretKills())) {
            target.setTurretKills(source.getTurretKills());
        }
        if (shouldMergePositiveFallbackCount(target.getInhibitorKills(), source.getInhibitorKills())) {
            target.setInhibitorKills(source.getInhibitorKills());
        }
        if (shouldMergePositiveFallbackCount(target.getTurretPlateKills(), source.getTurretPlateKills())) {
            target.setTurretPlateKills(source.getTurretPlateKills());
        }
        if (target.getBaronKills() == null && source.getBaronKills() != null) {
            target.setBaronKills(source.getBaronKills());
        }
        if (target.getDragonKills() == null && source.getDragonKills() != null) {
            target.setDragonKills(source.getDragonKills());
        }
        if (target.getElderDragonKills() == null && source.getElderDragonKills() != null) {
            target.setElderDragonKills(source.getElderDragonKills());
        }
        if (target.getHeraldKills() == null && source.getHeraldKills() != null) {
            target.setHeraldKills(source.getHeraldKills());
        }
        if (target.getVoidGrubKills() == null && source.getVoidGrubKills() != null) {
            target.setVoidGrubKills(source.getVoidGrubKills());
        }
    }

    private boolean shouldMergePositiveFallbackCount(Integer targetValue, Integer sourceValue) {
        return sourceValue != null && sourceValue > 0 && (targetValue == null || targetValue <= 0);
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private Optional<GameDetail> loadCachedGameDetail(Long gameId) {
        Optional<GameDetail> cachedDetail = findCachedGameDetail(gameId, MatchHistorySource.CACHE);
        if (cachedDetail.isEmpty()) {
            return Optional.empty();
        }

        GameDetail detail = cachedDetail.get();
        if (!isRenderableGameDetail(detail)) {
            log.debug("Skipping cached game detail without renderable participant stats, gameId={}", gameId);
            return Optional.empty();
        }
        enrichParticipantStats(detail);
        hydrateObjectiveEventActors(detail);
        return Optional.of(detail);
    }

    private Optional<GameDetail> findCachedGameDetail(Long gameId, MatchHistorySource source) {
        if (!usesDatabaseCache(source) || cacheRepository == null) {
            return Optional.empty();
        }
        return cacheRepository.findGameDetail(gameId);
    }

    private boolean isRenderableGameDetail(GameDetail detail) {
        if (detail == null || detail.getParticipants() == null || detail.getParticipants().isEmpty()) {
            return false;
        }

        return detail.getParticipants().stream().anyMatch(this::hasRenderableGameDetailParticipant);
    }

    private boolean hasRenderableGameDetailParticipant(GameDetail.GameParticipant participant) {
        if (participant == null || participant.getParticipantId() == null
                || participant.getTeamId() == null || participant.getChampionId() == null) {
            return false;
        }

        GameDetail.Stats stats = participant.getStats();
        return stats != null
                && stats.getWin() != null
                && stats.getKills() != null
                && stats.getDeaths() != null
                && stats.getAssists() != null;
    }

    /**
     * Fetch filtered match history.
     */
    public List<MatchHistory> getFilteredMatchHistory(String puuid, int begIndex, int endIndex,
                                                      Integer queueId, Integer championId, int maxResults) {
        return getFilteredMatchHistory(puuid, begIndex, endIndex, queueId, championId, maxResults, false,
                MatchHistorySource.AUTO);
    }

    /**
     * Fetch filtered match history, optionally bypassing the in-memory cache.
     */
    public List<MatchHistory> getFilteredMatchHistory(String puuid, int begIndex, int endIndex,
                                                      Integer queueId, Integer championId, int maxResults,
                                                      boolean forceRefresh) {
        return getFilteredMatchHistory(puuid, begIndex, endIndex, queueId, championId, maxResults, forceRefresh,
                MatchHistorySource.AUTO);
    }

    public List<MatchHistory> getFilteredMatchHistory(String puuid, int begIndex, int endIndex,
                                                      Integer queueId, Integer championId, int maxResults,
                                                      boolean forceRefresh, String source) {
        return getFilteredMatchHistory(puuid, begIndex, endIndex, queueId, championId, maxResults, forceRefresh,
                MatchHistorySource.fromRequest(source));
    }

    public List<MatchHistory> getFilteredMatchHistory(String puuid, int begIndex, int endIndex,
                                                      Integer queueId, Integer championId, int maxResults,
                                                      boolean forceRefresh, MatchHistorySource source) {
        if (forceRefresh) {
            log.info("Force refreshing filtered match history request: puuid={}, begIndex={}, endIndex={}, source={}",
                    puuidPrefix(puuid), begIndex, endIndex, normalizeSource(source));
        }
        FetchedMatchHistory fetched = loadMatchHistory(puuid, forceRefresh, source);
        List<MatchHistory> allMatches = fetched.result().getMatches();
        if (allMatches.isEmpty()) {
            return List.of();
        }

        List<MatchHistory> filteredMatches = filterMatches(allMatches, puuid, queueId, championId);

        List<MatchHistory> sliced = sliceMatches(filteredMatches, begIndex, endIndex);
        if (maxResults > 0 && sliced.size() > maxResults) {
            sliced = new ArrayList<>(sliced.subList(0, maxResults));
        }
        return ensureRosterForVisibleMatches(
                puuid,
                allMatches,
                sliced,
                fetched.source(),
                shouldHydrateVisibleMatchesFromDetail(source)
        );
    }

    private List<MatchHistory> filterMatches(List<MatchHistory> matches,
                                             String puuid,
                                             Integer queueId,
                                             Integer championId) {
        if (matches == null || matches.isEmpty()) {
            return List.of();
        }
        List<MatchHistory> filteredMatches = new ArrayList<>();
        for (MatchHistory match : matches) {
            if (matchesFilters(match, puuid, queueId, championId)) {
                filteredMatches.add(match);
            }
        }
        return filteredMatches;
    }

    private boolean matchesFilters(MatchHistory match, String puuid, Integer queueId, Integer championId) {
        if (match == null) {
            return false;
        }
        boolean queueMatches = queueId == null || queueId <= 0
                || (match.getQueueId() != null && match.getQueueId().equals(queueId));

        boolean championMatches = championId == null || championId <= 0;
        if (!championMatches && match.getParticipants() != null) {
            Integer participantId = findParticipantId(match, puuid);
            if (participantId != null) {
                championMatches = match.getParticipants().stream()
                        .anyMatch(p -> participantId.equals(p.getParticipantId())
                                && p.getChampionId() != null
                                && p.getChampionId().equals(championId));
            }
        }
        return queueMatches && championMatches;
    }

    private List<MatchHistory> ensureRosterForVisibleMatches(String puuid,
                                                             List<MatchHistory> cachedMatches,
                                                             List<MatchHistory> visibleMatches,
                                                             MatchHistorySource source) {
        return ensureRosterForVisibleMatches(puuid, cachedMatches, visibleMatches, source, true);
    }

    private List<MatchHistory> ensureRosterForVisibleMatches(String puuid,
                                                             List<MatchHistory> cachedMatches,
                                                             List<MatchHistory> visibleMatches,
                                                             MatchHistorySource source,
                                                             boolean allowRemoteDetailFetch) {
        long completeBefore = visibleMatches.stream().filter(match -> hasRenderableRoster(match, puuid)).count();
        List<MatchHistory> hydratedMatches = ensureRosterForVisibleMatches(
                puuid,
                visibleMatches,
                source,
                allowRemoteDetailFetch
        );
        long completeAfter = hydratedMatches.stream().filter(match -> hasRenderableRoster(match, puuid)).count();

        if (completeAfter > completeBefore && cacheRepository != null && cachedMatches != null && !cachedMatches.isEmpty()) {
            saveMatchHistoryToLocalCache(puuid, cachedMatches, source);
        }

        return hydratedMatches;
    }

    private List<MatchHistory> ensureRosterForVisibleMatches(List<MatchHistory> matches) {
        return ensureRosterForVisibleMatches(null, matches, MatchHistorySource.AUTO);
    }

    private List<MatchHistory> ensureRosterForVisibleMatches(List<MatchHistory> matches, MatchHistorySource source) {
        return ensureRosterForVisibleMatches(null, matches, source);
    }

    private List<MatchHistory> ensureRosterForVisibleMatches(String puuid,
                                                             List<MatchHistory> matches,
                                                             MatchHistorySource source) {
        return ensureRosterForVisibleMatches(puuid, matches, source, true);
    }

    private List<MatchHistory> ensureRosterForVisibleMatches(String puuid,
                                                             List<MatchHistory> matches,
                                                             MatchHistorySource source,
                                                             boolean allowRemoteDetailFetch) {
        if (matches == null || matches.isEmpty()) {
            return List.of();
        }

        List<MatchHistory> hydratedMatches = new ArrayList<>(matches.size());
        for (MatchHistory match : matches) {
            if (match == null || match.getGameId() == null || hasRenderableVisibleMatch(match, puuid, source)) {
                hydratedMatches.add(match);
                continue;
            }

            if (!allowRemoteDetailFetch) {
                hydratedMatches.add(match);
                continue;
            }

            try {
                GameDetail detail = getGameDetailById(match.getGameId(), source);
                hydratedMatches.add(mergeGameDetailIntoMatchHistory(match, detail));
            } catch (Exception e) {
                log.debug("Failed to hydrate visible match roster, gameId={}", match.getGameId(), e);
                hydratedMatches.add(match);
            }
        }
        attachSummonerNames(hydratedMatches);
        return hydratedMatches;
    }

    /** 一次返回里最多查多少个名字（防呆：一页 20 局 × 10 人 = 200）。 */
    private static final int MAX_NAME_LOOKUPS = 60;

    /**
     * 给返回的对局补玩家名。
     *
     * <p>SGP 的列表/详情接口都只给 summonerId + puuid，不带 gameName/tagLine；
     * 记分板（赛后复盘）上 10 个人就全成了 "Unknown Player"。这里把所有缺名字的 puuid
     * 一次性并发查掉（LCU 本地调用 + 10 分钟缓存，查过的会落到本地库，下次直接命中）。
     */
    private void attachSummonerNames(List<MatchHistory> matches) {
        if (summonerService == null || matches == null || matches.isEmpty()) {
            return;
        }

        java.util.LinkedHashSet<String> missing = new java.util.LinkedHashSet<>();
        for (MatchHistory match : matches) {
            if (match == null || match.getParticipantIdentities() == null) {
                continue;
            }
            for (MatchHistory.ParticipantIdentity identity : match.getParticipantIdentities()) {
                MatchHistory.Player player = identity == null ? null : identity.getPlayer();
                if (player == null || player.getPuuid() == null || player.getPuuid().isBlank()) {
                    continue;
                }
                if (player.getGameName() != null && !player.getGameName().isBlank()) {
                    continue;
                }
                missing.add(player.getPuuid().trim());
                if (missing.size() >= MAX_NAME_LOOKUPS) {
                    break;
                }
            }
        }
        if (missing.isEmpty()) {
            return;
        }

        Map<String, Summoner> resolved = new ConcurrentHashMap<>();
        List<java.util.concurrent.CompletableFuture<Void>> lookups = new ArrayList<>();
        for (String puuid : missing) {
            lookups.add(java.util.concurrent.CompletableFuture.runAsync(() -> {
                try {
                    Summoner summoner = summonerService.getSummonerByPuuid(puuid);
                    if (summoner != null && summoner.getGameName() != null && !summoner.getGameName().isBlank()) {
                        resolved.put(puuid, summoner);
                    }
                } catch (RuntimeException ignored) {
                    // 查不到就留空，前端显示 Unknown Player
                }
            }));
        }
        try {
            java.util.concurrent.CompletableFuture
                    .allOf(lookups.toArray(new java.util.concurrent.CompletableFuture[0]))
                    .get(5, TimeUnit.SECONDS);
        } catch (Exception error) {
            log.debug("补玩家名超时: 待查={}, error={}", missing.size(), error.getMessage());
        }
        if (resolved.isEmpty()) {
            return;
        }

        for (MatchHistory match : matches) {
            if (match == null || match.getParticipantIdentities() == null) {
                continue;
            }
            for (MatchHistory.ParticipantIdentity identity : match.getParticipantIdentities()) {
                MatchHistory.Player player = identity == null ? null : identity.getPlayer();
                if (player == null || player.getPuuid() == null) {
                    continue;
                }
                Summoner summoner = resolved.get(player.getPuuid().trim());
                if (summoner == null) {
                    continue;
                }
                if (player.getGameName() == null || player.getGameName().isBlank()) {
                    player.setGameName(summoner.getGameName());
                }
                if (player.getTagLine() == null || player.getTagLine().isBlank()) {
                    player.setTagLine(summoner.getTagLine());
                }
                if (player.getSummonerName() == null || player.getSummonerName().isBlank()) {
                    player.setSummonerName(summoner.getGameName());
                }
            }
        }
    }

    /**
     * 给对局详情里的 10 个玩家补名字。
     *
     * <p>SGP 的详情接口只给 {participantId, puuid} 两个字段，LCU 又查不到已经过去的老对局，
     * 于是整张记分板全成了 "Unknown Player"。这里对缺名字的 puuid 做一次召唤师查询
     * （LCU 本地调用 + 10 分钟缓存，10 个并发几百毫秒）。
     */
    private GameDetail attachSummonerNamesToDetail(GameDetail detail) {
        if (summonerService == null || detail == null || detail.getParticipantIdentities() == null) {
            return detail;
        }

        java.util.LinkedHashSet<String> missing = new java.util.LinkedHashSet<>();
        for (GameDetail.ParticipantIdentity identity : detail.getParticipantIdentities()) {
            GameDetail.Player player = identity == null ? null : identity.getPlayer();
            if (player == null || player.getPuuid() == null || player.getPuuid().isBlank()) {
                continue;
            }
            if (player.getGameName() != null && !player.getGameName().isBlank()) {
                continue;
            }
            missing.add(player.getPuuid().trim());
        }
        if (missing.isEmpty()) {
            return detail;
        }

        Map<String, Summoner> resolved = new ConcurrentHashMap<>();
        List<java.util.concurrent.CompletableFuture<Void>> lookups = new ArrayList<>();
        for (String puuid : missing) {
            lookups.add(java.util.concurrent.CompletableFuture.runAsync(() -> {
                try {
                    Summoner summoner = summonerService.getSummonerByPuuid(puuid);
                    if (summoner != null && summoner.getGameName() != null && !summoner.getGameName().isBlank()) {
                        resolved.put(puuid, summoner);
                    }
                } catch (RuntimeException ignored) {
                    // 查不到就留空，前端显示 Unknown Player
                }
            }));
        }
        try {
            java.util.concurrent.CompletableFuture
                    .allOf(lookups.toArray(new java.util.concurrent.CompletableFuture[0]))
                    .get(4, TimeUnit.SECONDS);
        } catch (Exception error) {
            log.debug("补对局详情玩家名超时: gameId={}, error={}", detail.getGameId(), error.getMessage());
        }
        if (resolved.isEmpty()) {
            return detail;
        }

        for (GameDetail.ParticipantIdentity identity : detail.getParticipantIdentities()) {
            GameDetail.Player player = identity == null ? null : identity.getPlayer();
            if (player == null || player.getPuuid() == null) {
                continue;
            }
            Summoner summoner = resolved.get(player.getPuuid().trim());
            if (summoner == null) {
                continue;
            }
            if (player.getGameName() == null || player.getGameName().isBlank()) {
                player.setGameName(summoner.getGameName());
            }
            if (player.getTagLine() == null || player.getTagLine().isBlank()) {
                player.setTagLine(summoner.getTagLine());
            }
            if (player.getSummonerName() == null || player.getSummonerName().isBlank()) {
                player.setSummonerName(summoner.getGameName());
            }
        }
        return detail;
    }

    private boolean hasRenderableVisibleMatch(MatchHistory match, String puuid, MatchHistorySource source) {
        if (source == MatchHistorySource.SGP && hasRenderableCurrentParticipant(match, puuid)) {
            return true;
        }
        return hasRenderableRoster(match, puuid);
    }

    private boolean shouldHydrateVisibleMatchesFromDetail(MatchHistorySource requestedSource) {
        return normalizeSource(requestedSource) != MatchHistorySource.SGP;
    }

    private boolean hasRenderableRoster(MatchHistory match, String puuid) {
        return hasCompleteRoster(match) && hasCurrentParticipant(match, puuid);
    }

    private boolean hasRenderableCurrentParticipant(MatchHistory match, String puuid) {
        MatchHistory.Participant participant = findParticipantByPuuid(match, puuid);
        if (participant == null || participant.getChampionId() == null || participant.getChampionId() <= 0) {
            return false;
        }

        MatchHistory.Stats stats = participant.getStats();
        return stats != null
                && stats.getWin() != null
                && stats.getKills() != null
                && stats.getDeaths() != null
                && stats.getAssists() != null;
    }

    private MatchHistory.Participant findParticipantByPuuid(MatchHistory match, String puuid) {
        if (match == null || puuid == null || puuid.isBlank() || match.getParticipants() == null) {
            return null;
        }

        Integer participantId = findParticipantId(match, puuid);
        if (participantId == null) {
            return null;
        }

        return match.getParticipants().stream()
                .filter(participant -> participant != null && participantId.equals(participant.getParticipantId()))
                .findFirst()
                .orElse(null);
    }

    private boolean hasCurrentParticipant(MatchHistory match, String puuid) {
        if (puuid == null || puuid.isBlank()) {
            return true;
        }
        Integer participantId = findParticipantId(match, puuid);
        if (participantId == null || match.getParticipants() == null) {
            return false;
        }
        return match.getParticipants().stream()
                .anyMatch(participant -> participant != null && participantId.equals(participant.getParticipantId()));
    }

    private boolean hasCompleteRoster(MatchHistory match) {
        return match != null
                && match.getParticipants() != null
                && match.getParticipants().size() >= 10
                && match.getParticipantIdentities() != null
                && match.getParticipantIdentities().size() >= 10;
    }

    private MatchHistory mergeGameDetailIntoMatchHistory(MatchHistory match, GameDetail detail) {
        if (match == null || detail == null) {
            return match;
        }
        int currentParticipantCount = match.getParticipants() == null ? 0 : match.getParticipants().size();
        int currentIdentityCount = match.getParticipantIdentities() == null ? 0 : match.getParticipantIdentities().size();
        if (detail.getParticipants() != null && detail.getParticipants().size() >= currentParticipantCount) {
            match.setParticipants(detail.getParticipants().stream()
                    .map(this::toMatchParticipant)
                    .toList());
        }
        if (detail.getParticipantIdentities() != null && detail.getParticipantIdentities().size() >= currentIdentityCount) {
            match.setParticipantIdentities(detail.getParticipantIdentities().stream()
                    .map(this::toMatchParticipantIdentity)
                    .toList());
        }
        if (match.getQueueId() == null) {
            match.setQueueId(detail.getQueueId());
        }
        if (match.getGameMode() == null) {
            match.setGameMode(detail.getGameMode());
        }
        if (match.getGameType() == null) {
            match.setGameType(detail.getGameType());
        }
        if (match.getMapId() == null) {
            match.setMapId(detail.getMapId());
        }
        if (match.getGameCreation() == null) {
            match.setGameCreation(detail.getGameCreation());
        }
        if (match.getGameDuration() == null && detail.getGameDuration() != null) {
            match.setGameDuration(detail.getGameDuration().intValue());
        }
        return match;
    }

    private MatchHistory.Participant toMatchParticipant(GameDetail.GameParticipant gameParticipant) {
        MatchHistory.Participant participant = new MatchHistory.Participant();
        participant.setParticipantId(gameParticipant.getParticipantId());
        participant.setTeamId(gameParticipant.getTeamId());
        participant.setChampionId(gameParticipant.getChampionId());
        participant.setSpell1Id(gameParticipant.getSpell1Id());
        participant.setSpell2Id(gameParticipant.getSpell2Id());
        participant.setTeamPosition(gameParticipant.getTeamPosition());
        participant.setIndividualPosition(gameParticipant.getIndividualPosition());
        participant.setSelectedPosition(gameParticipant.getSelectedPosition());
        if (gameParticipant.getTimeline() != null) {
            participant.setLane(firstText(
                    gameParticipant.getTimeline().getTeamPosition(),
                    gameParticipant.getTimeline().getLane(),
                    gameParticipant.getTimeline().getRawLane()
            ));
            participant.setRole(firstText(
                    gameParticipant.getTimeline().getRole(),
                    gameParticipant.getTimeline().getRawRole()
            ));
        }
        participant.setStats(toMatchStats(gameParticipant.getStats()));
        return participant;
    }

    private MatchHistory.Stats toMatchStats(GameDetail.Stats detailStats) {
        MatchHistory.Stats stats = new MatchHistory.Stats();
        if (detailStats == null) {
            return stats;
        }
        stats.setWin(detailStats.getWin());
        stats.setKills(detailStats.getKills());
        stats.setDeaths(detailStats.getDeaths());
        stats.setAssists(detailStats.getAssists());
        stats.setGoldEarned(toInteger(detailStats.getGoldEarned()));
        stats.setTotalDamageDealtToChampions(toInteger(detailStats.getTotalDamageDealtToChampions()));
        stats.setTotalDamageTaken(toInteger(detailStats.getTotalDamageTaken()));
        stats.setTotalHeal(toInteger(detailStats.getTotalHeal()));
        stats.setTotalMinionsKilled(detailStats.getTotalMinionsKilled());
        stats.setNeutralMinionsKilled(detailStats.getNeutralMinionsKilled());
        stats.setVisionScore(detailStats.getVisionScore());
        stats.setItem0(detailStats.getItem0());
        stats.setItem1(detailStats.getItem1());
        stats.setItem2(detailStats.getItem2());
        stats.setItem3(detailStats.getItem3());
        stats.setItem4(detailStats.getItem4());
        stats.setItem5(detailStats.getItem5());
        stats.setItem6(detailStats.getItem6());
        stats.setDamageDealtToChampionsRate(detailStats.getDamageDealtToChampionsRate());
        stats.setDamageTakenRate(detailStats.getDamageTakenRate());
        stats.setHealRate(detailStats.getHealRate());
        stats.setMvp(detailStats.getMvp());
        stats.setDoubleKills(detailStats.getDoubleKills());
        stats.setTripleKills(detailStats.getTripleKills());
        stats.setQuadraKills(detailStats.getQuadraKills());
        stats.setPentaKills(detailStats.getPentaKills());
        stats.setLargestKillingSpree(detailStats.getLargestKillingSpree());
        stats.setLegendaryCount(detailStats.getLegendaryCount());
        stats.setPerk0(detailStats.getPerk0());
        stats.setPerk1(detailStats.getPerk1());
        stats.setPerk2(detailStats.getPerk2());
        stats.setPerk3(detailStats.getPerk3());
        stats.setPerk4(detailStats.getPerk4());
        stats.setPerk5(detailStats.getPerk5());
        stats.setPerkPrimaryStyle(detailStats.getPerkPrimaryStyle());
        stats.setPerkSubStyle(detailStats.getPerkSubStyle());
        stats.setPerks(detailStats.getPerks());
        stats.setMinionsKilled(detailStats.getTotalMinionsKilled());
        stats.setDamageDealtToTurrets(toInteger(detailStats.getDamageDealtToTurrets()));
        stats.setEarlyGoldDiff(detailStats.getEarlyGoldDiff());
        stats.setPlayerAugment1(detailStats.getPlayerAugment1());
        stats.setPlayerAugment2(detailStats.getPlayerAugment2());
        stats.setPlayerAugment3(detailStats.getPlayerAugment3());
        stats.setPlayerAugment4(detailStats.getPlayerAugment4());
        stats.setChallenges(detailStats.getChallenges());
        stats.setExtraFields(detailStats.getExtraFields());
        return stats;
    }

    private String firstText(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private MatchHistory.ParticipantIdentity toMatchParticipantIdentity(GameDetail.ParticipantIdentity identity) {
        MatchHistory.ParticipantIdentity participantIdentity = new MatchHistory.ParticipantIdentity();
        participantIdentity.setParticipantId(identity.getParticipantId());

        MatchHistory.Player player = new MatchHistory.Player();
        if (identity.getPlayer() != null) {
            player.setPuuid(identity.getPlayer().getPuuid());
            player.setGameName(identity.getPlayer().getGameName());
            player.setTagLine(identity.getPlayer().getTagLine());
            player.setSummonerName(identity.getPlayer().getSummonerName());
            player.setAccountId(identity.getPlayer().getAccountId());
            player.setSummonerId(identity.getPlayer().getSummonerId());
            player.setPlatformId(identity.getPlayer().getPlatformId());
        }
        participantIdentity.setPlayer(player);
        return participantIdentity;
    }

    private Integer toInteger(Long value) {
        return value == null ? null : value.intValue();
    }

    /**
     * Win rate over recent matches.
     */
    public WinRate getWinRate(String puuid, Integer mode) {
        return getWinRate(puuid, mode, MatchHistorySource.AUTO);
    }

    public WinRate getWinRate(String puuid, Integer mode, String source) {
        return getWinRate(puuid, mode, MatchHistorySource.fromRequest(source));
    }

    public WinRate getWinRate(String puuid, Integer mode, MatchHistorySource source) {
        List<MatchHistory> matches = getMatchHistory(puuid, 0, 49, false, source);

        int wins = 0;
        int losses = 0;

        for (MatchHistory match : matches) {
            if (mode != null && mode > 0 && !mode.equals(match.getQueueId())) {
                continue;
            }

            Integer participantId = findParticipantId(match, puuid);
            if (participantId != null && match.getParticipants() != null) {
                for (MatchHistory.Participant p : match.getParticipants()) {
                    if (participantId.equals(p.getParticipantId()) && p.getStats() != null) {
                        if (Boolean.TRUE.equals(p.getStats().getWin())) {
                            wins++;
                        } else {
                            losses++;
                        }
                        break;
                    }
                }
            }
        }

        return WinRate.of(wins, losses);
    }

    /**
     * Ranked win rates over recent matches.
     */
    public Map<String, WinRate> getRankedWinRates(String puuid) {
        return getRankedWinRates(puuid, MatchHistorySource.AUTO);
    }

    public Map<String, WinRate> getRankedWinRates(String puuid, String source) {
        return getRankedWinRates(puuid, MatchHistorySource.fromRequest(source));
    }

    public Map<String, WinRate> getRankedWinRates(String puuid, MatchHistorySource source) {
        List<MatchHistory> matches = getMatchHistory(puuid, 0, 49, false, source);

        int soloWins = 0;
        int soloLosses = 0;
        int flexWins = 0;
        int flexLosses = 0;

        for (MatchHistory match : matches) {
            Integer queueId = match.getQueueId();
            if (queueId == null || (queueId != 420 && queueId != 440)) {
                continue;
            }

            Integer participantId = findParticipantId(match, puuid);
            if (participantId != null && match.getParticipants() != null) {
                for (MatchHistory.Participant p : match.getParticipants()) {
                    if (participantId.equals(p.getParticipantId()) && p.getStats() != null) {
                        boolean win = Boolean.TRUE.equals(p.getStats().getWin());
                        if (queueId == 420) {
                            if (win) {
                                soloWins++;
                            } else {
                                soloLosses++;
                            }
                        } else if (win) {
                            flexWins++;
                        } else {
                            flexLosses++;
                        }
                        break;
                    }
                }
            }
        }

        return Map.of(
                "RANKED_SOLO_5x5", WinRate.of(soloWins, soloLosses),
                "RANKED_FLEX_SR", WinRate.of(flexWins, flexLosses)
        );
    }

    private Integer findParticipantId(MatchHistory match, String puuid) {
        if (match.getParticipantIdentities() == null) {
            return null;
        }
        for (MatchHistory.ParticipantIdentity identity : match.getParticipantIdentities()) {
            if (identity.getPlayer() != null && puuid.equals(identity.getPlayer().getPuuid())) {
                return identity.getParticipantId();
            }
        }
        return null;
    }

    private void enrichParticipantStats(GameDetail detail) {
        if (detail == null || detail.getParticipants() == null || detail.getParticipants().isEmpty()) {
            return;
        }

        normalizeParticipantPositions(detail);

        for (GameDetail.GameParticipant participant : detail.getParticipants()) {
            GameDetail.Stats stats = participant.getStats();
            if (stats == null) {
                continue;
            }
            if (stats.getVisionScore() == null) {
                stats.setVisionScore(0);
            }
        }

        for (GameDetail.GameParticipant participant : detail.getParticipants()) {
            GameDetail.Stats stats = participant.getStats();
            if (stats == null) {
                continue;
            }
            stats.setEarlyGoldDiff(resolveEarlyGoldDiff(detail, participant));
        }
    }

    private Integer resolveEarlyGoldDiff(GameDetail detail, GameDetail.GameParticipant participant) {
        GameDetail.Stats stats = participant.getStats();
        if (stats == null) {
            return null;
        }

        Integer precomputedValue = readPrecomputedEarlyGoldDiff(stats);
        if (precomputedValue != null) {
            return precomputedValue;
        }

        String position = resolvePosition(participant);
        if (detail.getMapId() == null || detail.getMapId() != SUMMONERS_RIFT_MAP_ID || position == null) {
            return null;
        }

        GameDetail.GameParticipant opponent = findLaneOpponent(detail, participant, position);
        if (opponent == null || opponent.getStats() == null) {
            return null;
        }

        int ownCs = getEstimatedCreepScore(stats, position);
        int opponentCs = getEstimatedCreepScore(opponent.getStats(), position);
        double durationMinutes = detail.getGameDuration() == null ? 0D : detail.getGameDuration() / 60D;
        double earlyRatio = durationMinutes > 0D && durationMinutes < 15D ? 15D / durationMinutes : 1D;
        return (int) Math.round((ownCs - opponentCs) * earlyRatio * 20D);
    }

    private Integer readPrecomputedEarlyGoldDiff(GameDetail.Stats stats) {
        Number value = readNumber(stats.getChallenges(),
                "laneGoldDiff15",
                "goldDiff15",
                "goldDiffAt15",
                "goldDifferenceAt15",
                "fifteenMinuteGoldDiff",
                "earlyGoldDiff");
        if (value == null) {
            value = readNumber(stats.getExtraFields(),
                    "laneGoldDiff15",
                    "goldDiff15",
                    "goldDiffAt15",
                    "goldDifferenceAt15",
                    "fifteenMinuteGoldDiff",
                    "earlyGoldDiff");
        }
        return value == null ? null : (int) Math.round(value.doubleValue());
    }

    private GameDetail.GameParticipant findLaneOpponent(
            GameDetail detail,
            GameDetail.GameParticipant participant,
            String position) {
        if (detail == null || detail.getParticipants() == null || participant == null || participant.getTeamId() == null) {
            return null;
        }

        for (GameDetail.GameParticipant candidate : detail.getParticipants()) {
            if (candidate == null || candidate.getTeamId() == null || participant.getTeamId().equals(candidate.getTeamId())) {
                continue;
            }
            if (position.equals(resolvePosition(candidate))) {
                return candidate;
            }
        }
        return null;
    }

    private void normalizeParticipantPositions(GameDetail detail) {
        Map<Integer, List<GameDetail.GameParticipant>> teams = new HashMap<>();
        for (GameDetail.GameParticipant participant : detail.getParticipants()) {
            if (participant == null || participant.getTeamId() == null) {
                continue;
            }
            ensureTimeline(participant);
            rememberRawTimeline(participant);
            teams.computeIfAbsent(participant.getTeamId(), ignored -> new ArrayList<>()).add(participant);
        }

        if (!shouldAssignTeamOrderPositions(detail, teams)) {
            return;
        }
        for (List<GameDetail.GameParticipant> team : teams.values()) {
            assignTeamOrderPositions(team);
        }
    }

    private boolean shouldAssignTeamOrderPositions(
            GameDetail detail,
            Map<Integer, List<GameDetail.GameParticipant>> teams) {
        return detail != null
                && Integer.valueOf(SUMMONERS_RIFT_MAP_ID).equals(detail.getMapId())
                && QueueType.isRanked(detail.getQueueId())
                && teams.size() == 2
                && teams.values().stream().allMatch(this::isCompleteOrderedTeam);
    }

    private boolean isCompleteOrderedTeam(List<GameDetail.GameParticipant> team) {
        return team != null
                && team.size() == TEAM_ORDER_POSITIONS.size()
                && team.stream().allMatch(participant -> participant != null && participant.getParticipantId() != null);
    }

    private void assignTeamOrderPositions(List<GameDetail.GameParticipant> team) {
        List<GameDetail.GameParticipant> orderedTeam = team.stream()
                .sorted(Comparator.comparing(GameDetail.GameParticipant::getParticipantId))
                .toList();
        for (int index = 0; index < orderedTeam.size(); index++) {
            applyNormalizedPosition(orderedTeam.get(index), TEAM_ORDER_POSITIONS.get(index));
        }
    }

    private void applyNormalizedPosition(GameDetail.GameParticipant participant, String position) {
        GameDetail.Timeline timeline = ensureTimeline(participant);
        timeline.setLane(position);
        timeline.setTeamPosition(position);
        timeline.setPositionCn(positionCn(position));
        participant.setTeamPosition(position);
        participant.setIndividualPosition(position);

        if (POSITION_JUNGLE.equals(position)) {
            timeline.setRole("NONE");
        } else if (POSITION_SUPPORT.equals(position)) {
            timeline.setRole("SUPPORT");
        } else if (POSITION_BOTTOM.equals(position)) {
            timeline.setRole("CARRY");
        } else {
            timeline.setRole("SOLO");
        }
    }

    private String resolvePosition(GameDetail.GameParticipant participant) {
        if (participant == null || participant.getTimeline() == null) {
            return null;
        }

        String teamPosition = normalizePosition(participant.getTimeline().getTeamPosition());
        if (isKnownPosition(teamPosition)) {
            return teamPosition;
        }

        String lane = normalizePosition(participant.getTimeline().getLane());
        String role = normalizePosition(participant.getTimeline().getRole());

        if ("JUNGLE".equals(lane)) {
            return POSITION_JUNGLE;
        }
        if ("TOP".equals(lane)) {
            return POSITION_TOP;
        }
        if ("MIDDLE".equals(lane) || "MID".equals(lane)) {
            return POSITION_MIDDLE;
        }
        if ("BOTTOM".equals(lane) || "BOT".equals(lane)) {
            if (role != null && role.contains("SUPPORT")) {
                return POSITION_SUPPORT;
            }
            return POSITION_BOTTOM;
        }
        if ("UTILITY".equals(lane) || "SUPPORT".equals(lane) || (role != null && role.contains("SUPPORT"))) {
            return POSITION_SUPPORT;
        }
        if ("DUO_CARRY".equals(role)) {
            return POSITION_BOTTOM;
        }
        return null;
    }

    private String normalizePosition(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim().toUpperCase(Locale.ROOT);
    }

    private int getEstimatedCreepScore(GameDetail.Stats stats, String position) {
        if (POSITION_JUNGLE.equals(position)) {
            return intValue(stats.getTotalMinionsKilled()) + intValue(stats.getNeutralMinionsKilled());
        }
        return intValue(stats.getTotalMinionsKilled());
    }

    private int intValue(Integer value) {
        return value == null ? 0 : value;
    }

    private Number readNumber(Map<String, Object> source, String... keys) {
        if (source == null || source.isEmpty()) {
            return null;
        }
        for (String key : keys) {
            Object value = source.get(key);
            if (value instanceof Number number) {
                return number;
            }
            if (value instanceof String text && !text.isBlank()) {
                try {
                    return Double.parseDouble(text);
                } catch (NumberFormatException ignored) {
                    // Ignore malformed optional fields and continue with the next candidate.
                }
            }
        }
        return null;
    }

    private GameDetail.Timeline ensureTimeline(GameDetail.GameParticipant participant) {
        if (participant.getTimeline() == null) {
            participant.setTimeline(new GameDetail.Timeline());
        }
        return participant.getTimeline();
    }

    private void rememberRawTimeline(GameDetail.GameParticipant participant) {
        GameDetail.Timeline timeline = ensureTimeline(participant);
        if (timeline.getRawLane() == null) {
            timeline.setRawLane(timeline.getLane());
        }
        if (timeline.getRawRole() == null) {
            timeline.setRawRole(timeline.getRole());
        }
    }

    private boolean isKnownPosition(String position) {
        return POSITION_TOP.equals(position)
                || POSITION_JUNGLE.equals(position)
                || POSITION_MIDDLE.equals(position)
                || POSITION_BOTTOM.equals(position)
                || POSITION_SUPPORT.equals(position);
    }

    private String positionCn(String position) {
        return switch (position) {
            case POSITION_TOP -> "上路";
            case POSITION_JUNGLE -> "打野";
            case POSITION_MIDDLE -> "中路";
            case POSITION_BOTTOM -> "下路";
            case POSITION_SUPPORT -> "辅助";
            default -> "未知";
        };
    }

    private record ResolvedProvider(MatchHistoryProvider provider, MatchHistorySource source) {
    }

    private record FetchedMatchHistory(MatchHistoryFetchResult result,
                                       MatchHistorySource source,
                                       MatchHistoryQueryOptions options) {
    }

    public void refreshCache(String puuid) {
        matchHistoryCache.asMap().keySet().removeIf(key -> key.endsWith("|" + cachePart(puuid)));
    }

    public void refreshAllCache() {
        matchHistoryCache.invalidateAll();
        gameDetailCache.invalidateAll();
    }

    private String puuidPrefix(String puuid) {
        if (puuid == null || puuid.isBlank()) {
            return "null";
        }
        return puuid.substring(0, Math.min(8, puuid.length()));
    }
}
