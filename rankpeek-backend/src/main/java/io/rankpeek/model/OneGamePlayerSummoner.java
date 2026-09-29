package io.rankpeek.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 单局玩家 + 召唤师信息
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OneGamePlayerSummoner {

    /**
     * 组队胜率
     */
    private Integer winRate;

    /**
     * 胜场
     */
    private Integer wins;

    /**
     * 败场
     */
    private Integer losses;

    /**
     * 召唤师信息
     */
    private Summoner summoner;

    /**
     * 对局记录
     */
    private List<OneGamePlayer> oneGamePlayer;
}
