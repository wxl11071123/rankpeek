package io.rankpeek.sgp;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class SgpAuthState {

    @JsonIgnore
    @ToString.Exclude
    private String entitlementsToken;

    @JsonIgnore
    @ToString.Exclude
    private String leagueSessionToken;

    private boolean entitlementsTokenReady;
    private boolean leagueSessionTokenReady;
    private boolean ready;
    private String message;
}
