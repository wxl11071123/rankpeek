package io.rankpeek.config;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

/**
 * 缓存配置
 * 统一管理所有 Caffeine 缓存
 */
@Configuration
public class CacheConfig {

    /**
     * 缓存注册表（用于监控）
     */
    private final Map<String, Cache<?, ?>> cacheRegistry = new ConcurrentHashMap<>();

    /**
     * 创建召唤师缓存
     */
    @Bean
    public Cache<String, Object> summonerCache() {
        return createCache("summoner", 500, 10, TimeUnit.MINUTES);
    }

    /**
     * 创建段位缓存
     */
    @Bean
    public Cache<String, Object> rankCache() {
        return createCache("rank", 500, 5, TimeUnit.MINUTES);
    }

    /**
     * 创建战绩缓存
     */
    @Bean
    public Cache<String, Object> matchHistoryCache() {
        return createCache("matchHistory", 200, 10, TimeUnit.MINUTES);
    }

    /**
     * 创建游戏详情缓存
     */
    @Bean
    public Cache<Long, Object> gameDetailCache() {
        return createCache("gameDetail", 500, 30, TimeUnit.MINUTES);
    }

    /**
     * 创建用户标签缓存
     */
    @Bean
    public Cache<Long, Object> userTagCache() {
        return createCache("userTag", 300, 15, TimeUnit.MINUTES);
    }

    /**
     * 创建 ARAM 平衡缓存
     */
    @Bean
    public Cache<Integer, Object> aramBalanceCache() {
        return createCache("aramBalance", 100, 60, TimeUnit.MINUTES);
    }

    /**
     * 通用缓存创建方法
     */
    public <K, V> Cache<K, V> createCache(String name, long maxSize, long expireAfterWrite, TimeUnit timeUnit) {
        Cache<K, V> cache = Caffeine.newBuilder()
                .maximumSize(maxSize)
                .expireAfterWrite(expireAfterWrite, timeUnit)
                .recordStats()
                .build();
        
        cacheRegistry.put(name, cache);
        return cache;
    }

    /**
     * 获取所有缓存统计信息
     */
    public Map<String, CacheStatistics> getCacheStats() {
        Map<String, CacheStatistics> stats = new ConcurrentHashMap<>();
        cacheRegistry.forEach((name, cache) -> {
            var cs = cache.stats();
            stats.put(name, new CacheStatistics(
                    name,
                    cs.hitCount(),
                    cs.missCount(),
                    cs.loadSuccessCount(),
                    cs.loadFailureCount(),
                    cs.totalLoadTime(),
                    cs.evictionCount(),
                    cache.estimatedSize()
            ));
        });
        return stats;
    }

    /**
     * 清除所有缓存
     */
    public void invalidateAll() {
        cacheRegistry.forEach((name, cache) -> cache.invalidateAll());
    }

    /**
     * 清除指定缓存
     */
    public void invalidate(String name) {
        Cache<?, ?> cache = cacheRegistry.get(name);
        if (cache != null) {
            cache.invalidateAll();
        }
    }

    /**
     * 缓存统计信息
     */
    public record CacheStatistics(
            String name,
            long hitCount,
            long missCount,
            long loadSuccessCount,
            long loadFailureCount,
            long totalLoadTimeNanos,
            long evictionCount,
            long estimatedSize
    ) {
        /**
         * 计算命中率
         */
        public double hitRate() {
            long total = hitCount + missCount;
            return total > 0 ? (double) hitCount / total : 0.0;
        }

        /**
         * 计算平均加载时间（毫秒）
         */
        public double avgLoadTimeMillis() {
            return loadSuccessCount > 0 ? (double) totalLoadTimeNanos / loadSuccessCount / 1_000_000 : 0.0;
        }
    }
}
