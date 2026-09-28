import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import type { GameDetail, MatchHistory, MatchTimeline } from '../types/api.ts'
import {
  resetGameAssetResolverForTest,
  setGameAssetMetadataForTest
} from '../utils/gameAssetUrls.ts'
import {
  buildPostgameAiInputSnapshot,
  createPostgameAiInputHash
} from './postgameAiInputSnapshot.ts'

afterEach(() => {
  resetGameAssetResolverForTest()
})

function createMatchHistory(): MatchHistory {
  return {
    gameId: 987654321,
    gameMode: 'CLASSIC',
    gameType: 'MATCHED_GAME',
    queueId: 420,
    queueName: 'Ranked Solo',
    gameDuration: 1800,
    gameCreation: 1710000000000,
    platformId: 'HN1',
    participants: createParticipants(),
    participantIdentities: createIdentities(),
    teamObjectives: [
      {
        teamId: 100,
        turretKills: 8,
        turretPlateKills: 6,
        inhibitorKills: 1,
        dragonKills: 2,
        baronKills: 1,
        heraldKills: 1,
        voidGrubKills: 3
      },
      {
        teamId: 200,
        turretKills: 4,
        turretPlateKills: 2,
        inhibitorKills: 0,
        dragonKills: 1,
        baronKills: 0,
        heraldKills: 0,
        voidGrubKills: 0
      }
    ]
  }
}

function createGameDetail(): GameDetail {
  const match = createMatchHistory()
  return {
    gameId: match.gameId,
    gameMode: match.gameMode,
    gameType: match.gameType,
    mapId: 11,
    queueId: match.queueId,
    gameDuration: match.gameDuration,
    gameCreation: match.gameCreation,
    participantIdentities: match.participantIdentities,
    participants: match.participants.map(participant => ({
      participantId: participant.participantId,
      teamId: participant.teamId,
      championId: participant.championId,
      spell1Id: participant.spell1Id,
      spell2Id: participant.spell2Id,
      teamPosition: participant.teamPosition,
      individualPosition: participant.individualPosition,
      selectedPosition: participant.selectedPosition,
      timeline: {
        lane: participant.teamPosition ?? '',
        role: participant.role ?? '',
        teamPosition: participant.teamPosition,
        rawLane: participant.lane,
        rawRole: participant.role
      },
      stats: {
        ...participant.stats,
        wardsPlaced: 7,
        wardsKilled: 2,
        visionWardsBoughtInGame: 1,
        largestMultiKill: 2,
        doubleKills: participant.stats.doubleKills ?? 0,
        tripleKills: participant.stats.tripleKills ?? 0,
        quadraKills: participant.stats.quadraKills ?? 0,
        pentaKills: participant.stats.pentaKills ?? 0
      }
    })),
    teamObjectives: match.teamObjectives,
    teamBans: []
  }
}

function createParticipants(): MatchHistory['participants'] {
  const positions = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']
  return Array.from({ length: 10 }, (_, index) => {
    const participantId = index + 1
    const blue = participantId <= 5
    const lane = positions[index % 5] ?? 'TOP'
    return {
      participantId,
      teamId: blue ? 100 : 200,
      championId: 10 + participantId,
      spell1Id: 4,
      spell2Id: 14,
      teamPosition: lane,
      individualPosition: lane,
      selectedPosition: lane,
      lane,
      role: lane === 'UTILITY' ? 'SUPPORT' : 'SOLO',
      stats: {
        win: blue,
        kills: blue ? participantId + 1 : participantId - 3,
        deaths: blue ? 3 : 5,
        assists: blue ? 8 : 4,
        goldEarned: blue ? 10000 + participantId * 300 : 9000 + participantId * 200,
        totalMinionsKilled: lane === 'JUNGLE' ? 20 : 170 + participantId,
        neutralMinionsKilled: lane === 'JUNGLE' ? 120 : 8,
        totalDamageDealtToChampions: blue ? 19000 + participantId * 500 : 15000 + participantId * 450,
        totalDamageTaken: blue ? 21000 + participantId * 350 : 23000 + participantId * 300,
        totalHeal: 1000,
        visionScore: 18 + participantId,
        item0: 1001,
        item1: 3006,
        item2: 6672,
        item3: 3031,
        item4: 0,
        item5: 0,
        item6: 3363,
        perk0: 8005,
        perk1: 9111,
        perk2: 9104,
        perk3: 8014,
        perk4: 8304,
        perk5: 8345,
        perkPrimaryStyle: 8000,
        perkSubStyle: 8300,
        turretPlatesTaken: blue ? 2 : 0,
        playerAugment1: participantId === 1 ? 2005 : undefined,
        playerAugment2: participantId === 1 ? 1346 : undefined
      }
    }
  })
}

