package io.rankpeek.controller;

import io.rankpeek.model.ApiResponse;
import io.rankpeek.model.MatchHistory;
import io.rankpeek.model.UserTagSummary;
import io.rankpeek.model.UserTagSummaryFromMatchesRequest;
import io.rankpeek.service.UserTagService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserTagControllerTest {

    @Mock
    private UserTagService userTagService;

    private UserTagController controller;

    @BeforeEach
    void setUp() {
        controller = new UserTagController(userTagService);
    }

    @Test
    void summaryFromMatchesDelegatesPrefetchedMatchesWithoutRemoteFetch() {
        MatchHistory match = new MatchHistory();
        match.setGameId(1L);
        UserTagSummary summary = UserTagSummary.builder().build();
        UserTagSummaryFromMatchesRequest request = new UserTagSummaryFromMatchesRequest(
                "puuid-1",
                0,
                List.of(match)
        );

        when(userTagService.getUserTagSummaryFromMatches("puuid-1", 0, List.of(match))).thenReturn(summary);

        ApiResponse<UserTagSummary> response = controller.getUserTagSummaryFromMatches(request);

        assertThat(response.getData()).isSameAs(summary);
        verify(userTagService).getUserTagSummaryFromMatches("puuid-1", 0, List.of(match));
    }
}
