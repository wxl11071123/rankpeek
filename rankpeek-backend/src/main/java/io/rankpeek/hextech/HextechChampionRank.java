package io.rankpeek.hextech;

import java.util.List;

/**
 * 海斗英雄榜的一个英雄（来源：101 / 腾讯国服公开统计）。
 *
 * <p>原始打包格式：每个英雄一个块，块之间以 {@code #} 分隔，块内：
 * <pre>
 *   championId_winRank_rankChangeText_winRate_pickRate_entry1&entry2&...
 * </pre>
 * 条目为 {@code partnerChampionId,pickRate,winRate,rank}（最佳拍档排行）。
 */
public record HextechChampionRank(
        long championId,
        int winRank,
        String rankChangeText,
        double winRate,
        double pickRate,
        List<Partner> partners
) {

    public record Partner(long championId, double pickRate, double winRate, int rank) {
    }
}
