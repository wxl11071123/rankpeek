package io.rankpeek.hextech;

import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 解析器单测：夹具来自 101 线上真实返回（裁剪到前几条），保证格式一致。
 */
class HextechRankParserTest {

    private String fixture(String name) throws Exception {
        try (InputStream in = getClass().getResourceAsStream("/hextech/" + name)) {
            assertThat(in).as("fixture %s", name).isNotNull();
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    @Test
    void parsesAugmentRankPayload() throws Exception {
        HextechRankParser.AugmentPage page = HextechRankParser.parseAugmentRank(fixture("augment-rank.json"));

        assertThat(page.dataDate()).isEqualTo("20260925");
        assertThat(page.rows()).hasSize(3);

        HextechAugmentRank first = page.rows().get(0);
        assertThat(first.augmentId()).isEqualTo(1001L);
        assertThat(first.pickRate()).isEqualTo(0.1474);
        assertThat(first.pickRank()).isEqualTo(110);
        assertThat(first.pickRankChange()).isZero();
        assertThat(first.winRate()).isEqualTo(0.4765);
        assertThat(first.winRank()).isEqualTo(189);
        assertThat(first.winRankChange()).isEqualTo(1);
        assertThat(first.bestChampionIds()).containsExactly(223L, 36L, 50L, 14L, 31L, 875L);
    }

    @Test
    void parsesChampionRankPayload() throws Exception {
        List<HextechChampionRank> rows = HextechRankParser.parseChampionRank(fixture("champion-rank.json"));

        assertThat(rows).hasSize(2);

        HextechChampionRank first = rows.get(0);
        assertThat(first.championId()).isEqualTo(157L);
        assertThat(first.winRank()).isEqualTo(1);
        assertThat(first.rankChangeText()).isEqualTo("未变化");
        assertThat(first.winRate()).isEqualTo(0.5723);
        assertThat(first.pickRate()).isEqualTo(0.1073);
        assertThat(first.partners()).isNotEmpty();

        HextechChampionRank.Partner partner = first.partners().get(0);
        assertThat(partner.championId()).isEqualTo(17L);
        assertThat(partner.pickRate()).isEqualTo(0.0588);
        assertThat(partner.winRate()).isEqualTo(0.6166);
        assertThat(partner.rank()).isEqualTo(1);
    }

    @Test
    void toleratesGarbageInput() throws Exception {
        assertThat(HextechRankParser.parseAugmentRank("not json").rows()).isEmpty();
        assertThat(HextechRankParser.parseAugmentRank("{\"data\":{}}").rows()).isEmpty();
        assertThat(HextechRankParser.parseChampionRank("{}")).isEmpty();
        assertThat(HextechRankParser.parseChampionRank("").isEmpty()).isTrue();
    }
}