function createIdentities(): MatchHistory['participantIdentities'] {
  return Array.from({ length: 10 }, (_, index) => {
    const participantId = index + 1
    return {
      participantId,
      player: {
        accountId: participantId,
        summonerId: participantId,
        summonerName: `Summoner ${participantId}`,
        gameName: participantId === 1 ? 'Current' : `Player${participantId}`,
        tagLine: 'CN1',
        puuid: participantId === 1 ? 'current-puuid' : `player-${participantId}-puuid`,
        platformId: 'HN1'
      }
    }
  })
}

function createTimeline(): MatchTimeline {
  return {
    gameId: 987654321,
    frames: [
      createFrame(0, 500, 500),
      createFrame(900000, 6500, 5400),
      {
        ...createFrame(1200000, 8500, 7600),
        events: [
          {
            eventType: 'CHAMPION_KILL',
            timestamp: 960000,
            killerId: 7,
            victimId: 1
          },
          {
            eventType: 'ELITE_MONSTER_KILL',
            timestamp: 990000,
            killerId: 3,
            teamId: 100,
            monsterType: 'DRAGON'
          }
        ]
      }
    ]
  }
}

function createFrame(timestamp: number, blueBaseGold: number, redBaseGold: number): NonNullable<MatchTimeline['frames']>[number] {
  const participantFrames: NonNullable<NonNullable<MatchTimeline['frames']>[number]['participantFrames']> = {}
  for (let participantId = 1; participantId <= 10; participantId += 1) {
    const blue = participantId <= 5
    participantFrames[String(participantId)] = {
      participantId,
      totalGold: (blue ? blueBaseGold : redBaseGold) + participantId * 100,
      minionsKilled: 80 + participantId
    }
  }
  return { timestamp, participantFrames, events: [] }
}

function createChampionNamesById(): Record<number, string> {
  return Object.fromEntries(
    Array.from({ length: 10 }, (_, index) => [11 + index, index === 0 ? '盖伦' : `英雄称号${11 + index}`])
  )
}

test('uses bundled champion display names when no champion lookup is provided', () => {
  const championIds = [22, 81, 67, 950, 141, 103, 222, 412, 64, 266]
  const matchHistory = {
    ...createMatchHistory(),
    participants: createParticipants().map((participant, index) => ({
      ...participant,
      championId: championIds[index] ?? participant.championId
    }))
  }
  const gameDetail = {
    ...createGameDetail(),
    participants: createGameDetail().participants.map((participant, index) => ({
      ...participant,
      championId: championIds[index] ?? participant.championId
    }))
  }

  const snapshot = buildPostgameAiInputSnapshot({
    matchHistory,
    gameDetail,
    timeline: createTimeline(),
    currentPuuid: 'current-puuid',
    currentSummonerName: 'Current#CN1'
  })

  assert.equal(snapshot.analysisBrief.matchFacts[1], '当前用户：我方；英雄：寒冰射手；位置：上单。')
  assert.match(snapshot.analysisBrief.playerFacts[1] ?? '', /【我方打野｜探险家】/)
  assert.match(snapshot.analysisBrief.playerFacts[2] ?? '', /【我方中单｜暗夜猎手】/)
  assert.match(snapshot.analysisBrief.playerFacts[3] ?? '', /【我方下路｜百裂冥犬】/)
  assert.doesNotMatch(JSON.stringify(snapshot.analysisBrief), /英雄ID/)
})

