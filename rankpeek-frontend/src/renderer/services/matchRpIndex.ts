import type {
  GameDetail,
  GameParticipant,
  MatchTimeline,
  ParticipantFrame,
  TimelineEvent,
  TimelineFrame
} from '../types/api.ts'
import {
  resolveParticipantLane,
  type ParticipantLane
} from './matchTimelineChart.ts'

export const RP_TREND_LABELS = [
  '一路压着打到结束',
  '队伍节奏发动机',
  '关键阶段站出来接管',
  '为团队节奏做了牺牲',
  '后程发力越打越猛',
  '逆风里一直在撑',
  '稳稳当当不掉线',
  '过山车式发挥',
  '前面打得好，后面没续上',
  '整局被压得很难展开',
  '这局个人表现很顶',
  '人打得不差，局没站到这边',
  '启动慢，但后面找回来了',
  '被打下去还能再抬回来'
] as const

export type RpTrendLabel = typeof RP_TREND_LABELS[number]
export type RpIndexUnavailableReason =
  | 'not_ranked'
  | 'missing_detail'
  | 'missing_timeline'
  | 'short_game'
  | 'incomplete_matchups'

export interface RpIndexPoint {
  minute: number
  timestamp: number
  score: number
}

export interface RpPlayerIndex {
  participantId: number
  teamId: number
  lane: ParticipantLane
  championId: number | null
  win: boolean | null
  finalScore: number
  trendLabel?: RpTrendLabel
  points: RpIndexPoint[]
}

export interface MatchRpIndexOptions {
  trendLabelParticipantId?: number | null
}

export interface ReadyMatchRpIndexModel {
  status: 'ready'
  maxMinute: number
  players: RpPlayerIndex[]
}

export interface UnavailableMatchRpIndexModel {
  status: 'unavailable'
  reason: RpIndexUnavailableReason
  players: []
}

export type MatchRpIndexModel = ReadyMatchRpIndexModel | UnavailableMatchRpIndexModel

interface LanePair {
  lane: ParticipantLane
  blue: GameParticipant
  red: GameParticipant
}

interface ParticipantMinuteStats {
  participantId: number
  kills: number
  assists: number
  deaths: number
  teamKills: number
  teamDeaths: number
  recentCombat: number
  vision: number
  resource: number
  objectiveDeaths: number
}

interface ObjectiveGroup {
  key: string
  kind: ObjectiveKind
  teamId: number | null
  startTimestamp: number
  endTimestamp: number
  weight: number
  events: TimelineEvent[]
}

interface GrowthBaseline {
  goldPerMinute: number
  csPerMinute: number
  levelPerMinute: number
}

interface LaneTeamExpectation {
  goldShare: number
  csShare: number
  deathShare: number
  kp: number
}

type ObjectiveKind = 'dragon' | 'elder' | 'baron' | 'herald' | 'voidgrub'
type RpTrendShape = 'rising' | 'falling' | 'roller_coaster' | 'flat'

interface RpTrendSummary {
  early: number
  middle: number
  late: number
  final: number
  peak: number
  trough: number
  range: number
  totalAverage: number
  earlyToMiddle: number
  middleToLate: number
  earlyToLate: number
  phaseRange: number
}

const BLUE_TEAM_ID = 100
const RED_TEAM_ID = 200
const RANKED_QUEUE_IDS = new Set([420, 440])
const LANE_ORDER: ParticipantLane[] = ['top', 'jungle', 'middle', 'bottom', 'support']
const MIN_RP_GAME_MINUTES = 10
const RECENT_EVENT_WINDOW_MS = 60_000
const OBJECTIVE_PRE_WINDOW_MS = 60_000
const OBJECTIVE_POST_WINDOW_MS = 45_000
const VOIDGRUB_GROUP_WINDOW_MS = 90_000
const GROWTH_COMPONENT_WEIGHT = 1.45
const COMBAT_COMPONENT_WEIGHT = 2.65
const RESOURCE_COMPONENT_WEIGHT = 1.05
const VISION_COMPONENT_WEIGHT = 0.65
const RESPONSIBILITY_COMPONENT_WEIGHT = 1.35
const GROWTH_MATCHUP_SHARE = 0.2
const GROWTH_TEAM_SHARE = 0.55
const GROWTH_PACE_SHARE = 0.25
const TEAM_SHARE_DEADZONE = 0.03
const TEAM_GOLD_SHARE_TOLERANCE = 0.08
const TEAM_CS_SHARE_TOLERANCE = 0.1
const LOW_EFFECTIVE_PARTICIPATION_MAX_PENALTY = 1.8
const TREND_PHASE_NOISE = 0.45
const TREND_DIRECTION_DELTA = 0.9
const TREND_REVERSAL_DELTA = 1
const TREND_REVERSAL_PHASE_RANGE = 1.5
const LANE_GROWTH_BASELINES: Record<ParticipantLane, GrowthBaseline> = {
  top: { goldPerMinute: 385, csPerMinute: 6.8, levelPerMinute: 0.47 },
  jungle: { goldPerMinute: 365, csPerMinute: 5.6, levelPerMinute: 0.46 },
  middle: { goldPerMinute: 395, csPerMinute: 7.0, levelPerMinute: 0.49 },
  bottom: { goldPerMinute: 395, csPerMinute: 7.2, levelPerMinute: 0.46 },
  support: { goldPerMinute: 270, csPerMinute: 1.1, levelPerMinute: 0.4 }
}
const LANE_TEAM_EXPECTATIONS: Record<ParticipantLane, LaneTeamExpectation> = {
  top: { goldShare: 0.21, csShare: 0.24, deathShare: 0.2, kp: 0.42 },
  jungle: { goldShare: 0.19, csShare: 0.17, deathShare: 0.21, kp: 0.58 },
  middle: { goldShare: 0.22, csShare: 0.25, deathShare: 0.18, kp: 0.5 },
  bottom: { goldShare: 0.24, csShare: 0.28, deathShare: 0.18, kp: 0.48 },
  support: { goldShare: 0.14, csShare: 0.06, deathShare: 0.23, kp: 0.6 }
}

