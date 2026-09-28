package io.rankpeek.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.rankpeek.config.LocalDataPathService;
import io.rankpeek.model.TagConfig;
import io.rankpeek.model.UserStoreSnapshot;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class UserStoreServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void getSnapshot_createsDefaultUserStoreWhenFileDoesNotExist() throws Exception {
        UserStoreService service = newUserStoreService(tempDir);

        UserStoreSnapshot snapshot = service.getSnapshot();

        assertThat(snapshot.getSchemaVersion()).isEqualTo(1);
        assertThat(service.getDefaultMatchQueueMode()).isZero();
        assertThat(snapshot.getTagConfigs()).isEmpty();
        assertThat(snapshot.getMetadata())
                .containsKeys("createdAt", "updatedAt");
        assertThat(Files.exists(userStorePath(tempDir))).isTrue();
        assertThat(userStorePath(tempDir).toString()).contains("user-store");
    }

    @Test
    void defaultMatchQueueModePersistsAcrossServiceInstances() {
        UserStoreService first = newUserStoreService(tempDir);
        first.setDefaultMatchQueueMode(440);

        UserStoreService second = newUserStoreService(tempDir);

        assertThat(second.getDefaultMatchQueueMode()).isEqualTo(440);
    }

    @Test
    void tagConfigsPersistAcrossServiceInstances() {
        TagConfig custom = customTag("custom_persistent");
        UserStoreService first = newUserStoreService(tempDir);
        first.saveTagConfigs(List.of(custom));

        UserStoreService second = newUserStoreService(tempDir);

        assertThat(second.getTagConfigs())
                .extracting(TagConfig::getId)
                .containsExactly("custom_persistent");
    }

    @Test
    void corruptJsonIsBackedUpAndReplacedWithDefaultSnapshot() throws Exception {
        Path storePath = userStorePath(tempDir);
        Files.createDirectories(storePath.getParent());
        Files.writeString(storePath, "{not-json");

        UserStoreService service = newUserStoreService(tempDir);

        assertThat(service.getDefaultMatchQueueMode()).isZero();
        assertThat(Files.readString(storePath)).contains("\"schemaVersion\" : 1");
        assertThat(Files.list(storePath.getParent()))
                .anyMatch(path -> path.getFileName().toString().startsWith("rankpeek-user-store.corrupt-")
                        && path.getFileName().toString().endsWith(".json"));
    }

    private UserStoreService newUserStoreService(Path root) {
        return new UserStoreService(new ObjectMapper(), new TestLocalDataPathService(root));
    }

    private Path userStorePath(Path root) {
        return root.resolve("user-store").resolve("rankpeek-user-store.json");
    }

    private TagConfig customTag(String id) {
        return TagConfig.builder()
                .id(id)
                .name("Custom")
                .desc("Custom tag")
                .good(true)
                .enabled(true)
                .isDefault(false)
                .condition(new TagConfig.TagCondition.CurrentQueueCondition(List.of(420)))
                .build();
    }

    private static final class TestLocalDataPathService extends LocalDataPathService {
        private final Path root;

        private TestLocalDataPathService(Path root) {
            this.root = root;
        }

        @Override
        public Path getUserDataDirectory() {
            return root.resolve("user-store");
        }

        @Override
        public Path getUserStorePath() {
            return getUserDataDirectory().resolve("rankpeek-user-store.json");
        }
    }
}
