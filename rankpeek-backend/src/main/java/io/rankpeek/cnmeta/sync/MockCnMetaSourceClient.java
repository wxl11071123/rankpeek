package io.rankpeek.cnmeta.sync;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Component
public class MockCnMetaSourceClient implements CnMetaSourceClient {
    @Override
    public String source() {
        return "mock-101";
    }

    @Override
    public CnMetaSourcePayload fetchChampionStats(String patchKey, Integer queueId, String tierScope, String role) {
        return new CnMetaSourcePayload(
                source(),
                "mock://cn-meta/" + patchKey,
                "%s|%d|%s|%s".formatted(patchKey, queueId, tierScope, role),
                200,
                "mock-cn-meta-" + patchKey + "-" + tierScope + "-" + role,
                LocalDate.now(),
                List.of(
                        row(81, role, tierScope, "0.5123", 8),
                        row(103, role, tierScope, "0.5010", 12),
                        row(238, role, tierScope, "0.4930", 18)
                )
        );
    }

    private static CnMetaChampionStatRow row(int championId, String role, String tierScope, String winRate, int rankIndex) {
        return new CnMetaChampionStatRow(
                championId,
                role,
                tierScope,
                new BigDecimal(winRate),
                new BigDecimal("0.1200"),
                new BigDecimal("0.0300"),
                new BigDecimal("3.25"),
                new BigDecimal("12100"),
                new BigDecimal("0.28"),
                new BigDecimal("0.19"),
                rankIndex,
                "local mock CN meta",
                new BigDecimal("25000"),
                new BigDecimal("18000"),
                new BigDecimal("1200"),
                1800,
                new BigDecimal("6"),
                new BigDecimal("8"),
                "mock source"
        );
    }
}
