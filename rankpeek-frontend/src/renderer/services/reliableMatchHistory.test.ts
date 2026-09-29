import test from 'node:test'
import assert from 'node:assert/strict'
import type { MatchHistory, MatchHistoryPageResponse, Summoner } from '../types/api.ts'
import type { LocalDatabaseAPI, MatchRecord } from '../types/localDatabase.ts'
import {
  filterReliableMatches,
  loadReliableMatchHistory
} from './reliableMatchHistory.ts'

const SELF_PUUID = 'self-puuid'

const summoner: Summoner = {
  gameName: 'Self',
  tagLine: '0001',
  summonerLevel: 88,
  profileIconId: 1234,
  puuid: SELF_PUUID,
  summonerId: 42
}

function createMatch(index: number, overrides: Partial<MatchHistory> = {}): MatchHistory {
  return {
    gameId: 2000 + index,
    gameMode: 'CLASSIC',
    gameType: 'MATCHED_GAME',
    queueId: 420,
    queueName: 'Ranked Solo',
    gameDuration: 1800,
    gameCreation: 1710000000000 + index,
    platformId: 'HN1',
    participants: [
      {
        participantId: 1,
        teamId: 100,
        championId: 103 + index,
        spell1Id: 4,
        spell2Id: 14,
        stats: {
          win: index % 2 === 0,
          kills: index + 1,
          deaths: 2,
          assists: index + 3,
          goldEarned: 11000 + index,
          totalMinionsKilled: 180 + index,
          neutralMinionsKilled: 6,
          totalDamageDealtToChampions: 22000 + index,
          totalDamageTaken: 17000,
          totalHeal: 900,
          item0: 1056,
          item1: 6655,
          item2: 3020,
          item3: 4645,
          item4: 3135,
          item5: 3089,
          item6: 3364
        }
      }
    ],
    participantIdentities: [
      {
        participantId: 1,
        player: {
          accountId: 1,
          summonerId: 42,
          summonerName: 'Self',
          gameName: 'Self',
          tagLine: '0001',
          puuid: SELF_PUUID,
          platformId: 'HN1'
        }
      }
    ],
    ...overrides
  }
}

function createIncompleteMatch(index: number): MatchHistory {
  return createMatch(index, {
    participants: [
      {
        ...createMatch(index).participants[0],
        stats: {} as MatchHistory['participants'][number]['stats']
      }
    ]
  })
}

