package io.rankpeek.sgp;

import com.fasterxml.jackson.databind.JsonNode;
import io.rankpeek.service.LcuHttpClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class SgpTokenService {

    private static final String ENTITLEMENTS_TOKEN_URI = "entitlements/v1/token";
    private static final String LEAGUE_SESSION_TOKEN_URI = "lol-rso-auth/v1/authorization/access-token";

    private final LcuHttpClient lcuHttpClient;

    public SgpAuthState getAuthState() {
        String entitlementsToken = readToken(
                ENTITLEMENTS_TOKEN_URI,
                "entitlements",
                "entitlementsToken",
                "token",
                "accessToken"
        );
        String leagueSessionToken = readToken(
                LEAGUE_SESSION_TOKEN_URI,
                "token",
                "accessToken"
        );

        boolean entitlementsReady = hasText(entitlementsToken);
        boolean leagueSessionReady = hasText(leagueSessionToken);
        boolean ready = entitlementsReady && leagueSessionReady;

        return SgpAuthState.builder()
                .entitlementsToken(entitlementsToken)
                .leagueSessionToken(leagueSessionToken)
                .entitlementsTokenReady(entitlementsReady)
                .leagueSessionTokenReady(leagueSessionReady)
                .ready(ready)
                .message(resolveMessage(entitlementsReady, leagueSessionReady))
                .build();
    }

    private String readToken(String uri, String... tokenFields) {
        try {
            JsonNode response = lcuHttpClient.get(uri, JsonNode.class);
            String token = firstText(response, tokenFields);
            if (hasText(token)) {
                log.debug("SGP token read: uri={}, tokenReady=true", uri);
            }
            return token;
        } catch (Exception e) {
            log.debug("SGP token read failed: uri={}, errorType={}", uri, e.getClass().getSimpleName());
            return null;
        }
    }

    private String firstText(JsonNode node, String... fieldNames) {
        if (node == null || node.isNull()) {
            return null;
        }
        for (String fieldName : fieldNames) {
            JsonNode value = node.get(fieldName);
            if (value != null && value.isTextual() && hasText(value.asText())) {
                return value.asText().trim();
            }
        }
        return null;
    }

    private String resolveMessage(boolean entitlementsReady, boolean leagueSessionReady) {
        if (entitlementsReady && leagueSessionReady) {
            return "SGP token ready";
        }
        if (!entitlementsReady && !leagueSessionReady) {
            return "SGP token missing: entitlements token, league session token";
        }
        if (!entitlementsReady) {
            return "SGP token missing: entitlements token";
        }
        return "SGP token missing: league session token";
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
