package io.rankpeek.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Data
@Builder(toBuilder = true)
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class UserStoreSnapshot {

    @Builder.Default
    private int schemaVersion = 1;

    @Builder.Default
    private Map<String, Object> settings = new LinkedHashMap<>();

    @Builder.Default
    private List<TagConfig> tagConfigs = new ArrayList<>();

    @Builder.Default
    private Map<String, Object> metadata = new LinkedHashMap<>();
}
