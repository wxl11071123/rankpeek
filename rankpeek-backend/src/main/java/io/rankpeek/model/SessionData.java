package io.rankpeek.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 对局会话完整数据
 * 包含双方队伍及每个玩家的汇总信息
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class SessionData {

    /**
     * 当前游戏阶段
     */
    private String phase;

    private String sessionKey;

    private Long gameId;

    private boolean empty;

    private boolean stale;

    private String source;

    private Long createdAt;

    private Long updatedAt;

    /**
     * 队列类型
     */
    @JsonProperty("type")
    private String queueType;

    /**
     * 队列类型中文名
     */
    private String typeCn;

    /**
     * 队列 ID
     */
    private Integer queueId;

    /**
     * 当前登录召唤师
     */
    private Summoner currentSummoner;

    /**
     * 我方队伍（左）
     */
    private List<SessionSummoner> teamOne;

    /**
     * 敌方队伍（右）
     */
    private List<SessionSummoner> teamTwo;
}