export function createMatchRpIndexModel(
  timeline: MatchTimeline | null | undefined,
  gameDetail: GameDetail | null | undefined,
  options: MatchRpIndexOptions = {}
): MatchRpIndexModel {
  if (!gameDetail?.participants?.length) {
    return unavailable('missing_detail')
  }
  if (!RANKED_QUEUE_IDS.has(toFiniteNumber(gameDetail.queueId) ?? -1)) {
    return unavailable('not_ranked')
  }

  const frames = getSortedFrames(timeline)
  if (!frames.length) {
    return unavailable('missing_timeline')
  }

  const maxMinute = getMaxCompleteMinute(timeline, gameDetail)
  if (maxMinute < MIN_RP_GAME_MINUTES) {
    return unavailable('short_game')
  }

  const lanePairs = createLanePairs(gameDetail.participants)
  if (lanePairs.length !== LANE_ORDER.length) {
    return unavailable('incomplete_matchups')
  }

  const participantsById = new Map<number, GameParticipant>()
  for (const participant of gameDetail.participants) {
    const participantId = toFiniteNumber(participant.participantId)
    if (participantId !== null) {
      participantsById.set(participantId, participant)
    }
  }

  const pairedParticipants = lanePairs.flatMap(pair => [pair.blue, pair.red])
  if (new Set(pairedParticipants.map(participant => participant.participantId)).size !== 10) {
    return unavailable('incomplete_matchups')
  }

  const events = getTimelineEvents(timeline).sort((left, right) => readTimestamp(left) - readTimestamp(right))
  const objectiveGroups = createObjectiveGroups(events, participantsById)
  const trendLabelParticipantId = toFiniteNumber(options.trendLabelParticipantId)
  const players = pairedParticipants
    .map(participant => createPlayerIndex({
      participant,
      opponent: findLaneOpponent(participant, lanePairs),
      lane: resolveParticipantLane(participant),
      maxMinute,
      frames,
      events,
      objectiveGroups,
      participantsById,
      trendLabelParticipantId
    }))
    .filter((player): player is RpPlayerIndex => player !== null)
    .sort(compareRpPlayers)

  if (players.length !== 10) {
    return unavailable('incomplete_matchups')
  }

  return {
    status: 'ready',
    maxMinute,
    players
  }
}

export function formatRpScore(score: number | null | undefined): string {
  const safeScore = toFiniteNumber(score)
  return safeScore === null ? '--' : safeScore.toFixed(1)
}

function unavailable(reason: RpIndexUnavailableReason): UnavailableMatchRpIndexModel {
  return {
    status: 'unavailable',
    reason,
    players: []
  }
}

function createPlayerIndex(params: {
  participant: GameParticipant
  opponent: GameParticipant | null
  lane: ParticipantLane | null
  maxMinute: number
  frames: TimelineFrame[]
  events: TimelineEvent[]
  objectiveGroups: ObjectiveGroup[]
  participantsById: Map<number, GameParticipant>
  trendLabelParticipantId: number | null
}): RpPlayerIndex | null {
  const {
    participant,
    opponent,
    lane,
    maxMinute,
    frames,
    events,
    objectiveGroups,
    participantsById,
    trendLabelParticipantId
  } = params
  const participantId = toFiniteNumber(participant.participantId)
  const opponentId = toFiniteNumber(opponent?.participantId)
  const teamId = toFiniteNumber(participant.teamId)
  if (participantId === null || opponentId === null || teamId === null || lane === null) {
    return null
  }

  const points: RpIndexPoint[] = []
  for (let minute = 0; minute <= maxMinute; minute += 1) {
    const timestamp = minute * 60_000
    if (minute === 0) {
      points.push({ minute, timestamp, score: 5 })
      continue
    }

    const frame = findPreviousFrame(frames, timestamp)
    if (!frame) {
      points.push({ minute, timestamp, score: 5 })
      continue
    }

    const score = calculateMinuteScore({
      minute,
      timestamp,
      frame,
      lane,
      participantId,
      opponentId,
      events,
      objectiveGroups,
      participantsById
    })
    points.push({ minute, timestamp, score })
  }

  const adjustedPoints = applyLowEffectiveParticipationPenalty(
    points,
    calculateLowEffectiveParticipationPenalty(participant, lane, participantsById),
    maxMinute
  )
  const finalScore = adjustedPoints.at(-1)?.score ?? 5
  const trendLabel = trendLabelParticipantId === participantId
    ? createRpTrendLabel(adjustedPoints, participant.stats?.win ?? null)
    : undefined

  return {
    participantId,
    teamId,
    lane,
    championId: positiveInteger(participant.championId),
    win: typeof participant.stats?.win === 'boolean' ? participant.stats.win : null,
    finalScore,
    ...(trendLabel ? { trendLabel } : {}),
    points: adjustedPoints
  }
}

