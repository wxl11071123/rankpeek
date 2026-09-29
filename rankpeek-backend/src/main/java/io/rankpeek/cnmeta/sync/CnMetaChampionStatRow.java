package io.rankpeek.cnmeta.sync;

import java.math.BigDecimal;

public record CnMetaChampionStatRow(
        Integer championId,
        String role,
        String tierScope,
        BigDecimal winRate,
        BigDecimal pickRate,
        BigDecimal banRate,
        BigDecimal avgKda,
        BigDecimal avgGold,
        BigDecimal avgDamageShare,
        BigDecimal avgDamageTakenShare,
        Integer rankIndex,
        String sampleNote,
        BigDecimal avgDamage,
        BigDecimal avgDamageTaken,
        BigDecimal avgHeal,
        Integer avgDurationSeconds,
        BigDecimal avgKills,
        BigDecimal avgAssists,
        String dataSourceNote
) {
}
