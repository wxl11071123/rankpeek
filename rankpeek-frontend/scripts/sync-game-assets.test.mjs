import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractKiwiAugmentEntries,
  isZhCnLocale,
  mergeKiwiAugmentMetadata,
  shouldEnrichKiwiAugments
} from './sync-game-assets.mjs'

test('extractKiwiAugmentEntries reads GTIMG Kiwi augment payload wrappers', () => {
  const entries = extractKiwiAugmentEntries({
    data: [
      {
        augmentID: 2016,
        name_cn: '注魔',
        level: 'kSilver',
        desc: '<OnHit>%i:OnHit%攻击特效</OnHit>消耗<scaleMana>@Calc_Mana_Cost@法力值</scaleMana>。',
        tooltip: '攻击特效消耗法力值以造成魔法伤害，这个伤害可以暴击。'
      }
    ]
  })

  assert.deepEqual(entries, [
    {
      id: 2016,
      name: '注魔',
      description: '攻击特效消耗法力值以造成魔法伤害，这个伤害可以暴击。',
      tooltip: '攻击特效消耗法力值以造成魔法伤害，这个伤害可以暴击。',
      desc: '<OnHit>%i:OnHit%攻击特效</OnHit>消耗<scaleMana>@Calc_Mana_Cost@法力值</scaleMana>。',
      rarity: 'kSilver'
    }
  ])
})

test('mergeKiwiAugmentMetadata conservatively fills only augment text gaps', () => {
  const metadata = {
    version: 'test',
    locale: 'zh_CN',
    items: {
      1001: { id: 1001, description: 'item text' }
    },
    summonerSpells: {
      4: { id: 4, description: 'spell text' }
    },
    perks: {
      8005: { id: 8005, description: 'perk text' }
    },
    augments: {
      1: {
        id: 1,
        name: 'Existing augment',
        description: 'Existing description',
        tooltip: 'Existing tooltip',
        desc: 'Existing desc',
        rarity: 'kGold'
      },
      2: {
        id: 2,
        name: '',
        description: '',
        tooltip: '',
        desc: '',
        rarity: ''
      },
      3: {
        id: 3,
        description: '暂无详细说明'
      }
    }
  }
  const items = structuredClone(metadata.items)
  const summonerSpells = structuredClone(metadata.summonerSpells)
  const perks = structuredClone(metadata.perks)

  const changed = mergeKiwiAugmentMetadata(metadata, [
    { id: 1, name: '', description: '', tooltip: '', desc: '', rarity: '' },
    {
      id: 2,
      name: 'GTIMG augment',
      description: 'Clean GTIMG tooltip',
      tooltip: 'Clean GTIMG tooltip',
      desc: '<mainText>@Value@ raw desc</mainText>',
      rarity: 'kSilver'
    },
    {
      id: 3,
      name: '',
      description: 'Fallback can be replaced',
      tooltip: 'Fallback can be replaced',
      desc: '',
      rarity: ''
    }
  ])

  assert.equal(changed, 2)
  assert.equal(metadata.augments[1].description, 'Existing description')
  assert.equal(metadata.augments[1].tooltip, 'Existing tooltip')
  assert.equal(metadata.augments[1].desc, 'Existing desc')
  assert.equal(metadata.augments[2].name, 'GTIMG augment')
  assert.equal(metadata.augments[2].description, 'Clean GTIMG tooltip')
  assert.equal(metadata.augments[2].tooltip, 'Clean GTIMG tooltip')
  assert.equal(metadata.augments[2].desc, '<mainText>@Value@ raw desc</mainText>')
  assert.equal(metadata.augments[2].rarity, 'kSilver')
  assert.equal(metadata.augments[3].description, 'Fallback can be replaced')
  assert.deepEqual(metadata.items, items)
  assert.deepEqual(metadata.summonerSpells, summonerSpells)
  assert.deepEqual(metadata.perks, perks)
})

test('Kiwi augment enrichment defaults only for zh_CN metadata syncs', () => {
  assert.equal(isZhCnLocale('zh_CN'), true)
  assert.equal(isZhCnLocale('zh-CN'), true)
  assert.equal(isZhCnLocale('en_US'), false)
  assert.equal(shouldEnrichKiwiAugments({ allAugmentMetadata: true }, 'zh_CN'), true)
  assert.equal(shouldEnrichKiwiAugments({ allAugmentMetadata: true }, 'en_US'), false)
  assert.equal(shouldEnrichKiwiAugments({ allAugmentMetadata: true, kiwiAugmentSource: 'https://example.test/kiwi.json' }, 'en_US'), true)
  assert.equal(shouldEnrichKiwiAugments({ allAugmentMetadata: true, noKiwiAugmentEnrich: true }, 'zh_CN'), false)
  assert.equal(shouldEnrichKiwiAugments({ allItems: true }, 'zh_CN'), false)
})
