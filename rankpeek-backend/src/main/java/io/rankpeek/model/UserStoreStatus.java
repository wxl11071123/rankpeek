package io.rankpeek.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserStoreStatus {

    private boolean enabled;
    private String path;
    private long sizeBytes;
    private Long updatedAt;
    private int tagConfigCount;
}
