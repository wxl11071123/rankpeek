package io.rankpeek.controller;

import io.rankpeek.model.UserStoreStatus;
import io.rankpeek.service.UserStoreService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class UserStoreControllerTest {

    private UserStoreService userStoreService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        userStoreService = mock(UserStoreService.class);
        mockMvc = MockMvcBuilders.standaloneSetup(new UserStoreController(userStoreService)).build();
    }

    @Test
    void getStatus_returnsUserStoreDiagnostics() throws Exception {
        when(userStoreService.getStatus()).thenReturn(UserStoreStatus.builder()
                .enabled(true)
                .path("C:/RankPeek/user-store/rankpeek-user-store.json")
                .sizeBytes(2048L)
                .updatedAt(1710000000000L)
                .tagConfigCount(3)
                .build());

        mockMvc.perform(get("/api/v1/user-store/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.message").value("success"))
                .andExpect(jsonPath("$.data.enabled").value(true))
                .andExpect(jsonPath("$.data.path").value("C:/RankPeek/user-store/rankpeek-user-store.json"))
                .andExpect(jsonPath("$.data.sizeBytes").value(2048))
                .andExpect(jsonPath("$.data.updatedAt").value(1710000000000L))
                .andExpect(jsonPath("$.data.tagConfigCount").value(3));
    }
}
