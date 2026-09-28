package io.rankpeek.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 单局玩家信息
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OneGamePlayer {

    /**
     * 对局索引
     */
    private Integer index;

    /**
     * 游戏 ID
     */
    private Long gameId;

    /**
     * PUUID
     */
    private String puuid;

    /**
     * 游戏时间
     */
    private String gameCreatedAt;

    /**
     * 是否同队
     */
    private Boolean isMyTeam;

    /**
     * 游戏名称
     */
    private String gameName;

    /**
     * 标签
     */
    private String tagLine;

    /**
     * 英雄 ID
     */
    private Integer championId;

    /**
     * 击杀
     */
    private Integer kills;

    /**
     * 死亡
     */
    private Integer deaths;

    /**
     * 助攻
     */
    private Integer assists;

    /**
     * 是否胜利
     */
    private Boolean win;

    /**
     * 队列中文名
     */
    private String queueIdCn;
}
