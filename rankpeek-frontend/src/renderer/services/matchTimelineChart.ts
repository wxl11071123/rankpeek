import type {
  GameDetail,
  GameParticipant,
  MatchTimeline,
  ParticipantFrame,
  TimelineEvent,
  TimelineFrame
} from '../types/api.ts'

export type ParticipantLane = 'top' | 'jungle' | 'middle' | 'bottom' | 'support'
export type GoldDiffMetricKey = 'teamAverage' | ParticipantLane
export type TimelineEventMarkerType = 'kill' | 'turret' | 'dragon' | 'baron' | 'herald' | 'voidgrub'

export interface GoldDiffPoint {
  timestamp: number
  blueValue: number
  redValue: number
  diff: number
}

export interface GoldDiffSeries {
  metric: GoldDiffMetricKey
  points: GoldDiffPoint[]
}

export interface GoldDiffDomain {
  min: number
  max: number
  zeroY: number
  ticks: number[]
}

export interface GoldDiffDomainOptions {
  maxTickCount?: number
}

export interface TimelineEventMarker {
  key: string
  type: TimelineEventMarkerType
  timestamp: number
  teamId: number | null
  participantId: number | null
  killerId: number | null
  victimId: number | null
  assistingParticipantIds: number[]
  killerChampionId: number | null
  victimChampionId: number | null
  participantChampionId: number | null
  killerName: string
  victimName: string
  participantName: string
}

export interface TimelineEventCluster {
  key: string
  timestamp: number
  endTimestamp: number
  teamId: number | null
  type: TimelineEventMarkerType
  items: TimelineEventMarker[]
  count: number
  markerSize: number
}

export interface TimelineEventDescription {
  text: string
  actorText: string
  actionText: string
  targetText: string
  actorChampionId: number | null
  targetChampionId: number | null
}

export interface LaneMatchupChampion {
  participantId: number
  championId: number
}

export interface LaneMatchup {
  metric: ParticipantLane
  blue: LaneMatchupChampion | null
  red: LaneMatchupChampion | null
}

export interface TimelineChartModel {
  seriesByMetric: Record<GoldDiffMetricKey, GoldDiffSeries>
  laneMatchups: Record<ParticipantLane, LaneMatchup>
  eventMarkers: TimelineEventMarker[]
  eventClusters: TimelineEventCluster[]
  maxTimestamp: number
}

const BLUE_TEAM_ID = 100
const RED_TEAM_ID = 200
const GOLD_DIFF_METRIC_KEYS: GoldDiffMetricKey[] = [
  'teamAverage',
  'top',
  'jungle',
  'middle',
  'bottom',
  'support'
]
const LANE_METRIC_KEYS: ParticipantLane[] = ['top', 'jungle', 'middle', 'bottom', 'support']
const DEFAULT_EVENT_CLUSTER_WINDOW_MS = 30000

export function createTimelineChartModel(
  timeline: MatchTimeline | null | undefined,
  gameDetail: GameDetail | null | undefined
): TimelineChartModel {
  const seriesByMetric: Record<GoldDiffMetricKey, GoldDiffSeries> = {
    teamAverage: createGoldDiffSeries(timeline, gameDetail, 'teamAverage'),
    top: createGoldDiffSeries(timeline, gameDetail, 'top'),
    jungle: createGoldDiffSeries(timeline, gameDetail, 'jungle'),
    middle: createGoldDiffSeries(timeline, gameDetail, 'middle'),
    bottom: createGoldDiffSeries(timeline, gameDetail, 'bottom'),
    support: createGoldDiffSeries(timeline, gameDetail, 'support')
  }
  const laneMatchups = createLaneMatchups(gameDetail)
  const eventMarkers = createTimelineEventMarkers(timeline, gameDetail)
  const eventClusters = clusterTimelineEventMarkers(eventMarkers)
  const seriesMaxTimestamp = GOLD_DIFF_METRIC_KEYS.reduce((maxTimestamp, key) => {
    const seriesMax = seriesByMetric[key].points.reduce(
      (innerMax, point) => Math.max(innerMax, point.timestamp),
      0
    )
    return Math.max(maxTimestamp, seriesMax)
  }, 0)
  const eventMaxTimestamp = eventMarkers.reduce(
    (maxTimestamp, marker) => Math.max(maxTimestamp, marker.timestamp),
    0
  )

  return {
    seriesByMetric,
    laneMatchups,
    eventMarkers,
    eventClusters,
    maxTimestamp: Math.max(seriesMaxTimestamp, eventMaxTimestamp)
  }
}

