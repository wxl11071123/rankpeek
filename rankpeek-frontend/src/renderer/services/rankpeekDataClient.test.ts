import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  checkRankPeekDataDiagnostics,
  getLatestChampionMeta,
  getOpggChampionDetail,
  getOpggChampionList,
  normalizeRankPeekDataBaseUrl,
  RANKPEEK_DATA_API_BASE_URL,
  RANKPEEK_DATA_DIAGNOSTICS_ENDPOINT
} from './rankpeekDataClient.ts'

const rendererRootPath = fileURLToPath(new URL('..', import.meta.url))
const textFileExtensions = new Set(['.js', '.json', '.mjs', '.ts', '.tsx', '.vue'])

function listRendererTextFiles(directoryPath: string): string[] {
  return readdirSync(directoryPath)
    .flatMap((entryName) => {
      const entryPath = join(directoryPath, entryName)
      const stats = statSync(entryPath)
      if (stats.isDirectory()) {
        return listRendererTextFiles(entryPath)
      }
      return textFileExtensions.has(extname(entryPath)) ? [entryPath] : []
    })
}

test('uses the local backend endpoint by default', () => {
  assert.equal(RANKPEEK_DATA_API_BASE_URL, 'http://127.0.0.1:8080')
})

test('normalizes configured local backend base URLs', () => {
  assert.equal(normalizeRankPeekDataBaseUrl(' http://127.0.0.1:8080/ '), 'http://127.0.0.1:8080')
  assert.equal(normalizeRankPeekDataBaseUrl('http://localhost:8080///'), 'http://localhost:8080')
  assert.equal(normalizeRankPeekDataBaseUrl(''), 'http://127.0.0.1:8080')
})

