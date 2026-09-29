package io.rankpeek.sgp;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class SgpStatus {

    private boolean supported;
    private String platformId;
    private String sgpServerId;
    private boolean matchHistorySupported;
    private boolean commonSupported;
    private boolean tokenReady;
    private SgpAuthState authState;
    private String matchHistoryBaseUrl;
    private String commonBaseUrl;
    private String message;
}
