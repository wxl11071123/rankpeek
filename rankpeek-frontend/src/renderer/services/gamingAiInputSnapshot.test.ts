import test from 'node:test'
import assert from 'node:assert/strict'
import type { MatchHistory, RecordStatus, SessionData, SessionSummoner } from '../types/api.ts'
import { buildGamingAiInputSnapshot } from './gamingAiInputSnapshot.ts'

function createPlayer(overrides: Partial<SessionSummoner> & {
  name?: string
  tagLine?: string
  puuid?: string
  recordStatus?: RecordStatus
  wins?: number
  losses?: number
  kda?: number
  kills?: number
  deaths?: number
  assists?: number
  damage?: number
  gold?: number
  tags?: Array<{ tagName: string; good?: boolean | null; tagDesc?: string }>
} = {}): SessionSummoner {
  const wins = overrides.wins ?? 11
  const losses = overrides.losses ?? 9
  const name = overrides.name ?? 'W'
  const puuid = overrides.puuid ?? `${name}-puuid`

  return {
    championId: overrides.championId ?? 141,
    championKey: overrides.championKey ?? String(overrides.championId ?? 141),
    selectedPosition: overrides.selectedPosition ?? 'JUNGLE',
    position: overrides.position ?? overrides.selectedPosition ?? 'JUNGLE',
    summoner: {
      gameName: name,
      tagLine: overrides.tagLine ?? '1234',
      summonerLevel: 300,
      profileIconId: 29,
      puuid,
      summonerId: 1
    },
    matchHistory: overrides.matchHistory ?? createRecentMatches(puuid),
    userTag: {
      recordStatus: overrides.recordStatus ?? 'NORMAL',
      recentData: {
        kda: overrides.kda ?? 3.1,
        kills: overrides.kills ?? 7,
        deaths: overrides.deaths ?? 3,
        assists: overrides.assists ?? 8,
        selectMode: 420,
        selectModeCn: 'ranked',
        selectWins: wins,
        selectLosses: losses,
        groupRate: 12.5,
        averageGold: overrides.gold ?? 10000,
        goldRate: 21.5,
        averageDamageDealtToChampions: overrides.damage ?? 15230,
        damageDealtToChampionsRate: 0,
        friendAndDispute: {
          friendsRate: 4.5,
          disputeRate: 1.5,
          friendsSummoner: [],
          disputeSummoner: []
        }
      },
      tag: overrides.tags ?? [
        { tagName: '高胜率', good: true },
        { tagName: '稳定C', good: true },
        { tagName: '高伤', good: true }
      ]
    },
    rank: {
      queueMap: {}
    },
    meetGames: [],
    preGroupMarkers: { name: 'duo-a', type: 'same-team' },
    isLoading: false,
    ...overrides
  }
}

function createSessionData(overrides: Partial<SessionData> = {}): SessionData {
  const ally = createPlayer({ name: 'Ally', puuid: 'ally-puuid' })
  const enemy = createPlayer({ name: 'Enemy', puuid: 'enemy-puuid', recordStatus: 'PRIVATE' })
  return {
    phase: 'ChampSelect',
    queueType: 'RANKED_SOLO_5x5',
    typeCn: '单双排',
    queueId: 420,
    matchId: 'mock-match',
    roundIndex: 2,
    currentSummoner: ally.summoner,
    teamOne: [ally],
    teamTwo: [enemy],
    ...overrides
  }
}

function createRecentMatches(puuid: string, count = 20): MatchHistory[] {
  return Array.from({ length: count }, (_, index) => {
    const win = index % 2 === 0
    return {
      gameId: 998877 + index,
      gameMode: 'CLASSIC',
      gameType: 'MATCHED_GAME',
      queueId: 420,
      gameDuration: 1800,
      gameCreation: 1710000000000 - index * 600000,
      platformId: 'HN1',
      participants: [
        {
          participantId: 1,
          teamId: 100,
          championId: 64,
          championName: '德邦总管',
          spell1Id: 4,
          spell2Id: 11,
          selectedPosition: index % 3 === 0 ? 'TOP' : 'JUNGLE',
          teamPosition: index % 3 === 0 ? 'TOP' : 'JUNGLE',
          individualPosition: index % 3 === 0 ? 'TOP' : 'JUNGLE',
          stats: {
            win,
            kills: 1 + index,
            deaths: 2,
            assists: 3,
            goldEarned: 10000,
            totalMinionsKilled: 10,
            neutralMinionsKilled: 100,
            totalDamageDealtToChampions: 15000,
            totalDamageTaken: 20000,
            totalHeal: 1000,
            item0: 0,
            item1: 0,
            item2: 0,
            item3: 0,
            item4: 0,
            item5: 0,
            item6: 0
          }
        } as MatchHistory['participants'][number] & { championName: string }
      ],
      participantIdentities: [
        {
          participantId: 1,
          player: {
            accountId: 1,
            summonerId: 1,
            summonerName: '',
            gameName: 'Player',
            tagLine: '1234',
            puuid,
            platformId: 'HN1'
          }
        }
      ]
    }
  })
}

