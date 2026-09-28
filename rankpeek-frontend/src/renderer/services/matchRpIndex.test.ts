import test from 'node:test'
import assert from 'node:assert/strict'
import type { GameDetail, GameParticipant, MatchTimeline, TimelineEvent, TimelineFrame } from '../types/api.ts'
import {
  RP_TREND_LABELS,
  createMatchRpIndexModel,
  createRpTrendLabel,
  formatRpScore
} from './matchRpIndex.ts'

const LANES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const

test('creates one RP point per minute from 0:00 to the last complete minute', () => {
  const model = createMatchRpIndexModel(createTimeline(12, {
    mutateFrame: (frame, minute) => {
      const top = frame.participantFrames?.['1']
      const enemyTop = frame.participantFrames?.['6']
      if (top && enemyTop) {
        top.totalGold = 500 + minute * 460
        enemyTop.totalGold = 500 + minute * 340
        top.minionsKilled = minute * 8
        enemyTop.minionsKilled = minute * 6
      }
    },
    events: [
      killEvent(180_000, 1, 6),
      killEvent(360_000, 1, 6, [2])
    ]
  }), createDetail())

  assert.equal(model.status, 'ready')
  const player = model.players.find(entry => entry.participantId === 1)
  const opponent = model.players.find(entry => entry.participantId === 6)

  assert.ok(player)
  assert.ok(opponent)
  assert.equal(player.points.length, 13)
  assert.equal(player.points[0]?.minute, 0)
  assert.equal(player.points[0]?.score, 5)
  assert.equal(player.points.at(-1)?.minute, 12)
  assert.equal(player.finalScore, player.points.at(-1)?.score)
  assert.ok(player.finalScore > opponent.finalScore)
  assert.match(formatRpScore(player.finalScore), /^\d+\.\d$/)

  const sparseTimeline = createTimeline(12, {
    events: [objectiveEvent(1_500_000, 2, 'BARON')]
  })
  const sparseModel = createMatchRpIndexModel(sparseTimeline, createDetail({ gameDuration: 1800 }))
  assert.equal(sparseModel.status, 'ready')
  assert.equal(sparseModel.maxMinute, 12)
})

test('refuses non-ranked, short, missing timeline, and incomplete lane matchup inputs', () => {
  assert.equal(createMatchRpIndexModel(createTimeline(12), createDetail({ queueId: 450 })).status, 'unavailable')
  assert.equal(createMatchRpIndexModel(createTimeline(9), createDetail()).status, 'unavailable')
  assert.equal(createMatchRpIndexModel(null, createDetail()).status, 'unavailable')

  const missingSupport = createDetail({
    participants: createParticipants().filter(participant => participant.participantId !== 10)
  })
  assert.equal(createMatchRpIndexModel(createTimeline(12), missingSupport).status, 'unavailable')
})

test('samples the previous frame for each minute and does not read future frame state', () => {
  const timeline: MatchTimeline = {
    frames: [
      frameAt(0, { topGold: 500, enemyTopGold: 500 }),
      frameAt(270_000, { topGold: 1500, enemyTopGold: 1500 }),
      frameAt(330_000, { topGold: 2600, enemyTopGold: 1500 }),
      frameAt(600_000, { topGold: 3600, enemyTopGold: 2400 })
    ],
    events: []
  }

  const model = createMatchRpIndexModel(timeline, createDetail({ gameDuration: 600 }))
  assert.equal(model.status, 'ready')
  const player = model.players.find(entry => entry.participantId === 1)
  assert.ok(player)

  assert.equal(player.points.find(point => point.minute === 5)?.score, 5)
  assert.ok((player.points.find(point => point.minute === 6)?.score ?? 0) > 5)
})