test('checks local backend diagnostics through the configured endpoint', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify({
      code: 200,
      message: 'success',
      data: {
        pid: 1234,
        localDataRoot: 'C:/Users/example/AppData/Local/RankPeek-dev',
        cacheDatabasePath: 'C:/Users/example/AppData/Local/RankPeek-dev/cache',
        startedAt: '2026-05-31T00:00:00Z',
        instanceId: 'dev'
      },
      error: null
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }) as typeof fetch

  try {
    const result = await checkRankPeekDataDiagnostics()

    assert.deepEqual(result, {
      available: true,
      service: 'rankpeek-backend',
      mode: 'local',
      version: 'unknown'
    })
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.url, `${RANKPEEK_DATA_API_BASE_URL}${RANKPEEK_DATA_DIAGNOSTICS_ENDPOINT}`)
    assert.equal(calls[0]?.init?.method, 'GET')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('diagnostics check returns unavailable instead of throwing', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    throw new TypeError('fetch failed')
  }) as typeof fetch

  try {
    const result = await checkRankPeekDataDiagnostics()

    assert.equal(result.available, false)
    assert.match(result.available ? '' : result.message, /rankpeek local backend/)
    assert.match(result.available ? '' : result.message, /127\.0\.0\.1:8080/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('diagnostics check treats invalid diagnostics payloads as unavailable', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response('not-json', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' }
  })) as typeof fetch

  try {
    const result = await checkRankPeekDataDiagnostics()

    assert.equal(result.available, false)
    assert.match(result.available ? '' : result.message, /rankpeek local backend/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('renderer source keeps cloud account and credit clients removed while allowing the narrow cloud bridge', () => {
  const forbiddenPatterns = [
    new RegExp(['rankpeek', 'AuthClient'].join('')),
    new RegExp(['rankpeek', 'CreditsClient'].join(''))
  ]
  const cloudApiHostPattern = new RegExp(['api', 'rankpeek', 'cn'].join('\\.'))
  const allowedCloudBridgeFiles = new Set([
    'services\\rankpeekCloudClient.ts',
    'services\\rankpeekCloudClient.test.ts'
  ])

  for (const filePath of listRendererTextFiles(rendererRootPath)) {
    const source = readFileSync(filePath, 'utf8')
    const label = relative(rendererRootPath, filePath)
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${label} should not match ${pattern}`)
    }
    if (!allowedCloudBridgeFiles.has(label)) {
      assert.doesNotMatch(source, cloudApiHostPattern, `${label} should not call the public cloud API directly`)
    }
  }
})

test('does not keep empty 101 champion meta responses in cache', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    const payload = calls.length === 1
      ? { success: true, data: [], error: null }
      : {
          success: true,
          data: [{
            tierScope: 'PLATINUM',
            championId: 777001,
            avgKda: 2.5,
            avgGold: 12000,
            avgDamage: 25000
          }],
          error: null
        }
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }) as typeof fetch

  try {
    assert.equal(await getLatestChampionMeta(777001, 'platinum'), null)
    const meta = await getLatestChampionMeta(777001, 'platinum')

    assert.equal(calls.length, 2)
    assert.equal(meta?.championId, 777001)
    assert.equal(meta?.avgKda, 2.5)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('fetches OP.GG champion detail through local backend with encoded filters', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify({
      success: true,
      data: {
        championId: 103,
        championName: 'Ahri',
        mode: 'ranked',
        region: 'kr',
        tier: 'emerald_plus',
        position: 'mid',
        version: '16.10',
        updatedAt: '2026-05-23T04:00:00Z',
        stats: { games: 1000, winRate: 0.51, pickRate: 0.12, banRate: 0.03, kda: 2.6 },
        summonerSpells: [{ label: 'spells', ids: [4, 12], games: 100, winRate: 0.52, pickRate: 0.6 }],
        runes: [],
        skillOrders: [],
        starterItems: [],
        boots: [],
        coreItems: []
      },
      error: null
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }) as typeof fetch

  try {
    const detail = await getOpggChampionDetail({
      championId: 103,
      mode: 'ranked',
      region: 'kr',
      tier: 'emerald_plus',
      position: 'mid'
    })

    assert.equal(detail?.championId, 103)
    assert.equal(detail?.stats.winRate, 0.51)
    assert.deepEqual(detail?.summonerSpells[0]?.ids, [4, 12])
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.url, `${RANKPEEK_DATA_API_BASE_URL}/api/v1/opgg/champions/103/detail?mode=ranked&region=kr&tier=emerald_plus&position=mid`)
    assert.equal(calls[0]?.init?.method, 'GET')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('OP.GG champion detail failures throw and do not return fake data', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify({
    success: false,
    data: null,
    error: { message: 'OP.GG source failed' }
  }), {
    status: 502,
    headers: { 'Content-Type': 'application/json' }
  })) as typeof fetch

  try {
    await assert.rejects(
      () => getOpggChampionDetail({
        championId: 103,
        mode: 'ranked',
        region: 'kr',
        tier: 'emerald_plus',
        position: 'mid'
      }),
      /OP\.GG source failed/
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('fetches OP.GG champion list through local backend without selecting a champion', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify({
      success: true,
      data: {
        mode: 'ranked',
        region: 'kr',
        tier: 'emerald_plus',
        version: '16.10',
        updatedAt: '2026-05-23T04:00:00Z',
        items: [
          {
            championId: 103,
            tier: 1,
            rank: 7,
            stats: { games: 0, winRate: 0.51, pickRate: 0.12, banRate: 0.03, kda: 2.6 },
            positions: [
              {
                position: 'mid',
                tier: 0,
                rank: 2,
                stats: { games: 0, winRate: 0.50, pickRate: 0.10, banRate: 0.03, kda: 2.5 },
                counters: [{ championId: 238, games: 1200, wins: 590 }]
              }
            ]
          }
        ]
      },
      error: null
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }) as typeof fetch

  try {
    const list = await getOpggChampionList({
      mode: 'ranked',
      region: 'kr',
      tier: 'emerald_plus'
    })

    assert.equal(list?.items[0]?.championId, 103)
    assert.equal(list?.items[0]?.positions[0]?.counters[0]?.championId, 238)
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.url, `${RANKPEEK_DATA_API_BASE_URL}/api/v1/opgg/champions?mode=ranked&region=kr&tier=emerald_plus`)
    assert.equal(calls[0]?.init?.method, 'GET')
  } finally {
    globalThis.fetch = originalFetch
  }
})
