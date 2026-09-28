package io.rankpeek.sgp;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.rankpeek.model.GameDetail;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.tuple;

class SgpGameDetailMapperTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private SgpGameDetailMapper mapper;

    @BeforeEach
    void setUp() {
        mapper = new SgpGameDetailMapper();
    }

    @Test
    void mapGameSummary_mapsGameDetailRosterAndPlayerStats() {
        ObjectNode response = objectMapper.createObjectNode();
        response.set("game", gameNode(300001L, true));

        GameDetail detail = mapper.mapGameSummary(response);

        assertThat(detail.getGameId()).isEqualTo(300001L);
        assertThat(detail.getQueueId()).isEqualTo(450);
        assertThat(detail.getGameMode()).isEqualTo("ARAM");
        assertThat(detail.getGameCreation()).isEqualTo(1710001234000L);
        assertThat(detail.getGameDuration()).isEqualTo(1320L);
        assertThat(detail.getMapId()).isEqualTo(12);
        assertThat(detail.getParticipants()).hasSize(10);
        assertThat(detail.getParticipantIdentities()).hasSize(10);

        GameDetail.GameParticipant participant = detail.getParticipants().get(0);
        assertThat(participant.getParticipantId()).isEqualTo(1);
        assertThat(participant.getTeamId()).isEqualTo(100);
        assertThat(participant.getChampionId()).isEqualTo(103);
        assertThat(participant.getSpell1Id()).isEqualTo(4);
        assertThat(participant.getSpell2Id()).isEqualTo(32);
        assertThat(participant.getStats().getWin()).isTrue();
        assertThat(participant.getStats().getKills()).isEqualTo(13);
        assertThat(participant.getStats().getDeaths()).isEqualTo(4);
        assertThat(participant.getStats().getAssists()).isEqualTo(22);
        assertThat(participant.getStats().getItem0()).isEqualTo(6655);
        assertThat(participant.getStats().getItem6()).isEqualTo(3363);
        assertThat(participant.getStats().getTotalDamageDealtToChampions()).isEqualTo(32123L);
        assertThat(participant.getStats().getTotalDamageTaken()).isEqualTo(20321L);
        assertThat(participant.getStats().getGoldEarned()).isEqualTo(15321L);
        assertThat(participant.getStats().getTotalMinionsKilled()).isEqualTo(72);
        assertThat(participant.getStats().getNeutralMinionsKilled()).isEqualTo(0);
        assertThat(participant.getStats().getVisionScore()).isEqualTo(18);
        assertThat(participant.getStats().getDoubleKills()).isEqualTo(3);
        assertThat(participant.getStats().getTripleKills()).isEqualTo(2);
        assertThat(participant.getStats().getQuadraKills()).isEqualTo(1);
        assertThat(participant.getStats().getPentaKills()).isZero();
        assertThat(participant.getStats().getLargestKillingSpree()).isEqualTo(9);
        assertThat(participant.getStats().getLegendaryCount()).isEqualTo(1);
        assertThat(participant.getStats().getPerk0()).isEqualTo(8214);
        assertThat(participant.getStats().getPlayerAugment1()).isEqualTo(20001);

        GameDetail.Player player = detail.getParticipantIdentities().get(0).getPlayer();
        assertThat(player.getPuuid()).isEqualTo("detail-puuid-1");
        assertThat(player.getGameName()).isEqualTo("DetailPlayer1");
        assertThat(player.getTagLine()).isEqualTo("D1");
        assertThat(player.getSummonerName()).isEqualTo("DetailSummoner1");
        assertThat(player.getSummonerId()).isEqualTo(7001L);
    }

    @Test
    void mapGameSummary_mapsTencentWrappedJsonGame() {
        ObjectNode response = objectMapper.createObjectNode();
        response.set("json", gameNode(300003L, true));

        GameDetail detail = mapper.mapGameSummary(response);

        assertThat(detail.getGameId()).isEqualTo(300003L);
        assertThat(detail.getParticipants()).hasSize(10);
        assertThat(detail.getParticipantIdentities()).hasSize(10);
    }

    @Test
    void mapGameSummary_readsLoadoutFieldsFromParticipantWhenStatsOmitsThem() {
        ObjectNode response = objectMapper.createObjectNode();
        ObjectNode game = gameNode(300004L, true);
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
        response.set("game", game);

        GameDetail detail = mapper.mapGameSummary(response);

        GameDetail.Stats mappedStats = detail.getParticipants().getFirst().getStats();
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
    void mapGameSummary_readsNestedPerksAndChallengesFromLiveSgpSummaryShape() {
        ObjectNode response = objectMapper.createObjectNode();
        ObjectNode game = gameNode(300005L, true);
        ObjectNode participant = (ObjectNode) game.withArray("participants").get(0);
        ObjectNode stats = (ObjectNode) participant.get("stats");
        stats.remove(List.of("perk0", "legendaryCount"));
        participant.remove("perk0");
        participant.remove("legendaryCount");

        ObjectNode perks = participant.putObject("perks");
        ArrayNode styles = perks.putArray("styles");
        ObjectNode primaryStyle = styles.addObject();
        primaryStyle.put("style", 8000);
        primaryStyle.putArray("selections")
                .addObject()
                .put("perk", 8128)
                .put("var1", 11)
                .put("var2", 22)
                .put("var3", 33);
        ObjectNode subStyle = styles.addObject();
        subStyle.put("style", 8100);
        subStyle.putArray("selections").addObject().put("perk", 8135);

        ObjectNode challenges = participant.putObject("challenges");
        challenges.put("legendaryCount", 3);
        challenges.put("damagePerMinute", 1234.5);
        participant.put("liveOnlyMetric", 2468);
        response.set("game", game);

        GameDetail detail = mapper.mapGameSummary(response);
        GameDetail.Stats mappedStats = detail.getParticipants().getFirst().getStats();

        assertThat(mappedStats.getPerk0()).isEqualTo(8128);
        assertThat(mappedStats.getPerkPrimaryStyle()).isEqualTo(8000);
        assertThat(mappedStats.getPerkSubStyle()).isEqualTo(8100);
        assertThat(mappedStats.getLegendaryCount()).isEqualTo(3);
        assertThat(mappedStats.getChallenges()).containsEntry("damagePerMinute", 1234.5);
        assertThat(mappedStats.getExtraFields()).containsEntry("liveOnlyMetric", 2468);
        assertThat(mappedStats.getPerks()).isNotEmpty();
        assertThatCode(() -> {
            String serialized = objectMapper.writeValueAsString(detail);
            assertThat(serialized).contains("\"extraFields\"").contains("liveOnlyMetric");
        }).doesNotThrowAnyException();
    }

    @Test
    void mapGameSummary_preservesRawParticipantPositionFields() {
        ObjectNode response = objectMapper.createObjectNode();
        ObjectNode game = gameNode(300006L, true);
        ObjectNode participant = (ObjectNode) game.withArray("participants").get(0);
        participant.put("teamPosition", "MIDDLE");
        participant.put("individualPosition", "MIDDLE");
        participant.put("selectedPosition", "MID");
        participant.put("lane", "MIDDLE");
        participant.put("role", "SOLO");
        response.set("game", game);

        GameDetail mapped = mapper.mapGameSummary(response);

        GameDetail.GameParticipant mappedParticipant = mapped.getParticipants().getFirst();
        assertThat(mappedParticipant.getTeamPosition()).isEqualTo("MIDDLE");
        assertThat(mappedParticipant.getIndividualPosition()).isEqualTo("MIDDLE");
        assertThat(mappedParticipant.getSelectedPosition()).isEqualTo("MID");
        assertThat(mappedParticipant.getTimeline()).isNotNull();
        assertThat(mappedParticipant.getTimeline().getRawLane()).isEqualTo("MIDDLE");
        assertThat(mappedParticipant.getTimeline().getRawRole()).isEqualTo("SOLO");
        assertThat(mappedParticipant.getStats().getExtraFields())
                .doesNotContainKeys("teamPosition", "individualPosition", "selectedPosition", "lane", "role");
    }

    @Test
    void mapGameDetails_toleratesMissingFieldsAndParticipants() {
        ObjectNode response = objectMapper.createObjectNode();
        response.put("gameId", 300002L);
        response.put("gameDuration", 1400);

        assertThatCode(() -> mapper.mapGameDetails(response)).doesNotThrowAnyException();

        GameDetail detail = mapper.mapGameDetails(response);
        assertThat(detail.getGameId()).isEqualTo(300002L);
        assertThat(detail.getParticipants()).isEmpty();
        assertThat(detail.getParticipantIdentities()).isEmpty();
    }

    @Test
    void mapGameDetails_mapsTeamBansAndObjectiveTotalsFromTeams() {
        ObjectNode response = objectMapper.createObjectNode();
        ObjectNode game = gameNode(300007L, true);
        game.put("queueId", 420);
        ArrayNode teams = game.putArray("teams");
        ObjectNode blue = teams.addObject();
        blue.put("teamId", 100);
        blue.put("baronKills", 1);
        blue.put("dragonKills", 3);
        blue.put("riftHeraldKills", 1);
        blue.put("hordeKills", 3);
        blue.put("towerKills", 4);
        blue.put("inhibitorKills", 2);
        blue.put("turretPlateKills", 6);
        blue.put("dragonSoulType", "FIRE_DRAGON");
        blue.put("elderDragonKills", 0);
        ArrayNode blueBans = blue.putArray("bans");
        blueBans.addObject().put("championId", 103);
        blueBans.addObject().put("championId", -1);
        blueBans.addObject().put("championId", 0);
        blueBans.addObject().put("championId", 55);
        blueBans.addObject().put("championId", 99);
        blueBans.addObject().put("championId", 101);
        blueBans.addObject().put("championId", 102);
        ObjectNode red = teams.addObject();
        red.put("teamId", 200);
        red.put("baronKills", 0);
        red.put("dragonKills", 0);
        red.put("elderDragonKills", 1);
        ObjectNode redObjectives = red.putObject("objectives");
        redObjectives.putObject("baron").put("kills", 2);
        redObjectives.putObject("dragon").put("kills", 4);
        redObjectives.putObject("horde").put("kills", 5);
        redObjectives.putObject("riftHerald").put("kills", 1);
        redObjectives.putObject("elder").put("kills", 1);
        redObjectives.putObject("turret").put("kills", 7);
        redObjectives.putObject("inhibitor").put("kills", 1);
        redObjectives.putObject("turretPlate").put("kills", 9);
        ((ObjectNode) redObjectives.get("dragon")).put("soulType", "OCEAN_DRAGON");
        response.set("game", game);

        GameDetail detail = mapper.mapGameDetails(response);

        assertThat(detail.getTeamObjectives()).hasSize(2);
        GameDetail.TeamObjectiveSummary blueSummary = detail.getTeamObjectives().get(0);
        assertThat(blueSummary.getTeamId()).isEqualTo(100);
        assertThat(blueSummary.getBans()).containsExactly(103, 55, 99, 101, 102);
        assertThat(blueSummary.getBaronKills()).isEqualTo(1);
        assertThat(blueSummary.getDragonKills()).isEqualTo(3);
        assertThat(blueSummary.getHeraldKills()).isEqualTo(1);
        assertThat(blueSummary.getVoidGrubKills()).isEqualTo(3);
        assertThat(blueSummary.getTurretKills()).isEqualTo(4);
        assertThat(blueSummary.getInhibitorKills()).isEqualTo(2);
        assertThat(blueSummary.getTurretPlateKills()).isEqualTo(6);
        assertThat(blueSummary.getDragonSoulType()).isEqualTo("infernal");
        assertThat(blueSummary.getElderDragonKills()).isZero();
        GameDetail.TeamObjectiveSummary redSummary = detail.getTeamObjectives().get(1);
        assertThat(redSummary.getTeamId()).isEqualTo(200);
        assertThat(redSummary.getBans()).isEmpty();
        assertThat(redSummary.getBaronKills()).isEqualTo(2);
        assertThat(redSummary.getDragonKills()).isEqualTo(4);
        assertThat(redSummary.getHeraldKills()).isEqualTo(1);
        assertThat(redSummary.getVoidGrubKills()).isEqualTo(5);
        assertThat(redSummary.getTurretKills()).isEqualTo(7);
        assertThat(redSummary.getInhibitorKills()).isEqualTo(1);
        assertThat(redSummary.getTurretPlateKills()).isEqualTo(9);
        assertThat(redSummary.getDragonSoulType()).isEqualTo("ocean");
        assertThat(redSummary.getElderDragonKills()).isEqualTo(1);
    }

    @Test
    void mapGameDetails_keepsMissingTurretPlateCountNullInsteadOfDefaultZero() {
        ObjectNode response = objectMapper.createObjectNode();
        ObjectNode game = gameNode(300018L, true);
        game.put("queueId", 420);
        ArrayNode teams = game.putArray("teams");
        ObjectNode blue = teams.addObject();
        blue.put("teamId", 100);
        blue.put("baronKills", 1);
        response.set("game", game);

        GameDetail detail = mapper.mapGameDetails(response);

        GameDetail.TeamObjectiveSummary blueSummary = detail.getTeamObjectives().getFirst();
        assertThat(blueSummary.getTeamId()).isEqualTo(100);
        assertThat(blueSummary.getBaronKills()).isEqualTo(1);
        assertThat(blueSummary.getTurretPlateKills()).isNull();
    }

    @Test
    void mapGameDetails_keepsMissingNestedTurretPlateObjectiveNullInsteadOfDefaultZero() {
        ObjectNode response = objectMapper.createObjectNode();
        ObjectNode game = gameNode(300019L, true);
        game.put("queueId", 420);
        ArrayNode teams = game.putArray("teams");
        ObjectNode blue = teams.addObject();
        blue.put("teamId", 100);
        blue.putObject("objectives").putObject("baron").put("kills", 1);
        response.set("game", game);

        GameDetail detail = mapper.mapGameDetails(response);

        GameDetail.TeamObjectiveSummary blueSummary = detail.getTeamObjectives().getFirst();
        assertThat(blueSummary.getTeamId()).isEqualTo(100);
        assertThat(blueSummary.getBaronKills()).isEqualTo(1);
        assertThat(blueSummary.getTurretPlateKills()).isNull();
    }

    @Test
    void mapGameDetails_mapsPositiveTurretPlateCountFromTeamObjectiveAliases() {
        ObjectNode response = objectMapper.createObjectNode();
        ObjectNode game = gameNode(300020L, true);
        game.put("queueId", 420);
        ArrayNode teams = game.putArray("teams");
        ObjectNode blue = teams.addObject();
        blue.put("teamId", 100);
        blue.put("turretPlatesTaken", 6);
        ObjectNode red = teams.addObject();
        red.put("teamId", 200);
        red.putObject("objectives").putObject("plates").put("kills", 4);
        response.set("game", game);

        GameDetail detail = mapper.mapGameDetails(response);

        assertThat(detail.getTeamObjectives())
                .extracting(
                        GameDetail.TeamObjectiveSummary::getTeamId,
                        GameDetail.TeamObjectiveSummary::getTurretPlateKills
                )
                .containsExactly(
                        tuple(100, 6),
                        tuple(200, 4)
                );
    }

    @Test
    void mapGameDetails_countsEliteMonsterTimelineEventsByTeamAndDragonSubtype() {
        ObjectNode response = objectMapper.createObjectNode();
        ObjectNode game = gameNode(300008L, true);
        ArrayNode frames = game.putArray("frames");
        ArrayNode events = frames.addObject().putArray("events");
        events.addObject()
                .put("type", "ELITE_MONSTER_KILL")
                .put("killerTeamId", 100)
                .put("monsterType", "BARON_NASHOR");
        events.addObject()
                .put("type", "ELITE_MONSTER_KILL")
                .put("killerTeamId", 100)
                .put("monsterType", "RIFTHERALD");
        events.addObject()
                .put("type", "ELITE_MONSTER_KILL")
                .put("teamId", 100)
                .put("monsterType", "RIFT_HERALD");
        events.addObject()
                .put("type", "ELITE_MONSTER_KILL")
                .put("killerTeamId", 200)
                .put("monsterType", "HORDE");
        events.addObject()
                .put("type", "ELITE_MONSTER_KILL")
                .put("killerTeamId", 200)
                .put("monsterType", "VOID_GRUB");
        events.addObject()
                .put("type", "ELITE_MONSTER_KILL")
                .put("killerTeamId", 200)
                .put("monsterType", "VOIDGRUB");
        events.addObject()
                .put("type", "ELITE_MONSTER_KILL")
                .put("killerTeamId", 200)
                .put("monsterType", "VOID_GRUBS");
        events.addObject()
                .put("type", "ELITE_MONSTER_KILL")
                .put("killerId", 6)
                .put("monsterType", "DRAGON")
                .put("monsterSubType", "FIRE_DRAGON");
        events.addObject()
                .put("type", "ELITE_MONSTER_KILL")
                .put("killerId", 6)
                .put("monsterType", "DRAGON")
                .put("monsterSubType", "WATER_DRAGON");
        events.addObject()
                .put("type", "ELITE_MONSTER_KILL")
                .put("killerId", 6)
                .put("monsterType", "DRAGON")
                .put("monsterSubType", "AIR_DRAGON");
        events.addObject()
                .put("type", "ELITE_MONSTER_KILL")
                .put("killerId", 6)
                .put("monsterType", "DRAGON")
                .put("monsterSubType", "EARTH_DRAGON");
        events.addObject()
                .put("type", "ELITE_MONSTER_KILL")
                .put("killerId", 6)
                .put("monsterType", "DRAGON")
                .put("monsterSubType", "HEXTECH_DRAGON");
        events.addObject()
                .put("type", "ELITE_MONSTER_KILL")
                .put("killerId", 6)
                .put("monsterType", "DRAGON")
                .put("monsterSubType", "CHEMTECH_DRAGON");
        events.addObject()
                .put("type", "ELITE_MONSTER_KILL")
                .put("killerId", 2)
                .put("monsterType", "ELDER_DRAGON")
                .put("monsterSubType", "ELDER_DRAGON");
        events.addObject()
                .put("type", "ELITE_MONSTER_KILL")
                .put("participantId", 2)
                .put("monsterType", "DRAGON")
                .put("monsterSubType", "ELDER_DRAGON");
        events.addObject()
                .put("type", "ELITE_MONSTER_KILL")
                .put("killerId", 99)
                .put("monsterType", "DRAGON")
                .put("monsterSubType", "AIR_DRAGON");
        events.addObject()
                .put("type", "DRAGON_SOUL_GIVEN")
                .put("teamId", 200)
                .put("monsterSubType", "CHEMTECH_DRAGON");
        response.set("game", game);

        GameDetail detail = mapper.mapGameDetails(response);

        assertThat(detail.getTeamObjectives()).hasSize(2);
        GameDetail.TeamObjectiveSummary blueSummary = detail.getTeamObjectives().stream()
                .filter(summary -> Integer.valueOf(100).equals(summary.getTeamId()))
                .findFirst()
                .orElseThrow();
        assertThat(blueSummary.getBaronKills()).isEqualTo(1);
        assertThat(blueSummary.getHeraldKills()).isEqualTo(2);
        assertThat(blueSummary.getDragonKills()).isNull();
        assertThat(blueSummary.getElderDragonKills()).isEqualTo(2);
        assertThat(blueSummary.getDragonSoulType()).isNull();
        GameDetail.TeamObjectiveSummary redSummary = detail.getTeamObjectives().stream()
                .filter(summary -> Integer.valueOf(200).equals(summary.getTeamId()))
                .findFirst()
                .orElseThrow();
        assertThat(redSummary.getBaronKills()).isNull();
        assertThat(redSummary.getVoidGrubKills()).isEqualTo(4);
        assertThat(redSummary.getDragonKills()).isEqualTo(6);
        assertThat(redSummary.getElderDragonKills()).isNull();
        assertThat(redSummary.getDragonKillsByType()).containsEntry("infernal", 1);
        assertThat(redSummary.getDragonKillsByType()).containsEntry("ocean", 1);
        assertThat(redSummary.getDragonKillsByType()).containsEntry("cloud", 1);
        assertThat(redSummary.getDragonKillsByType()).containsEntry("mountain", 1);
        assertThat(redSummary.getDragonKillsByType()).containsEntry("hextech", 1);
        assertThat(redSummary.getDragonKillsByType()).containsEntry("chemtech", 1);
        assertThat(redSummary.getDragonSoulType()).isEqualTo("chemtech");
    }

    @Test
    void mapGameDetails_doesNotInferDragonSoulFromDragonKillsByType() {
        ObjectNode response = objectMapper.createObjectNode();
        ObjectNode game = gameNode(300010L, true);
        ArrayNode events = game.putArray("frames").addObject().putArray("events");
        for (int i = 0; i < 4; i++) {
            events.addObject()
                    .put("type", "ELITE_MONSTER_KILL")
                    .put("killerTeamId", 100)
                    .put("monsterType", "DRAGON")
                    .put("monsterSubType", "FIRE_DRAGON");
        }
        response.set("game", game);

        GameDetail detail = mapper.mapGameDetails(response);

        GameDetail.TeamObjectiveSummary summary = detail.getTeamObjectives().getFirst();
        assertThat(summary.getDragonKills()).isEqualTo(4);
        assertThat(summary.getDragonKillsByType()).containsEntry("infernal", 4);
        assertThat(summary.getDragonSoulType()).isNull();
    }

    @Test
    void mapGameDetails_countsNashorAliasAsBaron() {
        ObjectNode response = objectMapper.createObjectNode();
        ObjectNode game = gameNode(300013L, true);
        ArrayNode events = game.putArray("frames").addObject().putArray("events");
        events.addObject()
                .put("type", "ELITE_MONSTER_KILL")
                .put("killerTeamId", 100)
                .put("monsterType", "NASHOR");
        response.set("json", game);

        GameDetail detail = mapper.mapGameDetails(response);

        GameDetail.TeamObjectiveSummary summary = detail.getTeamObjectives().getFirst();
        assertThat(summary.getTeamId()).isEqualTo(100);
        assertThat(summary.getBaronKills()).isEqualTo(1);
    }

    @Test
    void mapGameDetails_mapsBuildingPlateAndInhibitorEventsToKillerTeamActors() {
        ObjectNode response = objectMapper.createObjectNode();
        ObjectNode game = gameNode(300015L, true);
        ArrayNode events = game.putArray("frames").addObject().putArray("events");
        events.addObject()
                .put("type", "BUILDING_KILL")
                .put("timestamp", 120000L)
                .put("killerId", 1)
                .put("teamId", 200)
                .put("buildingType", "TOWER_BUILDING");
        events.addObject()
                .put("type", "TURRET_PLATE_DESTROYED")
                .put("timestamp", 180000L)
                .put("participantId", 1)
                .put("teamId", 200);
        events.addObject()
                .put("type", "BUILDING_KILL")
                .put("timestamp", 1440000L)
                .put("killerId", 1)
                .put("teamId", 200)
                .put("buildingType", "INHIBITOR_BUILDING");
        events.addObject()
                .put("type", "BUILDING_KILL")
                .put("timestamp", 1500000L)
                .put("killerId", 6)
                .put("teamId", 100)
                .put("buildingType", "TOWER_BUILDING");
        response.set("game", game);

        GameDetail detail = mapper.mapGameDetails(response);

        GameDetail.TeamObjectiveSummary blueSummary = detail.getTeamObjectives().stream()
                .filter(summary -> Integer.valueOf(100).equals(summary.getTeamId()))
                .findFirst()
                .orElseThrow();
        assertThat(blueSummary.getTurretKills()).isEqualTo(1);
        assertThat(blueSummary.getTurretPlateKills()).isEqualTo(1);
        assertThat(blueSummary.getInhibitorKills()).isEqualTo(1);
        assertThat(blueSummary.getObjectiveEvents())
                .extracting(
                        GameDetail.TeamObjectiveEvent::getKind,
                        GameDetail.TeamObjectiveEvent::getTeamId,
                        GameDetail.TeamObjectiveEvent::getParticipantId,
                        GameDetail.TeamObjectiveEvent::getChampionId,
                        GameDetail.TeamObjectiveEvent::getTimestamp
                )
                .containsExactly(
                        tuple("turret", 100, 1, 103, 120000L),
                        tuple("turretPlate", 100, 1, 103, 180000L),
                        tuple("inhibitor", 100, 1, 103, 1440000L)
                );

        GameDetail.TeamObjectiveSummary redSummary = detail.getTeamObjectives().stream()
                .filter(summary -> Integer.valueOf(200).equals(summary.getTeamId()))
                .findFirst()
                .orElseThrow();
        assertThat(redSummary.getTurretKills()).isEqualTo(1);
        assertThat(redSummary.getObjectiveEvents())
                .extracting(
                        GameDetail.TeamObjectiveEvent::getKind,
                        GameDetail.TeamObjectiveEvent::getTeamId,
                        GameDetail.TeamObjectiveEvent::getParticipantId,
                        GameDetail.TeamObjectiveEvent::getChampionId,
                        GameDetail.TeamObjectiveEvent::getTimestamp
                )
                .containsExactly(tuple("turret", 200, 6, 206, 1500000L));
    }

    @Test
    void mapGameDetails_countsTurretPlateDestroyedByKillerIdActorTeamInsteadOfEventTeamId() {
        ObjectNode response = objectMapper.createObjectNode();
        ObjectNode game = gameNode(300021L, true);
        ArrayNode events = game.putArray("frames").addObject().putArray("events");
        events.addObject()
                .put("type", "TURRET_PLATE_DESTROYED")
                .put("timestamp", 180000L)
                .put("killerId", 6)
                .put("teamId", 100);
        response.set("game", game);

        GameDetail detail = mapper.mapGameDetails(response);

        GameDetail.TeamObjectiveSummary redSummary = detail.getTeamObjectives().getFirst();
        assertThat(redSummary.getTeamId()).isEqualTo(200);
        assertThat(redSummary.getTurretPlateKills()).isEqualTo(1);
        assertThat(redSummary.getObjectiveEvents())
                .extracting(
                        GameDetail.TeamObjectiveEvent::getKind,
                        GameDetail.TeamObjectiveEvent::getTeamId,
                        GameDetail.TeamObjectiveEvent::getParticipantId,
                        GameDetail.TeamObjectiveEvent::getChampionId,
                        GameDetail.TeamObjectiveEvent::getTimestamp
                )
                .containsExactly(tuple("turretPlate", 200, 6, 206, 180000L));
    }

    @Test
    void mapGameDetails_countsTurretPlateDestroyedByOppositeTeamWhenKillerIsUnknown() {
        ObjectNode response = objectMapper.createObjectNode();
        ObjectNode game = gameNode(300022L, true);
        ArrayNode events = game.putArray("frames").addObject().putArray("events");
        events.addObject()
                .put("type", "TURRET_PLATE_DESTROYED")
                .put("timestamp", 180000L)
                .put("killerId", 0)
                .put("teamId", 100);
        events.addObject()
                .put("type", "TURRET_PLATE_DESTROYED")
                .put("timestamp", 210000L)
                .put("killerId", 0)
                .put("teamId", 200);
        response.set("game", game);

        GameDetail detail = mapper.mapGameDetails(response);

        GameDetail.TeamObjectiveSummary blueSummary = detail.getTeamObjectives().stream()
                .filter(summary -> Integer.valueOf(100).equals(summary.getTeamId()))
                .findFirst()
                .orElseThrow();
        GameDetail.TeamObjectiveSummary redSummary = detail.getTeamObjectives().stream()
                .filter(summary -> Integer.valueOf(200).equals(summary.getTeamId()))
                .findFirst()
                .orElseThrow();
        assertThat(blueSummary.getTurretPlateKills()).isEqualTo(1);
        assertThat(redSummary.getTurretPlateKills()).isEqualTo(1);
        assertThat(blueSummary.getObjectiveEvents()).isEmpty();
        assertThat(redSummary.getObjectiveEvents()).isEmpty();
    }

    @Test
    void mapGameDetails_mapsMonsterObjectiveEventsToKillerChampionDetails() {
        ObjectNode response = objectMapper.createObjectNode();
        ObjectNode game = gameNode(300016L, true);
        ArrayNode events = game.putArray("frames").addObject().putArray("events");
        events.addObject()
                .put("type", "ELITE_MONSTER_KILL")
                .put("timestamp", 1200000L)
                .put("killerId", 1)
                .put("monsterType", "BARON_NASHOR");
        events.addObject()
                .put("type", "ELITE_MONSTER_KILL")
                .put("timestamp", 360000L)
                .put("killerId", 2)
                .put("monsterType", "DRAGON")
                .put("monsterSubType", "HEXTECH_DRAGON");
        events.addObject()
                .put("type", "ELITE_MONSTER_KILL")
                .put("timestamp", 1320000L)
                .put("participantId", 3)
                .put("monsterType", "ELDER_DRAGON")
                .put("monsterSubType", "ELDER_DRAGON");
        events.addObject()
                .put("type", "ELITE_MONSTER_KILL")
                .put("timestamp", 480000L)
                .put("killerId", 6)
                .put("monsterType", "RIFTHERALD");
        events.addObject()
                .put("type", "ELITE_MONSTER_KILL")
                .put("timestamp", 600000L)
                .put("killerId", 7)
                .put("monsterType", "HORDE");
        response.set("game", game);

        GameDetail detail = mapper.mapGameDetails(response);

        GameDetail.TeamObjectiveSummary blueSummary = detail.getTeamObjectives().stream()
                .filter(summary -> Integer.valueOf(100).equals(summary.getTeamId()))
                .findFirst()
                .orElseThrow();
        assertThat(blueSummary.getObjectiveEvents())
                .extracting(
                        GameDetail.TeamObjectiveEvent::getKind,
                        GameDetail.TeamObjectiveEvent::getSubType,
                        GameDetail.TeamObjectiveEvent::getTeamId,
                        GameDetail.TeamObjectiveEvent::getParticipantId,
                        GameDetail.TeamObjectiveEvent::getChampionId,
                        GameDetail.TeamObjectiveEvent::getTimestamp
                )
                .containsExactly(
                        tuple("baron", null, 100, 1, 103, 1200000L),
                        tuple("dragon", "hextech", 100, 2, 202, 360000L),
                        tuple("elderDragon", null, 100, 3, 203, 1320000L)
                );

        GameDetail.TeamObjectiveSummary redSummary = detail.getTeamObjectives().stream()
                .filter(summary -> Integer.valueOf(200).equals(summary.getTeamId()))
                .findFirst()
                .orElseThrow();
        assertThat(redSummary.getObjectiveEvents())
                .extracting(
                        GameDetail.TeamObjectiveEvent::getKind,
                        GameDetail.TeamObjectiveEvent::getTeamId,
                        GameDetail.TeamObjectiveEvent::getParticipantId,
                        GameDetail.TeamObjectiveEvent::getChampionId
                )
                .containsExactly(
                        tuple("herald", 200, 6, 206),
                        tuple("voidGrub", 200, 7, 207)
                );
    }

    @Test
    void mapGameDetails_keepsMonsterObjectiveActorIdsWhenTimelineParticipantsNeedHydration() {
        ObjectNode response = objectMapper.createObjectNode();
        ObjectNode game = gameNode(300018L, false);
        ArrayNode participants = game.putArray("participants");
        for (int participantId = 1; participantId <= 10; participantId++) {
            participants.addObject()
                    .put("participantId", participantId)
                    .put("puuid", "timeline-puuid-" + participantId);
        }
        ArrayNode events = game.putArray("frames").addObject().putArray("events");
        events.addObject()
                .put("type", "ELITE_MONSTER_KILL")
                .put("timestamp", 360000L)
                .put("killerId", 7)
                .put("killerTeamId", 200)
                .put("monsterType", "DRAGON")
                .put("monsterSubType", "HEXTECH_DRAGON");
        events.addObject()
                .put("type", "ELITE_MONSTER_KILL")
                .put("timestamp", 420000L)
                .put("killerId", 99)
                .put("killerTeamId", 200)
                .put("monsterType", "DRAGON")
                .put("monsterSubType", "CHEMTECH_DRAGON");
        response.set("json", game);

        GameDetail detail = mapper.mapGameDetails(response);

        GameDetail.TeamObjectiveSummary redSummary = detail.getTeamObjectives().getFirst();
        assertThat(redSummary.getTeamId()).isEqualTo(200);
        assertThat(redSummary.getDragonKills()).isEqualTo(2);
        assertThat(redSummary.getDragonKillsByType()).containsEntry("hextech", 1);
        assertThat(redSummary.getDragonKillsByType()).containsEntry("chemtech", 1);
        assertThat(redSummary.getObjectiveEvents())
                .extracting(
                        GameDetail.TeamObjectiveEvent::getKind,
                        GameDetail.TeamObjectiveEvent::getSubType,
                        GameDetail.TeamObjectiveEvent::getTeamId,
                        GameDetail.TeamObjectiveEvent::getParticipantId,
                        GameDetail.TeamObjectiveEvent::getChampionId,
                        GameDetail.TeamObjectiveEvent::getTimestamp
                )
                .containsExactly(tuple("dragon", "hextech", 200, 7, null, 360000L));
    }

    @Test
    void mapGameDetails_doesNotCreateActorDetailsForUnmappedKillerOrInvalidTeam() {
        ObjectNode response = objectMapper.createObjectNode();
        ObjectNode game = gameNode(300017L, true);
        ArrayNode events = game.putArray("frames").addObject().putArray("events");
        events.addObject()
                .put("type", "ELITE_MONSTER_KILL")
                .put("timestamp", 1200000L)
                .put("killerTeamId", 100)
                .put("killerId", 99)
                .put("monsterType", "BARON_NASHOR");
        events.addObject()
                .put("type", "ELITE_MONSTER_KILL")
                .put("timestamp", 1320000L)
                .put("teamId", 0)
                .put("killerId", 99)
                .put("monsterType", "DRAGON")
                .put("monsterSubType", "HEXTECH_DRAGON");
        response.set("game", game);

        GameDetail detail = mapper.mapGameDetails(response);

        GameDetail.TeamObjectiveSummary summary = detail.getTeamObjectives().getFirst();
        assertThat(summary.getTeamId()).isEqualTo(100);
        assertThat(summary.getBaronKills()).isEqualTo(1);
        assertThat(summary.getDragonKills()).isNull();
        assertThat(summary.getObjectiveEvents()).isEmpty();
    }

    @Test
    void mapGameDetails_ignoresDragonSoulEventWhenTeamCannotBeResolved() {
        ObjectNode response = objectMapper.createObjectNode();
        ObjectNode game = gameNode(300014L, true);
        ArrayNode events = game.putArray("frames").addObject().putArray("events");
        events.addObject()
                .put("type", "DRAGON_SOUL_GIVEN")
                .put("teamId", 0)
                .put("monsterSubType", "CHEMTECH_DRAGON");
        response.set("json", game);

        GameDetail detail = mapper.mapGameDetails(response);

        assertThat(detail.getTeamObjectives()).isNull();
    }

    @Test
    void mapGameDetails_keepsTeamObjectiveTotalsWhenTimelineAlsoHasEvents() {
        ObjectNode response = objectMapper.createObjectNode();
        ObjectNode game = gameNode(300012L, true);
        ArrayNode teams = game.putArray("teams");
        ObjectNode blue = teams.addObject();
        blue.put("teamId", 100);
        blue.put("baronKills", 1);
        blue.put("dragonKills", 1);
        blue.put("riftHeraldKills", 1);
        blue.put("hordeKills", 3);
        blue.put("elderDragonKills", 0);

        ArrayNode events = game.putArray("frames").addObject().putArray("events");
        for (int i = 0; i < 2; i++) {
            events.addObject()
                    .put("type", "ELITE_MONSTER_KILL")
                    .put("killerTeamId", 100)
                    .put("monsterType", "DRAGON")
                    .put("monsterSubType", "FIRE_DRAGON");
            events.addObject()
                    .put("type", "ELITE_MONSTER_KILL")
                    .put("killerTeamId", 100)
                    .put("monsterType", "RIFTHERALD");
        }
        for (int i = 0; i < 4; i++) {
            events.addObject()
                    .put("type", "ELITE_MONSTER_KILL")
                    .put("killerTeamId", 100)
                    .put("monsterType", "HORDE");
        }
        response.set("game", game);

        GameDetail detail = mapper.mapGameDetails(response);

        GameDetail.TeamObjectiveSummary summary = detail.getTeamObjectives().getFirst();
        assertThat(summary.getBaronKills()).isEqualTo(1);
        assertThat(summary.getDragonKills()).isEqualTo(1);
        assertThat(summary.getHeraldKills()).isEqualTo(1);
        assertThat(summary.getVoidGrubKills()).isEqualTo(3);
        assertThat(summary.getDragonKillsByType()).containsEntry("infernal", 2);
        assertThat(summary.getDragonSoulType()).isNull();
    }

    @Test
    void gameDetailDeserializesLegacyLcuTeamsIntoOptionalSummariesWithoutSerializingRawTeams() throws Exception {
        ObjectNode game = gameNode(300009L, true);
        ArrayNode teams = game.putArray("teams");
        ObjectNode blue = teams.addObject();
        blue.put("teamId", 100);
        blue.put("baronKills", 2);
        blue.put("dragonKills", 1);
        blue.put("riftHeraldKills", 1);
        blue.put("hordeKills", 3);
        blue.put("towerKills", 5);
        blue.put("inhibitorKills", 1);
        blue.put("turretPlatesTaken", 4);
        blue.put("soulType", "MOUNTAIN_DRAGON");
        blue.putArray("bans").addObject().put("championId", 266);
        ObjectNode red = teams.addObject();
        red.put("teamId", 200);
        ObjectNode redObjectives = red.putObject("objectives");
        redObjectives.putObject("dragon").put("kills", 2);
        redObjectives.putObject("herald").put("kills", 1);
        redObjectives.putObject("voidGrubs").put("kills", 2);
        redObjectives.putObject("tower").put("kills", 6);
        redObjectives.putObject("inhibitor").put("kills", 2);
        redObjectives.putObject("turretPlates").put("kills", 7);

        GameDetail detail = objectMapper.readValue(objectMapper.writeValueAsString(game), GameDetail.class);

        assertThat(detail.getTeamObjectives()).hasSize(2);
        GameDetail.TeamObjectiveSummary blueSummary = detail.getTeamObjectives().getFirst();
        assertThat(blueSummary.getTeamId()).isEqualTo(100);
        assertThat(blueSummary.getBans()).containsExactly(266);
        assertThat(blueSummary.getBaronKills()).isEqualTo(2);
        assertThat(blueSummary.getDragonKills()).isEqualTo(1);
        assertThat(blueSummary.getHeraldKills()).isEqualTo(1);
        assertThat(blueSummary.getVoidGrubKills()).isEqualTo(3);
        assertThat(blueSummary.getTurretKills()).isEqualTo(5);
        assertThat(blueSummary.getInhibitorKills()).isEqualTo(1);
        assertThat(blueSummary.getTurretPlateKills()).isEqualTo(4);
        assertThat(blueSummary.getDragonSoulType()).isEqualTo("mountain");
        GameDetail.TeamObjectiveSummary redSummary = detail.getTeamObjectives().get(1);
        assertThat(redSummary.getTeamId()).isEqualTo(200);
        assertThat(redSummary.getDragonKills()).isEqualTo(2);
        assertThat(redSummary.getHeraldKills()).isEqualTo(1);
        assertThat(redSummary.getVoidGrubKills()).isEqualTo(2);
        assertThat(redSummary.getTurretKills()).isEqualTo(6);
        assertThat(redSummary.getInhibitorKills()).isEqualTo(2);
        assertThat(redSummary.getTurretPlateKills()).isEqualTo(7);
        assertThat(redSummary.getDragonSoulType()).isNull();
        assertThat(objectMapper.writeValueAsString(detail)).doesNotContain("\"teams\"");
    }

    @Test
    void gameDetailDeserializesOldTeamObjectiveCacheWithoutNewFields() throws Exception {
        String json = """
                {
                  "gameId": 300011,
                  "teamObjectives": [
                    {
                      "teamId": 100,
                      "bans": [266],
                      "baronKills": 1,
                      "dragonKills": 2,
                      "elderDragonKills": 0,
                      "dragonKillsByType": { "ocean": 1 }
                    }
                  ]
                }
                """;

        GameDetail detail = objectMapper.readValue(json, GameDetail.class);

        GameDetail.TeamObjectiveSummary summary = detail.getTeamObjectives().getFirst();
        assertThat(summary.getTeamId()).isEqualTo(100);
        assertThat(summary.getDragonKillsByType()).containsEntry("ocean", 1);
        assertThat(summary.getHeraldKills()).isNull();
        assertThat(summary.getVoidGrubKills()).isNull();
        assertThat(summary.getDragonSoulType()).isNull();
    }

    @Test
    void mapGameDetails_returnsEmptyDetailWhenJsonIsMissing() {
        GameDetail detail = mapper.mapGameDetails(null);

        assertThat(detail.getGameId()).isNull();
        assertThat(detail.getParticipants()).isEmpty();
        assertThat(detail.getParticipantIdentities()).isEmpty();
    }

    private ObjectNode gameNode(long gameId, boolean withParticipants) {
        ObjectNode game = objectMapper.createObjectNode();
        game.put("gameId", gameId);
        game.put("queueId", 450);
        game.put("gameMode", "ARAM");
        game.put("gameCreation", 1710001234000L);
        game.put("gameDuration", 1320);
        game.put("mapId", 12);
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
        participant.put("championId", participantId == 1 ? 103 : 200 + participantId);
        participant.put("spell1Id", participantId == 1 ? 4 : 7);
        participant.put("spell2Id", participantId == 1 ? 32 : 14);

        ObjectNode stats = participant.putObject("stats");
        stats.put("win", participantId <= 5);
        stats.put("kills", participantId == 1 ? 13 : participantId);
        stats.put("deaths", participantId == 1 ? 4 : 5);
        stats.put("assists", participantId == 1 ? 22 : 8);
        stats.put("item0", participantId == 1 ? 6655 : 2000 + participantId);
        stats.put("item1", 3020);
        stats.put("item2", 3089);
        stats.put("item3", 4645);
        stats.put("item4", 3135);
        stats.put("item5", 3157);
        stats.put("item6", participantId == 1 ? 3363 : 3340);
        stats.put("totalDamageDealtToChampions", participantId == 1 ? 32123 : 12000 + participantId);
        stats.put("totalDamageTaken", participantId == 1 ? 20321 : 11000 + participantId);
        stats.put("goldEarned", participantId == 1 ? 15321 : 9000 + participantId);
        stats.put("totalMinionsKilled", participantId == 1 ? 72 : participantId);
        stats.put("neutralMinionsKilled", participantId == 1 ? 0 : participantId);
        stats.put("visionScore", participantId == 1 ? 18 : participantId);
        stats.put("doubleKills", participantId == 1 ? 3 : 0);
        stats.put("tripleKills", participantId == 1 ? 2 : 0);
        stats.put("quadraKills", participantId == 1 ? 1 : 0);
        stats.put("pentaKills", 0);
        stats.put("largestKillingSpree", participantId == 1 ? 9 : 1);
        stats.put("legendaryCount", participantId == 1 ? 1 : 0);
        stats.put("perk0", participantId == 1 ? 8214 : 8005);
        stats.put("playerAugment1", participantId == 1 ? 20001 : 20002);

        ObjectNode player = participant.putObject("player");
        player.put("puuid", "detail-puuid-" + participantId);
        player.put("gameName", "DetailPlayer" + participantId);
        player.put("tagLine", "D" + participantId);
        player.put("summonerName", "DetailSummoner" + participantId);
        player.put("summonerId", 7000L + participantId);
        return participant;
    }
}
