import test from 'node:test'
import assert from 'node:assert/strict'
import type { GameDetail, MatchTimeline } from '../types/api.ts'
import {
  clusterTimelineEventMarkers,
  createGoldDiffDomain,
  createGoldDiffSeries,
  createTimelineChartModel,
  createTimelineEventMarkers,
  describeTimelineEventMarker,
  formatGoldDiff,
  formatGoldDiffTick,
  formatTimelineTime,
  resolveParticipantLane
} from './matchTimelineChart.ts'

function createDetail(): GameDetail {
  return {
    gameId: 7001,
    gameMode: 'CLASSIC',
    gameType: 'MATCHED_GAME',
    mapId: 11,
    queueId: 420,
    gameDuration: 1800,
    gameCreation: 1710000000000,
    participantIdentities: Array.from({ length: 10 }, (_item, index) => {
      const participantId = index + 1
      return {
        participantId,
        player: {
          accountId: participantId,
          puuid: `puuid-${participantId}`,
          platformId: 'HN1',
          summonerName: `Player${participantId}`,
          gameName: `Player${participantId}`,
          tagLine: `T${participantId}`,
          summonerId: participantId
        }
      }
    }),
    participants: [
      participant(1, 100, 'TOP'),
      participant(2, 100, 'JUNGLE'),
      participant(3, 100, 'MIDDLE'),
      participant(4, 100, 'BOTTOM'),
      participant(5, 100, 'UTILITY'),
      participant(6, 200, 'TOP'),
      participant(7, 200, 'JUNGLE'),
      participant(8, 200, 'MID'),
      participant(9, 200, 'BOTTOM', 'DUO_CARRY'),
      participant(10, 200, 'SUPPORT', 'DUO_SUPPORT')
    ]
  }
}

