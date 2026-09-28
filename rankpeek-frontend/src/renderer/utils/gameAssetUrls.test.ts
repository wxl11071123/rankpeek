import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import {
  getAssetFallbackClass,
  getAssetPlaceholderUrl,
  getAugmentIconUrl,
  getAugmentRarityClass,
  getAugmentAssetDetails,
  getAugmentTooltipDetails,
  getChampionIconUrl,
  getItemIconSlots,
  getItemIconUrl,
  getItemAssetDetails,
  getItemTooltipDetails,
  loadGameAssetMetadata,
  loadLcuGameAssetMetadataOverlay,
  getPerkIconUrl,
  getPerkAssetDetails,
  getPerkTooltipDetails,
  getProfileIconUrl,
  getObjectiveIconUrl,
  getSummonerSpellAssetDetails,
  getSummonerSpellIconUrl,
  getSummonerSpellTooltipDetails,
  recordAssetLoadFailure,
  resetGameAssetResolverForTest,
  setGameAssetMetadataForTest,
  setGameAssetManifestForTest
} from './gameAssetUrls.ts'

const RAW_TOOLTIP_PATTERN = /<[^>]+>|\{\{|\}\}|@[A-Za-z0-9_]+@|%i:/

test('game asset helpers prefer local manifest paths before remote fallbacks', () => {
  resetGameAssetResolverForTest()
  setGameAssetManifestForTest({
    version: 'test',
    locale: 'zh_CN',
    champions: { 103: 'champions/103.png' },
    items: { 1001: 'items/1001.png' },
    summonerSpells: { 4: 'summoner-spells/4.png' },
    perks: {
      8000: 'perks/8000.png',
      8005: 'perks/8005.png',
      8100: 'perks/8100.png',
      8135: 'perks/8135.png'
    },
    augments: { 12345: 'augments/12345.png' },
    profileIcons: { 29: 'profile-icons/29.png' }
  })

  assert.equal(getChampionIconUrl(103), './game-assets/champions/103.png')
  assert.equal(getItemIconUrl(1001), './game-assets/items/1001.png')
  assert.equal(getSummonerSpellIconUrl(4), './game-assets/summoner-spells/4.png')
  assert.equal(getPerkIconUrl(8000), './game-assets/perks/8000.png')
  assert.equal(getPerkIconUrl(8005), './game-assets/perks/8005.png')
  assert.equal(getPerkIconUrl(8100), './game-assets/perks/8100.png')
  assert.equal(getPerkIconUrl(8135), './game-assets/perks/8135.png')
  assert.equal(getAugmentIconUrl(12345), './game-assets/augments/12345.png')
  assert.equal(getProfileIconUrl(29), './game-assets/profile-icons/29.png')
})

test('objective icon helper prefers local manifest paths then verified CommunityDragon minimap objective icons', () => {
  resetGameAssetResolverForTest()
  setGameAssetManifestForTest({
    version: 'test',
    locale: 'zh_CN',
    objectives: {
      baron: 'objectives/baron.png',
      infernal: 'objectives/dragon_infernal.png',
      turret: 'objectives/tower.png'
    }
  })

  assert.equal(getObjectiveIconUrl('baron'), './game-assets/objectives/baron.png')
  assert.equal(getObjectiveIconUrl('infernal'), './game-assets/objectives/dragon_infernal.png')
  assert.equal(getObjectiveIconUrl('turret'), './game-assets/objectives/tower.png')

  resetGameAssetResolverForTest()
  assert.equal(getObjectiveIconUrl('baron'), 'https://raw.communitydragon.org/latest/game/assets/ux/minimap/icons/baron.png')
  assert.equal(getObjectiveIconUrl('dragon'), 'https://raw.communitydragon.org/latest/game/assets/ux/minimap/icons/dragon.png')
  assert.equal(getObjectiveIconUrl('infernal'), 'https://raw.communitydragon.org/latest/game/assets/ux/minimap/icons/dragon_infernal.png')
  assert.equal(getObjectiveIconUrl('mountain'), 'https://raw.communitydragon.org/latest/game/assets/ux/minimap/icons/dragon_mountain.png')
  assert.equal(getObjectiveIconUrl('ocean'), 'https://raw.communitydragon.org/latest/game/assets/ux/minimap/icons/dragon_ocean.png')
  assert.equal(getObjectiveIconUrl('cloud'), 'https://raw.communitydragon.org/latest/game/assets/ux/minimap/icons/dragon_cloud.png')
  assert.equal(getObjectiveIconUrl('elder'), 'https://raw.communitydragon.org/latest/game/assets/ux/minimap/icons/dragon_elder.png')
  assert.equal(getObjectiveIconUrl('unknownDragon'), 'https://raw.communitydragon.org/latest/game/assets/ux/minimap/icons/dragon.png')
  assert.equal(getObjectiveIconUrl('herald'), 'https://raw.communitydragon.org/latest/game/assets/ux/minimap/icons/riftherald.png')
  assert.equal(getObjectiveIconUrl('voidgrub'), 'https://raw.communitydragon.org/latest/game/assets/ux/minimap/icons/grub.png')
  assert.equal(getObjectiveIconUrl('hextech'), 'https://raw.communitydragon.org/latest/game/assets/ux/minimap/icons/dragon_hextech.png')
  assert.equal(getObjectiveIconUrl('chemtech'), 'https://raw.communitydragon.org/latest/game/assets/ux/minimap/icons/dragon_chemtech.png')
  assert.equal(getObjectiveIconUrl('turret'), 'https://raw.communitydragon.org/latest/game/assets/ux/minimap/icons/tower.png')
  assert.equal(getObjectiveIconUrl('turretPlate'), 'https://raw.communitydragon.org/latest/game/assets/ux/minimap/icons/turret_1plate.png')
  assert.equal(getObjectiveIconUrl('inhibitor'), 'https://raw.communitydragon.org/latest/game/assets/ux/minimap/icons/inhibitor.png')
  assert.equal(getObjectiveIconUrl('soul-infernal'), 'https://raw.communitydragon.org/latest/game/assets/ux/minimap/icons/dragon_infernal.png')
  assert.equal(getObjectiveIconUrl('soul-mountain'), 'https://raw.communitydragon.org/latest/game/assets/ux/minimap/icons/dragon_mountain.png')
  assert.equal(getObjectiveIconUrl('soul-ocean'), 'https://raw.communitydragon.org/latest/game/assets/ux/minimap/icons/dragon_ocean.png')
  assert.equal(getObjectiveIconUrl('soul-cloud'), 'https://raw.communitydragon.org/latest/game/assets/ux/minimap/icons/dragon_cloud.png')
  assert.equal(getObjectiveIconUrl('soul-hextech'), 'https://raw.communitydragon.org/latest/game/assets/ux/minimap/icons/dragon_hextech.png')
  assert.equal(getObjectiveIconUrl('soul-chemtech'), 'https://raw.communitydragon.org/latest/game/assets/ux/minimap/icons/dragon_chemtech.png')
  assert.notEqual(getObjectiveIconUrl('hextech'), getObjectiveIconUrl('dragon'))
  assert.notEqual(getObjectiveIconUrl('chemtech'), getObjectiveIconUrl('dragon'))
  assert.notEqual(getObjectiveIconUrl('voidgrub'), getObjectiveIconUrl('herald'))
  assert.notEqual(getObjectiveIconUrl('voidgrub'), getObjectiveIconUrl('baron'))
})

