package io.rankpeek.ai;

import io.rankpeek.cnmeta.CnChampionMeta;
import io.rankpeek.cnmeta.CnMetaService;
import io.rankpeek.esports.LplChampionUsage;
import io.rankpeek.esports.LplEsportsService;
import io.rankpeek.patch.PatchChange;
import io.rankpeek.patch.PatchService;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class LocalAiPromptContextService {
    private final CnMetaService cnMetaService;
    private final PatchService patchService;
    private final LplEsportsService lplEsportsService;

    public LocalAiPromptContextService(
            CnMetaService cnMetaService,
            PatchService patchService,
            LplEsportsService lplEsportsService
    ) {
        this.cnMetaService = cnMetaService;
        this.patchService = patchService;
        this.lplEsportsService = lplEsportsService;
    }

    public String pregameContext(PregameAnalysisRequest request) {
        if (request == null || request.championId() == null || request.championId() <= 0) {
            return "Local data unavailable: no champion id was provided.";
        }
        String patchKey = blankToDefault(request.patchKey(), "local-current");
        String role = blankToDefault(request.role(), "ALL").toUpperCase();
        StringBuilder builder = new StringBuilder("Local RankPeek context:\n");
        appendCnMeta(builder, request.championId());
        appendPatch(builder, patchKey, request.championId());
        appendLpl(builder, patchKey, request.championId(), role);
        return builder.toString();
    }

    private void appendCnMeta(StringBuilder builder, Integer championId) {
        try {
            List<CnChampionMeta> rows = cnMetaService.findLatestChampionMeta(championId, "PLATINUM_PLUS");
            if (rows.isEmpty()) {
                builder.append("- CN meta: local data unavailable.\n");
                return;
            }
            CnChampionMeta meta = rows.getFirst();
            builder.append("- CN meta: patch=")
                    .append(meta.patchKey())
                    .append(", tier=")
                    .append(meta.tierScope())
                    .append(", role=")
                    .append(meta.role())
                    .append(", winRate=")
                    .append(meta.winRate())
                    .append(", pickRate=")
                    .append(meta.pickRate())
                    .append(".\n");
        } catch (Exception ignored) {
            builder.append("- CN meta: local data unavailable.\n");
        }
    }

    private void appendPatch(StringBuilder builder, String patchKey, Integer championId) {
        try {
            List<PatchChange> changes = patchService.findPatchChanges(patchKey).stream()
                    .filter(change -> "CHAMPION".equalsIgnoreCase(change.targetType()))
                    .filter(change -> String.valueOf(championId).equals(change.targetKey()))
                    .limit(3)
                    .toList();
            if (changes.isEmpty()) {
                builder.append("- Patch notes: local data unavailable.\n");
                return;
            }
            builder.append("- Patch notes: ");
            for (int i = 0; i < changes.size(); i++) {
                if (i > 0) {
                    builder.append(" | ");
                }
                PatchChange change = changes.get(i);
                builder.append(blankToDefault(change.summaryEn(), change.summaryZh()));
            }
            builder.append('\n');
        } catch (Exception ignored) {
            builder.append("- Patch notes: local data unavailable.\n");
        }
    }

    private void appendLpl(StringBuilder builder, String patchKey, Integer championId, String role) {
        try {
            List<LplChampionUsage> usages = lplEsportsService.findChampionUsage(patchKey, championId, role).stream()
                    .limit(3)
                    .toList();
            if (usages.isEmpty()) {
                builder.append("- LPL usage: local data unavailable.\n");
                return;
            }
            builder.append("- LPL usage: ");
            for (int i = 0; i < usages.size(); i++) {
                if (i > 0) {
                    builder.append(" | ");
                }
                LplChampionUsage usage = usages.get(i);
                builder.append(usage.playerName())
                        .append(' ')
                        .append(usage.kills())
                        .append('/')
                        .append(usage.deaths())
                        .append('/')
                        .append(usage.assists());
            }
            builder.append('\n');
        } catch (Exception ignored) {
            builder.append("- LPL usage: local data unavailable.\n");
        }
    }

    private String blankToDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }
}
