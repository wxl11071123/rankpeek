package io.rankpeek.simulator;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class SimulatorControllerTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(SimulatorTestConfig.class);

    @Test
    void simulatorControllerIsNotRegisteredWhenPropertyIsMissing() {
        contextRunner.run(context -> {
            assertThat(context).doesNotHaveBean(SimulatorController.class);
            assertThat(context).doesNotHaveBean(SimulatorRuntimeService.class);
        });
    }

    @Test
    void simulatorDevApiIsAvailableWhenPropertyIsEnabled() {
        contextRunner
                .withPropertyValues("rankpeek.simulator.enabled=true")
                .run(context -> {
                    MockMvc mockMvc = MockMvcBuilders
                            .standaloneSetup(context.getBean(SimulatorController.class))
                            .build();

                    mockMvc.perform(get("/api/dev/simulator/state"))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$.code").value(200))
                            .andExpect(jsonPath("$.data.source").value("simulator"))
                            .andExpect(jsonPath("$.data.phase").value("IDLE"));

                    mockMvc.perform(post("/api/dev/simulator/start"))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$.data.source").value("simulator"))
                            .andExpect(jsonPath("$.data.state.phase").value("LOBBY"));

                    mockMvc.perform(get("/api/dev/simulator/session-data"))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$.data.source").value("simulator"))
                            .andExpect(jsonPath("$.data.phase").value("Lobby"));

                    mockMvc.perform(post("/api/dev/simulator/next"))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$.data.state.phase").value("MATCHMAKING"));

                    mockMvc.perform(post("/api/dev/simulator/next"))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$.data.state.phase").value("READY_CHECK"));

                    mockMvc.perform(post("/api/dev/simulator/next"))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$.data.state.phase").value("CHAMP_SELECT"))
                            .andExpect(jsonPath("$.data.teammates").isNotEmpty())
                            .andExpect(jsonPath("$.data.opponents").isEmpty());

                    mockMvc.perform(get("/api/dev/simulator/session-data"))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$.data.source").value("simulator"))
                            .andExpect(jsonPath("$.data.phase").value("ChampSelect"))
                            .andExpect(jsonPath("$.data.teammates").isNotEmpty())
                            .andExpect(jsonPath("$.data.opponents").isEmpty());

                    mockMvc.perform(post("/api/dev/simulator/next"))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$.data.state.phase").value("GAME_LOADING"))
                            .andExpect(jsonPath("$.data.opponents").isNotEmpty());

                    mockMvc.perform(get("/api/dev/simulator/session-data"))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$.data.phase").value("GameStart"))
                            .andExpect(jsonPath("$.data.opponents").isNotEmpty());

                    mockMvc.perform(post("/api/dev/simulator/next"))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$.data.state.phase").value("IN_GAME"));

                    mockMvc.perform(post("/api/dev/simulator/next"))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$.data.state.phase").value("END_OF_GAME"));

                    mockMvc.perform(post("/api/dev/simulator/next"))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$.data.state.phase").value("POST_GAME"));

                    mockMvc.perform(get("/api/dev/simulator/session-data"))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$.data.source").value("simulator"))
                            .andExpect(jsonPath("$.data.phase").value("PostGame"))
                            .andExpect(jsonPath("$.data.matchSummary.matchId").value("SIM-MATCH-0001"));
                });
    }

    @Configuration(proxyBeanMethods = false)
    @Import({
            SimulatorFixtureService.class,
            SimulatorRuntimeService.class,
            SimulatorSessionMapper.class,
            SimulatorController.class
    })
    static class SimulatorTestConfig {
    }
}
