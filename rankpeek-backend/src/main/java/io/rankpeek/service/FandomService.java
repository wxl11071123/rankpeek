package io.rankpeek.service;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import io.rankpeek.model.AramBalanceData;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import lombok.extern.slf4j.Slf4j;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

@Slf4j
@Service
public class FandomService {

    private static final String FANDOM_API_URL = "https://leagueoflegends.fandom.com/api.php" +
            "?action=query&format=json&prop=revisions" +
            "&titles=Module:ChampionData/data&rvprop=content&rvslots=main";

    private final OkHttpClient httpClient = new OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build();

    private final ObjectMapper objectMapper = new ObjectMapper();

    private final Cache<Integer, AramBalanceData> aramCache = Caffeine.newBuilder()
            .maximumSize(1000)
            .expireAfterWrite(4, TimeUnit.HOURS)
            .build();

    @EventListener(ApplicationReadyEvent.class)
    public void init() {
        log.info("初始化 Fandom 服务...");
        // 使用虚拟线程或普通线程异步加载
        Thread.ofVirtual().start(() -> {
            try {
                Thread.sleep(3000);
                String result = updateAramBalanceData();
                log.info("初始化结果: {}", result);
            } catch (Exception e) {
                log.error("初始加载 ARAM 数据失败", e);
            }
        });
    }

    public String updateAramBalanceData() {
        log.info("开始获取 Fandom ARAM 平衡性数据...");
        try {
            Request request = new Request.Builder()
                    .url(FANDOM_API_URL)
                    .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36")
                    .get()
                    .build();

            try (Response response = httpClient.newCall(request).execute()) {
                if (!response.isSuccessful() || Objects.isNull(response.body())) {
                    throw new RuntimeException("请求失败: " + response.code());
                }

                String body = response.body().string();
                JsonNode root = objectMapper.readTree(body);
                JsonNode pages = root.path("query").path("pages");

                if (pages.isMissingNode() || !pages.isObject()) {
                    throw new RuntimeException("未找到页面数据");
                }

                JsonNode page = pages.properties()
                        .stream()
                        .findFirst()
                        .map(Map.Entry::getValue)
                        .orElseThrow(() -> new RuntimeException("Fandom API 返回的 pages 为空，无法获取目标页面数据"));
                JsonNode contentNode = page.path("revisions").get(0).path("slots").path("main").path("*");

                if (contentNode.isMissingNode()) {
                    throw new RuntimeException("无法获取 Lua 内容");
                }

                String luaScript = contentNode.asText();
                log.info("获取到 Lua 脚本，长度: {} 字符", luaScript.length());

                int count = parseLuaToAramData(luaScript);
                return "成功更新 " + count + " 个英雄的数据";
            }
        } catch (Exception e) {
            log.error("更新 ARAM 数据失败", e);
            return "更新失败: " + e.getMessage();
        }
    }