test('uses CS as minions plus jungle minions and ignores XP when level is unchanged', () => {
  const timeline = createTimeline(12, {
    mutateFrame: frame => {
      const top = frame.participantFrames?.['1']
      const enemyTop = frame.participantFrames?.['6']
      if (top && enemyTop) {
        top.totalGold = 1500
        enemyTop.totalGold = 1500
        top.level = 4
        enemyTop.level = 4
        top.xp = 100
        enemyTop.xp = 10000
        top.minionsKilled = 0
        top.jungleMinionsKilled = 24
        enemyTop.minionsKilled = 10
        enemyTop.jungleMinionsKilled = 0
      }
    }
  })

  const model = createMatchRpIndexModel(timeline, createDetail())
  assert.equal(model.status, 'ready')
  const player = model.players.find(entry => entry.participantId === 1)
  assert.ok(player)
  assert.ok((player.points.find(point => point.minute === 1)?.score ?? 0) > 5)
})

test('keeps kill participation neutral when the team has no kills', () => {
  const model = createMatchRpIndexModel(createTimeline(12), createDetail())
  assert.equal(model.status, 'ready')
  const top = model.players.find(entry => entry.participantId === 1)
  const enemyTop = model.players.find(entry => entry.participantId === 6)

  assert.ok(top)
  assert.ok(enemyTop)
  assert.equal(top.finalScore, 5)
  assert.equal(enemyTop.finalScore, 5)
})

test('does not make lane opponents perfect mirrors when both have team impact', () => {
  const timeline = createTimeline(18, {
    mutateFrame: (frame, minute) => {
      const top = frame.participantFrames?.['1']
      const enemyTop = frame.participantFrames?.['6']
      if (top && enemyTop) {
        top.totalGold = 700 + minute * 520
        enemyTop.totalGold = 700 + minute * 490
        top.minionsKilled = minute * 8
        enemyTop.minionsKilled = minute * 7
        top.level = 1 + Math.floor(minute / 2.4)
        enemyTop.level = 1 + Math.floor(minute / 2.5)
      }
    },
    events: [
      killEvent(300_000, 1, 7, [2]),
      killEvent(360_000, 6, 2, [7]),
      killEvent(600_000, 1, 7, [3]),
      killEvent(660_000, 6, 2, [8])
    ]
  })

  const model = createMatchRpIndexModel(timeline, createDetail({ gameDuration: 1080 }))
  assert.equal(model.status, 'ready')
  const top = model.players.find(entry => entry.participantId === 1)
  const enemyTop = model.players.find(entry => entry.participantId === 6)

  assert.ok(top)
  assert.ok(enemyTop)
  assert.ok(top.finalScore > 5)
  assert.ok(enemyTop.finalScore > 5)
  assert.notEqual(Number((top.finalScore + enemyTop.finalScore).toFixed(1)), 10)
})

test('prioritizes personal team impact over lane-only matchup pressure', () => {
  const timeline = createTimeline(18, {
    mutateFrame: (frame, minute) => {
      const top = frame.participantFrames?.['1']
      const enemyTop = frame.participantFrames?.['6']
      if (top && enemyTop) {
        top.totalGold = 650 + minute * 405
        enemyTop.totalGold = 650 + minute * 520
        top.minionsKilled = minute * 6
        enemyTop.minionsKilled = minute * 8
        top.level = 1 + Math.floor(minute / 2.7)
        enemyTop.level = 1 + Math.floor(minute / 2.4)
      }
    },
    events: [
      killEvent(300_000, 1, 7, [2]),
      killEvent(480_000, 3, 8, [1]),
      objectiveEvent(600_000, 2, 'DRAGON'),
      killEvent(720_000, 1, 9, [3]),
      killEvent(900_000, 4, 7, [1]),
      objectiveEvent(960_000, 2, 'BARON')
    ]
  })

  const model = createMatchRpIndexModel(timeline, createDetail({ gameDuration: 1080 }))
  assert.equal(model.status, 'ready')
  const teamImpactTop = model.players.find(entry => entry.participantId === 1)
  const laneOnlyTop = model.players.find(entry => entry.participantId === 6)

  assert.ok(teamImpactTop)
  assert.ok(laneOnlyTop)
  assert.ok(teamImpactTop.finalScore > laneOnlyTop.finalScore)
})

