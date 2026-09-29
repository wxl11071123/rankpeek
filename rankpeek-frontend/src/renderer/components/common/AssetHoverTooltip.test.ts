import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('asset hover tooltip renders through body teleport with fixed viewport positioning', () => {
  const source = readFileSync(new URL('./AssetHoverTooltip.vue', import.meta.url), 'utf8')

  assert.match(source, /details:\s*GameAssetTooltipDetails/)
  assert.match(source, /<slot/)
  assert.match(source, /<Teleport\s+to="body"/)
  assert.match(source, /position:\s*fixed/)
  assert.match(source, /getBoundingClientRect\(\)/)
  assert.match(source, /window\.innerWidth/)
  assert.match(source, /window\.innerHeight/)
  assert.match(source, /pointer-events:\s*none/)
})

test('asset hover tooltip supports mouse and keyboard activation without browser title dependency', () => {
  const source = readFileSync(new URL('./AssetHoverTooltip.vue', import.meta.url), 'utf8')

  assert.match(source, /@mouseenter="scheduleShow"/)
  assert.match(source, /@focusin="scheduleShow"/)
  assert.match(source, /@mouseleave="scheduleHide"/)
  assert.match(source, /@focusout="scheduleHide"/)
  assert.match(source, /details\.description/)
  assert.match(source, /暂无详细说明/)
  assert.doesNotMatch(source, /\btitle=/)
})

test('asset hover tooltip hides empty subtitles and preserves multiline descriptions', () => {
  const source = readFileSync(new URL('./AssetHoverTooltip.vue', import.meta.url), 'utf8')

  assert.match(source, /v-if="visibleSubtitle"/)
  assert.match(source, /visibleSubtitle/)
  assert.match(source, /details\.description/)
  assert.match(source, /white-space:\s*pre-line/)
  assert.doesNotMatch(source, /asset-hover-tooltip-subtitle">\s*\{\{\s*details\.subtitle\s*\}\}/)
})

test('asset hover tooltip suppresses subtitle when it duplicates augment rarity', () => {
  const source = readFileSync(new URL('./AssetHoverTooltip.vue', import.meta.url), 'utf8')

  assert.match(source, /details\.rarityLabel/)
  assert.match(source, /props\.details\.subtitle/)
  assert.match(source, /props\.details\.rarityLabel/)
  assert.match(source, /subtitle\s*===\s*props\.details\.rarityLabel/)
  assert.doesNotMatch(source, /v-if="details\.subtitle"/)
  assert.doesNotMatch(source, /\{\{\s*details\.subtitle\s*\}\}/)
})

test('asset hover tooltip renders structured price, recipe, stats, sections, and rarity details', () => {
  const source = readFileSync(new URL('./AssetHoverTooltip.vue', import.meta.url), 'utf8')

  assert.match(source, /details\.rarityLabel/)
  assert.match(source, /details\.rarityTone/)
  assert.match(source, /details\.priceText/)
  assert.match(source, /details\.recipeIconUrls/)
  assert.match(source, /details\.statLines/)
  assert.match(source, /details\.sections/)
  assert.match(source, /asset-hover-tooltip-recipe/)
  assert.match(source, /asset-hover-tooltip-stat/)
  assert.match(source, /asset-hover-tooltip-section/)
  assert.match(source, /asset-hover-tooltip-section-label/)
  assert.match(source, /asset-hover-tooltip-section-body/)
})

test('asset hover tooltip keeps legacy description-only details as the fallback body', () => {
  const source = readFileSync(new URL('./AssetHoverTooltip.vue', import.meta.url), 'utf8')

  assert.match(source, /v-else[\s\S]*class="asset-hover-tooltip-description"/)
  assert.match(source, /details\.description \|\| '暂无详细说明'/)
})
