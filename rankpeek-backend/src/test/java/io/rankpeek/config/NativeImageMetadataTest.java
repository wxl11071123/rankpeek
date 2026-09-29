package io.rankpeek.config;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

class NativeImageMetadataTest {

    @Test
    void registersCaffeineCachesUsedDuringBackendStartup() throws Exception {
        String reflectConfig = Files.readString(Path.of(
                "src/main/resources/META-INF/native-image/reflect-config.json"));

        assertThat(reflectConfig)
                .contains("com.github.benmanes.caffeine.cache.SSMWW")
                .contains("com.github.benmanes.caffeine.cache.SSMSW")
                .contains("com.github.benmanes.caffeine.cache.PSWMW")
                .contains("com.github.benmanes.caffeine.cache.PSWMS");
    }

    @Test
    void registersSgpServerConfigUsedByNativeJacksonDeserialization() throws Exception {
        String reflectConfig = Files.readString(Path.of(
                "src/main/resources/META-INF/native-image/reflect-config.json"));
        String resourceConfig = Files.readString(Path.of(
                "src/main/resources/META-INF/native-image/resource-config.json"));

        assertThat(reflectConfig)
                .contains("io.rankpeek.sgp.SgpServerConfig")
                .contains("io.rankpeek.sgp.SgpServerEntry");
        assertThat(resourceConfig).contains("sgp/league-servers.json");
    }

    @Test
    void registersPrivateGameDetailRawTeamDtosUsedByLcuBackfill() throws Exception {
        String reflectConfig = Files.readString(Path.of(
                "src/main/resources/META-INF/native-image/reflect-config.json"));

        assertThat(reflectConfig)
                .contains("io.rankpeek.model.GameDetail$RawTeamSummary")
                .contains("io.rankpeek.model.GameDetail$RawTeamObjectives")
                .contains("io.rankpeek.model.GameDetail$RawObjective")
                .contains("io.rankpeek.model.GameDetail$TeamBan");
    }

    /**
     * 海斗强化的 LCU DTO。它们在代码里只以 {@code X.class} 的形式出现，Spring AOT 的静态分析看不见，
     * 必须手写登记 —— 否则原生包里反序列化直接失败（v1.1.1 的实际症状：海克斯强化图标全部拉不到、
     * 符文数据永远是 0、海斗强化目录整个为空）。
     */
    @Test
    void registersLcuAssetDtosUsedByNativeJacksonDeserialization() throws Exception {
        String reflectConfig = Files.readString(Path.of(
                "src/main/resources/META-INF/native-image/reflect-config.json"));

        assertThat(reflectConfig)
                .contains("io.rankpeek.service.AssetService$CherryAugment")
                .contains("io.rankpeek.service.AssetService$Augment")
                .contains("io.rankpeek.service.AssetService$Perk")
                .contains("io.rankpeek.service.AssetService$PerkStylePayload")
                .contains("io.rankpeek.service.AssetService$PerkStyle");
    }

    /**
     * 手写 ObjectMapper 读写的本地状态与缓存：既不是 Controller 返回值、也不在 Spring 的 AOT 可达图里，
     * 同样只能手写登记。漏了就是「静默不落盘」（贡献状态、海斗快照）或接口 500（AI 服务商列表）。
     */
    @Test
    void registersHandSerializedLocalStateRecords() throws Exception {
        String reflectConfig = Files.readString(Path.of(
                "src/main/resources/META-INF/native-image/reflect-config.json"));

        assertThat(reflectConfig)
                .contains("io.rankpeek.hextech.HextechContributionService$State")
                .contains("io.rankpeek.hextech.HextechSnapshot")
                .contains("io.rankpeek.hextech.HextechAugmentRank")
                .contains("io.rankpeek.hextech.HextechChampionRank")
                .contains("io.rankpeek.hextech.HextechChampionRank$Partner")
                .contains("io.rankpeek.ai.AiProviderProfile");
    }

    /** 反射注册对它们没意义：Jackson 自带 JsonNode 支持，String 不需要实例化。 */
    private static final Set<String> IGNORED_LCU_TARGETS = Set.of("JsonNode", "String", "Object");

    /**
     * 兜底扫描：源码里每个 {@code lcuHttpClient.get(..., X.class)} 的目标类型都必须在 reflect-config.json 里。
     * 新加 LCU DTO 忘了登记，会在这里挂掉，而不是等用户装上原生包才发现。
     */
    @Test
    void registersEveryLcuDeserializationTarget() throws Exception {
        String reflectConfig = Files.readString(Path.of(
                "src/main/resources/META-INF/native-image/reflect-config.json"));
        Set<String> targets = collectLcuDeserializationTargets(Path.of("src/main/java"));
        assertThat(targets).isNotEmpty();

        List<String> missing = targets.stream()
                .filter(name -> !reflectConfig.contains(name + "\""))
                .sorted()
                .toList();
        assertThat(missing)
                .as("这些类型由 LCU 反序列化，却没登记进 reflect-config.json；原生包里会直接失败")
                .isEmpty();
    }

