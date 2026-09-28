import test from 'node:test'
import assert from 'node:assert/strict'
import type { RecordStatus, SessionData, SessionSummoner } from '../types/api.ts'
import { createGamingAiAnalysisPreview } from './gamingAiAnalysisPreview.ts'

const baseSessionData: SessionData = {
  phase: 'ChampSelect',
  queueType: 'RANKED_SOLO_5x5',
  typeCn: '单双排',
  queueId: 420,
  teamOne: [],
  teamTwo: []
}

function createPlayer(overrides: Partial<SessionSummoner> & {
  name?: string
  puuid?: string
  recordStatus?: RecordStatus
  wins?: number
  losses?: number
  kda?: number
  damage?: number
  gold?: number
  tier?: string
  division?: string
  lane?: string
} = {}): SessionSummoner {
  const wins = overrides.wins ?? 5
  const losses = overrides.losses ?? 5
  return {
    championId: overrides.championId ?? 103,
    championKey: String(overrides.championId ?? 103),
    summoner: {
      gameName: overrides.name ?? '测试玩家',
      tagLine: 'CN1',
      summonerLevel: 300,
      profileIconId: overrides.summoner?.profileIconId ?? 29,
      puuid: overrides.puuid ?? `${overrides.name ?? 'player'}-puuid`,
      summonerId: 1
    },
    matchHistory: [],
    userTag: {
      recordStatus: overrides.recordStatus ?? 'NORMAL',
      recentData: {
        kda: overrides.kda ?? 2.4,
        kills: 6,
        deaths: 4,
        assists: 8,
        selectMode: 420,
        selectModeCn: '单双排',
        selectWins: wins,
        selectLosses: losses,
        groupRate: 0,
        averageGold: overrides.gold ?? 10000,
        goldRate: 0,
        averageDamageDealtToChampions: overrides.damage ?? 16000,
        damageDealtToChampionsRate: 0,
        friendAndDispute: {
          friendsRate: 0,
          disputeRate: 0,
          friendsSummoner: [],
          disputeSummoner: []
        }
      },
      tag: []
    },
    rank: {
      queueMap: {
        RANKED_SOLO_5x5: {
          queueType: 'RANKED_SOLO_5x5',
          tier: overrides.tier ?? 'GOLD',
          division: overrides.division ?? 'II',
          leaguePoints: 66,
          wins: 40,
          losses: 36,
          highestTier: '',
          highestDivision: '',
          isProvisional: false
        },
        RANKED_FLEX_SR: {
          queueType: 'RANKED_FLEX_SR',
          tier: 'UNRANKED',
          division: '',
          leaguePoints: 0,
          wins: 0,
          losses: 0,
          highestTier: '',
          highestDivision: '',
          isProvisional: false
        }
      }
    },
    meetGames: [],
    preGroupMarkers: { name: '', type: '' },
    isLoading: false,
    ...overrides
  }
}

test('PRIVATE, EMPTY, and ERROR record statuses are not forced into strong judgments', () => {
  const preview = createGamingAiAnalysisPreview({
    mode: 'teammate',
    players: [
      createPlayer({ name: '隐藏', recordStatus: 'PRIVATE', wins: 10, losses: 0, kda: 9 }),
      createPlayer({ name: '空样本', recordStatus: 'EMPTY', wins: 10, losses: 0, kda: 9 }),
      createPlayer({ name: '异常', recordStatus: 'ERROR', wins: 10, losses: 0, kda: 9 })
    ],
    sessionData: baseSessionData
  })

  assert.deepEqual(preview.players.map(player => player.verdict), ['战绩隐藏', '样本不足', '数据异常'])
  assert.ok(preview.players.every(player => player.tone === 'unknown'))
})

test('high win rate and high KDA teammate becomes a possible carry', () => {
  const preview = createGamingAiAnalysisPreview({
    mode: 'teammate',
    players: [createPlayer({ name: '大腿', wins: 8, losses: 2, kda: 3.4, damage: 19000, gold: 10000 })],
    sessionData: baseSessionData
  })

  assert.equal(preview.title, '队友成分分析')
  assert.equal(preview.players[0]?.verdict, '疑似大腿')
  assert.equal(preview.players[0]?.tone, 'carry')
  assert.match(preview.opening, /队友/)
})

test('high win rate and high KDA opponent becomes a smurf or high threat', () => {
  const preview = createGamingAiAnalysisPreview({
    mode: 'opponent',
    players: [createPlayer({ name: '对面大哥', wins: 9, losses: 1, kda: 3.6, damage: 20000, gold: 10000 })],
    sessionData: { ...baseSessionData, phase: 'InProgress', typeCn: '灵活排位' }
  })

  assert.equal(preview.title, '赛前对手分析')
  assert.match(preview.subtitle, /游戏中 · 灵活排位/)
  assert.match(preview.players[0]?.verdict ?? '', /疑似小代|高威胁/)
  assert.equal(preview.players[0]?.tone, 'carry')
})

test('low win rate and low KDA teammate becomes a risk teammate', () => {
  const preview = createGamingAiAnalysisPreview({
    mode: 'teammate',
    players: [createPlayer({ name: '波动点', wins: 3, losses: 7, kda: 1.5, damage: 13000, gold: 10000 })],
    sessionData: baseSessionData
  })

  assert.equal(preview.players[0]?.verdict, '风险队友')
  assert.equal(preview.players[0]?.tone, 'risk')
})

test('low win rate and low KDA opponent becomes a targetable breakthrough', () => {
  const preview = createGamingAiAnalysisPreview({
    mode: 'opponent',
    players: [createPlayer({ name: '突破口', wins: 3, losses: 7, kda: 1.5, damage: 11000, gold: 10000 })],
    sessionData: baseSessionData
  })

  assert.equal(preview.players[0]?.verdict, '可突破')
  assert.equal(preview.players[0]?.tone, 'weak')
  assert.ok(preview.bullets.some(text => text.includes('突破口')))
})

test('low sample players remain sample-insufficient even with extreme data', () => {
  const preview = createGamingAiAnalysisPreview({
    mode: 'opponent',
    players: [createPlayer({ name: '两场战神', wins: 2, losses: 0, kda: 12, damage: 24000, gold: 10000 })],
    sessionData: baseSessionData
  })

  assert.equal(preview.players[0]?.verdict, '样本不足')
  assert.equal(preview.players[0]?.tone, 'unknown')
})

test('no players returns an empty-state preview instead of fabricated insights', () => {
  const preview = createGamingAiAnalysisPreview({
    mode: 'teammate',
    players: [],
    sessionData: { ...baseSessionData, phase: 'None', typeCn: '' }
  })

  assert.equal(preview.players.length, 0)
  assert.match(preview.opening, /当前还没有可用玩家数据/)
  assert.deepEqual(preview.bullets, [])
})

test('opponent preview adds lane advice from the current summoner position when available', () => {
  const current = createPlayer({ name: '我', puuid: 'self', lane: 'JUNGLE' })
  const preview = createGamingAiAnalysisPreview({
    mode: 'opponent',
    players: [createPlayer({ name: '高威胁打野', wins: 8, losses: 2, kda: 3.3 })],
    sessionData: {
      ...baseSessionData,
      currentSummoner: current.summoner,
      teamOne: [current]
    },
    currentSummonerPuuid: 'self'
  })

  assert.match(preview.laneAdvice ?? '', /前 6 分钟/)
})