test('builds a compact v2 gaming AI snapshot with teammate and opponent players', () => {
  const sessionData = createSessionData()
  const snapshot = buildGamingAiInputSnapshot({
    mode: 'teammate',
    sessionData,
    selectedPlayers: sessionData.teamOne,
    currentSummonerPuuid: 'ally-puuid'
  })

  assert.equal(snapshot.schemaVersion, 'gaming_ai_input_snapshot.v2')
  assert.equal(snapshot.mode, 'teammate')
  assert.equal(snapshot.phase, 'ChampSelect')
  assert.equal(snapshot.queueId, 420)
  assert.equal(snapshot.queueName, '单双排')
  assert.equal(snapshot.matchId, 'mock-match')
  assert.equal(snapshot.roundIndex, 2)
  assert.equal(snapshot.currentSummoner?.puuid, 'ally-puuid')
  assert.equal(snapshot.teammateSnapshot.side, 'ally')
  assert.equal(snapshot.opponentSnapshot.side, 'enemy')
  assert.deepEqual(Object.keys(snapshot.teammateSnapshot.players[0] ?? {}).sort(), ['isSelf', 'key', 'summaryLine'])
  assert.equal(snapshot.teammateSnapshot.players[0]?.key, 'puuid:ally-puuid')
  assert.equal(snapshot.teammateSnapshot.players[0]?.isSelf, true)
  assert.equal(snapshot.opponentSnapshot.players[0]?.key, 'puuid:enemy-puuid')
})

