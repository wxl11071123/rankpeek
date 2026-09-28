package io.rankpeek.service;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 游戏资源服务
 * 管理英雄、装备、符文等游戏资源数据
 */
@Slf4j
@Service
public class AssetService {

    private static final long LCU_PERK_METADATA_REFRESH_INTERVAL_MS = 30_000L;
    /** 数据缺失时重试拉取装备/技能/英雄/海克斯的最小间隔 */
    private static final long LCU_ASSET_REFRESH_RETRY_INTERVAL_MS = 60_000L;
    /** 收到新的 LCU 认证时的最小刷新间隔，避免短时间内重复拉取 */
    private static final long LCU_ASSET_REFRESH_MIN_GAP_MS = 10_000L;
    private static final String ASSET_CACHE_VERSION = "lcu";
    private static final String BUILT_IN_CHAMPIONS_RESOURCE = "/assets/champions-16.19-zh_CN.json";
    /** 60xxx 是竞技场/事件模式的换皮英雄，不属于正常英雄列表。 */
    private static final long MAX_CHAMPION_ID = 1000L;
    private static final ObjectMapper BUILT_IN_CHAMPION_MAPPER = new ObjectMapper();

    private final LcuHttpClient lcuHttpClient;
    private final Path assetCacheRoot;
    private final KiwiAugmentFallbackService kiwiAugmentFallbackService;

    // 英雄缓存
    private final Map<Long, Champion> championCache = new ConcurrentHashMap<>();
    // 装备缓存 (id -> iconPath)
    private final Map<Long, String> itemIconPathCache = new ConcurrentHashMap<>();
    private final Map<Long, ItemMetadata> itemMetadataCache = new ConcurrentHashMap<>();
    // 召唤师技能缓存 (id -> iconPath)
    private final Map<Long, String> spellIconPathCache = new ConcurrentHashMap<>();
    private final Map<Long, SpellMetadata> spellMetadataCache = new ConcurrentHashMap<>();
    private final Map<Long, String> perkIconPathCache = new ConcurrentHashMap<>();
    private final Map<Long, PerkMetadata> perkMetadataCache = new ConcurrentHashMap<>();
    private volatile long lastPerkMetadataRefreshAttemptAt = 0L;
    private volatile long lastAssetRefreshAttemptAt = 0L;
    // 海克斯强化缓存 (id -> iconPath)
    private final Map<Long, String> augmentIconPathCache = new ConcurrentHashMap<>();
    private final Map<Long, AugmentMetadata> augmentMetadataCache = new ConcurrentHashMap<>();
    // 海克斯强化稀有度缓存 (id -> rarity)
    private final Map<Long, String> augmentRarityCache = new ConcurrentHashMap<>();

    @Autowired
    public AssetService(LcuHttpClient lcuHttpClient, KiwiAugmentFallbackService kiwiAugmentFallbackService) {
        this(lcuHttpClient, resolveDefaultAssetCacheRoot(), kiwiAugmentFallbackService);
    }

    AssetService(LcuHttpClient lcuHttpClient, Path assetCacheRoot) {
        this(lcuHttpClient, assetCacheRoot, KiwiAugmentFallbackService.disabled());
    }

