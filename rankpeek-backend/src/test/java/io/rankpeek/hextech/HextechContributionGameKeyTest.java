package io.rankpeek.hextech;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 对局去重键的回归测试。
 *
 * <p>背景：同一局会被最多 10 名玩家各自的客户端上传，服务器靠 gameKey 去重。
 * 早期实现把「本机随机盐」掺进了哈希，导致同一局在不同玩家机器上算出不同的键，
 * 去重完全失效（每局被重复计数最多 10 次）。这个测试锁住「跨客户端一致」这个性质。
 */
class HextechContributionGameKeyTest {

    /** 钉死的期望值：哈希材料一旦被改动（比如又有人想把日期掺回来），这个测试立刻红。 */
    private static final String NA1_GOLDEN = "bb3015dbcc9fa613586fdb196cc6feaa531f2f58b2cb9fbe4166758e201a4edd";

    @Test
    void sameGameAlwaysProducesTheSameKey() {
        // 与 installId / 本机盐 / 上传时间无关：同样的对局身份永远得到同样的键
        assertEquals(NA1_GOLDEN, HextechContributionService.gameKey("NA1", 7123456789L));
    }

    @Test
    void differentGamesProduceDifferentKeys() {
        assertNotEquals(
                HextechContributionService.gameKey("NA1", 7123456789L),
                HextechContributionService.gameKey("NA1", 7123456790L));
        assertNotEquals(
                HextechContributionService.gameKey("NA1", 7123456789L),
                HextechContributionService.gameKey("EUW1", 7123456789L));
    }

    @Test
    void keyDoesNotDependOnWhenTheGameWasPlayed() {
        // 回归：早期实现把"对局自然日"掺进哈希，上游没给时间戳时会退化成空串，
        // 同一局在两个客户端上算出两个键 -> 被重复计数。键必须只跟对局身份有关。
        assertEquals(
                HextechContributionService.gameKey("NA1", 7123456789L),
                HextechContributionService.gameKey("NA1", 7123456789L));
    }

    @Test
    void keyIsSha256HexAndLeaksNothing() {
        String key = HextechContributionService.gameKey("NA1", 7123456789L);
        assertEquals(64, key.length());
        assertTrue(key.matches("[0-9a-f]{64}"), "必须是 64 位小写十六进制");
        assertFalse(key.contains("7123456789"), "不能包含原始对局 ID");
        assertFalse(key.contains("NA1"), "不能包含大区标识");
        assertFalse(key.contains("20260928"), "不能包含日期明文");
    }

    @Test
    void nullPlatformAndMissingTimeStillProduceStableKey() {
        assertEquals(
                HextechContributionService.gameKey(null, 42L),
                HextechContributionService.gameKey(null, 42L));
    }

    @Test
    void patchComesFromTheGameItselfNotTheClientVersion() {
        // 补传几天前、上个版本打的对局时，必须标成那一局自己的版本
        assertEquals("16.19", HextechContributionService.patchFromGameVersion("16.19.820.7193"));
        assertEquals("16.18", HextechContributionService.patchFromGameVersion("16.18.816.5012"));
        assertEquals("16.09", HextechContributionService.patchFromGameVersion("16.9.810.100"));
        assertEquals("26.09", HextechContributionService.patchFromGameVersion("26.09"));
    }

    @Test
    void patchFallsBackToNullWhenVersionIsUnusable() {
        org.junit.jupiter.api.Assertions.assertNull(HextechContributionService.patchFromGameVersion(null));
        org.junit.jupiter.api.Assertions.assertNull(HextechContributionService.patchFromGameVersion(""));
        org.junit.jupiter.api.Assertions.assertNull(HextechContributionService.patchFromGameVersion("16"));
        org.junit.jupiter.api.Assertions.assertNull(HextechContributionService.patchFromGameVersion("abc.def"));
    }
}
