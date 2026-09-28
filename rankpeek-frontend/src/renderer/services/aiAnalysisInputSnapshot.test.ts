import test from 'node:test'
import assert from 'node:assert/strict'
import type { LocalDatabaseAPI, MatchDetail, MatchRecord } from '../types/localDatabase.ts'
import {
  buildAccountAnalysisInputSnapshot,
  createInputHash,
  stableStringify,
  type AiAnalysisInputSnapshot
} from './aiAnalysisInputSnapshot.ts'

type SnapshotDatabase = Pick<LocalDatabaseAPI, 'listMatchRecordsByAccount' | 'getMatchDetail'>

async function withMutedWarnings<T>(operation: () => T | Promise<T>): Promise<T> {
  const originalWarn = console.warn
  console.warn = () => undefined
  try {
    return await operation()
  } finally {
    console.warn = originalWarn
  }
}

function makeRecord(overrides: Partial<MatchRecord> = {}): MatchRecord {
  const matchId = overrides.matchId ?? 'match-1'
  const region = overrides.region ?? 'HN1'

  return {
    id: 1,
    region,
    matchId,
    accountPuuid: 'account-puuid',
    queueId: 420,
    queueName: 'Ranked Solo',
    gameMode: 'CLASSIC',
    gameVersion: '15.8',
    gameCreation: 1710000000000,
    gameDuration: 1800,
    championId: 103,
    win: true,
    kills: 10,
    deaths: 2,
    assists: 8,
    lane: null,
    role: null,
    rawSummaryJson: JSON.stringify({
      gameId: Number.parseInt(matchId.replace(/\D/g, ''), 10) || matchId,
      platformId: region,
      queueId: 420,
      queueName: 'Ranked Solo',
      gameMode: 'CLASSIC',
      gameDuration: 1800,
      gameCreation: 1710000000000
    }),
    fetchedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

function makeDetail(overrides: Partial<MatchDetail> = {}): MatchDetail {
  return {
    id: 1,
    region: 'HN1',
    matchId: 'match-1',
    rawDetailJson: JSON.stringify({
      participantIdentities: [
        {
          participantId: 3,
          player: {
            puuid: 'account-puuid'
          }
        }
      ],
      participants: [
        {
          participantId: 3,
          teamId: 100,
          championId: 103,
          stats: {
            totalDamageDealtToChampions: 30000,
            totalDamageTaken: 18000,
            goldEarned: 12000,
            visionWardsBoughtInGame: 2,
            wardsPlaced: 9,
            wardsKilled: 3
          },
          timeline: {
            lane: 'MIDDLE',
            role: 'SOLO'
          }
        },
        {
          participantId: 4,
          teamId: 200,
          championId: 64,
          stats: {}
        }
      ]
    }),
    normalizedDetailJson: null,
    source: 'rankpeek-backend',
    schemaVersion: 1,
    fetchedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

function makeDatabase(records: MatchRecord[], details: MatchDetail[] = []): SnapshotDatabase {
  return {
    listMatchRecordsByAccount: async (_accountPuuid, _options) => ({ success: true, data: records }),
    getMatchDetail: async (region, matchId) => ({
      success: true,
      data: details.find(detail => detail.region === region && detail.matchId === matchId) ?? null
    })
  }
}

test('empty local matches generate a stable empty account snapshot', async () => {
  const calls: unknown[] = []
  const database: SnapshotDatabase = {
    listMatchRecordsByAccount: async (accountPuuid, options) => {
      calls.push({ accountPuuid, options })
      return { success: true, data: [] }
    },
    getMatchDetail: async () => {
      throw new Error('details should not be read without records')
    }
  }

  const snapshot = await buildAccountAnalysisInputSnapshot({
    accountPuuid: 'account-puuid',
    accountDisplayName: 'RankPeek#0001',
    database
  })

  assert.equal(snapshot.schemaVersion, 1)
  assert.equal(snapshot.analysisType, 'account_overview')
  assert.equal(snapshot.accountPuuid, 'account-puuid')
  assert.equal(snapshot.accountDisplayName, 'RankPeek#0001')
  assert.equal(snapshot.source.recordSource, 'local_cache')
  assert.equal(snapshot.source.matchRecordCount, 0)
  assert.equal(snapshot.source.matchDetailCount, 0)
  assert.equal(snapshot.source.requestedLimit, 20)
  assert.equal(snapshot.source.hasEnoughData, false)
  assert.deepEqual(snapshot.aggregate, {
    totalMatches: 0,
    wins: 0,
    losses: 0,
    winRate: null,
    averageKills: null,
    averageDeaths: null,
    averageAssists: null,
    averageKda: null,
    mostPlayedChampions: [],
    queueBreakdown: [],
    recentTrend: {
      last10Wins: 0,
      last10Losses: 0,
      currentStreakType: 'none',
      currentStreakCount: 0
    }
  })
  assert.deepEqual(snapshot.recentMatches, [])
  assert.match(snapshot.inputHash, /^[a-f0-9]{8,}$/)
  assert.deepEqual(calls, [
    {
      accountPuuid: 'account-puuid',
      options: {
        limit: 20,
        offset: 0
      }
    }
  ])
})

test('multiple local matches calculate win rate, averages, champion pool, queues, and cached detail count', async () => {
  const records = [
    makeRecord({ id: 1, matchId: 'match-1', championId: 103, win: true, kills: 10, deaths: 2, assists: 8 }),
    makeRecord({ id: 2, matchId: 'match-2', championId: 103, win: false, kills: 2, deaths: 6, assists: 4 }),
    makeRecord({ id: 3, matchId: 'match-3', queueId: 450, queueName: 'ARAM', championId: 55, win: true, kills: 4, deaths: 0, assists: 6 }),
    makeRecord({ id: 4, matchId: 'match-4', queueId: 450, queueName: 'ARAM', championId: 55, win: null, kills: 1, deaths: 1, assists: 1 })
  ]

  const snapshot = await buildAccountAnalysisInputSnapshot({
    accountPuuid: 'account-puuid',
    limit: 4,
    database: makeDatabase(records, [
      makeDetail({ matchId: 'match-1' }),
      makeDetail({ matchId: 'match-3' })
    ])
  })

  assert.equal(snapshot.source.matchRecordCount, 4)
  assert.equal(snapshot.source.matchDetailCount, 2)
  assert.equal(snapshot.source.hasEnoughData, true)
  assert.equal(snapshot.aggregate.totalMatches, 4)
  assert.equal(snapshot.aggregate.wins, 2)
  assert.equal(snapshot.aggregate.losses, 1)
  assert.equal(snapshot.aggregate.winRate, 0.667)
  assert.equal(snapshot.aggregate.averageKills, 4.25)
  assert.equal(snapshot.aggregate.averageDeaths, 2.25)
  assert.equal(snapshot.aggregate.averageAssists, 4.75)
  assert.equal(snapshot.aggregate.averageKda, 5.5)
  assert.deepEqual(snapshot.aggregate.mostPlayedChampions, [
    { championId: 55, games: 2, wins: 1, losses: 0, winRate: 1 },
    { championId: 103, games: 2, wins: 1, losses: 1, winRate: 0.5 }
  ])
  assert.deepEqual(snapshot.aggregate.queueBreakdown, [
    { queueId: 420, queueName: 'Ranked Solo', games: 2, wins: 1, losses: 1, winRate: 0.5 },
    { queueId: 450, queueName: 'ARAM', games: 2, wins: 1, losses: 0, winRate: 1 }
  ])
  assert.equal(snapshot.recentMatches[2]?.kda, 10)
})

test('recent trend uses the latest ten matches and current known streak', async () => {
  const outcomes = [true, true, true, false, true, null, false, false, true, true, false]
  const records = outcomes.map((win, index) => makeRecord({
    id: index + 1,
    matchId: `match-${index + 1}`,
    win,
    kills: 1,
    deaths: 1,
    assists: 1
  }))

  const snapshot = await buildAccountAnalysisInputSnapshot({
    accountPuuid: 'account-puuid',
    limit: 11,
    database: makeDatabase(records)
  })

  assert.deepEqual(snapshot.aggregate.recentTrend, {
    last10Wins: 6,
    last10Losses: 3,
    currentStreakType: 'win',
    currentStreakCount: 3
  })
})

test('malformed summary and detail JSON do not throw or block normalized record fields', async () => {
  const snapshot = await withMutedWarnings(() => buildAccountAnalysisInputSnapshot({
    accountPuuid: 'account-puuid',
    database: makeDatabase(
      [
        makeRecord({
          matchId: 'bad-summary',
          rawSummaryJson: '{bad-json',
          championId: 99,
          win: true,
          kills: 7,
          deaths: 0,
          assists: 3
        })
      ],
      [
        makeDetail({
          matchId: 'bad-summary',
          rawDetailJson: '{bad-json'
        })
      ]
    )
  }))

  assert.equal(snapshot.source.matchRecordCount, 1)
  assert.equal(snapshot.source.matchDetailCount, 0)
  assert.equal(snapshot.aggregate.wins, 1)
  assert.equal(snapshot.aggregate.averageKda, 10)
  assert.equal(snapshot.recentMatches[0]?.championId, 99)
})

test('input hash is stable, ignores builtAt and inputHash, and uses key-order independent JSON', async () => {
  assert.equal(
    stableStringify({ z: 1, a: { b: 2, c: 3 } }),
    stableStringify({ a: { c: 3, b: 2 }, z: 1 })
  )

  const database = makeDatabase([
    makeRecord({ matchId: 'match-1', win: true }),
    makeRecord({ matchId: 'match-2', win: false })
  ])

  const snapshot = await buildAccountAnalysisInputSnapshot({
    accountPuuid: 'account-puuid',
    database
  })
  const changedTimestamps: AiAnalysisInputSnapshot = {
    ...snapshot,
    builtAt: '2099-01-01T00:00:00.000Z',
    inputHash: 'different'
  }

  assert.equal(snapshot.inputHash, createInputHash(changedTimestamps))
})

test('missing account puuid rejects before reading the local database', async () => {
  let called = false
  const database: SnapshotDatabase = {
    listMatchRecordsByAccount: async () => {
      called = true
      return { success: true, data: [] }
    },
    getMatchDetail: async () => ({ success: true, data: null })
  }

  await assert.rejects(
    buildAccountAnalysisInputSnapshot({
      accountPuuid: '   ',
      database
    }),
    /accountPuuid is required/
  )
  assert.equal(called, false)
})
