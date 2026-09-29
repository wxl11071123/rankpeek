package io.rankpeek.sgp;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.rankpeek.model.GameDetail;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class SgpGameDetailMapper {

    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {
    };

    private final ObjectMapper objectMapper;

    public SgpGameDetailMapper() {
        this(new ObjectMapper());
    }

    SgpGameDetailMapper(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper == null ? new ObjectMapper() : objectMapper;
    }

    public GameDetail mapGameSummary(JsonNode response) {
        return map(response);
    }

    public GameDetail mapGameDetails(JsonNode response) {
        return map(response);
    }

    private GameDetail map(JsonNode response) {
        JsonNode game = SgpJsonMapperSupport.extractGame(response);
        GameDetail detail = new GameDetail();
        if (game == null) {
            detail.setParticipants(List.of());
            detail.setParticipantIdentities(List.of());
            return detail;
        }

        detail.setGameId(SgpJsonMapperSupport.readLong(game, "gameId", "id"));
        detail.setQueueId(SgpJsonMapperSupport.readInt(game, "queueId", "queue"));
        detail.setGameMode(SgpJsonMapperSupport.readText(game, "gameMode", "mode"));
        detail.setGameType(SgpJsonMapperSupport.readText(game, "gameType", "type"));
        detail.setGameCreation(SgpJsonMapperSupport.readLong(game, "gameCreation", "gameCreationDate", "createdAt"));
        detail.setGameDuration(SgpJsonMapperSupport.readLong(game, "gameDuration", "duration"));
        detail.setMapId(SgpJsonMapperSupport.readInt(game, "mapId", "map"));

        JsonNode participantsNode = SgpJsonMapperSupport.participants(game);
        if (participantsNode == null || participantsNode.isEmpty()) {
            detail.setParticipants(List.of());
            detail.setParticipantIdentities(List.of());
            detail.setTeamObjectives(mapTeamObjectives(game, List.of()));
            return detail;
        }

        List<GameDetail.GameParticipant> participants = mapParticipants(participantsNode);
        detail.setParticipants(participants);
        detail.setParticipantIdentities(mapParticipantIdentities(game, participantsNode));
        detail.setTeamObjectives(mapTeamObjectives(game, participants));
        return detail;
    }

    private List<GameDetail.TeamObjectiveSummary> mapTeamObjectives(
            JsonNode game,
            List<GameDetail.GameParticipant> participants
    ) {
        Map<Integer, GameDetail.TeamObjectiveSummary> summaries = new LinkedHashMap<>();
        Map<Integer, Set<String>> explicitCountFieldsByTeamId = new LinkedHashMap<>();
        mapTeamNodes(game, summaries, explicitCountFieldsByTeamId);

        Map<Integer, GameDetail.TeamObjectiveSummary> eventSummaries = new LinkedHashMap<>();
        mapObjectiveEvents(game, participants, eventSummaries);
        mergeObjectiveSummaries(summaries, eventSummaries, explicitCountFieldsByTeamId);

        List<GameDetail.TeamObjectiveSummary> result = new ArrayList<>();
        summaries.values().forEach(summary -> {
            if (summary != null && summary.hasData()) {
                result.add(summary);
            }
        });
        return result.isEmpty() ? null : result;
    }

    private void mapTeamNodes(
            JsonNode game,
            Map<Integer, GameDetail.TeamObjectiveSummary> summaries,
            Map<Integer, Set<String>> explicitCountFieldsByTeamId
    ) {
        JsonNode teamsNode = SgpJsonMapperSupport.firstArray(SgpJsonMapperSupport.value(game, "teams"));
        if (teamsNode == null) {
            return;
        }

        for (JsonNode teamNode : teamsNode) {
            if (!SgpJsonMapperSupport.isObject(teamNode)) {
                continue;
            }
            Integer teamId = SgpJsonMapperSupport.readInt(teamNode, "teamId", "team");
            if (teamId == null) {
                continue;
            }

            GameDetail.TeamObjectiveSummary summary = summaryFor(summaries, teamId);
            List<Integer> bans = normalizeBanIds(SgpJsonMapperSupport.value(teamNode, "bans"));
            if (!bans.isEmpty()) {
                summary.setBans(bans);
            }
            Integer turretKills = SgpJsonMapperSupport.readInt(
                    teamNode,
                    "turretKills",
                    "towerKills",
                    "turretsKilled",
                    "towersKilled"
            );
            markExplicitCount(explicitCountFieldsByTeamId, teamId, "turret", turretKills);
            setMaxCount(summary::setTurretKills, summary.getTurretKills(), turretKills);
            Integer turretObjectiveKills = readObjectiveKills(teamNode, "turret", "turrets", "tower", "towers");
            markExplicitCount(explicitCountFieldsByTeamId, teamId, "turret", turretObjectiveKills);
            setMaxCount(summary::setTurretKills, summary.getTurretKills(), turretObjectiveKills);

            Integer inhibitorKills = SgpJsonMapperSupport.readInt(
                    teamNode,
                    "inhibitorKills",
                    "inhibitorsKilled"
            );
            markExplicitCount(explicitCountFieldsByTeamId, teamId, "inhibitor", inhibitorKills);
            setMaxCount(summary::setInhibitorKills, summary.getInhibitorKills(), inhibitorKills);
            Integer inhibitorObjectiveKills = readObjectiveKills(teamNode, "inhibitor", "inhibitors");
            markExplicitCount(explicitCountFieldsByTeamId, teamId, "inhibitor", inhibitorObjectiveKills);
            setMaxCount(summary::setInhibitorKills, summary.getInhibitorKills(), inhibitorObjectiveKills);

            Integer turretPlateKills = SgpJsonMapperSupport.readInt(
                    teamNode,
                    "turretPlateKills",
                    "turretPlatesTaken",
                    "platesTaken",
                    "plateKills"
            );
            markExplicitCount(explicitCountFieldsByTeamId, teamId, "turretPlate", turretPlateKills);
            setMaxCount(summary::setTurretPlateKills, summary.getTurretPlateKills(), turretPlateKills);
            Integer turretPlateObjectiveKills = readObjectiveKills(teamNode, "turretPlate", "turretPlates", "plate", "plates");
            markExplicitCount(explicitCountFieldsByTeamId, teamId, "turretPlate", turretPlateObjectiveKills);
            setMaxCount(summary::setTurretPlateKills, summary.getTurretPlateKills(), turretPlateObjectiveKills);

            Integer baronKills = SgpJsonMapperSupport.readInt(teamNode, "baronKills");
            markExplicitCount(explicitCountFieldsByTeamId, teamId, "baron", baronKills);
            setMaxCount(summary::setBaronKills, summary.getBaronKills(), baronKills);
            Integer baronObjectiveKills = readObjectiveKills(teamNode, "baron");
            markExplicitCount(explicitCountFieldsByTeamId, teamId, "baron", baronObjectiveKills);
            setMaxCount(summary::setBaronKills, summary.getBaronKills(), baronObjectiveKills);

            Integer dragonKills = SgpJsonMapperSupport.readInt(teamNode, "dragonKills");
            markExplicitCount(explicitCountFieldsByTeamId, teamId, "dragon", dragonKills);
            setMaxCount(summary::setDragonKills, summary.getDragonKills(), dragonKills);
            Integer dragonObjectiveKills = readObjectiveKills(teamNode, "dragon");
            markExplicitCount(explicitCountFieldsByTeamId, teamId, "dragon", dragonObjectiveKills);
            setMaxCount(summary::setDragonKills, summary.getDragonKills(), dragonObjectiveKills);

            Integer heraldKills = SgpJsonMapperSupport.readInt(teamNode, "heraldKills", "riftHeraldKills");
            markExplicitCount(explicitCountFieldsByTeamId, teamId, "herald", heraldKills);
            setMaxCount(summary::setHeraldKills, summary.getHeraldKills(), heraldKills);
            Integer heraldObjectiveKills = readObjectiveKills(teamNode, "riftHerald", "herald");
            markExplicitCount(explicitCountFieldsByTeamId, teamId, "herald", heraldObjectiveKills);
            setMaxCount(summary::setHeraldKills, summary.getHeraldKills(), heraldObjectiveKills);

            Integer voidGrubKills = SgpJsonMapperSupport.readInt(
                    teamNode,
                    "voidGrubKills",
                    "voidgrubKills",
                    "voidgrubsKills",
                    "voidGrubsKilled",
                    "hordeKills"
            );
            markExplicitCount(explicitCountFieldsByTeamId, teamId, "voidGrub", voidGrubKills);
            setMaxCount(
                    summary::setVoidGrubKills,
                    summary.getVoidGrubKills(),
                    voidGrubKills
            );
            Integer voidGrubObjectiveKills = readObjectiveKills(teamNode, "horde", "voidGrubs", "voidGrub", "voidgrub");
            markExplicitCount(explicitCountFieldsByTeamId, teamId, "voidGrub", voidGrubObjectiveKills);
            setMaxCount(summary::setVoidGrubKills, summary.getVoidGrubKills(), voidGrubObjectiveKills);

            Integer elderDragonKills = SgpJsonMapperSupport.readInt(teamNode, "elderDragonKills");
            markExplicitCount(explicitCountFieldsByTeamId, teamId, "elder", elderDragonKills);
            setMaxCount(summary::setElderDragonKills, summary.getElderDragonKills(), elderDragonKills);
            Integer elderObjectiveKills = readObjectiveKills(teamNode, "elderDragon", "elder");
            markExplicitCount(explicitCountFieldsByTeamId, teamId, "elder", elderObjectiveKills);
            setMaxCount(summary::setElderDragonKills, summary.getElderDragonKills(), elderObjectiveKills);
            String dragonSoulType = readExplicitDragonSoulType(teamNode);
            if (dragonSoulType != null) {
                summary.setDragonSoulType(dragonSoulType);
            }
        }
    }

    private void mapObjectiveEvents(
            JsonNode game,
            List<GameDetail.GameParticipant> participants,
            Map<Integer, GameDetail.TeamObjectiveSummary> summaries
    ) {
        JsonNode framesNode = SgpJsonMapperSupport.firstArray(
                SgpJsonMapperSupport.value(game, "frames"),
                SgpJsonMapperSupport.path(game, "timeline", "frames")
        );
        if (framesNode == null) {
            return;
        }

        Map<Integer, Integer> teamIdByParticipantId = teamIdByParticipantId(participants);
        Map<Integer, GameDetail.GameParticipant> participantById = participantById(participants);
        for (JsonNode frameNode : framesNode) {
            JsonNode eventsNode = SgpJsonMapperSupport.firstArray(SgpJsonMapperSupport.value(frameNode, "events"));
            if (eventsNode == null) {
                continue;
            }
            for (JsonNode eventNode : eventsNode) {
                mapObjectiveEvent(eventNode, teamIdByParticipantId, participantById, summaries);
            }
        }
    }

    private void mapObjectiveEvent(
            JsonNode eventNode,
            Map<Integer, Integer> teamIdByParticipantId,
            Map<Integer, GameDetail.GameParticipant> participantById,
            Map<Integer, GameDetail.TeamObjectiveSummary> summaries
    ) {
        if (!SgpJsonMapperSupport.isObject(eventNode)) {
            return;
        }
        String type = SgpJsonMapperSupport.readText(eventNode, "type", "eventType");

        String explicitSoulType = readExplicitDragonSoulType(eventNode);
        if (explicitSoulType == null && isDragonSoulEvent(type)) {
            explicitSoulType = normalizeDragonType(SgpJsonMapperSupport.readText(
                    eventNode,
                    "monsterSubType",
                    "monsterSubtype",
                    "dragonType"
            ));
        }
        if (explicitSoulType != null) {
            Integer teamId = resolveEventTeamId(eventNode, teamIdByParticipantId);
            if (teamId != null) {
                summaryFor(summaries, teamId).setDragonSoulType(explicitSoulType);
            }
        }

        if ("BUILDING_KILL".equalsIgnoreCase(type)) {
            mapBuildingKillEvent(eventNode, participantById, summaries);
            return;
        }
        if ("TURRET_PLATE_DESTROYED".equalsIgnoreCase(type)) {
            mapTurretPlateEvent(eventNode, participantById, summaries);
            return;
        }

        if (!"ELITE_MONSTER_KILL".equalsIgnoreCase(type)) {
            return;
        }
        Integer teamId = resolveEventTeamId(eventNode, teamIdByParticipantId);
        if (teamId == null) {
            return;
        }

        String monsterType = SgpJsonMapperSupport.readText(eventNode, "monsterType");
        if (monsterType == null) {
            return;
        }
        String monsterSubType = SgpJsonMapperSupport.readText(
                eventNode,
                "monsterSubType",
                "monsterSubtype",
                "dragonType"
        );
        String normalizedMonsterType = normalizeMonsterToken(monsterType);
        String normalizedMonsterSubType = normalizeMonsterToken(monsterSubType);
        GameDetail.TeamObjectiveSummary summary = summaryFor(summaries, teamId);
        Integer actorParticipantId = resolveActorParticipantId(eventNode);
        Long timestamp = SgpJsonMapperSupport.readLong(eventNode, "timestamp");

        if (normalizedMonsterType.contains("BARON") || normalizedMonsterType.contains("NASHOR")) {
            summary.setBaronKills(increment(summary.getBaronKills()));
            addObjectiveEvent(summary, "baron", null, teamId, actorParticipantId, participantById, timestamp);
            return;
        }
        if (normalizedMonsterType.contains("HERALD")) {
            summary.setHeraldKills(increment(summary.getHeraldKills()));
            addObjectiveEvent(summary, "herald", null, teamId, actorParticipantId, participantById, timestamp);
            return;
        }
        if (normalizedMonsterType.contains("HORDE") || normalizedMonsterType.contains("VOID_GRUB") || normalizedMonsterType.contains("VOIDGRUB")) {
            summary.setVoidGrubKills(increment(summary.getVoidGrubKills()));
            addObjectiveEvent(summary, "voidGrub", null, teamId, actorParticipantId, participantById, timestamp);
            return;
        }
        if (normalizedMonsterType.contains("ELDER") || normalizedMonsterSubType.contains("ELDER")) {
            summary.setElderDragonKills(increment(summary.getElderDragonKills()));
            addObjectiveEvent(summary, "elderDragon", null, teamId, actorParticipantId, participantById, timestamp);
            return;
        }
        if (!normalizedMonsterType.contains("DRAGON")) {
            return;
        }

        summary.setDragonKills(increment(summary.getDragonKills()));
        String dragonType = normalizeDragonType(monsterSubType);
        if (dragonType != null) {
            summary.getDragonKillsByType().merge(dragonType, 1, Integer::sum);
        }
        addObjectiveEvent(summary, "dragon", dragonType, teamId, actorParticipantId, participantById, timestamp);
    }

    private void mapBuildingKillEvent(
            JsonNode eventNode,
            Map<Integer, GameDetail.GameParticipant> participantById,
            Map<Integer, GameDetail.TeamObjectiveSummary> summaries
    ) {
        GameDetail.GameParticipant actor = resolveActor(eventNode, participantById);
        if (actor == null || !isValidTeamId(actor.getTeamId())) {
            return;
        }
        String buildingType = normalizeMonsterToken(SgpJsonMapperSupport.readText(eventNode, "buildingType"));
        GameDetail.TeamObjectiveSummary summary = summaryFor(summaries, actor.getTeamId());
        Long timestamp = SgpJsonMapperSupport.readLong(eventNode, "timestamp");
        if (buildingType.contains("TOWER") || buildingType.contains("TURRET")) {
            summary.setTurretKills(increment(summary.getTurretKills()));
            addObjectiveEvent(summary, "turret", null, actor.getTeamId(), actor.getParticipantId(), participantById, timestamp);
            return;
        }
        if (buildingType.contains("INHIBITOR")) {
            summary.setInhibitorKills(increment(summary.getInhibitorKills()));
            addObjectiveEvent(summary, "inhibitor", null, actor.getTeamId(), actor.getParticipantId(), participantById, timestamp);
        }
    }

    private void mapTurretPlateEvent(
            JsonNode eventNode,
            Map<Integer, GameDetail.GameParticipant> participantById,
            Map<Integer, GameDetail.TeamObjectiveSummary> summaries
    ) {
        GameDetail.GameParticipant actor = resolveActor(eventNode, participantById);
        if (actor != null && isValidTeamId(actor.getTeamId())) {
            GameDetail.TeamObjectiveSummary summary = summaryFor(summaries, actor.getTeamId());
            summary.setTurretPlateKills(increment(summary.getTurretPlateKills()));
            addObjectiveEvent(
                    summary,
                    "turretPlate",
                    null,
                    actor.getTeamId(),
                    actor.getParticipantId(),
                    participantById,
                    SgpJsonMapperSupport.readLong(eventNode, "timestamp")
            );
            return;
        }

        Integer destroyedTeamId = SgpJsonMapperSupport.readInt(eventNode, "teamId");
        Integer takerTeamId = opposingSummonersRiftTeamId(destroyedTeamId);
        if (takerTeamId == null) {
            return;
        }
        GameDetail.TeamObjectiveSummary summary = summaryFor(summaries, takerTeamId);
        summary.setTurretPlateKills(increment(summary.getTurretPlateKills()));
    }

    private void mergeObjectiveSummaries(
            Map<Integer, GameDetail.TeamObjectiveSummary> target,
            Map<Integer, GameDetail.TeamObjectiveSummary> source,
            Map<Integer, Set<String>> explicitCountFieldsByTeamId
    ) {
        source.forEach((teamId, sourceSummary) -> {
            GameDetail.TeamObjectiveSummary targetSummary = summaryFor(target, teamId);
            setMaxCountIfMissing(
                    targetSummary::setTurretKills,
                    targetSummary.getTurretKills(),
                    sourceSummary.getTurretKills(),
                    hasExplicitCount(explicitCountFieldsByTeamId, teamId, "turret")
            );
            setMaxCountIfMissing(
                    targetSummary::setTurretPlateKills,
                    targetSummary.getTurretPlateKills(),
                    sourceSummary.getTurretPlateKills(),
                    hasExplicitCount(explicitCountFieldsByTeamId, teamId, "turretPlate")
            );
            setMaxCountIfMissing(
                    targetSummary::setInhibitorKills,
                    targetSummary.getInhibitorKills(),
                    sourceSummary.getInhibitorKills(),
                    hasExplicitCount(explicitCountFieldsByTeamId, teamId, "inhibitor")
            );
            setMaxCountIfMissing(
                    targetSummary::setBaronKills,
                    targetSummary.getBaronKills(),
                    sourceSummary.getBaronKills(),
                    hasExplicitCount(explicitCountFieldsByTeamId, teamId, "baron")
            );
            setMaxCountIfMissing(
                    targetSummary::setDragonKills,
                    targetSummary.getDragonKills(),
                    sourceSummary.getDragonKills(),
                    hasExplicitCount(explicitCountFieldsByTeamId, teamId, "dragon")
            );
            setMaxCountIfMissing(
                    targetSummary::setHeraldKills,
                    targetSummary.getHeraldKills(),
                    sourceSummary.getHeraldKills(),
                    hasExplicitCount(explicitCountFieldsByTeamId, teamId, "herald")
            );
            setMaxCountIfMissing(
                    targetSummary::setVoidGrubKills,
                    targetSummary.getVoidGrubKills(),
                    sourceSummary.getVoidGrubKills(),
                    hasExplicitCount(explicitCountFieldsByTeamId, teamId, "voidGrub")
            );
            setMaxCountIfMissing(
                    targetSummary::setElderDragonKills,
                    targetSummary.getElderDragonKills(),
                    sourceSummary.getElderDragonKills(),
                    hasExplicitCount(explicitCountFieldsByTeamId, teamId, "elder")
            );
            if ((targetSummary.getDragonSoulType() == null || targetSummary.getDragonSoulType().isBlank())
                    && sourceSummary.getDragonSoulType() != null
                    && !sourceSummary.getDragonSoulType().isBlank()) {
                targetSummary.setDragonSoulType(sourceSummary.getDragonSoulType());
            }
            sourceSummary.getDragonKillsByType().forEach((dragonType, count) -> {
                if (count != null && count > 0) {
                    targetSummary.getDragonKillsByType().merge(dragonType, count, Math::max);
                }
            });
            if (sourceSummary.getObjectiveEvents() != null && !sourceSummary.getObjectiveEvents().isEmpty()) {
                targetSummary.getObjectiveEvents().addAll(sourceSummary.getObjectiveEvents());
            }
        });
    }

    private void markExplicitCount(
            Map<Integer, Set<String>> explicitCountFieldsByTeamId,
            Integer teamId,
            String fieldName,
            Integer value
    ) {
        if (teamId == null || fieldName == null || value == null) {
            return;
        }
        explicitCountFieldsByTeamId.computeIfAbsent(teamId, ignored -> new HashSet<>()).add(fieldName);
    }

    private boolean hasExplicitCount(
            Map<Integer, Set<String>> explicitCountFieldsByTeamId,
            Integer teamId,
            String fieldName
    ) {
        Set<String> fields = explicitCountFieldsByTeamId.get(teamId);
        return fields != null && fields.contains(fieldName);
    }

    private GameDetail.TeamObjectiveSummary summaryFor(
            Map<Integer, GameDetail.TeamObjectiveSummary> summaries,
            Integer teamId
    ) {
        return summaries.computeIfAbsent(teamId, key -> {
            GameDetail.TeamObjectiveSummary summary = new GameDetail.TeamObjectiveSummary();
            summary.setTeamId(key);
            return summary;
        });
    }

    private List<Integer> normalizeBanIds(JsonNode bansNode) {
        if (bansNode == null || !bansNode.isArray()) {
            return List.of();
        }

        List<Integer> bans = new ArrayList<>();
        for (JsonNode banNode : bansNode) {
            Integer championId = banNode != null && banNode.isIntegralNumber()
                    ? banNode.asInt()
                    : SgpJsonMapperSupport.readInt(banNode, "championId", "champion");
            if (championId == null || championId <= 0) {
                continue;
            }
            bans.add(championId);
            if (bans.size() >= 5) {
                break;
            }
        }
        return bans;
    }

    private Integer readObjectiveKills(JsonNode teamNode, String... objectiveNames) {
        JsonNode objectivesNode = SgpJsonMapperSupport.firstObject(SgpJsonMapperSupport.value(teamNode, "objectives"));
        if (objectivesNode == null || objectiveNames == null) {
            return null;
        }
        for (String objectiveName : objectiveNames) {
            JsonNode objectiveNode = SgpJsonMapperSupport.firstObject(SgpJsonMapperSupport.value(objectivesNode, objectiveName));
            Integer kills = SgpJsonMapperSupport.readInt(objectiveNode, "kills");
            if (kills != null) {
                return kills;
            }
        }
        return null;
    }

    private String readExplicitDragonSoulType(JsonNode node) {
        String rawType = firstNonNull(
                SgpJsonMapperSupport.readText(node, "dragonSoulType", "soulType", "dragonSoul"),
                SgpJsonMapperSupport.readText(SgpJsonMapperSupport.path(node, "objectives", "dragon"), "dragonSoulType", "soulType", "dragonSoul")
        );
        return normalizeDragonType(rawType);
    }

    private Integer resolveEventTeamId(JsonNode eventNode, Map<Integer, Integer> teamIdByParticipantId) {
        Integer directTeamId = SgpJsonMapperSupport.readInt(eventNode, "killerTeamId", "teamId", "killerTeam");
        if (isValidTeamId(directTeamId)) {
            return directTeamId;
        }
        Integer participantId = SgpJsonMapperSupport.readInt(
                eventNode,
                "killerId",
                "killerParticipantId",
                "participantId"
        );
        Integer mappedTeamId = participantId == null ? null : teamIdByParticipantId.get(participantId);
        return isValidTeamId(mappedTeamId) ? mappedTeamId : null;
    }

    private boolean isValidTeamId(Integer teamId) {
        return teamId != null && teamId > 0;
    }

    private Integer opposingSummonersRiftTeamId(Integer teamId) {
        if (Integer.valueOf(100).equals(teamId)) {
            return 200;
        }
        if (Integer.valueOf(200).equals(teamId)) {
            return 100;
        }
        return null;
    }

    private boolean isDragonSoulEvent(String type) {
        String normalized = normalizeMonsterToken(type);
        return normalized.contains("DRAGON_SOUL") || normalized.contains("SOUL_GIVEN");
    }

    private Map<Integer, Integer> teamIdByParticipantId(List<GameDetail.GameParticipant> participants) {
        Map<Integer, Integer> teamIdByParticipantId = new LinkedHashMap<>();
        if (participants == null) {
            return teamIdByParticipantId;
        }
        for (GameDetail.GameParticipant participant : participants) {
            if (participant == null || participant.getParticipantId() == null || participant.getTeamId() == null) {
                continue;
            }
            teamIdByParticipantId.put(participant.getParticipantId(), participant.getTeamId());
        }
        return teamIdByParticipantId;
    }

    private Map<Integer, GameDetail.GameParticipant> participantById(List<GameDetail.GameParticipant> participants) {
        Map<Integer, GameDetail.GameParticipant> participantById = new LinkedHashMap<>();
        if (participants == null) {
            return participantById;
        }
        for (GameDetail.GameParticipant participant : participants) {
            if (participant == null || participant.getParticipantId() == null) {
                continue;
            }
            participantById.put(participant.getParticipantId(), participant);
        }
        return participantById;
    }

    private Integer resolveActorParticipantId(JsonNode eventNode) {
        return SgpJsonMapperSupport.readInt(
                eventNode,
                "killerId",
                "killerParticipantId",
                "participantId"
        );
    }

    private GameDetail.GameParticipant resolveActor(
            JsonNode eventNode,
            Map<Integer, GameDetail.GameParticipant> participantById
    ) {
        Integer participantId = resolveActorParticipantId(eventNode);
        return participantId == null ? null : participantById.get(participantId);
    }

    private void addObjectiveEvent(
            GameDetail.TeamObjectiveSummary summary,
            String kind,
            String subType,
            Integer teamId,
            Integer participantId,
            Map<Integer, GameDetail.GameParticipant> participantById,
            Long timestamp
    ) {
        if (summary == null || kind == null || !isValidTeamId(teamId) || participantId == null) {
            return;
        }
        GameDetail.GameParticipant actor = participantById.get(participantId);
        if (actor == null || (actor.getTeamId() != null && !teamId.equals(actor.getTeamId()))) {
            return;
        }

        GameDetail.TeamObjectiveEvent event = new GameDetail.TeamObjectiveEvent();
        event.setKind(kind);
        event.setSubType(subType);
        event.setTeamId(teamId);
        event.setParticipantId(participantId);
        if (actor.getChampionId() != null && actor.getChampionId() > 0) {
            event.setChampionId(actor.getChampionId());
        }
        event.setTimestamp(timestamp);
        summary.getObjectiveEvents().add(event);
    }

    private String normalizeDragonType(String rawType) {
        if (rawType == null) {
            return null;
        }
        String normalized = rawType.toLowerCase(Locale.ROOT);
        if (normalized.contains("fire") || normalized.contains("infernal")) {
            return "infernal";
        }
        if (normalized.contains("earth") || normalized.contains("mountain")) {
            return "mountain";
        }
        if (normalized.contains("water") || normalized.contains("ocean")) {
            return "ocean";
        }
        if (normalized.contains("air") || normalized.contains("cloud")) {
            return "cloud";
        }
        if (normalized.contains("hextech")) {
            return "hextech";
        }
        if (normalized.contains("chemtech")) {
            return "chemtech";
        }
        return null;
    }

    private String normalizeMonsterToken(String value) {
        return value == null ? "" : value.toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
    }

    private Integer increment(Integer value) {
        return nonNegative(value) + 1;
    }

    private void setMaxCount(java.util.function.Consumer<Integer> setter, Integer currentValue, Integer nextValue) {
        if (nextValue == null) {
            return;
        }
        setter.accept(Math.max(nonNegative(currentValue), nonNegative(nextValue)));
    }

    private void setMaxCountIfMissing(
            java.util.function.Consumer<Integer> setter,
            Integer currentValue,
            Integer nextValue,
            boolean hasExplicitCount
    ) {
        if (hasExplicitCount) {
            return;
        }
        setMaxCount(setter, currentValue, nextValue);
    }

    private Integer nonNegative(Integer value) {
        return value == null || value < 0 ? 0 : value;
    }

    private List<GameDetail.GameParticipant> mapParticipants(JsonNode participantsNode) {
        List<GameDetail.GameParticipant> participants = new ArrayList<>();
        for (JsonNode participantNode : participantsNode) {
            if (!SgpJsonMapperSupport.isObject(participantNode)) {
                continue;
            }
            GameDetail.GameParticipant participant = new GameDetail.GameParticipant();
            participant.setParticipantId(SgpJsonMapperSupport.readInt(participantNode, "participantId", "participant_id", "id"));
            participant.setTeamId(SgpJsonMapperSupport.readInt(participantNode, "teamId", "team"));
            participant.setChampionId(SgpJsonMapperSupport.readInt(participantNode, "championId", "champion"));
            participant.setSpell1Id(SgpJsonMapperSupport.readInt(participantNode, "spell1Id", "summonerSpell1Id"));
            participant.setSpell2Id(SgpJsonMapperSupport.readInt(participantNode, "spell2Id", "summonerSpell2Id"));
            participant.setTeamPosition(SgpJsonMapperSupport.readText(participantNode, "teamPosition"));
            participant.setIndividualPosition(SgpJsonMapperSupport.readText(participantNode, "individualPosition"));
            participant.setSelectedPosition(SgpJsonMapperSupport.readText(participantNode, "selectedPosition"));
            participant.setTimeline(mapTimeline(participantNode));
            participant.setStats(mapStats(participantNode));
            participants.add(participant);
        }
        return participants;
    }

    private GameDetail.Timeline mapTimeline(JsonNode participantNode) {
        GameDetail.Timeline timeline = new GameDetail.Timeline();
        String lane = SgpJsonMapperSupport.readText(participantNode, "lane");
        String role = SgpJsonMapperSupport.readText(participantNode, "role");
        String teamPosition = SgpJsonMapperSupport.readText(participantNode, "teamPosition");
        timeline.setLane(firstNonNull(teamPosition, lane));
        timeline.setRole(role);
        timeline.setTeamPosition(teamPosition);
        timeline.setPositionCn(SgpJsonMapperSupport.readText(participantNode, "positionCn"));
        timeline.setRawLane(lane);
        timeline.setRawRole(role);
        if (timeline.getLane() == null && timeline.getRole() == null && timeline.getTeamPosition() == null
                && timeline.getPositionCn() == null && timeline.getRawLane() == null && timeline.getRawRole() == null) {
            return null;
        }
        return timeline;
    }

    private GameDetail.Stats mapStats(JsonNode participantNode) {
        JsonNode statsNode = SgpJsonMapperSupport.statsNode(participantNode);
        GameDetail.Stats stats = new GameDetail.Stats();
        stats.setWin(readBoolean(statsNode, participantNode, "win", "winner"));
        stats.setKills(readInt(statsNode, participantNode, "kills"));
        stats.setDeaths(readInt(statsNode, participantNode, "deaths"));
        stats.setAssists(readInt(statsNode, participantNode, "assists"));
        stats.setGoldEarned(readLong(statsNode, participantNode, "goldEarned"));
        stats.setTotalMinionsKilled(readInt(statsNode, participantNode, "totalMinionsKilled", "minionsKilled"));
        stats.setNeutralMinionsKilled(readInt(statsNode, participantNode, "neutralMinionsKilled"));
        stats.setTotalDamageDealtToChampions(readLong(statsNode, participantNode, "totalDamageDealtToChampions"));
        stats.setTotalDamageTaken(readLong(statsNode, participantNode, "totalDamageTaken"));
        stats.setVisionScore(readInt(statsNode, participantNode, "visionScore"));
        stats.setEarlyGoldDiff(readInt(statsNode, participantNode, "earlyGoldDiff"));
        stats.setTotalHeal(readLong(statsNode, participantNode, "totalHeal"));
        stats.setDoubleKills(readInt(statsNode, participantNode, "doubleKills"));
        stats.setTripleKills(readInt(statsNode, participantNode, "tripleKills"));
        stats.setQuadraKills(readInt(statsNode, participantNode, "quadraKills"));
        stats.setPentaKills(readInt(statsNode, participantNode, "pentaKills"));
        stats.setLargestKillingSpree(readInt(statsNode, participantNode, "largestKillingSpree"));
        stats.setLegendaryCount(readInt(statsNode, participantNode, "legendaryCount"));
        stats.setLegendaryCount(firstNonNull(
                stats.getLegendaryCount(),
                readChallengeInt(statsNode, participantNode, "legendaryCount")
        ));
        mapPerks(participantNode, statsNode, stats);
        stats.setPlayerAugment1(readInt(statsNode, participantNode, "playerAugment1"));
        stats.setPlayerAugment2(readInt(statsNode, participantNode, "playerAugment2"));
        stats.setPlayerAugment3(readInt(statsNode, participantNode, "playerAugment3"));
        stats.setPlayerAugment4(readInt(statsNode, participantNode, "playerAugment4"));
        stats.setItem0(readInt(statsNode, participantNode, "item0"));
        stats.setItem1(readInt(statsNode, participantNode, "item1"));
        stats.setItem2(readInt(statsNode, participantNode, "item2"));
        stats.setItem3(readInt(statsNode, participantNode, "item3"));
        stats.setItem4(readInt(statsNode, participantNode, "item4"));
        stats.setItem5(readInt(statsNode, participantNode, "item5"));
        stats.setItem6(readInt(statsNode, participantNode, "item6"));
        stats.setChallenges(toMap(firstObject(
                SgpJsonMapperSupport.value(statsNode, "challenges"),
                SgpJsonMapperSupport.value(participantNode, "challenges")
        )));
        stats.setExtraFields(extraFields(participantNode));
        return stats;
    }

    private void mapPerks(JsonNode participantNode, JsonNode statsNode, GameDetail.Stats stats) {
        JsonNode perksNode = firstObject(
                SgpJsonMapperSupport.value(statsNode, "perks"),
                SgpJsonMapperSupport.value(participantNode, "perks")
        );
        stats.setPerks(toMap(perksNode));
        stats.setPerk0(firstNonNull(readInt(statsNode, participantNode, "perk0"), readPerk(perksNode, 0)));
        stats.setPerk1(firstNonNull(readInt(statsNode, participantNode, "perk1"), readPerk(perksNode, 1)));
        stats.setPerk2(firstNonNull(readInt(statsNode, participantNode, "perk2"), readPerk(perksNode, 2)));
        stats.setPerk3(firstNonNull(readInt(statsNode, participantNode, "perk3"), readPerk(perksNode, 3)));
        stats.setPerk4(firstNonNull(readInt(statsNode, participantNode, "perk4"), readPerk(perksNode, 4)));
        stats.setPerk5(firstNonNull(readInt(statsNode, participantNode, "perk5"), readPerk(perksNode, 5)));
        stats.setPerkPrimaryStyle(firstNonNull(
                readInt(statsNode, participantNode, "perkPrimaryStyle"),
                readPerkStyle(perksNode, 0)
        ));
        stats.setPerkSubStyle(firstNonNull(
                readInt(statsNode, participantNode, "perkSubStyle"),
                readPerkStyle(perksNode, 1)
        ));
    }

    private Integer readInt(JsonNode primary, JsonNode fallback, String... fieldNames) {
        Integer value = SgpJsonMapperSupport.readInt(primary, fieldNames);
        return value != null ? value : SgpJsonMapperSupport.readInt(fallback, fieldNames);
    }

    private Long readLong(JsonNode primary, JsonNode fallback, String... fieldNames) {
        Long value = SgpJsonMapperSupport.readLong(primary, fieldNames);
        return value != null ? value : SgpJsonMapperSupport.readLong(fallback, fieldNames);
    }

    private Boolean readBoolean(JsonNode primary, JsonNode fallback, String... fieldNames) {
        Boolean value = SgpJsonMapperSupport.readBoolean(primary, fieldNames);
        return value != null ? value : SgpJsonMapperSupport.readBoolean(fallback, fieldNames);
    }

    private Integer readChallengeInt(JsonNode statsNode, JsonNode participantNode, String... fieldNames) {
        Integer value = SgpJsonMapperSupport.readInt(SgpJsonMapperSupport.value(statsNode, "challenges"), fieldNames);
        return value != null
                ? value
                : SgpJsonMapperSupport.readInt(SgpJsonMapperSupport.value(participantNode, "challenges"), fieldNames);
    }

    private Integer readPerk(JsonNode perksNode, int index) {
        JsonNode selection = perkSelection(perksNode, index);
        return SgpJsonMapperSupport.readInt(selection, "perk");
    }

    private Integer readPerkStyle(JsonNode perksNode, int styleIndex) {
        JsonNode style = perkStyle(perksNode, styleIndex);
        return SgpJsonMapperSupport.readInt(style, "style");
    }

    private JsonNode perkSelection(JsonNode perksNode, int index) {
        int remaining = index;
        JsonNode styles = SgpJsonMapperSupport.path(perksNode, "styles");
        if (styles == null || !styles.isArray()) {
            return null;
        }
        for (JsonNode style : styles) {
            JsonNode selections = SgpJsonMapperSupport.value(style, "selections");
            if (selections == null || !selections.isArray()) {
                continue;
            }
            for (JsonNode selection : selections) {
                if (remaining == 0) {
                    return selection;
                }
                remaining -= 1;
            }
        }
        return null;
    }

    private JsonNode perkStyle(JsonNode perksNode, int styleIndex) {
        JsonNode styles = SgpJsonMapperSupport.path(perksNode, "styles");
        if (styles == null || !styles.isArray() || styles.size() <= styleIndex) {
            return null;
        }
        return styles.get(styleIndex);
    }

    private Map<String, Object> toMap(JsonNode node) {
        if (!SgpJsonMapperSupport.isObject(node)) {
            return null;
        }
        return objectMapper.convertValue(node, MAP_TYPE);
    }

    private Map<String, Object> extraFields(JsonNode participantNode) {
        Map<String, Object> source = toMap(participantNode);
        if (source == null || source.isEmpty()) {
            return Map.of();
        }
        Map<String, Object> extra = new LinkedHashMap<>(source);
        List.of(
                "participantId", "teamId", "championId", "spell1Id", "spell2Id", "summonerSpell1Id",
                "summonerSpell2Id", "teamPosition", "individualPosition", "selectedPosition", "lane", "role",
                "stats", "player", "puuid", "summonerId", "summonerName", "riotIdGameName", "riotIdTagline",
                "win", "kills", "deaths", "assists", "goldEarned", "totalMinionsKilled",
                "neutralMinionsKilled", "totalDamageDealtToChampions", "totalDamageTaken", "totalHeal",
                "visionScore", "item0", "item1", "item2", "item3", "item4", "item5", "item6",
                "doubleKills", "tripleKills", "quadraKills", "pentaKills", "largestKillingSpree",
                "legendaryCount", "perk0", "perks", "playerAugment1", "playerAugment2", "playerAugment3",
                "playerAugment4", "challenges"
        ).forEach(extra::remove);
        return extra;
    }

    private JsonNode firstObject(JsonNode... nodes) {
        return SgpJsonMapperSupport.firstObject(nodes);
    }

    @SafeVarargs
    private final <T> T firstNonNull(T... values) {
        if (values == null) {
            return null;
        }
        for (T value : values) {
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private List<GameDetail.ParticipantIdentity> mapParticipantIdentities(JsonNode game, JsonNode participantsNode) {
        JsonNode identitiesNode = SgpJsonMapperSupport.participantIdentities(game);
        if (identitiesNode != null && !identitiesNode.isEmpty()) {
            return mapIdentityNodes(identitiesNode);
        }
        return mapIdentityNodes(participantsNode);
    }

    private List<GameDetail.ParticipantIdentity> mapIdentityNodes(JsonNode identityNodes) {
        List<GameDetail.ParticipantIdentity> identities = new ArrayList<>();
        for (JsonNode identityNode : identityNodes) {
            if (!SgpJsonMapperSupport.isObject(identityNode)) {
                continue;
            }
            GameDetail.ParticipantIdentity identity = new GameDetail.ParticipantIdentity();
            identity.setParticipantId(SgpJsonMapperSupport.readInt(identityNode, "participantId", "participant_id", "id"));
            identity.setPlayer(mapPlayer(SgpJsonMapperSupport.playerNode(identityNode)));
            identities.add(identity);
        }
        return identities;
    }

    private GameDetail.Player mapPlayer(JsonNode playerNode) {
        GameDetail.Player player = new GameDetail.Player();
        player.setPuuid(SgpJsonMapperSupport.readText(playerNode, "puuid"));
        // SGP 新格式里 Riot ID 叫 riotIdGameName / riotIdTagline，老的 gameName/summonerName 已经没有了
        player.setGameName(SgpJsonMapperSupport.readText(playerNode, "riotIdGameName", "gameName", "summonerName"));
        player.setTagLine(SgpJsonMapperSupport.readText(playerNode, "riotIdTagline", "tagLine", "tagline"));
        player.setSummonerName(SgpJsonMapperSupport.readText(playerNode, "summonerName", "displayName", "riotIdGameName"));
        player.setSummonerId(SgpJsonMapperSupport.readLong(playerNode, "summonerId"));
        player.setPlatformId(SgpJsonMapperSupport.readText(playerNode, "platformId", "region"));
        return player;
    }
}
