import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getLocalAiCostUsageSummary,
  getLocalCostEvents,
  getLocalCostSummary
} from './localCostClient.ts'
import { RANKPEEK_LOCAL_SERVICE_BASE_URL } from './rankpeekLocalServiceClient.ts'

test('getLocalCostSummary calls local cost summary endpoint', async () => {
  const originalFetch = globalThis.fetch
  const calls: string[] = []

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(String(url))
    assert.equal(init, undefined)
    return new Response(JSON.stringify({
      success: true,
      data: {
        from: '2026-05-01',
        to: '2026-05-31',
        totalCostCny: 0.12
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }) as typeof fetch

  try {
    const summary = await getLocalCostSummary()

    assert.equal(calls[0], `${RANKPEEK_LOCAL_SERVICE_BASE_URL}/api/v1/costs/summary`)
    assert.equal(summary.totalCostCny, 0.12)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('getLocalCostEvents parses backend items payload', async () => {
  const originalFetch = globalThis.fetch
  const calls: string[] = []

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(String(url))
    assert.equal(init, undefined)
    return new Response(JSON.stringify({
      success: true,
      data: {
        items: [
          {
            id: 7,
            eventType: 'ai_analysis',
            source: 'pregame',
            amountCny: 0.03,
            quantity: 1200,
            createdAt: 1780000000000
          }
        ]
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }) as typeof fetch

  try {
    const events = await getLocalCostEvents({ type: 'ai_analysis', limit: 6, offset: 0 })

    assert.equal(calls[0], `${RANKPEEK_LOCAL_SERVICE_BASE_URL}/api/v1/costs/events?type=ai_analysis&limit=6&offset=0`)
    assert.equal(events.length, 1)
    assert.equal(events[0]?.source, 'pregame')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('getLocalAiCostUsageSummary calls grouped AI usage endpoint', async () => {
  const originalFetch = globalThis.fetch
  const calls: string[] = []

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(String(url))
    assert.equal(init, undefined)
    return new Response(JSON.stringify({
      success: true,
      data: {
        items: [
          { key: 'coach', count: 1, totalCostCny: 0.01 },
          { key: 'pregame', count: 2, totalCostCny: 0.02 },
          { key: 'postgame', count: 3, totalCostCny: 0.03 }
        ]
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }) as typeof fetch

  try {
    const summary = await getLocalAiCostUsageSummary()

    assert.equal(calls[0], `${RANKPEEK_LOCAL_SERVICE_BASE_URL}/api/v1/costs/ai-usage-summary`)
    assert.deepEqual(summary.map(item => item.key), ['coach', 'pregame', 'postgame'])
    assert.equal(summary[2]?.totalCostCny, 0.03)
  } finally {
    globalThis.fetch = originalFetch
  }
})
