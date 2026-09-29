package io.rankpeek.controller;

import io.rankpeek.model.ApiResponse;
import io.rankpeek.sgp.SgpAuthState;
import io.rankpeek.sgp.SgpStatus;
import io.rankpeek.sgp.SgpServerResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SgpStatusControllerTest {

    @Mock
    private SgpServerResolver resolver;

    private SgpStatusController controller;

    @BeforeEach
    void setUp() {
        controller = new SgpStatusController(resolver);
    }

    @Test
    void getStatusReturnsResolverStatusWithoutRequestingSgpNetwork() {
        SgpStatus status = SgpStatus.builder()
                .supported(true)
                .platformId("NA1")
                .sgpServerId("NA1")
                .matchHistorySupported(true)
                .commonSupported(true)
                .tokenReady(true)
                .authState(SgpAuthState.builder()
                        .entitlementsTokenReady(true)
                        .leagueSessionTokenReady(true)
                        .ready(true)
                        .message("SGP token ready")
                        .build())
                .matchHistoryBaseUrl("https://usw2-red.pp.sgp.pvp.net")
                .commonBaseUrl("https://na-red.lol.sgp.pvp.net")
                .message("SGP supported")
                .build();
        when(resolver.resolveCurrentStatus()).thenReturn(status);

        ApiResponse<SgpStatus> response = controller.getStatus();

        assertThat(response.getCode()).isEqualTo(200);
        assertThat(response.getData()).isSameAs(status);
    }
}
