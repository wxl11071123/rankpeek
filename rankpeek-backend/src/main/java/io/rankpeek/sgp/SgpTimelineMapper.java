package io.rankpeek.sgp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.rankpeek.model.MatchTimeline;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class SgpTimelineMapper {

    private final ObjectMapper objectMapper;

    public SgpTimelineMapper(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper == null ? new ObjectMapper() : objectMapper;
    }

    public MatchTimeline mapTimeline(JsonNode response) {
        JsonNode timelineNode = SgpJsonMapperSupport.extractGame(response);
        MatchTimeline timeline = new MatchTimeline();
        if (timelineNode == null) {
            return timeline;
        }

        timeline.setGameId(SgpJsonMapperSupport.readLong(timelineNode, "gameId"));
        JsonNode frames = SgpJsonMapperSupport.value(timelineNode, "frames");
        if (frames == null || !frames.isArray()) {
            return timeline;
        }

        List<MatchTimeline.TimelineFrame> mappedFrames = new ArrayList<>();
        List<MatchTimeline.TimelineEvent> events = new ArrayList<>();
        for (JsonNode frame : frames) {
            MatchTimeline.TimelineFrame mappedFrame = mapFrame(frame);
            mappedFrames.add(mappedFrame);
            events.addAll(mappedFrame.getEvents());
        }
        timeline.setFrames(mappedFrames);
        timeline.setEvents(events);
        return timeline;
    }

    public boolean hasTimeline(JsonNode response) {
        JsonNode timelineNode = SgpJsonMapperSupport.extractGame(response);
        JsonNode frames = SgpJsonMapperSupport.value(timelineNode, "frames");
        return frames != null && frames.isArray() && !frames.isEmpty();
    }

    private MatchTimeline.TimelineFrame mapFrame(JsonNode frameNode) {
        MatchTimeline.TimelineFrame frame = new MatchTimeline.TimelineFrame();
        if (!SgpJsonMapperSupport.isObject(frameNode)) {
            return frame;
        }

        frame.setTimestamp(SgpJsonMapperSupport.readLong(frameNode, "timestamp"));
        frame.setParticipantFrames(mapParticipantFrames(SgpJsonMapperSupport.value(frameNode, "participantFrames")));
        frame.setRawFrameJson(toJson(frameNode));

        JsonNode frameEvents = SgpJsonMapperSupport.value(frameNode, "events");
        if (frameEvents != null && frameEvents.isArray()) {
            List<MatchTimeline.TimelineEvent> events = new ArrayList<>();
            for (JsonNode eventNode : frameEvents) {
                MatchTimeline.TimelineEvent event = mapEvent(eventNode);
                if (event != null) {
                    events.add(event);
                }
            }
            frame.setEvents(events);
        }
        return frame;
    }

    private Map<String, MatchTimeline.ParticipantFrame> mapParticipantFrames(JsonNode participantFramesNode) {
        Map<String, MatchTimeline.ParticipantFrame> participantFrames = new LinkedHashMap<>();
        if (!SgpJsonMapperSupport.isObject(participantFramesNode)) {
            return participantFrames;
        }

        participantFramesNode.properties().forEach(entry -> {
            MatchTimeline.ParticipantFrame participantFrame = mapParticipantFrame(entry.getValue());
            participantFrames.put(entry.getKey(), participantFrame);
        });
        return participantFrames;
    }

    private MatchTimeline.ParticipantFrame mapParticipantFrame(JsonNode participantFrameNode) {
        MatchTimeline.ParticipantFrame participantFrame = new MatchTimeline.ParticipantFrame();
        if (!SgpJsonMapperSupport.isObject(participantFrameNode)) {
            return participantFrame;
        }

        participantFrame.setParticipantId(SgpJsonMapperSupport.readInt(participantFrameNode, "participantId"));
        participantFrame.setCurrentGold(SgpJsonMapperSupport.readInt(participantFrameNode, "currentGold"));
        participantFrame.setTotalGold(SgpJsonMapperSupport.readInt(participantFrameNode, "totalGold"));
        participantFrame.setLevel(SgpJsonMapperSupport.readInt(participantFrameNode, "level"));
        participantFrame.setXp(SgpJsonMapperSupport.readInt(participantFrameNode, "xp"));
        participantFrame.setMinionsKilled(SgpJsonMapperSupport.readInt(participantFrameNode, "minionsKilled"));
        participantFrame.setJungleMinionsKilled(SgpJsonMapperSupport.readInt(participantFrameNode, "jungleMinionsKilled"));
        participantFrame.setPosition(mapPosition(SgpJsonMapperSupport.value(participantFrameNode, "position")));
        participantFrame.setRawParticipantFrameJson(toJson(participantFrameNode));
        return participantFrame;
    }

    private MatchTimeline.TimelineEvent mapEvent(JsonNode eventNode) {
        if (!SgpJsonMapperSupport.isObject(eventNode)) {
            return null;
        }

        MatchTimeline.TimelineEvent event = new MatchTimeline.TimelineEvent();
        event.setEventType(SgpJsonMapperSupport.readText(eventNode, "type", "eventType"));
        event.setTimestamp(SgpJsonMapperSupport.readLong(eventNode, "timestamp"));
        event.setParticipantId(SgpJsonMapperSupport.readInt(eventNode, "participantId", "creatorId"));
        event.setKillerId(SgpJsonMapperSupport.readInt(eventNode, "killerId"));
        event.setVictimId(SgpJsonMapperSupport.readInt(eventNode, "victimId"));
        event.setAssistingParticipantIds(readIntegerList(SgpJsonMapperSupport.value(eventNode, "assistingParticipantIds")));
        event.setPosition(mapPosition(SgpJsonMapperSupport.value(eventNode, "position")));
        event.setItemId(SgpJsonMapperSupport.readInt(eventNode, "itemId"));
        event.setBuildingType(SgpJsonMapperSupport.readText(eventNode, "buildingType"));
        event.setTowerType(SgpJsonMapperSupport.readText(eventNode, "towerType"));
        event.setMonsterType(SgpJsonMapperSupport.readText(eventNode, "monsterType"));
        event.setTeamId(SgpJsonMapperSupport.readInt(eventNode, "teamId"));
        event.setRawEventJson(toJson(eventNode));
        return event;
    }

    private MatchTimeline.Position mapPosition(JsonNode positionNode) {
        if (!SgpJsonMapperSupport.isObject(positionNode)) {
            return null;
        }
        MatchTimeline.Position position = new MatchTimeline.Position();
        position.setX(SgpJsonMapperSupport.readInt(positionNode, "x"));
        position.setY(SgpJsonMapperSupport.readInt(positionNode, "y"));
        return position;
    }

    private List<Integer> readIntegerList(JsonNode node) {
        List<Integer> values = new ArrayList<>();
        if (node == null || !node.isArray()) {
            return values;
        }
        for (JsonNode item : node) {
            if (item != null && item.isNumber()) {
                values.add(item.asInt());
            }
        }
        return values;
    }

    private String toJson(JsonNode node) {
        try {
            return objectMapper.writeValueAsString(node);
        } catch (Exception ignored) {
            return node == null ? null : node.toString();
        }
    }
}
