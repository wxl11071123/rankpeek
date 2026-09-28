package io.rankpeek.service;

import io.rankpeek.model.AuthInfo;

import lombok.RequiredArgsConstructor;
import okhttp3.MediaType;
import okhttp3.Request;
import okhttp3.RequestBody;

/**
 * LCU 请求构建者
 * 使用构建者模式统一 HTTP 请求构建逻辑
 */
@RequiredArgsConstructor
public class LcuRequestBuilder {

    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");

    private final AuthInfo authInfo;
    private String uri;
    private String method;

    /**
     * 设置请求 URI
     */
    public LcuRequestBuilder uri(String uri) {
        this.uri = uri;
        return this;
    }

    /**
     * 设置 GET 方法
     */
    public LcuRequestBuilder get() {
        this.method = "GET";
        return this;
    }

    /**
     * 设置 POST 方法
     */
    public LcuRequestBuilder post(Object body) {
        this.method = "POST";
        return this;
    }

    /**
     * 设置 PUT 方法
     */
    public LcuRequestBuilder put(Object body) {
        this.method = "PUT";
        return this;
    }

    /**
     * 设置 PATCH 方法
     */
    public LcuRequestBuilder patch(Object body) {
        this.method = "PATCH";
        return this;
    }

    /**
     * 设置 DELETE 方法
     */
    public LcuRequestBuilder delete() {
        this.method = "DELETE";
        return this;
    }

    /**
     * 构建请求对象
     */
    public Request build(String jsonBody) {
        if (authInfo == null) {
            throw new IllegalStateException("认证信息为空");
        }

        String url = authInfo.buildUrl(uri);
        String authorization = authInfo.toBasicAuth();

        Request.Builder requestBuilder = new Request.Builder()
                .url(url)
                .addHeader("Authorization", authorization);

        if ("GET".equals(method)) {
            requestBuilder.get();
        } else if ("POST".equals(method)) {
            requestBuilder.post(createRequestBody(jsonBody));
        } else if ("PUT".equals(method)) {
            requestBuilder.put(createRequestBody(jsonBody));
        } else if ("PATCH".equals(method)) {
            requestBuilder.patch(createRequestBody(jsonBody));
        } else if ("DELETE".equals(method)) {
            requestBuilder.delete();
        }

        return requestBuilder.build();
    }

    /**
     * 创建请求体
     */
    private RequestBody createRequestBody(String json) {
        if (json == null || json.isEmpty() || "null".equals(json)) {
            return RequestBody.create("", JSON);
        }
        return RequestBody.create(json, JSON);
    }
}
