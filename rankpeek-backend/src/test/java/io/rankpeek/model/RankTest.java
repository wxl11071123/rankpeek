package io.rankpeek.model;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RankTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void queueInfoUsesExplicitLossesWhenTheyAreAvailable() throws Exception {
        Rank rank = readRank("""
                {
                  "queueMap": {
                    "RANKED_SOLO_5x5": {
                      "queueType": "RANKED_SOLO_5x5",
                      "tier": "PLATINUM",
                      "division": "III",
                      "leaguePoints": 12,
                      "wins": 292,
                      "losses": 308
                    }
                  }
                }
                """);

        Rank.QueueInfo solo = rank.getQueueMap().getRankedSolo5x5();

        assertThat(solo.getWins()).isEqualTo(292);
        assertThat(solo.getLosses()).isEqualTo(308);
        assertThat(solo.getTotalGames()).isEqualTo(600);
    }

    @Test
    void queueInfoDerivesLossesFromGamesWhenLossesAreMissingOrZero() throws Exception {
        Rank rank = readRank("""
                {
                  "queueMap": {
                    "RANKED_SOLO_5x5": {
                      "queueType": "RANKED_SOLO_5x5",
                      "tier": "PLATINUM",
                      "division": "III",
                      "leaguePoints": 12,
                      "wins": 292,
                      "losses": 0,
                      "games": 600
                    }
                  }
                }
                """);

        Rank.QueueInfo solo = rank.getQueueMap().getRankedSolo5x5();

        assertThat(solo.getLosses()).isEqualTo(308);
        assertThat(solo.getTotalGames()).isEqualTo(600);
    }

    @Test
    void queueInfoDoesNotSerializeMissingLossesAsZeroLosses() throws Exception {
        Rank rank = readRank("""
                {
                  "queueMap": {
                    "RANKED_SOLO_5x5": {
                      "queueType": "RANKED_SOLO_5x5",
                      "tier": "PLATINUM",
                      "division": "III",
                      "leaguePoints": 12,
                      "wins": 292,
                      "losses": 0
                    }
                  }
                }
                """);

        Rank.QueueInfo solo = rank.getQueueMap().getRankedSolo5x5();
        JsonNode serializedSolo = objectMapper.valueToTree(solo);

        assertThat(solo.getLosses()).isNull();
        assertThat(solo.getTotalGames()).isNull();
        assertThat(serializedSolo.get("losses").isNull()).isTrue();
        assertThat(serializedSolo.get("totalGames").isNull()).isTrue();
    }

    private Rank readRank(String json) throws Exception {
        return objectMapper.readValue(json, Rank.class);
    }
}
