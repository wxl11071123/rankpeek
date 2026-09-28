import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('frontend transient cache helper only removes explicit temporary namespaces', () => {
  const source = readFileSync(new URL('./frontendCache.ts', import.meta.url), 'utf8')

  assert.match(source, /export function clearFrontendTransientCache\(\)/)
  assert.match(source, /rankpeek\.cache\./)
  assert.match(source, /rankpeek\.temp\./)
  assert.match(source, /localStorage\.removeItem\(key\)/)
  assert.doesNotMatch(source, /localStorage\.clear\(\)/)
  assert.doesNotMatch(source, /rankpeek-theme/)
  assert.doesNotMatch(source, /settings\.match\.defaultQueueMode/)
  assert.doesNotMatch(source, /rankpeek\.home\./)
})
