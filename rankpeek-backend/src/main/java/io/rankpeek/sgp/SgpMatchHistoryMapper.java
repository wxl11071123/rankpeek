package io.rankpeek.sgp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.rankpeek.model.MatchHistory;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class SgpMatchHistoryMapper {

    /** 只打一次：确认 SGP 到底有没有给 Riot ID（排查"名字从哪来"用）。 */
    private static final java.util.concurrent.atomic.AtomicBoolean NAME_SOURCE_LOGGED =
            new java.util.concurrent.atomic.AtomicBoolean(false);

    private final ObjectMapper objectMapper;

    public SgpMatchHistoryMapper() {
        this(new ObjectMapper());
    }

    SgpMatchHistoryMapper(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper == null ? new ObjectMapper() : objectMapper;
    }

    public List<MatchHistory> mapMatchHistorySummary(JsonNode response) {
        List<MatchHistory> matches = new ArrayList<>();
        for (JsonNode game : SgpJsonMapperSupport.extractGames(response)) {
            MatchHistory match = mapGame(game);
            if (match != null) {
                matches.add(match);
            }
        }
        matches.sort(Comparator.comparingLong(this::gameCreationOrMin).reversed());
        return matches;
    }

    public MatchHistory mapGame(JsonNode game) {
        if (!SgpJsonMapperSupport.isObject(game)) {
            return null;
        }
        JsonNode participantsNode = SgpJsonMapperSupport.participants(game);
        if (participantsNode == null || participantsNode.isEmpty()) {
            return null;
        }

        MatchHistory match = new MatchHistory();
        match.setGameId(SgpJsonMapperSupport.readLong(game, "gameId", "id"));
        match.setQueueId(SgpJsonMapperSupport.readInt(game, "queueId", "queue"));
        match.setGameMode(SgpJsonMapperSupport.readText(game, "gameMode", "mode"));
        match.setGameType(SgpJsonMapperSupport.readText(game, "gameType", "type"));
        match.setGameCreation(SgpJsonMapperSupport.readLong(game, "gameCreation", "gameCreationDate", "createdAt"));
        match.setGameDuration(SgpJsonMapperSupport.readInt(game, "gameDuration", "duration"));
        match.setPlatformId(SgpJsonMapperSupport.readText(game, "platformId", "region"));
        match.setMapId(SgpJsonMapperSupport.readInt(game, "mapId", "map"));
        match.setRemake(SgpJsonMapperSupport.readBoolean(game, "isRemake", "remake"));
        match.setParticipants(mapParticipants(participantsNode));
        match.setParticipantIdentities(mapParticipantIdentities(game, participantsNode));
        fillPlayerNamesFromParticipants(match, participantsNode);
        return match;
    }

    public Map<Long, String> rawSummaryJsonByGameId(JsonNode response) {
        Map<Long, String> rawByGameId = new LinkedHashMap<>();
        for (JsonNode game : SgpJsonMapperSupport.extractGames(response)) {
            Long gameId = SgpJsonMapperSupport.readLong(game, "gameId", "id");
            if (gameId == null) {
                continue;
            }
            try {
                rawByGameId.put(gameId, objectMapper.writeValueAsString(game));
            } catch (Exception ignored) {
                rawByGameId.put(gameId, game.toString());
            }
        }
        return rawByGameId;
    }

    private List<MatchHistory.Participant> mapParticipants(JsonNode participantsNode) {
        List<MatchHistory.Participant> participants = new ArrayList<>();
        for (JsonNode participantNode : participantsNode) {
            if (!SgpJsonMapperSupport.isObject(participantNode)) {
                continue;
            }
            MatchHistory.Participant participant = new MatchHistory.Participant();
            participant.setParticipantId(SgpJsonMapperSupport.readInt(participantNode, "participantId", "participant_id", "id"));
            participant.setTeamId(SgpJsonMapperSupport.readInt(participantNode, "teamId", "team"));
            participant.setChampionId(SgpJsonMapperSupport.readInt(participantNode, "championId", "champion"));
            participant.setSpell1Id(SgpJsonMapperSupport.readInt(participantNode, "spell1Id", "summonerSpell1Id"));
            participant.setSpell2Id(SgpJsonMapperSupport.readInt(participantNode, "spell2Id", "summonerSpell2Id"));
            participant.setTeamPosition(SgpJsonMapperSupport.readText(participantNode, "teamPosition"));
            participant.setIndividualPosition(SgpJsonMapperSupport.readText(participantNode, "individualPosition"));
            participant.setSelectedPosition(SgpJsonMapperSupport.readText(participantNode, "selectedPosition"));
            participant.setLane(SgpJsonMapperSupport.readText(participantNode, "lane"));
            participant.setRole(SgpJsonMapperSupport.readText(participantNode, "role"));
            participant.setStats(mapStats(participantNode));
            participants.add(participant);
        }
        return participants;
    }

    private MatchHistory.Stats mapStats(JsonNode participantNode) {
        JsonNode statsNode = SgpJsonMapperSupport.statsNode(participantNode);
        MatchHistory.Stats stats = new MatchHistory.Stats();
        stats.setWin(readBoolean(statsNode, participantNode, "win", "winner"));
        stats.setKills(readInt(statsNode, participantNode, "kills"));
        stats.setDeaths(readInt(statsNode, participantNode, "deaths"));
        stats.setAssists(readInt(statsNode, participantNode, "assists"));
        stats.setGoldEarned(readInt(statsNode, participantNode, "goldEarned"));
        stats.setTotalMinionsKilled(readInt(statsNode, participantNode, "totalMinionsKilled", "minionsKilled"));
        stats.setNeutralMinionsKilled(readInt(statsNode, participantNode, "neutralMinionsKilled"));
        stats.setTotalDamageDealtToChampions(readInt(statsNode, participantNode, "totalDamageDealtToChampions"));
        stats.setTotalDamageTaken(readInt(statsNode, participantNode, "totalDamageTaken"));
        stats.setTotalHeal(readInt(statsNode, participantNode, "totalHeal"));
        stats.setVisionScore(readInt(statsNode, participantNode, "visionScore"));
        stats.setEarlyGoldDiff(readInt(statsNode, participantNode, "earlyGoldDiff"));
        stats.setLaneGoldDiff15(readInt(statsNode, participantNode, "laneGoldDiff15"));
        stats.setGoldDiff15(readInt(statsNode, participantNode, "goldDiff15"));
        stats.setGoldDiffAt15(readInt(statsNode, participantNode, "goldDiffAt15"));
        stats.setGoldDifferenceAt15(readInt(statsNode, participantNode, "goldDifferenceAt15"));
        stats.setFifteenMinuteGoldDiff(readInt(statsNode, participantNode, "fifteenMinuteGoldDiff"));
        stats.setItem0(readInt(statsNode, participantNode, "item0"));
        stats.setItem1(readInt(statsNode, participantNode, "item1"));
        stats.setItem2(readInt(statsNode, participantNode, "item2"));
        stats.setItem3(readInt(statsNode, participantNode, "item3"));
        stats.setItem4(readInt(statsNode, participantNode, "item4"));
        stats.setItem5(readInt(statsNode, participantNode, "item5"));
        stats.setItem6(readInt(statsNode, participantNode, "item6"));
        stats.setDoubleKills(readInt(statsNode, participantNode, "doubleKills"));
        stats.setTripleKills(readInt(statsNode, participantNode, "tripleKills"));
        stats.setQuadraKills(readInt(statsNode, participantNode, "quadraKills"));
        stats.setPentaKills(readInt(statsNode, participantNode, "pentaKills"));
        stats.setLargestKillingSpree(readInt(statsNode, participantNode, "largestKillingSpree"));
        stats.setLegendaryCount(firstNonNull(
                readInt(statsNode, participantNode, "legendaryCount"),
                readChallengeInt(statsNode, participantNode, "legendaryCount")
        ));
        mapPerks(participantNode, statsNode, stats);
        stats.setPlayerAugment1(readInt(statsNode, participantNode, "playerAugment1"));
        stats.setPlayerAugment2(readInt(statsNode, participantNode, "playerAugment2"));
        stats.setPlayerAugment3(readInt(statsNode, participantNode, "playerAugment3"));
        stats.setPlayerAugment4(readInt(statsNode, participantNode, "playerAugment4"));
        return stats;
    }

    private void mapPerks(JsonNode participantNode, JsonNode statsNode, MatchHistory.Stats stats) {
        JsonNode perksNode = firstObject(
                SgpJsonMapperSupport.value(statsNode, "perks"),
                SgpJsonMapperSupport.value(participantNode, "perks")
        );
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

    private List<MatchHistory.ParticipantIdentity> mapParticipantIdentities(JsonNode game, JsonNode participantsNode) {
        JsonNode identitiesNode = SgpJsonMapperSupport.participantIdentities(game);
        if (identitiesNode != null && !identitiesNode.isEmpty()) {
            return mapIdentityNodes(identitiesNode);
        }
        return mapIdentityNodes(participantsNode);
    }

    private List<MatchHistory.ParticipantIdentity> mapIdentityNodes(JsonNode identityNodes) {
        List<MatchHistory.ParticipantIdentity> identities = new ArrayList<>();
        for (JsonNode identityNode : identityNodes) {
            if (!SgpJsonMapperSupport.isObject(identityNode)) {
                continue;
            }
            MatchHistory.ParticipantIdentity identity = new MatchHistory.ParticipantIdentity();
            identity.setParticipantId(SgpJsonMapperSupport.readInt(identityNode, "participantId", "participant_id", "id"));
            identity.setPlayer(mapPlayer(SgpJsonMapperSupport.playerNode(identityNode)));
            identities.add(identity);
        }
        return identities;
    }

    /**
     * 把参赛者节点上的 Riot ID 回填到身份上。
     *
     * <p>SGP 新格式把 Riot ID 放在**参赛者**节点（riotIdGameName / riotIdTagline），
     * 而 participantIdentities[].player 里只有 summonerId + puuid —— 只读 player 的话
     * 名字会全是空，界面上就是一片 "Unknown Player"。
     */
    private void fillPlayerNamesFromParticipants(MatchHistory match, JsonNode participantsNode) {
        if (match.getParticipantIdentities() == null || match.getParticipantIdentities().isEmpty()) {
            return;
        }
        Map<Integer, JsonNode> participantsById = new HashMap<>();
        for (JsonNode node : participantsNode) {
            if (!SgpJsonMapperSupport.isObject(node)) {
                continue;
            }
            Integer participantId = SgpJsonMapperSupport.readInt(node, "participantId", "participant_id", "id");
            if (participantId != null) {
                participantsById.put(participantId, node);
            }
        }
        int filled = 0;
        for (MatchHistory.ParticipantIdentity identity : match.getParticipantIdentities()) {
            MatchHistory.Player player = identity == null ? null : identity.getPlayer();
            JsonNode node = identity == null ? null : participantsById.get(identity.getParticipantId());
            if (player == null || node == null) {
                continue;
            }
            if (isBlank(player.getGameName())) {
                String gameName = SgpJsonMapperSupport.readText(node, "riotIdGameName", "gameName", "summonerName");
                player.setGameName(gameName);
                if (gameName != null && !gameName.isBlank()) {
                    filled += 1;
                }
            }
            if (isBlank(player.getTagLine())) {
                player.setTagLine(SgpJsonMapperSupport.readText(node, "riotIdTagline", "tagLine", "tagline"));
            }
            if (isBlank(player.getSummonerName())) {
                player.setSummonerName(SgpJsonMapperSupport.readText(node, "summonerName", "riotIdGameName", "gameName"));
            }
        }
        if (filled > 0 && NAME_SOURCE_LOGGED.compareAndSet(false, true)) {
            log.info("SGP 摘要名字来自参赛者节点（riotIdGameName），本次回填 {} 条", filled);
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private MatchHistory.Player mapPlayer(JsonNode playerNode) {
        MatchHistory.Player player = new MatchHistory.Player();
        player.setPuuid(SgpJsonMapperSupport.readText(playerNode, "puuid"));
        player.setGameName(SgpJsonMapperSupport.readText(playerNode, "gameName", "riotIdGameName"));
        player.setTagLine(SgpJsonMapperSupport.readText(playerNode, "tagLine", "tagline", "riotIdTagline"));
        player.setSummonerName(SgpJsonMapperSupport.readText(playerNode, "summonerName", "displayName", "riotIdGameName"));
        player.setSummonerId(SgpJsonMapperSupport.readLong(playerNode, "summonerId"));
        player.setPlatformId(SgpJsonMapperSupport.readText(playerNode, "platformId", "region"));
        return player;
    }

    private long gameCreationOrMin(MatchHistory match) {
        return match.getGameCreation() == null ? Long.MIN_VALUE : match.getGameCreation();
    }
}
