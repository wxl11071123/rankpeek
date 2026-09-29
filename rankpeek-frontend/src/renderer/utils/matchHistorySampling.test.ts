import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MATCH_HISTORY_OVERVIEW_LOOKBACK_LIMIT,
  RANKED_OVERVIEW_SAMPLE_LIMIT,
  isRemakeMatch,
  selectRecentMatchLookback,
  selectRecentRankedSample
} from './matchHistorySampling.ts'
import type { MatchHistory } from '../types/api.ts'

const SELF_PUUID = 'self'

function match(index: number, queueId: number, options: Partial<MatchHistory> = {}): MatchHistory {
  return {
    gameId: index,
    gameMode: 'CLASSIC',
    gameType: 'MATCHED_GAME',
    queueId,
    gameDuration: 1800,
    gameCreation: 1_710_000_000_000 + index,
    platformId: 'HN1',
    participants: [{
      participantId: 1,
      teamId: 100,
      championId: 11,
      spell1Id: 4,
      spell2Id: 14,
      stats: {
        win: true,
        kills: 1,
        deaths: 1,
        assists: 1,
        goldEarned: 1000,
        totalMinionsKilled: 10,
        neutralMinionsKilled: 0,
        totalDamageDealtToChampions: 1000,
        totalDamageTaken: 1000,
        totalHeal: 0,
        item0: 0,
        item1: 0,
        item2: 0,
        item3: 0,
        item4: 0,
        item5: 0,
        item6: 0
      }
    }],
    participantIdentities: [{
      participantId: 1,
      player: {
        accountId: 1,
        summonerId: 1,
        summonerName: 'Self',
        gameName: 'Self',
        tagLine: 'HN1',
        puuid: SELF_PUUID,
        platformId: 'HN1'
      }
    }],
    ...options
  }
}

test('selects twenty ranked matches from fifty-game lookback even when visible twenty has only sixteen ranked', () => {
  const visibleTwenty = [
    ...Array.from({ length: 16 }, (_, index) => match(200 - index, index % 2 === 0 ? 420 : 440)),
    ...Array.from({ length: 4 }, (_, index) => match(184 - index, 450))
  ]
  const olderRanked = Array.from({ length: 4 }, (_, index) => match(180 - index, 420))
  const olderCasual = Array.from({ length: 26 }, (_, index) => match(176 - index, 450))
  const lookback = selectRecentMatchLookback([...olderCasual, ...olderRanked, ...visibleTwenty])

  assert.equal(lookback.length, MATCH_HISTORY_OVERVIEW_LOOKBACK_LIMIT)
  assert.equal(selectRecentRankedSample(visibleTwenty).length, 16)
  assert.equal(selectRecentRankedSample(lookback).length, RANKED_OVERVIEW_SAMPLE_LIMIT)
})

test('does not fill ranked sample with casual matches and excludes remakes', () => {
  const matches = [
    ...Array.from({ length: 12 }, (_, index) => match(100 - index, index % 2 === 0 ? 420 : 440)),
    match(80, 420, { remake: true }),
    match(79, 440, { gameDuration: 240 }),
    ...Array.from({ length: 20 }, (_, index) => match(60 - index, 450))
  ]

  const sample = selectRecentRankedSample(selectRecentMatchLookback(matches))

  assert.equal(sample.length, 12)
  assert.ok(sample.every(item => item.queueId === 420 || item.queueId === 440))
  assert.ok(sample.every(item => item.remake !== true && item.gameDuration >= 300))
})

test('detects remake matches below five minutes and keeps five-minute matches normal', () => {
  assert.equal(isRemakeMatch(match(1, 420, { gameDuration: 299 })), true)
  assert.equal(isRemakeMatch(match(2, 420, { gameDuration: 300 })), false)
  assert.equal(isRemakeMatch(match(3, 420, { gameDuration: 1800, remake: true })), true)
})