    /**
     * 核心解析逻辑：
     * 1. 提取每个英雄的定义块 [Name] = { ... }
     * 2. 从块中提取 id 和 aram 子表
     * 3. 将 Lua 风格的 aram 表转换为 JSON 并解析
     */
    private int parseLuaToAramData(String luaScript) {
        Map<Integer, AramBalanceData> newDataMap = new HashMap<>();
        int count = 0;
        int skipCount = 0;

        // 匹配模式: ["Key"] = {
        Pattern headerPattern = Pattern.compile("\\[\"([^\"]+)\"\\]\\s*=\\s*\\{");
        Matcher matcher = headerPattern.matcher(luaScript);

        while (matcher.find()) {
            String keyName = matcher.group(1);

            // 🛡️ 防御性编程 1: 过滤掉明显的非英雄 Key
            // 英雄名通常首字母大写，且不是保留关键字
            if (keyName.length() < 2 ||
                    keyName.equals("stats") ||
                    keyName.equals("aram") ||
                    keyName.equals("data") ||
                    keyName.equals("__index") ||
                    keyName.equals("consts") ||
                    keyName.equals("urf") ||
                    keyName.equals("id") ||
                    keyName.equals("apiname")) {
                log.trace("跳过非英雄键: {}", keyName);
                continue;
            }

            // 额外检查：英雄名应该以字母开头，且首字母大写
            if (!Character.isUpperCase(keyName.charAt(0))) {
                log.trace("跳过非英雄键（首字母非大写）: {}", keyName);
                continue;
            }

            int start = matcher.end(); // 跳过 {

            // 🛡️ 防御性编程 2: 安全地寻找闭合括号
            int end = findMatchingBrace(luaScript, start);

            // 如果找不到闭合括号，或者索引越界，直接跳过
            if (end == -1 || end <= start || end > luaScript.length()) {
                log.warn("格式错误：无法找到键 [{}] 的闭合括号，或索引越界 (start={}, end={})", keyName, start, end);
                continue;
            }

            // 🛡️ 防御性编程 3: 安全的 substring
            String championBlock;
            try {
                championBlock = luaScript.substring(start, end);
            } catch (Exception e) {
                log.error("截取字符串失败: start={}, end={}, length={}", start, end, luaScript.length(), e);
                continue;
            }

            // 步骤 2: 从块中提取 ID
            Integer id = extractId(championBlock);

            // 如果没有 ID，跳过
            if (id == null) {
                log.debug("跳过 [{}]: 未找到 ID", keyName);
                skipCount++;
                continue;
            }

            // 步骤 3: 提取 aram 块
            String aramLua = extractAramBlock(championBlock);
            if (aramLua == null || aramLua.trim().isEmpty()) {
                log.trace("英雄 [{}] (ID: {}) 无 ARAM 数据", keyName, id);
                continue;
            }

            // 步骤 4: 转换并解析
            try {
                AramBalanceData data = parseAramJson(aramLua);
                if (data != null && data.hasData()) {
                    data.setChampionId(id);
                    data.setChampionName(keyName);
                    newDataMap.put(id, data);
                    count++;
                    log.debug("成功解析英雄: {} (ID: {}) - 字段: {}", keyName, id, data.getAllFields().keySet());
                } else {
                    log.trace("英雄 [{}] (ID: {}) ARAM 数据为空", keyName, id);
                }
            } catch (Exception e) {
                log.warn("解析英雄 {} (ID: {}) 的 ARAM 数据失败: {}", keyName, id, e.getMessage());
            }
        }

        // 更新缓存
        aramCache.invalidateAll();
        newDataMap.forEach(aramCache::put);

        log.info("✅ ARAM 数据解析完成：成功 {} 个英雄，跳过 {} 个无效块，缓存大小: {}", count, skipCount, aramCache.estimatedSize());
        return count;
    }

    /**
     * 查找匹配的右大括号，处理嵌套
     */
    private int findMatchingBrace(String text, int startPos) {
        int depth = 1;
        int i = startPos;
        boolean inString = false;
        char stringChar = 0;
        boolean inComment = false;

        while (i < text.length() && depth > 0) {
            char c = text.charAt(i);

            // 处理注释 (--)
            if (!inString && !inComment && c == '-' && i + 1 < text.length() && text.charAt(i+1) == '-') {
                inComment = true;
                i += 2;
                continue;
            }
            if (inComment && c == '\n') {
                inComment = false;
                i++;
                continue;
            }
            if (inComment) {
                i++;
                continue;
            }

            // 处理字符串
            if (!inString && (c == '"' || c == '\'')) {
                inString = true;
                stringChar = c;
            } else if (inString && c == stringChar && (i == 0 || text.charAt(i-1) != '\\')) {
                inString = false;
            }

            // 处理括号
            if (!inString) {
                if (c == '{') depth++;
                else if (c == '}') depth--;
            }
            i++;
        }
        return (depth == 0) ? i - 1 : -1;
    }

    private Integer extractId(String block) {
        // 模式 1: ["id"] = 123 (Fandom 标准写法)
        Pattern p1 = Pattern.compile("\\[\"id\"\\]\\s*=\\s*(\\d+)");
        Matcher m1 = p1.matcher(block);
        if (m1.find()) {
            return Integer.parseInt(m1.group(1));
        }

        // 模式 2: id = 123 (备用)
        Pattern p2 = Pattern.compile("\\bid\\s*=\\s*(\\d+)");
        Matcher m2 = p2.matcher(block);
        if (m2.find()) {
            return Integer.parseInt(m2.group(1));
        }

        // 模式 3: ["id"] = data[123] (提取方括号内的数字)
        Pattern p3 = Pattern.compile("\\[\"id\"\\]\\s*=\\s*(?:data|ids)\\s*\\[\\s*(\\d+)\\s*\\]");
        Matcher m3 = p3.matcher(block);
        if (m3.find()) {
            return Integer.parseInt(m3.group(1));
        }

        return null;
    }

