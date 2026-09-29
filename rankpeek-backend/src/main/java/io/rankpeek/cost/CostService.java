package io.rankpeek.cost;

import io.rankpeek.ai.AiTokenUsage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class CostService {

    private static final List<String> AI_USAGE_BUCKET_ORDER = List.of("coach", "pregame", "postgame");

    private final CostRepository repository;
    private final AiCostCalculator calculator;
    private final Clock clock;

    @Autowired
    public CostService(CostRepository repository, AiCostCalculator calculator) {
        this(repository, calculator, Clock.systemDefaultZone());
    }

    CostService(CostRepository repository, AiCostCalculator calculator, Clock clock) {
        this.repository = repository;
        this.calculator = calculator;
        this.clock = clock;
    }

    public AiCostBreakdown recordAiAnalysis(
            long runId,
            String source,
            AiTokenUsage usage,
            AiPricing pricing
    ) {
        AiCostBreakdown cost = calculator.calculate(usage, pricing);
        recordAggregateCost(source, cost.totalCny());
        return cost;
    }

    public CostSummaryResponse summary(LocalDate from, LocalDate to) {
        LocalDate today = LocalDate.now(clock);
        LocalDate normalizedFrom = from == null ? today : from;
        LocalDate normalizedTo = to == null ? normalizedFrom : to;
        if (normalizedTo.isBefore(normalizedFrom)) {
            LocalDate swap = normalizedFrom;
            normalizedFrom = normalizedTo;
            normalizedTo = swap;
        }
        CostRollup rollup = ensureRollupFor(today);
        BigDecimal aiCost = selectRollupTotal(rollup, normalizedFrom, normalizedTo, today);
        return new CostSummaryResponse(
                normalizedFrom,
                normalizedTo,
                aiCost
        );
    }

    public CostEventListResponse listEvents(String type, int limit, int offset) {
        ensureRollupFor(LocalDate.now(clock));
        return new CostEventListResponse(List.of());
    }

    public AiCostUsageSummaryResponse aiUsageSummary() {
        CostRollup rollup = ensureRollupFor(LocalDate.now(clock));

        return new AiCostUsageSummaryResponse(List.of(
                new AiCostUsageBucket("coach", rollup.coachCount(), rollup.coachTotalCny()),
                new AiCostUsageBucket("pregame", rollup.pregameCount(), rollup.pregameTotalCny()),
                new AiCostUsageBucket("postgame", rollup.postgameCount(), rollup.postgameTotalCny())
        ));
    }

    private void recordAggregateCost(String source, BigDecimal amountCny) {
        LocalDate today = LocalDate.now(clock);
        CostRollup rollup = ensureRollupFor(today);
        BigDecimal safeAmount = amountCny == null ? BigDecimal.ZERO : amountCny;
        String bucket = normalizeAiUsageSource(source);

        long coachCount = rollup.coachCount();
        BigDecimal coachTotal = rollup.coachTotalCny();
        long pregameCount = rollup.pregameCount();
        BigDecimal pregameTotal = rollup.pregameTotalCny();
        long postgameCount = rollup.postgameCount();
        BigDecimal postgameTotal = rollup.postgameTotalCny();

        if ("coach".equals(bucket)) {
            coachCount += 1;
            coachTotal = coachTotal.add(safeAmount);
        } else if ("pregame".equals(bucket)) {
            pregameCount += 1;
            pregameTotal = pregameTotal.add(safeAmount);
        } else if ("postgame".equals(bucket)) {
            postgameCount += 1;
            postgameTotal = postgameTotal.add(safeAmount);
        }

        repository.upsertCostRollup(new CostRollup(
                rollup.currentMonthKey(),
                rollup.currentMonthTotalCny().add(safeAmount),
                rollup.lastMonthKey(),
                rollup.lastMonthTotalCny(),
                rollup.todayKey(),
                rollup.todayTotalCny().add(safeAmount),
                coachCount,
                coachTotal,
                pregameCount,
                pregameTotal,
                postgameCount,
                postgameTotal,
                clock.millis()
        ));
        repository.deleteAllEvents();
    }

    private CostRollup ensureRollupFor(LocalDate today) {
        CostRollup rollup = repository.findCostRollup();
        if (rollup == null) {
            return initializeRollupFromLegacyEvents(today);
        }

        CostRollup normalized = normalizeRollupWindow(rollup, today);
        if (!normalized.equals(rollup)) {
            repository.upsertCostRollup(normalized);
        }
        repository.deleteAllEvents();
        return normalized;
    }

    private CostRollup initializeRollupFromLegacyEvents(LocalDate today) {
        ZoneId zoneId = clock.getZone();
        YearMonth currentMonth = YearMonth.from(today);
        YearMonth lastMonth = currentMonth.minusMonths(1);
        BigDecimal todayTotal = repository.sumEventsBetween(dayStartMillis(today, zoneId), dayEndMillis(today, zoneId), "ai_analysis");
        BigDecimal currentMonthTotal = repository.sumEventsBetween(
                dayStartMillis(currentMonth.atDay(1), zoneId),
                dayEndMillis(today, zoneId),
                "ai_analysis"
        );
        BigDecimal lastMonthTotal = repository.sumEventsBetween(
                dayStartMillis(lastMonth.atDay(1), zoneId),
                dayEndMillis(lastMonth.atEndOfMonth(), zoneId),
                "ai_analysis"
        );
        Map<String, Long> counts = new LinkedHashMap<>();
        Map<String, BigDecimal> totals = new LinkedHashMap<>();
        for (String key : AI_USAGE_BUCKET_ORDER) {
            counts.put(key, 0L);
            totals.put(key, BigDecimal.ZERO);
        }
        for (AiCostSourceAggregate aggregate : repository.listAiAnalysisCostBySource()) {
            String bucket = normalizeAiUsageSource(aggregate.source());
            if (bucket == null || !counts.containsKey(bucket)) {
                continue;
            }
            counts.put(bucket, counts.get(bucket) + aggregate.count());
            totals.put(bucket, totals.get(bucket).add(nullToZero(aggregate.totalCostCny())));
        }

        CostRollup rollup = new CostRollup(
                currentMonth.toString(),
                currentMonthTotal,
                lastMonth.toString(),
                lastMonthTotal,
                today.toString(),
                todayTotal,
                counts.get("coach"),
                totals.get("coach"),
                counts.get("pregame"),
                totals.get("pregame"),
                counts.get("postgame"),
                totals.get("postgame"),
                clock.millis()
        );
        repository.upsertCostRollup(rollup);
        repository.deleteAllEvents();
        return rollup;
    }

    private CostRollup normalizeRollupWindow(CostRollup rollup, LocalDate today) {
        YearMonth currentMonth = YearMonth.from(today);
        YearMonth lastMonth = currentMonth.minusMonths(1);
        String currentMonthKey = currentMonth.toString();
        String lastMonthKey = lastMonth.toString();
        String todayKey = today.toString();

        BigDecimal currentMonthTotal = rollup.currentMonthTotalCny();
        BigDecimal lastMonthTotal = rollup.lastMonthTotalCny();
        if (!currentMonthKey.equals(rollup.currentMonthKey())) {
            lastMonthTotal = lastMonthKey.equals(rollup.currentMonthKey())
                    ? currentMonthTotal
                    : BigDecimal.ZERO;
            currentMonthTotal = BigDecimal.ZERO;
        }

        BigDecimal todayTotal = todayKey.equals(rollup.todayKey())
                ? rollup.todayTotalCny()
                : BigDecimal.ZERO;

        return new CostRollup(
                currentMonthKey,
                currentMonthTotal,
                lastMonthKey,
                lastMonthTotal,
                todayKey,
                todayTotal,
                rollup.coachCount(),
                rollup.coachTotalCny(),
                rollup.pregameCount(),
                rollup.pregameTotalCny(),
                rollup.postgameCount(),
                rollup.postgameTotalCny(),
                clock.millis()
        );
    }

    private BigDecimal selectRollupTotal(CostRollup rollup, LocalDate from, LocalDate to, LocalDate today) {
        YearMonth currentMonth = YearMonth.from(today);
        YearMonth lastMonth = currentMonth.minusMonths(1);
        if (from.equals(today) && to.equals(today)) {
            return rollup.todayTotalCny();
        }
        if (from.equals(currentMonth.atDay(1)) && to.equals(today)) {
            return rollup.currentMonthTotalCny();
        }
        if (from.equals(lastMonth.atDay(1)) && to.equals(lastMonth.atEndOfMonth())) {
            return rollup.lastMonthTotalCny();
        }
        return BigDecimal.ZERO;
    }

    private long dayStartMillis(LocalDate date, ZoneId zoneId) {
        return date.atStartOfDay(zoneId).toInstant().toEpochMilli();
    }

    private long dayEndMillis(LocalDate date, ZoneId zoneId) {
        return date.plusDays(1).atStartOfDay(zoneId).toInstant().toEpochMilli() - 1;
    }

    private static BigDecimal nullToZero(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private static String normalizeAiUsageSource(String source) {
        String normalized = source == null
                ? ""
                : source.trim().toLowerCase().replace('-', '_');
        if (normalized.isBlank()) {
            return null;
        }
        if (normalized.contains("coach")) {
            return "coach";
        }
        if (normalized.contains("pregame") || normalized.contains("pre_game") || normalized.contains("before")) {
            return "pregame";
        }
        if (
                normalized.contains("postgame")
                        || normalized.contains("post_game")
                        || normalized.contains("review")
                        || normalized.contains("praise")
                        || normalized.contains("compliment")
                        || normalized.contains("after")
        ) {
            return "postgame";
        }
        return null;
    }
}