test('elemental dragon and structure objective icons use verified minimap resource logos', () => {
  resetGameAssetResolverForTest()

  const urls = {
    infernal: getObjectiveIconUrl('infernal'),
    mountain: getObjectiveIconUrl('mountain'),
    ocean: getObjectiveIconUrl('ocean'),
    cloud: getObjectiveIconUrl('cloud'),
    hextech: getObjectiveIconUrl('hextech'),
    chemtech: getObjectiveIconUrl('chemtech'),
    elder: getObjectiveIconUrl('elder'),
    baron: getObjectiveIconUrl('baron'),
    herald: getObjectiveIconUrl('herald'),
    voidgrub: getObjectiveIconUrl('voidgrub'),
    turret: getObjectiveIconUrl('turret'),
    turretPlate: getObjectiveIconUrl('turretPlate'),
    inhibitor: getObjectiveIconUrl('inhibitor')
  }

  for (const url of Object.values(urls)) {
    assert.ok(url)
    assert.match(url, /game\/assets\/ux\/minimap\/icons\//)
    assert.doesNotMatch(url, /plugins\/rcp-fe-lol-match-history\/global\/default/i)
    assert.doesNotMatch(url, /(?:fire|earth|water|air)-100\.png|dragon_square_(?:hextech|chemtech)|right_icons_grub/i)
  }

  assert.match(urls.infernal, /dragon_infernal\.png$/)
  assert.match(urls.mountain, /dragon_mountain\.png$/)
  assert.match(urls.ocean, /dragon_ocean\.png$/)
  assert.match(urls.cloud, /dragon_cloud\.png$/)
  assert.match(urls.hextech, /dragon_hextech\.png$/)
  assert.match(urls.chemtech, /dragon_chemtech\.png$/)
  assert.match(urls.voidgrub, /grub\.png$/)
  assert.match(urls.turret, /tower\.png$/)
  assert.match(urls.turretPlate, /turret_1plate\.png$/)
  assert.match(urls.inhibitor, /inhibitor\.png$/)
  assert.notEqual(urls.voidgrub, getObjectiveIconUrl('herald'))
  assert.notEqual(urls.voidgrub, getObjectiveIconUrl('baron'))
  assert.notEqual(urls.voidgrub, getObjectiveIconUrl('dragon'))
})

test('objective manifest entries keep priority over remote objective fallbacks', () => {
  resetGameAssetResolverForTest()
  setGameAssetManifestForTest({
    version: 'test',
    locale: 'zh_CN',
    objectives: {
      infernal: 'objectives/local-infernal.png',
      hextech: 'objectives/local-hextech.png',
      chemtech: 'objectives/local-chemtech.png',
      voidgrub: 'objectives/local-voidgrub.png',
      turret: 'objectives/local-turret.png',
      turretPlate: 'objectives/local-turret-plate.png',
      inhibitor: 'objectives/local-inhibitor.png',
      'soul-hextech': 'objectives/local-soul-hextech.png',
      'soul-chemtech': 'objectives/local-soul-chemtech.png'
    }
  })

  assert.equal(getObjectiveIconUrl('infernal'), './game-assets/objectives/local-infernal.png')
  assert.equal(getObjectiveIconUrl('hextech'), './game-assets/objectives/local-hextech.png')
  assert.equal(getObjectiveIconUrl('chemtech'), './game-assets/objectives/local-chemtech.png')
  assert.equal(getObjectiveIconUrl('voidgrub'), './game-assets/objectives/local-voidgrub.png')
  assert.equal(getObjectiveIconUrl('turret'), './game-assets/objectives/local-turret.png')
  assert.equal(getObjectiveIconUrl('turretPlate'), './game-assets/objectives/local-turret-plate.png')
  assert.equal(getObjectiveIconUrl('inhibitor'), './game-assets/objectives/local-inhibitor.png')
  assert.equal(getObjectiveIconUrl('soul-hextech'), './game-assets/objectives/local-soul-hextech.png')
  assert.equal(getObjectiveIconUrl('soul-chemtech'), './game-assets/objectives/local-soul-chemtech.png')
})

test('game asset helpers fall back through local backend before remote URLs', () => {
  resetGameAssetResolverForTest()

  assert.equal(getChampionIconUrl(103), 'http://127.0.0.1:8080/api/v1/asset/champion/103')
  assert.equal(getItemIconUrl(1001), 'http://127.0.0.1:8080/api/v1/asset/item/1001')
  assert.equal(getSummonerSpellIconUrl(4), 'http://127.0.0.1:8080/api/v1/asset/spell/4')
  assert.equal(getProfileIconUrl(29), 'http://127.0.0.1:8080/api/v1/asset/profile/29')
  assert.equal(getAugmentIconUrl(12345), 'http://127.0.0.1:8080/api/v1/asset/augment/12345')
  assert.equal(getPerkIconUrl(8005), 'http://127.0.0.1:8080/api/v1/asset/perk/8005')
  assert.doesNotMatch(getPerkIconUrl(8005), /raw\.communitydragon\.org\/latest\/plugins\/rcp-be-lol-game-data\/global\/default\/v1\/perks\/8005\.png/)
})

test('perk icon helper keeps metadata as text only when manifest is missing', () => {
  resetGameAssetResolverForTest()
  setGameAssetMetadataForTest({
    version: 'test',
    locale: 'zh_CN',
    perks: {
      8135: {
        id: 8135,
        name: 'Treasure Hunter',
        description: 'Earn extra gold.',
        icon: 'perks/8135.png'
      }
    }
  })

  assert.equal(getPerkIconUrl(8135), 'http://127.0.0.1:8080/api/v1/asset/perk/8135')
  assert.equal(getPerkAssetDetails(8135)?.name, 'Treasure Hunter')
  assert.doesNotMatch(getPerkIconUrl(8135), /game-assets\/perks\/8135\.png/)
})

test('perk icon helper uses backend proxy for LCU metadata icon paths when manifest is missing', () => {
  resetGameAssetResolverForTest()
  setGameAssetMetadataForTest({
    version: 'lcu',
    locale: 'zh_CN',
    perks: {
      8992: {
        id: 8992,
        name: 'Deathfire Touch',
        shortDesc: 'Damaging a champion with an ability burns them.',
        longDesc: 'Damaging a champion with an ability burns them for adaptive damage.',
        icon: '/lol-game-data/assets/v1/perk-images/Styles/Sorcery/DFT.jpg'
      }
    }
  })

  const iconUrl = getPerkIconUrl(8992)
  const tooltip = getPerkTooltipDetails(8992)

  assert.equal(iconUrl, 'http://127.0.0.1:8080/api/v1/asset/perk/8992')
  assert.notEqual(iconUrl, getAssetPlaceholderUrl())
  assert.equal(tooltip?.name, 'Deathfire Touch')
  assert.match(tooltip?.description || '', /burns them/i)
  assert.notEqual(tooltip?.description, '暂无详细说明')
  assert.equal(tooltip?.iconUrl, 'http://127.0.0.1:8080/api/v1/asset/perk/8992')
})

test('LCU metadata overlay supports future perks that are absent from static assets', async () => {
  resetGameAssetResolverForTest()
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (url: string) => ({
    ok: true,
    json: async () => url.includes('local')
      ? {
          version: 'static',
          locale: 'zh_CN',
          perks: {}
        }
      : {
          version: 'lcu',
          locale: 'zh_CN',
          perks: {
            999991: {
              id: 999991,
              name: 'Future LCU Perk',
              tooltip: '<mainText>Future tooltip from LCU.</mainText>',
              longDesc: '<mainText>Future <font color="#fff">long</font><br>description from LCU.</mainText>',
              icon: '/lol-game-data/assets/v1/perk-images/Styles/Sorcery/Fake.jpg'
            }
          }
        }
  })) as unknown as typeof fetch

  try {
    await loadGameAssetMetadata('http://asset.test/local-metadata.json')
    assert.equal(getPerkAssetDetails(999991), null)

    await loadLcuGameAssetMetadataOverlay('http://asset.test/lcu-metadata')

    const iconUrl = getPerkIconUrl(999991)
    const tooltip = getPerkTooltipDetails(999991)
    assert.equal(iconUrl, 'http://127.0.0.1:8080/api/v1/asset/perk/999991')
    assert.doesNotMatch(iconUrl, /game-assets\/lol-game-data\/assets/i)
    assert.equal(tooltip?.name, 'Future LCU Perk')
    assert.match(tooltip?.description || '', /Future.*description from LCU/s)
    assert.doesNotMatch(tooltip?.description || '', /<br|<font|<mainText/i)
    assert.equal(tooltip?.iconUrl, 'http://127.0.0.1:8080/api/v1/asset/perk/999991')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('backend metadata overlay can carry GTIMG Kiwi augment fallback text', async () => {
  resetGameAssetResolverForTest()
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({
      version: 'lcu',
      locale: 'zh_CN',
      augments: {
        2016: {
          id: 2016,
          name: '注魔',
          description: '攻击特效消耗法力值以造成魔法伤害，这个伤害可以暴击。',
          tooltip: '攻击特效消耗法力值以造成魔法伤害，这个伤害可以暴击。',
          desc: '攻击特效消耗法力值。',
          rarity: 'kSilver'
        }
      }
    })
  })) as unknown as typeof fetch

  try {
    await loadLcuGameAssetMetadataOverlay('http://asset.test/lcu-metadata')

    const augment = getAugmentTooltipDetails(2016)
    assert.equal(augment?.name, '注魔')
    assert.equal(augment?.description, '攻击特效消耗法力值以造成魔法伤害，这个伤害可以暴击。')
    assert.equal(augment?.rarityLabel, '银色')
    assert.equal(augment?.rarityTone, 'silver')
    assert.notEqual(augment?.description, '鏆傛棤璇︾粏璇存槑')
    assert.doesNotMatch(augment?.description || '', RAW_TOOLTIP_PATTERN)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('invalid asset ids do not create broken image URLs', () => {
  resetGameAssetResolverForTest()
  assert.equal(getChampionIconUrl(0), '')
  assert.equal(getItemIconUrl(0), '')
  assert.equal(getItemIconUrl(undefined), '')
  assert.equal(getSummonerSpellIconUrl(null), '')
  assert.equal(getPerkIconUrl(Number.NaN), '')
  assert.equal(getAugmentIconUrl(-1), '')
})

test('item slots preserve seven equipment positions with empty placeholders', () => {
  resetGameAssetResolverForTest()
  const slots = getItemIconSlots({
    item0: 1055,
    item1: 0,
    item2: undefined,
    item3: 3031,
    item4: null,
    item5: 3006,
    item6: 3340
  })

  assert.equal(slots.length, 7)
  assert.deepEqual(slots.map(slot => slot.itemId), [1055, null, null, 3031, null, 3006, 3340])
  assert.equal(slots[0].url, 'http://127.0.0.1:8080/api/v1/asset/item/1055')
  assert.equal(slots[1].url, '')
  assert.equal(slots[1].empty, true)
  assert.equal(slots[6].url, 'http://127.0.0.1:8080/api/v1/asset/item/3340')
})

test('failed DDragon URLs are remembered and not returned again in the same session', () => {
  resetGameAssetResolverForTest()
  setGameAssetManifestForTest({
    version: '16.1.1',
    locale: 'zh_CN'
  })

  const localProxyUrl = getItemIconUrl(1001)
  recordAssetLoadFailure(localProxyUrl)
  const ddragonUrl = getItemIconUrl(1001)
  assert.equal(ddragonUrl, 'https://ddragon.leagueoflegends.com/cdn/16.1.1/img/item/1001.png')

  recordAssetLoadFailure(ddragonUrl)
  assert.equal(getItemIconUrl(1001), getAssetPlaceholderUrl())
})

test('augment icons degrade to placeholder after incomplete sources fail', () => {
  resetGameAssetResolverForTest()

  const localProxyUrl = getAugmentIconUrl(555001)
  assert.equal(localProxyUrl, 'http://127.0.0.1:8080/api/v1/asset/augment/555001')
  recordAssetLoadFailure(localProxyUrl)

  assert.equal(getAugmentIconUrl(555001), getAssetPlaceholderUrl())
})

test('fallback classes distinguish empty and failed asset states', () => {
  assert.equal(getAssetFallbackClass('item', 'empty'), 'asset-slot asset-slot-item asset-slot-empty')
  assert.equal(getAssetFallbackClass('champion', 'failed'), 'asset-slot asset-slot-champion asset-slot-failed')
  assert.equal(getAssetFallbackClass('augment', 'failed'), 'asset-slot asset-slot-augment asset-slot-failed')
})

test('augment rarity class helper maps Riot rarity keys to stable icon classes', () => {
  assert.equal(getAugmentRarityClass('kSilver'), 'augment-rarity-silver')
  assert.equal(getAugmentRarityClass('kGold'), 'augment-rarity-gold')
  assert.equal(getAugmentRarityClass('golden'), 'augment-rarity-gold')
  assert.equal(getAugmentRarityClass('kPrismatic'), 'augment-rarity-prismatic')
  assert.equal(getAugmentRarityClass('kBronze'), 'augment-rarity-bronze')
  assert.equal(getAugmentRarityClass('unknown'), 'augment-rarity-default')
  assert.equal(getAugmentRarityClass(undefined), 'augment-rarity-default')
})

test('augment rarity frame styles provide border and background variables', () => {
  const source = readFileSync(new URL('../assets/styles/main.css', import.meta.url), 'utf8')

  for (const rarity of ['silver', 'gold', 'prismatic', 'bronze']) {
    const block = source.match(new RegExp(`\\.augment-rarity-${rarity} \\{[\\s\\S]*?\\n\\}`))?.[0] || ''
    assert.match(block, /--augment-rarity-border:/)
    assert.match(block, /--augment-rarity-bg:/)
  }
})

test('asset-consuming Vue components do not hardcode backend or remote asset URLs', () => {
  const files = [
    '../components/match-history/MatchHistoryCard.vue',
    '../components/summoner/MatchRosterCompact.vue',
    '../components/summoner/MatchDetailModal.vue',
    '../components/summoner/SummonerOverviewPanel.vue',
    '../components/gaming/PlayerCard.vue',
    '../components/HomeChart.vue',
    '../views/HomeView.vue'
  ]

  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /http:\/\/127\.0\.0\.1:8080\/api\/v1\/asset/)
    assert.doesNotMatch(source, /\/api\/v1\/asset\/(?:champion|item|spell|perk|profile)/)
    assert.doesNotMatch(source, /ddragon\.leagueoflegends\.com|raw\.communitydragon\.org|communitydragon/i)
  }
})

test('backend asset details do not advertise DDragon as the primary icon URL', () => {
  const source = readFileSync(
    new URL('../../../../rankpeek-backend/src/main/java/io/rankpeek/controller/AssetController.java', import.meta.url),
    'utf8'
  )

  assert.doesNotMatch(source, /ddragon\.leagueoflegends\.com\/cdn/)
  assert.match(source, /\/api\/v1\/asset\/item/)
})

test('renderer startup mounts without bundled game assets and refreshes backend metadata after mount', () => {
  const mainSource = readFileSync(new URL('../main.ts', import.meta.url), 'utf8')

  assert.match(mainSource, /loadLcuGameAssetMetadataOverlay/)
  assert.match(mainSource, /app\.mount\('#app'\)[\s\S]*void loadLcuGameAssetMetadataOverlay\(\)/)
  assert.doesNotMatch(mainSource, /loadGameAssetManifest\(\)|loadGameAssetMetadata\(\)/)
  assert.doesNotMatch(mainSource, /Promise\.all\(\[loadGameAssetManifest|manifestStartupDeadline|setTimeout\(resolve,\s*500\)/)
})

test('electron packaging excludes generated game assets from the installer bundle', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'))
  const viteConfig = readFileSync(new URL('../../../vite.config.mts', import.meta.url), 'utf8')
  const extraResources = JSON.stringify(packageJson.build?.extraResources ?? [])

  assert.match(extraResources, /!game-assets\/\*\*/)
  assert.match(viteConfig, /exclude-game-assets-from-renderer-bundle/)
  assert.match(viteConfig, /rmSync\([\s\S]*game-assets/)
})

test('local game asset manifest contains selective objective icons for normal rendering', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../../public/game-assets/manifest.json', import.meta.url), 'utf8'))
  const objectiveKeys = [
    'turret',
    'turretPlate',
    'inhibitor',
    'baron',
    'dragon',
    'infernal',
    'mountain',
    'ocean',
    'cloud',
    'hextech',
    'chemtech',
    'elder',
    'herald',
    'voidgrub',
    'unknownDragon',
    'soul-infernal',
    'soul-mountain',
    'soul-ocean',
    'soul-cloud',
    'soul-hextech',
    'soul-chemtech'
  ]

  assert.equal(typeof manifest.objectives, 'object')
  resetGameAssetResolverForTest()
  setGameAssetManifestForTest(manifest)

  for (const key of objectiveKeys) {
    assert.equal(typeof manifest.objectives[key], 'string', `missing objective manifest key ${key}`)
    assert.match(manifest.objectives[key], /^objectives\/.+\.png$/, `objective ${key} must be a local small icon`)
    assert.match(getObjectiveIconUrl(key), /^\.\/game-assets\/objectives\/.+\.png$/)
  }

  for (const key of ['infernal', 'mountain', 'ocean', 'cloud']) {
    assert.doesNotMatch(manifest.objectives[key], /(?:fire|earth|water|air)-100\.png$/)
  }
})

test('game asset metadata helpers expose item, perk, augment, and summoner spell text without changing existing icon lookup', () => {
  resetGameAssetResolverForTest()
  setGameAssetMetadataForTest({
    version: 'test',
    locale: 'zh_CN',
    items: {
      3153: {
        id: 3153,
        name: 'Blade of the Ruined King',
        description: 'Deals damage.',
        plaintext: 'On-hit damage.',
        icon: 'items/3153.png'
      }
    },
    perks: {
      8000: {
        id: 8000,
        name: 'Precision',
        description: 'Improved attacks.',
        icon: 'perks/8000.png'
      },
      8005: {
        id: 8005,
        name: 'Press the Attack',
        shortDesc: 'Hit three times.',
        longDesc: 'Amplifies damage.',
        endOfGameStatDescs: ['Damage dealt: @eogvar1@'],
        endOfGameStatDesc: 'Bonus damage: @eogvar2@',
        icon: 'perks/8005.png'
      }
    },
    augments: {
      1205: {
        id: 1205,
        name: 'ADAPt',
        description: 'Adaptive force.',
        icon: 'augments/1205.png'
      }
    },
    summonerSpells: {
      4: {
        id: 4,
        name: 'Flash',
        description: 'Teleport a short distance.',
        tooltip: 'Blinks toward target location.',
        plaintext: 'Short blink.',
        icon: 'summoner-spells/4.png'
      }
    }
  })

  assert.equal(getItemAssetDetails(3153)?.name, 'Blade of the Ruined King')
  assert.equal(getPerkIconUrl(8000), 'http://127.0.0.1:8080/api/v1/asset/perk/8000')
  assert.equal(getPerkAssetDetails(8000)?.icon, 'perks/8000.png')
  assert.equal(getPerkIconUrl(8005), 'http://127.0.0.1:8080/api/v1/asset/perk/8005')
  assert.equal(getPerkAssetDetails(8005)?.shortDesc, 'Hit three times.')
  assert.deepEqual(getPerkAssetDetails(8005)?.endOfGameStatDescs, ['Damage dealt: @eogvar1@'])
  assert.equal(getPerkAssetDetails(8005)?.endOfGameStatDesc, 'Bonus damage: @eogvar2@')
  assert.equal(getAugmentAssetDetails(1205)?.description, 'Adaptive force.')
  assert.equal(getSummonerSpellAssetDetails(4)?.name, 'Flash')
  assert.equal(getSummonerSpellAssetDetails(4)?.icon, 'summoner-spells/4.png')
  assert.equal(getPerkAssetDetails(999999), null)
})

test('tooltip details use metadata names, sanitized structured item details, and icon helpers', () => {
  resetGameAssetResolverForTest()
  setGameAssetManifestForTest({
    version: 'test',
    locale: 'zh_CN',
    items: {
      1038: 'items/1038.png'
    },
    perks: {
      8005: 'perks/8005.png'
    }
  })
  setGameAssetMetadataForTest({
    version: 'test',
    locale: 'zh_CN',
    items: {
      3031: {
        id: 3031,
        name: 'Infinity Edge',
        description: '<mainText><stats>70 Attack Damage</stats><br><br><passive>Impermanence:</passive><br>Critical strikes deal &amp; scale bonus.</mainText>',
        plaintext: 'Critical item.',
        from: [1038],
        stats: {
          FlatPhysicalDamageMod: 70
        },
        gold: {
          total: 3600,
          base: 625,
          sell: 2520
        }
      }
    },
    perks: {
      8005: {
        id: 8005,
        name: 'Press the Attack',
        shortDesc: 'Hit <b>three</b> times &amp; expose.',
        longDesc: 'This should not win over shortDesc.',
        icon: 'perks/8005.png'
      }
    },
    augments: {
      1205: {
        id: 1205,
        name: 'ADAPt',
        description: 'Gain <font color="#48C4B7">adaptive force</font>.'
      }
    },
    summonerSpells: {
      4: {
        id: 4,
        name: 'Flash',
        description: '<mainText>Teleports your champion <br> a short distance &amp; resets.</mainText>',
        tooltip: 'This should lose to description.',
        plaintext: 'Blink.',
        icon: 'summoner-spells/4.png'
      }
    }
  })

  const item = getItemTooltipDetails(3031)
  const perk = getPerkTooltipDetails(8005)
  const augment = getAugmentTooltipDetails(1205)
  const spell = getSummonerSpellTooltipDetails(4)

  assert.equal(item?.kind, 'item')
  assert.equal(item?.id, 3031)
  assert.equal(item?.name, 'Infinity Edge')
  assert.equal(item?.subtitle, '')
  assert.equal(item?.priceText, '3600 G (合成 625 G)')
  assert.deepEqual(item?.recipeIconUrls, ['./game-assets/items/1038.png'])
  assert.deepEqual(item?.statLines, ['70 攻击力'])
  assert.equal(item?.sections?.[0]?.label, 'Impermanence:')
  assert.equal(item?.sections?.[0]?.tone, 'passive')
  assert.equal(item?.sections?.[0]?.text, 'Critical strikes deal & scale bonus.')
  assert.equal(item?.description, '70 Attack Damage\nImpermanence:\nCritical strikes deal & scale bonus.')
  assert.equal(item?.iconUrl, 'http://127.0.0.1:8080/api/v1/asset/item/3031')
  assert.equal(perk?.kind, 'perk')
  assert.equal(perk?.subtitle, '')
  assert.equal(perk?.description, 'Hit three times & expose.')
  assert.equal(perk?.iconUrl, './game-assets/perks/8005.png')
  assert.equal(augment?.kind, 'augment')
  assert.equal(augment?.subtitle, '')
  assert.equal(augment?.description, 'Gain adaptive force.')
  assert.equal(augment?.iconUrl, 'http://127.0.0.1:8080/api/v1/asset/augment/1205')
  assert.equal(spell?.kind, 'spell')
  assert.equal(spell?.id, 4)
  assert.equal(spell?.name, 'Flash')
  assert.equal(spell?.subtitle, '')
  assert.equal(spell?.description, 'Teleports your champion\na short distance & resets.')
  assert.equal(spell?.iconUrl, 'http://127.0.0.1:8080/api/v1/asset/spell/4')
  assert.doesNotMatch(item?.description || '', RAW_TOOLTIP_PATTERN)
  assert.doesNotMatch(item?.sections?.map(section => `${section.label || ''} ${section.text}`).join('\n') || '', RAW_TOOLTIP_PATTERN)
  assert.doesNotMatch(perk?.description || '', RAW_TOOLTIP_PATTERN)
  assert.doesNotMatch(augment?.description || '', RAW_TOOLTIP_PATTERN)
  assert.doesNotMatch(spell?.description || '', RAW_TOOLTIP_PATTERN)
})

test('tooltip details fall back to readable names and no-detail copy when metadata is missing', () => {
  resetGameAssetResolverForTest()

  assert.deepEqual(getItemTooltipDetails(3031), {
    kind: 'item',
    id: 3031,
    name: '装备 3031',
    subtitle: '',
    description: '暂无详细说明',
    iconUrl: 'http://127.0.0.1:8080/api/v1/asset/item/3031'
  })
  assert.deepEqual(getPerkTooltipDetails(8005), {
    kind: 'perk',
    id: 8005,
    name: '符文 8005',
    subtitle: '',
    description: '暂无详细说明',
    iconUrl: 'http://127.0.0.1:8080/api/v1/asset/perk/8005'
  })
  assert.deepEqual(getSummonerSpellTooltipDetails(4), {
    kind: 'spell',
    id: 4,
    name: '召唤师技能 4',
    subtitle: '召唤师技能 4',
    description: '暂无详细说明',
    iconUrl: 'http://127.0.0.1:8080/api/v1/asset/spell/4'
  })
  assert.equal(getAugmentTooltipDetails(0), null)
})

test('local game asset metadata contains tooltip text for common items, perks, augments, and summoner spells', () => {
  const metadata = JSON.parse(readFileSync(new URL('../../../public/game-assets/metadata.json', import.meta.url), 'utf8'))

  assert.equal(typeof metadata.items['3031']?.name, 'string')
  assert.equal(typeof metadata.items['3031']?.description, 'string')
  assert.equal(typeof metadata.items['3153']?.name, 'string')
  assert.equal(typeof metadata.items['3006']?.name, 'string')
  assert.equal(typeof metadata.perks['8005']?.name, 'string')
  assert.equal(typeof metadata.perks['8100']?.name, 'string')
  assert.equal(typeof metadata.perks['8135']?.name, 'string')
  assert.equal(typeof metadata.perks['8992']?.name, 'string')
  assert.ok([
    metadata.perks['8992']?.description,
    metadata.perks['8992']?.shortDesc,
    metadata.perks['8992']?.longDesc,
    metadata.perks['8992']?.tooltip
  ].some(value => typeof value === 'string' && value.trim()))
  assert.equal(typeof metadata.summonerSpells?.['4']?.name, 'string')
  assert.equal(typeof metadata.summonerSpells?.['4']?.description, 'string')
  assert.equal(typeof metadata.summonerSpells?.['4']?.icon, 'string')
  assert.ok(Object.keys(metadata.augments || {}).length > 0)
  assert.ok(Object.values(metadata.augments || {}).some(entry =>
    typeof entry.description === 'string' && entry.description.length > 0
  ))
})

test('local game asset metadata resolves screenshot item, augment, and perk tooltip details', () => {
  const metadata = JSON.parse(readFileSync(new URL('../../../public/game-assets/metadata.json', import.meta.url), 'utf8'))

  resetGameAssetResolverForTest()
  const itemFallback = getItemTooltipDetails(6610)
  const augmentFallback = getAugmentTooltipDetails(2005)
  const perkFallback = getPerkTooltipDetails(8005)

  setGameAssetMetadataForTest(metadata)

  const item = getItemTooltipDetails(6610)
  const augment = getAugmentTooltipDetails(2005)
  const perk = getPerkTooltipDetails(8005)

  assert.equal(typeof metadata.items['6610']?.name, 'string')
  assert.equal(typeof metadata.items['6610']?.description, 'string')
  assert.equal(typeof metadata.items['6610']?.gold?.total, 'number')
  assert.ok(metadata.items['6610'].description.trim())
  assert.equal(item?.name, metadata.items['6610'].name)
  assert.match(item?.priceText || '', /^\d+\s+G/)
  assert.doesNotMatch(item?.priceText || '', /装备 6610/)
  assert.notEqual(item?.name, itemFallback?.name)
  assert.notEqual(item?.description, itemFallback?.description)
  assert.ok(item?.description.trim())
  assert.notEqual(item?.description, '暂无详细说明')
  assert.doesNotMatch(item?.description || '', RAW_TOOLTIP_PATTERN)

  assert.equal(typeof metadata.augments['2005']?.name, 'string')
  assert.equal(typeof metadata.augments['2005']?.description, 'string')
  assert.ok(metadata.augments['2005'].description.trim())
  assert.equal(augment?.name, metadata.augments['2005'].name)
  assert.notEqual(augment?.rarityLabel || augment?.subtitle, '海克斯强化 2005')
  assert.notEqual(augment?.name, augmentFallback?.name)
  assert.notEqual(augment?.description, augmentFallback?.description)
  assert.ok(augment?.description.trim())
  assert.notEqual(augment?.description, '暂无详细说明')
  assert.doesNotMatch(augment?.description || '', RAW_TOOLTIP_PATTERN)

  assert.equal(typeof metadata.perks['8005']?.name, 'string')
  assert.equal(perk?.name, metadata.perks['8005'].name)
  assert.notEqual(perk?.description, perkFallback?.description)
  assert.ok(perk?.description.trim())
  assert.doesNotMatch(perk?.description || '', RAW_TOOLTIP_PATTERN)
  assert.equal(getPerkIconUrl(8005), 'http://127.0.0.1:8080/api/v1/asset/perk/8005')
})

test('local game asset metadata resolves screenshot augment with full clean description', () => {
  const metadata = JSON.parse(readFileSync(new URL('../../../public/game-assets/metadata.json', import.meta.url), 'utf8'))

  resetGameAssetResolverForTest()
  setGameAssetMetadataForTest(metadata)

  const augment = getAugmentTooltipDetails(1346)

  assert.equal(augment?.name, '吸血习性')
  assert.equal(augment?.subtitle, '')
  assert.equal(augment?.rarityLabel, '黄金阶')
  assert.equal(augment?.rarityTone, 'gold')
  assert.match(augment?.description || '', /全能吸血/)
  assert.notEqual(augment?.description, '暂无详细说明')
  assert.doesNotMatch(augment?.description || '', RAW_TOOLTIP_PATTERN)
})

test('tooltip text cleanup keeps useful item and augment text after game HTML tags are removed', () => {
  resetGameAssetResolverForTest()
  setGameAssetMetadataForTest({
    version: 'test',
    locale: 'zh_CN',
    items: {
      6610: {
        id: 6610,
        name: 'Sundered Sky',
        description: '<mainText><stats><attention>40</attention> Attack Damage</stats><br><passive>Passive</passive> keep text<br><active>Active</active> use text<br><rules>Rule text</rules></mainText>'
      }
    },
    augments: {
      2005: {
        id: 2005,
        name: 'Triggered Inferno',
        description: '<mainText><attention>Inferno</attention><br><rules>Useful rule text</rules></mainText>'
      }
    }
  })

  const item = getItemTooltipDetails(6610)
  const augment = getAugmentTooltipDetails(2005)

  assert.equal(item?.description, '40 Attack Damage\nPassive keep text\nActive use text\nRule text')
  assert.deepEqual(item?.statLines, ['40 Attack Damage'])
  assert.equal(item?.sections?.[0]?.label, 'Passive')
  assert.equal(item?.sections?.[0]?.tone, 'passive')
  assert.equal(item?.sections?.[0]?.text, 'keep text')
  assert.equal(item?.sections?.[1]?.label, 'Active')
  assert.equal(item?.sections?.[1]?.tone, 'active')
  assert.equal(item?.sections?.[1]?.text, 'use text')
  assert.equal(augment?.description, 'Inferno\nUseful rule text')
  assert.ok(item?.description.trim())
  assert.ok(augment?.description.trim())
  assert.doesNotMatch(item?.description || '', RAW_TOOLTIP_PATTERN)
  assert.doesNotMatch(augment?.description || '', RAW_TOOLTIP_PATTERN)
})

test('tooltip text cleanup preserves client-style line breaks from Riot markup', () => {
  resetGameAssetResolverForTest()
  setGameAssetMetadataForTest({
    version: 'test',
    locale: 'zh_CN',
    items: {
      6610: {
        id: 6610,
        name: '焚天',
        description: '<mainText><stats><attention>40</attention>攻击力<br><attention>400</attention>生命值<br><attention>10</attention>技能急速</stats><br><br><passive>光盾打击</passive><br>你对一个英雄打出的第一次攻击会<attention>暴击</attention>并<healing>回复生命值</healing>。</mainText>',
        gold: { total: 3100 }
      }
    }
  })

  const item = getItemTooltipDetails(6610)

  assert.equal(
    item?.description,
    '40攻击力\n400生命值\n10技能急速\n光盾打击\n你对一个英雄打出的第一次攻击会暴击并回复生命值。'
  )
  assert.equal(item?.priceText, '3100 G')
  assert.deepEqual(item?.statLines, ['40攻击力', '400生命值', '10技能急速'])
  assert.equal(item?.sections?.[0]?.label, '光盾打击')
  assert.equal(item?.sections?.[0]?.text, '你对一个英雄打出的第一次攻击会暴击并回复生命值。')
  assert.equal((item?.description.match(/\n/g) || []).length, 4)
})

test('item tooltip details build client-style price, recipe, stats, passive, and active sections', () => {
  resetGameAssetResolverForTest()
  setGameAssetManifestForTest({
    version: 'test',
    locale: 'zh_CN',
    items: {
      1028: 'items/1028.png',
      1031: 'items/1031.png'
    }
  })
  setGameAssetMetadataForTest({
    version: 'test',
    locale: 'zh_CN',
    items: {
      3143: {
        id: 3143,
        name: '兰顿之兆',
        description: '<mainText><stats><attention>350</attention>生命值<br><attention>75</attention>护甲</stats><br><br><active>主动 - 谦卑：</active><br>使附近敌人<status>减速</status>。<br><br><passive>坚如磐石：</passive><br>减少来自暴击的伤害。{{ should_not_leak }} @TotalArmor@ %i:scaleArmor%</mainText>',
        plaintext: 'Old short text should not win.',
        gold: { total: 2700, base: 800 },
        from: [1028, 1031],
        stats: {
          FlatHPPoolMod: 350,
          FlatArmorMod: 75
        }
      }
    }
  })

  const item = getItemTooltipDetails(3143)

  assert.equal(item?.name, '兰顿之兆')
  assert.equal(item?.priceText, '2700 G (合成 800 G)')
  assert.deepEqual(item?.recipeIconUrls, ['./game-assets/items/1028.png', './game-assets/items/1031.png'])
  assert.deepEqual(item?.statLines, ['350 生命值', '75 护甲'])
  assert.equal(item?.sections?.[0]?.tone, 'active')
  assert.equal(item?.sections?.[0]?.label, '主动 - 谦卑：')
  assert.equal(item?.sections?.[0]?.text, '使附近敌人减速。')
  assert.equal(item?.sections?.[1]?.tone, 'passive')
  assert.equal(item?.sections?.[1]?.label, '坚如磐石：')
  assert.equal(item?.sections?.[1]?.text, '减少来自暴击的伤害。')
  assert.doesNotMatch(item?.description || '', RAW_TOOLTIP_PATTERN)
  assert.doesNotMatch(item?.sections?.map(section => `${section.label || ''}\n${section.text}`).join('\n') || '', RAW_TOOLTIP_PATTERN)
})

test('augment tooltip chooses complete clean text over short descriptions and localizes rarity', () => {
  resetGameAssetResolverForTest()
  setGameAssetMetadataForTest({
    version: 'test',
    locale: 'zh_CN',
    augments: {
      2005: {
        id: 2005,
        name: '扳机炼狱',
        description: '短句。',
        tooltip: '<mainText><attention>每回合</attention>，你要么变大，要么获得额外属性。<br><rules>这个效果会持续到战斗结束。</rules></mainText>',
        shortDesc: '更短。',
        rarity: 'kGold'
      }
    }
  })

  const augment = getAugmentTooltipDetails(2005)

  assert.equal(augment?.name, '扳机炼狱')
  assert.equal(augment?.subtitle, '')
  assert.equal(augment?.rarityLabel, '黄金阶')
  assert.equal(augment?.rarityTone, 'gold')
  assert.equal(augment?.description, '每回合，你要么变大，要么获得额外属性。\n这个效果会持续到战斗结束。')
  assert.notEqual(augment?.description, '短句。')
  assert.doesNotMatch(augment?.description || '', RAW_TOOLTIP_PATTERN)
})

test('augment tooltip chooses complete desc or tooltip text and never duplicates rarity in subtitle', () => {
  resetGameAssetResolverForTest()
  setGameAssetMetadataForTest({
    version: 'test',
    locale: 'zh_CN',
    augments: {
      1346: {
        id: 1346,
        name: '吸血习性',
        description: '短句。',
        desc: '',
        tooltipTra: '<mainText>获得<lifeSteal>15%全能吸血</lifeSteal>。<br><rules>参与击败会使这个效果提升，持续到战斗结束。</rules>{{ raw }} @Value@ %i:bad%</mainText>',
        rarity: 'kGold'
      }
    }
  })

  const augment = getAugmentTooltipDetails(1346)

  assert.equal(augment?.name, '吸血习性')
  assert.equal(augment?.subtitle, '')
  assert.equal(augment?.rarityLabel, '黄金阶')
  assert.equal(augment?.rarityTone, 'gold')
  assert.equal(augment?.description, '获得15%全能吸血。\n参与击败会使这个效果提升，持续到战斗结束。')
  assert.notEqual(augment?.description, '短句。')
  assert.doesNotMatch(augment?.description || '', RAW_TOOLTIP_PATTERN)
})

test('augment tooltip prefers clean GTIMG tooltip over raw template-heavy desc', () => {
  resetGameAssetResolverForTest()
  setGameAssetMetadataForTest({
    version: 'test',
    locale: 'zh_CN',
    augments: {
      2016: {
        id: 2016,
        name: '注魔',
        description: '',
        tooltip: '攻击特效消耗法力值以造成魔法伤害，这个伤害可以暴击。',
        desc: '<OnHit>%i:OnHit%攻击特效</OnHit>消耗<scaleMana>@Calc_Mana_Cost@法力值</scaleMana>以造成<magicDamage>@Calc_Damage@魔法伤害</magicDamage>，这个伤害可以暴击。',
        rarity: 'kSilver'
      }
    }
  })

  const augment = getAugmentTooltipDetails(2016)

  assert.equal(augment?.description, '攻击特效消耗法力值以造成魔法伤害，这个伤害可以暴击。')
  assert.equal(augment?.rarityLabel, '银色')
  assert.equal(augment?.rarityTone, 'silver')
  assert.notEqual(augment?.description, '暂无详细说明')
  assert.doesNotMatch(augment?.description || '', RAW_TOOLTIP_PATTERN)
  assert.doesNotMatch(augment?.description || '', /@Calc_|%i:|\{\{|\}\}/)
})

test('item tooltip title omits metadata id suffix when item name is known', () => {
  resetGameAssetResolverForTest()
  setGameAssetMetadataForTest({
    version: 'test',
    locale: 'zh_CN',
    items: {
      6333: {
        id: 6333,
        name: '死亡之舞',
        description: '<mainText><stats><attention>60</attention>攻击力</stats></mainText>'
      }
    }
  })

  const item = getItemTooltipDetails(6333)

  assert.equal(item?.name, '死亡之舞')
  assert.doesNotMatch(item?.name || '', /\(6333\)/)
})

test('item tooltip sections only split on structural passive markers', () => {
  resetGameAssetResolverForTest()
  setGameAssetMetadataForTest({
    version: 'test',
    locale: 'zh_CN',
    items: {
      6333: {
        id: 6333,
        name: '死亡之舞',
        description: '<mainText><stats><attention>60</attention>攻击力<br><attention>50</attention>护甲</stats><br><br><passive>无视痛苦</passive><br>所受的一部分伤害会以流血形式在3秒里持续扣除。<br><br><passive>蔑视</passive><br>如果一名在过去3秒内曾被你造成过伤害的英雄阵亡，会净化<passive>无视痛苦</passive>的剩余伤害，并在2秒里持续为你回复<healing>生命值</healing>。</mainText>'
      }
    }
  })

  const item = getItemTooltipDetails(6333)

  assert.deepEqual(item?.statLines, ['60攻击力', '50护甲'])
  assert.equal(item?.sections?.length, 2)
  assert.equal(item?.sections?.[0]?.label, '无视痛苦')
  assert.equal(item?.sections?.[0]?.text, '所受的一部分伤害会以流血形式在3秒里持续扣除。')
  assert.equal(item?.sections?.[1]?.label, '蔑视')
  assert.equal(item?.sections?.[1]?.text, '如果一名在过去3秒内曾被你造成过伤害的英雄阵亡，会净化无视痛苦的剩余伤害，并在2秒里持续为你回复生命值。')
  assert.doesNotMatch(item?.sections?.map(section => `${section.label || ''}\n${section.text}`).join('\n') || '', RAW_TOOLTIP_PATTERN)
})

test('item tooltip sections do not split when passive names appear inside active body', () => {
  resetGameAssetResolverForTest()
  setGameAssetMetadataForTest({
    version: 'test',
    locale: 'zh_CN',
    items: {
      3748: {
        id: 3748,
        name: '巨型九头蛇',
        description: '<mainText><stats><attention>40</attention>攻击力<br><attention>600</attention>生命值</stats><br><br><passive>顺劈</passive><br>攻击附带<physicalDamage>物理伤害</physicalDamage>并对目标身后的敌人们造成物理伤害。<br><active>刚斩</active><br>强化你的下一次<passive>顺劈</passive>，使其造成<physicalDamage>额外物理伤害</physicalDamage> <OnHit>攻击特效</OnHit>并对目标身后的敌人们造成<physicalDamage>额外物理伤害</physicalDamage>。</mainText>'
      }
    }
  })

  const item = getItemTooltipDetails(3748)

  assert.equal(item?.name, '巨型九头蛇')
  assert.equal(item?.sections?.length, 2)
  assert.equal(item?.sections?.[0]?.label, '顺劈')
  assert.equal(item?.sections?.[1]?.label, '刚斩')
  assert.equal(item?.sections?.[1]?.tone, 'active')
  assert.equal(item?.sections?.[1]?.text, '强化你的下一次顺劈，使其造成额外物理伤害 攻击特效并对目标身后的敌人们造成额外物理伤害。')
  assert.doesNotMatch(item?.sections?.map(section => `${section.label || ''}\n${section.text}`).join('\n') || '', RAW_TOOLTIP_PATTERN)
})

test('summoner spell tooltip keeps real names while rejecting raw template-heavy tooltip text', () => {
  resetGameAssetResolverForTest()
  setGameAssetMetadataForTest({
    version: 'test',
    locale: 'zh_CN',
    summonerSpells: {
      4: {
        id: 4,
        name: '闪现',
        description: '<mainText>使你朝着你的指针位置瞬间传送一小段距离。</mainText>',
        tooltip: '向前位移 {{ range }} 码，@Cooldown@ %i:spell_flash%',
        plaintext: '位移。'
      }
    }
  })

  const spell = getSummonerSpellTooltipDetails(4)

  assert.equal(spell?.name, '闪现')
  assert.equal(spell?.description, '使你朝着你的指针位置瞬间传送一小段距离。')
  assert.doesNotMatch(spell?.description || '', RAW_TOOLTIP_PATTERN)
})

test('LCU metadata overlay overrides local item, augment, and summoner spell metadata by id', async () => {
  resetGameAssetResolverForTest()
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (url: string) => ({
    ok: true,
    json: async () => url.includes('local')
      ? {
          version: 'static',
          locale: 'zh_CN',
          items: {
            6610: {
              id: 6610,
              name: 'Static Sundered Sky',
              description: 'Old DDragon text.',
              gold: { total: 3000, base: 700 },
              from: [1036],
              stats: { FlatPhysicalDamageMod: 40 }
            }
          },
          augments: {
            2005: {
              id: 2005,
              name: 'Static Triggered Inferno',
              description: 'Old augment text.'
            }
          },
          summonerSpells: {
            4: {
              id: 4,
              name: 'Static Flash',
              description: 'Old spell text.',
              icon: 'summoner-spells/4.png'
            }
          }
        }
      : {
          version: 'lcu',
          locale: 'zh_CN',
          items: {
            6610: {
              id: 6610,
              name: '焚天',
              description: '<stats>40攻击力<br>400生命值</stats>',
              gold: { total: 3100, sell: 2170 },
              stats: { FlatHPPoolMod: 400 }
            }
          },
          augments: {
            2005: {
              id: 2005,
              name: '扳机炼狱',
              description: '每回合，你要么变大。',
              rarity: 'gold'
            }
          },
          summonerSpells: {
            4: {
              id: 4,
              name: '闪现',
              description: '<mainText>朝着目标区域瞬移一小段距离。</mainText>',
              tooltip: '快速位移。',
              icon: 'summoner-spells/4.png'
            }
          }
        }
  })) as unknown as typeof fetch

  try {
    await loadGameAssetMetadata('http://asset.test/local-metadata.json')
    assert.equal(getItemTooltipDetails(6610)?.name, 'Static Sundered Sky')
    assert.equal(getItemTooltipDetails(6610)?.priceText, '3000 G (合成 700 G)')
    assert.equal(getSummonerSpellTooltipDetails(4)?.name, 'Static Flash')

    await loadLcuGameAssetMetadataOverlay('http://asset.test/lcu-metadata')

    assert.equal(getItemTooltipDetails(6610)?.name, '焚天')
    assert.equal(getItemTooltipDetails(6610)?.priceText, '3100 G (合成 700 G)')
    assert.deepEqual(getItemTooltipDetails(6610)?.statLines, ['400 生命值'])
    assert.equal(getItemTooltipDetails(6610)?.description, '40攻击力\n400生命值')
    assert.equal(getAugmentTooltipDetails(2005)?.name, '扳机炼狱')
    assert.equal(getAugmentTooltipDetails(2005)?.rarityLabel, '黄金阶')
    assert.equal(getAugmentTooltipDetails(2005)?.rarityTone, 'gold')
    assert.equal(getAugmentTooltipDetails(2005)?.description, '每回合，你要么变大。')
    assert.equal(getSummonerSpellTooltipDetails(4)?.name, '闪现')
    assert.equal(getSummonerSpellTooltipDetails(4)?.description, '朝着目标区域瞬移一小段距离。')

    await loadGameAssetMetadata('http://asset.test/local-metadata.json')
    assert.equal(getItemTooltipDetails(6610)?.name, '焚天')
    assert.equal(getItemTooltipDetails(6610)?.description, '40攻击力\n400生命值')
    assert.equal(getSummonerSpellTooltipDetails(4)?.name, '闪现')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('local metadata remains available when LCU metadata overlay cannot be loaded', async () => {
  resetGameAssetResolverForTest()
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (url: string) => {
    if (url.includes('lcu')) {
      throw new Error('backend unavailable')
    }
    return {
      ok: true,
      json: async () => ({
        version: 'static',
        locale: 'zh_CN',
        items: {
          6610: {
            id: 6610,
            name: '焚天',
            description: 'Static item text.',
            gold: { total: 3100 }
          }
        },
        augments: {
          2005: {
            id: 2005,
            name: '扳机炼狱',
            description: 'Static augment text.'
          }
        }
      })
    }
  }) as unknown as typeof fetch

  try {
    await loadGameAssetMetadata('http://asset.test/local-metadata.json')
    await loadLcuGameAssetMetadataOverlay('http://asset.test/lcu-metadata')

    assert.equal(getItemTooltipDetails(6610)?.name, '焚天')
    assert.equal(getItemTooltipDetails(6610)?.priceText, '3100 G')
    assert.equal(getAugmentTooltipDetails(2005)?.name, '扳机炼狱')
    assert.equal(getAugmentTooltipDetails(2005)?.description, 'Static augment text.')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('local game asset manifest stays selective while including local perk mappings', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../../public/game-assets/manifest.json', import.meta.url), 'utf8'))

  assert.deepEqual(manifest.items, {})
  assert.deepEqual(manifest.augments, {})
  assert.equal(typeof manifest.objectives, 'object')
  assert.ok(Object.keys(manifest.objectives).length > 0)
  assert.equal(typeof manifest.perks, 'object')
  assert.equal(manifest.perks['8005'], 'perks/8005.png')
  assert.equal(manifest.perks['8100'], 'perks/8100.png')
  assert.equal(manifest.perks['8000'], 'perks/8000.png')
  assert.equal(manifest.perks['8135'], 'perks/8135.png')
  assert.ok(existsSync(new URL('../../../public/game-assets/perks/8005.png', import.meta.url)))
  assert.ok(existsSync(new URL('../../../public/game-assets/perks/8100.png', import.meta.url)))
  assert.ok(existsSync(new URL('../../../public/game-assets/perks/8000.png', import.meta.url)))
})

test('bundled augment metadata includes GTIMG Kiwi descriptions for known missing ids', () => {
  resetGameAssetResolverForTest()
  const bundledMetadata = JSON.parse(readFileSync(new URL('../../../public/game-assets/metadata.json', import.meta.url), 'utf8'))
  const targetIds = ['1032', '1320', '1391', '2016']

  for (const id of targetIds) {
    const entry = bundledMetadata.augments?.[id]
    const candidates = [
      entry?.description,
      entry?.tooltip,
      entry?.desc,
      entry?.shortDesc,
      entry?.longDesc,
      entry?.descriptionTra,
      entry?.tooltipTra,
      entry?.tooltipTRA
    ].filter(value => typeof value === 'string' && value.trim())

    assert.ok(entry, `missing augment metadata ${id}`)
    assert.ok(candidates.length > 0, `missing augment description candidate ${id}`)
  }

  setGameAssetMetadataForTest(bundledMetadata)
  const juiced = getAugmentTooltipDetails(2016)
  assert.notEqual(juiced?.description, '暂无详细说明')
  assert.match(juiced?.description || '', /攻击特效|魔法伤害/)
  assert.doesNotMatch(juiced?.description || '', RAW_TOOLTIP_PATTERN)
})

test('game asset sync script hydrates item, summoner spell, perk, augment, and metadata selectively', () => {
  const source = readFileSync(new URL('../../../scripts/sync-game-assets.mjs', import.meta.url), 'utf8')

  assert.match(source, /--all-items/)
  assert.match(source, /--all-spells/)
  assert.match(source, /--all-item-metadata/)
  assert.match(source, /--all-perks/)
  assert.match(source, /--all-augments/)
  assert.match(source, /--all-augment-metadata/)
  assert.match(source, /--all-objectives/)
  assert.match(source, /--with-metadata/)
  assert.match(source, /metadataPath/)
  assert.match(source, /readMetadata/)
  assert.match(source, /writeMetadata/)
  assert.match(source, /downloadAllItems/)
  assert.match(source, /downloadAllItemMetadata/)
  assert.match(source, /downloadAllSummonerSpells/)
  assert.match(source, /hydrateSummonerSpellMetadata/)
  assert.match(source, /runesReforged\.json/)
  assert.match(source, /downloadAllPerks/)
  assert.match(source, /downloadAllAugments/)
  assert.match(source, /downloadAllAugmentMetadata/)
  assert.match(source, /cdragon\/arena/)
  assert.match(source, /downloadAllObjectives/)
  assert.match(source, /objectiveSources/)
  assert.match(source, /manifest\.objectives/)
  assert.match(source, /cherry-augments\.json/)
  assert.match(source, /manifest\.perks/)
  assert.match(source, /metadata\.items/)
  assert.match(source, /metadata\.summonerSpells/)
  assert.match(source, /metadata\.perks/)
  assert.match(source, /metadata\.augments/)
  assert.match(source, /resolveDDragonVersion/)
  assert.match(source, /ddragon\.leagueoflegends\.com\/api\/versions\.json/)
  assert.doesNotMatch(source, /const version = args\.version \|\| '15\.24\.1'/)
  assert.match(source, /itemMetadata\.from/)
  assert.match(source, /itemMetadata\.into/)
  assert.match(source, /itemMetadata\.stats/)
  assert.match(source, /tooltipTRA/)
  assert.match(source, /descriptionTRA/)
  assert.match(source, /shortDesc/)
  assert.match(source, /longDesc/)
  assert.match(source, /--kiwi-augment-source/)
  assert.match(source, /kiwi_augments\.json/)
  assert.match(source, /mergeKiwiAugmentMetadata/)
  assert.match(source, /ddragonImageCdn\}\/\$\{icon\}/)
  assert.doesNotMatch(source, /dragontail/i)
})

test('match detail and cards hide failed or empty equipment images', () => {
  const files = [
    '../components/match-history/MatchHistoryCard.vue',
    '../components/summoner/MatchDetailModal.vue'
  ]

  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    assert.match(source, /getItemIconSlots/)
    assert.match(source, /v-if="slot\.url"/)
    assert.match(source, /@error="markAssetLoadFailed"/)
  }
})
