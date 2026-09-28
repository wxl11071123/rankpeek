import test from 'node:test'
import assert from 'node:assert/strict'
import type {
  LocalDatabaseAPI,
  MatchDetail,
  MatchDetailInput,
  MatchRecord,
  MatchRecordInput,
  SummonerAccount
} from '../types/localDatabase.ts'
import type { GameDetail, MatchHistory, Summoner } from '../types/api.ts'
import {
  loadMatchDetailFromLocalCache,
  matchDetailRecordToGameDetail,
  matchRecordToMatchHistory,
  persistMatchDetailToLocalCache,
  readMatchHistoryFromLocalCache,
  toMatchDetailCacheKey,
  toMatchDetailInput,
  toMatchRecordInput,
  writeMatchHistoryToLocalCache
} from './localMatchCache.ts'

async function withMutedWarnings<T>(operation: () => T | Promise<T>): Promise<T> {
  const originalWarn = console.warn
  console.warn = () => undefined
  try {
    return await operation()
  } finally {
    console.warn = originalWarn
  }
}

const summoner: Summoner = {
  gameName: 'RankPeekTest',
  tagLine: '0001',
  summonerLevel: 88,
  profileIconId: 1234,
  puuid: 'test-puuid',
  summonerId: 42
}

const cachedAccount: SummonerAccount = {
  id: 1,
  region: 'UNKNOWN',
  puuid: 'test-puuid',
  gameName: 'RankPeekTest',
  tagLine: '0001',
  summonerName: 'RankPeekTest',
  displayName: 'RankPeekTest#0001',
  profileIconId: 1234,
  summonerLevel: 88,
  lastSelected: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
}

const match: MatchHistory = {
  gameId: 998877,
  gameMode: 'CLASSIC',
  gameType: 'MATCHED_GAME',
  queueId: 420,
  queueName: 'Ranked Solo',
  gameDuration: 1800,
  gameCreation: 1710000000000,
  platformId: 'HN1',
  participantIdentities: [
    {
      participantId: 3,
      player: {
        accountId: 1,
        summonerId: 42,
        summonerName: 'RankPeekTest',
        gameName: 'RankPeekTest',
        tagLine: '0001',
        puuid: 'test-puuid',
        platformId: 'HN1'
      }
    }
  ],
  participants: [
    {
      participantId: 3,
      teamId: 100,
      championId: 103,
      spell1Id: 4,
      spell2Id: 14,
      stats: {
        win: true,
        kills: 10,
        deaths: 2,
        assists: 8,
        goldEarned: 12345,
        totalMinionsKilled: 210,
        neutralMinionsKilled: 12,
        totalDamageDealtToChampions: 30123,
        totalDamageTaken: 18000,
        totalHeal: 1200,
        doubleKills: 2,
        tripleKills: 1,
        quadraKills: 0,
        pentaKills: 0,
        largestKillingSpree: 9,
        legendaryCount: 1,
        perk0: 8010,
        playerAugment1: 10001,
        playerAugment2: 10002,
        playerAugment3: 10003,
        playerAugment4: 10004,
        item0: 1056,
        item1: 6655,
        item2: 3020,
        item3: 4645,
        item4: 3135,
        item5: 3089,
        item6: 3364
      }
    }
  ]
}

const gameDetail: GameDetail = {
  gameId: 998877,
  gameMode: 'CLASSIC',
  gameType: 'MATCHED_GAME',
  mapId: 11,
  queueId: 420,
  gameDuration: 1800,
  gameCreation: 1710000000000,
  participantIdentities: [],
  participants: [],
  teamObjectives: [
    {
      teamId: 100,
      bans: [56, 84],
      baronKills: 1,
      dragonKills: 2,
      elderDragonKills: 0,
      dragonKillsByType: {}
    }
  ]
}

