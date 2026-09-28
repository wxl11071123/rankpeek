package io.rankpeek.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

/**
 * 召唤师信息模型
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class Summoner {

    /**
     * 游戏名称
     */
    @JsonProperty("gameName")
    private String gameName;

    /**
     * 标签
     */
    @JsonProperty("tagLine")
    private String tagLine;

    /**
     * 召唤师等级
     */
    @JsonProperty("summonerLevel")
    private Integer summonerLevel;

    /**
     * 头像 ID
     */
    @JsonProperty("profileIconId")
    private Integer profileIconId;

    /**
     * PUUID
     */
    @JsonProperty("puuid")
    private String puuid;

    /**
     * 召唤师 ID
     */
    @JsonProperty("summonerId")
    private Long summonerId;

    /**
     * 获取完整名称（游戏名#标签）
     */
    public String getFullName() {
        if (tagLine != null && !tagLine.isEmpty()) {
            return "%s#%s".formatted(gameName, tagLine);
        }
        return gameName;
    }
}
