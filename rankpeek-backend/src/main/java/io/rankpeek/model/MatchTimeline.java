package io.rankpeek.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Data
@JsonInclude(JsonInclude.Include.NON_EMPTY)
@JsonIgnoreProperties(ignoreUnknown = true)
public class MatchTimeline {

    @JsonProperty("gameId")
    private Long gameId;

    @JsonProperty("events")
    private List<TimelineEvent> events = new ArrayList<>();

    @JsonProperty("frames")
    private List<TimelineFrame> frames = new ArrayList<>();

    @Data
    @JsonInclude(JsonInclude.Include.NON_EMPTY)
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class TimelineFrame {
        @JsonProperty("timestamp")
        private Long timestamp;

        @JsonProperty("participantFrames")
        private Map<String, ParticipantFrame> participantFrames = new LinkedHashMap<>();

        @JsonProperty("events")
        private List<TimelineEvent> events = new ArrayList<>();

        @JsonProperty("rawFrameJson")
        private String rawFrameJson;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_EMPTY)
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ParticipantFrame {
        @JsonProperty("participantId")
        private Integer participantId;

        @JsonProperty("currentGold")
        private Integer currentGold;

        @JsonProperty("totalGold")
        private Integer totalGold;

        @JsonProperty("level")
        private Integer level;

        @JsonProperty("xp")
        private Integer xp;

        @JsonProperty("minionsKilled")
        private Integer minionsKilled;

        @JsonProperty("jungleMinionsKilled")
        private Integer jungleMinionsKilled;

        @JsonProperty("position")
        private Position position;

        @JsonProperty("rawParticipantFrameJson")
        private String rawParticipantFrameJson;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_EMPTY)
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class TimelineEvent {
        @JsonProperty("eventType")
        private String eventType;

        @JsonProperty("timestamp")
        private Long timestamp;

        @JsonProperty("participantId")
        private Integer participantId;

        @JsonProperty("killerId")
        private Integer killerId;

        @JsonProperty("victimId")
        private Integer victimId;

        @JsonProperty("assistingParticipantIds")
        private List<Integer> assistingParticipantIds = new ArrayList<>();

        @JsonProperty("position")
        private Position position;

        @JsonProperty("itemId")
        private Integer itemId;

        @JsonProperty("buildingType")
        private String buildingType;

        @JsonProperty("towerType")
        private String towerType;

        @JsonProperty("monsterType")
        private String monsterType;

        @JsonProperty("teamId")
        private Integer teamId;

        @JsonProperty("rawEventJson")
        private String rawEventJson;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_EMPTY)
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Position {
        @JsonProperty("x")
        private Integer x;

        @JsonProperty("y")
        private Integer y;
    }
}
