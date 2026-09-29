package io.rankpeek.cache;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.rankpeek.config.LocalDataPathService;
import io.rankpeek.model.GameDetail;
import io.rankpeek.model.MatchHistory;
import io.rankpeek.model.MatchHistoryFetchResult;
import io.rankpeek.model.MatchDataScopeCache;
import io.rankpeek.model.MatchTimeline;
import io.rankpeek.model.Rank;
import io.rankpeek.model.Summoner;
import io.rankpeek.service.LocalCacheRetentionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class JdbcMatchHistoryCacheRepositoryTest {

    private JdbcTemplate jdbcTemplate;
    private JdbcMatchHistoryCacheRepository repository;
    private ObjectMapper objectMapper;
    @TempDir
    private Path tempDir;

    @BeforeEach
    void setUp() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:rankpeek-cache-" + System.nanoTime() + ";MODE=PostgreSQL;DATABASE_TO_UPPER=false;DB_CLOSE_DELAY=-1",
                "sa",
                ""
        );
        jdbcTemplate = new JdbcTemplate(dataSource);
        new LocalCacheSchemaInitializer(jdbcTemplate).initializeSchema();
        objectMapper = new ObjectMapper();
        LocalDataPathService pathService = new LocalDataPathService(tempDir.toString(), false);
        LocalCacheRetentionService retentionService = new LocalCacheRetentionService(jdbcTemplate, pathService);
        repository = new JdbcMatchHistoryCacheRepository(jdbcTemplate, objectMapper, null, retentionService);
    }

    @Test
    void saveMatchHistory_persistsRecentMatchesParticipantsAndFetchState() {
        repository.saveMatchHistory("target-puuid", List.of(createMatch(1001L, "target-puuid", 10)));

        Optional<MatchHistoryFetchResult> result = repository.findRecentMatchHistory("target-puuid", 50);

        assertThat(result).isPresent();
        assertThat(result.get().getMatches()).extracting(MatchHistory::getGameId).containsExactly(1001L);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM match_participant_cache WHERE game_id = 1001",
                Integer.class
        )).isEqualTo(10);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM player_match_index WHERE game_id = ?",
                Integer.class,
                1001L
        )).isEqualTo(10);
        assertThat(jdbcTemplate.queryForList(
                "SELECT puuid FROM player_match_index WHERE game_id = ?",
                String.class,
                1001L
        )).containsExactlyInAnyOrder(
                "target-puuid",
                "player-2",
                "player-3",
                "player-4",
                "player-5",
                "player-6",
                "player-7",
                "player-8",
                "player-9",
                "player-10"
        );
        assertThat(repository.getMatchUpdatedAt("target-puuid")).isPresent();
    }

    @Test
    void saveMatchHistory_persistsOnlyCurrentPlayerRenderableMatches() {
        List<MatchHistory> matches = new ArrayList<>();
        matches.add(createMatch(1100L, "target-puuid", 10));
        for (long gameId = 1101L; gameId <= 1119L; gameId++) {
            matches.add(createMatchWithMissingCurrentStats(gameId, "target-puuid", 10));
        }

        repository.saveMatchHistory("target-puuid", matches);

        Optional<MatchHistoryFetchResult> result = repository.findRecentMatchHistory("target-puuid", 50);
        assertThat(result).isPresent();
        assertThat(result.get().getMatches()).extracting(MatchHistory::getGameId).containsExactly(1100L);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM match_cache",
                Integer.class
        )).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM match_participant_cache WHERE game_id <> ?",
                Integer.class,
                1100L
        )).isZero();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM player_match_index WHERE puuid = ?",
                Integer.class,
                "target-puuid"
        )).isEqualTo(1);
    }

    @Test
    void saveMatchHistory_doesNotOverwriteExistingCacheWhenAllMatchesAreNotRenderable() {
        repository.saveMatchHistory("target-puuid", List.of(createMatch(1200L, "target-puuid", 10)));

        repository.saveMatchHistory("target-puuid", List.of(
                createMatchWithMissingCurrentStats(1201L, "target-puuid", 10),
                createMatchWithMissingCurrentStats(1202L, "target-puuid", 10)
        ));

        Optional<MatchHistoryFetchResult> result = repository.findRecentMatchHistory("target-puuid", 50);
        assertThat(result).isPresent();
        assertThat(result.get().getMatches()).extracting(MatchHistory::getGameId).containsExactly(1200L);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM match_cache WHERE game_id IN (?, ?)",
                Integer.class,
                1201L,
                1202L
        )).isZero();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT latest_game_id FROM player_fetch_state WHERE puuid = ?",
                Long.class,
                "target-puuid"
        )).isEqualTo(1200L);
    }

    @Test
    void findRecentMatchHistory_returnsCachedMatchForNonTargetParticipant() {
        repository.saveMatchHistory("target-puuid", List.of(createMatch(1002L, "target-puuid", 10)));

        Optional<MatchHistoryFetchResult> result = repository.findRecentMatchHistory("player-2", 50);

        assertThat(result).isPresent();
        assertThat(result.get().getMatches()).extracting(MatchHistory::getGameId).containsExactly(1002L);
    }

    @Test
    void trimPlayerMatchIndex_keepsOnlyNewestTwoHundredRowsForEveryInvolvedPlayer() {
        List<MatchHistory> matches = new ArrayList<>();
        for (long i = 1; i <= 205; i++) {
            matches.add(createMatch(i, "target-puuid", 2));
        }

        repository.saveMatchHistory("target-puuid", matches);

        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM player_match_index WHERE puuid = ?",
                Integer.class,
                "target-puuid"
        )).isEqualTo(200);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT MIN(game_id) FROM player_match_index WHERE puuid = ?",
                Long.class,
                "target-puuid"
        )).isEqualTo(6L);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM player_match_index WHERE puuid = ?",
                Integer.class,
                "player-2"
        )).isEqualTo(200);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT MIN(game_id) FROM player_match_index WHERE puuid = ?",
                Long.class,
                "player-2"
        )).isEqualTo(6L);
    }

    @Test
    void saveMatchHistory_usesBatchRetentionInsteadOfPerParticipantTrimQueries() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:rankpeek-cache-counting-" + System.nanoTime() + ";MODE=PostgreSQL;DATABASE_TO_UPPER=false;DB_CLOSE_DELAY=-1",
                "sa",
                ""
        );
        CountingJdbcTemplate countingJdbcTemplate = new CountingJdbcTemplate(dataSource);
        new LocalCacheSchemaInitializer(countingJdbcTemplate).initializeSchema();
        LocalDataPathService pathService = new LocalDataPathService(tempDir.toString(), false);
        LocalCacheRetentionService retentionService = new LocalCacheRetentionService(countingJdbcTemplate, pathService);
        JdbcMatchHistoryCacheRepository countingRepository = new JdbcMatchHistoryCacheRepository(
                countingJdbcTemplate,
                objectMapper,
                null,
                retentionService
        );

        countingRepository.saveMatchHistory("target-puuid", List.of(createMatch(1300L, "target-puuid", 10)));

        assertThat(countingJdbcTemplate.perParticipantTrimQueries()).isZero();
        assertThat(countingJdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM player_match_index WHERE game_id = ?",
                Integer.class,
                1300L
        )).isEqualTo(10);
    }

    @Test
    void saveMatchHistory_skipsExistingMatchPayloadRowsWhenAppendingNewerSnapshot() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:rankpeek-cache-append-" + System.nanoTime() + ";MODE=PostgreSQL;DATABASE_TO_UPPER=false;DB_CLOSE_DELAY=-1",
                "sa",
                ""
        );
        CountingJdbcTemplate countingJdbcTemplate = new CountingJdbcTemplate(dataSource);
        new LocalCacheSchemaInitializer(countingJdbcTemplate).initializeSchema();
        LocalDataPathService pathService = new LocalDataPathService(tempDir.toString(), false);
        LocalCacheRetentionService retentionService = new LocalCacheRetentionService(countingJdbcTemplate, pathService);
        JdbcMatchHistoryCacheRepository countingRepository = new JdbcMatchHistoryCacheRepository(
                countingJdbcTemplate,
                objectMapper,
                null,
                retentionService
        );
        countingRepository.saveMatchHistory("target-puuid", List.of(
                createMatch(1400L, "target-puuid", 10),
                createMatch(1401L, "target-puuid", 10)
        ));
        countingJdbcTemplate.resetCounts();

        countingRepository.saveMatchHistory("target-puuid", List.of(
                createMatch(1400L, "target-puuid", 10),
                createMatch(1401L, "target-puuid", 10),
                createMatch(1402L, "target-puuid", 10)
        ));

        assertThat(countingJdbcTemplate.matchPayloadMergeQueries()).isEqualTo(1);
        assertThat(countingJdbcTemplate.participantPayloadMergeQueries()).isEqualTo(10);
        assertThat(countingJdbcTemplate.playerIndexMergeQueries()).isEqualTo(10);
        assertThat(countingRepository.findRecentMatchHistory("target-puuid", 50))
                .map(MatchHistoryFetchResult::getMatches)
                .map(matches -> matches.stream().map(MatchHistory::getGameId).toList())
                .contains(List.of(1402L, 1401L, 1400L));
    }

    @Test
    void findRecentMatchHistory_skipsCorruptJsonRows() {
        repository.saveMatchHistory("target-puuid", List.of(createMatch(2001L, "target-puuid", 2)));
        jdbcTemplate.update(
                "INSERT INTO match_cache (game_id, game_creation, raw_json, updated_at) VALUES (?, ?, ?, ?)",
                2002L,
                9999999999L,
                "{broken-json",
                System.currentTimeMillis()
        );
        jdbcTemplate.update(
                "INSERT INTO player_match_index (puuid, game_id, game_creation, updated_at) VALUES (?, ?, ?, ?)",
                "target-puuid",
                2002L,
                9999999999L,
                System.currentTimeMillis()
        );

        Optional<MatchHistoryFetchResult> result = repository.findRecentMatchHistory("target-puuid", 50);

        assertThat(result).isPresent();
        assertThat(result.get().getMatches()).extracting(MatchHistory::getGameId).containsExactly(2001L);
    }

    private static final class CountingJdbcTemplate extends JdbcTemplate {
        private int perParticipantTrimQueries;
        private int matchPayloadMergeQueries;
        private int participantPayloadMergeQueries;
        private int playerIndexMergeQueries;

        private CountingJdbcTemplate(DriverManagerDataSource dataSource) {
            super(dataSource);
        }

        @Override
        public int update(String sql, Object... args) {
            String normalizedSql = sql.replaceAll("\\s+", " ").trim();
            if (normalizedSql.startsWith("DELETE FROM player_match_index WHERE puuid = ?")) {
                perParticipantTrimQueries++;
            } else if (normalizedSql.startsWith("MERGE INTO match_cache")) {
                matchPayloadMergeQueries++;
            } else if (normalizedSql.startsWith("MERGE INTO match_participant_cache")) {
                participantPayloadMergeQueries++;
            } else if (normalizedSql.startsWith("MERGE INTO player_match_index")) {
                playerIndexMergeQueries++;
            }
            return super.update(sql, args);
        }

        private int perParticipantTrimQueries() {
            return perParticipantTrimQueries;
        }

        private int matchPayloadMergeQueries() {
            return matchPayloadMergeQueries;
        }

        private int participantPayloadMergeQueries() {
            return participantPayloadMergeQueries;
        }

        private int playerIndexMergeQueries() {
            return playerIndexMergeQueries;
        }

        private void resetCounts() {
            perParticipantTrimQueries = 0;
            matchPayloadMergeQueries = 0;
            participantPayloadMergeQueries = 0;
            playerIndexMergeQueries = 0;
        }
    }

    @Test
    void findRecentMatchHistory_triggersLocalRecoveryWhenJdbcReportsH2Corruption() {
        RuntimeException corruption = new RuntimeException(
                "org.h2.mvstore.MVStoreException: File corrupted while reading record"
        );
        JdbcTemplate brokenJdbcTemplate = new JdbcTemplate() {
            @Override
            public <T> List<T> query(String sql, RowMapper<T> rowMapper, Object... args) {
                throw corruption;
            }
        };
        LocalCacheRecoveryCoordinator recoveryCoordinator = mock(LocalCacheRecoveryCoordinator.class);
        JdbcMatchHistoryCacheRepository brokenRepository =
                new JdbcMatchHistoryCacheRepository(brokenJdbcTemplate, objectMapper, recoveryCoordinator);

        Optional<MatchHistoryFetchResult> result =
                brokenRepository.findRecentMatchHistory("target-puuid", 10);

        assertThat(result).isEmpty();
        verify(recoveryCoordinator).recoverIfCorrupt(eq(corruption), eq("repository.findRecentMatchHistory"));
    }

    @Test
    void findRecentMatchHistory_restoresIncompleteRosterFromGameDetailCache() {
        repository.saveMatchHistory("target-puuid", List.of(createMatch(3001L, "target-puuid", 1)));
        repository.saveGameDetail(createGameDetail(3001L, "target-puuid"));

        Optional<MatchHistoryFetchResult> result = repository.findRecentMatchHistory("target-puuid", 50);

        assertThat(result).isPresent();
        MatchHistory match = result.get().getMatches().getFirst();
        assertThat(match.getParticipants()).hasSize(10);
        assertThat(match.getParticipantIdentities()).hasSize(10);
        assertThat(match.getParticipantIdentities().get(9).getPlayer().getPuuid()).isEqualTo("detail-player-10");
    }

    @Test
    void findRecentMatchHistory_restoresCompleteRosterWhenTargetPuuidIsMissing() throws Exception {
        repository.saveMatchHistory("target-puuid", List.of(createMatch(3003L, "target-puuid", 10)));
        repository.saveGameDetail(createGameDetail(3003L, "target-puuid"));
        jdbcTemplate.update(
                "UPDATE match_cache SET raw_json = ? WHERE game_id = ?",
                objectMapper.writeValueAsString(createMatch(3003L, "summary-player-1", 10)),
                3003L
        );

        Optional<MatchHistoryFetchResult> result = repository.findRecentMatchHistory("target-puuid", 50);

        assertThat(result).isPresent();
        MatchHistory match = result.get().getMatches().getFirst();
        assertThat(match.getParticipantIdentities())
                .anySatisfy(identity -> assertThat(identity.getPlayer().getPuuid()).isEqualTo("target-puuid"));
        assertThat(match.getParticipants())
                .anySatisfy(participant -> {
                    assertThat(participant.getParticipantId()).isEqualTo(1);
                    assertThat(participant.getChampionId()).isEqualTo(101);
                });
    }

    @Test
    void findRecentMatchHistory_restoresIncompleteRosterFromParticipantCache() throws Exception {
        repository.saveMatchHistory("target-puuid", List.of(createMatch(3002L, "target-puuid", 10)));
        jdbcTemplate.update(
                "UPDATE match_cache SET raw_json = ? WHERE game_id = ?",
                objectMapper.writeValueAsString(createMatch(3002L, "target-puuid", 1)),
                3002L
        );

        Optional<MatchHistoryFetchResult> result = repository.findRecentMatchHistory("target-puuid", 50);

        assertThat(result).isPresent();
        MatchHistory match = result.get().getMatches().getFirst();
        assertThat(match.getParticipants()).hasSize(10);
        assertThat(match.getParticipantIdentities()).hasSize(10);
        assertThat(match.getParticipants().get(9).getChampionId()).isEqualTo(20);
        assertThat(match.getParticipantIdentities().get(9).getPlayer().getPuuid()).isEqualTo("player-10");
    }

    @Test
    void saveAndReadGameDetailSummonerAndRank() {
        GameDetail detail = new GameDetail();
        detail.setGameId(4001L);
        detail.setGameCreation(1710000000000L);
        repository.saveGameDetail(detail);

        Summoner summoner = new Summoner();
        summoner.setPuuid("target-puuid");
        summoner.setGameName("Tester");
        summoner.setTagLine("CN1");
        summoner.setSummonerLevel(30);
        repository.saveSummoner(summoner);

        Rank rank = new Rank();
        Rank.QueueMap queueMap = new Rank.QueueMap();
        Rank.QueueInfo solo = new Rank.QueueInfo();
        solo.setTier("GOLD");
        solo.setWins(12);
        queueMap.setRankedSolo5x5(solo);
        rank.setQueueMap(queueMap);
        repository.saveRank("target-puuid", rank);

        assertThat(repository.findGameDetail(4001L)).isPresent();
        assertThat(repository.findSummonerByPuuid("target-puuid")).map(Summoner::getGameName).contains("Tester");
        assertThat(repository.findSummonerByName("Tester", "CN1")).map(Summoner::getPuuid).contains("target-puuid");
        assertThat(repository.findRank("target-puuid"))
                .map(found -> found.getQueueMap().getRankedSolo5x5().getTier())
                .contains("GOLD");
    }

    @Test
    void saveAndReadSgpRawSummaryDetailAndTimelineScopes() {
        MatchTimeline timeline = new MatchTimeline();
        timeline.setGameId(5001L);
        MatchTimeline.TimelineFrame frame = new MatchTimeline.TimelineFrame();
        frame.setTimestamp(60000L);
        MatchTimeline.ParticipantFrame participantFrame = new MatchTimeline.ParticipantFrame();
        participantFrame.setParticipantId(9);
        participantFrame.setTotalGold(9012);
        MatchTimeline.Position framePosition = new MatchTimeline.Position();
        framePosition.setX(5840);
        framePosition.setY(6910);
        participantFrame.setPosition(framePosition);
        frame.setParticipantFrames(Map.of("9", participantFrame));
        MatchTimeline.TimelineEvent event = new MatchTimeline.TimelineEvent();
        event.setEventType("CHAMPION_KILL");
        event.setTimestamp(71613L);
        event.setKillerId(9);
        event.setVictimId(4);
        MatchTimeline.Position position = new MatchTimeline.Position();
        position.setX(5853);
        position.setY(6923);
        event.setPosition(position);
        timeline.setEvents(List.of(event));
        frame.setEvents(List.of(event));
        timeline.setFrames(List.of(frame));

        repository.saveSgpRawSummaries(Map.of(5001L, "{\"gameId\":5001,\"participants\":[]}"));
        repository.saveSgpRawDetail(5001L, "{\"json\":{\"gameId\":5001,\"frames\":[]}}", "FETCHED", null);
        repository.saveSgpTimeline(
                5001L,
                timeline,
                "{\"json\":{\"gameId\":5001,\"frames\":[{\"events\":[]}]}}",
                "FETCHED",
                null
        );

        Optional<MatchDataScopeCache> result = repository.findMatchDataScope(5001L);

        assertThat(result).isPresent();
        MatchDataScopeCache cached = result.get();
        assertThat(cached.getGameId()).isEqualTo(5001L);
        assertThat(cached.getSource()).isEqualTo("sgp");
        assertThat(cached.getSummaryStatus()).isEqualTo("FETCHED");
        assertThat(cached.getDetailStatus()).isEqualTo("FETCHED");
        assertThat(cached.getTimelineStatus()).isEqualTo("FETCHED");
        assertThat(cached.getRawSummaryJson()).contains("\"participants\"");
        assertThat(cached.getRawDetailJson()).contains("\"frames\"");
        assertThat(cached.getRawTimelineJson()).contains("\"frames\"");
        assertThat(cached.getTimeline().getEvents()).hasSize(1);
        assertThat(cached.getTimeline().getEvents().getFirst().getPosition().getX()).isEqualTo(5853);
        assertThat(cached.getTimeline().getFrames()).hasSize(1);
        assertThat(cached.getTimeline().getFrames().getFirst().getParticipantFrames().get("9").getPosition().getX())
                .isEqualTo(5840);
        assertThat(cached.getSchemaVersion()).isEqualTo(1);
        assertThat(cached.getFetchedAt()).isPositive();
    }

    @Test
    void initializeSchema_addsMissingSgpScopeColumnsForExistingPartialTable() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:rankpeek-cache-migration-" + System.nanoTime() + ";MODE=PostgreSQL;DATABASE_TO_UPPER=false;DB_CLOSE_DELAY=-1",
                "sa",
                ""
        );
        JdbcTemplate migratingJdbcTemplate = new JdbcTemplate(dataSource);
        migratingJdbcTemplate.execute("""
                CREATE TABLE match_data_scope_cache (
                    game_id BIGINT PRIMARY KEY
                )
                """);

        new LocalCacheSchemaInitializer(migratingJdbcTemplate).initializeSchema();
        JdbcMatchHistoryCacheRepository migratingRepository =
                new JdbcMatchHistoryCacheRepository(migratingJdbcTemplate, objectMapper);

        migratingRepository.saveSgpRawSummaries(Map.of(6001L, "{\"gameId\":6001}"));

        Optional<MatchDataScopeCache> migrated = migratingRepository.findMatchDataScope(6001L);
        assertThat(migrated).isPresent();
        assertThat(migrated.get().getSource()).isEqualTo("sgp");
        assertThat(migrated.get().getSummaryStatus()).isEqualTo("FETCHED");
        assertThat(migrated.get().getSchemaVersion()).isEqualTo(1);
    }

    private MatchHistory createMatch(long gameId, String targetPuuid, int participantCount) {
        MatchHistory match = new MatchHistory();
        match.setGameId(gameId);
        match.setQueueId(420);
        match.setGameCreation(1710000000000L + gameId);
        match.setGameDuration(1800);
        match.setGameMode("CLASSIC");
        match.setGameType("MATCHED_GAME");
        match.setMapId(11);
        match.setPlatformId("HN1");

        List<MatchHistory.Participant> participants = new ArrayList<>();
        List<MatchHistory.ParticipantIdentity> identities = new ArrayList<>();
        for (int i = 1; i <= participantCount; i++) {
            String puuid = i == 1 ? targetPuuid : "player-" + i;
            MatchHistory.Participant participant = new MatchHistory.Participant();
            participant.setParticipantId(i);
            participant.setTeamId(i <= participantCount / 2 ? 100 : 200);
            participant.setChampionId(10 + i);
            participant.setSpell1Id(4);
            participant.setSpell2Id(14);
            MatchHistory.Stats stats = new MatchHistory.Stats();
            stats.setWin(i <= participantCount / 2);
            stats.setKills(i);
            stats.setDeaths(2);
            stats.setAssists(3);
            stats.setGoldEarned(9000 + i);
            stats.setTotalDamageDealtToChampions(12000 + i);
            stats.setTotalDamageTaken(15000 + i);
            stats.setTotalMinionsKilled(150 + i);
            stats.setNeutralMinionsKilled(5);
            participant.setStats(stats);
            participants.add(participant);

            MatchHistory.ParticipantIdentity identity = new MatchHistory.ParticipantIdentity();
            identity.setParticipantId(i);
            MatchHistory.Player player = new MatchHistory.Player();
            player.setPuuid(puuid);
            player.setGameName("Player" + i);
            player.setTagLine("CN1");
            player.setSummonerName("Player" + i);
            identity.setPlayer(player);
            identities.add(identity);
        }

        match.setParticipants(participants);
        match.setParticipantIdentities(identities);
        return match;
    }

    private MatchHistory createMatchWithMissingCurrentStats(long gameId, String targetPuuid, int participantCount) {
        MatchHistory match = createMatch(gameId, targetPuuid, participantCount);
        match.getParticipants().getFirst().setStats(null);
        return match;
    }

    private GameDetail createGameDetail(long gameId, String targetPuuid) {
        GameDetail detail = new GameDetail();
        detail.setGameId(gameId);
        detail.setQueueId(420);
        detail.setGameCreation(1710000000000L + gameId);
        detail.setGameDuration(1800L);
        detail.setGameMode("CLASSIC");
        detail.setGameType("MATCHED_GAME");
        detail.setMapId(11);

        List<GameDetail.GameParticipant> participants = new ArrayList<>();
        List<GameDetail.ParticipantIdentity> identities = new ArrayList<>();
        for (int i = 1; i <= 10; i++) {
            String puuid = i == 1 ? targetPuuid : "detail-player-" + i;
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

            GameDetail.ParticipantIdentity identity = new GameDetail.ParticipantIdentity();
            identity.setParticipantId(i);
            GameDetail.Player player = new GameDetail.Player();
            player.setPuuid(puuid);
            player.setGameName("DetailPlayer" + i);
            player.setTagLine("CN1");
            player.setSummonerName("DetailPlayer" + i);
            identity.setPlayer(player);
            identities.add(identity);
        }

        detail.setParticipants(participants);
        detail.setParticipantIdentities(identities);
        return detail;
    }
}