test('maps backend match history into match_records payload with current participant stats', () => {
  const record = toMatchRecordInput(match, {
    accountPuuid: 'test-puuid',
    fallbackRegion: 'UNKNOWN'
  })

  assert.deepEqual(record, {
    region: 'HN1',
    matchId: '998877',
    accountPuuid: 'test-puuid',
    queueId: 420,
    queueName: 'Ranked Solo',
    gameMode: 'CLASSIC',
    gameVersion: null,
    gameCreation: 1710000000000,
    gameDuration: 1800,
    championId: 103,
    win: true,
    kills: 10,
    deaths: 2,
    assists: 8,
    goldEarned: 12345,
    totalDamageDealtToChampions: 30123,
    doubleKills: 2,
    tripleKills: 1,
    quadraKills: 0,
    pentaKills: 0,
    largestKillingSpree: 9,
    legendaryCount: 1,
    spell1Id: 4,
    spell2Id: 14,
    perk0: 8010,
    playerAugment1: 10001,
    playerAugment2: 10002,
    playerAugment3: 10003,
    playerAugment4: 10004,
    lane: null,
    role: null,
    rawSummaryJson: match
  })
})

test('reads cached match records, skips malformed JSON, and preserves list query options', async () => {
  const calls: unknown[] = []
  const database = {
    listMatchRecordsByAccount: async (accountPuuid: string, options: unknown) => {
      calls.push({ accountPuuid, options })
      return {
        success: true,
        data: [
          {
            id: 1,
            region: 'HN1',
            matchId: '998877',
            accountPuuid,
            queueId: 420,
            queueName: 'Ranked Solo',
            gameMode: 'CLASSIC',
            gameVersion: null,
            gameCreation: 1710000000000,
            gameDuration: 1800,
            championId: 103,
            win: true,
            kills: 10,
            deaths: 2,
            assists: 8,
            lane: null,
            role: null,
            rawSummaryJson: JSON.stringify(match),
            fetchedAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z'
          },
          {
            id: 2,
            region: 'HN1',
            matchId: 'bad',
            accountPuuid,
            queueId: 420,
            queueName: null,
            gameMode: null,
            gameVersion: null,
            gameCreation: null,
            gameDuration: null,
            championId: null,
            win: null,
            kills: null,
            deaths: null,
            assists: null,
            lane: null,
            role: null,
            rawSummaryJson: '{bad-json',
            fetchedAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z'
          }
        ]
      }
    }
  } as Pick<LocalDatabaseAPI, 'listMatchRecordsByAccount'>

  const cached = await withMutedWarnings(() => readMatchHistoryFromLocalCache({
    accountPuuid: 'test-puuid',
    options: {
      limit: 20,
      offset: 0,
      queueId: 420,
      championId: 103
    },
    database
  }))

  assert.equal(cached.length, 1)
  assert.equal(cached[0]?.gameId, match.gameId)
  assert.deepEqual(calls, [
    {
      accountPuuid: 'test-puuid',
      options: {
        limit: 20,
        offset: 0,
        queueId: 420,
        championId: 103
      }
    }
  ])
})

test('writes current summoner account and match records without requiring a match platform id', async () => {
  const accountPayloads: unknown[] = []
  const recordPayloads: MatchRecordInput[][] = []
  const matchWithoutRegion = {
    ...match,
    platformId: ''
  }
  const database = {
    upsertAccount: async (account: unknown) => {
      accountPayloads.push(account)
      return { success: true, data: cachedAccount }
    },
    upsertMatchRecords: async (records: MatchRecordInput[]) => {
      recordPayloads.push(records)
      return { success: true, data: [] }
    }
  } as Pick<LocalDatabaseAPI, 'upsertAccount' | 'upsertMatchRecords'>

  await writeMatchHistoryToLocalCache({
    summoner,
    matches: [matchWithoutRegion],
    database
  })

  assert.deepEqual(accountPayloads[0], {
    region: 'UNKNOWN',
    puuid: 'test-puuid',
    gameName: 'RankPeekTest',
    tagLine: '0001',
    summonerName: 'RankPeekTest',
    displayName: 'RankPeekTest#0001',
    profileIconId: 1234,
    summonerLevel: 88
  })
  assert.equal(recordPayloads[0]?.[0]?.region, 'UNKNOWN')
  assert.equal(recordPayloads[0]?.[0]?.matchId, '998877')
})

test('returns null for a cached record with unparsable raw summary JSON', async () => {
  const parsed = await withMutedWarnings(() => matchRecordToMatchHistory({
    id: 1,
    region: 'HN1',
    matchId: 'bad',
    accountPuuid: 'test-puuid',
    queueId: null,
    queueName: null,
    gameMode: null,
    gameVersion: null,
    gameCreation: null,
    gameDuration: null,
    championId: null,
    win: null,
    kills: null,
    deaths: null,
    assists: null,
    lane: null,
    role: null,
    rawSummaryJson: '{bad-json',
    fetchedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }))

  assert.equal(parsed, null)
})

