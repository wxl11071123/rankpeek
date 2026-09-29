package io.rankpeek.sgp;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;

final class SgpJsonMapperSupport {

    private SgpJsonMapperSupport() {
    }

    static List<JsonNode> extractGames(JsonNode response) {
        List<JsonNode> games = new ArrayList<>();
        JsonNode gamesNode = firstArray(
                response,
                path(response, "games", "games"),
                path(response, "data", "games", "games"),
                path(response, "data", "games"),
                path(response, "games")
        );
        if (gamesNode != null) {
            gamesNode.forEach(game -> {
                JsonNode extractedGame = extractGame(game);
                games.add(extractedGame != null ? extractedGame : game);
            });
            return games;
        }

        JsonNode singleGame = extractGame(response);
        if (singleGame != null) {
            games.add(singleGame);
        }
        return games;
    }

    static JsonNode extractGame(JsonNode response) {
        if (!isObject(response)) {
            return null;
        }
        JsonNode nestedGame = firstObject(response.get("game"), response.get("json"), response.get("data"), response.get("summary"), response.get("details"));
        if (nestedGame != null) {
            return nestedGame;
        }
        if (response.has("gameId") || response.has("participants")) {
            return response;
        }
        return null;
    }

    static JsonNode participants(JsonNode game) {
        return firstArray(
                value(game, "participants"),
                value(game, "participantIdentities"),
                path(game, "roster", "participants")
        );
    }

    static JsonNode participantIdentities(JsonNode game) {
        return firstArray(
                value(game, "participantIdentities"),
                value(game, "identities")
        );
    }

    static JsonNode statsNode(JsonNode participant) {
        JsonNode stats = firstObject(
                value(participant, "stats"),
                value(participant, "playerStats"),
                value(participant, "participantStats")
        );
        return stats == null ? participant : stats;
    }

    static JsonNode playerNode(JsonNode participantOrIdentity) {
        JsonNode player = firstObject(
                value(participantOrIdentity, "player"),
                path(participantOrIdentity, "identity", "player"),
                value(participantOrIdentity, "summoner")
        );
        return player == null ? participantOrIdentity : player;
    }

    static boolean isRemake(JsonNode game, int durationThresholdSeconds) {
        if (!isObject(game)) {
            return false;
        }
        if (Boolean.TRUE.equals(readBoolean(game, "isRemake", "remake"))) {
            return true;
        }
        Integer duration = readInt(game, "gameDuration", "duration");
        return duration != null && duration < durationThresholdSeconds;
    }

    static Integer readInt(JsonNode node, String... fieldNames) {
        Long value = readLong(node, fieldNames);
        if (value == null) {
            return null;
        }
        if (value > Integer.MAX_VALUE) {
            return Integer.MAX_VALUE;
        }
        if (value < Integer.MIN_VALUE) {
            return Integer.MIN_VALUE;
        }
        return value.intValue();
    }

    static Long readLong(JsonNode node, String... fieldNames) {
        JsonNode value = firstValue(node, fieldNames);
        if (value == null || value.isNull()) {
            return null;
        }
        if (value.isIntegralNumber()) {
            return value.asLong();
        }
        if (value.isNumber()) {
            return Math.round(value.asDouble());
        }
        if (value.isTextual() && !value.asText().isBlank()) {
            try {
                return Long.parseLong(value.asText().trim());
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    static Boolean readBoolean(JsonNode node, String... fieldNames) {
        JsonNode value = firstValue(node, fieldNames);
        if (value == null || value.isNull()) {
            return null;
        }
        if (value.isBoolean()) {
            return value.asBoolean();
        }
        if (value.isNumber()) {
            return value.asInt() != 0;
        }
        if (value.isTextual() && !value.asText().isBlank()) {
            return Boolean.parseBoolean(value.asText().trim());
        }
        return null;
    }

    static String readText(JsonNode node, String... fieldNames) {
        JsonNode value = firstValue(node, fieldNames);
        if (value == null || value.isNull()) {
            return null;
        }
        String text = value.asText(null);
        return text == null || text.isBlank() ? null : text.trim();
    }

    static JsonNode firstValue(JsonNode node, String... fieldNames) {
        if (!isObject(node)) {
            return null;
        }
        for (String fieldName : fieldNames) {
            JsonNode value = node.get(fieldName);
            if (value != null && !value.isNull()) {
                return value;
            }
        }
        return null;
    }

    static JsonNode value(JsonNode node, String fieldName) {
        return isObject(node) ? node.get(fieldName) : null;
    }

    static JsonNode path(JsonNode node, String... fieldNames) {
        JsonNode current = node;
        for (String fieldName : fieldNames) {
            if (!isObject(current)) {
                return null;
            }
            current = current.get(fieldName);
        }
        return current == null || current.isNull() ? null : current;
    }

    static JsonNode firstArray(JsonNode... nodes) {
        for (JsonNode node : nodes) {
            if (node != null && node.isArray()) {
                return node;
            }
        }
        return null;
    }

    static JsonNode firstObject(JsonNode... nodes) {
        for (JsonNode node : nodes) {
            if (isObject(node)) {
                return node;
            }
        }
        return null;
    }

    static boolean isObject(JsonNode node) {
        return node != null && node.isObject();
    }
}