    AssetService(LcuHttpClient lcuHttpClient, Path assetCacheRoot, KiwiAugmentFallbackService kiwiAugmentFallbackService) {
        this.lcuHttpClient = lcuHttpClient;
        this.assetCacheRoot = assetCacheRoot;
        this.kiwiAugmentFallbackService = kiwiAugmentFallbackService == null
                ? KiwiAugmentFallbackService.disabled()
                : kiwiAugmentFallbackService;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void init() {
        log.info("初始化资源服务...");
        if (lcuHttpClient != null) {
            // 后端启动通常早于客户端认证推送，拿到认证后需要补齐启动阶段拉取失败的资源。
            lcuHttpClient.addAuthListener(auth -> onLcuAuthUpdated());
        }
        // 异步加载资源
        new Thread(this::loadAssets, "asset-loader").start();
    }

    /**
     * 加载游戏资源
     */
    private void loadAssets() {
        lastAssetRefreshAttemptAt = System.currentTimeMillis();
        try {
            loadChampions();
            loadItems();
            loadSpells();
            loadPerks();
            loadAugments();
            log.info("资源加载完成，英雄: {}, 装备: {}, 技能: {}, 海克斯: {}",
                    championCache.size(), itemIconPathCache.size(), spellIconPathCache.size(), augmentIconPathCache.size());
        } catch (Exception e) {
            log.error("加载资源失败: {}", e.getMessage());
        }
    }

    /**
     * 前端推送了新的 LCU 认证（客户端刚启动，或后端重启后重新拿到认证）时调用：
     * 如果启动阶段没能从 LCU 拉到装备/技能等数据，这里补拉一次。
     */
    public void onLcuAuthUpdated() {
        if (hasLcuAssetCatalog()) {
            return;
        }
        if (System.currentTimeMillis() - lastAssetRefreshAttemptAt < LCU_ASSET_REFRESH_MIN_GAP_MS) {
            return;
        }
        new Thread(this::refreshAssetCatalog, "asset-refresh").start();
    }

    /** 装备与召唤师技能只有 LCU 一个来源，两者都非空才算启动期加载成功。 */
    private boolean hasLcuAssetCatalog() {
        return !itemMetadataCache.isEmpty() && !spellMetadataCache.isEmpty();
    }

    /** 读取路径上的兜底：数据缺失且已经拿到 LCU 认证时，按节流重试。 */
    private void ensureAssetCatalogFresh() {
        if (hasLcuAssetCatalog()) {
            return;
        }
        if (lcuHttpClient == null || lcuHttpClient.getOrRefreshAuth() == null) {
            return;
        }
        if (System.currentTimeMillis() - lastAssetRefreshAttemptAt < LCU_ASSET_REFRESH_RETRY_INTERVAL_MS) {
            return;
        }
        refreshAssetCatalog();
    }

    private synchronized void refreshAssetCatalog() {
        long now = System.currentTimeMillis();
        if (now - lastAssetRefreshAttemptAt < LCU_ASSET_REFRESH_MIN_GAP_MS) {
            return;
        }
        lastAssetRefreshAttemptAt = now;
        loadChampions();
        loadItems();
        loadSpells();
        loadAugments();
        log.info("资产目录刷新完成，英雄: {}, 装备: {}, 技能: {}, 海克斯: {}",
                championCache.size(), itemIconPathCache.size(), spellIconPathCache.size(), augmentIconPathCache.size());
    }

    /**
     * 加载英雄列表
     */
    private void loadChampions() {
        try {
            // 路径必须带 .json 后缀，否则 LCU 返回 400 "Failed to serve"。
            Champion[] champions = lcuHttpClient.get("lol-game-data/assets/v1/champion-summary.json", Champion[].class);
            if (champions != null) {
                int loaded = 0;
                for (Champion champion : champions) {
                    if (isRealChampion(champion)) {
                        championCache.put(champion.id, champion);
                        loaded++;
                    }
                }
                if (loaded > 0) {
                    return;
                }
                log.warn("LCU 英雄列表为空，使用内置数据");
            }
        } catch (Exception e) {
            log.warn("从 LCU 加载英雄失败，使用内置数据: {}", e.getMessage());
        }
        loadBuiltInChampions();
    }

    private boolean isRealChampion(Champion champion) {
        return champion != null && champion.id > 0 && champion.id < MAX_CHAMPION_ID;
    }

    /**
     * 加载装备列表
     */
    private void loadItems() {
        try {
            Item[] items = lcuHttpClient.get("lol-game-data/assets/v1/items.json", Item[].class);
            if (items != null) {
                for (Item item : items) {
                    if (item.id > 0) {
                        if (item.iconPath != null && !item.iconPath.isEmpty()) {
                            itemIconPathCache.put(item.id, item.iconPath);
                        }
                        itemMetadataCache.put(item.id, toItemMetadata(item));
                    }
                }
            }
            log.info("装备加载完成: {}", itemIconPathCache.size());
        } catch (Exception e) {
            log.warn("加载装备失败: {}", e.getMessage());
        }
    }

    /**
     * 加载召唤师技能列表
     */
    private void loadSpells() {
        try {
            Spell[] spells = lcuHttpClient.get("lol-game-data/assets/v1/summoner-spells.json", Spell[].class);
            if (spells != null) {
                for (Spell spell : spells) {
                    if (spell.id > 0) {
                        if (spell.iconPath != null && !spell.iconPath.isEmpty()) {
                            spellIconPathCache.put(spell.id, spell.iconPath);
                        }
                        spellMetadataCache.put(spell.id, toSpellMetadata(spell));
                    }
                }
            }
            log.info("召唤师技能加载完成: {}", spellIconPathCache.size());
        } catch (Exception e) {
            log.warn("加载召唤师技能失败: {}", e.getMessage());
        }
    }

    /**
     * 加载内置英雄数据（备用）
     */
    private synchronized void loadPerks() {
        lastPerkMetadataRefreshAttemptAt = System.currentTimeMillis();
        loadPerkEntries();
        loadPerkStyles();
        log.info("Perks loaded: {}", perkIconPathCache.size());
    }

    private void loadPerkEntries() {
        try {
            Perk[] perks = lcuHttpClient.get("lol-game-data/assets/v1/perks.json", Perk[].class);
            if (perks != null) {
                for (Perk perk : perks) {
                    if (perk.id > 0) {
                        if (perk.iconPath != null && !perk.iconPath.isEmpty()) {
                            perkIconPathCache.put(perk.id, perk.iconPath);
                        }
                        perkMetadataCache.put(perk.id, toPerkMetadata(perk));
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to load perks: {}", e.getMessage());
        }
    }

    private void loadPerkStyles() {
        try {
            PerkStylePayload payload = lcuHttpClient.get("lol-game-data/assets/v1/perkstyles.json", PerkStylePayload.class);
            List<PerkStyle> styles = payload != null && payload.styles != null ? payload.styles : List.of();
            for (PerkStyle style : styles) {
                if (style.id > 0) {
                    if (style.iconPath != null && !style.iconPath.isEmpty()) {
                        perkIconPathCache.put(style.id, style.iconPath);
                    }
                    perkMetadataCache.put(style.id, toPerkMetadata(style));
                }
            }
        } catch (Exception e) {
            log.warn("Failed to load perk styles: {}", e.getMessage());
        }
    }

    private void loadBuiltInChampions() {
        if (loadBuiltInChampionSnapshot()) {
            return;
        }

        // 常用英雄数据
        Map<Long, Champion> builtIn = Map.ofEntries(
                createChampion(1, "安妮", "Annie"),
                createChampion(2, "奥拉夫", "Olaf"),
                createChampion(3, "加里奥", "Galio"),
                createChampion(4, "卡牌大师", "TwistedFate"),
                createChampion(5, "希瓦娜", "Shyvana"),
                createChampion(6, "厄加特", "Urgot"),
                createChampion(7, "乐芙兰", "Leblanc"),
                createChampion(8, "弗拉基米尔", "Vladimir"),
                createChampion(9, "费德提克", "FiddleSticks"),
                createChampion(10, "凯尔", "Kayle"),
                createChampion(11, "易", "MasterYi"),
                createChampion(12, "阿利斯塔", "Alistar"),
                createChampion(13, "瑞兹", "Ryze"),
                createChampion(14, "塞恩", "Sion"),
                createChampion(15, "希维尔", "Sivir"),
                createChampion(16, "索拉卡", "Soraka"),
                createChampion(17, "提莫", "Teemo"),
                createChampion(18, "崔丝塔娜", "Tristana"),
                createChampion(19, "沃里克", "Warwick"),
                createChampion(20, "努努", "Nunu"),
                createChampion(21, "厄运小姐", "MissFortune"),
                createChampion(22, "艾希", "Ashe"),
                createChampion(23, "泰达米尔", "Tryndamere"),
                createChampion(24, "贾克斯", "Jax"),
                createChampion(25, "莫甘娜", "Morgana"),
                createChampion(26, "基兰", "Zilean"),
                createChampion(27, "辛吉德", "Singed"),
                createChampion(28, "伊芙琳", "Evelynn"),
                createChampion(29, "塔莉垭", "Taliyah"),
                createChampion(30, "卡莎", "Kaisa"),
                createChampion(31, "科加斯", "Chogath"),
                createChampion(32, "阿木木", "Amumu"),
                createChampion(33, "拉莫斯", "Rammus"),
                createChampion(34, "艾尼维亚", "Anivia"),
                createChampion(35, "萨科", "Shaco"),
                createChampion(36, "墨菲特", "Malphite"),
                createChampion(37, "娑娜", "Sona"),
                createChampion(38, "卡萨丁", "Kassadin"),
                createChampion(39, "艾瑞莉娅", "Irelia"),
                createChampion(40, "迦娜", "Janna"),
                createChampion(41, "普朗克", "Gangplank"),
                createChampion(42, "库奇", "Corki"),
                createChampion(43, "卡尔玛", "Karma"),
                createChampion(44, "塔里克", "Taric"),
                createChampion(45, "维迦", "Veigar"),
                createChampion(48, "特朗德尔", "Trundle"),
                createChampion(50, "斯维因", "Swain"),
                createChampion(51, "凯特琳", "Caitlyn"),
                createChampion(52, "潘森", "Pantheon"),
                createChampion(53, "布里茨", "Blitzcrank"),
                createChampion(54, "墨菲特", "Malphite"),
                createChampion(55, "卡特琳娜", "Katarina"),
                createChampion(56, "梦魇", "Nocturne"),
                createChampion(57, "茂凯", "Maokai"),
                createChampion(58, "雷克顿", "Renekton"),
                createChampion(59, "嘉文四世", "JarvanIV"),
                createChampion(60, "伊莉丝", "Elise"),
                createChampion(61, "奥莉安娜", "Orianna"),
                createChampion(62, "孙悟空", "MonkeyKing"),
                createChampion(63, "布兰德", "Brand"),
                createChampion(64, "李青", "LeeSin"),
                createChampion(67, "薇恩", "Vayne"),
                createChampion(68, "兰博", "Rumble"),
                createChampion(69, "卡西奥佩娅", "Cassiopeia"),
                createChampion(72, "斯卡纳", "Skarner"),
                createChampion(74, "黑默丁格", "Heimerdinger"),
                createChampion(75, "内瑟斯", "Nasus"),
                createChampion(76, "奈德丽", "Nidalee"),
                createChampion(77, "乌迪尔", "Udyr"),
                createChampion(78, "波比", "Poppy"),
                createChampion(79, "古拉加斯", "Gragas"),
                createChampion(80, "潘森", "Pantheon"),
                createChampion(81, "伊泽瑞尔", "Ezreal"),
                createChampion(82, "莫德凯撒", "Mordekaiser"),
                createChampion(83, "约里克", "Yorick"),
                createChampion(84, "阿卡丽", "Akali"),
                createChampion(85, "凯南", "Kennen"),
                createChampion(86, "盖伦", "Garen"),
                createChampion(89, "蕾欧娜", "Leona"),
                createChampion(90, "玛尔扎哈", "Malzahar"),
                createChampion(91, "泰隆", "Talon"),
                createChampion(92, "锐雯", "Riven"),
                createChampion(96, "克格莫", "KogMaw"),
                createChampion(98, "慎", "Shen"),
                createChampion(99, "拉克丝", "Lux"),
                createChampion(101, "泽拉斯", "Xerath"),
                createChampion(102, "希瓦娜", "Shyvana"),
                createChampion(103, "阿狸", "Ahri"),
                createChampion(104, "格雷福斯", "Graves"),
                createChampion(105, "菲兹", "Fizz"),
                createChampion(106, "沃利贝尔", "Volibear"),
                createChampion(107, "雷恩加尔", "Rengar"),
                createChampion(110, "维鲁斯", "Varus"),
                createChampion(111, "诺提勒斯", "Nautilus"),
                createChampion(112, "维克托", "Viktor"),
                createChampion(113, "瑟庄妮", "Sejuani"),
                createChampion(114, "菲奥娜", "Fiora"),
                createChampion(115, "吉格斯", "Ziggs"),
                createChampion(117, "璐璐", "Lulu"),
                createChampion(119, "德莱文", "Draven"),
                createChampion(120, "赫卡里姆", "Hecarim"),
                createChampion(121, "卡兹克", "Khazix"),
                createChampion(122, "德莱厄斯", "Darius"),
                createChampion(126, "杰斯", "Jayce"),
                createChampion(127, "丽桑卓", "Lissandra"),
                createChampion(131, "黛安娜", "Diana"),
                createChampion(133, "奎因", "Quinn"),
                createChampion(134, "辛德拉", "Syndra"),
                createChampion(136, "奥瑞利安·索尔", "AurelionSol"),
                createChampion(141, "凯隐", "Kayn"),
                createChampion(142, "佐伊", "Zoe"),
                createChampion(143, "婕拉", "Zyra"),
                createChampion(145, "卡莎", "Kaisa"),
                createChampion(147, "塞拉斯", "Sylas"),
                createChampion(150, "纳尔", "Gnar"),
                createChampion(154, "扎克", "Zac"),
                createChampion(157, "亚索", "Yasuo"),
                createChampion(161, "维克兹", "Velkoz"),
                createChampion(163, "塔莉垭", "Taliyah"),
                createChampion(164, "卡蜜尔", "Camille"),
                createChampion(166, "永恩", "Yone"),
                createChampion(200, "卑尔维斯", "Belveth"),
                createChampion(221, "泽丽", "Zeri"),
                createChampion(222, "金克丝", "Jinx"),
                createChampion(223, "塔姆", "TahmKench"),
                createChampion(233, "贝蕾亚", "Briar"),
                createChampion(236, "卢锡安", "Lucian"),
                createChampion(238, "劫", "Zed"),
                createChampion(240, "克烈", "Kled"),
                createChampion(245, "艾克", "Ekko"),
                createChampion(246, "莉莉娅", "Lillia"),
                createChampion(254, "蔚", "Vi"),
                createChampion(266, "亚托克斯", "Aatrox"),
                createChampion(267, "娜美", "Nami"),
                createChampion(268, "阿兹尔", "Azir"),
                createChampion(350, "悠米", "Yuumi"),
                createChampion(412, "锤石", "Thresh"),
                createChampion(420, "俄洛伊", "Illaoi"),
                createChampion(421, "雷克塞", "RekSai"),
                createChampion(427, "艾翁", "Ivern"),
                createChampion(429, "卡莉斯塔", "Kalista"),
                createChampion(432, "巴德", "Bard"),
                createChampion(497, "洛", "Rakan"),
                createChampion(498, "霞", "Xayah"),
                createChampion(516, "奥恩", "Ornn"),
                createChampion(517, "塞恩", "Sion"),
                createChampion(518, "诺娃", "Neeko"),
                createChampion(523, "阿菲利乌斯", "Aphelios"),
                createChampion(526, "芮尔", "Rell"),
                createChampion(555, "派克", "Pyke"),
                createChampion(711, "薇古丝", "Vex"),
                createChampion(777, "永恩", "Yone"),
                createChampion(875, "瑟提", "Sett"),
                createChampion(876, "莉莉娅", "Lillia"),
                createChampion(877, "永恩", "Yone"),
                createChampion(895, "尼菈", "Nilah"),
                createChampion(902, "奎桑提", "KSante"),
                createChampion(950, "米利欧", "Milio"),
                createChampion(951, "纳亚菲莉", "Naafiri")
        );
        championCache.putAll(builtIn);
    }

    private boolean loadBuiltInChampionSnapshot() {
        try (InputStream input = AssetService.class.getResourceAsStream(BUILT_IN_CHAMPIONS_RESOURCE)) {
            if (input == null) {
                log.warn("内置英雄资源不存在: {}", BUILT_IN_CHAMPIONS_RESOURCE);
                return false;
            }

            Champion[] champions = BUILT_IN_CHAMPION_MAPPER.readValue(input, Champion[].class);
            Map<Long, Champion> builtIn = new LinkedHashMap<>();
            for (Champion champion : champions) {
                if (champion != null && champion.id > 0 && champion.name != null && !champion.name.isBlank()) {
                    builtIn.put(champion.id, champion);
                }
            }
            championCache.putAll(builtIn);
            log.info("内置英雄资源加载完成: {}", builtIn.size());
            return !builtIn.isEmpty();
        } catch (IOException e) {
            log.warn("读取内置英雄资源失败: {}", e.getMessage());
            return false;
        }
    }

    private Map.Entry<Long, Champion> createChampion(long id, String name, String alias) {
        return Map.entry(id, new Champion(id, name, alias));
    }

    /**
     * 获取所有英雄选项
     */
    public List<ChampionOption> getChampionOptions() {
        ensureAssetCatalogFresh();
        return championCache.values().stream()
                .filter(c -> c.id > 0 && !c.name.contains("末日人机"))
                .map(c -> new ChampionOption(c.id, c.name, c.name, c.alias))
                .sorted(Comparator.comparing(ChampionOption::label))
                .toList();
    }

    /**
     * 获取英雄名称
     */
    public String getChampionName(long id) {
        Champion champion = championCache.get(id);
        return champion != null ? champion.name : "未知英雄";
    }

    /**
     * 获取装备图标路径
     */
    public Optional<AssetImage> getAssetImage(AssetKind kind, long id) {
        if (kind == null || id <= 0) {
            return Optional.empty();
        }

        Optional<AssetImage> cached = readCachedAssetImage(kind, id);
        if (cached.isPresent()) {
            return cached;
        }

        String iconPath = resolveLcuIconPath(kind, id);
        if (iconPath == null || iconPath.isBlank()) {
            return Optional.empty();
        }

        try {
            byte[] imageData = lcuHttpClient.getBytes(iconPath);
            if (imageData == null || imageData.length == 0) {
                return Optional.empty();
            }
            cacheAssetImage(kind, id, iconPath, imageData);
            return Optional.of(new AssetImage(imageData, contentTypeForIconPath(iconPath)));
        } catch (Exception e) {
            log.warn("Failed to load asset image from LCU: kind={}, id={}, path={}, rootCause={}",
                    kind.wireName, id, iconPath, e.getMessage());
            return Optional.empty();
        }
    }

    private Optional<AssetImage> readCachedAssetImage(AssetKind kind, long id) {
        try {
            Optional<Path> cachedPath = findCachedAssetPath(kind, id);
            if (cachedPath.isEmpty()) {
                return Optional.empty();
            }
            Path path = cachedPath.get();
            byte[] bytes = Files.readAllBytes(path);
            if (bytes.length == 0) {
                return Optional.empty();
            }
            return Optional.of(new AssetImage(bytes, contentTypeForIconPath(path.getFileName().toString())));
        } catch (IOException e) {
            log.debug("Failed to read cached asset image: kind={}, id={}, rootCause={}",
                    kind.wireName, id, e.getMessage());
            return Optional.empty();
        }
    }

    private Optional<Path> findCachedAssetPath(AssetKind kind, long id) throws IOException {
        Path directory = assetCacheRoot.resolve(ASSET_CACHE_VERSION).resolve(kind.cacheDirectory);
        if (!Files.isDirectory(directory)) {
            return Optional.empty();
        }
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(directory, id + ".*")) {
            for (Path path : stream) {
                if (Files.isRegularFile(path)) {
                    return Optional.of(path);
                }
            }
        }
        return Optional.empty();
    }

    private void cacheAssetImage(AssetKind kind, long id, String iconPath, byte[] imageData) {
        Path target = assetCacheRoot
                .resolve(ASSET_CACHE_VERSION)
                .resolve(kind.cacheDirectory)
                .resolve(id + "." + extensionForIconPath(iconPath, kind.defaultExtension));
        try {
            Files.createDirectories(target.getParent());
            deleteSiblingCacheFiles(kind, id, target);
            Files.write(target, imageData);
        } catch (IOException e) {
            log.debug("Failed to write cached asset image: kind={}, id={}, path={}, rootCause={}",
                    kind.wireName, id, target, e.getMessage());
        }
    }

    private void deleteSiblingCacheFiles(AssetKind kind, long id, Path target) throws IOException {
        Path directory = target.getParent();
        if (!Files.isDirectory(directory)) {
            return;
        }
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(directory, id + ".*")) {
            for (Path path : stream) {
                if (!path.equals(target)) {
                    Files.deleteIfExists(path);
                }
            }
        }
    }

    private String resolveLcuIconPath(AssetKind kind, long id) {
        return switch (kind) {
            case CHAMPION -> String.format("/lol-game-data/assets/v1/champion-icons/%d.png", id);
            case PROFILE -> String.format("/lol-game-data/assets/v1/profile-icons/%d.jpg", id);
            case ITEM -> resolveItemIconPath(id);
            case SPELL -> resolveSpellIconPath(id);
            case PERK -> getPerkIconPath(id);
            case AUGMENT -> resolveAugmentIconPath(id);
        };
    }

    private String resolveItemIconPath(long id) {
        String path = getItemIconPath(id);
        if (path == null || path.isBlank()) {
            loadItems();
            path = getItemIconPath(id);
        }
        return path;
    }

    private String resolveSpellIconPath(long id) {
        String path = getSpellIconPath(id);
        if (path == null || path.isBlank()) {
            loadSpells();
            path = getSpellIconPath(id);
        }
        return path;
    }

    private String resolveAugmentIconPath(long id) {
        String path = augmentIconPathCache.get(id);
        if (path == null || path.isBlank()) {
            loadAugments();
        }
        return getAugmentIconPath(id);
    }

    public String getItemIconPath(long id) {
        ensureAssetCatalogFresh();
        return itemIconPathCache.get(id);
    }

    /**
     * 获取召唤师技能图标路径
     */
    public String getSpellIconPath(long id) {
        ensureAssetCatalogFresh();
        return spellIconPathCache.get(id);
    }

    /**
     * Get perk icon path from LCU metadata.
     */
    public String getPerkIconPath(long id) {
        String path = perkIconPathCache.get(id);
        if (path == null || path.isEmpty()) {
            ensurePerkMetadataFresh();
            path = perkIconPathCache.get(id);
        }
        return path;
    }

    /**
     * 加载海克斯强化列表 (cherry-augments)
     */
    private void loadAugments() {
        try {
            CherryAugment[] augments = lcuHttpClient.get("lol-game-data/assets/v1/cherry-augments.json", CherryAugment[].class);
            if (augments != null) {
                for (CherryAugment augment : augments) {
                    if (augment.id > 0) {
                        String iconPath = firstText(augment.augmentSmallIconPath, augment.iconPath);
                        if (!iconPath.isEmpty()) {
                            augmentIconPathCache.put(augment.id, iconPath);
                        }
                        augmentMetadataCache.put(augment.id, toAugmentMetadata(augment));
                        // 缓存稀有度
                        if (augment.rarity != null && !augment.rarity.isEmpty()) {
                            augmentRarityCache.put(augment.id, augment.rarity);
                        }
                    }
                }
            }
            log.info("海克斯强化加载完成: {}, 稀有度: {}", augmentIconPathCache.size(), augmentRarityCache.size());
        } catch (Exception e) {
            log.warn("加载海克斯强化失败: {}", e.getMessage());
        }
        mergeKiwiAugmentFallbacks();
    }

    /**
     * 获取海克斯强化图标路径
     */
    /**
     * 取单个强化的元数据（名称/描述/稀有度/图标）。
     *
     * <p>供海斗面板把 101 的排名数据与本地定义合并展示。
     */
    public java.util.Optional<AugmentMetadata> getAugmentMetadata(long id) {
        return java.util.Optional.ofNullable(augmentMetadataCache.get(id));
    }

    /**
     * 全部强化定义（LCU cherry-augments + 腾讯 kiwi 兜底）。
     *
     * <p>用于 OCR 匹配的候选集：101 榜单只包含被统计到的强化，
     * 像「裁决使」这种没进榜单的强化也要能认出来。
     */
    public java.util.List<AugmentMetadata> getAllAugmentMetadata() {
        return java.util.List.copyOf(augmentMetadataCache.values());
    }

    public String getAugmentIconPath(long id) {
        String path = augmentIconPathCache.get(id);
        if (path != null && !path.isEmpty()) {
            return path;
        }
        // 如果缓存中没有，尝试使用默认路径格式
        return String.format("/lol-game-data/assets/v1/augments/%d.png", id);
    }

    /**
     * 获取海克斯强化稀有度
     */
    public String getAugmentRarity(long id) {
        return augmentRarityCache.getOrDefault(id, "");
    }

    public GameAssetMetadata getGameAssetMetadata() {
        ensureAssetCatalogFresh();
        ensurePerkMetadataFresh();
        mergeKiwiAugmentFallbacks();
        return new GameAssetMetadata(
                "lcu",
                "zh_CN",
                toStringKeyedMap(itemMetadataCache),
                toStringKeyedMap(spellMetadataCache),
                toStringKeyedMap(perkMetadataCache),
                toStringKeyedMap(augmentMetadataCache)
        );
    }

    private void mergeKiwiAugmentFallbacks() {
        Map<Long, KiwiAugmentFallbackService.KiwiAugmentFallback> fallbacks = kiwiAugmentFallbackService.getAugmentFallbacks();
        if (fallbacks.isEmpty()) {
            return;
        }

        for (Map.Entry<Long, KiwiAugmentFallbackService.KiwiAugmentFallback> entry : fallbacks.entrySet()) {
            long id = entry.getKey();
            KiwiAugmentFallbackService.KiwiAugmentFallback fallback = entry.getValue();
            augmentMetadataCache.compute(id, (ignored, current) -> mergeKiwiAugmentFallback(current, id, fallback));
            if (shouldFillText(augmentRarityCache.get(id)) && !firstText(fallback.rarity()).isBlank()) {
                augmentRarityCache.put(id, fallback.rarity());
            }
        }
    }

    private AugmentMetadata mergeKiwiAugmentFallback(
            AugmentMetadata current,
            long id,
            KiwiAugmentFallbackService.KiwiAugmentFallback fallback
    ) {
        if (current == null) {
            return new AugmentMetadata(
                    id,
                    firstText(fallback.name()),
                    firstText(fallback.description()),
                    firstText(fallback.tooltip()),
                    firstText(fallback.desc()),
                    "",
                    "",
                    "",
                    "",
                    firstText(fallback.rarity()),
                    ""
            );
        }

        return new AugmentMetadata(
                current.id(),
                shouldFillText(current.name()) ? firstText(fallback.name(), current.name()) : current.name(),
                shouldFillText(current.description()) ? firstText(fallback.description(), current.description()) : current.description(),
                shouldFillText(current.tooltip()) ? firstText(fallback.tooltip(), current.tooltip()) : current.tooltip(),
                shouldFillText(current.desc()) ? firstText(fallback.desc(), current.desc()) : current.desc(),
                current.shortDesc(),
                current.longDesc(),
                current.descriptionTra(),
                current.tooltipTra(),
                shouldFillText(current.rarity()) ? firstText(fallback.rarity(), current.rarity()) : current.rarity(),
                current.icon()
        );
    }

    private boolean shouldFillText(String value) {
        if (value == null || value.isBlank()) {
            return true;
        }
        return "暂无详细说明".equals(value.trim());
    }

    private void ensurePerkMetadataFresh() {
        long now = System.currentTimeMillis();
        boolean hasPerkMetadata = !perkMetadataCache.isEmpty();
        if (hasPerkMetadata && now - lastPerkMetadataRefreshAttemptAt < LCU_PERK_METADATA_REFRESH_INTERVAL_MS) {
            return;
        }
        loadPerks();
    }

    private <T> Map<String, T> toStringKeyedMap(Map<Long, T> source) {
        Map<String, T> result = new LinkedHashMap<>();
        source.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .forEach(entry -> result.put(String.valueOf(entry.getKey()), entry.getValue()));
        return result;
    }

    private ItemMetadata toItemMetadata(Item item) {
        ItemGold gold = normalizeGold(item.gold, firstPositive(item.priceTotal, item.total, item.price), item.base, item.sell);
        return new ItemMetadata(
                item.id,
                firstText(item.name),
                firstText(item.description),
                firstText(item.tooltip),
                firstText(item.plaintext),
                normalizePublicIcon("items", item.id, item.iconPath),
                gold,
                firstPositive(item.total, item.priceTotal),
                item.price,
                normalizeIdList(item.from),
                normalizeIdList(item.into),
                normalizeStats(item.stats)
        );
    }

    private AugmentMetadata toAugmentMetadata(CherryAugment augment) {
        String iconPath = firstText(augment.augmentSmallIconPath, augment.iconPath);
        return new AugmentMetadata(
                augment.id,
                firstText(augment.name, augment.nameTra),
                firstText(augment.description, augment.descriptionTra, augment.desc, augment.tooltip, augment.tooltipTra, augment.longDesc, augment.shortDesc),
                firstText(augment.tooltip),
                firstText(augment.desc),
                firstText(augment.shortDesc),
                firstText(augment.longDesc),
                firstText(augment.descriptionTra),
                firstText(augment.tooltipTra),
                firstText(augment.rarity),
                normalizePublicIcon("augments", augment.id, iconPath)
        );
    }

    private PerkMetadata toPerkMetadata(Perk perk) {
        return new PerkMetadata(
                perk.id,
                firstText(perk.name),
                firstText(perk.description, perk.longDesc, perk.shortDesc, perk.tooltip),
                firstText(perk.tooltip),
                firstText(perk.shortDesc),
                firstText(perk.longDesc),
                normalizeTextList(perk.endOfGameStatDescs),
                firstText(perk.iconPath)
        );
    }

    private PerkMetadata toPerkMetadata(PerkStyle style) {
        return new PerkMetadata(
                style.id,
                firstText(style.name),
                firstText(style.tooltip),
                firstText(style.tooltip),
                "",
                "",
                List.of(),
                firstText(style.iconPath)
        );
    }

    private SpellMetadata toSpellMetadata(Spell spell) {
        return new SpellMetadata(
                spell.id,
                firstText(spell.name),
                firstText(spell.description),
                firstText(spell.tooltip),
                firstText(spell.plaintext),
                normalizePublicIcon("summoner-spells", spell.id, spell.iconPath)
        );
    }

    private ItemGold normalizeGold(ItemGold gold, Long totalFallback, Long baseFallback, Long sellFallback) {
        Long total = gold != null ? firstPositive(gold.total(), totalFallback) : totalFallback;
        Long base = gold != null ? firstPositive(gold.base(), baseFallback) : baseFallback;
        Long sell = gold != null ? firstPositive(gold.sell(), sellFallback) : sellFallback;
        return total != null || base != null || sell != null ? new ItemGold(total, base, sell) : null;
    }

    private List<Long> normalizeIdList(List<Long> values) {
        if (values == null) {
            return List.of();
        }
        return values.stream()
                .filter(value -> value != null && value > 0)
                .toList();
    }

    private Map<String, Number> normalizeStats(Map<String, Number> values) {
        if (values == null) {
            return Map.of();
        }
        Map<String, Number> stats = new LinkedHashMap<>();
        values.entrySet().stream()
                .filter(entry -> entry.getKey() != null && !entry.getKey().isBlank())
                .filter(entry -> entry.getValue() != null)
                .forEach(entry -> stats.put(entry.getKey(), entry.getValue()));
        return stats;
    }

    private Long firstPositive(Long... values) {
        if (values == null) {
            return null;
        }
        for (Long value : values) {
            if (value != null && value > 0) {
                return value;
            }
        }
        return null;
    }

    private String firstText(String... values) {
        if (values == null) {
            return "";
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return "";
    }

    private static List<String> normalizeTextList(Object value) {
        if (value instanceof String text) {
            return text.isBlank() ? List.of() : List.of(text);
        }
        if (value instanceof List<?> values) {
            return values.stream()
                    .filter(String.class::isInstance)
                    .map(String.class::cast)
                    .filter(text -> !text.isBlank())
                    .toList();
        }
        return List.of();
    }

    private String normalizePublicIcon(String directory, long id, String iconPath) {
        if (iconPath == null || iconPath.isBlank()) {
            return "";
        }
        String normalized = iconPath.replace('\\', '/');
        int index = normalized.lastIndexOf('/');
        String fileName = index >= 0 ? normalized.substring(index + 1) : normalized;
        if (fileName.isBlank()) {
            fileName = id + ".png";
        }
        return directory + "/" + fileName;
    }

    private static Path resolveDefaultAssetCacheRoot() {
        String appData = System.getenv("APPDATA");
        if (appData != null && !appData.isBlank()) {
            return Paths.get(appData, "RankPeek", "game-assets");
        }
        String home = System.getProperty("user.home", ".");
        return Paths.get(home, ".rankpeek", "game-assets");
    }

    private static String extensionForIconPath(String iconPath, String defaultExtension) {
        String normalized = iconPath == null ? "" : iconPath.replace('\\', '/');
        int queryIndex = normalized.indexOf('?');
        if (queryIndex >= 0) {
            normalized = normalized.substring(0, queryIndex);
        }
        int slashIndex = normalized.lastIndexOf('/');
        String fileName = slashIndex >= 0 ? normalized.substring(slashIndex + 1) : normalized;
        int dotIndex = fileName.lastIndexOf('.');
        if (dotIndex >= 0 && dotIndex + 1 < fileName.length()) {
            String extension = fileName.substring(dotIndex + 1).toLowerCase(Locale.ROOT);
            if (extension.matches("[a-z0-9]{1,5}")) {
                return extension;
            }
        }
        return defaultExtension;
    }

    private static String contentTypeForIconPath(String iconPath) {
        String extension = extensionForIconPath(iconPath, "png");
        return switch (extension) {
            case "jpg", "jpeg" -> "image/jpeg";
            case "svg" -> "image/svg+xml";
            case "webp" -> "image/webp";
            default -> "image/png";
        };
    }

    public enum AssetKind {
        CHAMPION("champion", "champion", "png"),
        ITEM("item", "item", "png"),
        SPELL("spell", "spell", "png"),
        PERK("perk", "perk", "png"),
        AUGMENT("augment", "augment", "png"),
        PROFILE("profile", "profile", "jpg");

        private final String wireName;
        private final String cacheDirectory;
        private final String defaultExtension;

        AssetKind(String wireName, String cacheDirectory, String defaultExtension) {
            this.wireName = wireName;
            this.cacheDirectory = cacheDirectory;
            this.defaultExtension = defaultExtension;
        }
    }

    public record AssetImage(byte[] bytes, String contentType) {
    }

    // ========== 内部模型 ==========

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Champion {
        @JsonProperty("id")
        private long id;

        @JsonProperty("name")
        private String name;

        @JsonProperty("alias")
        private String alias;

        public Champion() {
        }

        public Champion(long id, String name, String alias) {
            this.id = id;
            this.name = name;
            this.alias = alias;
        }
    }

    public record ChampionOption(long value, String label, String realName, String nickname) {
    }

    public record GameAssetMetadata(
            String version,
            String locale,
            Map<String, ItemMetadata> items,
            Map<String, SpellMetadata> summonerSpells,
            Map<String, PerkMetadata> perks,
            Map<String, AugmentMetadata> augments
    ) {
    }

    public record GameAssetMetadataEntry(long id) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ItemGold(
            @JsonProperty("total") Long total,
            @JsonProperty("base") Long base,
            @JsonProperty("sell") Long sell
    ) {
    }

    public record ItemMetadata(
            long id,
            String name,
            String description,
            String tooltip,
            String plaintext,
            String icon,
            ItemGold gold,
            Long total,
            Long price,
            List<Long> from,
            List<Long> into,
            Map<String, Number> stats
    ) {
    }

    public record SpellMetadata(
            long id,
            String name,
            String description,
            String tooltip,
            String plaintext,
            String icon
    ) {
    }

    public record PerkMetadata(
            long id,
            String name,
            String description,
            String tooltip,
            String shortDesc,
            String longDesc,
            List<String> endOfGameStatDescs,
            String icon
    ) {
        public PerkMetadata(
                long id,
                String name,
                String description,
                String tooltip,
                String shortDesc,
                String longDesc,
                String icon
        ) {
            this(id, name, description, tooltip, shortDesc, longDesc, List.of(), icon);
        }
    }

    public record AugmentMetadata(
            long id,
            String name,
            String description,
            String tooltip,
            String desc,
            String shortDesc,
            String longDesc,
            String descriptionTra,
            String tooltipTra,
            String rarity,
            String icon
    ) {
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Item {
        @JsonProperty("id")
        private long id;

        @JsonProperty("name")
        private String name;

        @JsonProperty("description")
        private String description;

        @JsonProperty("tooltip")
        private String tooltip;

        @JsonProperty("plaintext")
        private String plaintext;

        @JsonProperty("iconPath")
        private String iconPath;

        @JsonProperty("gold")
        private ItemGold gold;

        @JsonProperty("total")
        private Long total;

        @JsonProperty("price")
        private Long price;

        @JsonProperty("priceTotal")
        private Long priceTotal;

        @JsonProperty("base")
        private Long base;

        @JsonProperty("sell")
        private Long sell;

        @JsonProperty("from")
        private List<Long> from;

        @JsonProperty("into")
        private List<Long> into;

        @JsonProperty("stats")
        private Map<String, Number> stats;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Spell {
        @JsonProperty("id")
        private long id;

        @JsonProperty("name")
        private String name;

        @JsonProperty("description")
        private String description;

        @JsonProperty("tooltip")
        private String tooltip;

        @JsonProperty("plaintext")
        private String plaintext;

        @JsonProperty("iconPath")
        private String iconPath;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Perk {
        @JsonProperty("id")
        private long id;

        @JsonProperty("name")
        private String name;

        @JsonProperty("description")
        private String description;

        @JsonProperty("tooltip")
        private String tooltip;

        @JsonProperty("shortDesc")
        private String shortDesc;

        @JsonProperty("longDesc")
        private String longDesc;

        private List<String> endOfGameStatDescs = List.of();

        @JsonProperty("endOfGameStatDescs")
        @JsonAlias({"endOfGameStatDesc", "endOfGameStats", "endOfGameStatDescriptions"})
        public void setEndOfGameStatDescs(Object endOfGameStatDescs) {
            this.endOfGameStatDescs = normalizeTextList(endOfGameStatDescs);
        }

        @JsonProperty("iconPath")
        private String iconPath;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class PerkStylePayload {
        @JsonProperty("styles")
        private List<PerkStyle> styles;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class PerkStyle {
        @JsonProperty("id")
        private long id;

        @JsonProperty("name")
        private String name;

        @JsonProperty("tooltip")
        private String tooltip;

        @JsonProperty("iconPath")
        private String iconPath;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Augment {
        @JsonProperty("id")
        private long id;

        @JsonProperty("iconPath")
        private String iconPath;

        @JsonProperty("name")
        private String name;

        @JsonProperty("rarity")
        private String rarity;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class CherryAugment {
        @JsonProperty("id")
        private long id;

        @JsonProperty("iconPath")
        private String iconPath;

        @JsonProperty("augmentSmallIconPath")
        private String augmentSmallIconPath;

        @JsonProperty("name")
        private String name;

        @JsonProperty("description")
        private String description;

        @JsonProperty("tooltip")
        private String tooltip;

        @JsonProperty("desc")
        private String desc;

        @JsonProperty("shortDesc")
        private String shortDesc;

        @JsonProperty("longDesc")
        @JsonAlias("longDescription")
        private String longDesc;

        @JsonProperty("nameTRA")
        private String nameTra;

        @JsonProperty("descriptionTRA")
        @JsonAlias("descriptionTra")
        private String descriptionTra;

        @JsonProperty("tooltipTRA")
        @JsonAlias("tooltipTra")
        private String tooltipTra;

        @JsonProperty("rarity")
        private String rarity;
    }
}
