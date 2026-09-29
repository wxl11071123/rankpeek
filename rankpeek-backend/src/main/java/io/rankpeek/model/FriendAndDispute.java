package io.rankpeek.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/**
 * 好友/冤家数据
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FriendAndDispute {

    /**
     * 好友组队胜率
     */
    @Builder.Default
    private Integer friendsRate = 0;

    /**
     * 冤家组队胜率
     */
    @Builder.Default
    private Integer disputeRate = 0;

    /**
     * 好友列表
     */
    @Builder.Default
    private List<OneGamePlayerSummoner> friendsSummoner = new ArrayList<>();

    /**
     * 冤家列表
     */
    @Builder.Default
    private List<OneGamePlayerSummoner> disputeSummoner = new ArrayList<>();
}
