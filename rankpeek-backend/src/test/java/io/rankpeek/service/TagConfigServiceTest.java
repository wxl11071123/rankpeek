package io.rankpeek.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.rankpeek.config.LocalDataPathService;
import io.rankpeek.model.TagConfig;
import io.rankpeek.model.TagConfig.MatchRefresh;
import io.rankpeek.model.TagConfig.Operator;
import io.rankpeek.model.TagConfig.TagCondition;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

class TagConfigServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void defaultTagsRemoveForbiddenPublicTagsAndUseScoutThresholds() {
        TagConfigService service = new TagConfigService(newUserStoreService(tempDir));

        Map<String, TagConfig> defaults = service.getDefaultTags().stream()
                .collect(Collectors.toMap(TagConfig::getId, item -> item));

        assertThat(defaults.values()).extracting(TagConfig::getName)
                .doesNotContain("暴毙", "摆烂", "开黑仔");

        MatchRefresh.AverageRefresh highWinRate = averageRefresh(defaults.get("default_high_win_rate"));
        assertThat(highWinRate.getMetric()).isEqualTo("win");
        assertThat(highWinRate.getOp()).isEqualTo(Operator.GTE);
        assertThat(highWinRate.getValue()).isEqualTo(0.60);

        MatchRefresh.AverageRefresh slump = averageRefresh(defaults.get("default_slump"));
        assertThat(slump.getMetric()).isEqualTo("win");
        assertThat(slump.getOp()).isEqualTo(Operator.LT);
        assertThat(slump.getValue()).isEqualTo(0.40);

        MatchRefresh.CountRefresh casual = countRefreshFromCasual(defaults.get("default_casual"));
        assertThat(casual.getOp()).isEqualTo(Operator.GT);
        assertThat(casual.getValue()).isEqualTo(10.0);
    }

    @Test
    void initMergesDefaultsWithUserStoreAndPreservesCustomTags() {
        UserStoreService userStoreService = newUserStoreService(tempDir);
        userStoreService.saveTagConfigs(List.of(
                TagConfig.builder()
                        .id("default_streak_win")
                        .enabled(false)
                        .isDefault(true)
                        .build(),
                customTag("custom_saved")
        ));
        TagConfigService service = new TagConfigService(userStoreService);

        service.init();

        Map<String, TagConfig> configs = service.getAllTagConfigs().stream()
                .collect(Collectors.toMap(TagConfig::getId, item -> item));
        assertThat(configs.get("default_streak_win").getEnabled()).isFalse();
        assertThat(configs).containsKey("custom_saved");
        assertThat(userStoreService.getTagConfigs())
                .extracting(TagConfig::getId)
                .contains("default_streak_win", "custom_saved");
    }

    @Test
    void initMigratesLegacyTagConfigWhenUserStoreHasNoTags() throws Exception {
        Path legacyPath = tempDir.resolve("tag-config.json");
        ObjectMapper objectMapper = new ObjectMapper();
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(legacyPath.toFile(), List.of(
                TagConfig.builder()
                        .id("default_streak_loss")
                        .enabled(false)
                        .isDefault(true)
                        .build(),
                customTag("legacy_custom")
        ));
        UserStoreService userStoreService = newUserStoreService(tempDir.resolve("new-store"));
        TagConfigService service = new TagConfigService(userStoreService, objectMapper, legacyPath);

        service.init();

        Map<String, TagConfig> configs = service.getAllTagConfigs().stream()
                .collect(Collectors.toMap(TagConfig::getId, item -> item));
        assertThat(configs.get("default_streak_loss").getEnabled()).isFalse();
        assertThat(configs).containsKey("legacy_custom");
        assertThat(userStoreService.getTagConfigs())
                .extracting(TagConfig::getId)
                .contains("legacy_custom");
        assertThat(Files.exists(legacyPath)).isTrue();
    }

    private MatchRefresh.AverageRefresh averageRefresh(TagConfig tag) {
        return (MatchRefresh.AverageRefresh) history(tag).getRefresh();
    }

    private MatchRefresh.CountRefresh countRefreshFromCasual(TagConfig tag) {
        assertThat(tag).isNotNull();
        assertThat(tag.getCondition()).isInstanceOf(TagCondition.AndCondition.class);
        TagCondition.AndCondition and = (TagCondition.AndCondition) tag.getCondition();
        assertThat(and.getConditions()).anyMatch(TagCondition.NotCondition.class::isInstance);
        TagCondition.HistoryCondition history = and.getConditions().stream()
                .filter(TagCondition.HistoryCondition.class::isInstance)
                .map(TagCondition.HistoryCondition.class::cast)
                .findFirst()
                .orElseThrow();
        return (MatchRefresh.CountRefresh) history.getRefresh();
    }

    private TagCondition.HistoryCondition history(TagConfig tag) {
        assertThat(tag).isNotNull();
        assertThat(tag.getCondition()).isInstanceOf(TagCondition.HistoryCondition.class);
        return (TagCondition.HistoryCondition) tag.getCondition();
    }

    private UserStoreService newUserStoreService(Path root) {
        return new UserStoreService(new ObjectMapper(), new TestLocalDataPathService(root));
    }

    private TagConfig customTag(String id) {
        return TagConfig.builder()
                .id(id)
                .name("Custom")
                .desc("Custom tag")
                .good(true)
                .enabled(true)
                .isDefault(false)
                .condition(new TagCondition.CurrentQueueCondition(List.of(420)))
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
