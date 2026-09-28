package io.rankpeek.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 预组队标记
 * 用于标识同一预组队内的成员名称与类型
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class PreGroupMarker {

    /**
     * 预组队名称（如"队伍1"）
     */
    private String name;

    /**
     * 标记类型（success, warning, error, info）
     */
    private String type;

    /**
     * 创建空标记
     */
    public static PreGroupMarker empty() {
        return PreGroupMarker.builder()
                .name("")
                .type("")
                .build();
    }
}