function calculateMinuteScore(params: {
  minute: number
  timestamp: number
  frame: TimelineFrame
  lane: ParticipantLane
  participantId: number
  opponentId: number
  events: TimelineEvent[]
  objectiveGroups: ObjectiveGroup[]
  participantsById: Map<number, GameParticipant>
}): number {
  const {
    minute,
    timestamp,
    frame,
    lane,
    participantId,
    opponentId,
    events,
    objectiveGroups,
    participantsById
  } = params
  const participantFrame = findParticipantFrame(frame, participantId)
  const opponentFrame = findParticipantFrame(frame, opponentId)
  const participantStats = createParticipantMinuteStats(participantId, timestamp, events, objectiveGroups, participantsById)
  const opponentStats = createParticipantMinuteStats(opponentId, timestamp, events, objectiveGroups, participantsById)

  const growth = calculateGrowthComponent(
    minute,
    lane,
    participantFrame,
    opponentFrame,
    frame,
    participantId,
    participantsById
  )
  const combat = calculateCombatComponent(minute, participantStats, opponentStats)
  const resource = calculateResourceComponent(minute, participantStats, opponentStats)
  const vision = calculateVisionComponent(minute, participantStats, opponentStats)
  const responsibility = calculateResponsibilityPenalty(minute, lane, participantStats)

  return roundScore(clamp(5 + growth + combat + resource + vision - responsibility, 0, 10))
}

function calculateGrowthComponent(
  minute: number,
  lane: ParticipantLane,
  participantFrame: ParticipantFrame | null,
  opponentFrame: ParticipantFrame | null,
  frame: TimelineFrame,
  participantId: number,
  participantsById: Map<number, GameParticipant>
): number {
  const participantGold = toFiniteNumber(participantFrame?.totalGold)
  const opponentGold = toFiniteNumber(opponentFrame?.totalGold)
  const participantLevel = toFiniteNumber(participantFrame?.level)
  const opponentLevel = toFiniteNumber(opponentFrame?.level)
  const participantCs = readFrameCs(participantFrame)
  const opponentCs = readFrameCs(opponentFrame)

  const goldNorm = participantGold === null || opponentGold === null
    ? 0
    : clamp((participantGold - opponentGold) / (550 + minute * 115), -1, 1)
  const csNorm = participantCs === null || opponentCs === null
    ? 0
    : clamp((participantCs - opponentCs) / (8 + minute * 1.15), -1, 1)
  const levelNorm = participantLevel === null || opponentLevel === null
    ? 0
    : clamp((participantLevel - opponentLevel) / Math.max(1, 1 + minute / 16), -1, 1)
  const matchupNorm = clamp(goldNorm * 0.55 + csNorm * 0.25 + levelNorm * 0.2, -1, 1)
  const paceNorm = calculateGrowthPaceNorm(minute, lane, participantGold, participantCs, participantLevel)
  const teamShareNorm = calculateTeamShareGrowthNorm(frame, participantId, lane, participantsById)

  return GROWTH_COMPONENT_WEIGHT * clamp(
    matchupNorm * GROWTH_MATCHUP_SHARE
      + teamShareNorm * GROWTH_TEAM_SHARE
      + paceNorm * GROWTH_PACE_SHARE,
    -1,
    1
  )
}

function calculateGrowthPaceNorm(
  minute: number,
  lane: ParticipantLane,
  gold: number | null,
  cs: number | null,
  level: number | null
): number {
  const baseline = LANE_GROWTH_BASELINES[lane]
  const expectedGold = 500 + baseline.goldPerMinute * minute
  const expectedCs = baseline.csPerMinute * minute
  const expectedLevel = Math.min(18, 1 + baseline.levelPerMinute * minute)
  const goldPace = gold === null ? 0 : clamp((gold - expectedGold) / (650 + minute * 85), -1, 1)
  const csPace = cs === null ? 0 : clamp((cs - expectedCs) / (8 + minute * 0.85), -1, 1)
  const levelPace = level === null ? 0 : clamp((level - expectedLevel) / Math.max(1, 1 + minute / 18), -1, 1)
  return clamp(goldPace * 0.5 + csPace * 0.3 + levelPace * 0.2, 0, 1)
}

function calculateTeamShareGrowthNorm(
  frame: TimelineFrame,
  participantId: number,
  lane: ParticipantLane,
  participantsById: Map<number, GameParticipant>
): number {
  const participant = participantsById.get(participantId)
  const participantTeamId = toFiniteNumber(participant?.teamId)
  const participantFrame = findParticipantFrame(frame, participantId)
  const participantGold = toFiniteNumber(participantFrame?.totalGold)
  const participantCs = readFrameCs(participantFrame)
  if (participantTeamId === null || participantGold === null) {
    return 0
  }

  let teamGold = 0
  let teamCs = 0
  for (const teammate of participantsById.values()) {
    if (toFiniteNumber(teammate.teamId) !== participantTeamId) {
      continue
    }
    const teammateFrame = findParticipantFrame(frame, toFiniteNumber(teammate.participantId) ?? -1)
    teamGold += Math.max(0, toFiniteNumber(teammateFrame?.totalGold) ?? 0)
    teamCs += Math.max(0, readFrameCs(teammateFrame) ?? 0)
  }

  if (teamGold <= 0) {
    return 0
  }

  const expectation = LANE_TEAM_EXPECTATIONS[lane]
  const goldShare = participantGold / teamGold
  const goldNorm = normalizeShareDelta(goldShare - expectation.goldShare, TEAM_GOLD_SHARE_TOLERANCE)
  let csNorm = 0
  if (participantCs !== null && teamCs > 0) {
    csNorm = normalizeShareDelta(participantCs / teamCs - expectation.csShare, TEAM_CS_SHARE_TOLERANCE)
  }
  if (lane === 'support' && csNorm > 0) {
    csNorm = 0
  }

  const shareNorm = clamp(goldNorm * 0.65 + csNorm * 0.35, -1, 1)
  if (lane === 'support' && shareNorm > 0) {
    return 0
  }
  return shareNorm
}

