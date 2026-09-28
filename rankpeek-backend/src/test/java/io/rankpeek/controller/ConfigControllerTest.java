package io.rankpeek.controller;

import io.rankpeek.config.AppConfig;
import io.rankpeek.service.AssetService;
import io.rankpeek.service.UserStoreService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ConfigControllerTest {

    private AppConfig appConfig;
    private UserStoreService userStoreService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        appConfig = new AppConfig();
        userStoreService = mock(UserStoreService.class);
        AssetService assetService = mock(AssetService.class);
        mockMvc = MockMvcBuilders.standaloneSetup(new ConfigController(appConfig, assetService, userStoreService)).build();
    }

    @Test
    void getAllConfig_readsDefaultQueueModeFromUserStore() throws Exception {
        when(userStoreService.getDefaultMatchQueueMode()).thenReturn(440);

        mockMvc.perform(get("/api/v1/config"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.settings.match.defaultQueueMode").value(440));
    }

    @Test
    void getConfigValue_readsDefaultQueueModeFromUserStore() throws Exception {
        when(userStoreService.getDefaultMatchQueueMode()).thenReturn(420);

        mockMvc.perform(get("/api/v1/config/settings.match.defaultQueueMode"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").value(420));
    }

    @Test
    void setConfig_persistsDefaultQueueModeToUserStore() throws Exception {
        mockMvc.perform(put("/api/v1/config/settings.match.defaultQueueMode")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"value\":450}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));

        verify(userStoreService).setDefaultMatchQueueMode(450);
    }
}
