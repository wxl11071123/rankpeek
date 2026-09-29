package io.rankpeek.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 胜率统计模型
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class WinRate {

    /**
     * 胜场数
     */
    private int wins;

    /**
     * 负场数
     */
    private int losses;

    /**
     * 胜率百分比 (0-100)
     */
    private int winRate;

    /**
     * 根据胜场和负场计算胜率
     */
    public static WinRate of(int wins, int losses) {
        int total = wins + losses;
        int rate = total > 0 ? Math.round((float) wins / total * 100) : 0;
        return new WinRate(wins, losses, rate);
    }
}