function calculateCombatComponent(
  minute: number,
  participantStats: ParticipantMinuteStats,
  opponentStats: ParticipantMinuteStats
): number {
  const participantKp = participantStats.teamKills > 0
    ? (participantStats.kills + participantStats.assists) / participantStats.teamKills
    : null
  const opponentKp = opponentStats.teamKills > 0
    ? (opponentStats.kills + opponentStats.assists) / opponentStats.teamKills
    : null
  const kpNorm = participantKp === null || opponentKp === null
    ? 0
    : clamp(participantKp - opponentKp, -1, 1)
  const deathNorm = clamp(
    (opponentStats.deaths - participantStats.deaths) / Math.max(1, minute / 7),
    -1,
    1
  )
  const recentNorm = clamp((participantStats.recentCombat - opponentStats.recentCombat) / 2, -1, 1)
  const matchupNorm = clamp(kpNorm * 0.4 + deathNorm * 0.35 + recentNorm * 0.25, -1, 1)
  const ownKpNorm = participantKp === null ? 0 : clamp((participantKp - 0.45) / 0.35, -1, 1)
  const expectedDeaths = 0.4 + minute * 0.12
  const hasCombatSignal = participantStats.teamKills > 0
    || participantStats.kills > 0
    || participantStats.assists > 0
    || participantStats.deaths > 0
    || participantStats.recentCombat !== 0
  const ownDeathNorm = hasCombatSignal
    ? clamp((expectedDeaths - participantStats.deaths) / Math.max(1, expectedDeaths), -1, 1)
    : 0
  const ownRecentNorm = clamp(participantStats.recentCombat / 1.6, -1, 1)
  const ownImpactNorm = clamp(ownKpNorm * 0.45 + ownDeathNorm * 0.25 + ownRecentNorm * 0.3, -1, 1)

  return COMBAT_COMPONENT_WEIGHT * clamp(matchupNorm * 0.2 + ownImpactNorm * 0.8, -1, 1)
}

function calculateResponsibilityPenalty(
  minute: number,
  lane: ParticipantLane,
  participantStats: ParticipantMinuteStats
): number {
  if (participantStats.deaths <= 0) {
    return 0
  }

  const expectation = LANE_TEAM_EXPECTATIONS[lane]
  const teamDeathShare = participantStats.teamDeaths > 0
    ? participantStats.deaths / participantStats.teamDeaths
    : 0
  const deathShareNorm = participantStats.teamDeaths >= 3
    ? clamp((teamDeathShare - expectation.deathShare) / Math.max(0.08, 0.45 - expectation.deathShare), 0, 1)
    : 0
  const expectedDeaths = participantStats.teamDeaths * expectation.deathShare
  const excessDeathNorm = participantStats.teamDeaths >= 3
    ? clamp((participantStats.deaths - expectedDeaths - 1) / Math.max(1, participantStats.teamDeaths * 0.18), 0, 1)
    : 0
  const participantKp = participantStats.teamKills > 0
    ? (participantStats.kills + participantStats.assists) / participantStats.teamKills
    : null
  const teamFightPace = participantStats.teamKills / Math.max(1, minute / 5)
  const kpExpectation = expectation.kp * (teamFightPace < 1 ? 0.85 : teamFightPace > 2 ? 1.05 : 1)
  const lowKpNorm = participantStats.teamKills >= 4 && participantKp !== null
    ? clamp((kpExpectation - participantKp) / Math.max(0.1, kpExpectation), 0, 1)
    : 0
  const objectiveDeathNorm = clamp(participantStats.objectiveDeaths / 1.3, 0, 1)
  const compoundNorm = participantStats.deaths >= 5 && lowKpNorm > 0.5 ? 0.15 : 0
  const burdenNorm = clamp(
    deathShareNorm * 0.48
      + excessDeathNorm * 0.24
      + lowKpNorm * 0.18
      + objectiveDeathNorm * 0.1
      + compoundNorm,
    0,
    1
  )

  return RESPONSIBILITY_COMPONENT_WEIGHT * burdenNorm
}

function applyLowEffectiveParticipationPenalty(
  points: RpIndexPoint[],
  penalty: number,
  maxMinute: number
): RpIndexPoint[] {
  if (penalty <= 0) {
    return points
  }
  const rampEndMinute = Math.max(8, Math.min(maxMinute, Math.ceil(maxMinute * 0.7)))
  return points.map(point => {
    if (point.minute <= 0) {
      return point
    }
    const progress = clamp(point.minute / Math.max(1, rampEndMinute), 0, 1)
    return {
      ...point,
      score: roundScore(clamp(point.score - penalty * progress, 0, 10))
    }
  })
}

