import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('OP.GG champion tier table renders Akari-style list columns and emits selected champion', () => {
  const source = readFileSync(new URL('./OpggChampionTierTable.vue', import.meta.url), 'utf8')

  assert.match(source, /defineEmits<\{[\s\S]*selectChampion/)
  assert.match(source, /@click="\$emit\('selectChampion', item\.championId\)"/)
  assert.doesNotMatch(source, /opgg-tier-header/)
  assert.doesNotMatch(source, /opgg-tier-version/)
  assert.doesNotMatch(source, /filterLabel/)
  assert.match(source, /<th>#<\/th>/)
  assert.match(source, /<th>英雄<\/th>/)
  assert.match(source, /<th>梯队<\/th>/)
  assert.match(source, /<th>胜率<\/th>/)
  assert.match(source, /<th>登场率<\/th>/)
  assert.match(source, /<th>禁用率<\/th>/)
  assert.match(source, /<th>劣势对位<\/th>/)
  assert.match(source, /selectedPositionStats\(item\)/)
  assert.match(source, /counter\.championId/)
})

test('OP.GG champion tier table uses shared champion nickname search aliases', () => {
  const source = readFileSync(new URL('./OpggChampionTierTable.vue', import.meta.url), 'utf8')

  assert.match(source, /from '@\/utils\/championSearchAliases'/)
  assert.match(source, /championOptionMatchesSearch/)
})
