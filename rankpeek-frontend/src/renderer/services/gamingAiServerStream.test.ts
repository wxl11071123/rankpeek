import test from 'node:test'
import assert from 'node:assert/strict'
import type { GamingAiInputSnapshot, GamingAiTeamSnapshot } from './gamingAiInputSnapshot.ts'
import {
  createGamingAiStreamRequest,
  flattenGamingAiSnapshotTags,
  RANKPEEK_SERVER_GAMING_STREAM_ENDPOINT,
  streamGamingAiAnalysis
} from './gamingAiServerStream.ts'
import {
  RANKPEEK_LOCAL_PREGAME_STREAM_ENDPOINT
} from './localAiStreamClient.ts'
import { RANKPEEK_LOCAL_SERVICE_BASE_URL } from './rankpeekLocalServiceClient.ts'

function createSnapshot(): GamingAiInputSnapshot {
  const teammateSnapshot: GamingAiTeamSnapshot = {
    schemaVersion: 'gaming_ai_team_snapshot.v1',
    side: 'ally',
    text: 'ally summary',
    players: [
      {
        key: 'puuid:ally',
        isSelf: true,
        summaryLine: 'ally player line'
      }
    ]
  }
  const opponentSnapshot: GamingAiTeamSnapshot = {
    schemaVersion: 'gaming_ai_team_snapshot.v1',
    side: 'enemy',
    text: 'enemy summary',
    players: [
      {
        key: 'name:enemy',
        isSelf: false,
        summaryLine: 'enemy player line'
      }
    ]
  }

  return {
    schemaVersion: 'gaming_ai_input_snapshot.v2',
    mode: 'teammate',
    generatedAt: '2026-05-13T00:00:00.000Z',
    phase: 'ChampSelect',
    queueId: 420,
    queueName: 'Ranked Solo',
    teammateSnapshot,
    opponentSnapshot
  }
}

test('flattens gaming AI snapshot player tags into compact team strings', () => {
  const flattened = flattenGamingAiSnapshotTags(createSnapshot())

  assert.deepEqual(flattened, {
    allyTeamTags: ['ally summary'],
    enemyTeamTags: []
  })
})

test('flattens opponent mode to enemy snapshot only', () => {
  const snapshot = { ...createSnapshot(), mode: 'opponent' as const }
  const flattened = flattenGamingAiSnapshotTags(snapshot)

  assert.deepEqual(flattened, {
    allyTeamTags: [],
    enemyTeamTags: ['enemy summary']
  })
})

test('creates a local pregame stream request that carries mode, schema, snapshots, and flattened tags', () => {
  const snapshot = createSnapshot()
  const request = createGamingAiStreamRequest(snapshot)

  assert.equal(request.mode, 'teammate')
  assert.equal(request.snapshotSchemaVersion, 'gaming_ai_input_snapshot.v2')
  assert.equal(request.snapshot, snapshot)
  assert.deepEqual(request.allyTeamTags, ['ally summary'])
  assert.deepEqual(request.enemyTeamTags, [])
})

test('streamGamingAiAnalysis delegates to local pregame stream without Authorization', async () => {
  const request = createGamingAiStreamRequest(createSnapshot())
  const events: string[] = []
  const deltas: string[] = []
  const verdicts: Array<{ playerKey: string; label: string; tone?: string; reason?: string }> = []
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(url), `${RANKPEEK_LOCAL_SERVICE_BASE_URL}${RANKPEEK_LOCAL_PREGAME_STREAM_ENDPOINT}`)
    assert.equal(RANKPEEK_SERVER_GAMING_STREAM_ENDPOINT, RANKPEEK_LOCAL_PREGAME_STREAM_ENDPOINT)
    assert.equal(init?.method, 'POST')
    assert.deepEqual(init?.headers, { 'Content-Type': 'application/json' })
    assert.equal(JSON.parse(String(init?.body)).snapshotSchemaVersion, 'gaming_ai_input_snapshot.v2')

    const encoder = new TextEncoder()
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('event: start\ndata: {"title":"local"}\n\n'))
        controller.enqueue(encoder.encode('event: delta\ndata: first\n\n'))
        controller.enqueue(encoder.encode('event: player_verdict\ndata: {"playerKey":"puuid:ally","label":"stable teammate","tone":"stable","reason":"local stream"}\n\n'))
        controller.enqueue(encoder.encode('event: done\ndata: {"type":"done"}\n\n'))
        controller.close()
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' }
    })
  }) as typeof fetch

  try {
    const result = await streamGamingAiAnalysis(request, {
      onEvent: event => {
        events.push(event.type)
        if (event.type === 'player_verdict') {
          verdicts.push(event)
        }
      },
      onDelta: text => deltas.push(text)
    })

    assert.deepEqual(result, { ok: true })
    assert.deepEqual(events, ['start', 'delta', 'player_verdict', 'done'])
    assert.deepEqual(deltas, ['first'])
    assert.deepEqual(verdicts, [{
      playerKey: 'puuid:ally',
      label: 'stable teammate',
      tone: 'stable',
      reason: 'local stream'
    }])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('streamGamingAiAnalysis returns failed result when local backend is unavailable', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    throw new TypeError('fetch failed')
  }) as typeof fetch

  try {
    const result = await streamGamingAiAnalysis(createGamingAiStreamRequest(createSnapshot()), {})

    assert.equal(result.ok, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})
