package io.rankpeek.model;

import java.util.HashMap;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * ARAM 平衡性数据
 * 来源：Fandom Wiki
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class AramBalanceData {

    /**
     * 英雄 ID
     */
    private Integer championId;

    /**
     * 英雄名称
     */
    private String championName;

    /**
     * 伤害输出倍率
     */
    @JsonProperty("dmg_dealt")
    private Double dmgDealt;

    /**
     * 承受伤害倍率
     */
    @JsonProperty("dmg_taken")
    private Double dmgTaken;

    /**
     * 治疗倍率
     */
    private Double healing;

    /**
     * 护盾倍率
     */
    private Double shielding;

    /**
     * 技能急速加成
     */
    @JsonProperty("ability_haste")
    private Double abilityHaste;

    /**
     * 法力回复加成
     */
    @JsonProperty("mana_regen")
    private Double manaRegen;

    /**
     * 能量回复加成
     */
    @JsonProperty("energy_regen")
    private Double energyRegen;

    /**
     * 攻击速度加成
     */
    @JsonProperty("attack_speed")
    private Double attackSpeed;

    /**
     * 移动速度加成
     */
    @JsonProperty("movement_speed")
    private Double movementSpeed;

    /**
     * 韧性加成
     */
    private Double tenacity;

    /**
     * 其他额外字段（动态存储）
     */
    @Builder.Default
    @JsonProperty("extra_fields")
    private Map<String, Double> extraFields = new HashMap<>();

    /**
     * 获取字段值（支持预定义字段和动态字段）
     */
    public Double getField(String fieldName) {
        return switch (fieldName) {
            case "dmg_dealt", "dmgDealt" -> dmgDealt;
            case "dmg_taken", "dmgTaken" -> dmgTaken;
            case "healing" -> healing;
            case "shielding" -> shielding;
            case "ability_haste", "abilityHaste" -> abilityHaste;
            case "mana_regen", "manaRegen" -> manaRegen;
            case "energy_regen", "energyRegen" -> energyRegen;
            case "attack_speed", "attackSpeed" -> attackSpeed;
            case "movement_speed", "movementSpeed" -> movementSpeed;
            case "tenacity" -> tenacity;
            default -> extraFields.get(fieldName);
        };
    }

    /**
     * 设置字段值
     */
    public void setField(String fieldName, Double value) {
        switch (fieldName) {
            case "dmg_dealt" -> dmgDealt = value;
            case "dmg_taken" -> dmgTaken = value;
            case "healing" -> healing = value;
            case "shielding" -> shielding = value;
            case "ability_haste" -> abilityHaste = value;
            case "mana_regen" -> manaRegen = value;
            case "energy_regen" -> energyRegen = value;
            case "attack_speed" -> attackSpeed = value;
            case "movement_speed" -> movementSpeed = value;
            case "tenacity" -> tenacity = value;
            default -> extraFields.put(fieldName, value);
        }
    }

    /**
     * 判断是否有 ARAM 调整数据
     */
    public boolean hasData() {
        return dmgDealt != null || dmgTaken != null || healing != null ||
               shielding != null || abilityHaste != null || manaRegen != null ||
               energyRegen != null || attackSpeed != null || movementSpeed != null ||
               tenacity != null || !extraFields.isEmpty();
    }

    /**
     * 判断是否有增益
     */
    public boolean hasBuff() {
        return (dmgDealt != null && dmgDealt > 1.0) ||
               (dmgTaken != null && dmgTaken < 1.0) ||
               (healing != null && healing > 1.0) ||
               (shielding != null && shielding > 1.0) ||
               (abilityHaste != null && abilityHaste > 0) ||
               (manaRegen != null && manaRegen > 0) ||
               (energyRegen != null && energyRegen > 0) ||
               (attackSpeed != null && attackSpeed > 0) ||
               (movementSpeed != null && movementSpeed > 0) ||
               (tenacity != null && tenacity > 0) ||
               extraFields.values().stream().anyMatch(v -> v != null && (v > 1.0 || v > 0));
    }

    /**
     * 判断是否有削弱
     */
    public boolean hasNerf() {
        return (dmgDealt != null && dmgDealt < 1.0) ||
               (dmgTaken != null && dmgTaken > 1.0) ||
               (healing != null && healing < 1.0) ||
               (shielding != null && shielding < 1.0) ||
               (abilityHaste != null && abilityHaste < 0) ||
               (manaRegen != null && manaRegen < 0) ||
               (energyRegen != null && energyRegen < 0) ||
               (attackSpeed != null && attackSpeed < 0) ||
               (movementSpeed != null && movementSpeed < 0) ||
               (tenacity != null && tenacity < 0) ||
               extraFields.values().stream().anyMatch(v -> v != null && (v < 1.0 || v < 0));
    }

    /**
     * 获取简要描述
     */
    public String getBrief() {
        StringBuilder sb = new StringBuilder();
        if (dmgDealt != null && dmgDealt != 1.0) {
            sb.append(String.format("伤害%.0f%% ", dmgDealt * 100));
        }
        if (dmgTaken != null && dmgTaken != 1.0) {
            sb.append(String.format("承伤%.0f%% ", dmgTaken * 100));
        }
        if (healing != null && healing != 1.0) {
            sb.append(String.format("治疗%.0f%% ", healing * 100));
        }
        if (shielding != null && shielding != 1.0) {
            sb.append(String.format("护盾%.0f%% ", shielding * 100));
        }
        if (abilityHaste != null && abilityHaste != 0) {
            sb.append(String.format("技能急速%+.0f ", abilityHaste));
        }
        return sb.toString().trim();
    }

    /**
     * 获取所有非空字段
     */
    public Map<String, Double> getAllFields() {
        Map<String, Double> all = new HashMap<>();
        if (dmgDealt != null) all.put("dmg_dealt", dmgDealt);
        if (dmgTaken != null) all.put("dmg_taken", dmgTaken);
        if (healing != null) all.put("healing", healing);
        if (shielding != null) all.put("shielding", shielding);
        if (abilityHaste != null) all.put("ability_haste", abilityHaste);
        if (manaRegen != null) all.put("mana_regen", manaRegen);
        if (energyRegen != null) all.put("energy_regen", energyRegen);
        if (attackSpeed != null) all.put("attack_speed", attackSpeed);
        if (movementSpeed != null) all.put("movement_speed", movementSpeed);
        if (tenacity != null) all.put("tenacity", tenacity);
        all.putAll(extraFields);
        return all;
    }
}
