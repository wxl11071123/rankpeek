package io.rankpeek.service;

import io.rankpeek.model.MatchHistory;
import io.rankpeek.model.MatchHistoryFetchResult;
import io.rankpeek.model.Rank;
import io.rankpeek.model.RankTag;
import io.rankpeek.model.RecordStatus;
import io.rankpeek.model.UserTag;
import io.rankpeek.model.UserTagSummary;
import io.rankpeek.service.matchhistory.MatchHistoryProvider;
import io.rankpeek.service.matchhistory.MatchHistorySource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserTagServiceTest {

    @Mock
    private LcuHttpClient lcuHttpClient;
    @Mock
    private SummonerService summonerService;
    @Mock
    private MatchHistoryService matchHistoryService;
    @Mock
    private MatchHistoryProvider matchHistoryProvider;
    @Mock
    private TagConfigService tagConfigService;
    @Mock
    private RankService rankService;
    @Mock
    private AssetService assetService;

    private UserTagService userTagService;

    @BeforeEach
    void setUp() {
        userTagService = new UserTagService(
                lcuHttpClient,
                summonerService,
                matchHistoryService,
                tagConfigService,
                rankService,
                assetService
        );
    }

    @Test
    void buildSummaryFromPrefetchedData_doesNotLoadGameDetail() {
        mockDefaultTags();
        MatchHistory history = createMatch("self-puuid", 1L, true);

        UserTagSummary summary = userTagService.buildSummaryFromPrefetchedData(
                "self-puuid",
                0,
                null,
                List.of(history)
        );

        assertThat(summary.getRecordStatus()).isEqualTo(RecordStatus.NORMAL);
        assertThat(summary.getRecentData().getSelectWins()).isEqualTo(1);
        assertThat(summary.getTag()).isNotEmpty();
        verifyNoInteractions(lcuHttpClient);
    }

    @Test
    void buildSummaryFromPrefetchedData_usesLatestTwentySoloAndFlexRankedMatchesRegardlessOfMode() {
        mockDefaultTags();
        List<MatchHistory> history = rankedFillSample("self-puuid");

        UserTagSummary summary = userTagService.buildSummaryFromPrefetchedData(
                "self-puuid",
                450,
                null,
                history
        );

        assertThat(summary.getRecordStatus()).isEqualTo(RecordStatus.NORMAL);
        assertThat(summary.getRecentData().getSelectWins()).isEqualTo(20);
        assertThat(summary.getRecentData().getSelectLosses()).isZero();
    }

    @Test
    void buildSummaryFromPrefetchedData_excludesRemakesFromRecentRankedSample() {
        mockDefaultTags();
        List<MatchHistory> history = new ArrayList<>();
        history.add(createMatch("self-puuid", 99L, false, 420, 180, true));
        for (int i = 0; i < 20; i++) {
            history.add(createMatch("self-puuid", 100L + i, true, 420, 1800, false));
        }

        UserTagSummary summary = userTagService.buildSummaryFromPrefetchedData(
                "self-puuid",
                0,
                null,
                history
        );

        assertThat(summary.getRecordStatus()).isEqualTo(RecordStatus.NORMAL);
        assertThat(summary.getRecentData().getSelectWins()).isEqualTo(20);
        assertThat(summary.getRecentData().getSelectLosses()).isZero();
    }

    @Test
    void buildSummaryFromPrefetchedData_returnsEmptyForEmptyPrefetchedMatches() {
        UserTagSummary summary = userTagService.buildSummaryFromPrefetchedData(
                "self-puuid",
                0,
                null,
                List.of()
        );

        assertThat(summary.getRecordStatus()).isEqualTo(RecordStatus.EMPTY);
        assertThat(summary.getRecentData().getSelectWins()).isNull();
        assertThat(summary.getRecentData().getSelectLosses()).isNull();
        assertThat(summary.getTag()).isEmpty();
    }

    @Test
    void buildSummaryFromPrefetchedData_returnsCasualPlayerTagWhenLookbackHasNoRankedSample() {
        List<MatchHistory> history = new ArrayList<>();
        for (int i = 0; i < 50; i++) {
            history.add(createMatch("self-puuid", 5000L - i, true, 450, 1800, false));
        }

        UserTagSummary summary = userTagService.buildSummaryFromPrefetchedData(
                "self-puuid",
                0,
                null,
                history
        );

        assertThat(summary.getRecordStatus()).isEqualTo(RecordStatus.NORMAL);
        assertThat(summary.getRecentData().getSelectWins()).isNull();
        assertThat(summary.getRecentData().getSelectLosses()).isNull();
        assertThat(summary.getTag())
                .extracting(RankTag::getTagName)
                .containsExactly("娱乐玩家");
        assertThat(summary.getTag().getFirst().getGood()).isTrue();
    }

    @Test
    void buildSummaryFromPrefetchedData_returnsNormalOnlyWhenRankedSampleHasMatches() {
        mockDefaultTags();
        List<MatchHistory> history = new ArrayList<>();
        for (int i = 0; i < 20; i++) {
            history.add(createMatch("self-puuid", 6000L - i, true, i % 2 == 0 ? 420 : 440, 1800, false));
        }
        for (int i = 0; i < 30; i++) {
            history.add(createMatch("self-puuid", 5900L - i, false, 450, 1800, false));
        }

        UserTagSummary summary = userTagService.buildSummaryFromPrefetchedData(
                "self-puuid",
                0,
                null,
                history
        );

        assertThat(summary.getRecordStatus()).isEqualTo(RecordStatus.NORMAL);
        assertThat(summary.getRecentData().getSelectWins()).isEqualTo(20);
        assertThat(summary.getRecentData().getSelectLosses()).isZero();
        assertThat(summary.getTag()).isNotEmpty();
    }

    @Test
    void buildSummaryFromPrefetchedData_filtersIncompleteCurrentPlayerStatsBeforeSampling() {
        mockDefaultTags();
        List<MatchHistory> history = new ArrayList<>();
        MatchHistory incomplete = createMatch("self-puuid", 7000L, false, 420, 1800, false);
        incomplete.getParticipants().get(0).setStats(new MatchHistory.Stats());
        history.add(incomplete);
        history.add(createMatch("self-puuid", 6999L, true, 420, 1800, false));

        UserTagSummary summary = userTagService.buildSummaryFromPrefetchedData(
                "self-puuid",
                0,
                null,
                history
        );

        assertThat(summary.getRecordStatus()).isEqualTo(RecordStatus.NORMAL);
        assertThat(summary.getRecentData().getSelectWins()).isEqualTo(1);
        assertThat(summary.getRecentData().getSelectLosses()).isZero();
    }

    @Test
    void getUserTagSummaryBatch_deduplicatesRequestsAndReturnsStatuses() {
        mockDefaultTags();

        MatchHistoryFetchResult normalResult = MatchHistoryFetchResult.builder()
                .matches(List.of(createMatch("dup-puuid", 7L, true)))
                .rawEmpty(false)
                .build();
        MatchHistoryFetchResult privateResult = MatchHistoryFetchResult.builder()
                .matches(List.of())
                .rawEmpty(true)
                .build();
        MatchHistoryFetchResult emptyResult = MatchHistoryFetchResult.builder()
                .matches(List.of())
                .rawEmpty(true)
                .build();

        MatchHistoryService statusResolver = new MatchHistoryService(matchHistoryProvider);

        when(rankService.getRankByPuuid("dup-puuid")).thenReturn(null);
        when(rankService.getRankByPuuid("private-puuid")).thenReturn(createRankWithGames());
        when(rankService.getRankByPuuid("empty-puuid")).thenReturn(null);
        when(rankService.getRankByPuuid("error-puuid")).thenReturn(null);

        when(matchHistoryService.getMatchHistory("dup-puuid", 0, 49, false, MatchHistorySource.CACHE))
                .thenReturn(normalResult.getMatches());
        when(matchHistoryService.getMatchHistory("private-puuid", 0, 49, false, MatchHistorySource.CACHE))
                .thenReturn(List.of());
        when(matchHistoryService.getMatchHistory("empty-puuid", 0, 49, false, MatchHistorySource.CACHE))
                .thenReturn(List.of());
        when(matchHistoryService.getMatchHistory("error-puuid", 0, 49, false, MatchHistorySource.CACHE))
                .thenReturn(List.of());
        when(matchHistoryService.getMatchHistory("private-puuid", 0, 49, 50)).thenReturn(privateResult.getMatches());
        when(matchHistoryService.getMatchHistory("empty-puuid", 0, 49, 50)).thenReturn(emptyResult.getMatches());
        when(matchHistoryService.getMatchHistory("error-puuid", 0, 49, 50)).thenThrow(new RuntimeException("boom"));
        when(matchHistoryService.resolveRecordStatus(any(), any()))
                .thenAnswer(invocation -> statusResolver.resolveRecordStatus(
                        invocation.getArgument(0),
                        invocation.getArgument(1)
                ));

        Map<String, UserTagSummary> summaries = userTagService.getUserTagSummaryBatch(
                List.of("dup-puuid", "dup-puuid", "private-puuid", "empty-puuid", "error-puuid"),
                420
        );

        assertThat(summaries).hasSize(4);
        assertThat(summaries.get("dup-puuid").getRecordStatus()).isEqualTo(RecordStatus.NORMAL);
        assertThat(summaries.get("private-puuid").getRecordStatus()).isEqualTo(RecordStatus.PRIVATE);
        assertThat(summaries.get("empty-puuid").getRecordStatus()).isEqualTo(RecordStatus.EMPTY);
        assertThat(summaries.get("error-puuid").getRecordStatus()).isEqualTo(RecordStatus.ERROR);

        verify(matchHistoryService, times(1))
                .getMatchHistory("dup-puuid", 0, 49, false, MatchHistorySource.CACHE);
        verify(matchHistoryService, never()).getMatchHistory("dup-puuid", 0, 49, 50);
    }

    @Test
    void getUserTagSummaryByPuuid_prefersCachedFiftyGameLookbackBeforeRemoteFetch() {
        mockDefaultTags();
        List<MatchHistory> cachedHistory = List.of(createMatch("cache-puuid", 7L, true));

        when(rankService.getRankByPuuid("cache-puuid")).thenReturn(null);
        when(matchHistoryService.getMatchHistory("cache-puuid", 0, 49, false, MatchHistorySource.CACHE))
                .thenReturn(cachedHistory);
        when(matchHistoryService.resolveRecordStatus(any(), any())).thenReturn(RecordStatus.NORMAL);

        UserTagSummary summary = userTagService.getUserTagSummaryByPuuid("cache-puuid", 0);

        assertThat(summary.getRecordStatus()).isEqualTo(RecordStatus.NORMAL);
        assertThat(summary.getRecentData().getSelectWins()).isEqualTo(1);
        verify(matchHistoryService).getMatchHistory("cache-puuid", 0, 49, false, MatchHistorySource.CACHE);
        verify(matchHistoryService, never()).getMatchHistory("cache-puuid", 0, 49, 50);
        verify(matchHistoryService, never()).getMatchHistory("cache-puuid", 0, 199, 200);
    }

    @Test
    void getUserTagSummaryByPuuid_fallsBackToRemoteFiftyGameLookbackWhenCacheIsEmpty() {
        mockDefaultTags();
        List<MatchHistory> remoteHistory = rankedFillSample("remote-puuid");

        when(rankService.getRankByPuuid("remote-puuid")).thenReturn(null);
        when(matchHistoryService.getMatchHistory("remote-puuid", 0, 49, false, MatchHistorySource.CACHE))
                .thenReturn(List.of());
        when(matchHistoryService.getMatchHistory("remote-puuid", 0, 49, 50)).thenReturn(remoteHistory);
        when(matchHistoryService.resolveRecordStatus(any(), any())).thenReturn(RecordStatus.NORMAL);

        UserTagSummary summary = userTagService.getUserTagSummaryByPuuid("remote-puuid", 0);

        assertThat(summary.getRecordStatus()).isEqualTo(RecordStatus.NORMAL);
        assertThat(summary.getRecentData().getSelectWins()).isEqualTo(20);
        verify(matchHistoryService).getMatchHistory("remote-puuid", 0, 49, false, MatchHistorySource.CACHE);
        verify(matchHistoryService).getMatchHistory("remote-puuid", 0, 49, 50);
        verify(matchHistoryService, never()).getMatchHistory("remote-puuid", 0, 199, 200);
    }

    @Test
    void getUserTagSummaryBatch_returnsEmptyMapForEmptyInput() {
        Map<String, UserTagSummary> summaries = userTagService.getUserTagSummaryBatch(List.of(), 0);

        assertThat(summaries).isEmpty();
        verifyNoInteractions(matchHistoryService, rankService);
    }

    @Test
    void getUserTagByPuuid_handlesNullRelationshipWinFlags() {
        mockDefaultTags();
        List<MatchHistory> history = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            MatchHistory match = createMatch("self-puuid", 200L + i, true);
            match.getParticipants().get(2).getStats().setWin(null);
            history.add(match);
        }

        MatchHistoryFetchResult fetchResult = MatchHistoryFetchResult.builder()
                .matches(history)
                .rawEmpty(false)
                .build();

        when(rankService.getRankByPuuid("self-puuid")).thenReturn(null);
        when(matchHistoryService.getMatchHistory("self-puuid", 0, 49, false, MatchHistorySource.CACHE))
                .thenReturn(fetchResult.getMatches());
        when(matchHistoryService.resolveRecordStatus(any(), any())).thenReturn(RecordStatus.NORMAL);

        UserTag tag = userTagService.getUserTagByPuuid("self-puuid", 0);

        assertThat(tag.getRecordStatus()).isEqualTo(RecordStatus.NORMAL);
        assertThat(tag.getTag()).isNotEmpty();
    }

    @Test
    void getUserTagByPuuid_fetchesAtMostFiftyRecentGamesAndBuildsRecentTwentyRankedSample() {
        mockDefaultTags();
        List<MatchHistory> history = rankedFillSample("self-puuid");

        when(rankService.getRankByPuuid("self-puuid")).thenReturn(null);
        when(matchHistoryService.getMatchHistory("self-puuid", 0, 49, false, MatchHistorySource.CACHE))
                .thenReturn(List.of());
        when(matchHistoryService.getMatchHistory("self-puuid", 0, 49, 50)).thenReturn(history);
        when(matchHistoryService.resolveRecordStatus(any(), any())).thenReturn(RecordStatus.NORMAL);

        UserTag tag = userTagService.getUserTagByPuuid("self-puuid", 450);

        assertThat(tag.getRecentData().getSelectWins()).isEqualTo(20);
        assertThat(tag.getRecentData().getSelectLosses()).isZero();
        verify(matchHistoryService).getMatchHistory("self-puuid", 0, 49, false, MatchHistorySource.CACHE);
        verify(matchHistoryService).getMatchHistory("self-puuid", 0, 49, 50);
        verify(matchHistoryService, never()).getFilteredMatchHistory(
                anyString(),
                anyInt(),
                anyInt(),
                any(),
                any(),
                anyInt(),
                anyBoolean()
        );
        verify(matchHistoryService, times(0)).getMatchHistoryFetchResult("self-puuid");
    }

    @Test
    void buildSummaryFromPrefetchedData_usesOnlyRecentFiftyThenLatestTwentyRankedMatches() {
        mockDefaultTags();
        List<MatchHistory> history = new ArrayList<>();
        for (int i = 0; i < 12; i++) {
            history.add(createMatch("self-puuid", 1000L - i, true, i % 2 == 0 ? 420 : 440, 1800, false));
        }
        for (int i = 0; i < 18; i++) {
            history.add(createMatch("self-puuid", 900L - i, false, 450, 1800, false));
        }
        for (int i = 0; i < 10; i++) {
            history.add(createMatch("self-puuid", 800L - i, false, 420, 180, true));
        }
        for (int i = 0; i < 10; i++) {
            history.add(createMatch("self-puuid", 700L - i, false, 420, 240, false));
        }
        for (int i = 0; i < 20; i++) {
            history.add(createMatch("self-puuid", 600L - i, false, 420, 1800, false));
        }

        UserTagSummary summary = userTagService.buildSummaryFromPrefetchedData(
                "self-puuid",
                0,
                null,
                history
        );

        assertThat(summary.getRecordStatus()).isEqualTo(RecordStatus.NORMAL);
        assertThat(summary.getRecentData().getSelectWins()).isEqualTo(12);
        assertThat(summary.getRecentData().getSelectLosses()).isZero();
    }

    @Test
    void buildSummaryFromPrefetchedData_fillsRankedSampleFromRecentFiftyNotVisibleTwenty() {
        mockDefaultTags();
        List<MatchHistory> history = new ArrayList<>();
        for (int i = 0; i < 16; i++) {
            history.add(createMatch("self-puuid", 2000L - i, true, i % 2 == 0 ? 420 : 440, 1800, false));
        }
        for (int i = 0; i < 4; i++) {
            history.add(createMatch("self-puuid", 1900L - i, true, 450, 1800, false));
        }
        for (int i = 0; i < 4; i++) {
            history.add(createMatch("self-puuid", 1800L - i, true, 420, 1800, false));
        }
        for (int i = 0; i < 26; i++) {
            history.add(createMatch("self-puuid", 1700L - i, false, 450, 1800, false));
        }

        UserTagSummary summary = userTagService.buildSummaryFromPrefetchedData(
                "self-puuid",
                0,
                null,
                history
        );

        assertThat(summary.getRecordStatus()).isEqualTo(RecordStatus.NORMAL);
        assertThat(summary.getRecentData().getSelectWins()).isEqualTo(20);
        assertThat(summary.getRecentData().getSelectLosses()).isZero();
    }

    @Test
    void buildSummaryFromPrefetchedData_namesSignatureChampionTag() {
        mockDefaultTags();
        when(assetService.getChampionName(92L)).thenReturn("锐雯");
        List<MatchHistory> history = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            history.add(createMatch("self-puuid", 3000L - i, true, 420, 1800, false, 92));
        }

        UserTagSummary summary = userTagService.buildSummaryFromPrefetchedData(
                "self-puuid",
                0,
                null,
                history
        );

        assertThat(summary.getTag())
                .extracting(RankTag::getTagName)
                .contains("锐雯绝活哥")
                .doesNotContain("绝活哥");
        List<String> tagNames = summary.getTag().stream().map(RankTag::getTagName).toList();
        assertThat(tagNames.indexOf("锐雯绝活哥")).isLessThan(tagNames.indexOf("High Win Rate"));
    }

    private List<MatchHistory> rankedFillSample(String selfPuuid) {
        List<MatchHistory> history = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            history.add(createMatch(selfPuuid, 300L + i, true, 420));
        }
        for (int i = 10; i < 14; i++) {
            history.add(createMatch(selfPuuid, 300L + i, false, 2400));
        }
        for (int i = 14; i < 20; i++) {
            history.add(createMatch(selfPuuid, 300L + i, true, 440));
        }
        for (int i = 20; i < 24; i++) {
            history.add(createMatch(selfPuuid, 300L + i, true, 440));
        }
        for (int i = 24; i < 30; i++) {
            history.add(createMatch(selfPuuid, 300L + i, false, 450));
        }
        return history;
    }

    private void mockDefaultTags() {
        when(tagConfigService.evaluateTags(anyList(), anyString(), anyInt())).thenReturn(List.of(
                RankTag.builder()
                        .good(true)
                        .tagName("High Win Rate")
                        .tagDesc("Test tag")
                        .build()
        ));
    }

    private Rank createRankWithGames() {
        Rank rank = new Rank();
        Rank.QueueMap queueMap = new Rank.QueueMap();
        Rank.QueueInfo solo = new Rank.QueueInfo();
        solo.setWins(6);
        solo.setLosses(4);
        queueMap.setRankedSolo5x5(solo);
        rank.setQueueMap(queueMap);
        return rank;
    }

    private MatchHistory createMatch(String selfPuuid, long gameId, boolean selfWin) {
        return createMatch(selfPuuid, gameId, selfWin, 420);
    }

    private MatchHistory createMatch(String selfPuuid, long gameId, boolean selfWin, int queueId) {
        return createMatch(selfPuuid, gameId, selfWin, queueId, 1800, false);
    }

    private MatchHistory createMatch(String selfPuuid,
                                     long gameId,
                                     boolean selfWin,
                                     int queueId,
                                     int gameDuration,
                                     boolean remake) {
        return createMatch(selfPuuid, gameId, selfWin, queueId, gameDuration, remake, 11);
    }

    private MatchHistory createMatch(String selfPuuid,
                                     long gameId,
                                     boolean selfWin,
                                     int queueId,
                                     int gameDuration,
                                     boolean remake,
                                     int championId) {
        MatchHistory history = new MatchHistory();
        history.setGameId(gameId);
        history.setQueueId(queueId);
        history.setGameCreation(1710000000000L + gameId);
        history.setGameDuration(gameDuration);
        history.setRemake(remake);

        MatchHistory.Participant me = new MatchHistory.Participant();
        me.setParticipantId(1);
        me.setTeamId(100);
        me.setChampionId(championId);
        me.setStats(createStats(selfWin, 10, 2, 8, 12000, 18000, 11000));

        MatchHistory.Participant teammate = new MatchHistory.Participant();
        teammate.setParticipantId(2);
        teammate.setTeamId(100);
        teammate.setChampionId(22);
        teammate.setStats(createStats(selfWin, 4, 5, 9, 9800, 12000, 15000));

        MatchHistory.Participant enemy = new MatchHistory.Participant();
        enemy.setParticipantId(3);
        enemy.setTeamId(200);
        enemy.setChampionId(55);
        enemy.setStats(createStats(!selfWin, 6, 6, 4, 10200, 14000, 10000));

        history.setParticipants(List.of(me, teammate, enemy));

        MatchHistory.ParticipantIdentity meIdentity = new MatchHistory.ParticipantIdentity();
        meIdentity.setParticipantId(1);
        meIdentity.setPlayer(createPlayer(selfPuuid, "Self"));

        MatchHistory.ParticipantIdentity teammateIdentity = new MatchHistory.ParticipantIdentity();
        teammateIdentity.setParticipantId(2);
        teammateIdentity.setPlayer(createPlayer("friend-puuid", "Friend"));

        MatchHistory.ParticipantIdentity enemyIdentity = new MatchHistory.ParticipantIdentity();
        enemyIdentity.setParticipantId(3);
        enemyIdentity.setPlayer(createPlayer("enemy-puuid", "Enemy"));

        history.setParticipantIdentities(List.of(meIdentity, teammateIdentity, enemyIdentity));
        return history;
    }

    private MatchHistory.Stats createStats(boolean win,
                                           int kills,
                                           int deaths,
                                           int assists,
                                           int gold,
                                           int damage,
                                           int taken) {
        MatchHistory.Stats stats = new MatchHistory.Stats();
        stats.setWin(win);
        stats.setKills(kills);
        stats.setDeaths(deaths);
        stats.setAssists(assists);
        stats.setGoldEarned(gold);
        stats.setTotalDamageDealtToChampions(damage);
        stats.setTotalDamageTaken(taken);
        stats.setTotalHeal(2000);
        stats.setTotalMinionsKilled(150);
        stats.setNeutralMinionsKilled(12);
        return stats;
    }

    private MatchHistory.Player createPlayer(String puuid, String gameName) {
        MatchHistory.Player player = new MatchHistory.Player();
        player.setPuuid(puuid);
        player.setGameName(gameName);
        player.setTagLine("CN1");
        player.setSummonerName(gameName);
        return player;
    }
}