export function createGoldDiffSeries(
  timeline: MatchTimeline | null | undefined,
  gameDetail: GameDetail | null | undefined,
  metric: GoldDiffMetricKey
): GoldDiffSeries {
  const frames = getSortedFrames(timeline)
  const participants = gameDetail?.participants ?? []

  if (!frames.length || !participants.length) {
    return { metric, points: [] }
  }

  if (metric === 'teamAverage') {
    return {
      metric,
      points: frames.flatMap(frame => createTeamTotalGoldPoint(frame, participants))
    }
  }

  const pair = findLaneParticipantPair(participants, metric)
  if (!pair) {
    return { metric, points: [] }
  }

  return {
    metric,
    points: frames.flatMap(frame => createLaneGoldPoint(frame, pair.blueId, pair.redId))
  }
}

export function createTimelineEventMarkers(
  timeline: MatchTimeline | null | undefined,
  gameDetail: GameDetail | null | undefined
): TimelineEventMarker[] {
  const participantsById = new Map<number, GameParticipant>()
  for (const participant of gameDetail?.participants ?? []) {
    const participantId = toFiniteNumber(participant.participantId)
    if (participantId !== null) {
      participantsById.set(participantId, participant)
    }
  }

  const namesById = createParticipantNameMap(gameDetail)
  const events = getTimelineEvents(timeline)
  return events
    .map((event, index) => createTimelineEventMarker(event, index, participantsById, namesById))
    .filter((marker): marker is TimelineEventMarker => marker !== null)
    .sort((left, right) => left.timestamp - right.timestamp)
}

export function clusterTimelineEventMarkers(
  markers: TimelineEventMarker[],
  options: { windowMs?: number } = {}
): TimelineEventCluster[] {
  const windowMs = Math.max(0, options.windowMs ?? DEFAULT_EVENT_CLUSTER_WINDOW_MS)
  const sortedMarkers = [...markers].sort((left, right) => left.timestamp - right.timestamp)
  const clusters: TimelineEventCluster[] = []

  for (const marker of sortedMarkers) {
    const previousCluster = clusters[clusters.length - 1]
    if (
      previousCluster
      && previousCluster.teamId === marker.teamId
      && marker.timestamp - previousCluster.endTimestamp <= windowMs
    ) {
      previousCluster.items.push(marker)
      previousCluster.endTimestamp = marker.timestamp
      previousCluster.timestamp = Math.round((previousCluster.timestamp * (previousCluster.count) + marker.timestamp) / (previousCluster.count + 1))
      previousCluster.count = previousCluster.items.length
      previousCluster.markerSize = getTimelineClusterMarkerSize(previousCluster.count)
      previousCluster.type = getTimelineClusterType(previousCluster.items)
      previousCluster.key = createTimelineClusterKey(previousCluster)
      continue
    }

    clusters.push({
      key: `cluster-${marker.teamId ?? 'neutral'}-${marker.timestamp}-${marker.key}`,
      timestamp: marker.timestamp,
      endTimestamp: marker.timestamp,
      teamId: marker.teamId,
      type: marker.type,
      items: [marker],
      count: 1,
      markerSize: getTimelineClusterMarkerSize(1)
    })
  }

  return clusters
}

export function describeTimelineEventMarker(marker: TimelineEventMarker): TimelineEventDescription {
  const actorText = marker.killerName || marker.participantName || formatTimelineTeamName(marker.teamId)
  const targetText = getTimelineEventTargetText(marker)
  const actionText = marker.type === 'turret' ? '摧毁了' : '击杀了'
  return {
    text: `${actorText} ${actionText} ${targetText}`.trim(),
    actorText,
    actionText,
    targetText,
    actorChampionId: marker.killerChampionId ?? marker.participantChampionId,
    targetChampionId: marker.type === 'kill' ? marker.victimChampionId : null
  }
}