test('pushes severe team burden below neutral without depending on lane mirror pressure', () => {
  const events: TimelineEvent[] = [
    killEvent(180_000, 2, 7),
    killEvent(240_000, 3, 8),
    killEvent(300_000, 4, 9),
    killEvent(360_000, 5, 10),
    killEvent(420_000, 2, 7),
    killEvent(480_000, 3, 8),
    killEvent(540_000, 4, 9),
    killEvent(600_000, 5, 10),
    killEvent(660_000, 6, 1),
    killEvent(720_000, 7, 1),
    killEvent(780_000, 8, 1),
    killEvent(840_000, 9, 1),
    killEvent(900_000, 10, 1),
    killEvent(960_000, 6, 1),
    killEvent(1_020_000, 7, 1),
    killEvent(1_080_000, 8, 1)
  ]
  const timeline = createTimeline(24, {
    mutateFrame: (frame, minute) => {
      const top = frame.participantFrames?.['1']
      const enemyTop = frame.participantFrames?.['6']
      if (top && enemyTop) {
        top.totalGold = 500 + minute * 230
        enemyTop.totalGold = 500 + minute * 260
        top.minionsKilled = minute * 3
        enemyTop.minionsKilled = minute * 3
        top.level = 1 + Math.floor(minute / 4)
        enemyTop.level = 1 + Math.floor(minute / 4)
      }
    },
    events
  })

  const model = createMatchRpIndexModel(timeline, createDetail({ gameDuration: 1440 }))
  assert.equal(model.status, 'ready')
  const burdenTop = model.players.find(entry => entry.participantId === 1)
  const enemyTop = model.players.find(entry => entry.participantId === 6)

  assert.ok(burdenTop)
  assert.ok(enemyTop)
  assert.ok(burdenTop.finalScore < 3.2)
  assert.ok(Number(Math.abs(burdenTop.finalScore + enemyTop.finalScore - 10).toFixed(1)) > 0.5)
})

test('keeps functional low-economy contribution from being judged by matchup alone', () => {
  const timeline = createTimeline(24, {
    mutateFrame: (frame, minute) => {
      const support = frame.participantFrames?.['5']
      const enemySupport = frame.participantFrames?.['10']
      if (support && enemySupport) {
        support.totalGold = 500 + minute * 185
        enemySupport.totalGold = 500 + minute * 255
        support.minionsKilled = 0
        enemySupport.minionsKilled = minute
        support.level = 1 + Math.floor(minute / 3.3)
        enemySupport.level = 1 + Math.floor(minute / 2.9)
      }
    },
    events: [
      killEvent(240_000, 2, 7, [5]),
      killEvent(360_000, 3, 8, [5]),
      objectiveEvent(480_000, 2, 'DRAGON'),
      killEvent(720_000, 4, 9, [5]),
      killEvent(900_000, 5, 10, [4]),
      objectiveEvent(960_000, 2, 'BARON'),
      wardEvent(930_000, 'WARD_PLACED', 5),
      wardEvent(940_000, 'WARD_KILL', 5)
    ]
  })

  const model = createMatchRpIndexModel(timeline, createDetail({ gameDuration: 1440 }))
  assert.equal(model.status, 'ready')
  const functionalSupport = model.players.find(entry => entry.participantId === 5)
  const enemySupport = model.players.find(entry => entry.participantId === 10)

  assert.ok(functionalSupport)
  assert.ok(enemySupport)
  assert.ok(functionalSupport.finalScore > 5.5)
  assert.ok(functionalSupport.finalScore > enemySupport.finalScore)
})

