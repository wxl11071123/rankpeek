import test from 'node:test'
import assert from 'node:assert/strict'
import { buildParticipantRecentMatchItems } from './participantRecentMatches.ts'
import type { MatchHistory } from '../types/api.ts'

function makeMatch(overrides: Partial<MatchHistory> = {}): MatchHistory {
  return {
    gameId: 'gameId' in overrides ? overrides.gameId! : 1,
    gameMode: 'gameMode' in overrides ? overrides.gameMode! : '',
    gameType: 'gameType' in overrides ? overrides.gameType! : '',
    queueId: 'queueId' in overrides ? overrides.queueId! : 420,
    queueName: overrides.queueName,
    gameDuration: 'gameDuration' in overrides ? overrides.gameDuration! : 1800,
    gameCreation: 'gameCreation' in overrides ? overrides.gameCreation! : 1_777_777_777_000,
    platformId: 'platformId' in overrides ? overrides.platformId! : 'HN1',
    participants: overrides.participants ?? [],
    participantIdentities: overrides.participantIdentities ?? []
  }
}

test('builds selected player rows with isRanked, position, kda, items and time', () => {
  const matches = [
    makeMatch({
      gameId: 10,
      gameMode: 'CLASSIC',
      queueId: 420,
      participants: [
        { participantId: 1, teamId: 100, championId: 99, teamPosition: 'MIDDLE', stats: { win: true, kills: 7, deaths: 2, assists: 8, item0: 3078, item1: 3153, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0 } },
        { participantId: 2, teamId: 200, championId: 22, stats: { win: false, kills: 1, deaths: 7, assists: 2 } }
      ] as MatchHistory['participants'],
      participantIdentities: [
        { participantId: 1, player: { puuid: 'target' } },
        { participantId: 2, player: { puuid: 'other' } }
      ] as MatchHistory['participantIdentities']
    })
  ]

  const [item] = buildParticipantRecentMatchItems(matches, 'target')

  assert.equal(item.gameId, 10)
  assert.equal(item.championId, 99)
  assert.equal(item.isRanked, true)
  assert.equal(item.positionText, '\u4e2d\u5355')
  assert.equal(item.kdaText, '7 / 2 / 8')
  assert.equal(item.durationText, '30:00')
  assert.match(item.startTimeText, /^\d+\/\d+ \d{2}:\d{2}$/)
  assert.deepEqual(item.itemIds, [3078, 3153, 0, 0, 0, 0, 0])
  assert.doesNotMatch(JSON.stringify(item), /CLASSIC|resultText|queueText/)
})

test('marks non-ranked queues and shows no position', () => {
  const items = buildParticipantRecentMatchItems([makeMatch({ queueId: 450 })], '')
  assert.equal(items[0].isRanked, false)
  assert.equal(items[0].positionText, '')
})

test('caps inline recent match rows to the latest twenty matches', () => {
  const matches = Array.from({ length: 25 }, (_, index) =>
    makeMatch({
      gameId: index + 1,
      gameCreation: 1_777_777_777_000 + index
    })
  )

  const items = buildParticipantRecentMatchItems(matches, '')

  assert.equal(items.length, 20)
  assert.equal(items[0].gameId, 25)
  assert.equal(items.at(-1)?.gameId, 6)
})

test('recent match rows degrade gracefully when the twenty-game sample or fields are missing', () => {
  assert.deepEqual(buildParticipantRecentMatchItems(undefined, 'target'), [])

  const [item] = buildParticipantRecentMatchItems([
    makeMatch({
      queueId: 0,
      gameDuration: undefined as unknown as number,
      gameCreation: undefined as unknown as number,
      participants: [],
      participantIdentities: []
    })
  ], 'target')

  assert.equal(item.championId, null)
  assert.equal(item.isRanked, false)
  assert.equal(item.positionText, '')
  assert.equal(item.kdaText, '--')
  assert.equal(item.timeText, '--')
  assert.equal(item.durationText, '--')
  assert.deepEqual(item.itemIds, [0, 0, 0, 0, 0, 0, 0])
})