function calculateLowEffectiveParticipationPenalty(
  participant: GameParticipant,
  lane: ParticipantLane,
  participantsById: Map<number, GameParticipant>
): number {
  const teamId = toFiniteNumber(participant.teamId)
  if (teamId === null) {
    return 0
  }

  const teammates = [...participantsById.values()]
    .filter(candidate => toFiniteNumber(candidate.teamId) === teamId)
  const teamDamage = sumParticipantStats(teammates, 'totalDamageDealtToChampions')
  const teamTaken = sumParticipantStats(teammates, 'totalDamageTaken')
  const teamGold = sumParticipantStats(teammates, 'goldEarned')
  const teamVision = sumParticipantStats(teammates, 'visionScore')
  const teamKills = sumParticipantStats(teammates, 'kills')
  if (teamGold <= 0 || (teamDamage <= 0 && teamTaken <= 0)) {
    return 0
  }

  const damage = readParticipantStat(participant, 'totalDamageDealtToChampions')
  const taken = readParticipantStat(participant, 'totalDamageTaken')
  const gold = readParticipantStat(participant, 'goldEarned')
  const vision = readParticipantStat(participant, 'visionScore')
  const kills = readParticipantStat(participant, 'kills')
  const assists = readParticipantStat(participant, 'assists')
  const damageShare = teamDamage > 0 ? damage / teamDamage : null
  const takenShare = teamTaken > 0 ? taken / teamTaken : null
  const goldShare = teamGold > 0 ? gold / teamGold : null
  const visionShare = teamVision > 0 ? vision / teamVision : null
  const damagePerGold = gold > 0 ? damage / gold : null
  const kp = teamKills > 0 ? (kills + assists) / teamKills : null
  const expectation = LANE_TEAM_EXPECTATIONS[lane]

  const lowDamage = damageShare !== null && damageShare <= 0.025
  const lowConversion = damagePerGold !== null && damagePerGold <= 0.2
  const lowTaken = takenShare !== null && takenShare <= 0.08
  const lowGold = goldShare !== null && goldShare <= Math.max(0.11, expectation.goldShare * 0.7)
  const lowKp = kp !== null && teamKills >= 4 && kp <= Math.max(0.28, expectation.kp * 0.5)
  const lowVision = visionShare !== null && visionShare <= 0.08
  const severeSignalCount = [
    lowDamage,
    lowConversion,
    lowTaken,
    lowGold,
    lowKp,
    lowVision
  ].filter(Boolean).length
  const severity = clamp(
    lowMetricSeverity(damageShare, 0.07) * 0.26
      + lowMetricSeverity(damagePerGold, 0.65) * 0.24
      + lowMetricSeverity(takenShare, 0.13) * 0.18
      + lowMetricSeverity(goldShare, Math.max(0.12, expectation.goldShare * 0.75)) * 0.14
      + lowMetricSeverity(kp, Math.max(0.28, expectation.kp * 0.6)) * 0.12
      + lowMetricSeverity(visionShare, 0.1) * 0.06,
    0,
    1
  )

  if (lowDamage && lowConversion && lowTaken && (lowKp || lowGold)) {
    return LOW_EFFECTIVE_PARTICIPATION_MAX_PENALTY * clamp(0.65 + severity * 0.35, 0, 1)
  }
  if (severeSignalCount >= 5) {
    return LOW_EFFECTIVE_PARTICIPATION_MAX_PENALTY * clamp(0.6 + severity * 0.4, 0, 1)
  }
  if (severeSignalCount >= 4 && lowDamage && (lowConversion || lowKp)) {
    return LOW_EFFECTIVE_PARTICIPATION_MAX_PENALTY * clamp(0.35 + severity * 0.35, 0, 0.75)
  }

  return 0
}

function calculateResourceComponent(
  minute: number,
  participantStats: ParticipantMinuteStats,
  opponentStats: ParticipantMinuteStats
): number {
  const threshold = Math.max(1.2, 0.5 + minute * 0.08)
  const matchupNorm = clamp((participantStats.resource - opponentStats.resource) / threshold, -1, 1)
  const ownImpactNorm = clamp(participantStats.resource / threshold, -1, 1)
  return RESOURCE_COMPONENT_WEIGHT * clamp(matchupNorm * 0.1 + ownImpactNorm * 0.9, -1, 1)
}

function calculateVisionComponent(
  minute: number,
  participantStats: ParticipantMinuteStats,
  opponentStats: ParticipantMinuteStats
): number {
  const threshold = 1 + minute * 0.12
  const matchupNorm = clamp((participantStats.vision - opponentStats.vision) / threshold, -1, 1)
  const ownImpactNorm = clamp(participantStats.vision / threshold, 0, 1)
  return VISION_COMPONENT_WEIGHT * clamp(matchupNorm * 0.15 + ownImpactNorm * 0.85, -1, 1)
}

function createParticipantMinuteStats(
  participantId: number,
  timestamp: number,
  events: TimelineEvent[],
  objectiveGroups: ObjectiveGroup[],
  participantsById: Map<number, GameParticipant>
): ParticipantMinuteStats {
  const participant = participantsById.get(participantId)
  const teamId = toFiniteNumber(participant?.teamId)
  const stats: ParticipantMinuteStats = {
    participantId,
    kills: 0,
    assists: 0,
    deaths: 0,
    teamKills: 0,
    teamDeaths: 0,
    recentCombat: 0,
    vision: 0,
    resource: 0,
    objectiveDeaths: 0
  }

  for (const event of events) {
    const eventTimestamp = readTimestamp(event)
    if (eventTimestamp > timestamp) {
      break
    }

    const eventType = normalizeEventText(event.eventType)
    if (eventType === 'CHAMPION_KILL') {
      applyChampionKillStats(stats, event, eventTimestamp, timestamp, teamId, participantsById)
    } else if (eventType === 'WARD_PLACED') {
      if (readWardCreatorId(event) === participantId) {
        stats.vision += 0.12
      }
    } else if (eventType === 'WARD_KILL') {
      if (toFiniteNumber(event.killerId) === participantId) {
        stats.vision += 0.18
      }
    }
  }

  applyObjectiveStats(stats, timestamp, events, objectiveGroups, participantsById)
  return stats
}

function applyChampionKillStats(
  stats: ParticipantMinuteStats,
  event: TimelineEvent,
  eventTimestamp: number,
  timestamp: number,
  participantTeamId: number | null,
  participantsById: Map<number, GameParticipant>
): void {
  const killerId = toFiniteNumber(event.killerId)
  const victimId = toFiniteNumber(event.victimId)
  const assistingParticipantIds = readAssistingParticipantIds(event)
  const killerTeamId = toFiniteNumber(killerId === null ? null : participantsById.get(killerId)?.teamId)
  const victimTeamId = toFiniteNumber(victimId === null ? null : participantsById.get(victimId)?.teamId)
  const isRecent = timestamp - eventTimestamp <= RECENT_EVENT_WINDOW_MS

  if (participantTeamId !== null && killerTeamId === participantTeamId) {
    stats.teamKills += 1
  }
  if (participantTeamId !== null && victimTeamId === participantTeamId) {
    stats.teamDeaths += 1
  }
  if (killerId === stats.participantId) {
    stats.kills += 1
    if (isRecent) {
      stats.recentCombat += 1
    }
  }
  if (assistingParticipantIds.includes(stats.participantId)) {
    stats.assists += 1
    if (isRecent) {
      stats.recentCombat += 0.55
    }
  }
  if (victimId === stats.participantId) {
    stats.deaths += 1
    if (isRecent) {
      stats.recentCombat -= 0.85
    }
  }
}

