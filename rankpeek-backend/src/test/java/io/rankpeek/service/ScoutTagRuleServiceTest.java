package io.rankpeek.service;

import io.rankpeek.model.MatchHistory;
import io.rankpeek.model.RankTag;
import io.rankpeek.model.ScoutTagContext;
import io.rankpeek.model.ScoutTagSample;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ScoutTagRuleServiceTest {

    private static final String LANE_PRESSURE_TAG = "对线压制";
    private static final String LANE_RISK_TAG = "对线风险";

    @Mock
    private AssetService assetService;

    private ScoutTagRuleService service;

    @BeforeEach
    void setUp() {
        service = new ScoutTagRuleService(assetService);
    }

    @Test
    void buildTagsAppliesCurrentModePublicThresholds() {
        List<MatchHistory> currentMode = List.of(
                match(1, 420, "self", 901, true, 10, 2, 8, 26000, 100, "MIDDLE", 400),
                match(2, 420, "self", 901, true, 8, 1, 9, 27000, 100, "MIDDLE", 350),
                match(3, 420, "self", 901, true, 7, 2, 10, 28000, 100, "MIDDLE", 300),
                match(4, 420, "self", 901, false, 9, 2, 8, 29000, 100, "MIDDLE", 100),
                match(5, 420, "self", 11, false, 2, 4, 5, 12000, 100, "MIDDLE", -100)
        );

        List<String> tagNames = tagNames(service.buildTags(context(420), sample(420, currentMode, currentMode)));

        assertThat(tagNames).contains("3连胜", "高胜率", "稳定C", "高伤", "小火龙");
        assertThat(tagNames).doesNotContain(LANE_PRESSURE_TAG, LANE_RISK_TAG);
        assertThat(tagNames).doesNotContain("暴毙", "摆烂", "开黑仔");
    }

    @Test
    void buildTagsAppliesLossStreakAndLowWinRateThreshold() {
        List<MatchHistory> currentMode = List.of(
                match(1, 420, "self", 11, false, 1, 5, 1, 12000, 100, "TOP", -500),
                match(2, 420, "self", 12, false, 2, 4, 2, 12000, 100, "TOP", -400),
                match(3, 420, "self", 13, false, 3, 6, 3, 12000, 100, "TOP", -300),
                match(4, 420, "self", 14, false, 4, 3, 4, 12000, 100, "TOP", -100),
                match(5, 420, "self", 15, true, 5, 2, 5, 12000, 100, "TOP", 100)
        );

        List<String> tagNames = tagNames(service.buildTags(context(420), sample(420, currentMode, currentMode)));

        assertThat(tagNames).contains("4连败", "低迷");
        assertThat(tagNames).doesNotContain(LANE_PRESSURE_TAG, LANE_RISK_TAG);
        assertThat(tagNames).doesNotContain("高胜率");
    }

    @Test
    void buildTagsAddsCasualOnlyWhenRecentFiftyHasMoreThanTenCasualGamesAndCurrentQueueIsNotCasual() {
        List<MatchHistory> lookback = new ArrayList<>();
        for (int index = 0; index < 11; index++) {
            lookback.add(match(index, 450, "self", 11, true, 1, 1, 1, 1000, 100, null, null));
        }
        for (int index = 11; index < 50; index++) {
            lookback.add(match(index, 420, "self", 11, true, 1, 1, 1, 1000, 100, null, null));
        }

        assertThat(tagNames(service.buildTags(context(420), sample(420, lookback.subList(11, 31), lookback))))
                .contains("娱乐");
        assertThat(tagNames(service.buildTags(context(450), sample(450, lookback.subList(0, 20), lookback))))
                .doesNotContain("娱乐");
    }

    @Test
    void buildTagsUsesCurrentTeamAndRecentTwoRostersForPremade() {
        MatchHistory recentWithCurrentTeammate = match(1, 420, "self", 11, true, 1, 1, 1, 1000, 100, null, null);
        addParticipant(recentWithCurrentTeammate, "friend", 2, 100, 22, true, null, null);

        MatchHistory older = match(2, 420, "self", 12, false, 1, 1, 1, 1000, 100, null, null);
        addParticipant(older, "stranger", 2, 100, 33, false, null, null);

        ScoutTagContext context = ScoutTagContext.builder()
                .puuid("self")
                .currentQueueId(420)
                .currentTeamPuuids(List.of("self", "friend"))
                .build();

        List<String> tagNames = tagNames(service.buildTags(context, sample(420, List.of(recentWithCurrentTeammate, older), List.of(recentWithCurrentTeammate, older))));

        assertThat(tagNames).contains("开黑");
        assertThat(tagNames).doesNotContain("开黑仔");
    }

    @Test
    void buildTagsIncludesChampionNameForSignatureAndStruggleTags() {
        when(assetService.getChampionName(221)).thenReturn("泽丽");
        when(assetService.getChampionName(157)).thenReturn("亚索");

        List<MatchHistory> zeriWins = List.of(
                match(1, 420, "self", 221, true, 1, 1, 5, 1000, 100, null, null),
                match(2, 420, "self", 221, true, 1, 1, 5, 1000, 100, null, null),
                match(3, 420, "self", 221, true, 1, 1, 5, 1000, 100, null, null),
                match(4, 420, "self", 221, false, 1, 1, 5, 1000, 100, null, null)
        );
        List<MatchHistory> yasuoLosses = List.of(
                match(5, 420, "self", 157, true, 1, 1, 5, 1000, 100, null, null),
                match(6, 420, "self", 157, false, 1, 1, 5, 1000, 100, null, null),
                match(7, 420, "self", 157, false, 1, 1, 5, 1000, 100, null, null),
                match(8, 420, "self", 157, false, 1, 1, 5, 1000, 100, null, null)
        );

        assertThat(tagNames(service.buildTags(context(420), sample(420, zeriWins, zeriWins))))
                .contains("泽丽绝活哥");
        assertThat(tagNames(service.buildTags(context(420), sample(420, yasuoLosses, yasuoLosses))))
                .contains("亚索绝症哥");
    }

    @Test
    void buildTagsAddsOffroleWhenCurrentPositionDiffersFromDominantHistoryPosition() {
        List<MatchHistory> currentMode = List.of(
                match(1, 420, "self", 11, true, 1, 1, 1, 1000, 100, "MIDDLE", null),
                match(2, 420, "self", 12, true, 1, 1, 1, 1000, 100, "MIDDLE", null),
                match(3, 420, "self", 13, true, 1, 1, 1, 1000, 100, "MIDDLE", null),
                match(4, 420, "self", 14, true, 1, 1, 1, 1000, 100, "MIDDLE", null),
                match(5, 420, "self", 15, true, 1, 1, 1, 1000, 100, "TOP", null)
        );

        ScoutTagContext context = ScoutTagContext.builder()
                .puuid("self")
                .currentQueueId(420)
                .currentPosition("TOP")
                .currentTeamPuuids(List.of("self"))
                .build();

        assertThat(tagNames(service.buildTags(context, sample(420, currentMode, currentMode))))
                .contains("补位");
    }

    @Test
    void buildTagsAddsOffroleAtExactReliableHistoryThreshold() {
        List<MatchHistory> currentMode = List.of(
                match(1, 420, "self", 11, true, 1, 1, 1, 1000, 100, "TOP", null),
                match(2, 420, "self", 12, true, 1, 1, 1, 1000, 100, "TOP", null),
                match(3, 420, "self", 13, true, 1, 1, 1, 1000, 100, "TOP", null),
                match(4, 420, "self", 14, true, 1, 1, 1, 1000, 100, "MIDDLE", null)
        );

        List<RankTag> tags = service.buildTags(context(420, "JUNGLE"), sample(420, currentMode, currentMode));

        assertThat(tagNames(tags)).contains("补位");
        assertThat(tags.stream()
                .filter(tag -> "补位".equals(tag.getTagName()))
                .map(RankTag::getTagDesc))
                .contains("本局位置和近期常玩位置不一致，可能是补位。");
    }

    @Test
    void buildTagsDoesNotAddOffroleWhenCurrentPositionMatchesMainHistoryPosition() {
        List<MatchHistory> currentMode = List.of(
                match(1, 420, "self", 11, true, 1, 1, 1, 1000, 100, "TOP", null),
                match(2, 420, "self", 12, true, 1, 1, 1, 1000, 100, "TOP", null),
                match(3, 420, "self", 13, true, 1, 1, 1, 1000, 100, "TOP", null),
                match(4, 420, "self", 14, true, 1, 1, 1, 1000, 100, "TOP", null)
        );

        assertThat(tagNames(service.buildTags(context(420, "TOP"), sample(420, currentMode, currentMode))))
                .doesNotContain("补位");
    }

    @Test
    void buildTagsDoesNotAddOffroleWhenReliableHistoryPositionsAreFewerThanFour() {
        List<MatchHistory> currentMode = List.of(
                match(1, 420, "self", 11, true, 1, 1, 1, 1000, 100, "TOP", null),
                match(2, 420, "self", 12, true, 1, 1, 1, 1000, 100, "TOP", null),
                match(3, 420, "self", 13, true, 1, 1, 1, 1000, 100, "TOP", null)
        );

        assertThat(tagNames(service.buildTags(context(420, "JUNGLE"), sample(420, currentMode, currentMode))))
                .doesNotContain("补位");
    }

    @Test
    void buildTagsDoesNotAddOffroleForModesWithoutFixedPositions() {
        List<MatchHistory> hexAram = List.of(
                match(1, 2400, "self", 11, true, 1, 1, 1, 1000, 100, "TOP", null),
                match(2, 2400, "self", 12, true, 1, 1, 1, 1000, 100, "TOP", null),
                match(3, 2400, "self", 13, true, 1, 1, 1, 1000, 100, "TOP", null),
                match(4, 2400, "self", 14, true, 1, 1, 1, 1000, 100, "TOP", null)
        );
        List<MatchHistory> aram = List.of(
                match(5, 450, "self", 11, true, 1, 1, 1, 1000, 100, "TOP", null),
                match(6, 450, "self", 12, true, 1, 1, 1, 1000, 100, "TOP", null),
                match(7, 450, "self", 13, true, 1, 1, 1, 1000, 100, "TOP", null),
                match(8, 450, "self", 14, true, 1, 1, 1, 1000, 100, "TOP", null)
        );

        assertThat(tagNames(service.buildTags(context(2400, "JUNGLE"), sample(2400, hexAram, hexAram))))
                .doesNotContain("补位");
        assertThat(tagNames(service.buildTags(context(450, "JUNGLE"), sample(450, aram, aram))))
                .doesNotContain("补位");
    }

    @Test
    void buildTagsDoesNotAddOffroleWhenCurrentPositionIsUnknown() {
        List<MatchHistory> currentMode = List.of(
                match(1, 420, "self", 11, true, 1, 1, 1, 1000, 100, "TOP", null),
                match(2, 420, "self", 12, true, 1, 1, 1, 1000, 100, "TOP", null),
                match(3, 420, "self", 13, true, 1, 1, 1, 1000, 100, "TOP", null),
                match(4, 420, "self", 14, true, 1, 1, 1, 1000, 100, "TOP", null)
        );

        assertThat(tagNames(service.buildTags(context(420, "UNKNOWN"), sample(420, currentMode, currentMode))))
                .doesNotContain("补位");
    }

    @Test
    void buildTagsUsesIndividualPositionWhenTeamPositionIsInvalidForOffrole() {
        List<MatchHistory> currentMode = List.of(
                matchWithPositions(1, "UNKNOWN", "TOP"),
                matchWithPositions(2, "UNKNOWN", "TOP"),
                matchWithPositions(3, "UNKNOWN", "TOP"),
                matchWithPositions(4, "UNKNOWN", "MIDDLE")
        );

        assertThat(tagNames(service.buildTags(context(420, "JUNGLE"), sample(420, currentMode, currentMode))))
                .contains("补位");
    }

    @Test
    void buildTagsDoesNotDuplicateOffroleTag() {
        List<MatchHistory> currentMode = List.of(
                match(1, 420, "self", 11, true, 1, 1, 1, 1000, 100, "TOP", null),
                match(2, 420, "self", 12, true, 1, 1, 1, 1000, 100, "TOP", null),
                match(3, 420, "self", 13, true, 1, 1, 1, 1000, 100, "TOP", null),
                match(4, 420, "self", 14, true, 1, 1, 1, 1000, 100, "TOP", null)
        );

        assertThat(tagNames(service.buildTags(context(420, "JUNGLE"), sample(420, currentMode, currentMode)))
                .stream()
                .filter("补位"::equals))
                .hasSize(1);
    }

    @Test
    void buildTagsDoesNotTriggerOffroleOrLaneTagsWhenFieldsAreMissing() {
        List<MatchHistory> currentMode = List.of(
                match(1, 420, "self", 11, true, 1, 1, 1, 1000, 100, null, null),
                match(2, 420, "self", 12, true, 1, 1, 1, 1000, 100, null, null),
                match(3, 420, "self", 13, true, 1, 1, 1, 1000, 100, null, null),
                match(4, 420, "self", 14, true, 1, 1, 1, 1000, 100, null, null)
        );

        List<String> tagNames = tagNames(service.buildTags(context(420), sample(420, currentMode, currentMode)));

        assertThat(tagNames).doesNotContain("补位", "对线压制", "对线风险");
    }

    @Test
    void buildTagsAddsLanePressureForTopWhenHalfReliableSamePositionSamplesHaveLargeAdvantage() {
        List<MatchHistory> currentMode = laneSamples(1, 420, "TOP",
                800, 750, 900, 1000,
                -750,
                0, 200, -200);

        List<RankTag> tags = service.buildTags(context(420, "TOP"), sample(420, currentMode, currentMode));

        assertThat(tagNames(tags)).contains(LANE_PRESSURE_TAG);
        assertThat(tagNames(tags)).doesNotContain(LANE_RISK_TAG);
        assertThat(tags.stream()
                .filter(tag -> LANE_PRESSURE_TAG.equals(tag.getTagName()))
                .map(RankTag::getTagDesc))
                .contains("近期在当前分路经常打出对线经济优势。");
    }

    @Test
    void buildTagsAddsLaneRiskForMiddleWhenHalfReliableSamePositionSamplesHaveLargeDeficit() {
        List<MatchHistory> currentMode = laneSamples(1, 420, "MIDDLE",
                -800, -750, -900, -1000,
                750,
                0, 200, -200);

        List<String> tagNames = tagNames(service.buildTags(context(420, "MID"), sample(420, currentMode, currentMode)));

        assertThat(tagNames).contains(LANE_RISK_TAG);
        assertThat(tagNames).doesNotContain(LANE_PRESSURE_TAG);
    }

    @Test
    void buildTagsOnlyUsesHistorySamplesFromCurrentBottomPositionForLaneTags() {
        List<MatchHistory> currentMode = new ArrayList<>();
        currentMode.addAll(laneSamples(1, 420, "BOTTOM", 800, 750, 900, 1000, 0, 200, -200, 100));
        currentMode.addAll(laneSamples(20, 420, "TOP", -900, -900, -900, -900));
        currentMode.addAll(laneSamples(30, 420, "MIDDLE", -900, -900, -900, -900));

        List<String> tagNames = tagNames(service.buildTags(context(420, "ADC"), sample(420, currentMode, currentMode)));

        assertThat(tagNames).contains(LANE_PRESSURE_TAG);
        assertThat(tagNames).doesNotContain(LANE_RISK_TAG);
    }

    @Test
    void buildTagsDoesNotAddLaneTagsWhenReliableSamePositionSamplesAreFewerThanEight() {
        List<MatchHistory> currentMode = laneSamples(1, 420, "TOP", 800, 750, 900, 1000, 0, 200, -200);

        assertThat(tagNames(service.buildTags(context(420, "TOP"), sample(420, currentMode, currentMode))))
                .doesNotContain(LANE_PRESSURE_TAG, LANE_RISK_TAG);
    }

    @Test
    void buildTagsDoesNotAddLaneTagsForModesWithoutFixedLaneMatchups() {
        List<MatchHistory> hexAram = laneSamples(1, 2400, "TOP", 800, 750, 900, 1000, 900, 850, 950, 1000);
        List<MatchHistory> aram = laneSamples(20, 450, "TOP", 800, 750, 900, 1000, 900, 850, 950, 1000);

        assertThat(tagNames(service.buildTags(context(2400, "TOP"), sample(2400, hexAram, hexAram))))
                .doesNotContain(LANE_PRESSURE_TAG, LANE_RISK_TAG);
        assertThat(tagNames(service.buildTags(context(450, "TOP"), sample(450, aram, aram))))
                .doesNotContain(LANE_PRESSURE_TAG, LANE_RISK_TAG);
    }

    @Test
    void buildTagsDoesNotAddLaneTagsForJungleOrSupportCurrentPositions() {
        List<MatchHistory> jungle = laneSamples(1, 420, "JUNGLE", 800, 750, 900, 1000, 900, 850, 950, 1000);
        List<MatchHistory> support = laneSamples(20, 420, "SUPPORT", -800, -750, -900, -1000, -900, -850, -950, -1000);

        assertThat(tagNames(service.buildTags(context(420, "JUNGLE"), sample(420, jungle, jungle))))
                .doesNotContain(LANE_PRESSURE_TAG, LANE_RISK_TAG);
        assertThat(tagNames(service.buildTags(context(420, "UTILITY"), sample(420, support, support))))
                .doesNotContain(LANE_PRESSURE_TAG, LANE_RISK_TAG);
    }

    @Test
    void buildTagsDoesNotAddLaneTagsWhenPressureAndRiskCountsAreTied() {
        List<MatchHistory> currentMode = laneSamples(1, 420, "TOP",
                800, 750, 900, 1000,
                -800, -750, -900, -1000);

        assertThat(tagNames(service.buildTags(context(420, "TOP"), sample(420, currentMode, currentMode))))
                .doesNotContain(LANE_PRESSURE_TAG, LANE_RISK_TAG);
    }

    @Test
    void buildTagsDoesNotAddLaneTagsWithoutReliableFifteenMinuteGoldDiff() {
        List<MatchHistory> currentMode = laneSamples(1, 420, "TOP", null, null, null, null, null, null, null, null);

        assertThat(tagNames(service.buildTags(context(420, "TOP"), sample(420, currentMode, currentMode))))
                .doesNotContain(LANE_PRESSURE_TAG, LANE_RISK_TAG);
    }

    private ScoutTagContext context(int queueId) {
        return context(queueId, "MIDDLE");
    }

    private ScoutTagContext context(int queueId, String currentPosition) {
        return ScoutTagContext.builder()
                .puuid("self")
                .currentQueueId(queueId)
                .currentPosition(currentPosition)
                .currentTeamPuuids(List.of("self"))
                .build();
    }

    private ScoutTagSample sample(int queueId, List<MatchHistory> currentMode, List<MatchHistory> lookback) {
        return ScoutTagSample.builder()
                .puuid("self")
                .currentQueueId(queueId)
                .currentModeMatches(currentMode)
                .lookbackMatches(lookback)
                .source("SGP")
                .build();
    }

    private List<String> tagNames(List<RankTag> tags) {
        return tags.stream().map(RankTag::getTagName).toList();
    }

    private MatchHistory match(long gameId,
                               int queueId,
                               String puuid,
                               int championId,
                               boolean win,
                               int kills,
                               int deaths,
                               int assists,
                               int damage,
                               int teamId,
                               String position,
                               Integer earlyGoldDiff) {
        MatchHistory match = new MatchHistory();
        match.setGameId(gameId);
        match.setQueueId(queueId);
        match.setGameCreation(1_710_000_000_000L - gameId);
        match.setGameDuration(1800);
        match.setParticipants(new ArrayList<>());
        match.setParticipantIdentities(new ArrayList<>());
        addParticipant(match, puuid, 1, teamId, championId, win, position, earlyGoldDiff, kills, deaths, assists, damage);
        return match;
    }

    private MatchHistory matchWithPositions(long gameId, String teamPosition, String individualPosition) {
        MatchHistory match = match(gameId, 420, "self", 11, true, 1, 1, 1, 1000, 100, null, null);
        MatchHistory.Participant participant = match.getParticipants().getFirst();
        participant.setTeamPosition(teamPosition);
        participant.setIndividualPosition(individualPosition);
        return match;
    }

    private List<MatchHistory> laneSamples(long firstGameId, int queueId, String position, Integer... goldDiff15Values) {
        List<MatchHistory> matches = new ArrayList<>();
        for (int index = 0; index < goldDiff15Values.length; index++) {
            matches.add(matchWithGoldDiff15(firstGameId + index, queueId, position, goldDiff15Values[index]));
        }
        return matches;
    }

    private MatchHistory matchWithGoldDiff15(long gameId, int queueId, String position, Integer goldDiff15) {
        MatchHistory match = match(gameId, queueId, "self", 11, true, 1, 1, 1, 1000, 100, position, null);
        match.getParticipants().getFirst().getStats().setGoldDiff15(goldDiff15);
        return match;
    }

    private void addParticipant(MatchHistory match,
                                String puuid,
                                int participantId,
                                int teamId,
                                int championId,
                                boolean win,
                                String position,
                                Integer earlyGoldDiff) {
        addParticipant(match, puuid, participantId, teamId, championId, win, position, earlyGoldDiff, 1, 1, 1, 1000);
    }

    private void addParticipant(MatchHistory match,
                                String puuid,
                                int participantId,
                                int teamId,
                                int championId,
                                boolean win,
                                String position,
                                Integer earlyGoldDiff,
                                int kills,
                                int deaths,
                                int assists,
                                int damage) {
        MatchHistory.Participant participant = new MatchHistory.Participant();
        participant.setParticipantId(participantId);
        participant.setTeamId(teamId);
        participant.setChampionId(championId);
        participant.setTeamPosition(position);
        MatchHistory.Stats stats = new MatchHistory.Stats();
        stats.setWin(win);
        stats.setKills(kills);
        stats.setDeaths(deaths);
        stats.setAssists(assists);
        stats.setTotalDamageDealtToChampions(damage);
        stats.setEarlyGoldDiff(earlyGoldDiff);
        participant.setStats(stats);
        match.getParticipants().add(participant);

        MatchHistory.ParticipantIdentity identity = new MatchHistory.ParticipantIdentity();
        identity.setParticipantId(participantId);
        MatchHistory.Player player = new MatchHistory.Player();
        player.setPuuid(puuid);
        identity.setPlayer(player);
        match.getParticipantIdentities().add(identity);
    }
}