test('scores near-zero effective participation close to zero without flattening late scores', () => {
  const participants = createParticipants()
  setParticipantStats(participants, 8, {
    kills: 1,
    deaths: 4,
    assists: 0,
    totalMinionsKilled: 119,
    neutralMinionsKilled: 0,
    goldEarned: 6240,
    totalDamageDealtToChampions: 7040,
    totalDamageTaken: 22600,
    visionScore: 3
  })
  setParticipantStats(participants, 9, {
    kills: 0,
    deaths: 3,
    assists: 2,
    totalMinionsKilled: 26,
    neutralMinionsKilled: 0,
    goldEarned: 3340,
    totalDamageDealtToChampions: 182,
    totalDamageTaken: 3570,
    visionScore: 4
  })
  for (const participant of participants) {
    if (participant.participantId !== 8 && participant.participantId !== 9) {
      setParticipantStats(participants, participant.participantId, {
        kills: participant.teamId === 100 ? 4 : 2,
        deaths: participant.teamId === 100 ? 1 : 2,
        assists: participant.teamId === 100 ? 5 : 3,
        totalMinionsKilled: 120,
        neutralMinionsKilled: participant.timeline?.lane === 'JUNGLE' ? 36 : 0,
        goldEarned: participant.teamId === 100 ? 8400 : 6900,
        totalDamageDealtToChampions: participant.teamId === 100 ? 12500 : 6200,
        totalDamageTaken: participant.teamId === 100 ? 10500 : 9800,
        visionScore: participant.timeline?.lane === 'UTILITY' ? 19 : 10
      })
    }
  }

  const timeline = createTimeline(18, {
    mutateFrame: (frame, minute) => {
      const mundo = frame.participantFrames?.['8']
      const cat = frame.participantFrames?.['9']
      if (mundo && cat) {
        mundo.totalGold = 500 + minute * 310
        mundo.minionsKilled = minute * 6
        mundo.level = 1 + Math.floor(minute / 2.8)
        cat.totalGold = 500 + minute * 155
        cat.minionsKilled = Math.floor(minute * 1.4)
        cat.level = 1 + Math.floor(minute / 4.2)
      }
    },
    events: [
      killEvent(180_000, 1, 9),
      killEvent(240_000, 2, 8),
      killEvent(300_000, 3, 9),
      killEvent(360_000, 4, 8),
      killEvent(420_000, 5, 8),
      killEvent(480_000, 6, 1, [9]),
      killEvent(540_000, 7, 2, [9]),
      killEvent(600_000, 1, 8),
      killEvent(660_000, 2, 9),
      killEvent(720_000, 8, 3),
      killEvent(780_000, 10, 4),
      killEvent(840_000, 6, 5),
      killEvent(900_000, 7, 1),
      killEvent(960_000, 10, 2)
    ]
  })

  const model = createMatchRpIndexModel(timeline, createDetail({ gameDuration: 1080, participants }))
  assert.equal(model.status, 'ready')
  const mundo = model.players.find(entry => entry.participantId === 8)
  const cat = model.players.find(entry => entry.participantId === 9)

  assert.ok(mundo)
  assert.ok(cat)
  assert.ok(cat.finalScore <= 1.2)
  assert.ok(cat.finalScore < mundo.finalScore)
  assert.equal(cat.points[0]?.score, 5)
  assert.ok(
    new Set(cat.points.slice(-4).map(point => point.score)).size > 1,
    JSON.stringify(cat.points.slice(-4))
  )
})

test('groups same-team voidgrubs and applies objective window impact only after the objective starts', () => {
  const timeline = createTimeline(12, {
    events: [
      killEvent(455_000, 2, 7, [1]),
      objectiveEvent(480_000, 2, 'HORDE'),
      objectiveEvent(520_000, 2, 'HORDE'),
      killEvent(540_000, 2, 7)
    ]
  })

  const model = createMatchRpIndexModel(timeline, createDetail())
  assert.equal(model.status, 'ready')
  const jungle = model.players.find(entry => entry.participantId === 2)
  assert.ok(jungle)

  assert.equal(jungle.points.find(point => point.minute === 7)?.score, 5)
  assert.ok((jungle.points.find(point => point.minute === 9)?.score ?? 0) > 5)
})

