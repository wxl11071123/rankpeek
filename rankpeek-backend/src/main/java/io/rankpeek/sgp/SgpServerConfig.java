package io.rankpeek.sgp;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class SgpServerConfig {

    private List<SgpServerEntry> servers = new ArrayList<>();
}
