package io.rankpeek.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.rankpeek.config.LocalDataPathService;
import io.rankpeek.model.TagConfig;
import io.rankpeek.model.UserStoreSnapshot;
import io.rankpeek.model.UserStoreStatus;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserStoreService {

    private static final int SCHEMA_VERSION = 1;
    private static final Set<Integer> VALID_MATCH_QUEUE_MODES = Set.of(0, 420, 440, 430, 450, 2400);
    private static final DateTimeFormatter CORRUPT_BACKUP_TIMESTAMP =
            DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS");

    private final ObjectMapper objectMapper;
    private final LocalDataPathService localDataPathService;
    private final Object writeLock = new Object();

    private UserStoreSnapshot snapshot;

    @PostConstruct
    public void init() {
        getSnapshot();
        log.info("RankPeek user store path: {}", localDataPathService.getUserStorePath());
    }

    public UserStoreSnapshot getSnapshot() {
        synchronized (writeLock) {
            ensureLoaded();
            return copySnapshot(snapshot);
        }
    }

    public void saveSnapshot(UserStoreSnapshot nextSnapshot) {
        synchronized (writeLock) {
            saveSnapshotLocked(nextSnapshot, true);
        }
    }

    public int getDefaultMatchQueueMode() {
        synchronized (writeLock) {
            ensureLoaded();
            return readDefaultMatchQueueMode(snapshot.getSettings());
        }
    }

    public void setDefaultMatchQueueMode(int mode) {
        synchronized (writeLock) {
            ensureLoaded();
            UserStoreSnapshot nextSnapshot = copySnapshot(snapshot);
            nextSnapshot.setSettings(withDefaultMatchQueueMode(nextSnapshot.getSettings(), normalizeQueueMode(mode)));
            saveSnapshotLocked(nextSnapshot, true);
        }
    }

    /**
     * 玩家是否同意贡献海斗匿名数据。
     *
     * <p>默认关闭：只有玩家在「海斗」页明确同意后才会开启，随时可以在同一处关闭。
     */
    public boolean isHextechContributionEnabled() {
        synchronized (writeLock) {
            ensureLoaded();
            return readHextechContributionEnabled(snapshot.getSettings());
        }
    }

    public void setHextechContributionEnabled(boolean enabled) {
        synchronized (writeLock) {
            ensureLoaded();
            UserStoreSnapshot nextSnapshot = copySnapshot(snapshot);
            nextSnapshot.setSettings(withHextechContributionEnabled(nextSnapshot.getSettings(), enabled));
            saveSnapshotLocked(nextSnapshot, true);
        }
    }

    public List<TagConfig> getTagConfigs() {
        synchronized (writeLock) {
            ensureLoaded();
            return copyTagConfigs(snapshot.getTagConfigs());
        }
    }

    public void saveTagConfigs(List<TagConfig> configs) {
        synchronized (writeLock) {
            ensureLoaded();
            UserStoreSnapshot nextSnapshot = copySnapshot(snapshot);
            nextSnapshot.setTagConfigs(copyTagConfigs(configs));
            saveSnapshotLocked(nextSnapshot, true);
        }
    }

    public UserStoreStatus getStatus() {
        synchronized (writeLock) {
            ensureLoaded();
            Path path = localDataPathService.getUserStorePath();
            return UserStoreStatus.builder()
                    .enabled(true)
                    .path(path.toString())
                    .sizeBytes(sizeOrZero(path))
                    .updatedAt(readLong(snapshot.getMetadata().get("updatedAt"), 0L))
                    .tagConfigCount(snapshot.getTagConfigs().size())
                    .build();
        }
    }

    private void ensureLoaded() {
        if (snapshot != null) {
            return;
        }
        snapshot = loadSnapshot();
    }

    private UserStoreSnapshot loadSnapshot() {
        Path path = localDataPathService.getUserStorePath();
        long now = System.currentTimeMillis();

        if (Files.notExists(path)) {
            UserStoreSnapshot defaultSnapshot = defaultSnapshot(now);
            persistSnapshot(defaultSnapshot, false);
            return defaultSnapshot;
        }

        try {
            UserStoreSnapshot loaded = objectMapper.readValue(path.toFile(), UserStoreSnapshot.class);
            return normalizeSnapshot(loaded, false);
        } catch (Exception e) {
            log.warn("Failed to read RankPeek user store, backing up corrupt file: {}, error={}",
                    path, e.getMessage());
            backupCorruptFile(path);
            UserStoreSnapshot defaultSnapshot = defaultSnapshot(now);
            persistSnapshot(defaultSnapshot, false);
            return defaultSnapshot;
        }
    }

    private void saveSnapshotLocked(UserStoreSnapshot nextSnapshot, boolean failOnError) {
        UserStoreSnapshot normalized = normalizeSnapshot(nextSnapshot, true);
        persistSnapshot(normalized, failOnError);
        snapshot = normalized;
    }

    private void persistSnapshot(UserStoreSnapshot snapshotToPersist, boolean failOnError) {
        Path path = localDataPathService.getUserStorePath();
        Path tempFile = null;
        try {
            Files.createDirectories(path.getParent());
            tempFile = Files.createTempFile(path.getParent(), "rankpeek-user-store-", ".tmp");
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(tempFile.toFile(), snapshotToPersist);
            try {
                Files.move(tempFile, path, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(tempFile, path, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            log.warn("Failed to persist RankPeek user store: {}", path, e);
            if (failOnError) {
                throw new IllegalStateException("Failed to persist RankPeek user store", e);
            }
        } finally {
            if (tempFile != null) {
                try {
                    Files.deleteIfExists(tempFile);
                } catch (IOException e) {
                    log.debug("Failed to remove temporary user store file: {}", tempFile, e);
                }
            }
        }
    }

    private void backupCorruptFile(Path path) {
        if (Files.notExists(path)) {
            return;
        }

        String timestamp = LocalDateTime.now().format(CORRUPT_BACKUP_TIMESTAMP);
        Path backupPath = path.resolveSibling("rankpeek-user-store.corrupt-" + timestamp + ".json");
        try {
            Files.move(path, backupPath, StandardCopyOption.REPLACE_EXISTING);
            log.warn("Backed up corrupt RankPeek user store to {}", backupPath);
        } catch (IOException moveError) {
            try {
                Files.copy(path, backupPath, StandardCopyOption.REPLACE_EXISTING);
                log.warn("Copied corrupt RankPeek user store backup to {}", backupPath);
            } catch (IOException copyError) {
                log.warn("Failed to back up corrupt RankPeek user store: {}", path, copyError);
            }
        }
    }

    private UserStoreSnapshot defaultSnapshot(long timestamp) {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("createdAt", timestamp);
        metadata.put("updatedAt", timestamp);

        return UserStoreSnapshot.builder()
                .schemaVersion(SCHEMA_VERSION)
                .settings(defaultSettings())
                .tagConfigs(new ArrayList<>())
                .metadata(metadata)
                .build();
    }

    private UserStoreSnapshot normalizeSnapshot(UserStoreSnapshot source, boolean touchUpdatedAt) {
        long now = System.currentTimeMillis();
        if (source == null) {
            return defaultSnapshot(now);
        }

        Map<String, Object> metadata = source.getMetadata() == null
                ? new LinkedHashMap<>()
                : new LinkedHashMap<>(source.getMetadata());
        metadata.putIfAbsent("createdAt", now);
        if (touchUpdatedAt || !metadata.containsKey("updatedAt")) {
            metadata.put("updatedAt", now);
        }

        return UserStoreSnapshot.builder()
                .schemaVersion(source.getSchemaVersion() > 0 ? source.getSchemaVersion() : SCHEMA_VERSION)
                .settings(normalizeSettings(source.getSettings()))
                .tagConfigs(copyTagConfigs(source.getTagConfigs()))
                .metadata(metadata)
                .build();
    }

    private Map<String, Object> defaultSettings() {
        return withDefaultMatchQueueMode(new LinkedHashMap<>(), 0);
    }

    private Map<String, Object> normalizeSettings(Map<String, Object> settings) {
        return withDefaultMatchQueueMode(settings, readDefaultMatchQueueMode(settings));
    }

    private Map<String, Object> withDefaultMatchQueueMode(Map<String, Object> settings, int mode) {
        Map<String, Object> nextSettings = settings == null
                ? new LinkedHashMap<>()
                : new LinkedHashMap<>(settings);
        Map<String, Object> matchSettings = objectMap(nextSettings.get("match"));
        matchSettings.put("defaultQueueMode", normalizeQueueMode(mode));
        nextSettings.put("match", matchSettings);
        return nextSettings;
    }

    private int readDefaultMatchQueueMode(Map<String, Object> settings) {
        if (settings == null) {
            return 0;
        }

        Map<String, Object> matchSettings = objectMap(settings.get("match"));
        return normalizeQueueMode(toInt(matchSettings.get("defaultQueueMode")));
    }

    private boolean readHextechContributionEnabled(Map<String, Object> settings) {
        if (settings == null) {
            return false;
        }
        Map<String, Object> hextechSettings = objectMap(settings.get("hextech"));
        return toBoolean(hextechSettings.get("contributionEnabled"));
    }

    private Map<String, Object> withHextechContributionEnabled(Map<String, Object> settings, boolean enabled) {
        Map<String, Object> nextSettings = settings == null
                ? new LinkedHashMap<>()
                : new LinkedHashMap<>(settings);
        Map<String, Object> hextechSettings = objectMap(nextSettings.get("hextech"));
        hextechSettings.put("contributionEnabled", enabled);
        nextSettings.put("hextech", hextechSettings);
        return nextSettings;
    }

    private boolean toBoolean(Object value) {
        if (value instanceof Boolean booleanValue) {
            return booleanValue;
        }
        if (value instanceof String stringValue) {
            return "true".equalsIgnoreCase(stringValue.trim());
        }
        return false;
    }

    private Map<String, Object> objectMap(Object value) {
        Map<String, Object> result = new LinkedHashMap<>();
        if (value instanceof Map<?, ?> source) {
            source.forEach((key, nestedValue) -> {
                if (key != null) {
                    result.put(String.valueOf(key), nestedValue);
                }
            });
        }
        return result;
    }

    private UserStoreSnapshot copySnapshot(UserStoreSnapshot source) {
        UserStoreSnapshot normalized = normalizeSnapshot(source, false);
        return UserStoreSnapshot.builder()
                .schemaVersion(normalized.getSchemaVersion())
                .settings(copyObjectMap(normalized.getSettings()))
                .tagConfigs(copyTagConfigs(normalized.getTagConfigs()))
                .metadata(copyObjectMap(normalized.getMetadata()))
                .build();
    }

    private Map<String, Object> copyObjectMap(Map<String, Object> source) {
        if (source == null || source.isEmpty()) {
            return new LinkedHashMap<>();
        }
        return objectMapper.convertValue(source, new TypeReference<Map<String, Object>>() {
        });
    }

    private List<TagConfig> copyTagConfigs(List<TagConfig> configs) {
        if (configs == null || configs.isEmpty()) {
            return new ArrayList<>();
        }
        return objectMapper.convertValue(configs, new TypeReference<List<TagConfig>>() {
        }).stream()
                .filter(config -> config != null)
                .toList();
    }

    private int normalizeQueueMode(int queueMode) {
        return VALID_MATCH_QUEUE_MODES.contains(queueMode) ? queueMode : 0;
    }

    private int toInt(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value instanceof String stringValue) {
            try {
                return Integer.parseInt(stringValue);
            } catch (NumberFormatException e) {
                return 0;
            }
        }
        if (value instanceof Map<?, ?> map && map.containsKey("value")) {
            return toInt(map.get("value"));
        }
        return 0;
    }

    private long readLong(Object value, long fallback) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String stringValue) {
            try {
                return Long.parseLong(stringValue);
            } catch (NumberFormatException e) {
                return fallback;
            }
        }
        return fallback;
    }

    private long sizeOrZero(Path path) {
        try {
            return Files.exists(path) ? Files.size(path) : 0L;
        } catch (IOException e) {
            return 0L;
        }
    }
}
