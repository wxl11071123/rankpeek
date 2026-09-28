package io.rankpeek.controller;

import io.rankpeek.model.ApiResponse;
import io.rankpeek.model.AssetDetails;
import io.rankpeek.service.AssetService;
import io.rankpeek.service.LcuHttpClient;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;

/**
 * 游戏资源控制器
 */
@RestController
@RequestMapping("/api/v1/asset")
@RequiredArgsConstructor
public class AssetController {

    private final LcuHttpClient lcuHttpClient;
    private final AssetService assetService;

    /**
     * 获取头像图片
     */
    @GetMapping("/profile/{id}")
    public ResponseEntity<byte[]> getProfileIcon(@PathVariable Long id) {
        return getAssetImage(AssetService.AssetKind.PROFILE, id);
    }

    /**
     * 获取英雄图标
     */
    @GetMapping("/champion/{id}")
    public ResponseEntity<byte[]> getChampionIcon(@PathVariable Long id) {
        return getAssetImage(AssetService.AssetKind.CHAMPION, id);
    }

    /**
     * 获取装备图标
     */
    @GetMapping("/item/{id}")
    public ResponseEntity<byte[]> getItemIcon(@PathVariable Long id) {
        return getAssetImage(AssetService.AssetKind.ITEM, id);
    }

    /**
     * 获取召唤师技能图标
     */
    @GetMapping("/spell/{id}")
    public ResponseEntity<byte[]> getSpellIcon(@PathVariable Long id) {
        return getAssetImage(AssetService.AssetKind.SPELL, id);
    }

    /**
     * 获取海克斯强化图标
     */
    @GetMapping("/augment/{id}")
    public ResponseEntity<byte[]> getAugmentIcon(@PathVariable Long id) {
        return getAssetImage(AssetService.AssetKind.AUGMENT, id);
    }

    /**
     * Get perk icon from the current LCU asset path.
     */
    @GetMapping("/perk/{id}")
    public ResponseEntity<byte[]> getPerkIcon(@PathVariable Long id) {
        return getAssetImage(AssetService.AssetKind.PERK, id);
    }

    /**
     * 获取海克斯强化稀有度
     */
    private ResponseEntity<byte[]> getAssetImage(AssetService.AssetKind kind, Long id) {
        return assetService.getAssetImage(kind, id)
                .map(image -> {
                    HttpHeaders headers = new HttpHeaders();
                    headers.setContentType(MediaType.valueOf(image.contentType()));
                    headers.setCacheControl("public, max-age=86400");
                    return new ResponseEntity<>(image.bytes(), headers, HttpStatus.OK);
                })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/augment/{id}/rarity")
    public ApiResponse<String> getAugmentRarity(@PathVariable Long id) {
        String rarity = assetService.getAugmentRarity(id);
        return ApiResponse.success(rarity);
    }

    @GetMapping("/metadata")
    public AssetService.GameAssetMetadata getAssetMetadata() {
        return assetService.getGameAssetMetadata();
    }

    /**
     * 获取段位图标
     * @param tier 段位名称 (iron, bronze, silver, gold, platinum, emerald, diamond, master, grandmaster, challenger, unranked)
     */
    @GetMapping("/tier/{tier}")
    public ResponseEntity<byte[]> getTierIcon(@PathVariable String tier) {
        // 段位图标路径映射
        String tierUpper = tier.toUpperCase();
        String iconPath = switch (tierUpper) {
            case "UNRANKED" -> "/lol-game-data/assets/ux/tier-icons/unranked.png";
            case "IRON" -> "/lol-game-data/assets/ux/tier-icons/tier-1.png";
            case "BRONZE" -> "/lol-game-data/assets/ux/tier-icons/tier-2.png";
            case "SILVER" -> "/lol-game-data/assets/ux/tier-icons/tier-3.png";
            case "GOLD" -> "/lol-game-data/assets/ux/tier-icons/tier-4.png";
            case "PLATINUM" -> "/lol-game-data/assets/ux/tier-icons/tier-5.png";
            case "EMERALD" -> "/lol-game-data/assets/ux/tier-icons/tier-6.png";
            case "DIAMOND" -> "/lol-game-data/assets/ux/tier-icons/tier-7.png";
            case "MASTER" -> "/lol-game-data/assets/ux/tier-icons/tier-8.png";
            case "GRANDMASTER" -> "/lol-game-data/assets/ux/tier-icons/tier-8.png";
            case "CHALLENGER" -> "/lol-game-data/assets/ux/tier-icons/tier-8.png";
            default -> "/lol-game-data/assets/ux/tier-icons/unranked.png";
        };

        byte[] imageData = lcuHttpClient.getBytes(iconPath);
        if (imageData != null && imageData.length > 0) {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.IMAGE_PNG);
            headers.setCacheControl("public, max-age=86400");
            return new ResponseEntity<>(imageData, headers, HttpStatus.OK);
        }

        // 如果 LCU 没有返回，返回默认的 SVG 图标
        return createDefaultTierIcon(tierUpper);
    }