function matchRecord(match: MatchHistory): MatchRecord {
  const participant = match.participants[0]
  return {
    id: match.gameId,
    region: match.platformId,
    matchId: String(match.gameId),
    accountPuuid: SELF_PUUID,
    queueId: match.queueId,
    queueName: match.queueName ?? null,
    gameMode: match.gameMode,
    gameVersion: null,
    gameCreation: match.gameCreation,
    gameDuration: match.gameDuration,
    championId: participant.championId,
    win: participant.stats.win,
    kills: participant.stats.kills,
    deaths: participant.stats.deaths,
    assists: participant.stats.assists,
    lane: null,
    role: null,
    rawSummaryJson: JSON.stringify(match),
    fetchedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

function page(matches: MatchHistory[], source = 'sgp'): MatchHistoryPageResponse {
  return {
    matches,
    page: 1,
    pageSize: matches.length,
    hasNext: false,
    source,
    recordStatus: 'NORMAL'
  }
}

function createDatabase(cachedMatches: MatchHistory[]) {
  const writes: unknown[] = []
  const database = {
    listMatchRecordsByAccount: async () => ({
      success: true,
      data: cachedMatches.map(matchRecord)
    }),
    upsertAccount: async account => ({
      success: true,
      data: {
        id: 1,
        region: account.region,
        puuid: account.puuid,
        gameName: account.gameName ?? null,
        tagLine: account.tagLine ?? null,
        summonerName: account.summonerName ?? null,
        displayName: account.displayName ?? null,
        profileIconId: account.profileIconId ?? null,
        summonerLevel: account.summonerLevel ?? null,
        lastSelected: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      }
    }),
    upsertMatchRecords: async records => {
      writes.push(records)
      return {
        success: true,
        data: []
      }
    }
  } satisfies Pick<LocalDatabaseAPI, 'listMatchRecordsByAccount' | 'upsertAccount' | 'upsertMatchRecords'>
  return { database, writes }
}

test('filters reliable matches by queue and quality before charting', () => {
  const matches = [
    createMatch(1, { queueId: 420 }),
    createMatch(2, { queueId: 440 }),
    createIncompleteMatch(3),
    createMatch(4, {
      participants: [
        {
          ...createMatch(4).participants[0],
          championId: 0
        }
      ]
    })
  ]

  const reliable = filterReliableMatches(matches, {
    puuid: SELF_PUUID,
    queueId: 420,
    limit: 50
  })

  assert.deepEqual(reliable.map(match => match.gameId), [2001])
})

test('local cache emits quality matches before remote refresh resolves', async () => {
  const cachedMatches = Array.from({ length: 10 }, (_item, index) => createMatch(index))
  const remoteMatches = Array.from({ length: 10 }, (_item, index) => createMatch(index + 20))
  const { database } = createDatabase(cachedMatches)
  const updates: string[] = []
  let resolveRemote: (value: MatchHistoryPageResponse) => void = () => undefined
  const remotePromise = new Promise<MatchHistoryPageResponse>(resolve => {
    resolveRemote = resolve
  })

  const loadPromise = loadReliableMatchHistory({
    summoner,
    currentPuuid: SELF_PUUID,
    queueId: 420,
    limit: 50,
    minQualityMatches: 10,
    database,
    api: {
      getMatchHistoryPage: async () => remotePromise
    },
    onUpdate: update => updates.push(`${update.source}:${update.matches[0]?.gameId}`)
  })

  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(updates, ['local-cache:2009'])

  resolveRemote(page(remoteMatches))
  await loadPromise
})

test('SGP refresh updates chart data and writes accepted SGP matches to Electron cache', async () => {
  const cachedMatches = Array.from({ length: 10 }, (_item, index) => createMatch(index))
  const sgpMatches = Array.from({ length: 10 }, (_item, index) => createMatch(index + 50))
  const { database, writes } = createDatabase(cachedMatches)
  const updates: string[] = []

  const result = await loadReliableMatchHistory({
    summoner,
    currentPuuid: SELF_PUUID,
    queueId: 420,
    limit: 50,
    minQualityMatches: 10,
    database,
    api: {
      getMatchHistoryPage: async () => page(sgpMatches, 'sgp')
    },
    onUpdate: update => updates.push(`${update.source}:${update.matches[0]?.gameId}`)
  })

  assert.deepEqual(updates, ['local-cache:2009', 'sgp:2059'])
  assert.equal(result.matches[0]?.gameId, 2059)
  assert.equal(writes.length, 1)
})

test('SGP failure falls back to LCU, but half-renderable LCU data does not replace good cache', async () => {
  const cachedMatches = Array.from({ length: 10 }, (_item, index) => createMatch(index))
  const lcuHalfMatches = [
    createMatch(80),
    createIncompleteMatch(81),
    createIncompleteMatch(82)
  ]
  const { database, writes } = createDatabase(cachedMatches)
  const updates: string[] = []
  const requestedSources: string[] = []

  const result = await loadReliableMatchHistory({
    summoner,
    currentPuuid: SELF_PUUID,
    queueId: 420,
    limit: 50,
    minQualityMatches: 10,
    database,
    api: {
      getMatchHistoryPage: async (_puuid, options) => {
        requestedSources.push(options.source ?? 'auto')
        if (options.source === 'lcu') {
          return page(lcuHalfMatches, 'lcu')
        }
        throw new Error('sgp unavailable')
      }
    },
    onUpdate: update => updates.push(`${update.source}:${update.matches[0]?.gameId}`)
  })

  assert.deepEqual(requestedSources, ['sgp', 'lcu', 'sgp'])
  assert.deepEqual(updates, ['local-cache:2009'])
  assert.equal(result.matches[0]?.gameId, 2009)
  assert.equal(writes.length, 0)
})
