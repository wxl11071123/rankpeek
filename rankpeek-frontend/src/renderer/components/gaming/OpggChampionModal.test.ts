import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('OP.GG champion modal provides dialog, loading, success, error, and empty states', () => {
  const source = readFileSync(new URL('./OpggChampionModal.vue', import.meta.url), 'utf8')

  assert.match(source, /role="dialog"/)
  assert.match(source, /aria-modal="true"/)
  assert.match(source, /<h2 id="opgg-modal-title">OP\.GG<\/h2>/)
  assert.match(source, /class="opgg-modal-overlay"/)
  assert.match(source, /class="opgg-modal-panel"/)
  assert.match(source, /v-if="loading"/)
  assert.match(source, /v-else-if="error"/)
  assert.match(source, /v-else-if="!detail"/)
  assert.match(source, /v-else/)
  assert.match(source, /@click="\$emit\('retry'\)"/)
  assert.match(source, /@click="\$emit\('close'\)"/)
})

test('OP.GG champion modal renders core stats and build sections with local game asset helpers', () => {
  const source = readFileSync(new URL('./OpggChampionModal.vue', import.meta.url), 'utf8')

  assert.match(source, /import \{[\s\S]*getChampionIconUrl[\s\S]*getItemIconUrl[\s\S]*getPerkIconUrl[\s\S]*getSummonerSpellIconUrl[\s\S]*markAssetLoadFailed[\s\S]*\} from '@\/utils\/gameAssetUrls'/)
  assert.match(source, /formatPercent\(detail\.stats\.winRate\)/)
  assert.match(source, /formatPercent\(detail\.stats\.pickRate\)/)
  assert.match(source, /formatPercent\(detail\.stats\.banRate\)/)
  assert.match(source, /formatNumber\(detail\.stats\.kda\)/)
  assert.match(source, /summonerSpells/)
  assert.match(source, /runes/)
  assert.match(source, /skillOrders/)
  assert.match(source, /starterItems/)
  assert.match(source, /boots/)
  assert.match(source, /coreItems/)
  assert.match(source, /getIconUrl\(section\.iconType, id\)/)
  assert.match(source, /@error="markAssetLoadFailed"/)
})

test('OP.GG champion modal reuses match-history tooltips for rune and item icons', () => {
  const source = readFileSync(new URL('./OpggChampionModal.vue', import.meta.url), 'utf8')

  assert.match(source, /import AssetHoverTooltip from '@\/components\/common\/AssetHoverTooltip\.vue'/)
  assert.match(source, /getItemTooltipDetails/)
  assert.match(source, /getPerkTooltipDetails/)
  assert.match(source, /function getOpggTooltipDetails\(iconType: IconType, id: number\): GameAssetTooltipDetails \| null \{[\s\S]*iconType === 'perk'[\s\S]*getPerkTooltipDetails\(id\)[\s\S]*iconType === 'item'[\s\S]*getItemTooltipDetails\(id\)/)
  assert.match(source, /<AssetHoverTooltip\s+v-if="getIconUrl\(section\.iconType, id\) && getOpggTooltipDetails\(section\.iconType, id\)"[\s\S]*:details="getOpggTooltipDetails\(section\.iconType, id\)!"/)
  assert.match(source, /\.opgg-icon-slot\s+:deep\(\.asset-tooltip-trigger\)\s*\{[\s\S]*width:\s*100%;[\s\S]*height:\s*100%;/)
})

test('OP.GG champion modal has theme-aware compact surface styling', () => {
  const source = readFileSync(new URL('./OpggChampionModal.vue', import.meta.url), 'utf8')

  assert.match(source, /\.opgg-modal-panel\s*\{[\s\S]*background:\s*var\(--bg-secondary\)/)
  assert.match(source, /\.opgg-section\s*\{[\s\S]*border:\s*1px solid var\(--border-color\)/)
  assert.match(source, /\.opgg-stat-card\s*\{[\s\S]*background:\s*var\(--bg-tertiary\)/)
  assert.match(source, /:global\(\[data-theme="light"\] \.opgg-modal-panel\)/)
})
