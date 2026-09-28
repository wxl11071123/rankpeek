package io.rankpeek.service;

import io.rankpeek.model.GameDetail;
import io.rankpeek.model.MatchHistory;
import io.rankpeek.model.MatchHistoryFetchResult;
import io.rankpeek.model.ScoutTagSample;
import io.rankpeek.service.matchhistory.MatchHistoryProvider;
import io.rankpeek.service.matchhistory.MatchHistoryQueryOptions;
import io.rankpeek.service.matchhistory.MatchHistorySource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith({MockitoExtension.class, OutputCaptureExtension.class})
class ScoutTagSampleServiceTest {

    @Mock
    private MatchHistoryProvider lcuProvider;
    @Mock
    private MatchHistoryProvider sgpProvider;

    private ScoutTagSampleService service;

    @BeforeEach
    void setUp() {
        when(lcuProvider.source()).thenReturn(MatchHistorySource.LCU);
        when(sgpProvider.source()).thenReturn(MatchHistorySource.SGP);
        service = new ScoutTagSampleService(List.of(lcuProvider, sgpProvider));
        service.init();
    }

    @Test
    void getCurrentModeSampleFiltersRecentFiftyByCurrentQueueAndCapsAtTwenty() {
        List<MatchHistory> lookback = mixedMatches(50, 25, 420, 450);
        when(sgpProvider.supports(limitOptions(MatchHistorySource.SGP, 50))).thenReturn(true);
        when(sgpProvider.fetchMatchHistory("puuid-1", limitOptions(MatchHistorySource.SGP, 50)))
                .thenReturn(result(lookback));

        ScoutTagSample sample = service.getCurrentModeSample("puuid-1", 420, 50, 20);

        assertThat(sample.getSource()).isEqualTo("SGP");
        assertThat(sample.getLookbackMatches()).hasSize(50);
        assertThat(sample.getCurrentModeMatches()).hasSize(20);
        assertThat(sample.getCurrentModeMatches()).allMatch(match -> match.getQueueId().equals(420));
        verify(sgpProvider).fetchMatchHistory("puuid-1", limitOptions(MatchHistorySource.SGP, 50));
        verify(lcuProvider, never()).fetchMatchHistory(any(String.class), any(MatchHistoryQueryOptions.class));
    }

    @Test
    void getCurrentModeSampleLogsSourceAndSampleSizes(CapturedOutput output) {
        List<MatchHistory> lookback = mixedMatches(50, 25, 420, 450);
        when(sgpProvider.supports(limitOptions(MatchHistorySource.SGP, 50))).thenReturn(true);
        when(sgpProvider.fetchMatchHistory("puuid-1", limitOptions(MatchHistorySource.SGP, 50)))
                .thenReturn(result(lookback));

        service.getCurrentModeSample("puuid-1", 420, 50, 20);

        assertThat(output.getOut())
                .contains("Scout sample loaded")
                .contains("queueId=420")
                .contains("source=SGP")
                .contains("lookback=50")
                .contains("currentMode=20")
                .contains("lookbackLimit=50")
                .contains("sampleLimit=20");
    }

    @Test
    void getCurrentModeSampleUsesRecentTwentyUnfilteredWhenCurrentQueueIsUnknown() {
        List<MatchHistory> lookback = mixedMatches(50, 25, 420, 450);
        when(sgpProvider.supports(limitOptions(MatchHistorySource.SGP, 50))).thenReturn(true);
        when(sgpProvider.fetchMatchHistory("puuid-1", limitOptions(MatchHistorySource.SGP, 50)))
                .thenReturn(result(lookback));

        ScoutTagSample sample = service.getCurrentModeSample("puuid-1", 0, 50, 20);

        assertThat(sample.getCurrentQueueId()).isZero();
        assertThat(sample.getCurrentModeMatches()).hasSize(20);
        assertThat(sample.getCurrentModeMatches()).extracting(MatchHistory::getGameId)
                .containsExactlyElementsOf(lookback.subList(0, 20).stream().map(MatchHistory::getGameId).toList());
    }