test('builds a compact postgame AI input snapshot from match history, detail, and timeline', () => {
  const snapshot = buildPostgameAiInputSnapshot({
    matchHistory: createMatchHistory(),
    gameDetail: createGameDetail(),
    timeline: createTimeline(),
    currentPuuid: 'current-puuid',
    currentSummonerName: 'Current#CN1',
    championNamesById: createChampionNamesById()
  })

  assert.equal(snapshot.schemaVersion, 'postgame_ai_input_snapshot.v3')
  assert.equal('mode' in snapshot, false)
  assert.equal('match' in snapshot, false)
  assert.equal('currentPlayerKey' in snapshot, false)
  assert.equal('teams' in snapshot, false)
  assert.equal('players' in snapshot, false)
  assert.equal('timeline' in snapshot, false)
  assert.equal('dataQuality' in snapshot, false)
  assert.equal(snapshot.analysisType, 'postgame')
  assert.match(snapshot.inputHash, /^[a-f0-9]{8,}$/)
  assert.equal(snapshot.analysisBrief.schemaVersion, 'postgame_analysis_brief.v1')
  assert.equal(snapshot.analysisBrief.language, 'zh-CN')
  assert.equal(snapshot.analysisBrief.matchFacts[0], '模式：单双排位；时间：30:00；结果：我方获胜。')
  assert.equal(snapshot.analysisBrief.matchFacts[1], '当前用户：我方；英雄：盖伦；位置：上单。')
  assert.equal(snapshot.analysisBrief.playerFacts.length, 10)
  assert.equal(snapshot.analysisBrief.playerFacts.filter(fact => fact.includes('【你｜')).length, 1)
  assert.match(snapshot.analysisBrief.playerFacts[0] ?? '', /【你｜我方上单｜盖伦】/)
  assert.match(snapshot.analysisBrief.playerFacts[5] ?? '', /【敌方上单｜英雄称号16】/)
  assert.doesNotMatch(JSON.stringify(snapshot.analysisBrief.playerFacts), /英雄ID/)
  assert.ok(snapshot.analysisBrief.teamFacts.some(fact => /我方/.test(fact)))
  assert.ok(snapshot.analysisBrief.teamFacts.some(fact => /15分钟团队经济/.test(fact)))
  assert.ok(snapshot.analysisBrief.teamFacts.some(fact => /15分钟对位经济/.test(fact)))
  assert.doesNotMatch(JSON.stringify(snapshot.analysisBrief.playerFacts), /KDA \d/)
  assert.doesNotMatch(JSON.stringify(snapshot.analysisBrief.playerFacts), /15分钟团队经济|15分钟上单经济|15分钟打野经济|15分钟中单经济|15分钟下路经济|15分钟辅助经济/)
  assert.deepEqual(snapshot.analysisBrief.dataQualityFacts, [])
})

test('merges final RP index into each player fact without labels or sampled series', () => {
  const snapshot = buildPostgameAiInputSnapshot({
    matchHistory: createMatchHistory(),
    gameDetail: createGameDetail(),
    timeline: createTimeline(),
    currentPuuid: 'current-puuid',
    currentSummonerName: 'Current#CN1',
    championNamesById: createChampionNamesById()
  })

  const timelineRpFacts = snapshot.analysisBrief.timelineFacts.filter(fact => fact.includes('RP'))
  const playerRpFacts = snapshot.analysisBrief.playerFacts.filter(fact => fact.includes('RP'))
  const currentRpFact = playerRpFacts.find(fact => fact.includes('【你｜')) ?? ''

  assert.equal(timelineRpFacts.length, 0)
  assert.equal(playerRpFacts.length, 10)
  assert.ok(playerRpFacts.every(fact => /RP终局\d+\.\d/.test(fact)))
  assert.equal(playerRpFacts.filter(fact => fact.includes('RP标签：')).length, 0)
  assert.doesNotMatch(currentRpFact, /RP标签：/)
  assert.doesNotMatch(JSON.stringify(playerRpFacts), /RP每3分钟/)
  assert.doesNotMatch(JSON.stringify(playerRpFacts), /RP每分钟/)
  assert.doesNotMatch(JSON.stringify(playerRpFacts), /胜局|败局/)
})

test('adds RP unavailable quality fact without inventing fake RP timelines', () => {
  const matchHistory = {
    ...createMatchHistory(),
    gameDuration: 540
  }
  const gameDetail = {
    ...createGameDetail(),
    gameDuration: 540
  }
  const snapshot = buildPostgameAiInputSnapshot({
    matchHistory,
    gameDetail,
    timeline: createTimeline(),
    currentPuuid: 'current-puuid',
    currentSummonerName: 'Current#CN1',
    championNamesById: createChampionNamesById()
  })

  const rpFacts = snapshot.analysisBrief.timelineFacts.filter(fact => fact.includes('RP指数'))

  assert.equal(rpFacts.length, 1)
  assert.match(rpFacts[0] ?? '', /RP指数不可用/)
  assert.match(rpFacts[0] ?? '', /10 分钟/)
  assert.doesNotMatch(JSON.stringify(rpFacts), /终局|每分钟/)
})

