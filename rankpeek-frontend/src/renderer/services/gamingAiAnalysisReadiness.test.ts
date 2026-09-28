import test from 'node:test'
import assert from 'node:assert/strict'
import type { RecordStatus, SessionData, SessionSummoner } from '../types/api.ts'
import { isGamingAiAnalysisReady } from './gamingAiAnalysisReadiness.ts'

function createPlayer(index: number, overrides: Partial<SessionSummoner> & {
  recordStatus?: RecordStatus
  gameName?: string
  puuid?: string
} = {}): SessionSummoner {
  return {
    championId: 1,
    championKey: '1',
    selectedPosition: 'JUNGLE',
    position: 'JUNGLE',
    summoner: {
      gameName: overrides.gameName ?? `Player${index}`,
      tagLine: `${1000 + index}`,
      summonerLevel: 100,
      profileIconId: 1,
      puuid: overrides.puuid ?? `puuid-${index}`,
      summonerId: index
    },
    matchHistory: [],
    userTag: {
      recordStatus: overrides.recordStatus ?? 'NORMAL',
      recentData: {
        kda: 2,
        kills: 4,
        deaths: 3,
        assists: 6,
        selectMode: 420,
        selectModeCn: 'ranked',
        selectWins: 5,
        selectLosses: 5,
        groupRate: 50,
        averageGold: 10000,
        goldRate: 20,
        averageDamageDealtToChampions: 15000,
        damageDealtToChampionsRate: 20,
        friendAndDispute: {
          friendsRate: 0,
          disputeRate: 0,
          friendsSummoner: [],
          disputeSummoner: []
        }
      },
      tag: []
    },
    rank: { queueMap: {} },
    meetGames: [],
    preGroupMarkers: { name: '', type: '' },
    isLoading: false,
    ...overrides
  }
}

function createSessionData(overrides: Partial<SessionData> = {}): SessionData {
  const teamOne = Array.from({ length: 5 }, (_, index) => createPlayer(index + 1))
  const teamTwo = Array.from({ length: 5 }, (_, index) => createPlayer(index + 11))

  return {
    phase: 'ChampSelect',
    queueType: 'RANKED_SOLO_5x5',
    typeCn: '单双排',
    queueId: 420,
    matchId: 'mock-match',
    currentSummoner: teamOne[0].summoner,
    teamOne,
    teamTwo,
    ...overrides
  }
}

test('teammate analysis is ready when five ally identities are loaded even with non-normal record statuses', () => {
  const sessionData = createSessionData({
    teamOne: [
      createPlayer(1, { recordStatus: 'NORMAL' }),
      createPlayer(2, { recordStatus: 'PRIVATE' }),
      createPlayer(3, { recordStatus: 'EMPTY' }),
      createPlayer(4, { recordStatus: 'ERROR' }),
      createPlayer(5, { recordStatus: 'NORMAL' })
    ]
  })

  assert.equal(isGamingAiAnalysisReady({ mode: 'teammate', sessionData }), true)
})

test('teammate analysis waits for loading players and complete identities', () => {
  assert.equal(isGamingAiAnalysisReady({
    mode: 'teammate',
    sessionData: createSessionData({
      teamOne: [
        createPlayer(1),
        createPlayer(2),
        createPlayer(3, { isLoading: true }),
        createPlayer(4),
        createPlayer(5)
      ]
    })
  }), false)

  assert.equal(isGamingAiAnalysisReady({
    mode: 'teammate',
    sessionData: createSessionData({
      teamOne: [
        createPlayer(1),
        createPlayer(2),
        createPlayer(3, { summoner: { ...createPlayer(3).summoner, gameName: '', puuid: '' } }),
        createPlayer(4),
        createPlayer(5)
      ]
    })
  }), false)
})

test('opponent analysis waits until five enemy players are loaded', () => {
  assert.equal(isGamingAiAnalysisReady({
    mode: 'opponent',
    sessionData: createSessionData({
      teamTwo: Array.from({ length: 4 }, (_, index) => createPlayer(index + 11))
    })
  }), false)

  assert.equal(isGamingAiAnalysisReady({
    mode: 'opponent',
    sessionData: createSessionData()
  }), true)
})

test('analysis remains available after champ select transitions into the live game phase', () => {
  assert.equal(isGamingAiAnalysisReady({
    mode: 'teammate',
    sessionData: createSessionData({ phase: 'InProgress' })
  }), true)
})

test('pregame analysis is disabled outside ranked queues', () => {
  assert.equal(isGamingAiAnalysisReady({
    mode: 'teammate',
    sessionData: createSessionData({ queueId: 450, typeCn: '极地大乱斗' })
  }), false)
})
