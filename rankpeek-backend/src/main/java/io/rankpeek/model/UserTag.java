package io.rankpeek.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/**
 * 用户标签模型
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserTag {

    @Builder.Default
    private RecordStatus recordStatus = RecordStatus.NORMAL;

    /**
     * 近期数据统计
     */
    private RecentData recentData;

    private RecentData championRecentData;

    /**
     * 标签列表
     */
    @Builder.Default
    private List<RankTag> tag = new ArrayList<>();
}
