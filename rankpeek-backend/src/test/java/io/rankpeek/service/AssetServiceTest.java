package io.rankpeek.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AssetServiceTest {

    @Mock
    private LcuHttpClient lcuHttpClient;

    @TempDir
    private Path assetCacheRoot;

    private AssetService service;

    @BeforeEach
    void setUp() {
        service = new AssetService(lcuHttpClient, assetCacheRoot);
    }

    @Test
    void getAssetImageReadsDiskCacheBeforeLcu() throws Exception {
        Path cachedIcon = assetCacheRoot.resolve("lcu/item/6610.png");
        Files.createDirectories(cachedIcon.getParent());
        byte[] cachedBytes = new byte[]{9, 8, 7};
        Files.write(cachedIcon, cachedBytes);

        Optional<AssetService.AssetImage> image = service.getAssetImage(AssetService.AssetKind.ITEM, 6610);

        assertThat(image).isPresent();
        assertThat(image.get().bytes()).isEqualTo(cachedBytes);
        assertThat(image.get().contentType()).isEqualTo("image/png");
        verifyNoInteractions(lcuHttpClient);
    }

    @Test
    void getAssetImageDownloadsAndCachesLcuBytesWhenCacheMisses() throws Exception {
        AssetService.Item item = new AssetService.Item();
        item.setId(6610);
        item.setIconPath("/lol-game-data/assets/v1/items/6610.png");
        byte[] lcuBytes = new byte[]{1, 2, 3};

        when(lcuHttpClient.get(eq("lol-game-data/assets/v1/items.json"), eq(AssetService.Item[].class)))
                .thenReturn(new AssetService.Item[]{item});
        ReflectionTestUtils.invokeMethod(service, "loadItems");
        when(lcuHttpClient.getBytes("/lol-game-data/assets/v1/items/6610.png")).thenReturn(lcuBytes);

        Optional<AssetService.AssetImage> first = service.getAssetImage(AssetService.AssetKind.ITEM, 6610);

        assertThat(first).isPresent();
        assertThat(first.get().bytes()).isEqualTo(lcuBytes);
        assertThat(first.get().contentType()).isEqualTo("image/png");
        assertThat(Files.readAllBytes(assetCacheRoot.resolve("lcu/item/6610.png"))).isEqualTo(lcuBytes);
        verify(lcuHttpClient).getBytes("/lol-game-data/assets/v1/items/6610.png");

        reset(lcuHttpClient);
        Optional<AssetService.AssetImage> second = service.getAssetImage(AssetService.AssetKind.ITEM, 6610);

        assertThat(second).isPresent();
        assertThat(second.get().bytes()).isEqualTo(lcuBytes);
        verifyNoInteractions(lcuHttpClient);
    }

    @Test
    void loadBuiltInChampionsUsesCurrentChampionIdsWhenLcuSummaryFails() {
        when(lcuHttpClient.get(eq("lol-game-data/assets/v1/champion-summary.json"), eq(AssetService.Champion[].class)))
                .thenThrow(new RuntimeException("LCU unavailable"));

        ReflectionTestUtils.invokeMethod(service, "loadChampions");

        Map<Long, AssetService.ChampionOption> optionsById = service.getChampionOptions().stream()
                .collect(java.util.stream.Collectors.toMap(AssetService.ChampionOption::value, option -> option));

        assertThat(optionsById).hasSize(173);
        assertThat(service.getChampionName(233)).isEqualTo("狂厄蔷薇");
        assertThat(service.getChampionName(200)).isEqualTo("虚空女皇");
        assertThat(service.getChampionName(888)).isEqualTo("炼金男爵");
        assertThat(service.getChampionName(799)).isEqualTo("铁血狼母");
        assertThat(service.getChampionName(800)).isEqualTo("流光镜影");
        assertThat(service.getChampionName(804)).isEqualTo("不破之誓");
        assertThat(service.getChampionName(887)).isEqualTo("灵罗娃娃");
        assertThat(service.getChampionName(893)).isEqualTo("双界灵兔");
        assertThat(service.getChampionName(897)).isEqualTo("纳祖芒荣耀");
        assertThat(service.getChampionName(901)).isEqualTo("炽炎雏龙");
        assertThat(service.getChampionName(902)).isEqualTo("明烛");
        assertThat(service.getChampionName(904)).isEqualTo("不落魔锋");
        assertThat(service.getChampionName(910)).isEqualTo("异画师");
        assertThat(service.getChampionName(950)).isEqualTo("百裂冥犬");
        // 16.19 的新英雄：内置快照必须跟得上客户端
        assertThat(service.getChampionName(805)).isEqualTo("灰烬驱魔人");
        assertThat(optionsById.get(30L).nickname()).isEqualTo("Karthus");
        assertThat(optionsById.get(166L).nickname()).isEqualTo("Akshan");
        assertThat(optionsById.get(517L).nickname()).isEqualTo("Sylas");
        assertThat(optionsById).doesNotContainKeys(52L, 877L, 951L);
    }

    @Test
    void refreshAssetCatalogRefillsItemsWhenLcuBecomesAvailable() {
        AssetService.Item item = new AssetService.Item();
        item.setId(3153);
        item.setName("破败王者之刃");
        item.setIconPath("/lol-game-data/assets/v1/items/3153.png");

        when(lcuHttpClient.get(eq("lol-game-data/assets/v1/items.json"), eq(AssetService.Item[].class)))
                .thenReturn(new AssetService.Item[]{item});
        when(lcuHttpClient.get(eq("lol-game-data/assets/v1/summoner-spells.json"), eq(AssetService.Spell[].class)))
                .thenReturn(new AssetService.Spell[0]);
        when(lcuHttpClient.get(eq("lol-game-data/assets/v1/cherry-augments.json"), eq(AssetService.CherryAugment[].class)))
                .thenReturn(new AssetService.CherryAugment[0]);

        // 启动阶段 LCU 还没有认证，拿到认证后的刷新必须补齐装备/技能数据
        ReflectionTestUtils.invokeMethod(service, "refreshAssetCatalog");

        assertThat(service.getGameAssetMetadata().items()).containsKey("3153");
        assertThat(service.getItemIconPath(3153)).isEqualTo("/lol-game-data/assets/v1/items/3153.png");
        assertThat(service.getSpellIconPath(4)).isNull();
    }

    @Test
    void loadItemsCachesLcuMetadataForFrontendTooltips() {
        AssetService.Item item = new AssetService.Item();
        item.setId(6610);
        item.setName("焚天");
        item.setDescription("<mainText><stats>40攻击力<br>400生命值</stats></mainText>");
        item.setTooltip("<mainText><passive>光盾打击</passive><br>造成额外伤害。</mainText>");
        item.setPlaintext("光盾打击");
        item.setIconPath("/lol-game-data/assets/v1/items/6610.png");
        item.setGold(new AssetService.ItemGold(3100L, 900L, 2170L));
        item.setFrom(List.of(1036L, 1028L));
        item.setInto(List.of(3143L));
        item.setStats(Map.of("FlatPhysicalDamageMod", 40, "FlatHPPoolMod", 400));

        when(lcuHttpClient.get(eq("lol-game-data/assets/v1/items.json"), eq(AssetService.Item[].class)))
                .thenReturn(new AssetService.Item[]{item});

        ReflectionTestUtils.invokeMethod(service, "loadItems");

        AssetService.GameAssetMetadata metadata = service.getGameAssetMetadata();
        AssetService.ItemMetadata entry = metadata.items().get("6610");

        assertThat(entry).isNotNull();
        assertThat(entry.id()).isEqualTo(6610);
        assertThat(entry.name()).isEqualTo("焚天");
        assertThat(entry.description()).contains("40攻击力");
        assertThat(entry.tooltip()).contains("光盾打击");
        assertThat(entry.plaintext()).isEqualTo("光盾打击");
        assertThat(entry.icon()).isEqualTo("items/6610.png");
        assertThat(entry.gold().total()).isEqualTo(3100);
        assertThat(entry.from()).containsExactly(1036L, 1028L);
        assertThat(entry.into()).containsExactly(3143L);
        assertThat(entry.stats()).containsEntry("FlatHPPoolMod", 400);
        assertThat(service.getItemIconPath(6610)).isEqualTo("/lol-game-data/assets/v1/items/6610.png");
    }

    @Test
    void loadSpellsCachesLcuMetadataForFrontendTooltips() {
        AssetService.Spell spell = new AssetService.Spell();
        spell.setId(4);
        spell.setName("闪现");
        spell.setDescription("朝着目标区域瞬移一小段距离。");
        spell.setTooltip("<mainText>快速位移。</mainText>");
        spell.setIconPath("/lol-game-data/assets/v1/summoner-spells/4.png");

        when(lcuHttpClient.get(eq("lol-game-data/assets/v1/summoner-spells.json"), eq(AssetService.Spell[].class)))
                .thenReturn(new AssetService.Spell[]{spell});

        ReflectionTestUtils.invokeMethod(service, "loadSpells");

        AssetService.GameAssetMetadata metadata = service.getGameAssetMetadata();
        AssetService.SpellMetadata entry = metadata.summonerSpells().get("4");

        assertThat(entry).isNotNull();
        assertThat(entry.id()).isEqualTo(4);
        assertThat(entry.name()).isEqualTo("闪现");
        assertThat(entry.description()).isEqualTo("朝着目标区域瞬移一小段距离。");
        assertThat(entry.tooltip()).isEqualTo("<mainText>快速位移。</mainText>");
        assertThat(entry.icon()).isEqualTo("summoner-spells/4.png");
        assertThat(service.getSpellIconPath(4)).isEqualTo("/lol-game-data/assets/v1/summoner-spells/4.png");
    }

    @Test
    void loadPerksCachesLcuMetadataAndStyleIconsForFrontendTooltips() {
        AssetService.Perk perk = new AssetService.Perk();
        perk.setId(8992);
        perk.setName("冥火之触");
        perk.setTooltip("用一个技能对一名英雄造成伤害时，会持续灼烧该英雄。");
        perk.setShortDesc("用一个技能对一名英雄造成伤害时，会持续灼烧该英雄。");
        perk.setLongDesc("用一个技能对一名英雄造成伤害时，会灼烧其造成自适应伤害。");
        ReflectionTestUtils.setField(perk, "endOfGameStatDescs", List.of("Damage dealt: @eogvar1@"));
        perk.setIconPath("/lol-game-data/assets/v1/perk-images/Styles/Sorcery/DFT.jpg");

        AssetService.PerkStylePayload stylePayload = new AssetService.PerkStylePayload();
        AssetService.PerkStyle style = new AssetService.PerkStyle();
        style.setId(8200);
        style.setName("巫术");
        style.setTooltip("强化技能和资源控制");
        style.setIconPath("/lol-game-data/assets/v1/perk-images/Styles/7202_Sorcery.png");
        stylePayload.setStyles(List.of(style));

        when(lcuHttpClient.get(eq("lol-game-data/assets/v1/perks.json"), eq(AssetService.Perk[].class)))
                .thenReturn(new AssetService.Perk[]{perk});
        when(lcuHttpClient.get(eq("lol-game-data/assets/v1/perkstyles.json"), eq(AssetService.PerkStylePayload.class)))
                .thenReturn(stylePayload);

        ReflectionTestUtils.invokeMethod(service, "loadPerks");

        AssetService.GameAssetMetadata metadata = service.getGameAssetMetadata();
        AssetService.PerkMetadata perkEntry = metadata.perks().get("8992");
        AssetService.PerkMetadata styleEntry = metadata.perks().get("8200");

        assertThat(perkEntry).isNotNull();
        assertThat(perkEntry.id()).isEqualTo(8992);
        assertThat(perkEntry.name()).isEqualTo("冥火之触");
        assertThat(perkEntry.shortDesc()).contains("灼烧");
        assertThat(perkEntry.longDesc()).contains("自适应伤害");
        assertThat(perkEntry.tooltip()).contains("灼烧");
        assertThat(perkEntry).extracting("endOfGameStatDescs").isEqualTo(List.of("Damage dealt: @eogvar1@"));
        assertThat(perkEntry.icon()).isEqualTo("/lol-game-data/assets/v1/perk-images/Styles/Sorcery/DFT.jpg");
        assertThat(service.getPerkIconPath(8992)).isEqualTo("/lol-game-data/assets/v1/perk-images/Styles/Sorcery/DFT.jpg");

        assertThat(styleEntry).isNotNull();
        assertThat(styleEntry.name()).isEqualTo("巫术");
        assertThat(styleEntry.description()).isEqualTo("强化技能和资源控制");
        assertThat(styleEntry).extracting("endOfGameStatDescs").isEqualTo(List.of());
        assertThat(styleEntry.icon()).isEqualTo("/lol-game-data/assets/v1/perk-images/Styles/7202_Sorcery.png");
        assertThat(service.getPerkIconPath(8200)).isEqualTo("/lol-game-data/assets/v1/perk-images/Styles/7202_Sorcery.png");
    }

    @Test
    void getGameAssetMetadataRefreshesPerksAfterStartupLcuFailure() {
        AssetService.Perk futurePerk = new AssetService.Perk();
        futurePerk.setId(999991);
        futurePerk.setName("Future LCU Perk");
        futurePerk.setTooltip("Future tooltip from LCU.");
        futurePerk.setShortDesc("Future short text.");
        futurePerk.setLongDesc("Future long description from LCU.");
        futurePerk.setIconPath("/lol-game-data/assets/v1/perk-images/Styles/Sorcery/Fake.jpg");

        AssetService.PerkStylePayload emptyStyles = new AssetService.PerkStylePayload();
        emptyStyles.setStyles(List.of());

        when(lcuHttpClient.get(eq("lol-game-data/assets/v1/perks.json"), eq(AssetService.Perk[].class)))
                .thenThrow(new RuntimeException("LCU unavailable"))
                .thenReturn(new AssetService.Perk[]{futurePerk});
        when(lcuHttpClient.get(eq("lol-game-data/assets/v1/perkstyles.json"), eq(AssetService.PerkStylePayload.class)))
                .thenReturn(emptyStyles);

        ReflectionTestUtils.invokeMethod(service, "loadPerks");

        AssetService.GameAssetMetadata metadata = service.getGameAssetMetadata();
        AssetService.PerkMetadata entry = metadata.perks().get("999991");

        assertThat(entry).isNotNull();
        assertThat(entry.name()).isEqualTo("Future LCU Perk");
        assertThat(entry.longDesc()).isEqualTo("Future long description from LCU.");
        assertThat(entry.icon()).isEqualTo("/lol-game-data/assets/v1/perk-images/Styles/Sorcery/Fake.jpg");
        assertThat(service.getPerkIconPath(999991)).isEqualTo("/lol-game-data/assets/v1/perk-images/Styles/Sorcery/Fake.jpg");
    }

    @Test
    void loadAugmentsCachesLcuMetadataForFrontendTooltips() {
        AssetService.CherryAugment augment = new AssetService.CherryAugment();
        augment.setId(2005);
        augment.setNameTra("扳机炼狱");
        augment.setDescriptionTra("每回合，你要么变大。");
        augment.setRarity("gold");
        augment.setAugmentSmallIconPath("/lol-game-data/assets/v1/augments/2005.png");

        when(lcuHttpClient.get(eq("lol-game-data/assets/v1/cherry-augments.json"), eq(AssetService.CherryAugment[].class)))
                .thenReturn(new AssetService.CherryAugment[]{augment});

        ReflectionTestUtils.invokeMethod(service, "loadAugments");

        AssetService.GameAssetMetadata metadata = service.getGameAssetMetadata();
        AssetService.AugmentMetadata entry = metadata.augments().get("2005");

        assertThat(entry).isNotNull();
        assertThat(entry.id()).isEqualTo(2005);
        assertThat(entry.name()).isEqualTo("扳机炼狱");
        assertThat(entry.description()).isEqualTo("每回合，你要么变大。");
        assertThat(entry.rarity()).isEqualTo("gold");
        assertThat(entry.icon()).isEqualTo("augments/2005.png");
        assertThat(service.getAugmentIconPath(2005)).isEqualTo("/lol-game-data/assets/v1/augments/2005.png");
    }

    @Test
    void loadAugmentsKeepsDetailedTooltipCandidatesForFrontendSelection() {
        AssetService.CherryAugment augment = new AssetService.CherryAugment();
        augment.setId(1346);
        augment.setNameTra("吸血习性");
        augment.setDescription("短句。");
        augment.setDesc("获得全能吸血。");
        augment.setTooltipTra("<mainText>获得<lifeSteal>15%全能吸血</lifeSteal>。<br><rules>参与击败会提升这个效果。</rules></mainText>");
        augment.setShortDesc("短。");
        augment.setLongDesc("获得全能吸血，并在参与击败后提升效果。");
        augment.setRarity("kGold");
        augment.setAugmentSmallIconPath("/lol-game-data/assets/v1/augments/1346.png");

        when(lcuHttpClient.get(eq("lol-game-data/assets/v1/cherry-augments.json"), eq(AssetService.CherryAugment[].class)))
                .thenReturn(new AssetService.CherryAugment[]{augment});

        ReflectionTestUtils.invokeMethod(service, "loadAugments");

        AssetService.AugmentMetadata entry = service.getGameAssetMetadata().augments().get("1346");

        assertThat(entry).isNotNull();
        assertThat(entry.description()).isEqualTo("短句。");
        assertThat(entry.desc()).isEqualTo("获得全能吸血。");
        assertThat(entry.tooltipTra()).contains("15%全能吸血");
        assertThat(entry.shortDesc()).isEqualTo("短。");
        assertThat(entry.longDesc()).contains("参与击败");
        assertThat(entry.rarity()).isEqualTo("kGold");
    }

    @Test
    void loadAugmentsFillsMissingDescriptionFromKiwiFallbackWithoutChangingIconPath() {
        AssetService.CherryAugment augment = new AssetService.CherryAugment();
        augment.setId(2016);
        augment.setNameTra("LCU 名称");
        augment.setRarity("kSilver");
        augment.setAugmentSmallIconPath("/lol-game-data/assets/v1/augments/2016.png");

        when(lcuHttpClient.get(eq("lol-game-data/assets/v1/cherry-augments.json"), eq(AssetService.CherryAugment[].class)))
                .thenReturn(new AssetService.CherryAugment[]{augment});

        service = new AssetService(lcuHttpClient, assetCacheRoot, kiwiFallback("""
                {"data":[{"augmentID":2016,"name_cn":"Kiwi 名称","tooltip":"Kiwi 说明文本","desc":"Kiwi desc","level":"kGold"}]}
                """));

        ReflectionTestUtils.invokeMethod(service, "loadAugments");

        AssetService.AugmentMetadata entry = service.getGameAssetMetadata().augments().get("2016");

        assertThat(entry).isNotNull();
        assertThat(entry.name()).isEqualTo("LCU 名称");
        assertThat(entry.description()).isEqualTo("Kiwi 说明文本");
        assertThat(entry.tooltip()).isEqualTo("Kiwi 说明文本");
        assertThat(entry.desc()).isEqualTo("Kiwi desc");
        assertThat(entry.rarity()).isEqualTo("kSilver");
        assertThat(entry.icon()).isEqualTo("augments/2016.png");
        assertThat(service.getAugmentIconPath(2016)).isEqualTo("/lol-game-data/assets/v1/augments/2016.png");
    }

    @Test
    void loadAugmentsDoesNotOverwriteExistingLcuDescriptionWithKiwiFallback() {
        AssetService.CherryAugment augment = new AssetService.CherryAugment();
        augment.setId(2017);
        augment.setNameTra("LCU 名称");
        augment.setDescription("LCU 已有说明");
        augment.setTooltip("LCU tooltip");
        augment.setDesc("LCU desc");
        augment.setRarity("kGold");
        augment.setAugmentSmallIconPath("/lol-game-data/assets/v1/augments/2017.png");

        when(lcuHttpClient.get(eq("lol-game-data/assets/v1/cherry-augments.json"), eq(AssetService.CherryAugment[].class)))
                .thenReturn(new AssetService.CherryAugment[]{augment});

        service = new AssetService(lcuHttpClient, assetCacheRoot, kiwiFallback("""
                {"data":[{"augmentID":2017,"name_cn":"Kiwi 名称","tooltip":"Kiwi 说明文本","desc":"Kiwi desc","level":"kSilver"}]}
                """));

        ReflectionTestUtils.invokeMethod(service, "loadAugments");

        AssetService.AugmentMetadata entry = service.getGameAssetMetadata().augments().get("2017");

        assertThat(entry).isNotNull();
        assertThat(entry.name()).isEqualTo("LCU 名称");
        assertThat(entry.description()).isEqualTo("LCU 已有说明");
        assertThat(entry.tooltip()).isEqualTo("LCU tooltip");
        assertThat(entry.desc()).isEqualTo("LCU desc");
        assertThat(entry.rarity()).isEqualTo("kGold");
    }

    @Test
    void lcuMetadataLoadingFailuresDoNotEscape() {
        when(lcuHttpClient.get(eq("lol-game-data/assets/v1/items.json"), eq(AssetService.Item[].class)))
                .thenThrow(new RuntimeException("LCU unavailable"));
        when(lcuHttpClient.get(eq("lol-game-data/assets/v1/cherry-augments.json"), eq(AssetService.CherryAugment[].class)))
                .thenThrow(new RuntimeException("LCU unavailable"));

        assertThatCode(() -> ReflectionTestUtils.invokeMethod(service, "loadItems")).doesNotThrowAnyException();
        assertThatCode(() -> ReflectionTestUtils.invokeMethod(service, "loadAugments")).doesNotThrowAnyException();

        assertThat(service.getGameAssetMetadata().items()).isEmpty();
        assertThat(service.getGameAssetMetadata().augments()).isEmpty();
    }

    private KiwiAugmentFallbackService kiwiFallback(String payload) {
        return new KiwiAugmentFallbackService(
                true,
                "https://example.test/kiwi.json",
                Duration.ofHours(24),
                Duration.ofSeconds(2),
                Clock.fixed(Instant.parse("2026-05-19T00:00:00Z"), ZoneOffset.UTC),
                (url, timeout) -> payload,
                new com.fasterxml.jackson.databind.ObjectMapper()
        );
    }
}
