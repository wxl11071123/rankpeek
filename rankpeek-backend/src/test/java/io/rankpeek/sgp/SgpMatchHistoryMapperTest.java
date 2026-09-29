package io.rankpeek.sgp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.rankpeek.model.MatchHistory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

class SgpMatchHistoryMapperTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private SgpMatchHistoryMapper mapper;

    @BeforeEach
    void setUp() {
        mapper = new SgpMatchHistoryMapper();
    }

    @Test
    void mapMatchHistorySummary_readsRiotIdFromParticipantNodeWhenIdentityHasOnlyPuuid() {
        // SGP 新格式：Riot ID 挂在参赛者节点上，身份节点的 player 只有 summonerId + puuid
        ObjectNode response = objectMapper.createObjectNode();
        ArrayNode games = response.putObject("games").putArray("games");
        ObjectNode game = games.addObject();
        game.put("gameId", 200001L);
        game.put("queueId", 420);
        game.put("gameCreation", 1710000000000L);
        game.put("gameDuration", 1800);
        ObjectNode participant = game.putArray("participants").addObject();
        participant.put("participantId", 1);
        participant.put("teamId", 100);
        participant.put("championId", 904);
        participant.put("riotIdGameName", "练习两年半的ikun");
        participant.put("riotIdTagline", "58092");
        participant.putObject("stats").put("win", true);
        ObjectNode identity = game.putArray("participantIdentities").addObject();
        identity.put("participantId", 1);
        ObjectNode player = identity.putObject("player");
        player.put("puuid", "puuid-1");
        player.put("summonerId", 2933903491042112L);

        MatchHistory match = mapper.mapMatchHistorySummary(response).getFirst();

        MatchHistory.Player mapped = match.getParticipantIdentities().getFirst().getPlayer();
        assertThat(mapped.getGameName()).isEqualTo("练习两年半的ikun");
        assertThat(mapped.getTagLine()).isEqualTo("58092");
        assertThat(mapped.getSummonerName()).isEqualTo("练习两年半的ikun");
    }

    @Test
    void mapMatchHistorySummary_mapsVisibleMatchesIncludingRemakesWithTenPlayerRoster() {
        ObjectNode response = objectMapper.createObjectNode();
        ObjectNode gamesWrapper = response.putObject("games");
        ArrayNode games = gamesWrapper.putArray("games");
        games.add(gameNode(100001L, 1710000000000L, 1860, false, true));
        games.add(gameNode(100002L, 1710000005000L, 180, true, true));

        List<MatchHistory> matches = mapper.mapMatchHistorySummary(response);

        assertThat(matches).extracting(MatchHistory::getGameId).containsExactly(100002L, 100001L);
        assertThat(matches.get(0).getGameDuration()).isEqualTo(180);
        assertThat(matches.get(0).getRemake()).isTrue();

        MatchHistory match = matches.get(1);
        assertThat(match.getGameId()).isEqualTo(100001L);
        assertThat(match.getQueueId()).isEqualTo(420);
        assertThat(match.getGameMode()).isEqualTo("CLASSIC");
        assertThat(match.getGameCreation()).isEqualTo(1710000000000L);
        assertThat(match.getGameDuration()).isEqualTo(1860);
        assertThat(match.getMapId()).isEqualTo(11);
        assertThat(match.getParticipants()).hasSize(10);
        assertThat(match.getParticipantIdentities()).hasSize(10);

        MatchHistory.Participant participant = match.getParticipants().get(0);
        assertThat(participant.getParticipantId()).isEqualTo(1);
        assertThat(participant.getTeamId()).isEqualTo(100);
        assertThat(participant.getChampionId()).isEqualTo(266);
        assertThat(participant.getSpell1Id()).isEqualTo(4);
        assertThat(participant.getSpell2Id()).isEqualTo(12);
        assertThat(participant.getStats().getWin()).isTrue();
        assertThat(participant.getStats().getKills()).isEqualTo(8);
        assertThat(participant.getStats().getDeaths()).isEqualTo(2);
        assertThat(participant.getStats().getAssists()).isEqualTo(11);
        assertThat(participant.getStats().getItem0()).isEqualTo(3078);
        assertThat(participant.getStats().getItem6()).isEqualTo(3364);
        assertThat(participant.getStats().getTotalDamageDealtToChampions()).isEqualTo(24123);
        assertThat(participant.getStats().getTotalDamageTaken()).isEqualTo(18321);
        assertThat(participant.getStats().getGoldEarned()).isEqualTo(14321);
        assertThat(participant.getStats().getTotalMinionsKilled()).isEqualTo(214);
        assertThat(participant.getStats().getNeutralMinionsKilled()).isEqualTo(12);
        assertThat(participant.getStats().getDoubleKills()).isEqualTo(2);
        assertThat(participant.getStats().getTripleKills()).isEqualTo(1);
        assertThat(participant.getStats().getQuadraKills()).isZero();
        assertThat(participant.getStats().getPentaKills()).isZero();
        assertThat(participant.getStats().getLargestKillingSpree()).isEqualTo(8);
        assertThat(participant.getStats().getLegendaryCount()).isEqualTo(1);
        assertThat(participant.getStats().getPerk0()).isEqualTo(8010);
        assertThat(participant.getStats().getPlayerAugment1()).isEqualTo(10001);

        MatchHistory.Player player = match.getParticipantIdentities().get(0).getPlayer();
        assertThat(player.getPuuid()).isEqualTo("fake-puuid-1");
        assertThat(player.getGameName()).isEqualTo("MaskedPlayer1");
        assertThat(player.getTagLine()).isEqualTo("TAG1");
        assertThat(player.getSummonerName()).isEqualTo("MaskedSummoner1");
        assertThat(player.getSummonerId()).isEqualTo(9001L);
    }

    @Test
    void mapMatchHistorySummary_mapsTencentSummaryWrappedJsonGame() {
        ObjectNode response = objectMapper.createObjectNode();
        ArrayNode games = response.putArray("games");
        ObjectNode wrappedGame = games.addObject();
        wrappedGame.putObject("metadata").put("info_type", "GAME");
        wrappedGame.set("json", gameNode(100003L, 1710000007000L, 1900, false, true));

        List<MatchHistory> matches = mapper.mapMatchHistorySummary(response);

        assertThat(matches).hasSize(1);
        assertThat(matches.get(0).getGameId()).isEqualTo(100003L);
        assertThat(matches.get(0).getParticipants()).hasSize(10);
        assertThat(matches.get(0).getParticipantIdentities()).hasSize(10);
    }

    @Test
    void mapMatchHistorySummary_readsLoadoutFieldsFromParticipantWhenStatsOmitsThem() {
        ObjectNode response = objectMapper.createObjectNode();
        ArrayNode games = response.putArray("games");
        ObjectNode game = gameNode(100004L, 1710000008000L, 1900, false, true);
        ObjectNode participant = (ObjectNode) game.withArray("participants").get(0);
        ObjectNode stats = (ObjectNode) participant.get("stats");
        stats.remove(List.of(
                "doubleKills",
                "tripleKills",
                "quadraKills",
                "pentaKills",
                "largestKillingSpree",
                "legendaryCount",
                "perk0",
                "playerAugment1",
                "playerAugment2",
                "playerAugment3",
                "playerAugment4"
        ));
        participant.put("doubleKills", 4);
        participant.put("tripleKills", 2);
        participant.put("quadraKills", 1);
        participant.put("pentaKills", 0);
        participant.put("largestKillingSpree", 11);
        participant.put("legendaryCount", 2);
        participant.put("perk0", 8437);
        participant.put("playerAugment1", 30001);
        participant.put("playerAugment2", 30002);
        participant.put("playerAugment3", 30003);
        participant.put("playerAugment4", 30004);
        games.add(game);

        List<MatchHistory> matches = mapper.mapMatchHistorySummary(response);

        MatchHistory.Stats mappedStats = matches.getFirst().getParticipants().getFirst().getStats();
        assertThat(mappedStats.getDoubleKills()).isEqualTo(4);
        assertThat(mappedStats.getTripleKills()).isEqualTo(2);
        assertThat(mappedStats.getQuadraKills()).isEqualTo(1);
        assertThat(mappedStats.getLargestKillingSpree()).isEqualTo(11);
        assertThat(mappedStats.getLegendaryCount()).isEqualTo(2);
        assertThat(mappedStats.getPerk0()).isEqualTo(8437);
        assertThat(mappedStats.getPlayerAugment1()).isEqualTo(30001);
        assertThat(mappedStats.getPlayerAugment2()).isEqualTo(30002);
        assertThat(mappedStats.getPlayerAugment3()).isEqualTo(30003);
        assertThat(mappedStats.getPlayerAugment4()).isEqualTo(30004);
    }

    @Test
    void mapMatchHistorySummary_readsNestedPerkIdsAndChallengeDerivedFieldsWithoutRetainingRawMaps() {
        ObjectNode response = objectMapper.createObjectNode();
        ArrayNode games = response.putArray("games");
        ObjectNode game = gameNode(100005L, 1710000009000L, 1900, false, true);
        ObjectNode participant = (ObjectNode) game.withArray("participants").get(0);
        ObjectNode stats = (ObjectNode) participant.get("stats");
        stats.remove(List.of("perk0", "legendaryCount"));
        participant.remove("perk0");
        participant.remove("legendaryCount");

        ObjectNode perks = participant.putObject("perks");
        ArrayNode styles = perks.putArray("styles");
        ObjectNode primaryStyle = styles.addObject();
        primaryStyle.put("style", 8000);
        ArrayNode primarySelections = primaryStyle.putArray("selections");
        primarySelections.addObject()
                .put("perk", 8010)
                .put("var1", 123)
                .put("var2", 456)
                .put("var3", 789);
        primarySelections.addObject().put("perk", 9111);
        ObjectNode subStyle = styles.addObject();
        subStyle.put("style", 8300);
        subStyle.putArray("selections").addObject().put("perk", 8345);

        ObjectNode challenges = participant.putObject("challenges");
        challenges.put("legendaryCount", 2);
        challenges.put("soloKills", 3);
        games.add(game);

        MatchHistory.Stats mappedStats = mapper.mapMatchHistorySummary(response)
                .getFirst()
                .getParticipants()
                .getFirst()
                .getStats();

        assertThat(mappedStats.getPerk0()).isEqualTo(8010);
        assertThat(mappedStats.getPerkPrimaryStyle()).isEqualTo(8000);
        assertThat(mappedStats.getPerkSubStyle()).isEqualTo(8300);
        assertThat(mappedStats.getLegendaryCount()).isEqualTo(2);
        assertThat(mappedStats.getChallenges()).isNull();
        assertThat(mappedStats.getPerks()).isNull();
        assertThat(mappedStats.getExtraFields()).isEmpty();
    }

    @Test
    void mapMatchHistorySummary_toleratesMissingFieldsAndSkipsGamesWithoutParticipants() {
        ObjectNode response = objectMapper.createObjectNode();
        ArrayNode games = response.putArray("games");
        games.addNull();
        ObjectNode missingParticipants = games.addObject();
        missingParticipants.put("gameId", 200001L);
        missingParticipants.put("gameDuration", 1800);

        assertThatCode(() -> mapper.mapMatchHistorySummary(response)).doesNotThrowAnyException();
        assertThat(mapper.mapMatchHistorySummary(response)).isEmpty();
    }

    @Test
    void mapMatchHistorySummary_returnsEmptyListWhenJsonIsMissing() {
        assertThat(mapper.mapMatchHistorySummary(null)).isEmpty();
    }

    private ObjectNode gameNode(long gameId, long gameCreation, int gameDuration, boolean remake, boolean withParticipants) {
        ObjectNode game = objectMapper.createObjectNode();
        game.put("gameId", gameId);
        game.put("queueId", 420);
        game.put("gameMode", "CLASSIC");
        game.put("gameCreation", gameCreation);
        game.put("gameDuration", gameDuration);
        game.put("mapId", 11);
        game.put("remake", remake);
        if (withParticipants) {
            ArrayNode participants = game.putArray("participants");
            for (int i = 1; i <= 10; i++) {
                participants.add(participantNode(i));
            }
        }
        return game;
    }

    private ObjectNode participantNode(int participantId) {
        ObjectNode participant = objectMapper.createObjectNode();
        participant.put("participantId", participantId);
        participant.put("teamId", participantId <= 5 ? 100 : 200);
        participant.put("championId", participantId == 1 ? 266 : 100 + participantId);
        participant.put("spell1Id", participantId == 1 ? 4 : 7);
        participant.put("spell2Id", participantId == 1 ? 12 : 14);

        ObjectNode stats = participant.putObject("stats");
        stats.put("win", participantId <= 5);
        stats.put("kills", participantId == 1 ? 8 : participantId);
        stats.put("deaths", participantId == 1 ? 2 : 3);
        stats.put("assists", participantId == 1 ? 11 : 4);
        stats.put("item0", participantId == 1 ? 3078 : 1000 + participantId);
        stats.put("item1", 3006);
        stats.put("item2", 3053);
        stats.put("item3", 3156);
        stats.put("item4", 6333);
        stats.put("item5", 3047);
        stats.put("item6", participantId == 1 ? 3364 : 3340);
        stats.put("totalDamageDealtToChampions", participantId == 1 ? 24123 : 10000 + participantId);
        stats.put("totalDamageTaken", participantId == 1 ? 18321 : 9000 + participantId);
        stats.put("goldEarned", participantId == 1 ? 14321 : 8000 + participantId);
        stats.put("totalMinionsKilled", participantId == 1 ? 214 : 100 + participantId);
        stats.put("neutralMinionsKilled", participantId == 1 ? 12 : participantId);
        stats.put("visionScore", participantId == 1 ? 31 : participantId);
        stats.put("doubleKills", participantId == 1 ? 2 : 0);
        stats.put("tripleKills", participantId == 1 ? 1 : 0);
        stats.put("quadraKills", 0);
        stats.put("pentaKills", 0);
        stats.put("largestKillingSpree", participantId == 1 ? 8 : 1);
        stats.put("legendaryCount", participantId == 1 ? 1 : 0);
        stats.put("perk0", participantId == 1 ? 8010 : 8005);
        stats.put("playerAugment1", participantId == 1 ? 10001 : 10002);

        ObjectNode player = participant.putObject("player");
        player.put("puuid", "fake-puuid-" + participantId);
        player.put("gameName", "MaskedPlayer" + participantId);
        player.put("tagLine", "TAG" + participantId);
        player.put("summonerName", "MaskedSummoner" + participantId);
        player.put("summonerId", 9000L + participantId);
        return participant;
    }
}
