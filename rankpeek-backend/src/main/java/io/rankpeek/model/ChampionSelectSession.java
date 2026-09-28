package io.rankpeek.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.List;

/**
 * 选人阶段会话
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class ChampionSelectSession {

    /**
     * 会话 ID
     */
    @JsonProperty("gameId")
    private Long gameId;

    /**
     * 当前玩家 Cell ID
     */
    @JsonProperty("localPlayerCellId")
    private Integer localPlayerCellId;

    /**
     * 当前阶段
     */
    @JsonProperty("timer")
    private Timer timer;

    /**
     * 动作列表（ban/pick）
     */
    @JsonProperty("actions")
    private List<List<Action>> actions;

    /**
     * 玩家列表
     */
    @JsonProperty("myTeam")
    private List<Player> myTeam;

    @JsonProperty("theirTeam")
    private List<Player> theirTeam;

    /**
     * 计时器
     */
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Timer {
        @JsonProperty("phase")
        private String phase;

        @JsonProperty("totalTimeInPhase")
        private Integer totalTimeInPhase;

        @JsonProperty("timeLeftInPhase")
        private Integer timeLeftInPhase;
    }

    /**
     * 动作（ban/pick）
     */
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Action {
        @JsonProperty("id")
        private Integer id;

        @JsonProperty("actorCellId")
        private Integer actorCellId;

        @JsonProperty("type")
        private String actionType;

        @JsonProperty("championId")
        private Integer championId;

        @JsonProperty("completed")
        private Boolean completed;

        @JsonProperty("isInProgress")
        private Boolean isInProgress;
    }

    /**
     * 玩家信息
     */
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Player {
        @JsonProperty("cellId")
        private Integer cellId;

        @JsonProperty("puuid")
        private String puuid;

        @JsonProperty("summonerId")
        private Long summonerId;

        @JsonProperty("championId")
        private Integer championId;

        @JsonProperty("championPickIntent")
        private Integer championPickIntent;

        @JsonProperty("selectedPosition")
        private String selectedPosition;

        @JsonProperty("assignedPosition")
        private String assignedPosition;

        @JsonProperty("teamPosition")
        private String teamPosition;

        @JsonProperty("individualPosition")
        private String individualPosition;

        @JsonProperty("selectedSkinId")
        private Integer selectedSkinId;

        @JsonProperty("spell1Id")
        private Integer spell1Id;

        @JsonProperty("spell2Id")
        private Integer spell2Id;
    }
}