test('prefers hydrated teammates and opponents over raw team aliases', () => {
  const teammate = createPlayer({ name: 'HydratedAlly', puuid: 'hydrated-ally' })
  const opponent = createPlayer({ name: 'HydratedEnemy', puuid: 'hydrated-enemy' })
  const sessionData = createSessionData({
    teammates: [teammate],
    opponents: [opponent]
  })

  const snapshot = buildGamingAiInputSnapshot({
    mode: 'opponent',
    sessionData,
    selectedPlayers: sessionData.opponents ?? [],
    currentSummonerPuuid: 'hydrated-ally'
  })

  // The summary line prefixes the canonical player key so the model copies it verbatim (commit 1f18a5a).
  assert.match(snapshot.teammateSnapshot.players[0]?.summaryLine ?? '', /^玩家 \[puuid:hydrated-ally\] 你 战绩状态：/)
  assert.match(snapshot.opponentSnapshot.players[0]?.summaryLine ?? '', /^玩家 \[puuid:hydrated-enemy\] 敌方1 战绩状态：/)
  assert.doesNotMatch(snapshot.teammateSnapshot.text, /HydratedAlly#1234|HydratedEnemy#1234|用户ID/)
  assert.doesNotMatch(snapshot.opponentSnapshot.text, /HydratedAlly#1234|HydratedEnemy#1234|用户ID/)
  assert.equal(snapshot.mode, 'opponent')
})

test('turns each player into one compact natural-language line only', () => {
  const player = createPlayer({
    name: '练习两年半的ikun',
    tagLine: '58092',
    puuid: 'ikun-puuid',
    selectedPosition: 'JUNGLE',
    wins: 13,
    losses: 7,
    kda: 3.25,
    kills: 8,
    deaths: 4,
    assists: 5,
    damage: 17750,
    gold: 11000
  })
  const snapshot = buildGamingAiInputSnapshot({
    mode: 'teammate',
    sessionData: createSessionData({ teamOne: [player], teamTwo: [], currentSummoner: player.summoner }),
    selectedPlayers: [player],
    currentSummonerPuuid: 'ikun-puuid'
  })
  const normalized = snapshot.teammateSnapshot.players[0]

  assert.equal(normalized?.key, 'puuid:ikun-puuid')
  assert.equal(normalized?.summaryLine, '玩家 [puuid:ikun-puuid] 你 战绩状态：正常。当前位置：打野，tag：高胜率、稳定C、高伤，场均击杀/死亡/助攻：8.0/4.0/5.0，平均KDA：3.3，胜率：65.0%，伤转：161.4%，样本数：20，参团率：12.5%，最近对局：德邦总管 上路 胜 1/2/3、德邦总管 打野 负 2/2/3、德邦总管 打野 胜 3/2/3、德邦总管 上路 负 4/2/3、德邦总管 打野 胜 5/2/3、德邦总管 打野 负 6/2/3、德邦总管 上路 胜 7/2/3、德邦总管 打野 负 8/2/3、德邦总管 打野 胜 9/2/3、德邦总管 上路 负 10/2/3、德邦总管 打野 胜 11/2/3、德邦总管 打野 负 12/2/3、德邦总管 上路 胜 13/2/3、德邦总管 打野 负 14/2/3、德邦总管 打野 胜 15/2/3、德邦总管 上路 负 16/2/3、德邦总管 打野 胜 17/2/3、德邦总管 打野 负 18/2/3、德邦总管 上路 胜 19/2/3、德邦总管 打野 负 20/2/3。')

  assert.match(snapshot.teammateSnapshot.text ?? '', /^当前snapshot时间：.+。模式：单双排。阵营：我方。/)
  assert.match(snapshot.teammateSnapshot.text ?? '', /你 战绩状态：正常。当前位置：打野/)
  assert.doesNotMatch(snapshot.teammateSnapshot.text ?? '', /练习两年半的ikun#58092|用户ID/)
  assert.equal((snapshot.teammateSnapshot.text ?? '').match(/德邦总管/g)?.length, 20)
  assert.match(snapshot.opponentSnapshot.text ?? '', /阵营：敌方。/)

  const serialized = JSON.stringify(snapshot)
  assert.doesNotMatch(serialized, /matchHistory|participantIdentities|championId|championKey/)
  assert.doesNotMatch(serialized, /"rank"|"metrics"|"tags"|"sampleMatches"|"preGroupMarker"|"displayName"|"selectedPosition"|"recordStatus"/)
})

test('maps recent match champion ids to Chinese names before sending', () => {
  const puuid = 'champion-map-puuid'
  const match = createRecentMatches(puuid, 1)[0]
  const participant = match?.participants?.[0] as (Record<string, unknown> | undefined)
  if (!match || !participant) {
    throw new Error('test fixture missing participant')
  }
  delete participant.championName
  delete participant.championNameCn
  participant.championKey = '64'

  const player = createPlayer({
    name: 'ChampionMap',
    puuid,
    matchHistory: [match]
  })
  const snapshot = buildGamingAiInputSnapshot({
    mode: 'teammate',
    sessionData: createSessionData({ teamOne: [player], teamTwo: [], currentSummoner: player.summoner }),
    selectedPlayers: [player],
    currentSummonerPuuid: puuid
  })

  const summaryLine = snapshot.teammateSnapshot.players[0]?.summaryLine ?? ''
  assert.match(summaryLine, /最近对局：盲僧 上路 胜 1\/2\/3/)
  assert.doesNotMatch(summaryLine, /最近对局：(?:64|英雄64) /)
})

test('does not copy raw match history into the snapshot', () => {
  const snapshot = buildGamingAiInputSnapshot({
    mode: 'teammate',
    sessionData: createSessionData(),
    selectedPlayers: []
  })
  const serialized = JSON.stringify(snapshot)

  assert.doesNotMatch(serialized, /matchHistory/)
  assert.doesNotMatch(serialized, /998877/)
  assert.doesNotMatch(serialized, /participantIdentities/)
})

test('converts NaN and Infinity metrics into readable unknown values before sending', () => {
  const player = createPlayer({
    name: 'BadNumbers',
    wins: Number.NaN,
    losses: Number.POSITIVE_INFINITY,
    kda: Number.NaN,
    damage: Number.POSITIVE_INFINITY,
    gold: Number.NaN
  })
  const snapshot = buildGamingAiInputSnapshot({
    mode: 'teammate',
    sessionData: createSessionData({ teamOne: [player], teamTwo: [] }),
    selectedPlayers: [player]
  })
  const summaryLine = snapshot.teammateSnapshot.players[0]?.summaryLine ?? ''

  assert.match(summaryLine, /样本数：0/)
  assert.match(summaryLine, /平均KDA：未知/)
  assert.match(summaryLine, /伤转：未知/)
  assertNoNonFiniteNumbers(snapshot)
})

function assertNoNonFiniteNumbers(value: unknown): void {
  if (typeof value === 'number') {
    assert.equal(Number.isFinite(value), true)
    return
  }
  if (Array.isArray(value)) {
    value.forEach(assertNoNonFiniteNumbers)
    return
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach(assertNoNonFiniteNumbers)
  }
}
