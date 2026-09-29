package io.rankpeek.service.matchhistory;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MatchHistorySourceTest {

    @Test
    void fromRequest_acceptsCacheSource() {
        assertThat(MatchHistorySource.fromRequest("cache")).isEqualTo(MatchHistorySource.CACHE);
    }
}