function participant(
  participantId: number,
  teamId: number,
  lane: string,
  role = lane === 'JUNGLE' ? 'NONE' : 'SOLO'
): GameDetail['participants'][number] {
  return {
    participantId,
    teamId,
    championId: 100 + participantId,
    spell1Id: 4,
    spell2Id: 14,
    teamPosition: lane,
    individualPosition: lane,
    timeline: {
      lane,
      role,
      teamPosition: lane
    },
    stats: {
      win: teamId === 100,
      kills: 1,
      deaths: 1,
      assists: 1,
      totalMinionsKilled: 1,
      neutralMinionsKilled: 0,
      goldEarned: 1,
      totalDamageDealtToChampions: 1,
      totalDamageTaken: 1,
      totalHeal: 0,
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
}

function createTimeline(): MatchTimeline {
  return {
    gameId: 7001,
    frames: [
      frame(60000, [1100, 900, 1050, 1000, 800, 1000, 920, 990, 950, 850]),
      frame(120000, [1600, 1350, 1450, 1300, 1000, 1700, 1250, 1500, 1100, 1200])
    ],
    events: [
      {
        eventType: 'ELITE_MONSTER_KILL',
        timestamp: 180000,
        killerId: 2,
        monsterType: 'DRAGON'
      },
      {
        eventType: 'CHAMPION_KILL',
        timestamp: 90000,
        killerId: 4,
        victimId: 9
      },
      {
        eventType: 'BUILDING_KILL',
        timestamp: 150000,
        killerId: 1,
        buildingType: 'TOWER_BUILDING',
        towerType: 'OUTER_TURRET'
      }
    ]
  }
}

function frame(timestamp: number, totalGoldByParticipantId: number[]): MatchTimeline['frames'][number] {
  const participantFrames: MatchTimeline['frames'][number]['participantFrames'] = {}
  totalGoldByParticipantId.forEach((totalGold, index) => {
    const participantId = index + 1
    participantFrames[String(participantId)] = {
      participantId,
      currentGold: totalGold % 1000,
      totalGold
    }
  })
  return {
    timestamp,
    participantFrames,
    events: []
  }
}

test('team gold diff uses total team gold rather than five-player average', () => {
  const series = createGoldDiffSeries(createTimeline(), createDetail(), 'teamAverage')

  assert.equal(series.points[0]?.blueValue, 4850)
  assert.equal(series.points[0]?.redValue, 4710)
  assert.equal(series.points[0]?.diff, 140)
  assert.equal(series.points[1]?.diff, -50)
})

test('lane gold diff calculates top, jungle, mid, AD, and support matchups', () => {
  const timeline = createTimeline()
  const detail = createDetail()

  assert.equal(createGoldDiffSeries(timeline, detail, 'top').points[0]?.diff, 100)
  assert.equal(createGoldDiffSeries(timeline, detail, 'jungle').points[0]?.diff, -20)
  assert.equal(createGoldDiffSeries(timeline, detail, 'middle').points[0]?.diff, 60)
  assert.equal(createGoldDiffSeries(timeline, detail, 'bottom').points[0]?.diff, 50)
  assert.equal(createGoldDiffSeries(timeline, detail, 'support').points[0]?.diff, -50)
})

test('lane series skips frames when the opposing lane player is missing', () => {
  const detail = createDetail()
  detail.participants = detail.participants.filter(player => player.participantId !== 6)

  const series = createGoldDiffSeries(createTimeline(), detail, 'top')

  assert.equal(series.points.length, 0)
})

test('chart model exposes lane champion metadata for matchup watermarks', () => {
  const detail = createDetail()
  const model = createTimelineChartModel(createTimeline(), detail)

  assert.equal(model.laneMatchups.top.blue?.championId, 101)
  assert.equal(model.laneMatchups.top.red?.championId, 106)

  detail.participants = detail.participants.filter(player => player.participantId !== 6)
  const partialModel = createTimelineChartModel(createTimeline(), detail)

  assert.equal(partialModel.laneMatchups.top.blue?.championId, 101)
  assert.equal(partialModel.laneMatchups.top.red, null)
})

test('event markers extract supported events and sort by timestamp', () => {
  const markers = createTimelineEventMarkers(createTimeline(), createDetail())

  assert.deepEqual(markers.map(marker => marker.type), ['kill', 'turret', 'dragon'])
  assert.deepEqual(markers.map(marker => marker.timestamp), [90000, 150000, 180000])
  assert.equal(markers[0]?.teamId, 100)
  assert.equal(markers[0]?.killerName, 'Player4#T4')
  assert.equal(markers[0]?.killerChampionId, 104)
  assert.equal(markers[0]?.victimChampionId, 109)
})

test('event markers preserve assisting participant ids for lane relevance checks', () => {
  const markers = createTimelineEventMarkers({
    gameId: 7001,
    frames: [],
    events: [
      {
        eventType: 'CHAMPION_KILL',
        timestamp: 90000,
        killerId: 4,
        victimId: 9,
        assistingParticipantIds: [1, 5, 10]
      }
    ]
  }, createDetail())

  assert.deepEqual(markers[0]?.assistingParticipantIds, [1, 5, 10])
})

test('timeline event clusters merge nearby same-team events and retain all items', () => {
  const markers = createTimelineEventMarkers({
    gameId: 7001,
    frames: [],
    events: [
      { eventType: 'CHAMPION_KILL', timestamp: 90000, killerId: 4, victimId: 9 },
      { eventType: 'BUILDING_KILL', timestamp: 104000, killerId: 1, buildingType: 'TOWER_BUILDING' },
      { eventType: 'ELITE_MONSTER_KILL', timestamp: 111000, killerId: 7, monsterType: 'DRAGON' },
      { eventType: 'ELITE_MONSTER_KILL', timestamp: 180000, killerId: 2, monsterType: 'BARON_NASHOR' }
    ]
  }, createDetail())

  const clusters = clusterTimelineEventMarkers(markers, { windowMs: 30000 })

  assert.equal(clusters.length, 3)
  assert.equal(clusters[0]?.teamId, 100)
  assert.equal(clusters[0]?.count, 2)
  assert.deepEqual(clusters[0]?.items.map(item => item.type), ['kill', 'turret'])
  assert.equal(clusters[0]?.markerSize, 15)
  assert.equal(clusters[1]?.teamId, 200)
  assert.equal(clusters[1]?.count, 1)
  assert.equal(clusters[2]?.count, 1)
})

test('timeline event descriptions use natural kill resource and fallback wording', () => {
  const detail = createDetail()
  const markers = createTimelineEventMarkers({
    gameId: 7001,
    frames: [],
    events: [
      { eventType: 'CHAMPION_KILL', timestamp: 90000, killerId: 4, victimId: 9 },
      { eventType: 'ELITE_MONSTER_KILL', timestamp: 120000, killerId: 2, monsterType: 'DRAGON' },
      { eventType: 'BUILDING_KILL', timestamp: 150000, teamId: 100, buildingType: 'TOWER_BUILDING' },
      { eventType: 'ELITE_MONSTER_KILL', timestamp: 180000, teamId: 200, monsterType: 'BARON_NASHOR' }
    ]
  }, detail)

  assert.equal(describeTimelineEventMarker(markers[0]!).text, 'Player4#T4 击杀了 Player9#T9')
  assert.equal(describeTimelineEventMarker(markers[1]!).text, 'Player2#T2 击杀了 小龙')
  assert.equal(describeTimelineEventMarker(markers[2]!).text, '蓝色方 摧毁了 防御塔')
  assert.equal(describeTimelineEventMarker(markers[3]!).text, '红色方 击杀了 纳什男爵')
})

test('chart model domain includes the zero axis across positive and negative values', () => {
  const model = createTimelineChartModel(createTimeline(), createDetail())
  const domain = createGoldDiffDomain(model.seriesByMetric.teamAverage.points)

  assert.ok(domain.min < 0)
  assert.ok(domain.max > 0)
  assert.ok(domain.zeroY >= 0 && domain.zeroY <= 1)
})

test('gold diff domain uses nice symmetric ticks instead of raw values', () => {
  const domain = createGoldDiffDomain([
    { timestamp: 60000, blueValue: 1877, redValue: 1000, diff: 877 },
    { timestamp: 120000, blueValue: 1000, redValue: 2148, diff: -1148 }
  ])

  assert.equal(domain.min, -2000)
  assert.equal(domain.max, 2000)
  assert.deepEqual(domain.ticks, [-2000, -1000, 0, 1000, 2000])
  assert.equal(formatGoldDiffTick(1000), '1000')
  assert.equal(formatGoldDiffTick(-2000), '-2000')
  assert.equal(formatGoldDiffTick(10000), '10k')
  assert.equal(formatGoldDiffTick(-12500), '-12.5k')
  assert.notEqual(formatGoldDiffTick(877), '+877')
  assert.doesNotMatch(formatGoldDiffTick(1000), /千|万/)
})

test('gold diff domain limits large lead tick count while keeping a zero tick', () => {
  const domain = createGoldDiffDomain([
    { timestamp: 60000, blueValue: 22000, redValue: 2000, diff: 20000 },
    { timestamp: 120000, blueValue: 3500, redValue: 18500, diff: -15000 }
  ], { maxTickCount: 6 })

  assert.equal(domain.min, -20000)
  assert.equal(domain.max, 20000)
  assert.ok(domain.ticks.length <= 6)
  assert.ok(domain.ticks.includes(0))
  assert.deepEqual(domain.ticks, [-20000, -10000, 0, 10000, 20000])

  const unevenDomain = createGoldDiffDomain([
    { timestamp: 60000, blueValue: 17000, redValue: 2000, diff: 15000 },
    { timestamp: 120000, blueValue: 2000, redValue: 17000, diff: -15000 }
  ], { maxTickCount: 6 })

  assert.equal(unevenDomain.min, -15000)
  assert.equal(unevenDomain.max, 15000)
  assert.ok(unevenDomain.ticks.length <= 6)
  assert.ok(unevenDomain.ticks.includes(0))
  assert.deepEqual(unevenDomain.ticks, [-10000, 0, 10000])
})

test('lane resolver and formatters handle aliases and signs', () => {
  assert.equal(resolveParticipantLane(participant(11, 100, 'BOT', 'DUO_CARRY')), 'bottom')
  assert.equal(resolveParticipantLane(participant(12, 100, 'UTILITY', 'DUO_SUPPORT')), 'support')
  assert.equal(resolveParticipantLane(participant(13, 100, 'UNKNOWN')), null)
  assert.equal(formatTimelineTime(720000), '12:00')
  assert.equal(formatGoldDiff(12345), '+12,345')
  assert.equal(formatGoldDiff(-9876), '-9,876')
})