test('adds compact final item and rune build facts to every player line', () => {
  setGameAssetMetadataForTest({
    version: 'test',
    locale: 'zh_CN',
    items: {
      1001: { id: 1001, name: '速度之靴' },
      3006: { id: 3006, name: '狂战士胫甲' },
      6672: { id: 6672, name: '海妖杀手' },
      3031: { id: 3031, name: '无尽之刃' },
      3363: { id: 3363, name: '远见改造' }
    },
    perks: {
      8005: { id: 8005, name: '强攻' },
      9111: { id: 9111, name: '凯旋' },
      9104: { id: 9104, name: '传说：欢欣' },
      8014: { id: 8014, name: '致命一击' },
      8304: { id: 8304, name: '神奇之鞋' },
      8345: { id: 8345, name: '饼干配送' },
      8000: { id: 8000, name: '精密' },
      8300: { id: 8300, name: '启迪' }
    }
  })

  const snapshot = buildPostgameAiInputSnapshot({
    matchHistory: createMatchHistory(),
    gameDetail: createGameDetail(),
    timeline: createTimeline(),
    currentPuuid: 'current-puuid',
    currentSummonerName: 'Current#CN1',
    championNamesById: createChampionNamesById()
  })

  const currentPlayerFact = snapshot.analysisBrief.playerFacts[0] ?? ''
  assert.match(currentPlayerFact, /最终装备：速度之靴、狂战士胫甲、海妖杀手、无尽之刃/)
  assert.match(currentPlayerFact, /符文：精密\/启迪，主系：强攻、凯旋、传说：欢欣、致命一击，副系：神奇之鞋、饼干配送/)
  assert.doesNotMatch(currentPlayerFact, /远见改造|1001|8005/)
  assert.equal(snapshot.analysisBrief.playerFacts.filter(fact => fact.includes('最终装备：')).length, 10)
  assert.equal(snapshot.analysisBrief.playerFacts.filter(fact => fact.includes('符文：')).length, 10)
})

test('adds explicit player ranking and highlight facts for postgame AI wording', () => {
  const detail = createGameDetail()
  detail.participants = detail.participants.map(participant => {
    if (participant.participantId !== 1) {
      return participant
    }

    return {
      ...participant,
      stats: {
        ...participant.stats,
        kills: 18,
        deaths: 12,
        assists: 25,
        goldEarned: 22000,
        totalDamageDealtToChampions: 52000,
        doubleKills: 2,
        tripleKills: 1,
        quadraKills: 1,
        pentaKills: 1,
        largestKillingSpree: 9,
        legendaryCount: 1,
        turretPlatesTaken: 3
      }
    }
  })

  const snapshot = buildPostgameAiInputSnapshot({
    matchHistory: createMatchHistory(),
    gameDetail: detail,
    timeline: createTimeline(),
    currentPuuid: 'current-puuid',
    currentSummonerName: 'Current#CN1',
    championNamesById: createChampionNamesById()
  })

  const currentPlayerFact = snapshot.analysisBrief.playerFacts[0] ?? ''
  assert.match(currentPlayerFact, /排名：全场伤害第一、全场打钱第一、全场助攻第一、全场死亡最多/)
  assert.doesNotMatch(currentPlayerFact, /队内伤害第一|队内打钱第一|队内助攻第一|队内死亡最多/)
  assert.match(currentPlayerFact, /高光：双杀2次、三杀1次、四杀1次、五杀1次、最高连杀9、超神1次/)
  assert.match(currentPlayerFact, /个人镀层3/)
  assert.doesNotMatch(currentPlayerFact, /，镀层3/)
})

test('keeps one mode-neutral snapshot hash for review and praise usage', () => {
  const base = {
    matchHistory: createMatchHistory(),
    gameDetail: createGameDetail(),
    timeline: createTimeline(),
    currentPuuid: 'current-puuid',
    currentSummonerName: 'Current#CN1'
  }
  const reviewUse = buildPostgameAiInputSnapshot(base)
  const praiseUse = buildPostgameAiInputSnapshot(base)

  assert.equal(reviewUse.analysisType, 'postgame')
  assert.equal(praiseUse.analysisType, 'postgame')
  assert.equal(reviewUse.inputHash, praiseUse.inputHash)
  assert.equal(createPostgameAiInputHash({ ...reviewUse, builtAt: '2099-01-01T00:00:00.000Z', inputHash: 'changed' }), reviewUse.inputHash)
})

