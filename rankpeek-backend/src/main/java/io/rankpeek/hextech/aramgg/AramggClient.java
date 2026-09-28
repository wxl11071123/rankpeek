package io.rankpeek.hextech.aramgg;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Optional;

/**
 * aramgg 数据 API 客户端（第三方接入，需要 API Key）。
 *
 * <p>Key 通过配置项 {@code rankpeek.hextech.aramgg.api-key} 提供（可用环境变量
 * {@code ARAMGG_API_KEY} 注入），<b>不要写进仓库</b>。未配置时 {@link #isConfigured()} 为 false，
 * 上层应自动降级到 101 数据。
 *
 * <p>额度：免费计划 200 credits/天，各接口 1~2 credits；响应头会带
 * {@code x-credits-cost / x-credits-remaining}，本类会记录最后一次看到的余额。
 */
@Slf4j
@Component
public class AramggClient {

    static final String DEFAULT_BASE_URL = "https://data.dtodo.cn";
    private static final String LOCALE_PATH = "/api/v1/zh-CN";

    private final String baseUrl;
    private final String apiKey;
    private final Duration timeout;
    private final HttpClient httpClient;

    private volatile String lastCreditsRemaining;
    private volatile String lastError;

    @Autowired
    public AramggClient(
            @Value("${rankpeek.hextech.aramgg.base-url:" + DEFAULT_BASE_URL + "}") String baseUrl,
            @Value("${rankpeek.hextech.aramgg.api-key:${ARAMGG_API_KEY:}}") String apiKey,
            @Value("${rankpeek.hextech.timeout-ms:8000}") long timeoutMs
    ) {
        this(baseUrl, apiKey, Duration.ofMillis(timeoutMs <= 0 ? 8000 : timeoutMs), null);
    }

    AramggClient(String baseUrl, String apiKey, Duration timeout, HttpClient httpClient) {
        this.baseUrl = baseUrl == null || baseUrl.isBlank() ? DEFAULT_BASE_URL : baseUrl.trim();
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.timeout = timeout == null || timeout.isZero() || timeout.isNegative() ? Duration.ofSeconds(8) : timeout;
        this.httpClient = httpClient != null ? httpClient : HttpClient.newBuilder()
                .connectTimeout(this.timeout)
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    public boolean isConfigured() {
        return !apiKey.isBlank();
    }

    public String getLastCreditsRemaining() {
        return lastCreditsRemaining;
    }

    public String getLastError() {
        return lastError;
    }

    /** 公开配置：判断数据版本，0 credit，无需 Key。 */
    public String fetchConfig() throws Exception {
        return get(LOCALE_PATH + "/config.json", false);
    }

    /** 全局强化统计（211 条）。 */
    public String fetchAugmentStats() throws Exception {
        return get(LOCALE_PATH + "/data/augments-stats-raw.json", true);
    }

    /** 英雄榜单。 */
    public String fetchChampions() throws Exception {
        return get(LOCALE_PATH + "/champions.json", true);
    }

    /** 强化定义（含中文名/描述/图标）。 */
    public String fetchAugmentDefinitions() throws Exception {
        return get(LOCALE_PATH + "/data/aram-mayhem-augments.zh_cn.json", true);
    }

    /** 单英雄的强化矩阵。 */
    public String fetchChampionMatrix(long championId) throws Exception {
        return get(LOCALE_PATH + "/data/champion-augments/" + championId + ".json", true);
    }

    private String get(String path, boolean authorized) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(baseUrl + path))
                .timeout(timeout)
                .header("User-Agent", "RankPeek/1.0 (aramgg third-party api)")
                .GET();
        if (authorized) {
            if (!isConfigured()) {
                throw new IllegalStateException("未配置 aramgg API Key");
            }
            builder.header("Authorization", "Bearer " + apiKey);
        }
        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        String remaining = response.headers().firstValue("x-credits-remaining").orElse(null);
        if (remaining != null) {
            lastCreditsRemaining = remaining;
        }
        if (response.statusCode() == 429) {
            lastError = "额度不足或触发限流（429），剩余 " + remaining;
            throw new IllegalStateException(lastError);
        }
        if (response.statusCode() != 200) {
            lastError = "aramgg 返回 " + response.statusCode() + ": " + path;
            throw new IllegalStateException(lastError);
        }
        lastError = null;
        return response.body();
    }

    public Optional<String> describeCredits() {
        return Optional.ofNullable(lastCreditsRemaining);
    }
}
