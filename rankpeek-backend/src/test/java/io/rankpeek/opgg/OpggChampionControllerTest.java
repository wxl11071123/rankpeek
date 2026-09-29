package io.rankpeek.opgg;

import io.rankpeek.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.List;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class OpggChampionControllerTest {

    @Test
    void detailEndpointReturnsLocalBackendChampionData() throws Exception {
        MockMvc mockMvc = mockMvc(
                query -> detail(query.tier(), query.position()),
                query -> championList(query.tier())
        );

        mockMvc.perform(get("/api/v1/opgg/champions/103/detail")
                        .param("mode", "ranked")
                        .param("region", "kr")
                        .param("tier", "emerald_plus")
                        .param("position", "mid"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.championId").value(103))
                .andExpect(jsonPath("$.data.mode").value("ranked"))
                .andExpect(jsonPath("$.data.region").value("kr"))
                .andExpect(jsonPath("$.data.tier").value("emerald_plus"))
                .andExpect(jsonPath("$.data.position").value("mid"))
                .andExpect(jsonPath("$.data.stats.winRate").value(0.51))
                .andExpect(jsonPath("$.data.summonerSpells[0].ids[0]").value(4))
                .andExpect(jsonPath("$.data.coreItems[0].ids[2]").value(4645))
                .andExpect(jsonPath("$.data.lastItems[0].ids[0]").value(3089));
    }

    @Test
    void rankedDetailRequiresSupportedKrTierAndPosition() throws Exception {
        MockMvc mockMvc = mockMvc(
                query -> detail(query.tier(), query.position()),
                query -> championList(query.tier())
        );

        mockMvc.perform(get("/api/v1/opgg/champions/103/detail")
                        .param("mode", "ranked")
                        .param("region", "na")
                        .param("tier", "emerald_plus")
                        .param("position", "mid"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400));

        mockMvc.perform(get("/api/v1/opgg/champions/103/detail")
                        .param("mode", "ranked")
                        .param("region", "kr")
                        .param("tier", "emerald_plus")
                        .param("position", "none"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400));
    }

    @Test
    void nonRankedDetailNormalizesMissingFiltersToAllAndNone() throws Exception {
        MockMvc mockMvc = mockMvc(
                query -> detail(query.tier(), query.position()),
                query -> championList(query.tier())
        );

        mockMvc.perform(get("/api/v1/opgg/champions/103/detail")
                        .param("mode", "aram")
                        .param("region", "kr"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.tier").value("all"))
                .andExpect(jsonPath("$.data.position").value("none"));
    }

    @Test
    void listEndpointReturnsChampionTierRowsWithoutChampionSelection() throws Exception {
        MockMvc mockMvc = mockMvc(
                query -> detail(query.tier(), query.position()),
                query -> championList(query.tier())
        );

        mockMvc.perform(get("/api/v1/opgg/champions")
                        .param("mode", "ranked")
                        .param("region", "kr")
                        .param("tier", "emerald_plus"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.mode").value("ranked"))
                .andExpect(jsonPath("$.data.region").value("kr"))
                .andExpect(jsonPath("$.data.tier").value("emerald_plus"))
                .andExpect(jsonPath("$.data.items[0].championId").value(103))
                .andExpect(jsonPath("$.data.items[0].rank").value(7))
                .andExpect(jsonPath("$.data.items[0].positions[0].position").value("mid"))
                .andExpect(jsonPath("$.data.items[0].positions[0].counters[0].championId").value(238));
    }

    @Test
    void sourceFailuresReturnGatewayErrors() throws Exception {
        MockMvc mockMvc = mockMvc(
                query -> {
                    throw new OpggSourceException("OP.GG source failed");
                },
                query -> {
                    throw new OpggSourceException("OP.GG source failed");
                }
        );

        mockMvc.perform(get("/api/v1/opgg/champions")
                        .param("mode", "ranked")
                        .param("region", "kr")
                        .param("tier", "emerald_plus"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value(502))
                .andExpect(jsonPath("$.message").value("OP.GG source failed"));
    }

    private static MockMvc mockMvc(
            OpggChampionDetailProvider detailProvider,
            OpggChampionListProvider listProvider
    ) {
        return MockMvcBuilders
                .standaloneSetup(new OpggChampionController(detailProvider, listProvider))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    private static OpggChampionDetail detail(String tier, String position) {
        return new OpggChampionDetail(
                103,
                "Ahri",
                "ranked",
                "kr",
                tier,
                position,
                "16.10",
                Instant.parse("2026-05-31T08:00:00Z"),
                new OpggChampionStats(1000, 0.51, 0.12, 0.03, 2.6),
                List.of(new OpggBuildOption("spells", List.of(4, 12), List.of(), 100L, 0.52, 0.6)),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(new OpggBuildOption("core", List.of(3118, 3152, 4645), List.of(), 70L, 0.54, 0.19)),
                List.of(new OpggBuildOption("last", List.of(3089), List.of(), 30L, 0.63, 0.12)),
                List.of(new OpggBuildOption("augments", List.of(1133), List.of(), null, 0.86, 0.05))
        );
    }

    private static OpggChampionList championList(String tier) {
        return new OpggChampionList(
                "ranked",
                "kr",
                tier,
                "16.10",
                Instant.parse("2026-05-31T08:00:00Z"),
                List.of(new OpggChampionListItem(
                        103,
                        1,
                        7,
                        new OpggChampionStats(0, 0.51, 0.12, 0.03, 2.6),
                        List.of(new OpggChampionPositionStats(
                                "mid",
                                0,
                                2,
                                new OpggChampionStats(0, 0.50, 0.10, 0.03, 2.5),
                                List.of(new OpggChampionCounter(238, 1200, 590L))
                        ))
                ))
        );
    }
}