test('treats direct elder dragon monster types as highest-resource objectives', () => {
  const regularDragon = createMatchRpIndexModel(createTimeline(12, {
    events: [
      objectiveEvent(480_000, 2, 'DRAGON')
    ]
  }), createDetail())
  const elderDragon = createMatchRpIndexModel(createTimeline(12, {
    events: [
      objectiveEvent(480_000, 2, 'ELDER_DRAGON')
    ]
  }), createDetail())

  assert.equal(regularDragon.status, 'ready')
  assert.equal(elderDragon.status, 'ready')
  const regularJungle = regularDragon.players.find(entry => entry.participantId === 2)
  const elderJungle = elderDragon.players.find(entry => entry.participantId === 2)

  assert.ok(regularJungle)
  assert.ok(elderJungle)
  assert.ok((elderJungle.points.find(point => point.minute === 9)?.score ?? 0) > (regularJungle.points.find(point => point.minute === 9)?.score ?? 0))
})

test('assigns a win-loss-aware trend label only to the requested participant', () => {
  const model = createMatchRpIndexModel(createTimeline(18, {
    mutateFrame: (frame, minute) => {
      const top = frame.participantFrames?.['1']
      const enemyTop = frame.participantFrames?.['6']
      if (top && enemyTop) {
        top.totalGold = 500 + minute * 520
        enemyTop.totalGold = 500 + minute * 260
        top.minionsKilled = minute * 9
        enemyTop.minionsKilled = minute * 4
      }
    },
    events: [
      killEvent(180_000, 1, 6),
      killEvent(360_000, 1, 6),
      killEvent(720_000, 1, 6, [2])
    ]
  }), createDetail(), { trendLabelParticipantId: 1 })

  assert.equal(model.status, 'ready')
  const winner = model.players.find(entry => entry.participantId === 1)
  const loser = model.players.find(entry => entry.participantId === 6)

  assert.ok(winner)
  assert.ok(loser)
  assert.equal(winner.trendLabel, '一路压着打到结束')
  assert.equal(loser.trendLabel, undefined)
  assert.ok(winner.trendLabel && RP_TREND_LABELS.includes(winner.trendLabel))
  assert.ok(RP_TREND_LABELS.includes('后程发力越打越猛'))
  assert.ok(RP_TREND_LABELS.includes('人打得不差，局没站到这边'))
  assert.doesNotMatch(winner.trendLabel, /胜|败/)
})

test('labels a one-way low RP collapse as suppressed instead of roller coaster', () => {
  const label = createRpTrendLabel(createRpTrendPoints([
    5.0,
    4.7,
    4.4,
    3.1,
    2.9,
    2.7,
    2.6,
    1.9,
    1.3,
    0.7,
    1.0,
    1.7
  ]), false)

  assert.equal(label, '整局被压得很难展开')
})

test('labels only real three-phase reversals as roller coaster', () => {
  const label = createRpTrendLabel(createRpTrendPoints([
    6.4,
    6.7,
    6.1,
    6.3,
    4.1,
    4.0,
    4.3,
    4.2,
    6.2,
    6.5,
    6.1,
    6.4
  ]), true)

  assert.equal(label, '过山车式发挥')
})

function createDetail(options: {
  queueId?: number
  gameDuration?: number
  participants?: GameParticipant[]
} = {}): GameDetail {
  const participants = options.participants ?? createParticipants()
  return {
    gameId: 9001,
    gameMode: 'CLASSIC',
    gameType: 'MATCHED_GAME',
    mapId: 11,
    queueId: options.queueId ?? 420,
    gameDuration: options.gameDuration ?? 720,
    gameCreation: 1710000000000,
    participantIdentities: participants.map(participant => ({
      participantId: participant.participantId,
      player: {
        accountId: participant.participantId,
        puuid: `puuid-${participant.participantId}`,
        platformId: 'KR',
        summonerName: `Player${participant.participantId}`,
        gameName: `Player${participant.participantId}`,
        tagLine: `T${participant.participantId}`,
        summonerId: participant.participantId
      }
    })),
    participants
  }
}

