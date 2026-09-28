package io.rankpeek.controller;

import io.rankpeek.model.SystemIdentity;
import io.rankpeek.service.LcuHttpClient;
import io.rankpeek.service.SystemIdentityService;
import io.rankpeek.service.SystemShutdownService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class SystemControllerTest {

    private SystemIdentityService identityService;
    private SystemShutdownService shutdownService;
    private LcuHttpClient lcuHttpClient;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        identityService = mock(SystemIdentityService.class);
        shutdownService = mock(SystemShutdownService.class);
        lcuHttpClient = mock(LcuHttpClient.class);
        mockMvc = MockMvcBuilders.standaloneSetup(new SystemController(shutdownService, identityService, lcuHttpClient)).build();
    }

    @Test
    void identity_returnsBackendProcessIdentity() throws Exception {
        when(identityService.getIdentity()).thenReturn(new SystemIdentity(
                12345L,
                "C:/RankPeek",
                "C:/RankPeek/cache/rankpeek-cache",
                "2026-05-01T01:02:03Z",
                "spawned-backend"
        ));

        mockMvc.perform(get("/api/v1/system/identity"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.message").value("success"))
                .andExpect(jsonPath("$.data.pid").value(12345L))
                .andExpect(jsonPath("$.data.localDataRoot").value("C:/RankPeek"))
                .andExpect(jsonPath("$.data.cacheDatabasePath").value("C:/RankPeek/cache/rankpeek-cache"))
                .andExpect(jsonPath("$.data.startedAt").value("2026-05-01T01:02:03Z"))
                .andExpect(jsonPath("$.data.instanceId").value("spawned-backend"));
    }
}
