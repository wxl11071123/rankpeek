package io.rankpeek.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.rankpeek.model.GameDetail;
import io.rankpeek.model.MatchHistory;
import io.rankpeek.model.MatchHistoryFetchResult;
import io.rankpeek.model.ScoutTagSample;
import io.rankpeek.service.matchhistory.MatchHistoryProvider;
import io.rankpeek.service.matchhistory.MatchHistoryQueryOptions;
import io.rankpeek.service.matchhistory.MatchHistorySource;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class ScoutTagSampleService {

    private static final int PREMADE_ROSTER_DETAIL_LIMIT = 2;

    private final Map<MatchHistorySource, MatchHistoryProvider> providers = new LinkedHashMap<>();

    private Cache<String, ScoutTagSample> sampleCache;

    @Autowired
    public ScoutTagSampleService(List<MatchHistoryProvider> providers) {
        if (providers != null) {
            for (MatchHistoryProvider provider : providers) {
                if (provider != null && provider.source() != null) {
                    this.providers.put(provider.source(), provider);
                }
            }
        }
    }

    @PostConstruct
    public void init() {
        this.sampleCache = Caffeine.newBuilder()
                .maximumSize(1_000)
                .expireAfterWrite(2, TimeUnit.MINUTES)
                .build();
    }

    public ScoutTagSample getCurrentModeSample(String puuid, int currentQueueId, int lookbackLimit, int sampleLimit) {
        int normalizedQueueId = Math.max(0, currentQueueId);
        int normalizedLookbackLimit = Math.max(1, lookbackLimit);
        int normalizedSampleLimit = Math.max(1, sampleLimit);
        String cacheKey = cacheKey(puuid, normalizedQueueId, normalizedLookbackLimit, normalizedSampleLimit);

        ScoutTagSample cached = sampleCache.getIfPresent(cacheKey);
        if (cached != null) {
            ScoutTagSample cachedSample = cached.toBuilder().source("CACHE").build();
            logSampleLoaded(cachedSample, normalizedLookbackLimit, normalizedSampleLimit);
            return cachedSample;
        }

        ScoutTagSample sample = loadSample(puuid, normalizedQueueId, normalizedLookbackLimit, normalizedSampleLimit);
        sampleCache.put(cacheKey, sample);
        logSampleLoaded(sample, normalizedLookbackLimit, normalizedSampleLimit);
        return sample;
    }

    private ScoutTagSample loadSample(String puuid, int currentQueueId, int lookbackLimit, int sampleLimit) {
        MatchHistoryProvider sgpProvider = providers.get(MatchHistorySource.SGP);
        MatchHistoryQueryOptions sgpOptions = MatchHistoryQueryOptions.forLimit(
                MatchHistorySource.SGP,
                false,
                lookbackLimit
        );

        if (sgpProvider != null && sgpProvider.supports(sgpOptions)) {
            try {
                return buildSample(
                        puuid,
                        currentQueueId,
                        fetchLookback(puuid, sgpProvider, sgpOptions),
                        sampleLimit,
                        "SGP",
                        sgpProvider,
                        sgpOptions
                );
            } catch (Exception e) {
                log.warn("Scout SGP sample failed, falling back to LCU: puuid={}, error={}",
                        puuidPrefix(puuid), e.getMessage());
                log.debug("Scout SGP sample failure details", e);
            }
        }

        MatchHistoryProvider lcuProvider = providers.get(MatchHistorySource.LCU);
        if (lcuProvider == null) {
            return emptySample(puuid, currentQueueId);
        }

        MatchHistoryQueryOptions lcuOptions = MatchHistoryQueryOptions.forLimit(
                MatchHistorySource.LCU,
                false,
                lookbackLimit
        );
        try {
            return buildSample(
                    puuid,
                    currentQueueId,
                    fetchLookback(puuid, lcuProvider, lcuOptions),
                    sampleLimit,
                    "LCU_FALLBACK",
                    lcuProvider,
                    lcuOptions
            );
        } catch (Exception e) {
            log.warn("Scout LCU fallback sample failed: puuid={}, error={}", puuidPrefix(puuid), e.getMessage());
            log.debug("Scout LCU fallback failure details", e);
            return emptySample(puuid, currentQueueId);
        }
    }

    private List<MatchHistory> fetchLookback(String puuid,
                                             MatchHistoryProvider provider,
                                             MatchHistoryQueryOptions options) {
        MatchHistoryFetchResult result = provider.fetchMatchHistory(puuid, options);
        if (result == null || result.getMatches() == null) {
            return List.of();
        }
        return new ArrayList<>(result.getMatches());
    }

    private ScoutTagSample buildSample(String puuid,
                                       int currentQueueId,
                                       List<MatchHistory> lookback,
                                       int sampleLimit,
                                       String source,
                                       MatchHistoryProvider provider,
                                       MatchHistoryQueryOptions options) {
        Set<Long> hydratedGameIds = new HashSet<>();
        List<MatchHistory> hydratedLookback = hydrateRecentRosters(lookback, provider, options, hydratedGameIds);
        List<MatchHistory> currentModeMatches = selectCurrentModeMatches(hydratedLookback, currentQueueId, sampleLimit);
        List<MatchHistory> hydratedCurrentModeMatches = hydrateRecentRosters(
                currentModeMatches,
                provider,
                options,
                hydratedGameIds
        );
        return ScoutTagSample.builder()
                .puuid(puuid)
                .currentQueueId(currentQueueId)
                .lookbackMatches(hydratedLookback)
                .currentModeMatches(hydratedCurrentModeMatches)
                .source(source)
                .build();
    }

    private List<MatchHistory> selectCurrentModeMatches(List<MatchHistory> lookback, int currentQueueId, int sampleLimit) {
        if (lookback == null || lookback.isEmpty()) {
            return List.of();
        }
        List<MatchHistory> selected = new ArrayList<>();
        for (MatchHistory match : lookback) {
            if (match == null) {
                continue;
            }
            if (currentQueueId <= 0 || (match.getQueueId() != null && match.getQueueId() == currentQueueId)) {
                selected.add(match);
                if (selected.size() >= sampleLimit) {
                    break;
                }
            }
        }
        return selected;
    }

    private List<MatchHistory> hydrateRecentRosters(List<MatchHistory> matches,
                                                    MatchHistoryProvider provider,
                                                    MatchHistoryQueryOptions options,
                                                    Set<Long> hydratedGameIds) {
        if (matches == null || matches.isEmpty()) {
            return List.of();
        }

        List<MatchHistory> hydrated = new ArrayList<>(matches);
        int hydratedCount = 0;
        for (int index = 0; index < hydrated.size() && hydratedCount < PREMADE_ROSTER_DETAIL_LIMIT; index++) {
            MatchHistory match = hydrated.get(index);
            if (hasCompleteRoster(match)
                    || match == null
                    || match.getGameId() == null
                    || hydratedGameIds.contains(match.getGameId())) {
                continue;
            }
            try {
                GameDetail detail = provider.fetchGameDetail(match.getGameId(), options);
                hydrated.set(index, mergeDetail(match, detail));
                if (detail != null) {
                    hydratedGameIds.add(match.getGameId());
                }
                hydratedCount++;
            } catch (Exception e) {
                log.debug("Scout roster detail fallback failed: gameId={}", match.getGameId(), e);
            }
        }
        return hydrated;
    }

    private boolean hasCompleteRoster(MatchHistory match) {
        return match != null
                && match.getParticipants() != null
                && match.getParticipants().size() >= 10
                && match.getParticipantIdentities() != null
                && match.getParticipantIdentities().size() >= 10;
    }

    private MatchHistory mergeDetail(MatchHistory match, GameDetail detail) {
        if (match == null || detail == null) {
            return match;
        }
        if (detail.getParticipants() != null && !detail.getParticipants().isEmpty()) {
            match.setParticipants(detail.getParticipants().stream().map(this::toMatchParticipant).toList());
        }
        if (detail.getParticipantIdentities() != null && !detail.getParticipantIdentities().isEmpty()) {
            match.setParticipantIdentities(detail.getParticipantIdentities().stream().map(this::toIdentity).toList());
        }
        if (match.getQueueId() == null) {
            match.setQueueId(detail.getQueueId());
        }
        if (match.getGameCreation() == null) {
            match.setGameCreation(detail.getGameCreation());
        }
        if (match.getGameDuration() == null && detail.getGameDuration() != null) {
            match.setGameDuration(detail.getGameDuration().intValue());
        }
        return match;
    }

    private MatchHistory.Participant toMatchParticipant(GameDetail.GameParticipant detailParticipant) {
        MatchHistory.Participant participant = new MatchHistory.Participant();
        participant.setParticipantId(detailParticipant.getParticipantId());
        participant.setTeamId(detailParticipant.getTeamId());
        participant.setChampionId(detailParticipant.getChampionId());
        participant.setSpell1Id(detailParticipant.getSpell1Id());
        participant.setSpell2Id(detailParticipant.getSpell2Id());
        participant.setTeamPosition(detailParticipant.getTeamPosition());
        participant.setIndividualPosition(detailParticipant.getIndividualPosition());
        if (detailParticipant.getTimeline() != null) {
            participant.setLane(firstText(
                    detailParticipant.getTimeline().getTeamPosition(),
                    detailParticipant.getTimeline().getLane(),
                    detailParticipant.getTimeline().getRawLane()
            ));
            participant.setRole(firstText(
                    detailParticipant.getTimeline().getRole(),
                    detailParticipant.getTimeline().getRawRole()
            ));
        }
        participant.setStats(toMatchStats(detailParticipant.getStats()));
        return participant;
    }

    private MatchHistory.Stats toMatchStats(GameDetail.Stats detailStats) {
        MatchHistory.Stats stats = new MatchHistory.Stats();
        if (detailStats == null) {
            return stats;
        }
        stats.setWin(detailStats.getWin());
        stats.setKills(detailStats.getKills());
        stats.setDeaths(detailStats.getDeaths());
        stats.setAssists(detailStats.getAssists());
        stats.setTotalDamageDealtToChampions(toInteger(detailStats.getTotalDamageDealtToChampions()));
        stats.setGoldEarned(toInteger(detailStats.getGoldEarned()));
        stats.setEarlyGoldDiff(detailStats.getEarlyGoldDiff());
        return stats;
    }

    private MatchHistory.ParticipantIdentity toIdentity(GameDetail.ParticipantIdentity detailIdentity) {
        MatchHistory.ParticipantIdentity identity = new MatchHistory.ParticipantIdentity();
        identity.setParticipantId(detailIdentity.getParticipantId());
        MatchHistory.Player player = new MatchHistory.Player();
        if (detailIdentity.getPlayer() != null) {
            player.setPuuid(detailIdentity.getPlayer().getPuuid());
            player.setGameName(detailIdentity.getPlayer().getGameName());
            player.setTagLine(detailIdentity.getPlayer().getTagLine());
            player.setSummonerName(detailIdentity.getPlayer().getSummonerName());
            player.setSummonerId(detailIdentity.getPlayer().getSummonerId());
            player.setPlatformId(detailIdentity.getPlayer().getPlatformId());
        }
        identity.setPlayer(player);
        return identity;
    }

    private ScoutTagSample emptySample(String puuid, int currentQueueId) {
        return ScoutTagSample.builder()
                .puuid(puuid)
                .currentQueueId(currentQueueId)
                .lookbackMatches(List.of())
                .currentModeMatches(List.of())
                .source("EMPTY")
                .build();
    }

    private void logSampleLoaded(ScoutTagSample sample, int lookbackLimit, int sampleLimit) {
        if (sample == null) {
            return;
        }
        log.info(
                "Scout sample loaded: puuid={}, queueId={}, source={}, lookback={}, currentMode={}, lookbackLimit={}, sampleLimit={}",
                puuidPrefix(sample.getPuuid()),
                sample.getCurrentQueueId() != null ? sample.getCurrentQueueId() : 0,
                sample.getSource(),
                sample.getLookbackMatches() != null ? sample.getLookbackMatches().size() : 0,
                sample.getCurrentModeMatches() != null ? sample.getCurrentModeMatches().size() : 0,
                lookbackLimit,
                sampleLimit
        );
    }

    private String cacheKey(String puuid, int currentQueueId, int lookbackLimit, int sampleLimit) {
        return String.join("|",
                puuid == null ? "" : puuid,
                String.valueOf(currentQueueId),
                String.valueOf(lookbackLimit),
                String.valueOf(sampleLimit));
    }

    private String firstText(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private Integer toInteger(Long value) {
        return value == null ? null : value.intValue();
    }

    private String puuidPrefix(String puuid) {
        if (puuid == null) {
            return "null";
        }
        return puuid.substring(0, Math.min(8, puuid.length()));
    }
}
