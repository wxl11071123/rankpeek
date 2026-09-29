import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('user tag badge list shows all tags by default and only caps when requested', () => {
  const source = readFileSync(new URL('./UserTagBadgeList.vue', import.meta.url), 'utf8')

  assert.match(source, /limit\?: number \| null/)
  assert.match(source, /limit: null/)
  assert.match(source, /props\.limit == null\s*\?\s*props\.tags\s*:\s*props\.tags\.slice\(0, props\.limit\)/)
  assert.doesNotMatch(source, /limit: 2/)
  assert.doesNotMatch(source, /const visibleTags = computed\(\(\) => props\.tags\.slice\(0, props\.limit\)\)/)
})
