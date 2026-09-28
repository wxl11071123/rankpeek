package io.rankpeek.cnmeta.sync;

import io.rankpeek.cnmeta.CnMetaRoles;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class CnMetaSyncService {
    private final CnMetaSyncProperties properties;
    private final CnMetaSyncRepository repository;
    private final Map<String, CnMetaSourceClient> clientsBySource;

    public CnMetaSyncService(
            CnMetaSyncProperties properties,
            CnMetaSyncRepository repository,
            List<CnMetaSourceClient> sourceClients
    ) {
        this.properties = properties;
        this.repository = repository;
        this.clientsBySource = indexClients(sourceClients);
    }

    public CnMetaSyncResult syncOnce(String patchKey, Integer queueId, String tierScope, String role) {
        return syncOnceWithSource(properties.source(), patchKey, queueId, tierScope, role);
    }

    public CnMetaSyncResult syncOnceWithSource(String source, String patchKey, Integer queueId, String tierScope, String role) {
        CnMetaSourceClient client = clientFor(source);
        String storageRole = isRealSourceAlias(client.source()) ? CnMetaRoles.ALL : normalizeRole(role);
        Instant startedAt = Instant.now();
        CnMetaSyncJob job = repository.createJob(client.source(), patchKey, queueId, tierScope, storageRole, startedAt);
        int requestCount = 0;
        try {
            CnMetaSourcePayload payload = null;
            int maxAttempts = Math.max(1, properties.maxRetries() + 1);
            for (int attempt = 1; attempt <= maxAttempts; attempt++) {
                requestCount = attempt;
                try {
                    payload = client.fetchChampionStats(patchKey, queueId, tierScope, storageRole);
                    break;
                } catch (CnMetaSourceException exception) {
                    if (exception.stopSignal() || attempt == maxAttempts) {
                        throw exception;
                    }
                }
            }
            if (payload == null) {
                throw new CnMetaSourceException("CN meta source returned no payload");
            }
            String contentHash = hash(payload.rawContent());
            List<CnMetaChampionStatRow> rows = storageRows(payload.rows(), tierScope, storageRole, payload.source());
            repository.insertChampionStats(payload.source(), patchKey, queueId, tierScope, storageRole, rows, Instant.now());
            CnMetaSyncJob finished = repository.updateJobFinished(
                    job.id(),
                    "SUCCESS",
                    requestCount,
                    rows.size(),
                    contentHash,
                    null,
                    Instant.now()
            );
            return toResult(finished);
        } catch (CnMetaSourceException exception) {
            String status = exception.stopSignal()
                    || (exception.httpStatus() != null && properties.stopOnHttpStatus().contains(exception.httpStatus()))
                    ? "STOPPED"
                    : "FAILED";
            CnMetaSyncJob finished = repository.updateJobFinished(
                    job.id(),
                    status,
                    requestCount,
                    0,
                    null,
                    exception.getMessage(),
                    Instant.now()
            );
            return toResult(finished);
        }
    }

    public List<CnMetaSyncResult> syncConfiguredMatrix(String patchKey) {
        return properties.tiers().stream()
                .map(tier -> syncOnce(patchKey, properties.defaultQueueId(), tier, CnMetaRoles.ALL))
                .toList();
    }

    public List<CnMetaSyncJob> findRecentJobs(int limit) {
        return repository.findRecentJobs(limit);
    }

    private CnMetaSourceClient clientFor(String source) {
        CnMetaSourceClient client = clientsBySource.get(normalizeSource(source));
        if (client == null) {
            throw new CnMetaSourceException("Unsupported CN meta source: " + source);
        }
        return client;
    }

    private static List<CnMetaChampionStatRow> storageRows(
            List<CnMetaChampionStatRow> rows,
            String tierScope,
            String role,
            String source
    ) {
        return rows.stream()
                .map(row -> new CnMetaChampionStatRow(
                        row.championId(),
                        row.role() == null ? role : row.role(),
                        row.tierScope() == null ? tierScope : row.tierScope(),
                        row.winRate(),
                        row.pickRate(),
                        row.banRate(),
                        row.avgKda(),
                        row.avgGold(),
                        row.avgDamageShare(),
                        row.avgDamageTakenShare(),
                        row.rankIndex(),
                        row.sampleNote(),
                        row.avgDamage(),
                        row.avgDamageTaken(),
                        row.avgHeal(),
                        row.avgDurationSeconds(),
                        row.avgKills(),
                        row.avgAssists(),
                        "real-101".equalsIgnoreCase(source) && (row.dataSourceNote() == null || row.dataSourceNote().isBlank())
                                ? CnMetaRoles.REAL_101_AGGREGATE_NOTE
                                : row.dataSourceNote()
                ))
                .toList();
    }

    private static Map<String, CnMetaSourceClient> indexClients(List<CnMetaSourceClient> clients) {
        Map<String, CnMetaSourceClient> indexed = new HashMap<>();
        for (CnMetaSourceClient client : clients) {
            String source = normalizeSource(client.source());
            indexed.put(source, client);
            if ("mock-101".equals(source)) indexed.put("mock", client);
            if ("real-101".equals(source)) indexed.put("real", client);
        }
        return indexed;
    }

    private static boolean isRealSourceAlias(String source) {
        return "real".equalsIgnoreCase(source) || "real-101".equalsIgnoreCase(source);
    }

    private static String normalizeSource(String value) {
        return value == null || value.isBlank() ? "mock" : value.trim().toLowerCase(Locale.ROOT);
    }

    private static String normalizeRole(String value) {
        return value == null || value.isBlank() ? CnMetaRoles.ALL : value.trim().toUpperCase(Locale.ROOT);
    }

    private static String hash(String rawContent) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(rawContent.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to hash CN meta payload", exception);
        }
    }

    private static CnMetaSyncResult toResult(CnMetaSyncJob job) {
        return new CnMetaSyncResult(
                job.id(),
                job.source(),
                job.patchKey(),
                job.queueId(),
                job.tierScope(),
                job.role(),
                job.status(),
                job.requestCount(),
                job.rowCount(),
                job.contentHash(),
                job.errorMessage(),
                job.startedAt(),
                job.finishedAt()
        );
    }
}
