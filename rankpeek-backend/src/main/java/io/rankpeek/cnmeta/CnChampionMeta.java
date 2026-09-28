package io.rankpeek.cnmeta;

import java.math.BigDecimal;

public record CnChampionMeta(
        String source,
        String patchKey,
        Integer queueId,
        String tierScope,
        Integer championId,
        String role,
        BigDecimal winRate,
        BigDecimal pickRate,
        BigDecimal banRate,
        BigDecimal avgKda,
        BigDecimal avgGold,
        BigDecimal avgDamage,
        BigDecimal avgDamageTaken,
        BigDecimal avgHeal,
        Integer avgDurationSeconds,
        BigDecimal avgKills,
        BigDecimal avgAssists,
        BigDecimal avgDamageShare,
        BigDecimal avgDamageTakenShare,
        Integer rankIndex,
        String sampleNote,
        String dataSourceNote
) {
}
