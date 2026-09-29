package io.rankpeek.controller;

import io.rankpeek.aspect.PerformanceMonitorAspect;
import io.rankpeek.config.CacheConfig;
import io.rankpeek.model.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 性能监控 API
 */
@RestController
@RequestMapping("/api/v1/performance")
@RequiredArgsConstructor
public class PerformanceController {

    private final PerformanceMonitorAspect performanceMonitor;
    private final CacheConfig cacheConfig;

    /**
     * 获取方法性能统计
     */
    @GetMapping("/methods")
    public ApiResponse<List<MethodPerformance>> getMethodPerformance() {
        var stats = performanceMonitor.getMethodStats();
        List<MethodPerformance> result = stats.entrySet().stream()
                .map(entry -> new MethodPerformance(
                        entry.getKey(),
                        entry.getValue().getCallCount(),
                        entry.getValue().getSuccessRate(),
                        entry.getValue().getAvgTimeMillis(),
                        entry.getValue().getMaxTimeMillis(),
                        entry.getValue().getMinTimeMillis()
                ))
                .sorted((a, b) -> Double.compare(b.avgTimeMillis(), a.avgTimeMillis()))
                .toList();
        return ApiResponse.success(result);
    }

    /**
     * 获取缓存统计
     */
    @GetMapping("/cache")
    public ApiResponse<List<CachePerformance>> getCachePerformance() {
        var stats = cacheConfig.getCacheStats();
        List<CachePerformance> result = stats.values().stream()
                .map(cacheStatistics -> new CachePerformance(
                        cacheStatistics.name(),
                        cacheStatistics.estimatedSize(),
                        cacheStatistics.hitCount(),
                        cacheStatistics.missCount(),
                        cacheStatistics.hitRate(),
                        cacheStatistics.avgLoadTimeMillis(),
                        cacheStatistics.evictionCount()
                ))
                .sorted((a, b) -> Double.compare(b.hitRate(), a.hitRate()))
                .toList();
        return ApiResponse.success(result);
    }

    /**
     * 获取总体性能摘要
     */
    @GetMapping("/summary")
    public ApiResponse<PerformanceSummary> getPerformanceSummary() {
        var methodStats = performanceMonitor.getMethodStats();
        var cacheStats = cacheConfig.getCacheStats();

        // 计算总体统计
        long totalCalls = methodStats.values().stream()
                .mapToLong(PerformanceMonitorAspect.MethodStats::getCallCount)
                .sum();
        
        double avgSuccessRate = methodStats.values().stream()
                .mapToDouble(PerformanceMonitorAspect.MethodStats::getSuccessRate)
                .average()
                .orElse(0.0);
        
        double avgResponseTime = methodStats.values().stream()
                .mapToDouble(PerformanceMonitorAspect.MethodStats::getAvgTimeMillis)
                .average()
                .orElse(0.0);

        // 计算缓存总体统计
        long totalCacheHits = cacheStats.values().stream()
                .mapToLong(CacheConfig.CacheStatistics::hitCount)
                .sum();
        
        long totalCacheMisses = cacheStats.values().stream()
                .mapToLong(CacheConfig.CacheStatistics::missCount)
                .sum();
        
        double overallCacheHitRate = totalCacheHits + totalCacheMisses > 0
                ? (double) totalCacheHits / (totalCacheHits + totalCacheMisses)
                : 0.0;

        return ApiResponse.success(new PerformanceSummary(
                totalCalls,
                avgSuccessRate,
                avgResponseTime,
                methodStats.size(),
                cacheStats.size(),
                overallCacheHitRate
        ));
    }

    /**
     * 清除性能统计
     */
    @PostMapping("/reset")
    public ApiResponse<Void> resetPerformanceStats() {
        performanceMonitor.clearStats();
        return ApiResponse.success();
    }

    /**
     * 清除所有缓存
     */
    @PostMapping("/cache/clear")
    public ApiResponse<Void> clearAllCache() {
        cacheConfig.invalidateAll();
        return ApiResponse.success();
    }

    /**
     * 方法性能数据
     */
    public record MethodPerformance(
            String methodName,
            long callCount,
            double successRate,
            double avgTimeMillis,
            double maxTimeMillis,
            double minTimeMillis
    ) {
    }

    /**
     * 缓存性能数据
     */
    public record CachePerformance(
            String cacheName,
            long size,
            long hits,
            long misses,
            double hitRate,
            double avgLoadTimeMillis,
            long evictions
    ) {
    }

    /**
     * 性能摘要
     */
    public record PerformanceSummary(
            long totalMethodCalls,
            double avgSuccessRate,
            double avgResponseTimeMillis,
            int monitoredMethods,
            int cachedTypes,
            double overallCacheHitRate
    ) {
    }
}
