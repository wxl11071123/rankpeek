package io.rankpeek.aspect;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Pointcut;
import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.LongAdder;

/**
 * 性能监控切面
 * 监控方法执行时间和调用次数
 */
@Getter
@Slf4j
@Aspect
@Component
public class PerformanceMonitorAspect {

    /**
     * 方法执行统计
     * -- GETTER --
     *  获取所有方法的统计信息

     */
    private final ConcurrentHashMap<String, MethodStats> methodStats = new ConcurrentHashMap<>();

    /**
     * 监控所有 Service 层方法
     */
    @Pointcut("execution(* io.rankpeek.service..*.*(..))")
    public void serviceMethods() {
    }

    /**
     * 监控所有 Controller 层方法
     */
    @Pointcut("execution(* io.rankpeek.controller..*.*(..))")
    public void controllerMethods() {
    }

    @Around("serviceMethods() || controllerMethods()")
    public Object monitorPerformance(ProceedingJoinPoint joinPoint) throws Throwable {
        String methodName = joinPoint.getSignature().toShortString();
        MethodStats stats = methodStats.computeIfAbsent(methodName, k -> new MethodStats());

        long startTime = System.nanoTime();
        try {
            Object result = joinPoint.proceed();
            stats.recordSuccess(System.nanoTime() - startTime);
            return result;
        } catch (Throwable e) {
            stats.recordFailure(System.nanoTime() - startTime);
            throw e;
        }
    }

    /**
     * 清除统计信息
     */
    public void clearStats() {
        methodStats.clear();
    }

    /**
     * 方法执行统计
     */
    public static class MethodStats {
        private final LongAdder callCount = new LongAdder();
        private final LongAdder successCount = new LongAdder();
        private final LongAdder failureCount = new LongAdder();
        private final AtomicLong totalTimeNanos = new AtomicLong(0);
        private final AtomicLong maxTimeNanos = new AtomicLong(0);
        private final AtomicLong minTimeNanos = new AtomicLong(Long.MAX_VALUE);

        public void recordSuccess(long durationNanos) {
            callCount.increment();
            successCount.increment();
            totalTimeNanos.addAndGet(durationNanos);
            updateMaxTime(durationNanos);
            updateMinTime(durationNanos);
        }

        public void recordFailure(long durationNanos) {
            callCount.increment();
            failureCount.increment();
            totalTimeNanos.addAndGet(durationNanos);
            updateMaxTime(durationNanos);
            updateMinTime(durationNanos);
        }

        private void updateMaxTime(long durationNanos) {
            long currentMax = maxTimeNanos.get();
            while (durationNanos > currentMax) {
                if (maxTimeNanos.compareAndSet(currentMax, durationNanos)) {
                    break;
                }
                currentMax = maxTimeNanos.get();
            }
        }

        private void updateMinTime(long durationNanos) {
            long currentMin = minTimeNanos.get();
            while (durationNanos < currentMin) {
                if (minTimeNanos.compareAndSet(currentMin, durationNanos)) {
                    break;
                }
                currentMin = minTimeNanos.get();
            }
        }

        public long getCallCount() {
            return callCount.sum();
        }

        public long getSuccessCount() {
            return successCount.sum();
        }

        public long getFailureCount() {
            return failureCount.sum();
        }

        public double getSuccessRate() {
            long total = callCount.sum();
            return total > 0 ? (double) successCount.sum() / total : 0.0;
        }

        public double getAvgTimeMillis() {
            long count = callCount.sum();
            return count > 0 ? totalTimeNanos.get() / (double) count / 1_000_000 : 0.0;
        }

        public double getMaxTimeMillis() {
            long max = maxTimeNanos.get();
            return max == 0 ? 0.0 : max / 1_000_000.0;
        }

        public double getMinTimeMillis() {
            long min = minTimeNanos.get();
            return min == Long.MAX_VALUE ? 0.0 : min / 1_000_000.0;
        }

        /**
         * 格式化
         */
        public String toSummary() {
            return String.format(
                    "调用：%d 次，成功：%.2f%%，平均：%.2fms，最大：%.2fms，最小：%.2fms",
                    getCallCount(),
                    getSuccessRate() * 100,
                    getAvgTimeMillis(),
                    getMaxTimeMillis(),
                    getMinTimeMillis()
            );
        }
    }
}
