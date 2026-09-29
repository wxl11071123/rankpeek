package io.rankpeek.service;

import io.rankpeek.cache.MatchHistoryCacheRepository;
import io.rankpeek.model.GameDetail;
import io.rankpeek.model.MatchHistory;
import io.rankpeek.model.MatchHistoryFetchResult;
import io.rankpeek.service.matchhistory.MatchHistoryProvider;
import io.rankpeek.service.matchhistory.MatchHistoryQueryOptions;
import io.rankpeek.service.matchhistory.MatchHistorySource;
import com.github.benmanes.caffeine.cache.Cache;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MatchHistoryServiceCacheTest {

    @Mock
    private MatchHistoryProvider matchHistoryProvider;
    @Mock
    private MatchHistoryCacheRepository repository;

    private MatchHistoryService service;

    @BeforeEach
    void setUp() {
        service = new MatchHistoryService(matchHistoryProvider, repository);
        service.init();
    }

    @Test
    void getMatchHistoryFetchResult_usesDatabaseOnMemoryMiss() {
        when(repository.findRecentMatchHistory("puuid-1", 50))
                .thenReturn(Optional.of(MatchHistoryFetchResult.builder()
                        .matches(createMatches(1L, 50))
                        .rawEmpty(false)
                        .build()));

        MatchHistoryFetchResult result = service.getMatchHistoryFetchResult("puuid-1", false);

        assertThat(result.getMatches()).hasSize(50);
        assertThat(result.getMatches()).first().extracting(MatchHistory::getGameId).isEqualTo(1L);
        verify(matchHistoryProvider, never()).fetchMatchHistory(any(String.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getMatchHistoryFetchResult_cacheSourceReadsDatabaseWithoutProvider() {
        MatchHistory cachedMatch = createMatch(4L);
        when(repository.findRecentMatchHistory("puuid-1", 50))
                .thenReturn(Optional.of(MatchHistoryFetchResult.builder()
                        .matches(List.of(cachedMatch))
                        .rawEmpty(false)
                        .build()));

        MatchHistoryFetchResult result = service.getMatchHistoryFetchResult("puuid-1", false, MatchHistorySource.CACHE);

        assertThat(result.getMatches()).extracting(MatchHistory::getGameId).containsExactly(4L);
        verify(matchHistoryProvider, never()).fetchMatchHistory(any(String.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getMatchHistoryFetchResult_forceRefreshFetchesProviderAndSavesDatabase() {
        when(matchHistoryProvider.fetchMatchHistory("puuid-1", options(MatchHistorySource.AUTO, true)))
                .thenReturn(MatchHistoryFetchResult.builder()
                        .matches(List.of(createMatch(2L)))
                        .rawEmpty(false)
                        .build());

        MatchHistoryFetchResult result = service.getMatchHistoryFetchResult("puuid-1", true);

        assertThat(result.getMatches()).extracting(MatchHistory::getGameId).containsExactly(2L);
        verify(repository).saveMatchHistory(eq("puuid-1"), any());
    }

    @Test
    void getMatchHistoryFetchResult_forceRefreshFallsBackToDatabaseWhenLcuFails() {
        MatchHistory staleMatch = createMatch(3L);
        when(repository.findRecentMatchHistory("puuid-1", 50))
                .thenReturn(Optional.of(MatchHistoryFetchResult.builder()
                        .matches(List.of(staleMatch))
                        .rawEmpty(false)
                        .build()));
        when(matchHistoryProvider.fetchMatchHistory("puuid-1", options(MatchHistorySource.AUTO, true)))
                .thenThrow(new RuntimeException("LCU down"));

        MatchHistoryFetchResult result = service.getMatchHistoryFetchResult("puuid-1", true);

        assertThat(result.getMatches()).extracting(MatchHistory::getGameId).containsExactly(3L);
    }

    @Test
    void autoSourceUsesDatabaseBeforeLcuWhenSgpFails() {
        MatchHistoryProvider lcuProvider = mock(MatchHistoryProvider.class);
        MatchHistoryProvider sgpProvider = mock(MatchHistoryProvider.class);
        when(lcuProvider.source()).thenReturn(MatchHistorySource.LCU);
        when(sgpProvider.source()).thenReturn(MatchHistorySource.SGP);
        MatchHistoryService sourceAwareService = new MatchHistoryService(List.of(lcuProvider, sgpProvider), repository);
        sourceAwareService.init();

        MatchHistory cachedMatch = createMatch(30L);
        when(sgpProvider.supports(options(MatchHistorySource.AUTO, false))).thenReturn(true);
        when(sgpProvider.fetchMatchHistory("puuid-1", options(MatchHistorySource.AUTO, false)))
                .thenThrow(new RuntimeException("SGP down"));
        when(repository.findRecentMatchHistory("puuid-1", 50))
                .thenReturn(Optional.empty())
                .thenReturn(Optional.of(MatchHistoryFetchResult.builder()
                        .matches(List.of(cachedMatch))
                        .rawEmpty(false)
                        .build()));

        MatchHistoryFetchResult result = sourceAwareService.getMatchHistoryFetchResult("puuid-1", false);

        assertThat(result.getMatches()).extracting(MatchHistory::getGameId).containsExactly(30L);
        verify(sgpProvider, times(3)).fetchMatchHistory("puuid-1", options(MatchHistorySource.AUTO, false));
        verify(lcuProvider, never()).fetchMatchHistory(any(String.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getGameDetailById_usesDatabaseBeforeLcu() {
        GameDetail cached = createDetail(99L);
        GameDetail.TeamObjectiveSummary objectiveSummary = new GameDetail.TeamObjectiveSummary();
        objectiveSummary.setTeamId(100);
        cached.setTeamObjectives(List.of(objectiveSummary));
        when(repository.findGameDetail(99L)).thenReturn(Optional.of(cached));

        GameDetail result = service.getGameDetailById(99L);

        assertThat(result).isSameAs(cached);
        verify(matchHistoryProvider, never()).fetchGameDetail(eq(99L), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getMatchHistory_hydratesOnlyVisibleIncompleteRostersAndSavesHydratedCache() {
        List<MatchHistory> cachedMatches = new ArrayList<>();
        for (long gameId = 1; gameId <= 50; gameId++) {
            cachedMatches.add(createIncompleteMatch(gameId, "puuid-1"));
        }
        when(repository.findRecentMatchHistory("puuid-1", 50))
                .thenReturn(Optional.of(MatchHistoryFetchResult.builder()
                        .matches(cachedMatches)
                        .rawEmpty(false)
                .build()));
        when(repository.findGameDetail(anyLong())).thenReturn(Optional.empty());
        when(matchHistoryProvider.fetchGameDetail(anyLong(), any(MatchHistoryQueryOptions.class)))
                .thenAnswer(invocation -> createDetail(invocation.getArgument(0)));

        List<MatchHistory> result = service.getMatchHistory("puuid-1", 0, 9, false);

        assertThat(result).hasSize(10);
        assertThat(result)
                .allSatisfy(match -> {
                    assertThat(match.getParticipants()).hasSize(10);
                    assertThat(match.getParticipantIdentities()).hasSize(10);
                });
        verify(matchHistoryProvider, times(10)).fetchGameDetail(anyLong(), any(MatchHistoryQueryOptions.class));
        verify(matchHistoryProvider, never()).fetchGameDetail(eq(11L), any(MatchHistoryQueryOptions.class));
        verify(matchHistoryProvider, never()).fetchGameDetail(eq(12L), any(MatchHistoryQueryOptions.class));
        verify(repository).saveMatchHistory(eq("puuid-1"), argThat(matches ->
                matches.size() == 50
                        && matches.get(0).getParticipants().size() == 10
                        && matches.get(9).getParticipantIdentities().size() == 10
                        && matches.get(10).getParticipants().size() == 1
                ));
    }

    @Test
    void getMatchHistory_hydratesVisibleRosterWhenCurrentPuuidIsMissingFromSummaryIdentities() {
        List<MatchHistory> cachedMatches = new ArrayList<>();
        cachedMatches.add(createCompleteMatchWithoutCurrentPuuid(41L));
        cachedMatches.addAll(createMatches(42L, 49, "puuid-1"));
        when(repository.findRecentMatchHistory("puuid-1", 50))
                .thenReturn(Optional.of(MatchHistoryFetchResult.builder()
                        .matches(cachedMatches)
                        .rawEmpty(false)
                        .build()));
        when(repository.findGameDetail(41L)).thenReturn(Optional.empty());
        when(matchHistoryProvider.fetchGameDetail(eq(41L), any(MatchHistoryQueryOptions.class)))
                .thenReturn(createDetail(41L));

        List<MatchHistory> result = service.getMatchHistory("puuid-1", 0, 0, false);

        assertThat(result).hasSize(1);
        assertThat(result.getFirst().getParticipantIdentities())
                .anySatisfy(identity -> assertThat(identity.getPlayer().getPuuid()).isEqualTo("puuid-1"));
        assertThat(result.getFirst().getParticipants())
                .anySatisfy(participant -> {
                    assertThat(participant.getParticipantId()).isEqualTo(1);
                    assertThat(participant.getStats().getWin()).isTrue();
                    assertThat(participant.getStats().getKills()).isEqualTo(1);
                });
        verify(matchHistoryProvider).fetchGameDetail(eq(41L), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getFilteredMatchHistory_hydratesSlicedFilteredMatches() {
        List<MatchHistory> cachedMatches = new ArrayList<>(List.of(
                createIncompleteMatch(21L, "puuid-1", 420, 11),
                createIncompleteMatch(22L, "puuid-1", 420, 22),
                createIncompleteMatch(23L, "puuid-1", 420, 22)
        ));
        for (long gameId = 24L; gameId <= 70L; gameId++) {
            cachedMatches.add(createIncompleteMatch(gameId, "puuid-1", 430, 99));
        }
        when(repository.findRecentMatchHistory("puuid-1", 50))
                .thenReturn(Optional.of(MatchHistoryFetchResult.builder()
                        .matches(cachedMatches)
                        .rawEmpty(false)
                .build()));
        when(repository.findGameDetail(anyLong())).thenReturn(Optional.empty());
        when(matchHistoryProvider.fetchGameDetail(anyLong(), any(MatchHistoryQueryOptions.class)))
                .thenAnswer(invocation -> createDetail(invocation.getArgument(0)));

        List<MatchHistory> result = service.getFilteredMatchHistory("puuid-1", 0, 9, 420, 22, 10, false);

        assertThat(result).extracting(MatchHistory::getGameId).containsExactly(22L, 23L);
        assertThat(result)
                .allSatisfy(match -> {
                    assertThat(match.getParticipants()).hasSize(10);
                    assertThat(match.getParticipantIdentities()).hasSize(10);
                });
        verify(matchHistoryProvider, times(2)).fetchGameDetail(anyLong(), any(MatchHistoryQueryOptions.class));
        verify(matchHistoryProvider, never()).fetchGameDetail(eq(21L), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void matchHistoryCache_evictsLargePageResultsByMatchCountWeight() throws Exception {
        MatchHistoryProvider sgpProvider = mock(MatchHistoryProvider.class);
        when(sgpProvider.source()).thenReturn(MatchHistorySource.SGP);
        MatchHistoryService weightedService = new MatchHistoryService(sgpProvider);
        weightedService.init();

        for (int playerIndex = 1; playerIndex <= 11; playerIndex++) {
            String puuid = "puuid-" + playerIndex;
            when(sgpProvider.fetchMatchHistory(eq(puuid), any(MatchHistoryQueryOptions.class)))
                    .thenReturn(MatchHistoryFetchResult.builder()
                            .matches(createMatches(playerIndex * 1000L, 200, puuid))
                            .rawEmpty(false)
                            .build());
            weightedService.getMatchHistoryPage(puuid, 1, 200, "sgp", null, null, false, null);
        }

        cleanUpMatchHistoryCache(weightedService);
        weightedService.getMatchHistoryPage("puuid-1", 1, 200, "sgp", null, null, false, null);

        verify(sgpProvider, times(2)).fetchMatchHistory(eq("puuid-1"), any(MatchHistoryQueryOptions.class));
    }

    private MatchHistory createMatch(long gameId) {
        MatchHistory match = new MatchHistory();
        match.setGameId(gameId);
        match.setGameCreation(1710000000000L + gameId);
        return match;
    }

    private List<MatchHistory> createMatches(long firstGameId, int count) {
        return createMatches(firstGameId, count, "player-1");
    }

    private List<MatchHistory> createMatches(long firstGameId, int count, String currentPuuid) {
        List<MatchHistory> matches = new ArrayList<>();
        for (int index = 0; index < count; index++) {
            MatchHistory match = createMatch(firstGameId + index);
            List<MatchHistory.Participant> participants = new ArrayList<>();
            List<MatchHistory.ParticipantIdentity> identities = new ArrayList<>();
            for (int participantId = 1; participantId <= 10; participantId++) {
                participants.add(createParticipant(participantId, participantId <= 5 ? 100 : 200, 100 + participantId));
                identities.add(createIdentity(participantId, participantId == 1 ? currentPuuid : "player-" + participantId));
            }
            match.setParticipants(participants);
            match.setParticipantIdentities(identities);
            matches.add(match);
        }
        return matches;
    }

    private MatchHistoryQueryOptions options(MatchHistorySource source, boolean forceRefresh) {
        return new MatchHistoryQueryOptions(
                0,
                99,
                null,
                null,
                50,
                forceRefresh,
                source,
                null,
                null
        );
    }

    @SuppressWarnings("unchecked")
    private void cleanUpMatchHistoryCache(MatchHistoryService service) throws Exception {
        var field = MatchHistoryService.class.getDeclaredField("matchHistoryCache");
        field.setAccessible(true);
        ((Cache<String, MatchHistoryFetchResult>) field.get(service)).cleanUp();
    }

    private MatchHistory createIncompleteMatch(long gameId, String targetPuuid) {
        return createIncompleteMatch(gameId, targetPuuid, 420, 101);
    }

    private MatchHistory createIncompleteMatch(long gameId, String targetPuuid, int queueId, int championId) {
        MatchHistory match = createMatch(gameId);
        match.setQueueId(queueId);
        match.setParticipants(List.of(createParticipant(1, 100, championId)));
        match.setParticipantIdentities(List.of(createIdentity(1, targetPuuid)));
        return match;
    }

    private MatchHistory createCompleteMatchWithoutCurrentPuuid(long gameId) {
        MatchHistory match = createMatch(gameId);
        match.setQueueId(420);
        List<MatchHistory.Participant> participants = new ArrayList<>();
        List<MatchHistory.ParticipantIdentity> identities = new ArrayList<>();
        for (int participantId = 1; participantId <= 10; participantId++) {
            participants.add(createParticipant(participantId, participantId <= 5 ? 100 : 200, 100 + participantId));
            identities.add(createIdentity(participantId, "summary-player-" + participantId));
        }
        match.setParticipants(participants);
        match.setParticipantIdentities(identities);
        return match;
    }

    private GameDetail createDetail(long gameId) {
        GameDetail detail = new GameDetail();
        detail.setGameId(gameId);
        detail.setQueueId(420);
        detail.setGameCreation(1710000000000L + gameId);
        detail.setGameDuration(1800L);

        List<GameDetail.GameParticipant> participants = new ArrayList<>();
        List<GameDetail.ParticipantIdentity> identities = new ArrayList<>();
        for (int i = 1; i <= 10; i++) {
            GameDetail.GameParticipant participant = new GameDetail.GameParticipant();
            participant.setParticipantId(i);
            participant.setTeamId(i <= 5 ? 100 : 200);
            participant.setChampionId(100 + i);
            participant.setSpell1Id(4);
            participant.setSpell2Id(14);
            GameDetail.Stats stats = new GameDetail.Stats();
            stats.setWin(i <= 5);
            stats.setKills(i);
            stats.setDeaths(2);
            stats.setAssists(3);
            stats.setGoldEarned(9000L + i);
            stats.setTotalDamageDealtToChampions(12000L + i);
            stats.setTotalDamageTaken(15000L + i);
            stats.setTotalMinionsKilled(150 + i);
            stats.setNeutralMinionsKilled(5);
            participant.setStats(stats);
            participants.add(participant);

            identities.add(createDetailIdentity(i, i == 1 ? "puuid-1" : "player-" + i));
        }
        detail.setParticipants(participants);
        detail.setParticipantIdentities(identities);
        return detail;
    }

    private MatchHistory.Participant createParticipant(int participantId, int teamId, int championId) {
        MatchHistory.Participant participant = new MatchHistory.Participant();
        participant.setParticipantId(participantId);
        participant.setTeamId(teamId);
        participant.setChampionId(championId);
        participant.setSpell1Id(4);
        participant.setSpell2Id(14);
        MatchHistory.Stats stats = new MatchHistory.Stats();
        stats.setWin(teamId == 100);
        stats.setKills(participantId);
        stats.setDeaths(2);
        stats.setAssists(3);
        participant.setStats(stats);
        return participant;
    }

    private MatchHistory.ParticipantIdentity createIdentity(int participantId, String puuid) {
        MatchHistory.ParticipantIdentity identity = new MatchHistory.ParticipantIdentity();
        identity.setParticipantId(participantId);
        MatchHistory.Player player = new MatchHistory.Player();
        player.setPuuid(puuid);
        player.setGameName("Player" + participantId);
        player.setTagLine("CN1");
        player.setSummonerName("Player" + participantId);
        identity.setPlayer(player);
        return identity;
    }

    private GameDetail.ParticipantIdentity createDetailIdentity(int participantId, String puuid) {
        GameDetail.ParticipantIdentity identity = new GameDetail.ParticipantIdentity();
        identity.setParticipantId(participantId);
        GameDetail.Player player = new GameDetail.Player();
        player.setPuuid(puuid);
        player.setGameName("DetailPlayer" + participantId);
        player.setTagLine("CN1");
        player.setSummonerName("DetailPlayer" + participantId);
        identity.setPlayer(player);
        return identity;
    }

}
