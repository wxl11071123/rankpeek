package io.rankpeek.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.List;

/**
 * LCU 对局会话
 * 对应 lol-gameflow/v1/session
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class GameSession {

    @JsonProperty("phase")
    private String phase;

    @JsonProperty("gameData")
    private GameData gameData;

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class GameData {
        @JsonProperty("gameId")
        private Long gameId;

        @JsonProperty("isCustomGame")
        private Boolean isCustomGame;

        @JsonProperty("queue")
        private Queue queue;

        @JsonProperty("playerChampionSelections")
        private List<PlayerChampionSelection> playerChampionSelections;

        @JsonProperty("teamOne")
        private List<OnePlayer> teamOne;

        @JsonProperty("teamTwo")
        private List<OnePlayer> teamTwo;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Queue {
        @JsonProperty("type")
        private String type;

        @JsonProperty("id")
        private Integer id;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class PlayerChampionSelection {
        @JsonProperty("championId")
        private Integer championId;

        @JsonProperty("puuid")
        private String puuid;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class OnePlayer {
        @JsonProperty("championId")
        private Integer championId;

        @JsonProperty("puuid")
        private String puuid;

        @JsonProperty("selectedPosition")
        private String selectedPosition;

        @JsonProperty("assignedPosition")
        private String assignedPosition;

        @JsonProperty("teamPosition")
        private String teamPosition;

        @JsonProperty("individualPosition")
        private String individualPosition;
    }
}
