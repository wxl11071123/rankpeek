package io.rankpeek.hextech;

import java.io.InputStream;
import java.util.Properties;

/**
 * 自建服务端地址的唯一来源。
 *
 * <p>仓库里<b>不写任何真实主机地址</b>。解析顺序：
 * <ol>
 *   <li>显式配置 —— Spring 配置 / 环境变量（{@code rankpeek.hextech.*}）</li>
 *   <li>classpath 上的 {@code endpoints.properties}（<b>不入库</b>，官方构建时注入）</li>
 * </ol>
 * 两者都拿不到就返回空串：相关功能整块关闭，其余功能照常可用。
 * 开源构建天然属于这种情况 —— 不会有人克隆一份代码就往我们的服务器上传数据。
 */
public final class HextechEndpoints {

    /** 匿名数据上传目标。 */
    public static final String INGEST_URL = "hextech.ingest-url";
    /** 服务端下发的上传策略。 */
    public static final String POLICY_URL = "hextech.policy-url";
    /** 自建层数据分发地址（version.json + {dataVersion}/matrix.json）。 */
    public static final String DATA_BASE_URL = "hextech.data-base-url";
    /** aramgg 数据包地址。 */
    public static final String ARAMGG_BUNDLE_BASE_URL = "hextech.aramgg.bundle-base-url";

    static final String RESOURCE = "endpoints.properties";

    private static final Properties FILE = load();

    private HextechEndpoints() {
    }

    /** 显式配置优先，其次 endpoints.properties，都没有就返回空串（= 功能关闭）。 */
    public static String resolve(String key, String configured) {
        if (configured != null && !configured.isBlank()) {
            return configured.trim();
        }
        String fromFile = FILE.getProperty(key);
        if (fromFile != null && !fromFile.isBlank()) {
            return fromFile.trim();
        }
        return "";
    }

    private static Properties load() {
        Properties properties = new Properties();
        try (InputStream in = HextechEndpoints.class.getClassLoader().getResourceAsStream(RESOURCE)) {
            if (in != null) {
                properties.load(in);
            }
        } catch (Exception ignored) {
            // 读不到当作没配置：功能关闭，不影响其余功能
        }
        return properties;
    }
}
