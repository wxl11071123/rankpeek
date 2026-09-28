import test from 'node:test'
import assert from 'node:assert/strict'
import {
  appendUniqueMatches,
  buildLoadedChampionOptions
} from './matchHistoryFilters.ts'
import type { ChampionOption, MatchHistory } from '../types/api.ts'

const SELF_PUUID = 'self-puuid'

const championOptions: ChampionOption[] = [
  { value: 11, label: 'Yone', realName: 'Yone', nickname: '' },
  { value: 22, label: 'Lux', realName: 'Lux', nickname: '' },
  { value: 33, label: 'Lee Sin', realName: 'Lee Sin', nickname: '' }
]

function match(
  gameId: number,
  queueId: number,
  championId: number,
  puuid = SELF_PUUID
): MatchHistory {
  return {
    gameId,
    gameMode: 'CLASSIC',
    gameType: 'MATCHED_GAME',
    queueId,
    gameDuration: 1800,
    gameCreation: 1_710_000_000_000 + gameId,
    platformId: 'HN1',
    participants: [{
      participantId: 1,
      teamId: 100,
      championId,
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
        puuid,
        platformId: 'HN1'
      }
    }]
  }
}

test('loaded champion options come from the loaded player history and respect queue filter', () => {
  const matches = [
    match(500, 420, 11),
    match(499, 440, 22),
    match(498, 420, 11),
    match(497, 420, 33),
    match(496, 420, 99),
    match(495, 420, 22, 'other-puuid')
  ]

  const options = buildLoadedChampionOptions(matches, SELF_PUUID, championOptions, 420)

  assert.deepEqual(options.map(option => option.value), [11, 33, 99])
  assert.deepEqual(options.map(option => option.games), [2, 1, 1])
  assert.equal(options[0].label, 'Yone')
  assert.equal(options[1].label, 'Lee Sin')
  assert.equal(options[2].label, '未知英雄 99')
  assert.equal(options[0].realName, 'Yone')
  assert.equal(options[2].realName, '未知英雄 99')
})

test('loaded champion options sort by most recent use when counts are tied', () => {
  const matches = [
    match(700, 420, 22),
    match(699, 420, 11),
    match(698, 420, 33)
  ]

  const options = buildLoadedChampionOptions(matches, SELF_PUUID, championOptions)

  assert.deepEqual(options.map(option => option.value), [22, 11, 33])
})

test('loaded champion option label keeps champion name separate from styled game count', () => {
  const renataOption: ChampionOption = {
    value: 888,
    label: '炼金男爵',
    realName: '炼金男爵',
    nickname: 'Renata'
  }
  const options = buildLoadedChampionOptions(
    [match(88801, 420, 888)],
    SELF_PUUID,
    [renataOption]
  )

  assert.equal(options[0].label, '炼金男爵')
  assert.equal(options[0].games, 1)
  assert.doesNotMatch(options[0].label, /\d/)
})

test('appendUniqueMatches appends new pages without duplicating existing games', () => {
  const existing = [match(1, 420, 11), match(2, 420, 22)]
  const incoming = [match(2, 420, 22), match(3, 420, 33)]

  const merged = appendUniqueMatches(existing, incoming)

  assert.deepEqual(merged.map(item => item.gameId), [1, 2, 3])
  assert.equal(merged[1], existing[1])
})
