package io.rankpeek.model;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 标签配置模型
 * 支持灵活的条件树结构
 */
@Data
@Builder(toBuilder = true)
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class TagConfig {

    /**
     * 标签 ID
     */
    private String id;

    /**
     * 标签名称（支持 {N} 占位符）
     */
    private String name;

    /**
     * 标签描述
     */
    private String desc;

    /**
     * 是否正面标签
     */
    private Boolean good;

    /**
     * 是否启用
     */
    @Builder.Default
    private Boolean enabled = true;

    /**
     * 是否默认标签
     */
    @Builder.Default
    private Boolean isDefault = false;

    /**
     * 条件树根节点
     */
    private TagCondition condition;

    // ========== 运算符 ==========

    @Getter
    public enum Operator {
        GT(">"),
        GTE(">="),
        LT("<"),
        LTE("<="),
        EQ("=="),
        NEQ("!=");

        private final String symbol;

        Operator(String symbol) {
            this.symbol = symbol;
        }

        public boolean check(double a, double b) {
            return switch (this) {
                case GT -> a > b;
                case GTE -> a >= b;
                case LT -> a < b;
                case LTE -> a <= b;
                case EQ -> Math.abs(a - b) < 0.001;
                case NEQ -> Math.abs(a - b) >= 0.001;
            };
        }

        public static Operator fromSymbol(String symbol) {
            for (Operator op : values()) {
                if (op.symbol.equals(symbol)) {
                    return op;
                }
            }
            throw new IllegalArgumentException("Unknown operator: " + symbol);
        }
    }

    // ========== 条件树节点 ==========

    @Data
    @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
    @JsonSubTypes({
            @JsonSubTypes.Type(value = TagCondition.AndCondition.class, name = "and"),
            @JsonSubTypes.Type(value = TagCondition.OrCondition.class, name = "or"),
            @JsonSubTypes.Type(value = TagCondition.NotCondition.class, name = "not"),
            @JsonSubTypes.Type(value = TagCondition.HistoryCondition.class, name = "history"),
            @JsonSubTypes.Type(value = TagCondition.CurrentQueueCondition.class, name = "currentQueue"),
            @JsonSubTypes.Type(value = TagCondition.CurrentChampionCondition.class, name = "currentChampion")
    })
    public static abstract class TagCondition {

        /**
         * AND 条件
         */
        @Data
        @EqualsAndHashCode(callSuper = false)
        @NoArgsConstructor
        @AllArgsConstructor
        @JsonIgnoreProperties(ignoreUnknown = true)
        @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
        public static class AndCondition extends TagCondition {
            private List<TagCondition> conditions;
        }

        /**
         * OR 条件
         */
        @Data
        @EqualsAndHashCode(callSuper = false)
        @NoArgsConstructor
        @AllArgsConstructor
        @JsonIgnoreProperties(ignoreUnknown = true)
        @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
        public static class OrCondition extends TagCondition {
            private List<TagCondition> conditions;
        }

        /**
         * NOT 条件
         */
        @Data
        @EqualsAndHashCode(callSuper = false)
        @NoArgsConstructor
        @AllArgsConstructor
        @JsonIgnoreProperties(ignoreUnknown = true)
        @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
        public static class NotCondition extends TagCondition {
            private TagCondition condition;
        }

        /**
         * 历史战绩条件
         */
        @Data
        @EqualsAndHashCode(callSuper = false)
        @NoArgsConstructor
        @AllArgsConstructor
        @JsonIgnoreProperties(ignoreUnknown = true)
        @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
        public static class HistoryCondition extends TagCondition {
            private List<MatchFilter> filters;
            private MatchRefresh refresh;
        }

        /**
         * 当前队列条件
         */
        @Data
        @EqualsAndHashCode(callSuper = false)
        @NoArgsConstructor
        @AllArgsConstructor
        @JsonIgnoreProperties(ignoreUnknown = true)
        @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
        public static class CurrentQueueCondition extends TagCondition {
            private List<Integer> ids;
        }

        /**
         * 当前英雄条件
         */
        @Data
        @EqualsAndHashCode(callSuper = false)
        @NoArgsConstructor
        @AllArgsConstructor
        @JsonIgnoreProperties(ignoreUnknown = true)
        @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
        public static class CurrentChampionCondition extends TagCondition {
            private List<Integer> ids;
        }
    }

    // ========== 过滤器 ==========

    @Data
    @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
    @JsonSubTypes({
            @JsonSubTypes.Type(value = MatchFilter.QueueFilter.class, name = "queue"),
            @JsonSubTypes.Type(value = MatchFilter.ChampionFilter.class, name = "champion"),
            @JsonSubTypes.Type(value = MatchFilter.StatFilter.class, name = "stat")
    })
    public static abstract class MatchFilter {

        @Data
        @EqualsAndHashCode(callSuper = false)
        @NoArgsConstructor
        @AllArgsConstructor
        @JsonIgnoreProperties(ignoreUnknown = true)
        public static class QueueFilter extends MatchFilter {
            private List<Integer> ids;
        }

        @Data
        @EqualsAndHashCode(callSuper = false)
        @NoArgsConstructor
        @AllArgsConstructor
        @JsonIgnoreProperties(ignoreUnknown = true)
        public static class ChampionFilter extends MatchFilter {
            private List<Integer> ids;
        }

        @Data
        @EqualsAndHashCode(callSuper = false)
        @NoArgsConstructor
        @AllArgsConstructor
        @JsonIgnoreProperties(ignoreUnknown = true)
        public static class StatFilter extends MatchFilter {
            private String metric;
            private Operator op;
            private Double value;
        }
    }

    // ========== 刷新器 ==========

    @Data
    @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
    @JsonSubTypes({
            @JsonSubTypes.Type(value = MatchRefresh.CountRefresh.class, name = "count"),
            @JsonSubTypes.Type(value = MatchRefresh.AverageRefresh.class, name = "average"),
            @JsonSubTypes.Type(value = MatchRefresh.SumRefresh.class, name = "sum"),
            @JsonSubTypes.Type(value = MatchRefresh.MaxRefresh.class, name = "max"),
            @JsonSubTypes.Type(value = MatchRefresh.MinRefresh.class, name = "min"),
            @JsonSubTypes.Type(value = MatchRefresh.StreakRefresh.class, name = "streak")
    })
    public static abstract class MatchRefresh {

        @Data
        @EqualsAndHashCode(callSuper = false)
        @NoArgsConstructor
        @AllArgsConstructor
        @JsonIgnoreProperties(ignoreUnknown = true)
        public static class CountRefresh extends MatchRefresh {
            private Operator op;
            private Double value;
        }

        @Data
        @EqualsAndHashCode(callSuper = false)
        @NoArgsConstructor
        @AllArgsConstructor
        @JsonIgnoreProperties(ignoreUnknown = true)
        public static class AverageRefresh extends MatchRefresh {
            private String metric;
            private Operator op;
            private Double value;

        }

        @Data
        @EqualsAndHashCode(callSuper = false)
        @NoArgsConstructor
        @AllArgsConstructor
        @JsonIgnoreProperties(ignoreUnknown = true)
        public static class SumRefresh extends MatchRefresh {
            private String metric;
            private Operator op;
            private Double value;
        }

        @Data
        @EqualsAndHashCode(callSuper = false)
        @NoArgsConstructor
        @AllArgsConstructor
        @JsonIgnoreProperties(ignoreUnknown = true)
        public static class MaxRefresh extends MatchRefresh {
            private String metric;
            private Operator op;
            private Double value;
        }

        @Data
        @EqualsAndHashCode(callSuper = false)
        @NoArgsConstructor
        @AllArgsConstructor
        @JsonIgnoreProperties(ignoreUnknown = true)
        public static class MinRefresh extends MatchRefresh {
            private String metric;
            private Operator op;
            private Double value;
        }

        @Data
        @EqualsAndHashCode(callSuper = false)
        @NoArgsConstructor
        @AllArgsConstructor
        @JsonIgnoreProperties(ignoreUnknown = true)
        public static class StreakRefresh extends MatchRefresh {
            private Integer min;
            private StreakType kind;
        }
    }

    /**
     * 连胜/连败类型
     */
    public enum StreakType {
        WIN, LOSS
    }
}
