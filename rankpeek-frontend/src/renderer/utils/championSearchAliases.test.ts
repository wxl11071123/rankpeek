import test from 'node:test'
import assert from 'node:assert/strict'
import { championOptionMatchesSearch, getChampionSearchAliases } from './championSearchAliases.ts'
import type { ChampionOption } from '@/types/api'

test('champion search aliases cover approved common Chinese nicknames', () => {
  assert.deepEqual(getChampionSearchAliases(901), ['小火龙', '斯莫德', '炽炎雏龙'])
  assert.deepEqual(getChampionSearchAliases(64), ['盲僧', '瞎子', '李青'])
  assert.deepEqual(getChampionSearchAliases(523), ['厄斐琉斯', '月男', '残月', '吴E凡', '吴亦凡'])
  assert.equal(getChampionSearchAliases(106).includes('狗熊'), true)
  assert.equal(getChampionSearchAliases(127).includes('冰女'), true)
  assert.equal(getChampionSearchAliases(89).includes('日女'), true)
  assert.equal(getChampionSearchAliases(91).includes('男刀'), true)
  assert.equal(getChampionSearchAliases(39).includes('女刀'), true)
})

test('champion search aliases omit rejected review entries', () => {
  const rejectedAliasesByChampionId = new Map<number, string[]>([
    [4, ['TF', 'tf']],
    [7, ['LB', 'lb']],
    [59, ['J4', 'j4']],
    [77, ['兽灵']],
    [78, ['圣锤']],
    [143, ['花女']],
    [201, ['盾叔']],
    [202, ['四哥']],
    [523, ['吴亦E凡', 'efeiliusi']],
    [777, ['亚索哥哥']],
    [902, ['火娃']],
    [950, ['狗群']]
  ])

  for (const [championId, rejectedAliases] of rejectedAliasesByChampionId) {
    const aliases = getChampionSearchAliases(championId)
    for (const rejectedAlias of rejectedAliases) {
      assert.equal(aliases.includes(rejectedAlias), false, `${championId} should not include ${rejectedAlias}`)
    }
  }
})

test('champion search matches approved hidden aliases', () => {
  const smolder: ChampionOption = { value: 901, label: '炽炎雏龙', realName: 'Smolder', nickname: '' }
  const aphelios: ChampionOption = { value: 523, label: '残月之肃', realName: 'Aphelios', nickname: '' }

  assert.equal(championOptionMatchesSearch(smolder, '小火龙'), true)
  assert.equal(championOptionMatchesSearch(aphelios, '吴E凡'), true)
  assert.equal(championOptionMatchesSearch(aphelios, '吴亦凡'), true)
  assert.equal(championOptionMatchesSearch(aphelios, '吴亦E凡'), false)
  assert.equal(championOptionMatchesSearch(aphelios, 'efeiliusi'), false)
})
