package io.rankpeek.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

class KiwiAugmentFallbackServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Clock clock = Clock.fixed(Instant.parse("2026-05-19T00:00:00Z"), ZoneOffset.UTC);

    @Test
    void getAugmentFallbacksParsesWrappedKiwiPayloadAndCleansTooltipText() {
        KiwiAugmentFallbackService service = serviceWithPayload("""
                {
                  "data": [
                    {
                      "augmentID": 2016,
                      "name_cn": "注魔",
                      "level": "kSilver",
                      "tooltip": "攻击特效消耗法力值以造成魔法伤害。<br><rules>这个伤害可以暴击。</rules>",
                      "desc": "<OnHit>%i:OnHit%攻击特效</OnHit>消耗<scaleMana>@Calc_Mana_Cost@法力值</scaleMana>。"
                    }
                  ]
                }
                """);

        Map<Long, KiwiAugmentFallbackService.KiwiAugmentFallback> fallbacks = service.getAugmentFallbacks();

        KiwiAugmentFallbackService.KiwiAugmentFallback entry = fallbacks.get(2016L);
        assertThat(entry).isNotNull();
        assertThat(entry.name()).isEqualTo("注魔");
        assertThat(entry.description()).isEqualTo("攻击特效消耗法力值以造成魔法伤害。\n这个伤害可以暴击。");
        assertThat(entry.tooltip()).isEqualTo("攻击特效消耗法力值以造成魔法伤害。\n这个伤害可以暴击。");
        assertThat(entry.desc()).isEqualTo("攻击特效消耗\n法力值。");
        assertThat(entry.rarity()).isEqualTo("kSilver");
    }

    @Test
    void getAugmentFallbacksFallsBackToObjectValuesWhenNoKnownWrapperExists() {
        KiwiAugmentFallbackService service = serviceWithPayload("""
                {
                  "2017": {
                    "id": "2017",
                    "name": "对象包装",
                    "tooltip": "对象值也可以解析。"
                  }
                }
                """);

        assertThat(service.getAugmentFallbacks().get(2017L).description()).isEqualTo("对象值也可以解析。");
    }

    @Test
    void getAugmentFallbacksDoesNotThrowWhenRemotePayloadFails() {
        KiwiAugmentFallbackService service = new KiwiAugmentFallbackService(
                true,
                "https://example.test/kiwi.json",
                Duration.ofHours(24),
                Duration.ofSeconds(2),
                clock,
                (url, timeout) -> {
                    throw new RuntimeException("network down");
                },
                objectMapper
        );

        assertThatCode(service::getAugmentFallbacks).doesNotThrowAnyException();
        assertThat(service.getAugmentFallbacks()).isEmpty();
    }

    @Test
    void getAugmentFallbacksReusesFailureInsideTtl() {
        AtomicInteger calls = new AtomicInteger();
        KiwiAugmentFallbackService service = new KiwiAugmentFallbackService(
                true,
                "https://example.test/kiwi.json",
                Duration.ofHours(24),
                Duration.ofSeconds(2),
                clock,
                (url, timeout) -> {
                    calls.incrementAndGet();
                    throw new RuntimeException("network down");
                },
                objectMapper
        );

        assertThat(service.getAugmentFallbacks()).isEmpty();
        assertThat(service.getAugmentFallbacks()).isEmpty();

        assertThat(calls).hasValue(1);
    }

    @Test
    void getAugmentFallbacksReusesCachedPayloadInsideTtl() {
        AtomicInteger calls = new AtomicInteger();
        KiwiAugmentFallbackService service = new KiwiAugmentFallbackService(
                true,
                "https://example.test/kiwi.json",
                Duration.ofHours(24),
                Duration.ofSeconds(2),
                clock,
                (url, timeout) -> {
                    calls.incrementAndGet();
                    return """
                            {"data":[{"augmentId":3001,"name_cn":"缓存","tooltip":"缓存文本"}]}
                            """;
                },
                objectMapper
        );

        assertThat(service.getAugmentFallbacks()).containsKey(3001L);
        assertThat(service.getAugmentFallbacks()).containsKey(3001L);

        assertThat(calls).hasValue(1);
    }

    private KiwiAugmentFallbackService serviceWithPayload(String payload) {
        return new KiwiAugmentFallbackService(
                true,
                "https://example.test/kiwi.json",
                Duration.ofHours(24),
                Duration.ofSeconds(2),
                clock,
                (url, timeout) -> payload,
                objectMapper
        );
    }
}
