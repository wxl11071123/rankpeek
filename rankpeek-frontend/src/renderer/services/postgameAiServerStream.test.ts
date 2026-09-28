import test from 'node:test'
import assert from 'node:assert/strict'
import type { PostgameAiInputSnapshot } from './postgameAiInputSnapshot.ts'
import {
  createPostgameAiStreamRequest,
  estimatePostgameAiTokenCostCny,
  RANKPEEK_SERVER_POSTGAME_STREAM_ENDPOINT,
  streamPostgameAiAnalysis
} from './postgameAiServerStream.ts'
import {
  RANKPEEK_LOCAL_POSTGAME_STREAM_ENDPOINT
} from './localAiStreamClient.ts'
import { RANKPEEK_LOCAL_SERVICE_BASE_URL } from './rankpeekLocalServiceClient.ts'

function createSnapshot(): PostgameAiInputSnapshot {
  return {
    schemaVersion: 'postgame_ai_input_snapshot.v3',
    analysisType: 'postgame',
    builtAt: '2026-05-13T00:00:00.000Z',
    inputHash: 'hash-1',
    analysisBrief: {
      schemaVersion: 'postgame_analysis_brief.v1',
      language: 'zh-CN',
      matchFacts: ['ranked match'],
      teamFacts: ['team data available'],
      playerFacts: ['self player facts'],
      timelineFacts: ['timeline unavailable'],
      dataQualityFacts: ['partial data']
    }
  }
}

test('creates a postgame stream request that wraps mode, schema, and snapshot', () => {
  const snapshot = createSnapshot()
  const request = createPostgameAiStreamRequest(snapshot, 'review')

  assert.equal(request.mode, 'review')
  assert.equal(request.snapshotSchemaVersion, 'postgame_ai_input_snapshot.v3')
  assert.equal(request.snapshot, snapshot)
})

test('streamPostgameAiAnalysis delegates to local postgame stream without Authorization', async () => {
  const request = createPostgameAiStreamRequest(createSnapshot(), 'review')
  const events: string[] = []
  const deltas: string[] = []
  const usages: unknown[] = []
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(url), `${RANKPEEK_LOCAL_SERVICE_BASE_URL}${RANKPEEK_LOCAL_POSTGAME_STREAM_ENDPOINT}`)
    assert.equal(RANKPEEK_SERVER_POSTGAME_STREAM_ENDPOINT, RANKPEEK_LOCAL_POSTGAME_STREAM_ENDPOINT)
    assert.equal(init?.method, 'POST')
    assert.deepEqual(init?.headers, { 'Content-Type': 'application/json' })
    assert.equal(JSON.parse(String(init?.body)).snapshotSchemaVersion, 'postgame_ai_input_snapshot.v3')

    const encoder = new TextEncoder()
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('event: start\ndata: {"title":"local"}\n\n'))
        controller.enqueue(encoder.encode('event: delta\ndata: {"text":"accepted"}\n\n'))
        controller.enqueue(encoder.encode('event: usage\ndata: {"provider":"deepseek","model":"deepseek-v4-flash","promptTokens":2100,"completionTokens":140,"totalTokens":2240,"promptCacheHitTokens":0,"promptCacheMissTokens":2100}\n\n'))
        controller.enqueue(encoder.encode('event: done\ndata: {"type":"done"}\n\n'))
        controller.close()
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' }
    })
  }) as typeof fetch

  try {
    const result = await streamPostgameAiAnalysis(request, {
      onEvent: event => events.push(event.type),
      onDelta: text => deltas.push(text),
      onUsage: usage => usages.push(usage)
    })

    assert.deepEqual(result, { ok: true })
    assert.deepEqual(events, ['start', 'delta', 'usage', 'done'])
    assert.deepEqual(deltas, ['accepted'])
    assert.deepEqual(usages, [{
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      promptTokens: 2100,
      completionTokens: 140,
      totalTokens: 2240,
      promptCacheHitTokens: 0,
      promptCacheMissTokens: 2100,
      cost: {
        currency: 'CNY',
        inputCacheHitCny: 0,
        inputCacheMissCny: 0.0021,
        outputCny: 0.00028,
        totalCny: 0.00238,
        pricing: {
          inputCacheHitCnyPerMillionTokens: 0.02,
          inputCacheMissCnyPerMillionTokens: 1,
          outputCnyPerMillionTokens: 2
        }
      }
    }])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('estimates mainland DeepSeek token cost with cache hit, cache miss, and output tokens', () => {
  const cost = estimatePostgameAiTokenCostCny({
    model: 'deepseek-v4-flash',
    completionTokens: 400,
    promptCacheHitTokens: 1000,
    promptCacheMissTokens: 2000
  })

  assert.deepEqual(cost, {
    currency: 'CNY',
    inputCacheHitCny: 0.00002,
    inputCacheMissCny: 0.002,
    outputCny: 0.0008,
    totalCny: 0.00282,
    pricing: {
      inputCacheHitCnyPerMillionTokens: 0.02,
      inputCacheMissCnyPerMillionTokens: 1,
      outputCnyPerMillionTokens: 2
    }
  })
})

test('estimates mainland DeepSeek V4 Pro cost from the current China pricing table', () => {
  const cost = estimatePostgameAiTokenCostCny({
    model: 'deepseek-v4-pro',
    completionTokens: 400,
    promptCacheHitTokens: 1000,
    promptCacheMissTokens: 2000
  })

  assert.deepEqual(cost, {
    currency: 'CNY',
    inputCacheHitCny: 0.000025,
    inputCacheMissCny: 0.006,
    outputCny: 0.0024,
    totalCny: 0.008425,
    pricing: {
      inputCacheHitCnyPerMillionTokens: 0.025,
      inputCacheMissCnyPerMillionTokens: 3,
      outputCnyPerMillionTokens: 6
    }
  })
})

test('streamPostgameAiAnalysis returns failed result when local backend is unavailable', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    throw new TypeError('fetch failed')
  }) as typeof fetch

  try {
    const result = await streamPostgameAiAnalysis(createPostgameAiStreamRequest(createSnapshot(), 'review'), {})

    assert.equal(result.ok, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})
