package io.rankpeek.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 会话中单名玩家的展示数据
 * 包含英雄、召唤师、战绩、段位、用户标签、预组队标记等
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class SessionSummoner {

    /**
     * 英雄 ID
     */
    private Integer championId;

    /**
     * 英雄 Key
     */
    private String championKey;

    private String selectedPosition;

    private String assignedPosition;

    private String teamPosition;

    private String individualPosition;

    private String position;

    /**
     * 召唤师信息
     */
    private Summoner summoner;

    /**
     * 近期战绩
     */
    private List<MatchHistory> matchHistory;

    /**
     * 用户标签
     */
    private UserTag userTag;

    /**
     * 段位信息
     */
    private Rank rank;

    /**
     * 遇到过的玩家记录
     */
    private List<OneGamePlayer> meetGames;

    /**
     * 预组队标记
     */
    private PreGroupMarker preGroupMarkers;

    /**
     * 是否加载中
     */
    private Boolean isLoading;
}
