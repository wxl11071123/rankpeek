# RankPeek Game Assets

This directory is copied into the renderer bundle and served as `./game-assets/...`.

`manifest.json` maps League asset IDs to local icon files:

```json
{
  "version": "15.24.1",
  "locale": "zh_CN",
  "items": { "1001": "items/1001.png" },
  "summonerSpells": { "4": "summoner-spells/4.png" },
  "perks": { "8005": "perks/8005.png" },
  "augments": {},
  "champions": { "103": "champions/103.png" },
  "profileIcons": { "29": "profile-icons/29.png" },
  "objectives": { "infernal": "objectives/dragon_infernal.png" }
}
```

Keep this folder selective. Do not commit a full dragontail archive or large binary packs.

`metadata.json` stores text details for assets that need names or tooltips:

```json
{
  "version": "15.24.1",
  "locale": "zh_CN",
  "items": {
    "3153": {
      "id": 3153,
      "name": "破败王者之刃",
      "description": "...",
      "plaintext": "...",
      "icon": "items/3153.png"
    }
  },
  "perks": {},
  "augments": {}
}
```

To hydrate item icons, item text, rune style icons, rune icons, and rune text without downloading a full archive:

```bash
node scripts/sync-game-assets.mjs --version 15.24.1 --locale zh_CN --all-items --all-perks --with-metadata
```

To also try CommunityDragon Arena augment data:

```bash
node scripts/sync-game-assets.mjs --version 15.24.1 --locale zh_CN --all-items --all-perks --all-augments --with-metadata
```

Augment data comes from CommunityDragon `cherry-augments.json` by default. If that source changes or is unavailable, augment sync is skipped and item/perk sync remains usable.

To hydrate only the small match objective icons used by the inline match detail header:

```bash
node scripts/sync-game-assets.mjs --version 15.24.1 --locale zh_CN --all-objectives
```

Objective icons are sourced from CommunityDragon `game/assets/ux/minimap/icons` and written to `objectives/`. Keep this set selective; it should include only the Tab/resource header icons currently referenced by `manifest.objectives`.
