import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('defaults analysis to solo queue data and recognizes supported queue modes', () => {
  const source = readFileSync(new URL('./matchPreferences.ts', import.meta.url), 'utf8')

  assert.match(source, /DEFAULT_ANALYSIS_QUEUE_MODE\s*=\s*QUEUE_ID\.SOLO_5X5/)
  assert.match(source, /VALID_MATCH_QUEUE_MODES[\s\S]*QUEUE_ID\.SOLO_5X5/)
  assert.match(source, /VALID_MATCH_QUEUE_MODES[\s\S]*QUEUE_ID\.FLEX_SR/)
  assert.match(source, /VALID_MATCH_QUEUE_MODES[\s\S]*QUEUE_ID\.ARAM/)
  assert.match(source, /return VALID_MATCH_QUEUE_MODES\.has\(rawValue\) \? rawValue : 0/)
})

test('caches normalized queue mode values when settings are saved', () => {
  const source = readFileSync(new URL('./matchPreferences.ts', import.meta.url), 'utf8')

  assert.match(source, /export function setCachedDefaultMatchQueueMode\(value: unknown\): number/)
  assert.match(source, /cachedDefaultMatchQueueMode = normalizeMatchQueueMode\(value\)/)
  assert.match(source, /markDefaultQueueModeMigrationDone\(\)/)
  assert.match(source, /return cachedDefaultMatchQueueMode/)
})

test('migrates a legacy localStorage default queue mode to the user store once', () => {
  const source = readFileSync(new URL('./matchPreferences.ts', import.meta.url), 'utf8')

  assert.match(source, /LEGACY_DEFAULT_QUEUE_MODE_KEYS = \[/)
  assert.match(source, /'rankpeek\.settings\.match\.defaultQueueMode'/)
  assert.match(source, /DEFAULT_QUEUE_MODE_MIGRATION_KEY = 'rankpeek\.migration\.defaultQueueMode\.v1'/)
  assert.match(source, /async function migrateLegacyDefaultQueueMode\(serverValue: unknown\): Promise<number \| null>/)
  assert.match(source, /localStorage\.getItem\(DEFAULT_QUEUE_MODE_MIGRATION_KEY\) === 'done'/)
  assert.match(source, /apiClient\.setConfig\(DEFAULT_MATCH_QUEUE_MODE_CONFIG_KEY, legacyMode\)/)
  assert.match(source, /localStorage\.setItem\(DEFAULT_QUEUE_MODE_MIGRATION_KEY, 'done'\)/)
})

test('legacy default queue mode migration avoids repeated or unsafe writes', () => {
  const source = readFileSync(new URL('./matchPreferences.ts', import.meta.url), 'utf8')

  assert.match(source, /if \(serverMode !== 0\) \{[\s\S]*return null/)
  assert.match(source, /if \(legacyMode == null \|\| legacyMode === 0\) \{[\s\S]*return null/)
  assert.match(source, /if \(localStorage\.getItem\(DEFAULT_QUEUE_MODE_MIGRATION_KEY\) === 'done'\) \{[\s\S]*return null/)
  assert.doesNotMatch(source, /localStorage\.clear\(\)/)
})