export function resolveParticipantLane(
  participant: GameParticipant | null | undefined
): ParticipantLane | null {
  if (!participant) {
    return null
  }

  const directPosition = firstLaneAlias(
    participant.teamPosition,
    participant.individualPosition,
    participant.timeline?.teamPosition,
    readRecordString(participant, 'selectedPosition')
  )
  if (directPosition !== null) {
    return directPosition
  }

  const lane = normalizePosition(participant.timeline?.rawLane ?? participant.timeline?.lane)
  const role = normalizePosition(participant.timeline?.rawRole ?? participant.timeline?.role)

  if (lane === 'BOTTOM' || lane === 'BOT') {
    if (role === 'SUPPORT' || role === 'DUO_SUPPORT') {
      return 'support'
    }
    if (role === 'DUO_CARRY' || role === 'CARRY' || role === 'SOLO' || role === null) {
      return 'bottom'
    }
  }

  const laneAlias = laneToMetric(lane)
  if (laneAlias !== null) {
    return laneAlias
  }

  return laneToMetric(role)
}

export function formatTimelineTime(timestamp: number | null | undefined): string {
  const safeTimestamp = toFiniteNumber(timestamp) ?? 0
  const totalSeconds = Math.max(0, Math.floor(safeTimestamp / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function formatGoldDiff(value: number | null | undefined): string {
  const safeValue = toFiniteNumber(value)
  if (safeValue === null) {
    return '--'
  }
  const rounded = Math.round(safeValue)
  if (rounded === 0) {
    return '0'
  }
  const prefix = rounded > 0 ? '+' : '-'
  return `${prefix}${Math.abs(rounded).toLocaleString('en-US')}`
}

export function formatGoldDiffTick(value: number | null | undefined): string {
  const safeValue = toFiniteNumber(value)
  if (safeValue === null) {
    return '--'
  }

  const rounded = Math.round(safeValue)
  if (rounded === 0) {
    return '0'
  }

  const prefix = rounded < 0 ? '-' : ''
  const absoluteValue = Math.abs(rounded)
  if (absoluteValue >= 10000) {
    const compact = absoluteValue / 1000
    const compactText = Number.isInteger(compact)
      ? String(compact)
      : compact.toFixed(1).replace(/\.0$/, '')
    return `${prefix}${compactText}k`
  }
  return `${prefix}${absoluteValue}`
}

export function createGoldDiffDomain(
  points: GoldDiffPoint[],
  options: GoldDiffDomainOptions = {}
): GoldDiffDomain {
  const values = points
    .map(point => toFiniteNumber(point.diff))
    .filter((value): value is number => value !== null)

  if (!values.length) {
    return createSymmetricGoldDiffDomain(1000, options)
  }

  const maxAbsoluteValue = Math.max(...values.map(value => Math.abs(value)))
  return createSymmetricGoldDiffDomain(getNiceGoldDiffLimit(maxAbsoluteValue), options)
}

function createSymmetricGoldDiffDomain(
  limit: number,
  options: GoldDiffDomainOptions = {}
): GoldDiffDomain {
  const safeLimit = Math.max(100, Math.round(limit))
  return {
    min: -safeLimit,
    max: safeLimit,
    zeroY: 0.5,
    ticks: createSymmetricGoldDiffTicks(safeLimit, options.maxTickCount)
  }
}

function getNiceGoldDiffLimit(maxAbsoluteValue: number): number {
  if (maxAbsoluteValue <= 0) {
    return 1000
  }
  if (maxAbsoluteValue < 500) {
    return Math.max(100, Math.ceil(maxAbsoluteValue / 100) * 100)
  }
  if (maxAbsoluteValue < 1000) {
    return Math.ceil(maxAbsoluteValue / 250) * 250
  }
  return Math.ceil(maxAbsoluteValue / 1000) * 1000
}

function createSymmetricGoldDiffTicks(limit: number, maxTickCount?: number): number[] {
  const safeMaxTickCount = Number.isFinite(maxTickCount)
    ? Math.max(3, Math.floor(maxTickCount ?? 0))
    : Number.POSITIVE_INFINITY
  let step = getGoldDiffTickStep(limit)
  let ticks = buildSymmetricGoldDiffTicks(limit, step)

  while (ticks.length > safeMaxTickCount) {
    const nextStep = getNextGoldDiffTickStep(step)
    if (nextStep <= step) {
      break
    }
    step = nextStep
    ticks = buildSymmetricGoldDiffTicks(limit, step)
  }

  return ticks
}

function buildSymmetricGoldDiffTicks(limit: number, step: number): number[] {
  const ticks: number[] = []
  const maxTick = Math.floor(limit / step) * step
  if (maxTick <= 0) {
    return [-limit, 0, limit]
  }
  for (let value = -maxTick; value <= maxTick; value += step) {
    ticks.push(value)
  }
  if (!ticks.includes(0)) {
    ticks.push(0)
  }
  return [...new Set(ticks)].sort((left, right) => left - right)
}

function getGoldDiffTickStep(limit: number): number {
  if (limit <= 500) {
    return 100
  }
  if (limit < 1000) {
    return 250
  }
  return 1000
}

function getNextGoldDiffTickStep(step: number): number {
  const niceSteps = [100, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000]
  const nextNiceStep = niceSteps.find(candidate => candidate > step)
  if (nextNiceStep !== undefined) {
    return nextNiceStep
  }
  return step * 2
}

function createTeamTotalGoldPoint(
  frame: TimelineFrame,
  participants: GameParticipant[]
): GoldDiffPoint[] {
  const blueIds = participants
    .filter(participant => participant.teamId === BLUE_TEAM_ID)
    .map(participant => participant.participantId)
  const redIds = participants
    .filter(participant => participant.teamId === RED_TEAM_ID)
    .map(participant => participant.participantId)
  const timestamp = toFiniteNumber(frame.timestamp)
  const blueValues = blueIds.flatMap(participantId => readFrameTotalGold(frame, participantId))
  const redValues = redIds.flatMap(participantId => readFrameTotalGold(frame, participantId))

  if (timestamp === null || !blueValues.length || !redValues.length) {
    return []
  }

  const blueValue = sum(blueValues)
  const redValue = sum(redValues)
  return [{ timestamp, blueValue, redValue, diff: blueValue - redValue }]
}

function createLaneGoldPoint(frame: TimelineFrame, blueId: number, redId: number): GoldDiffPoint[] {
  const timestamp = toFiniteNumber(frame.timestamp)
  const blueValue = readFrameTotalGold(frame, blueId)[0]
  const redValue = readFrameTotalGold(frame, redId)[0]

  if (timestamp === null || blueValue === undefined || redValue === undefined) {
    return []
  }

  return [{ timestamp, blueValue, redValue, diff: blueValue - redValue }]
}

function findLaneParticipantPair(
  participants: GameParticipant[],
  lane: ParticipantLane
): { blueId: number; redId: number } | null {
  const blue = participants.find(
    participant => participant.teamId === BLUE_TEAM_ID && resolveParticipantLane(participant) === lane
  )
  const red = participants.find(
    participant => participant.teamId === RED_TEAM_ID && resolveParticipantLane(participant) === lane
  )
  if (!blue || !red) {
    return null
  }
  const blueId = toFiniteNumber(blue.participantId)
  const redId = toFiniteNumber(red.participantId)
  if (blueId === null || redId === null) {
    return null
  }

  return {
    blueId,
    redId
  }
}

function createLaneMatchups(
  gameDetail: GameDetail | null | undefined
): Record<ParticipantLane, LaneMatchup> {
  const participants = gameDetail?.participants ?? []
  return LANE_METRIC_KEYS.reduce((matchups, lane) => {
    matchups[lane] = {
      metric: lane,
      blue: findLaneMatchupChampion(participants, lane, BLUE_TEAM_ID),
      red: findLaneMatchupChampion(participants, lane, RED_TEAM_ID)
    }
    return matchups
  }, {} as Record<ParticipantLane, LaneMatchup>)
}

function findLaneMatchupChampion(
  participants: GameParticipant[],
  lane: ParticipantLane,
  teamId: number
): LaneMatchupChampion | null {
  const participant = participants.find(
    candidate => candidate.teamId === teamId && resolveParticipantLane(candidate) === lane
  )
  const participantId = toFiniteNumber(participant?.participantId)
  const championId = readChampionId(participant)
  if (participantId === null || championId === null) {
    return null
  }
  return { participantId, championId }
}

function readFrameTotalGold(frame: TimelineFrame, participantId: number): number[] {
  const participantFrame = findParticipantFrame(frame, participantId)
  const totalGold = toFiniteNumber(participantFrame?.totalGold)
  return totalGold === null ? [] : [totalGold]
}

function findParticipantFrame(
  frame: TimelineFrame,
  participantId: number
): ParticipantFrame | null {
  const directFrame = frame.participantFrames?.[String(participantId)]
  if (directFrame) {
    return directFrame
  }

  for (const participantFrame of Object.values(frame.participantFrames ?? {})) {
    if (participantFrame?.participantId === participantId) {
      return participantFrame
    }
  }
  return null
}

function getSortedFrames(timeline: MatchTimeline | null | undefined): TimelineFrame[] {
  return [...(timeline?.frames ?? [])]
    .filter(frame => toFiniteNumber(frame.timestamp) !== null)
    .sort((left, right) => (toFiniteNumber(left.timestamp) ?? 0) - (toFiniteNumber(right.timestamp) ?? 0))
}

function getTimelineEvents(timeline: MatchTimeline | null | undefined): TimelineEvent[] {
  const rootEvents = timeline?.events ?? []
  if (rootEvents.length) {
    return rootEvents
  }

  return (timeline?.frames ?? []).flatMap(frame => frame.events ?? [])
}

function createTimelineEventMarker(
  event: TimelineEvent,
  index: number,
  participantsById: Map<number, GameParticipant>,
  namesById: Map<number, string>
): TimelineEventMarker | null {
  const timestamp = toFiniteNumber(event.timestamp)
  const type = classifyTimelineEvent(event)
  if (timestamp === null || type === null) {
    return null
  }

  const killerId = toFiniteNumber(event.killerId)
  const victimId = toFiniteNumber(event.victimId)
  const participantId = toFiniteNumber(event.participantId)
  const assistingParticipantIds = (event.assistingParticipantIds ?? [])
    .map(id => toFiniteNumber(id))
    .filter((id): id is number => id !== null)
  const teamId = resolveEventTeamId(event, participantsById)
  const killerParticipant = killerId === null ? undefined : participantsById.get(killerId)
  const victimParticipant = victimId === null ? undefined : participantsById.get(victimId)
  const participant = participantId === null ? undefined : participantsById.get(participantId)

  return {
    key: `${type}-${timestamp}-${index}`,
    type,
    timestamp,
    teamId,
    participantId,
    killerId,
    victimId,
    assistingParticipantIds,
    killerChampionId: readChampionId(killerParticipant),
    victimChampionId: readChampionId(victimParticipant),
    participantChampionId: readChampionId(participant),
    killerName: killerId === null ? '' : namesById.get(killerId) ?? '',
    victimName: victimId === null ? '' : namesById.get(victimId) ?? '',
    participantName: participantId === null ? '' : namesById.get(participantId) ?? ''
  }
}

function classifyTimelineEvent(event: TimelineEvent): TimelineEventMarkerType | null {
  const eventType = normalizeEventText(event.eventType)
  if (eventType === 'CHAMPION_KILL') {
    return 'kill'
  }

  if (eventType === 'BUILDING_KILL' && isTurretKill(event)) {
    return 'turret'
  }

  if (eventType !== 'ELITE_MONSTER_KILL') {
    return null
  }

  const monsterType = normalizeEventText(event.monsterType)
  if (monsterType.includes('DRAGON')) {
    return 'dragon'
  }
  if (monsterType.includes('BARON')) {
    return 'baron'
  }
  if (monsterType.includes('RIFTHERALD') || monsterType.includes('HERALD')) {
    return 'herald'
  }
  if (monsterType.includes('HORDE') || monsterType.includes('VOIDGRUB')) {
    return 'voidgrub'
  }
  return null
}

function getTimelineClusterMarkerSize(count: number): number {
  return Math.min(20, 11 + Math.max(0, count - 1) * 4)
}

function getTimelineClusterType(items: TimelineEventMarker[]): TimelineEventMarkerType {
  const priority: TimelineEventMarkerType[] = ['baron', 'dragon', 'herald', 'voidgrub', 'turret', 'kill']
  return priority.find(type => items.some(item => item.type === type)) ?? items[0]?.type ?? 'kill'
}

function createTimelineClusterKey(cluster: TimelineEventCluster): string {
  return `cluster-${cluster.teamId ?? 'neutral'}-${cluster.items[0]?.timestamp ?? cluster.timestamp}-${cluster.count}`
}

function getTimelineEventTargetText(marker: TimelineEventMarker): string {
  if (marker.type === 'kill') {
    return marker.victimName || '敌方英雄'
  }
  switch (marker.type) {
    case 'turret':
      return '防御塔'
    case 'dragon':
      return '小龙'
    case 'baron':
      return '纳什男爵'
    case 'herald':
      return '峡谷先锋'
    case 'voidgrub':
      return '虚空巢虫'
    default:
      return '资源'
  }
}

function formatTimelineTeamName(teamId: number | null): string {
  if (teamId === BLUE_TEAM_ID) {
    return '蓝色方'
  }
  if (teamId === RED_TEAM_ID) {
    return '红色方'
  }
  return '队伍'
}

function isTurretKill(event: TimelineEvent): boolean {
  const buildingType = normalizeEventText(event.buildingType)
  const towerType = normalizeEventText(event.towerType)
  return buildingType.includes('TOWER') || buildingType.includes('TURRET')
    || towerType.includes('TOWER') || towerType.includes('TURRET')
}

function resolveEventTeamId(
  event: TimelineEvent,
  participantsById: Map<number, GameParticipant>
): number | null {
  const killerId = toFiniteNumber(event.killerId)
  if (killerId !== null) {
    const killerTeamId = toFiniteNumber(participantsById.get(killerId)?.teamId)
    if (killerTeamId !== null) {
      return killerTeamId
    }
  }

  return toFiniteNumber(event.teamId)
}

function createParticipantNameMap(gameDetail: GameDetail | null | undefined): Map<number, string> {
  const names = new Map<number, string>()
  for (const identity of gameDetail?.participantIdentities ?? []) {
    const participantId = toFiniteNumber(identity.participantId)
    if (participantId === null) {
      continue
    }

    const gameName = identity.player?.gameName?.trim()
    const tagLine = identity.player?.tagLine?.trim()
    const summonerName = identity.player?.summonerName?.trim()
    if (gameName) {
      names.set(participantId, tagLine ? `${gameName}#${tagLine}` : gameName)
    } else if (summonerName) {
      names.set(participantId, summonerName)
    }
  }
  return names
}

function firstLaneAlias(...values: Array<string | null | undefined>): ParticipantLane | null {
  for (const value of values) {
    const lane = laneToMetric(normalizePosition(value))
    if (lane !== null) {
      return lane
    }
  }
  return null
}

function laneToMetric(value: string | null): ParticipantLane | null {
  switch (value) {
    case 'TOP':
      return 'top'
    case 'JUNGLE':
      return 'jungle'
    case 'MIDDLE':
    case 'MID':
      return 'middle'
    case 'BOTTOM':
    case 'BOT':
    case 'DUO_CARRY':
      return 'bottom'
    case 'UTILITY':
    case 'SUPPORT':
    case 'DUO_SUPPORT':
      return 'support'
    default:
      return null
  }
}

function normalizePosition(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }
  return value.trim().toUpperCase().replace(/[\s-]+/g, '_')
}

function normalizeEventText(value: string | null | undefined): string {
  return normalizePosition(value) ?? ''
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function readChampionId(participant: GameParticipant | null | undefined): number | null {
  const championId = toFiniteNumber(participant?.championId)
  return championId !== null && championId > 0 ? championId : null
}

function toFiniteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readRecordString(source: unknown, key: string): string | null {
  if (!isRecord(source)) {
    return null
  }
  const value = source[key]
  return typeof value === 'string' ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
