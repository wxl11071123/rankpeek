package io.rankpeek.model;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 对局详情模型
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class GameDetail {

    @JsonProperty("gameId")
    private Long gameId;

    @JsonProperty("gameMode")
    private String gameMode;

    @JsonProperty("gameType")
    private String gameType;

    @JsonProperty("mapId")
    private Integer mapId;

    @JsonProperty("queueId")
    private Integer queueId;

    @JsonProperty("gameDuration")
    private Long gameDuration;

    @JsonProperty("gameCreation")
    private Long gameCreation;

    @JsonProperty("participantIdentities")
    private List<ParticipantIdentity> participantIdentities;

    @JsonProperty("participants")
    private List<GameParticipant> participants;

    @JsonProperty("teamObjectives")
    private List<TeamObjectiveSummary> teamObjectives;

    @JsonProperty("teamBans")
    private List<TeamBanSummary> teamBans;

    @JsonProperty("teams")
    private void unpackTeams(List<RawTeamSummary> teams) {
        if (teams == null || teams.isEmpty()) {
            return;
        }

        List<TeamObjectiveSummary> summaries = new ArrayList<>();
        for (RawTeamSummary team : teams) {
            TeamObjectiveSummary summary = toTeamObjectiveSummary(team);
            if (summary != null && summary.hasData()) {
                summaries.add(summary);
            }
        }
        if (!summaries.isEmpty()) {
            teamObjectives = summaries;
        }
    }

    private TeamObjectiveSummary toTeamObjectiveSummary(RawTeamSummary team) {
        if (team == null || team.getTeamId() == null) {
            return null;
        }
        TeamObjectiveSummary summary = new TeamObjectiveSummary();
        summary.setTeamId(team.getTeamId());
        summary.setBans(normalizeBanIds(team.getBans()));
        summary.setTurretKills(maxNullableNonNegative(
                team.getTurretKills(),
                objectiveKills(team.getObjectives(), "turret", "turrets", "tower", "towers")
        ));
        summary.setInhibitorKills(maxNullableNonNegative(
                team.getInhibitorKills(),
                objectiveKills(team.getObjectives(), "inhibitor", "inhibitors")
        ));
        summary.setTurretPlateKills(maxNullableNonNegative(
                team.getTurretPlateKills(),
                objectiveKills(team.getObjectives(), "turretPlate", "turretPlates", "plate", "plates")
        ));
        summary.setBaronKills(maxNullableNonNegative(
                team.getBaronKills(),
                objectiveKills(team.getObjectives(), "baron")
        ));
        summary.setDragonKills(maxNullableNonNegative(
                team.getDragonKills(),
                objectiveKills(team.getObjectives(), "dragon")
        ));
        summary.setElderDragonKills(maxNullableNonNegative(
                team.getElderDragonKills(),
                objectiveKills(team.getObjectives(), "elderDragon", "elder")
        ));
        summary.setHeraldKills(maxNullableNonNegative(
                team.getHeraldKills(),
                team.getRiftHeraldKills(),
                objectiveKills(team.getObjectives(), "riftHerald", "herald")
        ));
        summary.setVoidGrubKills(maxNullableNonNegative(
                team.getVoidGrubKills(),
                team.getVoidgrubsKills(),
                team.getVoidGrubsKilled(),
                team.getHordeKills(),
                objectiveKills(team.getObjectives(), "horde", "voidGrubs")
        ));
        summary.setDragonSoulType(normalizeDragonType(firstNonBlank(
                team.getDragonSoulType(),
                team.getSoulType(),
                team.getDragonSoul(),
                objectiveText(team.getObjectives(), "dragon", "dragonSoulType", "soulType", "dragonSoul")
        )));
        return summary;
    }

    private Integer maxNullableNonNegative(Integer... values) {
        Integer maxValue = null;
        if (values == null) {
            return null;
        }
        for (Integer value : values) {
            if (value == null) {
                continue;
            }
            int normalized = Math.max(0, value);
            if (maxValue == null || normalized > maxValue) {
                maxValue = normalized;
            }
        }
        return maxValue;
    }

    private Integer objectiveKills(RawTeamObjectives objectives, String... objectiveNames) {
        if (objectives == null || objectives.getObjectives() == null || objectiveNames == null) {
            return null;
        }
        for (String objectiveName : objectiveNames) {
            RawObjective objective = objectives.getObjectives().get(objectiveName);
            if (objective != null) {
                return objective.getKills();
            }
        }
        return null;
    }

    private String objectiveText(RawTeamObjectives objectives, String objectiveName, String... fieldNames) {
        if (objectives == null || objectives.getObjectives() == null || objectiveName == null || fieldNames == null) {
            return null;
        }
        RawObjective objective = objectives.getObjectives().get(objectiveName);
        if (objective == null) {
            return null;
        }
        for (String fieldName : fieldNames) {
            String value = objective.getTextField(fieldName);
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    private String normalizeDragonType(String rawType) {
        if (rawType == null || rawType.isBlank()) {
            return null;
        }
        String normalized = rawType.toLowerCase();
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

    private List<Integer> normalizeBanIds(List<TeamBan> bans) {
        if (bans == null || bans.isEmpty()) {
            return new ArrayList<>();
        }
        List<Integer> championIds = new ArrayList<>();
        for (TeamBan ban : bans) {
            if (ban == null || ban.getChampionId() == null || ban.getChampionId() <= 0) {
                continue;
            }
            championIds.add(ban.getChampionId());
            if (championIds.size() >= 5) {
                break;
            }
        }
        return championIds;
    }

    private Integer nonNegative(Integer value) {
        return value == null || value < 0 ? 0 : value;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_EMPTY)
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class TeamBanSummary {
        @JsonProperty("teamId")
        private Integer teamId;

        @JsonProperty("bans")
        private List<Integer> bans = new ArrayList<>();
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_EMPTY)
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class TeamObjectiveSummary {
        @JsonProperty("teamId")
        private Integer teamId;

        @JsonProperty("bans")
        private List<Integer> bans = new ArrayList<>();

        @JsonProperty("turretKills")
        private Integer turretKills;

        @JsonProperty("turretPlateKills")
        private Integer turretPlateKills;

        @JsonProperty("inhibitorKills")
        private Integer inhibitorKills;

        @JsonProperty("baronKills")
        private Integer baronKills;

        @JsonProperty("elderDragonKills")
        private Integer elderDragonKills;

        @JsonProperty("dragonKills")
        private Integer dragonKills;

        @JsonProperty("dragonKillsByType")
        private Map<String, Integer> dragonKillsByType = new LinkedHashMap<>();

        @JsonProperty("heraldKills")
        private Integer heraldKills;

        @JsonProperty("voidGrubKills")
        private Integer voidGrubKills;

        @JsonProperty("dragonSoulType")
        private String dragonSoulType;

        @JsonProperty("objectiveEvents")
        private List<TeamObjectiveEvent> objectiveEvents = new ArrayList<>();

        public boolean hasData() {
            return (bans != null && !bans.isEmpty())
                    || hasPositive(turretKills)
                    || hasPositive(turretPlateKills)
                    || hasPositive(inhibitorKills)
                    || hasPositive(baronKills)
                    || hasPositive(elderDragonKills)
                    || hasPositive(dragonKills)
                    || (dragonKillsByType != null && !dragonKillsByType.isEmpty())
                    || hasPositive(heraldKills)
                    || hasPositive(voidGrubKills)
                    || (dragonSoulType != null && !dragonSoulType.isBlank())
                    || (objectiveEvents != null && !objectiveEvents.isEmpty());
        }

        private boolean hasPositive(Integer value) {
            return value != null && value > 0;
        }
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_EMPTY)
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class TeamObjectiveEvent {
        @JsonProperty("kind")
        private String kind;

        @JsonProperty("subType")
        private String subType;

        @JsonProperty("teamId")
        private Integer teamId;

        @JsonProperty("participantId")
        private Integer participantId;

        @JsonProperty("championId")
        private Integer championId;

        @JsonProperty("timestamp")
        private Long timestamp;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    private static class RawTeamSummary {
        @JsonProperty("teamId")
        private Integer teamId;

        @JsonProperty("bans")
        private List<TeamBan> bans;

        @JsonProperty("turretKills")
        @JsonAlias({"towerKills", "turretsKilled", "towersKilled"})
        private Integer turretKills;

        @JsonProperty("turretPlateKills")
        @JsonAlias({"turretPlatesTaken", "platesTaken", "plateKills"})
        private Integer turretPlateKills;

        @JsonProperty("inhibitorKills")
        @JsonAlias({"inhibitorsKilled"})
        private Integer inhibitorKills;

        @JsonProperty("baronKills")
        private Integer baronKills;

        @JsonProperty("dragonKills")
        private Integer dragonKills;

        @JsonProperty("elderDragonKills")
        private Integer elderDragonKills;

        @JsonProperty("heraldKills")
        private Integer heraldKills;

        @JsonProperty("riftHeraldKills")
        private Integer riftHeraldKills;

        @JsonProperty("voidGrubKills")
        @JsonAlias({"voidgrubKills"})
        private Integer voidGrubKills;

        @JsonProperty("voidgrubsKills")
        private Integer voidgrubsKills;

        @JsonProperty("voidGrubsKilled")
        private Integer voidGrubsKilled;

        @JsonProperty("hordeKills")
        private Integer hordeKills;

        @JsonProperty("dragonSoulType")
        @JsonAlias({"soulType", "dragonSoul"})
        private String dragonSoulType;

        @JsonProperty("soulType")
        private String soulType;

        @JsonProperty("dragonSoul")
        private String dragonSoul;

        @JsonProperty("objectives")
        private RawTeamObjectives objectives;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    private static class RawTeamObjectives {
        private Map<String, RawObjective> objectives = new HashMap<>();

        @JsonAnySetter
        void putObjective(String name, RawObjective objective) {
            if (name != null && objective != null) {
                objectives.put(name, objective);
            }
        }
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    private static class RawObjective {
        @JsonProperty("kills")
        private Integer kills;

        private Map<String, String> textFields = new HashMap<>();

        @JsonAnySetter
        void putField(String name, Object value) {
            if (name != null && value instanceof String text && !text.isBlank()) {
                textFields.put(name, text);
            }
        }

        String getTextField(String name) {
            return textFields.get(name);
        }
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    private static class TeamBan {
        @JsonProperty("championId")
        private Integer championId;
    }

    /**
     * 参与者身份信息
     */
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ParticipantIdentity {
        @JsonProperty("participantId")
        private Integer participantId;

        @JsonProperty("player")
        private Player player;
    }

    /**
     * 玩家信息
     */
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Player {
        @JsonProperty("accountId")
        private Long accountId;

        @JsonProperty("puuid")
        private String puuid;

        @JsonProperty("platformId")
        private String platformId;

        @JsonProperty("summonerName")
        private String summonerName;

        @JsonProperty("gameName")
        private String gameName;

        @JsonProperty("tagLine")
        private String tagLine;

        @JsonProperty("summonerId")
        private Long summonerId;

        public String getFullName() {
            if (tagLine != null && !tagLine.isEmpty()) {
                return gameName + "#" + tagLine;
            }
            return gameName != null ? gameName : summonerName;
        }
    }

    /**
     * 对局参与者详细数据
     */
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class GameParticipant {
        @JsonProperty("participantId")
        private Integer participantId;

        @JsonProperty("teamId")
        private Integer teamId;

        @JsonProperty("championId")
        private Integer championId;

        @JsonProperty("spell1Id")
        private Integer spell1Id;

        @JsonProperty("spell2Id")
        private Integer spell2Id;

        @JsonProperty("teamPosition")
        private String teamPosition;

        @JsonProperty("individualPosition")
        private String individualPosition;

        @JsonProperty("selectedPosition")
        private String selectedPosition;

        @JsonProperty("stats")
        private Stats stats;

        @JsonProperty("timeline")
        private Timeline timeline;
    }

    /**
     * 统计数据
     */
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Stats {
        @JsonProperty("win")
        private Boolean win;

        @JsonProperty("kills")
        private Integer kills;

        @JsonProperty("deaths")
        private Integer deaths;

        @JsonProperty("assists")
        private Integer assists;

        @JsonProperty("totalMinionsKilled")
        private Integer totalMinionsKilled;

        @JsonProperty("neutralMinionsKilled")
        private Integer neutralMinionsKilled;

        @JsonProperty("goldEarned")
        private Long goldEarned;

        @JsonProperty("totalDamageDealtToChampions")
        private Long totalDamageDealtToChampions;

        @JsonProperty("visionWardsBoughtInGame")
        private Integer visionWardsBoughtInGame;

        @JsonProperty("visionScore")
        private Integer visionScore;

        @JsonProperty("earlyGoldDiff")
        private Integer earlyGoldDiff;

        @JsonProperty("wardsPlaced")
        private Integer wardsPlaced;

        @JsonProperty("wardsKilled")
        private Integer wardsKilled;

        @JsonProperty("largestMultiKill")
        private Integer largestMultiKill;

        @JsonProperty("totalHeal")
        private Long totalHeal;

        @JsonProperty("totalDamageTaken")
        private Long totalDamageTaken;

        @JsonProperty("doubleKills")
        private Integer doubleKills;

        @JsonProperty("tripleKills")
        private Integer tripleKills;

        @JsonProperty("quadraKills")
        private Integer quadraKills;

        @JsonProperty("pentaKills")
        private Integer pentaKills;

        @JsonProperty("largestKillingSpree")
        private Integer largestKillingSpree;

        @JsonProperty("legendaryCount")
        private Integer legendaryCount;

        // 装备
        @JsonProperty("item0")
        private Integer item0;

        @JsonProperty("item1")
        private Integer item1;

        @JsonProperty("item2")
        private Integer item2;

        @JsonProperty("item3")
        private Integer item3;

        @JsonProperty("item4")
        private Integer item4;

        @JsonProperty("item5")
        private Integer item5;

        @JsonProperty("item6")
        private Integer item6;

        // MVP/SVP
        @JsonProperty("mvp")
        private String mvp;

        // 伤害占比
        @JsonProperty("damageDealtToChampionsRate")
        private Double damageDealtToChampionsRate;

        @JsonProperty("damageTakenRate")
        private Double damageTakenRate;

        @JsonProperty("healRate")
        private Double healRate;

        @JsonProperty("damageDealtToTurrets")
        private Long damageDealtToTurrets;

        // 符文
        @JsonProperty("perk0")
        private Integer perk0;

        @JsonProperty("perk1")
        private Integer perk1;

        @JsonProperty("perk2")
        private Integer perk2;

        @JsonProperty("perk3")
        private Integer perk3;

        @JsonProperty("perk4")
        private Integer perk4;

        @JsonProperty("perk5")
        private Integer perk5;

        @JsonProperty("perkPrimaryStyle")
        private Integer perkPrimaryStyle;

        @JsonProperty("perkSubStyle")
        private Integer perkSubStyle;

        @JsonProperty("perks")
        private Map<String, Object> perks;

        // 海克斯强化 (竞技场模式)
        @JsonProperty("playerAugment1")
        private Integer playerAugment1;

        @JsonProperty("playerAugment2")
        private Integer playerAugment2;

        @JsonProperty("playerAugment3")
        private Integer playerAugment3;

        @JsonProperty("playerAugment4")
        private Integer playerAugment4;

        @JsonProperty("challenges")
        private Map<String, Object> challenges;

        @JsonProperty("extraFields")
        private Map<String, Object> extraFields = new HashMap<>();

        @JsonAnySetter
        public void putExtraField(String key, Object value) {
            extraFields.put(key, value);
        }
    }

    /**
     * 时间线数据
     */
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Timeline {
        @JsonProperty("lane")
        private String lane;

        @JsonProperty("role")
        private String role;

        @JsonProperty("teamPosition")
        private String teamPosition;

        @JsonProperty("positionCn")
        private String positionCn;

        @JsonProperty("rawLane")
        private String rawLane;

        @JsonProperty("rawRole")
        private String rawRole;
    }
}