function applyObjectiveStats(
  stats: ParticipantMinuteStats,
  timestamp: number,
  events: TimelineEvent[],
  objectiveGroups: ObjectiveGroup[],
  participantsById: Map<number, GameParticipant>
): void {
  for (const group of objectiveGroups) {
    if (timestamp < group.startTimestamp) {
      continue
    }

    const windowStart = group.startTimestamp - OBJECTIVE_PRE_WINDOW_MS
    const windowEnd = Math.min(timestamp, group.endTimestamp + OBJECTIVE_POST_WINDOW_MS)
    for (const objectiveEvent of group.events) {
      if (readTimestamp(objectiveEvent) > timestamp) {
        continue
      }
      const killerId = toFiniteNumber(objectiveEvent.killerId)
      const assists = readAssistingParticipantIds(objectiveEvent)
      if (killerId === stats.participantId) {
        stats.resource += group.weight
      }
      if (assists.includes(stats.participantId)) {
        stats.resource += group.weight * 0.6
      }
    }

    for (const event of events) {
      const eventTimestamp = readTimestamp(event)
      if (eventTimestamp < windowStart || eventTimestamp > windowEnd) {
        continue
      }

      const eventType = normalizeEventText(event.eventType)
      if (eventType === 'CHAMPION_KILL') {
        const killerId = toFiniteNumber(event.killerId)
        const victimId = toFiniteNumber(event.victimId)
        const assists = readAssistingParticipantIds(event)
        if (killerId === stats.participantId) {
          stats.resource += group.weight * 0.25
        }
        if (assists.includes(stats.participantId)) {
          stats.resource += group.weight * 0.15
        }
        if (victimId === stats.participantId) {
          stats.resource -= group.weight * 0.3
          stats.objectiveDeaths += group.weight
        }
      } else if (eventType === 'WARD_PLACED' && readWardCreatorId(event) === stats.participantId) {
        stats.vision += group.weight * 0.08
      } else if (eventType === 'WARD_KILL' && toFiniteNumber(event.killerId) === stats.participantId) {
        stats.vision += group.weight * 0.12
      }
    }
  }

  void participantsById
}

function createObjectiveGroups(
  events: TimelineEvent[],
  participantsById: Map<number, GameParticipant>
): ObjectiveGroup[] {
  const objectiveEvents = events
    .map(event => {
      const classification = classifyObjectiveEvent(event)
      const timestamp = readTimestamp(event)
      if (!classification || !Number.isFinite(timestamp)) {
        return null
      }
      return {
        event,
        timestamp,
        teamId: resolveEventTeamId(event, participantsById),
        ...classification
      }
    })
    .filter((entry): entry is {
      event: TimelineEvent
      timestamp: number
      teamId: number | null
      kind: ObjectiveKind
      weight: number
    } => entry !== null)
    .sort((left, right) => left.timestamp - right.timestamp)

  const groups: ObjectiveGroup[] = []
  for (const entry of objectiveEvents) {
    if (entry.kind === 'voidgrub') {
      const previous = groups[groups.length - 1]
      if (
        previous?.kind === 'voidgrub'
        && previous.teamId === entry.teamId
        && entry.timestamp - previous.endTimestamp <= VOIDGRUB_GROUP_WINDOW_MS
      ) {
        previous.events.push(entry.event)
        previous.endTimestamp = entry.timestamp
        previous.weight = 0.65
        previous.key = createObjectiveGroupKey(previous)
        continue
      }
    }

    const group: ObjectiveGroup = {
      key: `${entry.kind}-${entry.teamId ?? 'neutral'}-${entry.timestamp}`,
      kind: entry.kind,
      teamId: entry.teamId,
      startTimestamp: entry.timestamp,
      endTimestamp: entry.timestamp,
      weight: entry.kind === 'voidgrub' ? 0.65 : entry.weight,
      events: [entry.event]
    }
    groups.push(group)
  }

  return groups
}

function createObjectiveGroupKey(group: ObjectiveGroup): string {
  return `${group.kind}-${group.teamId ?? 'neutral'}-${group.startTimestamp}-${group.endTimestamp}-${group.events.length}`
}

function classifyObjectiveEvent(event: TimelineEvent): { kind: ObjectiveKind; weight: number } | null {
  if (normalizeEventText(event.eventType) !== 'ELITE_MONSTER_KILL') {
    return null
  }

  const monsterType = normalizeEventText(event.monsterType)
  if (monsterType.includes('BARON')) {
    return { kind: 'baron', weight: 1.3 }
  }
  if (monsterType.includes('RIFTHERALD') || monsterType.includes('HERALD')) {
    return { kind: 'herald', weight: 0.8 }
  }
  if (monsterType.includes('HORDE') || monsterType.includes('VOIDGRUB')) {
    return { kind: 'voidgrub', weight: 0.65 }
  }
  if (monsterType.includes('ELDER')) {
    return { kind: 'elder', weight: 1.3 }
  }
  if (monsterType.includes('DRAGON')) {
    return readRawEventString(event, 'monsterSubType')?.toUpperCase().includes('ELDER') === true
      ? { kind: 'elder', weight: 1.3 }
      : { kind: 'dragon', weight: 0.9 }
  }
  return null
}

