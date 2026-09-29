package io.rankpeek.service.matchhistory;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.rankpeek.model.GameDetail;
import io.rankpeek.model.MatchHistory;
import io.rankpeek.model.MatchHistoryFetchResult;
import io.rankpeek.model.MatchTimelineFetchResult;
import io.rankpeek.model.Summoner;
import io.rankpeek.sgp.SgpAuthState;
import io.rankpeek.sgp.SgpGameDetailMapper;
import io.rankpeek.sgp.SgpHttpClient;
import io.rankpeek.sgp.SgpMatchHistoryMapper;
import io.rankpeek.sgp.SgpTimelineMapper;
import io.rankpeek.sgp.SgpServerResolver;
import io.rankpeek.sgp.SgpStatus;
import io.rankpeek.sgp.SgpTokenService;
import io.rankpeek.service.SummonerService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SgpMatchHistoryProviderTest {

    @Mock
    private SgpHttpClient sgpHttpClient;
    @Mock
    private SgpServerResolver serverResolver;
    @Mock
    private SgpTokenService tokenService;
    @Mock
    private SummonerService summonerService;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private SgpMatchHistoryProvider provider;

    @BeforeEach
    void setUp() {
        provider = new SgpMatchHistoryProvider(
                sgpHttpClient,
                new SgpMatchHistoryMapper(),
                new SgpGameDetailMapper(),
                new SgpTimelineMapper(objectMapper),
                objectMapper,
                serverResolver,
                tokenService,
                summonerService
        );
    }

    @Test
    void fetchMatchHistory_returnsMappedFetchResult() {
        MatchHistoryQueryOptions options = options(MatchHistorySource.SGP, "HN1", "ranked");
        when(sgpHttpClient.getMatchHistorySummary("puuid-1", 0, 50, "ranked", "HN1"))
                .thenReturn(historyResponse(100001L));

        MatchHistoryFetchResult result = provider.fetchMatchHistory("puuid-1", options);

        assertThat(result.getMatches()).extracting(MatchHistory::getGameId).containsExactly(100001L);
        assertThat(result.getRawSummaryJsonByGameId()).containsKey(100001L);
        assertThat(result.getRawSummaryJsonByGameId().get(100001L)).contains("\"gameId\":100001");
        assertThat(result.isRawEmpty()).isFalse();
        verify(sgpHttpClient).getMatchHistorySummary("puuid-1", 0, 50, "ranked", "HN1");
    }

    @Test
    void fetchMatchHistoryCapsSummaryCount() {
        MatchHistoryQueryOptions options = new MatchHistoryQueryOptions(
                0,
                499,
                null,
                null,
                500,
                false,
                MatchHistorySource.SGP,
                "HN1",
                null
        );
        when(sgpHttpClient.getMatchHistorySummary("puuid-1", 0, 200, null, "HN1"))
                .thenReturn(historyResponse(100001L));

        provider.fetchMatchHistory("puuid-1", options);

        verify(sgpHttpClient).getMatchHistorySummary("puuid-1", 0, 200, null, "HN1");
    }

    @Test
    void fetchMatchHistoryAttachesRequestedPuuidToSingleParticipantSummary() {
        MatchHistoryQueryOptions options = options(MatchHistorySource.SGP, "HN1", null);
        when(sgpHttpClient.getMatchHistorySummary("puuid-1", 0, 50, null, "HN1"))
                .thenReturn(singleParticipantHistoryResponse(100001L));

        MatchHistoryFetchResult result = provider.fetchMatchHistory("puuid-1", options);

        MatchHistory match = result.getMatches().getFirst();
        assertThat(match.getParticipantIdentities()).hasSize(1);
        assertThat(match.getParticipantIdentities().getFirst().getParticipantId()).isEqualTo(1);
        assertThat(match.getParticipantIdentities().getFirst().getPlayer().getPuuid()).isEqualTo("puuid-1");
    }

    @Test
    void fetchGameDetail_mapsParticipantsFromSummary() {
        MatchHistoryQueryOptions options = options(MatchHistorySource.SGP, "HN1", null);
        when(sgpHttpClient.getGameSummary(300001L, "HN1")).thenReturn(gameDetailResponse(300001L));

        GameDetail detail = provider.fetchGameDetail(300001L, options);

        assertThat(detail.getGameId()).isEqualTo(300001L);
        assertThat(detail.getParticipants()).hasSize(10);
        assertThat(detail.getParticipants().getFirst().getStats().getWin()).isTrue();
        verify(sgpHttpClient).getGameSummary(300001L, "HN1");
        verify(sgpHttpClient, never()).getGameDetails(anyLong(), anyString());
    }

    @Test
    void fetchGameDetail_fallsBackToDetailsWhenSummaryHasNoParticipants() {
        MatchHistoryQueryOptions options = options(MatchHistorySource.SGP, "HN1", null);
        when(sgpHttpClient.getGameSummary(300002L, "HN1")).thenReturn(emptySummaryResponse(300002L));
        when(sgpHttpClient.getGameDetails(300002L, "HN1")).thenReturn(timelineResponse(300002L));

        GameDetail detail = provider.fetchGameDetail(300002L, options);

        assertThat(detail.getGameId()).isEqualTo(300002L);
        assertThat(detail.getParticipants()).isEmpty();
        verify(sgpHttpClient).getGameDetails(300002L, "HN1");
    }

    @Test
    void fetchGameDetail_fallsBackToDetailsWhenSummaryFails() {
        MatchHistoryQueryOptions options = options(MatchHistorySource.SGP, "HN1", null);
        when(sgpHttpClient.getGameSummary(300003L, "HN1")).thenThrow(new RuntimeException("summary unavailable"));
        when(sgpHttpClient.getGameDetails(300003L, "HN1")).thenReturn(timelineResponse(300003L));

        GameDetail detail = provider.fetchGameDetail(300003L, options);

        assertThat(detail.getGameId()).isEqualTo(300003L);
        verify(sgpHttpClient).getGameDetails(300003L, "HN1");
    }

    @Test
    void fetchGameTimeline_mapsSgpDetailsFramesAndKeepsRawJson() {
        MatchHistoryQueryOptions options = options(MatchHistorySource.SGP, "HN1", null);
        when(sgpHttpClient.getGameDetails(300006L, "HN1")).thenReturn(timelineResponse(300006L));

        MatchTimelineFetchResult result = provider.fetchGameTimeline(300006L, options);

        assertThat(result.getGameId()).isEqualTo(300006L);
        assertThat(result.getStatus()).isEqualTo("FETCHED");
        assertThat(result.getRawDetailJson()).contains("\"frames\"");
        assertThat(result.getRawTimelineJson()).contains("\"frames\"");
        assertThat(result.getTimeline().getEvents()).hasSize(1);
        assertThat(result.getTimeline().getEvents().getFirst().getEventType()).isEqualTo("CHAMPION_KILL");
    }

    @Test
    void supportsRequiresReadySupportedMatchHistoryStatus() {
        when(serverResolver.resolveStatus("HN1")).thenReturn(SgpStatus.builder()
                .supported(true)
                .matchHistorySupported(true)
                .tokenReady(true)
                .sgpServerId("HN1")
                .authState(readyAuth())
                .build());

        assertThat(provider.source()).isEqualTo(MatchHistorySource.SGP);
        assertThat(provider.supports(options(MatchHistorySource.AUTO, "HN1", null))).isTrue();

        when(serverResolver.resolveStatus("HN1")).thenReturn(SgpStatus.builder()
                .supported(false)
                .matchHistorySupported(false)
                .tokenReady(true)
                .sgpServerId("HN1")
                .authState(readyAuth())
                .build());

        assertThat(provider.supports(options(MatchHistorySource.AUTO, "HN1", null))).isFalse();
    }

    private MatchHistoryQueryOptions options(MatchHistorySource source, String sgpServerId, String tag) {
        return new MatchHistoryQueryOptions(
                0,
                99,
                null,
                null,
                50,
                false,
                source,
                sgpServerId,
                tag
        );
    }

    private ObjectNode historyResponse(long gameId) {
        ObjectNode response = objectMapper.createObjectNode();
        ObjectNode wrapper = response.putObject("games");
        wrapper.putArray("games").add(gameNode(gameId));
        return response;
    }

    private ObjectNode singleParticipantHistoryResponse(long gameId) {
        ObjectNode response = objectMapper.createObjectNode();
        ObjectNode wrapper = response.putObject("games");
        ObjectNode game = wrapper.putArray("games").addObject();
        game.put("gameId", gameId);
        game.put("queueId", 420);
        game.put("gameMode", "CLASSIC");
        game.put("gameCreation", 1710000000000L);
        game.put("gameDuration", 1800);
        game.put("mapId", 11);
        ArrayNode participants = game.putArray("participants");
        ObjectNode participant = participants.addObject();
        participant.put("participantId", 1);
        participant.put("teamId", 100);
        participant.put("championId", 101);
        ObjectNode stats = participant.putObject("stats");
        stats.put("win", true);
        stats.put("kills", 8);
        stats.put("deaths", 2);
        stats.put("assists", 11);
        return response;
    }

    @Test
    void fetchMatchHistoryFillsRequestedSummonerName() {
        MatchHistoryQueryOptions options = options(MatchHistorySource.SGP, "HN1", "ranked");
        when(sgpHttpClient.getMatchHistorySummary("puuid-1", 0, 50, "ranked", "HN1"))
                .thenReturn(namelessSingleParticipantResponse(100001L));
        Summoner summoner = new Summoner();
        summoner.setPuuid("puuid-1");
        summoner.setGameName("练习两年半的ikun");
        summoner.setTagLine("58092");
        when(summonerService.getSummonerByPuuid("puuid-1")).thenReturn(summoner);

        MatchHistoryFetchResult result = provider.fetchMatchHistory("puuid-1", options);

        MatchHistory.Player player = result.getMatches().getFirst()
                .getParticipantIdentities().getFirst().getPlayer();
        assertThat(player.getGameName()).isEqualTo("练习两年半的ikun");
        assertThat(player.getTagLine()).isEqualTo("58092");
        assertThat(player.getSummonerName()).isEqualTo("练习两年半的ikun");
    }

    /** 真实 SGP 列表接口的样子：身份里只有 summonerId + puuid，没有名字。 */
    private ObjectNode namelessSingleParticipantResponse(long gameId) {
        ObjectNode response = objectMapper.createObjectNode();
        ObjectNode wrapper = response.putObject("games");
        ObjectNode game = wrapper.putArray("games").addObject();
        game.put("gameId", gameId);
        game.put("queueId", 420);
        game.put("gameMode", "CLASSIC");
        game.put("gameCreation", 1710000000000L);
        game.put("gameDuration", 1800);
        game.put("mapId", 11);
        ObjectNode participant = game.putArray("participants").addObject();
        participant.put("participantId", 1);
        participant.put("teamId", 100);
        participant.put("championId", 101);
        participant.putObject("stats").put("win", true);
        ObjectNode identity = game.putArray("participantIdentities").addObject();
        identity.put("participantId", 1);
        ObjectNode player = identity.putObject("player");
        player.put("summonerId", 2933903491042112L);
        player.put("puuid", "puuid-1");
        return response;
    }

    private ObjectNode gameDetailResponse(long gameId) {
        ObjectNode response = objectMapper.createObjectNode();
        response.set("game", gameNode(gameId));
        return response;
    }

    private ObjectNode emptySummaryResponse(long gameId) {
        ObjectNode response = objectMapper.createObjectNode();
        ObjectNode json = response.putObject("json");
        json.put("gameId", gameId);
        json.putArray("participants");
        return response;
    }

    private ObjectNode timelineResponse(long gameId) {
        ObjectNode response = objectMapper.createObjectNode();
        ObjectNode json = response.putObject("json");
        json.put("gameId", gameId);
        ArrayNode frames = json.putArray("frames");
        ObjectNode frame = frames.addObject();
        frame.put("timestamp", 60000);
        ObjectNode event = frame.putArray("events").addObject();
        event.put("type", "CHAMPION_KILL");
        event.put("timestamp", 71613);
        event.put("killerId", 9);
        event.put("victimId", 4);
        event.putObject("position").put("x", 5853).put("y", 6923);
        return response;
    }

    private ObjectNode gameNode(long gameId) {
        ObjectNode game = objectMapper.createObjectNode();
        game.put("gameId", gameId);
        game.put("queueId", 420);
        game.put("gameMode", "CLASSIC");
        game.put("gameCreation", 1710000000000L);
        game.put("gameDuration", 1800);
        game.put("mapId", 11);
        ArrayNode participants = game.putArray("participants");
        for (int participantId = 1; participantId <= 10; participantId++) {
            participants.add(participantNode(participantId));
        }
        return game;
    }

    private ObjectNode participantNode(int participantId) {
        ObjectNode participant = objectMapper.createObjectNode();
        participant.put("participantId", participantId);
        participant.put("teamId", participantId <= 5 ? 100 : 200);
        participant.put("championId", 100 + participantId);
        participant.put("spell1Id", 4);
        participant.put("spell2Id", 14);
        participant.putObject("stats").put("win", participantId <= 5);
        ObjectNode player = participant.putObject("player");
        player.put("puuid", "test-puuid-" + participantId);
        player.put("gameName", "Player" + participantId);
        player.put("tagLine", "T" + participantId);
        return participant;
    }

    private SgpAuthState readyAuth() {
        return SgpAuthState.builder()
                .entitlementsTokenReady(true)
                .leagueSessionTokenReady(true)
                .ready(true)
                .build();
    }
}
