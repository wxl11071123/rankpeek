package io.rankpeek.controller;

import io.rankpeek.model.CacheClearResult;
import io.rankpeek.model.CacheRepairResult;
import io.rankpeek.model.CacheStatus;
import io.rankpeek.service.CacheMaintenanceService;
import io.rankpeek.service.CacheRepairService;
import io.rankpeek.service.CacheStatusService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CacheControllerTest {

    private CacheStatusService cacheStatusService;
    private CacheMaintenanceService cacheMaintenanceService;
    private CacheRepairService cacheRepairService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        cacheStatusService = mock(CacheStatusService.class);
        cacheMaintenanceService = mock(CacheMaintenanceService.class);
        cacheRepairService = mock(CacheRepairService.class);
        mockMvc = MockMvcBuilders.standaloneSetup(new CacheController(
                cacheStatusService,
                cacheMaintenanceService,
                cacheRepairService
        )).build();
    }

    @Test
    void getCacheStatus_returnsSuccessfulApiResponse() throws Exception {
        CacheStatus status = CacheStatus.builder()
                .enabled(true)
                .health(CacheStatus.Health.OK)
                .databasePath("C:/RankPeek/cache/rankpeek-cache")
                .databaseSizeBytes(1234L)
                .databaseExists(true)
                .lockFileExists(false)
                .summonerCount(2L)
                .rankCount(2L)
                .matchCount(10L)
                .gameDetailCount(3L)
                .participantCount(100L)
                .playerMatchIndexCount(80L)
                .trackedPlayerCount(8L)
                .latestMatchCreation(1710000000000L)
                .orphanMatchCount(1L)
                .orphanGameDetailCount(2L)
                .orphanParticipantCount(3L)
                .orphanDataScopeCount(4L)
                .quarantineCount(1L)
                .traceFileCount(1L)
                .corruptFileCount(1L)
                .build();
        when(cacheStatusService.getStatus()).thenReturn(status);

        mockMvc.perform(get("/api/v1/cache/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.message").value("success"))
                .andExpect(jsonPath("$.data.enabled").value(true))
                .andExpect(jsonPath("$.data.databasePath").value("C:/RankPeek/cache/rankpeek-cache"))
                .andExpect(jsonPath("$.data.databaseSizeBytes").value(1234))
                .andExpect(jsonPath("$.data.summonerCount").value(2))
                .andExpect(jsonPath("$.data.rankCount").value(2))
                .andExpect(jsonPath("$.data.matchCount").value(10))
                .andExpect(jsonPath("$.data.gameDetailCount").value(3))
                .andExpect(jsonPath("$.data.participantCount").value(100))
                .andExpect(jsonPath("$.data.playerMatchIndexCount").value(80))
                .andExpect(jsonPath("$.data.trackedPlayerCount").value(8))
                .andExpect(jsonPath("$.data.latestMatchCreation").value(1710000000000L))
                .andExpect(jsonPath("$.data.orphanMatchCount").value(1))
                .andExpect(jsonPath("$.data.orphanGameDetailCount").value(2))
                .andExpect(jsonPath("$.data.orphanParticipantCount").value(3))
                .andExpect(jsonPath("$.data.orphanDataScopeCount").value(4))
                .andExpect(jsonPath("$.data.quarantineCount").value(1))
                .andExpect(jsonPath("$.data.traceFileCount").value(1))
                .andExpect(jsonPath("$.data.corruptFileCount").value(1));
    }

    @Test
    void clearCache_returnsSuccessfulApiResponseForConfirmedPost() throws Exception {
        CacheClearResult result = CacheClearResult.builder()
                .success(true)
                .scope("all")
                .message("cache cleared")
                .mode("normal")
                .deletedRows(12L)
                .databaseSizeBeforeBytes(1234L)
                .databaseSizeAfterBytes(1000L)
                .retentionDeletedRows(2L)
                .compacted(false)
                .cleared(java.util.List.of("memory.matchHistory", "localDb.summoner_cache"))
                .failed(java.util.List.of())
                .timestamp(1710000000000L)
                .build();
        when(cacheMaintenanceService.clearCache("all", true, "normal")).thenReturn(result);

        mockMvc.perform(post("/api/v1/cache/clear")
                        .param("scope", "all")
                        .param("confirm", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.message").value("success"))
                .andExpect(jsonPath("$.data.success").value(true))
                .andExpect(jsonPath("$.data.scope").value("all"))
                .andExpect(jsonPath("$.data.mode").value("normal"))
                .andExpect(jsonPath("$.data.cleared[0]").value("memory.matchHistory"))
                .andExpect(jsonPath("$.data.failed").isArray())
                .andExpect(jsonPath("$.data.deletedRows").value(12))
                .andExpect(jsonPath("$.data.databaseSizeBeforeBytes").value(1234))
                .andExpect(jsonPath("$.data.databaseSizeAfterBytes").value(1000))
                .andExpect(jsonPath("$.data.retentionDeletedRows").value(2))
                .andExpect(jsonPath("$.data.compacted").value(false))
                .andExpect(jsonPath("$.data.timestamp").value(1710000000000L));
    }

    @Test
    void clearCache_passesDeepModeToMaintenanceService() throws Exception {
        CacheClearResult result = CacheClearResult.builder()
                .success(true)
                .scope("all")
                .mode("deep")
                .message("cache cleared")
                .deletedRows(0L)
                .databaseSizeBeforeBytes(1234L)
                .databaseSizeAfterBytes(900L)
                .retentionDeletedRows(0L)
                .compacted(true)
                .cleared(java.util.List.of("memory.matchHistory"))
                .failed(java.util.List.of())
                .timestamp(1710000000000L)
                .build();
        when(cacheMaintenanceService.clearCache("all", true, "deep")).thenReturn(result);

        mockMvc.perform(post("/api/v1/cache/clear")
                        .param("scope", "all")
                        .param("confirm", "true")
                        .param("mode", "deep"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.mode").value("deep"))
                .andExpect(jsonPath("$.data.compacted").value(true));
    }

    @Test
    void clearCache_returnsFailedItemDetailsWhenPartialClearFails() throws Exception {
        CacheClearResult result = CacheClearResult.builder()
                .success(false)
                .scope("all")
                .message("cache clear completed with failures: memory.rank")
                .deletedRows(7L)
                .cleared(java.util.List.of("memory.matchHistory", "localDb.summoner_cache"))
                .failed(java.util.List.of(new CacheClearResult.Failure("memory.rank", "rank cache busy")))
                .timestamp(1710000000000L)
                .build();
        when(cacheMaintenanceService.clearCache("all", true, "normal")).thenReturn(result);

        mockMvc.perform(post("/api/v1/cache/clear")
                        .param("scope", "all")
                        .param("confirm", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.success").value(false))
                .andExpect(jsonPath("$.data.cleared[0]").value("memory.matchHistory"))
                .andExpect(jsonPath("$.data.failed[0].name").value("memory.rank"))
                .andExpect(jsonPath("$.data.failed[0].message").value("rank cache busy"))
                .andExpect(jsonPath("$.data.deletedRows").value(7));
    }

    @Test
    void clearCache_withoutConfirmReturnsNotClearedResult() throws Exception {
        CacheClearResult result = CacheClearResult.builder()
                .success(false)
                .scope("all")
                .message("confirm=true is required")
                .deletedRows(0L)
                .cleared(java.util.List.of())
                .failed(java.util.List.of(new CacheClearResult.Failure("confirmation", "confirm=true is required")))
                .timestamp(1710000000000L)
                .build();
        when(cacheMaintenanceService.clearCache("all", false, "normal")).thenReturn(result);

        mockMvc.perform(post("/api/v1/cache/clear"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.success").value(false))
                .andExpect(jsonPath("$.data.scope").value("all"))
                .andExpect(jsonPath("$.data.message").value("confirm=true is required"))
                .andExpect(jsonPath("$.data.failed[0].name").value("confirmation"))
                .andExpect(jsonPath("$.data.deletedRows").value(0));
    }

    @Test
    void repairCache_withoutConfirmReturnsNotRepairedResult() throws Exception {
        CacheRepairResult result = CacheRepairResult.builder()
                .success(false)
                .repaired(false)
                .health(CacheStatus.Health.DISABLED)
                .message("confirm=true is required")
                .movedFiles(java.util.List.of())
                .timestamp(1710000000000L)
                .build();
        when(cacheRepairService.repair(false)).thenReturn(result);

        mockMvc.perform(post("/api/v1/cache/repair"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.success").value(false))
                .andExpect(jsonPath("$.data.repaired").value(false))
                .andExpect(jsonPath("$.data.health").value("DISABLED"))
                .andExpect(jsonPath("$.data.message").value("confirm=true is required"))
                .andExpect(jsonPath("$.data.movedFiles").isArray())
                .andExpect(jsonPath("$.data.timestamp").value(1710000000000L));
    }

    @Test
    void repairCache_returnsQuarantineDetailsWhenRecovered() throws Exception {
        CacheRepairResult result = CacheRepairResult.builder()
                .success(true)
                .repaired(true)
                .health(CacheStatus.Health.RECOVERED)
                .message("local H2 cache repaired")
                .quarantineDirectory("C:/RankPeek/cache/rankpeek-cache.corrupt.20260501-010203")
                .movedFiles(java.util.List.of("rankpeek-cache.mv.db", "rankpeek-cache.trace.db"))
                .timestamp(1710000000000L)
                .build();
        when(cacheRepairService.repair(true)).thenReturn(result);

        mockMvc.perform(post("/api/v1/cache/repair")
                        .param("confirm", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.success").value(true))
                .andExpect(jsonPath("$.data.repaired").value(true))
                .andExpect(jsonPath("$.data.health").value("RECOVERED"))
                .andExpect(jsonPath("$.data.quarantineDirectory")
                        .value("C:/RankPeek/cache/rankpeek-cache.corrupt.20260501-010203"))
                .andExpect(jsonPath("$.data.movedFiles[0]").value("rankpeek-cache.mv.db"));
    }
}
