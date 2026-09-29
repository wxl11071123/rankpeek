import test from 'node:test'
import assert from 'node:assert/strict'
import type { GameDetail, GameParticipant } from '../types/api.ts'
import {
  calculateKda,
  formatDuration,
  formatNumber,
  getCurrentParticipant,
  getParticipantDisplayName,
  getTeamParticipants,
  isCurrentParticipant,
  rankWithinTeam,
  sumTeamStats
} from './matchDetailMetrics.ts'

function makeParticipant(
  participantId: number,
  teamId: number,
  stats: Partial<GameParticipant['stats']> = {}
): GameParticipant {
  return {
    participantId,
    teamId,
    championId: 100 + participantId,
    spell1Id: 4,
    spell2Id: 14,
    timeline: {
      lane: 'MID',
      role: 'SOLO'
    },
    stats: {
      win: teamId === 100,
      kills: 0,
      deaths: 0,
      assists: 0,
      totalMinionsKilled: 0,
      neutralMinionsKilled: 0,
      goldEarned: 0,
      totalDamageDealtToChampions: 0,
      totalDamageTaken: 0,
      totalHeal: 0,
      visionWardsBoughtInGame: 0,
      wardsPlaced: 0,
      wardsKilled: 0,
      largestMultiKill: 0,
      doubleKills: 0,
      tripleKills: 0,
      quadraKills: 0,
      pentaKills: 0,
      ...stats
    }
  }
}

const gameDetail: GameDetail = {
  gameId: 998877,
  gameMode: 'CLASSIC',
  gameType: 'MATCHED_GAME',
  mapId: 11,
  queueId: 420,
  gameDuration: 1884,
  gameCreation: 1777440000000,
  participantIdentities: [
    {
      participantId: 1,
      player: {
        accountId: 1,
        puuid: 'current-puuid',
        platformId: 'HN1',
        summonerName: 'LegacyCurrent',
        gameName: 'RankPeekCarry',
        tagLine: 'RP',
        summonerId: 1
      }
    },
    {
      participantId: 2,
      player: {
        accountId: 2,
        puuid: 'ally-puuid',
        platformId: 'HN1',
        summonerName: 'LegacyAlly',
        gameName: '',
        tagLine: '',
        summonerId: 2
      }
    },
    {
      participantId: 3,
      player: {
        accountId: 3,
        puuid: 'tank-puuid',
        platformId: 'HN1',
        summonerName: 'TeamTank',
        gameName: 'TeamTank',
        tagLine: 'TOP',
        summonerId: 3
      }
    },
    {
      participantId: 6,
      player: {
        accountId: 6,
        puuid: 'enemy-puuid',
        platformId: 'HN1',
        summonerName: 'Enemy',
        gameName: 'EnemyCarry',
        tagLine: 'RED',
        summonerId: 6
      }
    }
  ],
  participants: [
    makeParticipant(1, 100, {
      kills: 8,
      deaths: 3,
      assists: 11,
      goldEarned: 14500,
      totalDamageDealtToChampions: 28000,
      totalDamageTaken: 19000,
      totalHeal: 1200,
      totalMinionsKilled: 210,
      neutralMinionsKilled: 12,
      wardsPlaced: 16,
      wardsKilled: 4,
      damageDealtToTurrets: 3500
    }),
    makeParticipant(2, 100, {
      kills: 4,
      deaths: 5,
      assists: 14,
      goldEarned: 11800,
      totalDamageDealtToChampions: 18000,
      totalDamageTaken: 12000,
      totalHeal: 700,
      totalMinionsKilled: 58,
      wardsPlaced: 32
    }),
    makeParticipant(3, 100, {
      kills: 3,
      deaths: 4,
      assists: 9,
      goldEarned: 13000,
      totalDamageDealtToChampions: 22000,
      totalDamageTaken: 34000,
      totalHeal: 900,
      totalMinionsKilled: 188,
      wardsPlaced: 11
    }),
    makeParticipant(6, 200, {
      kills: 12,
      deaths: 2,
      assists: 7,
      goldEarned: 16000,
      totalDamageDealtToChampions: 36000,
      totalDamageTaken: 18000,
      totalHeal: 1600,
      totalMinionsKilled: 230,
      wardsPlaced: 10
    })
  ]
}

