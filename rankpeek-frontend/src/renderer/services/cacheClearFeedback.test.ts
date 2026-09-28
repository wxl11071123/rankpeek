import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCacheClearAlertMessage,
  extractCacheClearErrorMessage
} from './cacheClearFeedback.ts'
import type { CacheClearResult } from '../types/api.ts'

const messages = {
  cleared: '缓存已清理',
  partial: '部分缓存清理失败',
  failed: '缓存清理失败'
}

function result(overrides: Partial<CacheClearResult>): CacheClearResult {
  return {
    success: true,
    scope: 'all',
    message: 'cache cleared',
    deletedRows: 0,
    timestamp: 1,
    cleared: ['memory.matchHistory'],
    failed: [],
    ...overrides
  }
}

test('cache clear alert shows success message for full success', () => {
  assert.equal(
    buildCacheClearAlertMessage(result({ success: true }), messages),
    '缓存已清理'
  )
})

test('cache clear alert shows partial failure details when some items failed', () => {
  assert.equal(
    buildCacheClearAlertMessage(result({
      success: false,
      cleared: ['memory.matchHistory'],
      failed: [{ name: 'memory.rank', message: 'rank cache busy' }]
    }), messages),
    '部分缓存清理失败：memory.rank: rank cache busy'
  )
})

test('cache clear alert shows full failure details when no items were cleared', () => {
  assert.equal(
    buildCacheClearAlertMessage(result({
      success: false,
      cleared: [],
      failed: [
        { name: 'memory.rank', message: 'rank cache busy' },
        { name: 'localDb.match_cache', message: 'database locked' }
      ]
    }), messages),
    '缓存清理失败：memory.rank: rank cache busy；localDb.match_cache: database locked'
  )
})

test('cache clear thrown errors keep their real message', () => {
  assert.equal(extractCacheClearErrorMessage(new Error('backend unavailable')), 'backend unavailable')
  assert.equal(extractCacheClearErrorMessage({ message: 'request failed' }), 'request failed')
  assert.equal(extractCacheClearErrorMessage('network down'), 'network down')
})
