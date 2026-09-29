package io.rankpeek.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 游戏资源详情模型
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class AssetDetails {

    /**
     * ID
     */
    private Long id;

    /**
     * 名称
     */
    private String name;

    /**
     * 描述
     */
    private String description;

    /**
     * 类型 (item, rune, champion, spell)
     */
    private String type;

    /**
     * 图标 URL
     */
    private String iconUrl;

    /**
     * 额外信息
     */
    private Object extra;

    /**
     * 物品详情
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ItemDetails {
        private Integer id;
        private String name;
        private String description;
        private String plaintext;
        private Integer goldBase;
        private Integer goldTotal;
        private Integer goldSell;
        private Boolean consumable;
    }

    /**
     * 符文详情
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RuneDetails {
        private Integer id;
        private String name;
        private String shortDesc;
        private String longDesc;
        private String iconPath;
        private Integer treeId;
        private String treeName;
    }

    /**
     * 召唤师技能详情
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SpellDetails {
        private Integer id;
        private String name;
        private String description;
        private String tooltip;
        private Integer cooldown;
        private Integer summonerLevel;
    }
}