test('does not copy raw match history, game detail, timeline, puuids, or summoner names into the snapshot brief', () => {
  const snapshot = buildPostgameAiInputSnapshot({
    matchHistory: createMatchHistory(),
    gameDetail: createGameDetail(),
    timeline: createTimeline(),
    currentPuuid: 'current-puuid',
    currentSummonerName: 'Current#CN1'
  })
  const serialized = JSON.stringify(snapshot)

  assert.doesNotMatch(serialized, /matchHistory|gameDetail|rawTimeline|participantIdentities|rawFrameJson|rawEventJson/)
  assert.doesNotMatch(serialized, /current-puuid|player-2-puuid|987654321/)
  assert.doesNotMatch(JSON.stringify(snapshot.analysisBrief), /Current|Player2|Summoner 1|Summoner 2|CN1|current-puuid|player-2-puuid|987654321/)
})

test('orders timeline facts chronologically from early game to later events', () => {
  const snapshot = buildPostgameAiInputSnapshot({
    matchHistory: createMatchHistory(),
    gameDetail: createGameDetail(),
    timeline: createTimeline(),
    currentPuuid: 'current-puuid',
    currentSummonerName: 'Current#CN1',
    championNamesById: createChampionNamesById()
  })
  const facts = snapshot.analysisBrief.timelineFacts
  const deathIndex = facts.findIndex(fact => fact.startsWith('16:00') && fact.includes('死亡'))
  const dragonIndex = facts.findIndex(fact => fact.startsWith('16:30') && fact.includes('小龙'))

  assert.notEqual(deathIndex, -1)
  assert.notEqual(dragonIndex, -1)
  assert.ok(deathIndex < dragonIndex)
})

test('records timeline data quality warnings without inventing missing timeline metrics', () => {
  const snapshot = buildPostgameAiInputSnapshot({
    matchHistory: createMatchHistory(),
    gameDetail: createGameDetail(),
    timeline: null,
    currentPuuid: 'current-puuid',
    currentSummonerName: 'Current#CN1'
  })

  assert.ok(snapshot.analysisBrief.timelineFacts.some(fact => fact.includes('缺少 timeline，不能分析具体时间点、死亡前视野或资源交换')))
  assert.ok(snapshot.analysisBrief.dataQualityFacts.some(fact => fact.includes('缺少 timeline')))
  assert.doesNotMatch(JSON.stringify(snapshot), /teamGoldDiffAt15|laneGoldDiffAt15/)
})

test('keeps 15-minute team and matchup gold differences in team facts only', () => {
  const snapshot = buildPostgameAiInputSnapshot({
    matchHistory: createMatchHistory(),
    gameDetail: createGameDetail(),
    timeline: createTimeline(),
    currentPuuid: 'current-puuid',
    currentSummonerName: 'Current#CN1',
    championNamesById: createChampionNamesById()
  })

  assert.ok(snapshot.analysisBrief.teamFacts.some(fact => /我方.*15分钟团队经济\+\d/.test(fact)))
  assert.ok(snapshot.analysisBrief.teamFacts.some(fact => /敌方.*15分钟团队经济-\d/.test(fact)))
  assert.ok(snapshot.analysisBrief.teamFacts.some(fact => /15分钟对位经济：上单/.test(fact)))
  assert.doesNotMatch(JSON.stringify(snapshot.analysisBrief.playerFacts), /15分钟.*经济/)
  assert.doesNotMatch(JSON.stringify(snapshot.analysisBrief.timelineFacts), /15分钟团队经济差/)
})

test('omits unknown or zero turret plate text from the natural-language brief', () => {
  const detail = createGameDetail()
  detail.teamObjectives = detail.teamObjectives?.map(summary => ({
    ...summary,
    turretPlateKills: undefined,
    turretPlatesTaken: undefined
  }))
  detail.participants = detail.participants.map(participant => ({
    ...participant,
    stats: {
      ...participant.stats,
      turretPlatesTaken: 0
    }
  }))

  const snapshot = buildPostgameAiInputSnapshot({
    matchHistory: createMatchHistory(),
    gameDetail: detail,
    timeline: createTimeline(),
    currentPuuid: 'current-puuid',
    currentSummonerName: 'Current#CN1',
    championNamesById: createChampionNamesById()
  })

  const brief = JSON.stringify(snapshot.analysisBrief)
  assert.doesNotMatch(brief, /镀层未知/)
  assert.doesNotMatch(brief, /镀层0/)
})
