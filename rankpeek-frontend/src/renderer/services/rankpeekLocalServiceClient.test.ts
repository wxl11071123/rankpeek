import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_RANKPEEK_LOCAL_SERVICE_BASE_URL,
  normalizeRankPeekLocalServiceBaseUrl
} from './rankpeekLocalServiceClient.ts'

test('local service defaults to packaged backend port', () => {
  assert.equal(DEFAULT_RANKPEEK_LOCAL_SERVICE_BASE_URL, 'http://127.0.0.1:8080')
  assert.equal(normalizeRankPeekLocalServiceBaseUrl(undefined), 'http://127.0.0.1:8080')
  assert.equal(normalizeRankPeekLocalServiceBaseUrl(''), 'http://127.0.0.1:8080')
  assert.equal(normalizeRankPeekLocalServiceBaseUrl('http://127.0.0.1:8080///'), 'http://127.0.0.1:8080')
})