test('finds the current participant by identity puuid and marks highlight state', () => {
  const current = getCurrentParticipant(gameDetail, 'current-puuid')

  assert.equal(current?.participantId, 1)
  assert.equal(current?.puuid, 'current-puuid')
  assert.equal(current?.displayName, 'RankPeekCarry#RP')
  assert.equal(isCurrentParticipant(current, 'current-puuid'), true)
  assert.equal(isCurrentParticipant(current, 'other-puuid'), false)
})

test('returns null when current puuid is not present', () => {
  assert.equal(getCurrentParticipant(gameDetail, 'missing-puuid'), null)
  assert.equal(getCurrentParticipant(gameDetail, ''), null)
})

test('participant display name prefers riot id and falls back to summonerName', () => {
  assert.equal(getParticipantDisplayName(gameDetail.participantIdentities[0]), 'RankPeekCarry#RP')
  assert.equal(getParticipantDisplayName(gameDetail.participantIdentities[1]), 'LegacyAlly')
})

test('KDA uses kills plus assists when deaths are zero', () => {
  assert.equal(calculateKda(8, 0, 11), 19)
  assert.equal(calculateKda(8, 3, 11), 6.3)
})

test('team participants are limited to one team and carry identity data', () => {
  const blue = getTeamParticipants(gameDetail, 100, 'current-puuid')
  const red = getTeamParticipants(gameDetail, 200, 'current-puuid')

  assert.equal(blue.length, 3)
  assert.equal(red.length, 1)
  assert.equal(blue[0]?.isCurrentPlayer, true)
  assert.equal(red[0]?.displayName, 'EnemyCarry#RED')
})

test('rankWithinTeam ranks only finite values inside the current team', () => {
  const blue = getTeamParticipants(gameDetail, 100, 'current-puuid')
  const current = blue[0]

  assert.equal(rankWithinTeam(blue, player => player.stats?.totalDamageDealtToChampions, current?.participantId), 1)
  assert.equal(rankWithinTeam(blue, player => player.stats?.goldEarned, current?.participantId), 1)
  assert.equal(rankWithinTeam(blue, player => player.stats?.totalDamageTaken, current?.participantId), 2)
  assert.equal(rankWithinTeam(blue, player => player.stats?.wardsPlaced, current?.participantId), 2)
  assert.equal(rankWithinTeam(blue, () => undefined, current?.participantId), null)
})

test('rankWithinTeam gives tied values the same rank', () => {
  const blue = getTeamParticipants({
    ...gameDetail,
    participants: [
      makeParticipant(1, 100, { goldEarned: 12000 }),
      makeParticipant(2, 100, { goldEarned: 12000 }),
      makeParticipant(3, 100, { goldEarned: 9000 })
    ]
  }, 100, 'current-puuid')

  assert.equal(rankWithinTeam(blue, player => player.stats?.goldEarned, 1), 1)
  assert.equal(rankWithinTeam(blue, player => player.stats?.goldEarned, 2), 1)
  assert.equal(rankWithinTeam(blue, player => player.stats?.goldEarned, 3), 3)
})

test('team totals sum known stats and tolerate missing fields', () => {
  const blue = getTeamParticipants(gameDetail, 100, 'current-puuid')
  const totals = sumTeamStats(blue)

  assert.deepEqual({
    kills: totals.kills,
    deaths: totals.deaths,
    assists: totals.assists,
    goldEarned: totals.goldEarned,
    totalDamageDealtToChampions: totals.totalDamageDealtToChampions,
    totalDamageTaken: totals.totalDamageTaken,
    totalHeal: totals.totalHeal,
    creepScore: totals.creepScore,
    wardsPlaced: totals.wardsPlaced,
    damageDealtToTurrets: totals.damageDealtToTurrets
  }, {
    kills: 15,
    deaths: 12,
    assists: 34,
    goldEarned: 39300,
    totalDamageDealtToChampions: 68000,
    totalDamageTaken: 65000,
    totalHeal: 2800,
    creepScore: 468,
    wardsPlaced: 59,
    damageDealtToTurrets: 3500
  })

  assert.doesNotThrow(() => sumTeamStats([
    {
      ...blue[0],
      stats: undefined as unknown as GameParticipant['stats']
    }
  ]))
})

test('formatters keep compact match detail values', () => {
  assert.equal(formatNumber(undefined), '--')
  assert.equal(formatNumber(0), '0')
  assert.equal(formatNumber(999), '999')
  assert.equal(formatNumber(14500), '14.5k')
  assert.equal(formatNumber(1250000), '1.3m')
  assert.equal(formatDuration(1884), '31:24')
  assert.equal(formatDuration(undefined), '--')
})