    /**
     * 创建默认的段位 SVG 图标
     */
    private ResponseEntity<byte[]> createDefaultTierIcon(String tier) {
        // 段位颜色映射
        String color = switch (tier) {
            case "IRON" -> "#5a5a5a";
            case "BRONZE" -> "#8c5a3c";
            case "SILVER" -> "#a8a8a8";
            case "GOLD" -> "#d4a84b";
            case "PLATINUM" -> "#5ca3ea";
            case "EMERALD" -> "#2ecc71";
            case "DIAMOND" -> "#5ca3ea";
            case "MASTER" -> "#9b59b6";
            case "GRANDMASTER" -> "#e74c3c";
            case "CHALLENGER" -> "#f39c12";
            default -> "#666666"; // UNRANKED
        };

        String svg = String.format("""
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
              <rect width="64" height="64" rx="8" fill="%s"/>
              <text x="32" y="40" font-family="Arial" font-size="24" font-weight="bold" fill="white" text-anchor="middle">%s</text>
            </svg>
            """, color, tier.charAt(0) + (tier.length() > 1 ? tier.substring(1, 2).toLowerCase() : ""));

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.valueOf("image/svg+xml"));
        headers.setCacheControl("public, max-age=86400");
        return new ResponseEntity<>(svg.getBytes(java.nio.charset.StandardCharsets.UTF_8), headers, HttpStatus.OK);
    }

    /**
     * 获取资源详情
     * @param type 资源类型 (item, rune, spell, champion)
     * @param ids ID 列表
     */
    @GetMapping("/details")
    public ApiResponse<List<AssetDetails>> getAssetDetails(
            @RequestParam String type,
            @RequestParam List<Long> ids) {

        List<AssetDetails> result = new ArrayList<>();

        for (Long id : ids) {
            AssetDetails details = getAssetDetailInternal(type, id);
            if (details != null) {
                result.add(details);
            }
        }

        return ApiResponse.success(result);
    }

    /**
     * 获取单个资源详情
     */
    @GetMapping("/detail/{type}/{id}")
    public ApiResponse<AssetDetails> getAssetDetail(
            @PathVariable String type,
            @PathVariable Long id) {

        return ApiResponse.success(getAssetDetailInternal(type, id));
    }

    /**
     * 内部方法：获取资源详情
     */
    private AssetDetails getAssetDetailInternal(String type, Long id) {
        return AssetDetails.builder()
                .id(id)
                .type(type)
                .name(getAssetName(type, id))
                .iconUrl(getAssetIconUrl(type, id))
                .build();
    }

    /**
     * 获取资源名称（简化实现）
     */
    private String getAssetName(String type, Long id) {
        // 实际应该从数据文件加载
        return type + "_" + id;
    }

    /**
     * 获取资源图标 URL
     */
    private String getAssetIconUrl(String type, Long id) {
        return switch (type.toLowerCase()) {
            case "item" -> String.format("/api/v1/asset/item/%d", id);
            case "champion" -> String.format("/api/v1/asset/champion/%d", id);
            case "spell" -> String.format("/api/v1/asset/spell/%d", id);
            case "perk", "rune" -> String.format("/api/v1/asset/perk/%d", id);
            case "augment" -> String.format("/api/v1/asset/augment/%d", id);
            case "profile" -> String.format("/api/v1/asset/profile/%d", id);
            default -> "";
        };
    }
}
