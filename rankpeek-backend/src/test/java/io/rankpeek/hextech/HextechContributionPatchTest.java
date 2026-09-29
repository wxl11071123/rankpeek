package io.rankpeek.hextech;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.rankpeek.config.LocalDataPathService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * patch 来源的回归测试。
 *
 * <p>背景：1.1.1 在拿不到版本时把字面量 {@code "unknown"} 当 patch 发出去，
 * 服务端用 {@code ^[0-9]{1,3}\.[0-9]{1,3}$} 校验，于是**整批上传**被 400 拒收，
 * 而且每 10 分钟重试一次也永远不会成功。实测某台机器连续 9 次上传全被拒。
 *
 * <p>这里锁住两件事：patch 永远不会是不可用的字符串；服务端下发的 patch 能被读到。
 */
class HextechContributionPatchTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 和 hextech_ingest.py 里的 PATCH_RE 保持一致，改一边就得改另一边。 */
    private static final String SERVER_PATCH_RULE = "^[0-9]{1,3}\\.[0-9]{1,3}$";

    private HextechContributionService serviceFor(Path dataRoot) {
        return new HextechContributionService(null, null, null,
                new LocalDataPathService(dataRoot.toString(), false), MAPPER, null,
                "", null, "", Duration.ofSeconds(1), null);
    }

    @Test
    void patchComesFromTheServerSelfDataSnapshot(@TempDir Path dataRoot) throws Exception {
        Path hextechDir = dataRoot.resolve("hextech");
        Files.createDirectories(hextechDir);
        Files.writeString(hextechDir.resolve("self-data.json"),
                "{\"dataVersion\":\"20260929-e9508117\",\"fetchedAt\":\"2026-09-29 00:22:23\","
                        + "\"matrix\":{\"schemaVersion\":1,\"patch\":\"26.09\",\"totalGames\":37}}");

        assertEquals("26.09", serviceFor(dataRoot).currentPatch());
    }

    @Test
    void patchIsNullWhenNothingKnowsTheVersion(@TempDir Path dataRoot) {
        // 关键回归：以前这里返回 "unknown"，服务端直接 400，整批上传全废
        assertNull(serviceFor(dataRoot).currentPatch());
        assertFalse("unknown".equals(serviceFor(dataRoot).currentPatch()));
    }

    @Test
    void patchIgnoresUnusableValuesFromTheSnapshot(@TempDir Path dataRoot) throws Exception {
        Path hextechDir = dataRoot.resolve("hextech");
        Files.createDirectories(hextechDir);
        for (String broken : List.of("unknown", "", "16", "1.2.3", "16.1900")) {
            Files.writeString(hextechDir.resolve("self-data.json"),
                    "{\"matrix\":{\"patch\":\"" + broken + "\"}}");
            assertNull(serviceFor(dataRoot).currentPatch(), "不该把 " + broken + " 当 patch 发出去");
        }
    }

    @Test
    void validatorMatchesTheServerRule() {
        for (String ok : List.of("16.19", "26.09", "1.2", "999.999")) {
            assertTrue(HextechContributionService.isValidPatch(ok), ok + " 服务端是收的");
            assertTrue(ok.matches(SERVER_PATCH_RULE));
        }
        for (String bad : List.of("unknown", "", "16", "1.2.3", "16.1900", "v16.19", " 16.19x")) {
            assertFalse(HextechContributionService.isValidPatch(bad), bad + " 服务端会 400");
            assertFalse(bad.matches(SERVER_PATCH_RULE));
        }
        assertFalse(HextechContributionService.isValidPatch(null));
    }
}
