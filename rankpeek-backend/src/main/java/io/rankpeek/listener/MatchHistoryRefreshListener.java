package io.rankpeek.listener;

import io.rankpeek.event.GamePhaseChangedEvent;
import io.rankpeek.model.Summoner;
import io.rankpeek.service.MatchHistoryRefreshService;
import io.rankpeek.service.SummonerService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.util.Set;

@Slf4j
@Component
@RequiredArgsConstructor
public class MatchHistoryRefreshListener {

    private static final Set<String> GAME_ACTIVE_PHASES = Set.of("InProgress", "PreEndOfGame", "GameStart");
    private static final Set<String> GAME_ENDED_PHASES = Set.of("EndOfGame", "Lobby", "None", "Matchmaking");

    private final MatchHistoryRefreshService matchHistoryRefreshService;
    private final SummonerService summonerService;

    @EventListener
    @Async("eventExecutor")
    public void onGamePhaseChanged(GamePhaseChangedEvent event) {
        String oldPhase = event.getOldPhase();
        String newPhase = event.getNewPhase();

        if (!isGameEndTransition(oldPhase, newPhase)) {
            return;
        }

        log.info("Detected game end for match history refresh: oldPhase={}, newPhase={}", oldPhase, newPhase);

        try {
            Summoner summoner = summonerService.getMySummoner();
            String currentPuuid = summoner == null ? null : summoner.getPuuid();
            if (currentPuuid == null || currentPuuid.isBlank()) {
                log.debug("Skipping match history refresh because current summoner PUUID is empty");
                return;
            }
            matchHistoryRefreshService.refreshAfterGameEnd(currentPuuid);
        } catch (Exception e) {
            log.warn("Failed to trigger match history refresh after game end: error={}", e.getMessage());
        }
    }

    private boolean isGameEndTransition(String oldPhase, String newPhase) {
        if (oldPhase == null || newPhase == null) {
            return false;
        }
        return GAME_ACTIVE_PHASES.contains(oldPhase) && GAME_ENDED_PHASES.contains(newPhase);
    }
}
