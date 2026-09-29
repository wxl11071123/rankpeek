import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('coach cards use report headline fallback fields while preserving open-report emit', () => {
  const source = readFileSync(new URL('./AICoachCards.vue', import.meta.url), 'utf8')

  assert.match(source, /import \{ getCoachReportHeadline \} from '@\/services\/localAiAnalysis'/)
  assert.match(source, /id\?: number \| string/)
  assert.match(source, /headline\?: string/)
  assert.match(source, /cardTitle\?: string/)
  assert.match(source, /shortTitle\?: string/)
  assert.match(source, /getCoachReportHeadline\(\{ report \}\)/)
  assert.match(source, /emit\('open-report', activeReportForEmit\.value, activeIndex\.value\)/)
  assert.match(source, /const activeReportForEmit = computed<CoachReport \| null>\(\(\) => activeReport\.value\)/)
  assert.doesNotMatch(source, /dev-preview|CoachSummaryReport|isDevPlaceholder/)
})

test('coach cards do not render fake placeholder reports when there are no records', () => {
  const source = readFileSync(new URL('./AICoachCards.vue', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /DEV_PLACEHOLDER_REPORTS/)
  assert.doesNotMatch(source, /hasDevPlaceholders/)
  assert.doesNotMatch(source, /using-dev-placeholders/)
  assert.doesNotMatch(source, /涓湡璧勬簮鍥㈠け璇|中期资源团/)
  assert.match(source, /v-if="hasDisplayReports"/)
  assert.match(source, /<div v-else class="record-preview record-preview-empty">/)
  assert.match(source, /使用电子教练生成第一份报告。/)
  assert.match(source, /class="record-main-card record-placeholder-card"/)
  assert.match(source, /<div v-if="hasDisplayReports" class="record-controls"/)
  assert.doesNotMatch(source, /placeholder-\$\{index\}/)
})

test('coach cards build a vertical decorative deck behind the active report', () => {
  const source = readFileSync(new URL('./AICoachCards.vue', import.meta.url), 'utf8')

  assert.match(source, /const deckDecorativeLayers = computed/)
  assert.match(source, /Math\.min\(displayCount\.value - 1, 2\)/)
  assert.match(source, /v-for="layer in deckDecorativeLayers"/)
  assert.match(source, /class="record-stack-card"/)
  assert.match(source, /deck-layer-\$\{layer\}/)
  assert.doesNotMatch(source, /record-preview-title/)
  assert.doesNotMatch(source, /record-preview-meta/)
})

test('coach cards keep wheel navigation cyclic for the deck', () => {
  const source = readFileSync(new URL('./AICoachCards.vue', import.meta.url), 'utf8')

  assert.match(source, /const nextIndex = \(\(index % count\) \+ count\) % count/)
  assert.match(source, /selectReport\(activeIndex\.value \+ \(direction === 'next' \? 1 : -1\), direction\)/)
})