    @Test
    void getCurrentModeSampleFallsBackToLcuWhenSgpFetchFailsForThatPlayer() {
        List<MatchHistory> lcuMatches = mixedMatches(12, 12, 420, 450);
        when(sgpProvider.supports(limitOptions(MatchHistorySource.SGP, 50))).thenReturn(true);
        when(sgpProvider.fetchMatchHistory("puuid-1", limitOptions(MatchHistorySource.SGP, 50)))
                .thenThrow(new RuntimeException("sgp down"));
        when(lcuProvider.fetchMatchHistory("puuid-1", limitOptions(MatchHistorySource.LCU, 50)))
                .thenReturn(result(lcuMatches));

        ScoutTagSample sample = service.getCurrentModeSample("puuid-1", 420, 50, 20);

        assertThat(sample.getSource()).isEqualTo("LCU_FALLBACK");
        assertThat(sample.getCurrentModeMatches()).hasSize(12);
        verify(sgpProvider).fetchMatchHistory("puuid-1", limitOptions(MatchHistorySource.SGP, 50));
        verify(lcuProvider).fetchMatchHistory("puuid-1", limitOptions(MatchHistorySource.LCU, 50));
    }

    @Test
    void getCurrentModeSampleReturnsEmptySampleWhenBothSourcesFail() {
        when(sgpProvider.supports(limitOptions(MatchHistorySource.SGP, 50))).thenReturn(true);
        when(sgpProvider.fetchMatchHistory("puuid-1", limitOptions(MatchHistorySource.SGP, 50)))
                .thenThrow(new RuntimeException("sgp down"));
        when(lcuProvider.fetchMatchHistory("puuid-1", limitOptions(MatchHistorySource.LCU, 50)))
                .thenThrow(new RuntimeException("lcu down"));

        ScoutTagSample sample = service.getCurrentModeSample("puuid-1", 420, 50, 20);

        assertThat(sample.getSource()).isEqualTo("EMPTY");
        assertThat(sample.getLookbackMatches()).isEmpty();
        assertThat(sample.getCurrentModeMatches()).isEmpty();
    }

    @Test
    void getCurrentModeSampleReturnsCachedSampleOnRepeatedRead() {
        List<MatchHistory> lookback = mixedMatches(20, 20, 420, 450);
        when(sgpProvider.supports(limitOptions(MatchHistorySource.SGP, 50))).thenReturn(true);
        when(sgpProvider.fetchMatchHistory("puuid-1", limitOptions(MatchHistorySource.SGP, 50)))
                .thenReturn(result(lookback));

        ScoutTagSample first = service.getCurrentModeSample("puuid-1", 420, 50, 20);
        ScoutTagSample second = service.getCurrentModeSample("puuid-1", 420, 50, 20);

        assertThat(second).isNotSameAs(first);
        assertThat(second.getSource()).isEqualTo("CACHE");
        assertThat(second.getCurrentModeMatches()).extracting(MatchHistory::getGameId)
                .containsExactlyElementsOf(first.getCurrentModeMatches().stream().map(MatchHistory::getGameId).toList());
        verify(sgpProvider).fetchMatchHistory("puuid-1", limitOptions(MatchHistorySource.SGP, 50));
    }

    @Test
    void getCurrentModeSampleHydratesCurrentModeMatchesForDamageConversionStats() {
        MatchHistoryQueryOptions options = limitOptions(MatchHistorySource.SGP, 50);
        List<MatchHistory> lookback = List.of(
                incompleteMatch(10_000L, 450),
                incompleteMatch(10_001L, 450),
                incompleteMatch(10_002L, 420)
        );
        when(sgpProvider.supports(options)).thenReturn(true);
        when(sgpProvider.fetchMatchHistory("puuid-1", options)).thenReturn(result(lookback));
        when(sgpProvider.fetchGameDetail(10_002L, options)).thenReturn(gameDetail(10_002L, 420, "puuid-1", 12345L, 23456L));

        ScoutTagSample sample = service.getCurrentModeSample("puuid-1", 420, 50, 20);

        MatchHistory.Stats stats = sample.getCurrentModeMatches().getFirst().getParticipants().getFirst().getStats();
        assertThat(stats.getGoldEarned()).isEqualTo(12345);
        assertThat(stats.getTotalDamageDealtToChampions()).isEqualTo(23456);
        verify(sgpProvider).fetchGameDetail(10_002L, options);
    }

