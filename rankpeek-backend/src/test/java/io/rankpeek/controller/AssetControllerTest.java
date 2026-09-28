package io.rankpeek.controller;

import io.rankpeek.service.AssetService;
import io.rankpeek.service.LcuHttpClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Map;
import java.util.List;
import java.util.Optional;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AssetControllerTest {

    @Mock
    private LcuHttpClient lcuHttpClient;

    @Mock
    private AssetService assetService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new AssetController(lcuHttpClient, assetService)).build();
    }

    @Test
    void metadataEndpointReturnsItemAndAugmentMetadata() throws Exception {
        AssetService.GameAssetMetadata metadata = new AssetService.GameAssetMetadata(
                "lcu",
                "zh_CN",
                Map.of("6610", new AssetService.ItemMetadata(
                        6610,
                        "焚天",
                        "<mainText>40攻击力</mainText>",
                        "<mainText><passive>光盾打击</passive></mainText>",
                        "光盾打击",
                        "items/6610.png",
                        new AssetService.ItemGold(3100L, 900L, 2170L),
                        null,
                        null,
                        List.of(1036L, 1028L),
                        List.of(3143L),
                        Map.of("FlatHPPoolMod", 400)
                )),
                Map.of("4", new AssetService.SpellMetadata(
                        4,
                        "闪现",
                        "朝着目标区域瞬移一小段距离。",
                        "",
                        "",
                        "summoner-spells/4.png"
                )),
                Map.of("8992", new AssetService.PerkMetadata(
                        8992,
                        "冥火之触",
                        "用一个技能对一名英雄造成伤害时，会灼烧其造成自适应伤害。",
                        "用一个技能对一名英雄造成伤害时，会持续灼烧该英雄。",
                        "用一个技能对一名英雄造成伤害时，会持续灼烧该英雄。",
                        "用一个技能对一名英雄造成伤害时，会灼烧其造成自适应伤害。",
                        "/lol-game-data/assets/v1/perk-images/Styles/Sorcery/DFT.jpg"
                )),
                Map.of("2005", new AssetService.AugmentMetadata(
                        2005,
                        "扳机炼狱",
                        "每回合，你要么变大。",
                        "",
                        "",
                        "",
                        "",
                        "",
                        "",
                        "gold",
                        "augments/2005.png"
                ))
        );
        when(assetService.getGameAssetMetadata()).thenReturn(metadata);

        mockMvc.perform(get("/api/v1/asset/metadata"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value("lcu"))
                .andExpect(jsonPath("$.locale").value("zh_CN"))
                .andExpect(jsonPath("$.items.6610.name").value("焚天"))
                .andExpect(jsonPath("$.items.6610.tooltip").value("<mainText><passive>光盾打击</passive></mainText>"))
                .andExpect(jsonPath("$.items.6610.gold.total").value(3100))
                .andExpect(jsonPath("$.items.6610.from[0]").value(1036))
                .andExpect(jsonPath("$.items.6610.stats.FlatHPPoolMod").value(400))
                .andExpect(jsonPath("$.summonerSpells.4.name").value("闪现"))
                .andExpect(jsonPath("$.summonerSpells.4.icon").value("summoner-spells/4.png"))
                .andExpect(jsonPath("$.augments.2005.name").value("扳机炼狱"))
                .andExpect(jsonPath("$.perks.8992.name").value("冥火之触"))
                .andExpect(jsonPath("$.perks.8992.longDesc").value("用一个技能对一名英雄造成伤害时，会灼烧其造成自适应伤害。"))
                .andExpect(jsonPath("$.perks.8992.icon").value("/lol-game-data/assets/v1/perk-images/Styles/Sorcery/DFT.jpg"))
                .andExpect(jsonPath("$.augments.2005.rarity").value("gold"));
    }

    @Test
    void perkIconEndpointProxiesLcuPerkIconPath() throws Exception {
        byte[] image = new byte[]{1, 2, 3};
        when(assetService.getAssetImage(AssetService.AssetKind.PERK, 8992L))
                .thenReturn(Optional.of(new AssetService.AssetImage(image, "image/jpeg")));

        mockMvc.perform(get("/api/v1/asset/perk/8992"))
                .andExpect(status().isOk())
                .andExpect(result -> org.assertj.core.api.Assertions.assertThat(result.getResponse().getContentAsByteArray()).isEqualTo(image))
                .andExpect(result -> org.assertj.core.api.Assertions.assertThat(result.getResponse().getContentType()).isEqualTo("image/jpeg"));
        verifyNoInteractions(lcuHttpClient);
    }
}