    private Set<String> collectLcuDeserializationTargets(Path sourceRoot) throws Exception {
        Set<String> names = new TreeSet<>();
        try (Stream<Path> files = Files.walk(sourceRoot)) {
            for (Path file : files.filter(path -> path.toString().endsWith(".java")).toList()) {
                for (String line : Files.readAllLines(file)) {
                    int call = line.indexOf("lcuHttpClient.get(");
                    if (call < 0) {
                        continue;
                    }
                    int marker = line.indexOf(".class)", call);
                    if (marker < 0) {
                        continue;
                    }
                    int from = Math.max(line.lastIndexOf('(', marker), line.lastIndexOf(',', marker));
                    String raw = line.substring(from + 1, marker).trim();
                    boolean array = raw.endsWith("[]");
                    String simple = array ? raw.substring(0, raw.length() - 2) : raw;
                    if (simple.isEmpty() || !Character.isUpperCase(simple.charAt(0)) || simple.contains(".")) {
                        continue;
                    }
                    if (IGNORED_LCU_TARGETS.contains(simple)) {
                        continue;
                    }
                    names.add(simple);
                }
            }
        }
        return names;
    }

    /**
     * 内部类闭包：登记了某个类，它的内部类也必须一起登记。
     *
     * <p>Jackson 反序列化多态子类（{@code TagConfig} 的条件 / 筛选 / 刷新选择）走的是子类构造器，
     * 只登记外层类不够 —— 实际症状就是「保存标签配置失败: cannot deserialize ... HistoryCondition」。
     * 这条测试递归展开，免得下次再漏一层。
     */
    @Test
    void registersNestedTypesOfEveryRegisteredEntry() throws Exception {
        Set<String> registered = readRegisteredNames();
        Set<String> classNames = listRankPeekClassNames();
        assertThat(classNames).isNotEmpty();

        Set<String> missing = new TreeSet<>();
        Deque<String> queue = new ArrayDeque<>(registered);
        Set<String> visited = new HashSet<>();
        while (!queue.isEmpty()) {
            String outer = queue.poll();
            if (!visited.add(outer)) {
                continue;
            }
            for (String candidate : classNames) {
                if (!candidate.startsWith(outer + "$") || isAnonymousNested(candidate)) {
                    continue;
                }
                if (!registered.contains(candidate)) {
                    missing.add(candidate);
                }
                queue.add(candidate);
            }
        }

        assertThat(missing)
                .as("这些内部类没登记进 reflect-config.json；Jackson 反序列化多态子类时会直接失败")
                .isEmpty();
    }

    private static Set<String> readRegisteredNames() throws Exception {
        String reflectConfig = Files.readString(Path.of(
                "src/main/resources/META-INF/native-image/reflect-config.json"));
        Set<String> names = new TreeSet<>();
        int cursor = 0;
        while (true) {
            int at = reflectConfig.indexOf("\"name\"", cursor);
            if (at < 0) {
                break;
            }
            int open = reflectConfig.indexOf('"', reflectConfig.indexOf(':', at) + 1);
            int close = reflectConfig.indexOf('"', open + 1);
            names.add(reflectConfig.substring(open + 1, close));
            cursor = close + 1;
        }
        return names;
    }

    private static Set<String> listRankPeekClassNames() throws Exception {
        Path classesRoot = Path.of("target/classes");
        Set<String> names = new TreeSet<>();
        try (Stream<Path> files = Files.walk(classesRoot)) {
            for (Path file : files.filter(path -> path.toString().endsWith(".class")).toList()) {
                String name = classesRoot.relativize(file).toString()
                        .replace('\\', '/')
                        .replace('/', '.')
                        .replace(".class", "");
                if (name.startsWith("io.rankpeek") && !name.contains("$$")) {
                    names.add(name);
                }
            }
        }
        return names;
    }

    /** {@code Foo$1} 这种匿名内部类不是 Jackson 的菜，跳过。 */
    private static boolean isAnonymousNested(String name) {
        int dollar = name.lastIndexOf('$');
        if (dollar < 0 || dollar + 1 >= name.length()) {
            return false;
        }
        for (int index = dollar + 1; index < name.length(); index++) {
            if (!Character.isDigit(name.charAt(index))) {
                return false;
            }
        }
        return true;
    }
}