test('restores the cached current player identity and stats from match record columns', () => {
  const rawSummaryMissingCurrentPlayer = {
    ...match,
    participantIdentities: [],
    participants: [
      {
        ...match.participants[0],
        stats: {
          ...match.participants[0]?.stats,
          win: false,
          kills: 0,
          deaths: 0,
          assists: 0
        }
      }
    ]
  }
  const record = {
    id: 1,
    region: 'HN1',
    matchId: '998877',
    accountPuuid: 'test-puuid',
    queueId: 420,
    queueName: 'Ranked Solo',
    gameMode: 'CLASSIC',
    gameVersion: null,
    gameCreation: 1710000000000,
    gameDuration: 1800,
    championId: 103,
    win: true,
    kills: 10,
    deaths: 2,
    assists: 8,
    lane: null,
    role: null,
    rawSummaryJson: JSON.stringify(rawSummaryMissingCurrentPlayer),
    fetchedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  } satisfies MatchRecord

  const restored = matchRecordToMatchHistory(record)
  const identity = restored?.participantIdentities.find(item => item.player?.puuid === 'test-puuid')
  const participant = restored?.participants.find(item => item.participantId === identity?.participantId)

  assert.ok(identity)
  assert.ok(participant)
  assert.equal(participant.championId, 103)
  assert.deepEqual({
    win: participant.stats.win,
    kills: participant.stats.kills,
    deaths: participant.stats.deaths,
    assists: participant.stats.assists
  }, {
    win: true,
    kills: 10,
    deaths: 2,
    assists: 8
  })
})

test('restores cached loadout and performance stats from match record columns', () => {
  const rawSummaryMissingEnhancedStats = {
    ...match,
    participantIdentities: [],
    participants: [
      {
        ...match.participants[0],
        spell1Id: 0,
        spell2Id: 0,
        stats: {
          win: false,
          kills: 0,
          deaths: 0,
          assists: 0
        }
      }
    ]
  }
  const record = {
    id: 1,
    region: 'HN1',
    matchId: '998877',
    accountPuuid: 'test-puuid',
    queueId: 420,
    queueName: 'Ranked Solo',
    gameMode: 'CLASSIC',
    gameVersion: null,
    gameCreation: 1710000000000,
    gameDuration: 1800,
    championId: 103,
    win: true,
    kills: 10,
    deaths: 2,
    assists: 8,
    goldEarned: 12345,
    totalDamageDealtToChampions: 30123,
    doubleKills: 2,
    tripleKills: 1,
    quadraKills: 0,
    pentaKills: 0,
    largestKillingSpree: 9,
    legendaryCount: 1,
    spell1Id: 4,
    spell2Id: 14,
    perk0: 8010,
    playerAugment1: 10001,
    playerAugment2: 10002,
    playerAugment3: 10003,
    playerAugment4: 10004,
    lane: null,
    role: null,
    rawSummaryJson: JSON.stringify(rawSummaryMissingEnhancedStats),
    fetchedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  } as unknown as MatchRecord

  const restored = matchRecordToMatchHistory(record)
  const identity = restored?.participantIdentities.find(item => item.player?.puuid === 'test-puuid')
  const participant = restored?.participants.find(item => item.participantId === identity?.participantId)

  assert.ok(participant)
  assert.equal(participant.spell1Id, 4)
  assert.equal(participant.spell2Id, 14)
  assert.deepEqual({
    goldEarned: participant.stats.goldEarned,
    totalDamageDealtToChampions: participant.stats.totalDamageDealtToChampions,
    doubleKills: participant.stats.doubleKills,
    tripleKills: participant.stats.tripleKills,
    quadraKills: participant.stats.quadraKills,
    pentaKills: participant.stats.pentaKills,
    largestKillingSpree: participant.stats.largestKillingSpree,
    legendaryCount: participant.stats.legendaryCount,
    perk0: participant.stats.perk0,
    playerAugment1: participant.stats.playerAugment1,
    playerAugment2: participant.stats.playerAugment2,
    playerAugment3: participant.stats.playerAugment3,
    playerAugment4: participant.stats.playerAugment4
  }, {
    goldEarned: 12345,
    totalDamageDealtToChampions: 30123,
    doubleKills: 2,
    tripleKills: 1,
    quadraKills: 0,
    pentaKills: 0,
    largestKillingSpree: 9,
    legendaryCount: 1,
    perk0: 8010,
    playerAugment1: 10001,
    playerAugment2: 10002,
    playerAugment3: 10003,
    playerAugment4: 10004
  })
})

