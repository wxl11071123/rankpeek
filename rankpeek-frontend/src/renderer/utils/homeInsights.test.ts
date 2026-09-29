import test from 'node:test'
import assert from 'node:assert/strict'
import {
  drawDailyFortune,
  getCurrentFortune,
  loadFortuneRecord,
  saveFortuneRecord
} from './homeInsights.ts'
import type { FortuneRecord } from './homeInsights.ts'

test('daily fortune returns the cached result when drawn twice on the same local date', () => {
  const first = drawDailyFortune({ history: [] }, '2026-05-06', () => 0)
  let randomCalls = 0
  const second = drawDailyFortune(first.record, '2026-05-06', () => {
    randomCalls += 1
    return 0.99
  })

  assert.equal(second.alreadyDrawn, true)
  assert.equal(second.fortune.id, first.fortune.id)
  assert.deepEqual(second.record, first.record)
  assert.equal(randomCalls, 0)
})

test('daily fortune can draw again after the local date changes', () => {
  const first = drawDailyFortune({ history: [] }, '2026-05-06', () => 0)
  const second = drawDailyFortune(first.record, '2026-05-07', () => 0)

  assert.equal(second.alreadyDrawn, false)
  assert.notEqual(second.fortune.id, first.fortune.id)
  assert.deepEqual(second.record.history.map(entry => entry.date), ['2026-05-06', '2026-05-07'])
})

test('daily fortune persists and reloads the current local-date result', () => {
  const storage = new Map<string, string>()
  const previousWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value)
      }
    }
  })

  try {
    const record: FortuneRecord = {
      history: [{ date: '2026-05-06', fortuneId: 'omen-3' }]
    }

    saveFortuneRecord('local', record)
    const reloaded = loadFortuneRecord('local')

    assert.deepEqual(reloaded, record)
    assert.equal(getCurrentFortune(reloaded, '2026-05-06')?.id, 'omen-3')
    assert.equal(storage.has('rankpeek.home.fortune.local'), true)
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: previousWindow
    })
  }
})
