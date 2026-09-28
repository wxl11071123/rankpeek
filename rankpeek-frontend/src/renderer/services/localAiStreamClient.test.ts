import test from 'node:test'
import assert from 'node:assert/strict'
import {
  RANKPEEK_LOCAL_PREGAME_STREAM_ENDPOINT,
  RANKPEEK_LOCAL_POSTGAME_STREAM_ENDPOINT,
  streamLocalPregameAi,
  streamLocalPostgameAi
} from './localAiStreamClient.ts'
import { RANKPEEK_LOCAL_SERVICE_BASE_URL } from './rankpeekLocalServiceClient.ts'

function streamResponse(body: string, contentType = 'text/event-stream') {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body))
      controller.close()
    }
  }), {
    status: 200,
    headers: { 'Content-Type': contentType }
  })
}

test('streamLocalPregameAi posts to local pregame endpoint without Authorization', async () => {
  const originalFetch = globalThis.fetch
  const events: string[] = []

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(url), `${RANKPEEK_LOCAL_SERVICE_BASE_URL}${RANKPEEK_LOCAL_PREGAME_STREAM_ENDPOINT}`)
    assert.equal(init?.method, 'POST')
    assert.deepEqual(init?.headers, { 'Content-Type': 'application/json' })
    assert.equal(JSON.parse(String(init?.body)).snapshotSchemaVersion, 'gaming.v1')
    return streamResponse('event: start\ndata: {"title":"local"}\n\nevent: done\ndata: {"type":"done"}\n\n')
  }) as typeof fetch

  try {
    const result = await streamLocalPregameAi({
      mode: 'teammate',
      snapshotSchemaVersion: 'gaming.v1',
      snapshot: {},
      allyTeamTags: [],
      enemyTeamTags: []
    }, {
      onEvent: event => events.push(event.type)
    })

    assert.deepEqual(result, { ok: true })
    assert.deepEqual(events, ['start', 'done'])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('streamLocalPostgameAi posts to local postgame endpoint without Authorization', async () => {
  const originalFetch = globalThis.fetch
  const deltas: string[] = []

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(url), `${RANKPEEK_LOCAL_SERVICE_BASE_URL}${RANKPEEK_LOCAL_POSTGAME_STREAM_ENDPOINT}`)
    assert.equal(init?.method, 'POST')
    assert.deepEqual(init?.headers, { 'Content-Type': 'application/json' })
    assert.equal(JSON.parse(String(init?.body)).snapshotSchemaVersion, 'postgame.v1')
    return streamResponse('{"type":"delta","text":"local review"}\n{"type":"done"}\n', 'application/x-ndjson')
  }) as typeof fetch

  try {
    const result = await streamLocalPostgameAi({
      mode: 'review',
      snapshotSchemaVersion: 'postgame.v1',
      snapshot: {}
    }, {
      onDelta: text => deltas.push(text)
    })

    assert.deepEqual(result, { ok: true })
    assert.deepEqual(deltas, ['local review'])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('streamLocalPostgameAi maps missing provider configuration to friendly text', async () => {
  const originalFetch = globalThis.fetch
  const errors: string[] = []

  globalThis.fetch = (async () => streamResponse(
    'event: error\ndata: {"type":"error","code":"AI_PROVIDER_NOT_CONFIGURED","message":"Please configure AI provider and API key first."}\n\n'
  )) as typeof fetch

  try {
    const result = await streamLocalPostgameAi({
      mode: 'review',
      snapshotSchemaVersion: 'postgame.v1',
      snapshot: {}
    }, {
      onError: message => errors.push(message)
    })

    assert.equal(result.ok, false)
    assert.equal(result.ok ? '' : result.message, '请先在设置里配置 AI 服务商和 API Key。')
    assert.deepEqual(errors, ['请先在设置里配置 AI 服务商和 API Key。'])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('streamLocalPostgameAi does not estimate DeepSeek pricing for other providers', async () => {
  const originalFetch = globalThis.fetch
  const costs: unknown[] = []

  globalThis.fetch = (async () => streamResponse(
    'event: usage\ndata: {"provider":"qwen","model":"qwen-plus","promptTokens":1000,"completionTokens":200,"totalTokens":1200,"promptCacheHitTokens":0,"promptCacheMissTokens":1000}\n\n'
      + 'event: done\ndata: {"type":"done"}\n\n'
  )) as typeof fetch

  try {
    const result = await streamLocalPostgameAi({
      mode: 'review',
      snapshotSchemaVersion: 'postgame.v1',
      snapshot: {}
    }, {
      onUsage: usage => costs.push(usage.cost)
    })

    assert.deepEqual(result, { ok: true })
    assert.deepEqual(costs, [null])
  } finally {
    globalThis.fetch = originalFetch
  }
})