export function createRpTrendLabel(points: RpIndexPoint[], win: boolean | null): RpTrendLabel {
  const values = points.filter(point => point.minute > 0).map(point => point.score)
  if (!values.length) {
    return win === false ? '整局被压得很难展开' : '稳稳当当不掉线'
  }

  const trend = summarizeRpTrend(values)
  const shape = classifyRpTrendShape(trend)

  if (win === false) {
    if (shape === 'roller_coaster') {
      return '过山车式发挥'
    }
    if (shape === 'falling') {
      return trend.early >= 5.7 ? '前面打得好，后面没续上' : '整局被压得很难展开'
    }
    if (shape === 'rising') {
      return trend.early <= 4.6 ? '启动慢，但后面找回来了' : '逆风里一直在撑'
    }
    if (trend.final >= 6 || trend.totalAverage >= 5.8) {
      return '人打得不差，局没站到这边'
    }
    if (trend.trough <= 4.2 && trend.late >= 5.3) {
      return '被打下去还能再抬回来'
    }
    if (trend.final <= 4.2 && trend.early <= 5 && trend.middle <= 5 && trend.late <= 5) {
      return '整局被压得很难展开'
    }
    return '逆风里一直在撑'
  }

  if (trend.final >= 7 && trend.early >= 6.2 && trend.middle >= 6.2 && trend.late >= 6.2) {
    return '一路压着打到结束'
  }
  if (shape === 'roller_coaster') {
    return '过山车式发挥'
  }
  if (trend.peak >= 8.5 && trend.totalAverage >= 6.6) {
    return '这局个人表现很顶'
  }
  if (shape === 'rising') {
    if (trend.early <= 4.8) {
      return '启动慢，但后面找回来了'
    }
    return trend.late >= 6.3 ? '关键阶段站出来接管' : '后程发力越打越猛'
  }
  if (shape === 'falling') {
    if (trend.early >= 6.2 && trend.late >= 5.6) {
      return '队伍节奏发动机'
    }
    return '前面打得好，后面没续上'
  }
  if (trend.trough <= 4.2 && trend.late >= 5.8) {
    return '被打下去还能再抬回来'
  }
  if (trend.early >= 6.2 && trend.late >= 5.6) {
    return '队伍节奏发动机'
  }
  if (trend.final <= 5.7 && trend.totalAverage <= 5.8) {
    return '为团队节奏做了牺牲'
  }
  return '稳稳当当不掉线'
}

function summarizeRpTrend(values: number[]): RpTrendSummary {
  const [early, middle, late] = splitIntoThirds(values).map(average)
  const final = values.at(-1) ?? late
  const peak = Math.max(...values)
  const trough = Math.min(...values)
  const earlyToMiddle = middle - early
  const middleToLate = late - middle
  const earlyToLate = late - early
  return {
    early,
    middle,
    late,
    final,
    peak,
    trough,
    range: peak - trough,
    totalAverage: average(values),
    earlyToMiddle,
    middleToLate,
    earlyToLate,
    phaseRange: Math.max(early, middle, late) - Math.min(early, middle, late)
  }
}

function classifyRpTrendShape(trend: RpTrendSummary): RpTrendShape {
  const earlyToMiddleDirection = normalizeTrendDirection(trend.earlyToMiddle)
  const middleToLateDirection = normalizeTrendDirection(trend.middleToLate)
  const hasStrongReversal = earlyToMiddleDirection !== 0
    && middleToLateDirection !== 0
    && earlyToMiddleDirection !== middleToLateDirection
    && Math.abs(trend.earlyToMiddle) >= TREND_REVERSAL_DELTA
    && Math.abs(trend.middleToLate) >= TREND_REVERSAL_DELTA
    && trend.phaseRange >= TREND_REVERSAL_PHASE_RANGE
    && trend.range >= 2
  if (hasStrongReversal) {
    return 'roller_coaster'
  }

  if (
    trend.earlyToLate >= TREND_DIRECTION_DELTA
    && earlyToMiddleDirection >= 0
    && middleToLateDirection >= 0
  ) {
    return 'rising'
  }
  if (
    trend.earlyToLate <= -TREND_DIRECTION_DELTA
    && earlyToMiddleDirection <= 0
    && middleToLateDirection <= 0
  ) {
    return 'falling'
  }
  if (trend.earlyToLate >= TREND_DIRECTION_DELTA && trend.middleToLate >= -TREND_PHASE_NOISE) {
    return 'rising'
  }
  if (trend.earlyToLate <= -TREND_DIRECTION_DELTA && trend.middleToLate <= TREND_PHASE_NOISE) {
    return 'falling'
  }
  return 'flat'
}

function normalizeTrendDirection(delta: number): -1 | 0 | 1 {
  if (delta >= TREND_PHASE_NOISE) {
    return 1
  }
  if (delta <= -TREND_PHASE_NOISE) {
    return -1
  }
  return 0
}

function splitIntoThirds(values: number[]): [number[], number[], number[]] {
  const third = Math.max(1, Math.floor(values.length / 3))
  const early = values.slice(0, third)
  const middle = values.slice(third, Math.max(third + 1, values.length - third))
  const late = values.slice(Math.max(third + 1, values.length - third))
  return [early, middle, late.length ? late : values.slice(-third)]
}

function average(values: number[]): number {
  if (!values.length) {
    return 5
  }
  return values.reduce((total, value) => total + value, 0) / values.length
}

function normalizeShareDelta(delta: number, tolerance: number): number {
  const absDelta = Math.abs(delta)
  if (absDelta <= TEAM_SHARE_DEADZONE) {
    return 0
  }
  return clamp(Math.sign(delta) * (absDelta - TEAM_SHARE_DEADZONE) / tolerance, -1, 1)
}