test('does not restore incomplete cached match records as fake zero stat losses', () => {
  const rawSummaryMissingStats = {
    ...match,
    participants: [
      {
        ...match.participants[0],
        championId: 103,
        stats: {}
      }
    ]
  }
  const record = {
    id: 1,
    region: 'HN1',
    matchId: '998877',
    accountPuuid: 'test-puuid',
    queueId: 420,
    queueName: 'Ranked Solo',
    gameMode: 'CLASSIC',
    gameVersion: null,
    gameCreation: 1710000000000,
    gameDuration: 1800,
    championId: 103,
    win: null,
    kills: null,
    deaths: null,
    assists: null,
    lane: null,
    role: null,
    rawSummaryJson: JSON.stringify(rawSummaryMissingStats),
    fetchedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  } satisfies MatchRecord

  const restored = matchRecordToMatchHistory(record)

  assert.equal(restored, null)
})

test('maps backend game detail into match_details payload', () => {
  const detail = toMatchDetailInput(match, gameDetail, {
    fallbackRegion: 'UNKNOWN'
  })

  assert.deepEqual(detail, {
    region: 'HN1',
    matchId: '998877',
    rawDetailJson: gameDetail,
    normalizedDetailJson: null,
    source: 'rankpeek-backend',
    schemaVersion: 1
  })
})

test('reads cached match detail and restores raw detail JSON', async () => {
  const calls: unknown[] = []
  const database = {
    getMatchDetail: async (region: string, matchId: string) => {
      calls.push({ region, matchId })
      return {
        success: true,
        data: {
          id: 1,
          region,
          matchId,
          rawDetailJson: JSON.stringify(gameDetail),
          normalizedDetailJson: null,
          source: 'rankpeek-backend',
          schemaVersion: 1,
          fetchedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        } satisfies MatchDetail
      }
    }
  } as Pick<LocalDatabaseAPI, 'getMatchDetail'>

  const cached = await loadMatchDetailFromLocalCache({
    ...toMatchDetailCacheKey(match, {
      fallbackRegion: 'UNKNOWN'
    }),
    database
  })

  assert.deepEqual(cached, gameDetail)
  assert.deepEqual(calls, [
    {
      region: 'HN1',
      matchId: '998877'
    }
  ])
})

test('returns null for a cached detail with unparsable raw detail JSON', async () => {
  const parsed = await withMutedWarnings(() => matchDetailRecordToGameDetail({
    id: 1,
    region: 'HN1',
    matchId: 'bad',
    rawDetailJson: '{bad-json',
    normalizedDetailJson: null,
    source: 'rankpeek-backend',
    schemaVersion: 1,
    fetchedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }))

  assert.equal(parsed, null)
})

test('writes match detail cache with UNKNOWN fallback region and string match id', async () => {
  const payloads: MatchDetailInput[] = []
  const matchWithoutRegion = {
    ...match,
    platformId: ''
  }
  const database = {
    upsertMatchDetail: async (detail: MatchDetailInput) => {
      payloads.push(detail)
      return {
        success: true,
        data: {
          id: 1,
          region: detail.region,
          matchId: detail.matchId,
          rawDetailJson: JSON.stringify(detail.rawDetailJson),
          normalizedDetailJson: null,
          source: detail.source ?? null,
          schemaVersion: detail.schemaVersion ?? 1,
          fetchedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      }
    }
  } as Pick<LocalDatabaseAPI, 'upsertMatchDetail'>

  const written = await persistMatchDetailToLocalCache({
    match: matchWithoutRegion,
    gameDetail,
    database
  })

  assert.equal(written, true)
  assert.equal(payloads[0]?.region, 'UNKNOWN')
  assert.equal(payloads[0]?.matchId, '998877')
  assert.deepEqual(payloads[0]?.rawDetailJson, gameDetail)
})
