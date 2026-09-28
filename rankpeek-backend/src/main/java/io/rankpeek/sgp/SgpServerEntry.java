package io.rankpeek.sgp;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class SgpServerEntry {

    private String platformId;
    private List<String> aliases = new ArrayList<>();
    private String sgpServerId;
    private String matchHistoryBaseUrl;
    private String commonBaseUrl;

    public boolean isMatchHistorySupported() {
        return hasText(matchHistoryBaseUrl);
    }

    public boolean isCommonSupported() {
        return hasText(commonBaseUrl);
    }

    boolean matchesPlatformId(String candidate) {
        String normalizedCandidate = normalize(candidate);
        if (normalizedCandidate == null) {
            return false;
        }
        if (normalizedCandidate.equals(normalize(platformId)) || normalizedCandidate.equals(normalize(sgpServerId))) {
            return true;
        }
        return aliases != null && aliases.stream()
                .map(SgpServerEntry::normalize)
                .anyMatch(normalizedCandidate::equals);
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private static String normalize(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim().toUpperCase();
    }
}