function lowMetricSeverity(value: number | null, acceptableFloor: number): number {
  if (value === null || acceptableFloor <= 0) {
    return 0
  }
  return clamp((acceptableFloor - value) / acceptableFloor, 0, 1)
}

function createLanePairs(participants: GameParticipant[]): LanePair[] {
  return LANE_ORDER.flatMap(lane => {
    const blue = participants.find(participant => participant.teamId === BLUE_TEAM_ID && resolveParticipantLane(participant) === lane)
    const red = participants.find(participant => participant.teamId === RED_TEAM_ID && resolveParticipantLane(participant) === lane)
    return blue && red ? [{ lane, blue, red }] : []
  })
}

function findLaneOpponent(participant: GameParticipant, lanePairs: LanePair[]): GameParticipant | null {
  for (const pair of lanePairs) {
    if (pair.blue.participantId === participant.participantId) {
      return pair.red
    }
    if (pair.red.participantId === participant.participantId) {
      return pair.blue
    }
  }
  return null
}

function compareRpPlayers(left: RpPlayerIndex, right: RpPlayerIndex): number {
  const leftWinRank = left.win === true ? 0 : 1
  const rightWinRank = right.win === true ? 0 : 1
  if (leftWinRank !== rightWinRank) {
    return leftWinRank - rightWinRank
  }
  const laneDiff = LANE_ORDER.indexOf(left.lane) - LANE_ORDER.indexOf(right.lane)
  if (laneDiff !== 0) {
    return laneDiff
  }
  return left.participantId - right.participantId
}

function getMaxCompleteMinute(
  timeline: MatchTimeline | null | undefined,
  gameDetail: GameDetail
): number {
  const detailDuration = toFiniteNumber(gameDetail.gameDuration)
  const maxTimestamp = Math.max(0, ...getSortedFrames(timeline).map(frame => readTimestamp(frame)))
  const timelineMinute = Math.floor(maxTimestamp / 60_000)
  if (detailDuration !== null && detailDuration > 0) {
    return Math.min(Math.floor(detailDuration / 60), timelineMinute)
  }
  return timelineMinute
}

function getSortedFrames(timeline: MatchTimeline | null | undefined): TimelineFrame[] {
  return [...(timeline?.frames ?? [])]
    .filter(frame => Number.isFinite(readTimestamp(frame)))
    .sort((left, right) => readTimestamp(left) - readTimestamp(right))
}

function getTimelineEvents(timeline: MatchTimeline | null | undefined): TimelineEvent[] {
  const rootEvents = timeline?.events ?? []
  if (rootEvents.length) {
    return rootEvents
  }
  return (timeline?.frames ?? []).flatMap(frame => frame.events ?? [])
}

function findPreviousFrame(frames: TimelineFrame[], timestamp: number): TimelineFrame | null {
  let result: TimelineFrame | null = null
  for (const frame of frames) {
    if (readTimestamp(frame) > timestamp) {
      break
    }
    result = frame
  }
  return result
}

function findParticipantFrame(frame: TimelineFrame, participantId: number): ParticipantFrame | null {
  const directFrame = frame.participantFrames?.[String(participantId)]
  if (directFrame) {
    return directFrame
  }
  return Object.values(frame.participantFrames ?? {}).find(candidate => candidate?.participantId === participantId) ?? null
}

function readFrameCs(frame: ParticipantFrame | null): number | null {
  if (!frame) {
    return null
  }
  return (toFiniteNumber(frame.minionsKilled) ?? 0) + (toFiniteNumber(frame.jungleMinionsKilled) ?? 0)
}

function sumParticipantStats(participants: GameParticipant[], key: string): number {
  return participants.reduce((total, participant) => total + readParticipantStat(participant, key), 0)
}

function readParticipantStat(participant: GameParticipant, key: string): number {
  const stats = participant.stats as Record<string, unknown> | undefined
  return Math.max(0, toFiniteNumber(stats?.[key]) ?? 0)
}

function readAssistingParticipantIds(event: TimelineEvent): number[] {
  return (event.assistingParticipantIds ?? [])
    .map(id => toFiniteNumber(id))
    .filter((id): id is number => id !== null)
}

function readWardCreatorId(event: TimelineEvent): number | null {
  return toFiniteNumber(event.participantId) ?? toFiniteNumber(readRawEventNumber(event, 'creatorId'))
}

function resolveEventTeamId(
  event: TimelineEvent,
  participantsById: Map<number, GameParticipant>
): number | null {
  const killerId = toFiniteNumber(event.killerId)
  if (killerId !== null) {
    return toFiniteNumber(participantsById.get(killerId)?.teamId)
  }
  return toFiniteNumber(event.teamId)
}

function readRawEventString(event: TimelineEvent, key: string): string | null {
  const value = readRawEventValue(event, key)
  return typeof value === 'string' ? value : null
}

function readRawEventNumber(event: TimelineEvent, key: string): number | null {
  return toFiniteNumber(readRawEventValue(event, key))
}

function readRawEventValue(event: TimelineEvent, key: string): unknown {
  if (!event.rawEventJson) {
    return null
  }
  try {
    const parsed = JSON.parse(event.rawEventJson) as Record<string, unknown>
    return parsed[key]
  } catch {
    return null
  }
}

function readTimestamp(source: Pick<TimelineFrame | TimelineEvent, 'timestamp'>): number {
  return toFiniteNumber(source.timestamp) ?? 0
}

function normalizeEventText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toUpperCase().replace(/[\s-]+/g, '_') : ''
}

function positiveInteger(value: number | null | undefined): number | null {
  const safeValue = toFiniteNumber(value)
  return safeValue !== null && safeValue > 0 ? Math.floor(safeValue) : null
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
