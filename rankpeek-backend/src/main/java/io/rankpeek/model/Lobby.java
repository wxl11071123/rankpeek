package io.rankpeek.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.List;

/**
 * 大厅信息模型
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class Lobby {

    /**
     * 大厅 ID
     */
    @JsonProperty("lobbyId")
    private String lobbyId;

    /**
     * 队列类型
     */
    @JsonProperty("queueId")
    private Integer queueId;

    /**
     * 游戏配置
     */
    @JsonProperty("gameConfig")
    private GameConfig gameConfig;

    /**
     * 成员列表
     */
    @JsonProperty("members")
    private List<Member> members;

    /**
     * 游戏配置
     */
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class GameConfig {
        @JsonProperty("queueId")
        private Integer queueId;

        @JsonProperty("gameMode")
        private String gameMode;

        @JsonProperty("isCustom")
        private Boolean isCustom;
    }

    /**
     * 大厅成员
     */
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Member {
        @JsonProperty("puuid")
        private String puuid;

        @JsonProperty("summonerName")
        private String summonerName;

        @JsonProperty("summonerId")
        private Long summonerId;

        @JsonProperty("isLeader")
        private Boolean isLeader;

        @JsonProperty("ready")
        private Boolean ready;

        @JsonProperty("teamId")
        private Integer teamId;

        @JsonProperty("position")
        private String position;
    }

    /**
     * 检查指定 PUUID 是否为房主
     */
    public boolean isLeader(String puuid) {
        if (members == null || puuid == null) return false;
        return members.stream()
                .anyMatch(m -> puuid.equals(m.getPuuid()) && Boolean.TRUE.equals(m.getIsLeader()));
    }
}
