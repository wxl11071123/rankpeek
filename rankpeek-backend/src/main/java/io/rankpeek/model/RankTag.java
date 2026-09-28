package io.rankpeek.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 排位标签
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RankTag {

    /**
     * 是否正面标签
     */
    private Boolean good;

    /**
     * 标签名称
     */
    private String tagName;

    /**
     * 标签描述
     */
    private String tagDesc;
}