    private MatchHistoryFetchResult result(List<MatchHistory> matches) {
        return MatchHistoryFetchResult.builder()
                .matches(matches)
                .rawEmpty(matches.isEmpty())
                .build();
    }

    private List<MatchHistory> mixedMatches(int count, int selectedCount, int selectedQueueId, int otherQueueId) {
        List<MatchHistory> matches = new ArrayList<>();
        for (int index = 0; index < count; index++) {
            MatchHistory match = new MatchHistory();
            match.setGameId(10_000L + index);
            match.setQueueId(index < selectedCount ? selectedQueueId : otherQueueId);
            match.setGameCreation(1_710_000_000_000L - index);
            match.setParticipants(List.of(participant("puuid-1", 1, 100)));
            match.setParticipantIdentities(List.of(identity("puuid-1", 1)));
            matches.add(match);
        }
        return matches;
    }

    private MatchHistory incompleteMatch(long gameId, int queueId) {
        MatchHistory match = new MatchHistory();
        match.setGameId(gameId);
        match.setQueueId(queueId);
        match.setGameCreation(1_710_000_000_000L - gameId);
        match.setParticipants(List.of(participant("puuid-1", 1, 100)));
        match.setParticipantIdentities(List.of(identity("puuid-1", 1)));
        return match;
    }

    private GameDetail gameDetail(long gameId, int queueId, String puuid, long goldEarned, long damageDealt) {
        GameDetail detail = new GameDetail();
        detail.setGameId(gameId);
        detail.setQueueId(queueId);

        GameDetail.GameParticipant participant = new GameDetail.GameParticipant();
        participant.setParticipantId(1);
        participant.setTeamId(100);
        participant.setChampionId(11);
        GameDetail.Stats stats = new GameDetail.Stats();
        stats.setWin(true);
        stats.setKills(7);
        stats.setDeaths(3);
        stats.setAssists(8);
        stats.setGoldEarned(goldEarned);
        stats.setTotalDamageDealtToChampions(damageDealt);
        participant.setStats(stats);
        detail.setParticipants(List.of(participant));

        GameDetail.ParticipantIdentity identity = new GameDetail.ParticipantIdentity();
        identity.setParticipantId(1);
        GameDetail.Player player = new GameDetail.Player();
        player.setPuuid(puuid);
        identity.setPlayer(player);
        detail.setParticipantIdentities(List.of(identity));

        return detail;
    }

    private MatchHistory.Participant participant(String puuid, int participantId, int teamId) {
        MatchHistory.Participant participant = new MatchHistory.Participant();
        participant.setParticipantId(participantId);
        participant.setTeamId(teamId);
        participant.setChampionId(11);
        MatchHistory.Stats stats = new MatchHistory.Stats();
        stats.setWin(true);
        participant.setStats(stats);
        return participant;
    }

    private MatchHistory.ParticipantIdentity identity(String puuid, int participantId) {
        MatchHistory.ParticipantIdentity identity = new MatchHistory.ParticipantIdentity();
        identity.setParticipantId(participantId);
        MatchHistory.Player player = new MatchHistory.Player();
        player.setPuuid(puuid);
        identity.setPlayer(player);
        return identity;
    }

    private MatchHistoryQueryOptions limitOptions(MatchHistorySource source, int limit) {
        return new MatchHistoryQueryOptions(
                0,
                limit - 1,
                null,
                null,
                limit,
                false,
                source,
                null,
                null
        );
    }
}
