import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./main.ts', import.meta.url), 'utf8')

test('LCU auth is re-pushed when the backend instance changes', () => {
  assert.match(source, /const backendInstanceId = await resolveBackendInstanceId\(\)/)
  assert.match(source, /authUnchanged && backendInstanceId === lastPushedBackendInstanceId/)
  assert.match(source, /lastPushedBackendInstanceId = backendInstanceId/)
})

test('backend identity is only re-checked on an interval', () => {
  assert.match(source, /const BACKEND_IDENTITY_CHECK_INTERVAL_MS = \d+/)
  assert.match(source, /now - lastBackendIdentityCheckAt < BACKEND_IDENTITY_CHECK_INTERVAL_MS/)
})
