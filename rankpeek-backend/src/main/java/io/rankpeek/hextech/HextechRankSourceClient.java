package io.rankpeek.hextech;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * 101（腾讯国服公开统计）的海斗排行榜抓取客户端。
 *
 * <p>这两个接口无需鉴权，但带上 Referer 更稳。它们都是"公共统计快照"，按日更新，
 * 因此调用频率很低（每天一次即可）。
 */
@Slf4j
@Component
public class HextechRankSourceClient {

    static final String DEFAULT_AUGMENT_URL =
            "https://mlol.qt.qq.com/go/battle_info/odp_proxy/fuwen_aram_rune_rank_v2?augmentid_level=255";
    static final String DEFAULT_CHAMPION_URL =
            "https://mlol.qt.qq.com/go/battle_info/odp_proxy/fuwen_aram_hero_rank_v2";

    private final String augmentUrl;
    private final String championUrl;
    private final String referer;
    private final Duration timeout;
    private final HttpClient httpClient;

    @Autowired
    public HextechRankSourceClient(
            @Value("${rankpeek.hextech.augment-rank-url:" + DEFAULT_AUGMENT_URL + "}") String augmentUrl,
            @Value("${rankpeek.hextech.champion-rank-url:" + DEFAULT_CHAMPION_URL + "}") String championUrl,
            @Value("${rankpeek.hextech.referer:https://101.qq.com/}") String referer,
            @Value("${rankpeek.hextech.timeout-ms:8000}") long timeoutMs
    ) {
        this(augmentUrl, championUrl, referer, Duration.ofMillis(timeoutMs <= 0 ? 8000 : timeoutMs), null);
    }

    HextechRankSourceClient(String augmentUrl, String championUrl, String referer, Duration timeout, HttpClient httpClient) {
        this.augmentUrl = blankToDefault(augmentUrl, DEFAULT_AUGMENT_URL);
        this.championUrl = blankToDefault(championUrl, DEFAULT_CHAMPION_URL);
        this.referer = blankToDefault(referer, "https://101.qq.com/");
        this.timeout = timeout == null || timeout.isZero() || timeout.isNegative() ? Duration.ofSeconds(8) : timeout;
        this.httpClient = httpClient != null ? httpClient : HttpClient.newBuilder()
                .connectTimeout(this.timeout)
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    public String fetchAugmentRank() throws Exception {
        return fetch(augmentUrl);
    }

    public String fetchChampionRank(String dataDate) throws Exception {
        String url = championUrl;
        if (dataDate != null && !dataDate.isBlank()) {
            url = url + (url.contains("?") ? "&" : "?") + "dtstatdate=" + dataDate;
        }
        return fetch(url);
    }

    private String fetch(String url) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(timeout)
                .header("Referer", referer)
                .header("User-Agent", "Mozilla/5.0 (compatible; RankPeek)")
                .GET()
                .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new IllegalStateException("101 接口返回 " + response.statusCode() + ": " + url);
        }
        return response.body();
    }

    private static String blankToDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
