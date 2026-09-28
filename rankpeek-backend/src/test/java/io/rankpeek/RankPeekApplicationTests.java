package io.rankpeek;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = "rankpeek.local-data-root=target/test-data/context")
class RankPeekApplicationTests {

    @Test
    void contextLoads() {
        // Verify the Spring application context starts successfully.
    }
}