    private String extractAramBlock(String block) {
        // 步骤 1: 先查找 stats 子表
        Pattern statsPattern = Pattern.compile("\\[\"stats\"\\]\\s*=\\s*\\{");
        Matcher statsMatcher = statsPattern.matcher(block);

        if (!statsMatcher.find()) {
            log.trace("未找到 stats 子表");
            return null;
        }

        int statsStart = statsMatcher.end();
        int statsEnd = findMatchingBrace(block, statsStart);

        if (statsEnd == -1) {
            log.debug("未找到 stats 块的闭合括号");
            return null;
        }

        String statsBlock = block.substring(statsStart, statsEnd);

        // 步骤 2: 在 stats 块中查找 aram 子表
        Pattern aramStartPattern = Pattern.compile("\\[\"aram\\s*\"\\]\\s*=\\s*\\{");
        Matcher aramMatcher = aramStartPattern.matcher(statsBlock);

        if (!aramMatcher.find()) {
            // 尝试不带引号的写法
            Pattern simplePattern = Pattern.compile("aram\\s*=\\s*\\{");
            Matcher simpleMatcher = simplePattern.matcher(statsBlock);
            if (!simpleMatcher.find()) {
                log.trace("在 stats 块中未找到 aram 子表");
                return null;
            }
            aramMatcher = simpleMatcher;
        }

        int aramStart = aramMatcher.end();
        int aramEnd = findMatchingBrace(statsBlock, aramStart);

        if (aramEnd == -1) {
            log.debug("未找到 aram 块的闭合括号");
            return "{}";
        }

        String content = statsBlock.substring(aramStart, aramEnd).trim();

        if (content.isEmpty()) {
            return "{}";
        }

        return content;
    }

    /**
     * 将 Lua 表内容转换为 JSON 对象并解析
     * Lua: key = value,  -> JSON: "key": value,
     */
    private AramBalanceData parseAramJson(String luaContent) throws Exception {
        if (luaContent == null || luaContent.trim().isEmpty() || "{}".equals(luaContent.trim())) {
            return null;
        }

        // 1. 移除注释
        String clean = luaContent.replaceAll("--[^\n]*", "");
        clean = clean.replaceAll("--\\[\\[.*?\\]\\]", "");

        // 2. 清洗 Key 的格式 (["key"] -> key)
        Pattern keyPattern = Pattern.compile("\\[\"([^\"]+)\"\\]\\s*=");
        clean = keyPattern.matcher(clean).replaceAll("$1 =");

        // 3. 过滤并收集所有键值对
        Map<String, Double> fieldValues = new HashMap<>();
        String[] lines = clean.split("\n");
        // 匹配 key = number (支持整数、小数、负数)
        Pattern kvPattern = Pattern.compile("^\\s*([a-zA-Z_][a-zA-Z0-9_]*)\\s*=\\s*(-?\\d+(?:\\.\\d+)?)\\s*,?\\s*$");

        for (String line : lines) {
            line = line.trim();
            if (line.isEmpty()) continue;

            Matcher m = kvPattern.matcher(line);
            if (m.find()) {
                String key = m.group(1);
                Double value = Double.parseDouble(m.group(2));
                fieldValues.put(key, value);
                log.trace("解析到字段: {} = {}", key, value);
            }
        }

        if (fieldValues.isEmpty()) {
            log.debug("未解析到任何字段");
            return null;
        }

        // 4. 构建 AramBalanceData
        AramBalanceData data = new AramBalanceData();

        // 映射已知字段
        for (Map.Entry<String, Double> entry : fieldValues.entrySet()) {
            String key = entry.getKey();
            Double value = entry.getValue();
            data.setField(key, value);
        }

        log.debug("解析结果: {} 个字段 - {}", fieldValues.size(), fieldValues.keySet());

        // 校验：至少要有数据才算有效
        if (!data.hasData()) {
            log.debug("数据无效: 所有字段均为空");
            return null;
        }

        return data;
    }

    public AramBalanceData getAramBalance(Integer championId) {
        return aramCache.getIfPresent(championId);
    }

    public Map<Integer, AramBalanceData> getAllAramBalance() {
        return new HashMap<>(aramCache.asMap());
    }

    public boolean hasData() {
        return aramCache.estimatedSize() > 0;
    }
}