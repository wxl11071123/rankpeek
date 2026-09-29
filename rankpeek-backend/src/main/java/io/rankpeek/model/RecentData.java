package io.rankpeek.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * 近期数据统计
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RecentData {

    /**
     * KDA
     */
    private Double kda;

    /**
     * 场均击杀
     */
    private Double kills;

    /**
     * 场均死亡
     */
    private Double deaths;

    /**
     * 场均助攻
     */
    private Double assists;

    /**
     * 选择的游戏模式
     */
    private Integer selectMode;

    /**
     * 模式中文名
     */
    private String selectModeCn;

    /**
     * 胜场
     */
    private Integer selectWins;

    /**
     * 败场
     */
    private Integer selectLosses;

    /**
     * 参团率
     */
    private Integer groupRate;

    /**
     * 场均金币
     */
    private Integer averageGold;

    /**
     * 经济占比
     */
    private Integer goldRate;

    /**
     * 场均伤害
     */
    private Integer averageDamageDealtToChampions;

    /**
     * 伤害占比
     */
    private Integer damageDealtToChampionsRate;

    /**
     * 好友/冤家数据
     */
    @Builder.Default
    private FriendAndDispute friendAndDispute = new FriendAndDispute();

    /**
     * 遇到过的玩家
     */
    private Map<String, java.util.List<OneGamePlayer>> oneGamePlayersMap;
}
