package io.rankpeek.sgp;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.rankpeek.service.LcuHttpClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SgpTokenServiceTest {

    @Mock
    private LcuHttpClient lcuHttpClient;

    private SgpTokenService tokenService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        tokenService = new SgpTokenService(lcuHttpClient);
    }

    @Test
    void getAuthState_returnsMissingStateWhenLcuCannotProvideTokens() {
        when(lcuHttpClient.get("entitlements/v1/token", JsonNode.class))
                .thenThrow(new RuntimeException("LCU offline"));
        when(lcuHttpClient.get("lol-rso-auth/v1/authorization/access-token", JsonNode.class))
                .thenThrow(new RuntimeException("LCU offline"));

        SgpAuthState state = tokenService.getAuthState();

        assertThat(state.isEntitlementsTokenReady()).isFalse();
        assertThat(state.isLeagueSessionTokenReady()).isFalse();
        assertThat(state.isReady()).isFalse();
        assertThat(state.getMessage()).contains("token missing");
    }

    @Test
    void getAuthState_returnsReadyStateWhenBothTokensArePresent() {
        when(lcuHttpClient.get("entitlements/v1/token", JsonNode.class))
                .thenReturn(tokenResponse("entitlements", "entitlements-token-secret"));
        when(lcuHttpClient.get("lol-rso-auth/v1/authorization/access-token", JsonNode.class))
                .thenReturn(tokenResponse("token", "league-session-token-secret"));

        SgpAuthState state = tokenService.getAuthState();

        assertThat(state.isEntitlementsTokenReady()).isTrue();
        assertThat(state.isLeagueSessionTokenReady()).isTrue();
        assertThat(state.isReady()).isTrue();
        assertThat(state.getEntitlementsToken()).isEqualTo("entitlements-token-secret");
        assertThat(state.getLeagueSessionToken()).isEqualTo("league-session-token-secret");
    }

    @Test
    void authStateSerializationDoesNotExposeRawTokens() throws Exception {
        SgpAuthState state = SgpAuthState.builder()
                .entitlementsToken("entitlements-token-secret")
                .leagueSessionToken("league-session-token-secret")
                .entitlementsTokenReady(true)
                .leagueSessionTokenReady(true)
                .ready(true)
                .message("SGP token ready")
                .build();

        String json = objectMapper.writeValueAsString(state);

        assertThat(json).doesNotContain("entitlements-token-secret");
        assertThat(json).doesNotContain("league-session-token-secret");
        assertThat(json).contains("entitlementsTokenReady");
        assertThat(json).contains("leagueSessionTokenReady");
    }

    private ObjectNode tokenResponse(String fieldName, String token) {
        ObjectNode response = objectMapper.createObjectNode();
        response.put(fieldName, token);
        return response;
    }
}
