import test from 'node:test'
import assert from 'node:assert/strict'
import type { GameDetail, MatchHistory } from '../types/api.ts'
import {
  createHomeChartEntries,
  mergeHomeChartDetail,
  runWithConcurrencyLimit
} from './homeChartEntries.ts'

const SELF_PUUID = 'self-puuid'

function createMatch(overrides: Partial<MatchHistory> = {}): MatchHistory {
  return {
    gameId: 1001,
    gameMode: 'CLASSIC',
    gameType: 'MATCHED_GAME',
    queueId: 420,
    queueName: 'Ranked Solo',
    gameDuration: 1800,
    gameCreation: 1710000000000,
    platformId: 'HN1',
    participants: [
      {
        participantId: 1,
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

function createDetail(statsOverrides: Record<string, unknown> = {}): GameDetail {
  return {
    gameId: 1001,
    gameMode: 'CLASSIC',
    gameType: 'MATCHED_GAME',
    mapId: 11,
    queueId: 420,
    gameDuration: 1800,
    gameCreation: 1710000000000,
    participantIdentities: [
      {
        participantId: 1,
        player: {
          accountId: 1,
          puuid: SELF_PUUID,
          platformId: 'HN1',
          summonerName: 'Self',
          gameName: 'Self',
          tagLine: '0001',
          summonerId: 42
        }
      }
    ],
    participants: [
      {
        participantId: 1,
        teamId: 100,
        championId: 103,
        spell1Id: 4,
        spell2Id: 14,
        timeline: {
          lane: 'MIDDLE',
          role: 'SOLO'
        },
        stats: {
          win: true,
          kills: 11,
          deaths: 3,
          assists: 9,
          totalMinionsKilled: 215,
          neutralMinionsKilled: 12,
          goldEarned: 13000,
          totalDamageDealtToChampions: 33000,
          totalDamageTaken: 19000,
          totalHeal: 1300,
          visionWardsBoughtInGame: 1,
          wardsPlaced: 9,
          wardsKilled: 2,
          largestMultiKill: 2,
          doubleKills: 1,
          tripleKills: 0,
          quadraKills: 0,
          pentaKills: 0,
          ...statsOverrides
        }
      }
    ]
  }
}

test('home chart entries skip matches with missing current-player stats instead of displaying fake 0/0/0', () => {
  const entries = createHomeChartEntries([
    createMatch({
      participants: [
        {
          participantId: 1,
          teamId: 100,
          championId: 103,
          spell1Id: 4,
          spell2Id: 14,
          stats: {} as MatchHistory['participants'][number]['stats']
        }
      ]
    })
  ], SELF_PUUID)

  assert.equal(entries.length, 0)
})

test('home chart entries skip short remake-like zero KDA summaries', () => {
  const entries = createHomeChartEntries([
    createMatch({
      gameDuration: 79,
      participants: [
        {
          ...createMatch().participants[0],
          stats: {
            ...createMatch().participants[0].stats,
            win: true,
            kills: 0,
            deaths: 0,
            assists: 0,
            goldEarned: 603,
            totalDamageDealtToChampions: 0
          }
        }
      ]
    })
  ], SELF_PUUID)

  assert.equal(entries.length, 0)
})

test('home chart entries render quality cached matches immediately from summaries', () => {
  const matches = Array.from({ length: 10 }, (_item, index) => createMatch({
    gameId: 1000 + index,
    gameCreation: 1710000000000 + index,
    participants: [
      {
        ...createMatch().participants[0],
        stats: {
          ...createMatch().participants[0].stats,
          kills: index + 1,
          deaths: 2,
          assists: index + 3
        }
      }
    ]
  }))

  const entries = createHomeChartEntries(matches, SELF_PUUID)

  assert.equal(entries.length, 10)
  assert.equal(entries[0]?.kdaText, '10/2/12')
  assert.equal(entries[9]?.kdaText, '1/2/3')
})

test('detail failure or incomplete detail does not replace summary KDA', () => {
  const [entry] = createHomeChartEntries([createMatch()], SELF_PUUID)
  assert.ok(entry)

  const unchanged = mergeHomeChartDetail(entry, createMatch(), {
    ...createDetail(),
    participants: [
      {
        ...createDetail().participants[0],
        stats: {} as GameDetail['participants'][number]['stats']
      }
    ]
  }, SELF_PUUID)

  assert.equal(unchanged.kdaText, '10/2/8')
  assert.equal(unchanged.kills, 10)
  assert.equal(unchanged.deaths, 2)
  assert.equal(unchanged.assists, 8)
})

test('goldDiff15 reads earlyGoldDiff, laneGoldDiff15, and challenge aliases', () => {
  const [early] = createHomeChartEntries([
    createMatch({
      participants: [
        {
          ...createMatch().participants[0],
          stats: {
            ...createMatch().participants[0].stats,
            earlyGoldDiff: 432
          } as MatchHistory['participants'][number]['stats']
        }
      ]
    })
  ], SELF_PUUID)
  const [lane] = createHomeChartEntries([
    createMatch({
      participants: [
        {
          ...createMatch().participants[0],
          stats: {
            ...createMatch().participants[0].stats,
            laneGoldDiff15: -215
          } as MatchHistory['participants'][number]['stats']
        }
      ]
    })
  ], SELF_PUUID)
  const [challenge] = createHomeChartEntries([
    createMatch({
      participants: [
        {
          ...createMatch().participants[0],
          stats: {
            ...createMatch().participants[0].stats,
            challenges: {
              goldDifferenceAt15: 99
            }
          } as MatchHistory['participants'][number]['stats']
        }
      ]
    })
  ], SELF_PUUID)

  assert.equal(early?.goldDiff15, 432)
  assert.equal(lane?.goldDiff15, -215)
  assert.equal(challenge?.goldDiff15, 99)
})

test('mergeHomeChartDetail preserves computed RP index final score for charting', () => {
  const [entry] = createHomeChartEntries([createMatch()], SELF_PUUID)
  assert.ok(entry)

  const enhanced = mergeHomeChartDetail(entry, createMatch(), createDetail(), SELF_PUUID, 7.234)

  assert.equal(enhanced.rpIndex, 7.2)
})

test('detail loading helper limits concurrency and keeps failures isolated', async () => {
  let active = 0
  let maxActive = 0
  const completed: number[] = []

  const results = await runWithConcurrencyLimit([1, 2, 3, 4, 5], 2, async item => {
    active += 1
    maxActive = Math.max(maxActive, active)
    await new Promise(resolve => setTimeout(resolve, 5))
    active -= 1
    if (item === 3) {
      throw new Error('detail failed')
    }
    completed.push(item)
    return item * 2
  })

  assert.equal(maxActive, 2)
  assert.deepEqual(completed.sort((a, b) => a - b), [1, 2, 4, 5])
  assert.deepEqual(results.filter((result): result is number => typeof result === 'number'), [2, 4, 8, 10])
})
