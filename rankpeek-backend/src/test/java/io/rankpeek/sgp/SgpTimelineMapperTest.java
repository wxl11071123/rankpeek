package io.rankpeek.sgp;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.rankpeek.model.MatchTimeline;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class SgpTimelineMapperTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private SgpTimelineMapper mapper;

    @BeforeEach
    void setUp() {
        mapper = new SgpTimelineMapper(objectMapper);
    }

    @Test
    void mapTimeline_readsChampionKillPositionAndParticipantsFromSgpDetailsFrames() {
        ObjectNode response = objectMapper.createObjectNode();
        ObjectNode json = response.putObject("json");
        json.put("gameId", 10871947339L);
        ArrayNode frames = json.putArray("frames");
        ObjectNode frame = frames.addObject();
        frame.put("timestamp", 60000);
        ObjectNode participantFrame = frame.putObject("participantFrames")
                .putObject("9");
        participantFrame.put("participantId", 9);
        participantFrame.put("currentGold", 512);
        participantFrame.put("totalGold", 9012);
        participantFrame.put("level", 11);
        participantFrame.putObject("position").put("x", 5840).put("y", 6910);
        ArrayNode events = frame.putArray("events");
        events.addObject()
                .put("type", "ITEM_PURCHASED")
                .put("timestamp", 61000)
                .put("participantId", 3)
                .put("itemId", 1055);
        ObjectNode kill = events.addObject();
        kill.put("type", "CHAMPION_KILL");
        kill.put("timestamp", 71613);
        kill.put("killerId", 9);
        kill.put("victimId", 4);
        kill.putArray("assistingParticipantIds").add(6).add(8).add(10);
        kill.putObject("position").put("x", 5853).put("y", 6923);

        MatchTimeline timeline = mapper.mapTimeline(response);

        assertThat(timeline.getGameId()).isEqualTo(10871947339L);
        assertThat(timeline.getEvents()).hasSize(2);
        MatchTimeline.TimelineEvent mappedKill = timeline.getEvents().get(1);
        assertThat(mappedKill.getEventType()).isEqualTo("CHAMPION_KILL");
        assertThat(mappedKill.getTimestamp()).isEqualTo(71613L);
        assertThat(mappedKill.getKillerId()).isEqualTo(9);
        assertThat(mappedKill.getVictimId()).isEqualTo(4);
        assertThat(mappedKill.getAssistingParticipantIds()).containsExactly(6, 8, 10);
        assertThat(mappedKill.getPosition().getX()).isEqualTo(5853);
        assertThat(mappedKill.getPosition().getY()).isEqualTo(6923);
        assertThat(mappedKill.getRawEventJson()).contains("CHAMPION_KILL");

        assertThat(objectMapper.valueToTree(timeline).path("frames").path(0).path("participantFrames").path("9").path("position").path("x").asInt())
                .isEqualTo(5840);
    }

    @Test
    void mapTimeline_returnsEmptyEventsWhenSgpDetailsHasNoFrames() {
        ObjectNode response = objectMapper.createObjectNode();
        response.putObject("json").put("gameId", 10871947340L);

        MatchTimeline timeline = mapper.mapTimeline(response);

        assertThat(timeline.getGameId()).isEqualTo(10871947340L);
        assertThat(timeline.getEvents()).isEmpty();
    }
}