function createParticipants(): GameParticipant[] {
  return Array.from({ length: 10 }, (_item, index) => {
    const participantId = index + 1
    const teamId = participantId <= 5 ? 100 : 200
    const lane = LANES[(participantId - 1) % 5] ?? 'TOP'
    return {
      participantId,
      teamId,
      championId: 100 + participantId,
      spell1Id: 4,
      spell2Id: 14,
      teamPosition: lane,
      individualPosition: lane,
      timeline: { lane, role: lane === 'JUNGLE' ? 'NONE' : 'SOLO', teamPosition: lane },
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
        visionScore: 0,
        visionWardsBoughtInGame: 0,
        wardsPlaced: 0,
        wardsKilled: 0,
        largestMultiKill: 0,
        doubleKills: 0,
        tripleKills: 0,
        quadraKills: 0,
        pentaKills: 0
      }
    }
  })
}

function setParticipantStats(
  participants: GameParticipant[],
  participantId: number,
  stats: Partial<NonNullable<GameParticipant['stats']>>
): void {
  const participant = participants.find(entry => entry.participantId === participantId)
  assert.ok(participant)
  participant.stats = {
    ...participant.stats,
    ...stats
  }
}

function createTimeline(
  minutes: number,
  options: {
    mutateFrame?: (frame: TimelineFrame, minute: number) => void
    events?: TimelineEvent[]
  } = {}
): MatchTimeline {
  const frames = Array.from({ length: minutes + 1 }, (_item, minute) => {
    const frame = frameAt(minute * 60_000)
    options.mutateFrame?.(frame, minute)
    return frame
  })
  return {
    frames,
    events: options.events ?? []
  }
}

function frameAt(timestamp: number, overrides: { topGold?: number; enemyTopGold?: number } = {}): TimelineFrame {
  const participantFrames: NonNullable<TimelineFrame['participantFrames']> = {}
  for (let participantId = 1; participantId <= 10; participantId += 1) {
    const minute = Math.floor(timestamp / 60_000)
    participantFrames[String(participantId)] = {
      participantId,
      totalGold: 500 + minute * 300,
      currentGold: 0,
      level: 1 + Math.floor(minute / 3),
      xp: minute * 100,
      minionsKilled: minute * 4,
      jungleMinionsKilled: 0
    }
  }
  if (overrides.topGold !== undefined) {
    participantFrames['1']!.totalGold = overrides.topGold
  }
  if (overrides.enemyTopGold !== undefined) {
    participantFrames['6']!.totalGold = overrides.enemyTopGold
  }
  return { timestamp, participantFrames, events: [] }
}

function killEvent(timestamp: number, killerId: number, victimId: number, assistingParticipantIds: number[] = []): TimelineEvent {
  return {
    eventType: 'CHAMPION_KILL',
    timestamp,
    killerId,
    victimId,
    assistingParticipantIds
  }
}

function objectiveEvent(timestamp: number, killerId: number, monsterType: string): TimelineEvent {
  return {
    eventType: 'ELITE_MONSTER_KILL',
    timestamp,
    killerId,
    monsterType,
    assistingParticipantIds: []
  }
}

function wardEvent(timestamp: number, eventType: 'WARD_PLACED' | 'WARD_KILL', participantId: number): TimelineEvent {
  return eventType === 'WARD_PLACED'
    ? {
        eventType,
        timestamp,
        creatorId: participantId
      }
    : {
        eventType,
        timestamp,
        killerId: participantId
    }
}

function createRpTrendPoints(scores: number[]) {
  return scores.map((score, index) => ({
    minute: index + 1,
    timestamp: (index + 1) * 60_000,
    score
  }))
}
