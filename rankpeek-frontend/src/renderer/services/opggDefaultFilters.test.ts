import test from 'node:test'
import assert from 'node:assert/strict'
import type { MatchHistory, MatchHistoryPageResponse, QueueInfo, Rank, Summoner } from '../types/api.ts'
import {
  DEFAULT_OPGG_POSITION,
  resolveDefaultOpggPosition,
  resolveDefaultOpggTier,
  resolveParticipantOpggPosition
} from './opggDefaultFilters.ts'
import type { ReliableMatchHistoryApi } from './reliableMatchHistory.ts'

function queueInfo(queueType: string, tier: string): QueueInfo {
  return {
    queueType,
    tier,
    division: 'II',
    leaguePoints: 50,
    wins: 30,
    losses: 20,
    highestTier: tier,
    highestDivision: 'II',
    isProvisional: false
  }
}

function rank(soloTier: string, flexTier = 'PLATINUM'): Rank {
  return {
    queueMap: {
      RANKED_SOLO_5x5: queueInfo('RANKED_SOLO_5x5', soloTier),
      RANKED_FLEX_SR: queueInfo('RANKED_FLEX_SR', flexTier)
    }
  }
}

function summoner(): Summoner {
  return {
    gameName: 'Self',
    tagLine: '58092',
    summonerLevel: 300,
    profileIconId: 1,
    puuid: 'self-puuid',
    summonerId: 1
  }
}

function match(
  index: number,
  queueId: number,
  fields: {
    teamPosition?: string
    individualPosition?: string
    selectedPosition?: string
    lane?: string
    role?: string
  }
): MatchHistory {
  return {
    gameId: index,
    gameMode: 'CLASSIC',
    gameType: 'MATCHED_GAME',
    queueId,
    gameDuration: 1800,
    gameCreation: 1_000_000 - index,
    platformId: 'HN1',
    participants: [
      {
        participantId: 1,
        teamId: 100,
        championId: 103,
        spell1Id: 4,
        spell2Id: 14,
        ...fields,
        stats: {
          win: true,
          kills: 5,
          deaths: 3,
          assists: 7,
          goldEarned: 12000,
          totalMinionsKilled: 160,
          neutralMinionsKilled: 12,
          totalDamageDealtToChampions: 18000,
          totalDamageTaken: 22000,
          totalHeal: 1000,
          item0: 1055,
          item1: 3006,
          item2: 6672,
          item3: 3031,
          item4: 0,
          item5: 0,
          item6: 3363
        }
      }
    ],
    participantIdentities: [
      {
        participantId: 1,
        player: {
          accountId: 1,
          summonerId: 1,
          summonerName: 'Self',
          gameName: 'Self',
          tagLine: '58092',
          puuid: 'self-puuid',
          platformId: 'HN1'
        }
      }
    ]
  }
}

function response(matches: MatchHistory[]): MatchHistoryPageResponse {
  return {
    matches,
    page: 1,
    pageSize: 50,
    hasNext: false,
    source: 'sgp',
    recordStatus: 'NORMAL'
  }
}

test('default OP.GG tier uses current queue rank first and falls back to solo rank', () => {
  assert.equal(resolveDefaultOpggTier({
    currentRank: rank('EMERALD', 'DIAMOND'),
    sessionQueueId: 420,
    sessionQueueType: 'RANKED_SOLO_5x5'
  }), 'emerald_plus')

  assert.equal(resolveDefaultOpggTier({
    currentRank: rank('GOLD', 'DIAMOND'),
    sessionQueueId: 440,
    sessionQueueType: 'RANKED_FLEX_SR'
  }), 'diamond_plus')

  assert.equal(resolveDefaultOpggTier({
    currentRank: rank('UNRANKED', 'PLATINUM'),
    sessionQueueId: null,
    sessionQueueType: null
  }), 'platinum_plus')
})

test('default OP.GG position reads recent ranked history and breaks ties by latest occurrence', async () => {
  const matches = [
    match(1, 420, { teamPosition: 'JUNGLE' }),
    match(2, 440, { teamPosition: 'MIDDLE' }),
    match(3, 420, { teamPosition: 'MIDDLE' }),
    match(4, 420, { teamPosition: 'JUNGLE' }),
    match(5, 450, { teamPosition: 'UTILITY' }),
    match(6, 420, { teamPosition: 'BOTTOM' })
  ]
  const api: ReliableMatchHistoryApi = {
    async getMatchHistoryPage() {
      return response(matches)
    }
  }

  const result = await resolveDefaultOpggPosition({
    summoner: summoner(),
    puuid: 'self-puuid',
    api,
    database: null
  })

  assert.equal(result, 'jungle')
})

test('default OP.GG position only counts the latest twenty ranked matches and falls back to mid', async () => {
  const matches = Array.from({ length: 25 }, (_, index) => {
    const position = index < 20 ? 'UTILITY' : 'JUNGLE'
    return match(index + 1, 420, { teamPosition: position })
  })
  const api: ReliableMatchHistoryApi = {
    async getMatchHistoryPage() {
      return response(matches)
    }
  }

  assert.equal(await resolveDefaultOpggPosition({
    summoner: summoner(),
    puuid: 'self-puuid',
    api,
    database: null
  }), 'support')

  const failingApi: ReliableMatchHistoryApi = {
    async getMatchHistoryPage() {
      throw new Error('offline')
    }
  }
  assert.equal(await resolveDefaultOpggPosition({
    summoner: summoner(),
    puuid: 'self-puuid',
    api: failingApi,
    database: null
  }), DEFAULT_OPGG_POSITION)
})

test('participant OP.GG position maps Riot bottom lane carry and support fields', () => {
  assert.equal(resolveParticipantOpggPosition(match(1, 420, {
    lane: 'BOTTOM',
    role: 'DUO_CARRY'
  }), 'self-puuid'), 'adc')

  assert.equal(resolveParticipantOpggPosition(match(2, 420, {
    lane: 'BOTTOM',
    role: 'DUO_SUPPORT'
  }), 'self-puuid'), 'support')

  assert.equal(resolveParticipantOpggPosition(match(3, 420, {
    selectedPosition: 'middle'
  }), 'self-puuid'), 'mid')
})
