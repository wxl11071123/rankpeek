import type {
  GameDetail,
  GameParticipant,
  GameParticipantIdentity,
  MatchHistory,
  MatchTimeline,
  ParticipantFrame,
  TeamObjectiveSummary,
  TimelineEvent,
  TimelineFrame
} from '../types/api.ts'
import {
  createTimelineChartModel,
  resolveParticipantLane,
  type GoldDiffMetricKey
} from './matchTimelineChart.ts'
import {
  createMatchRpIndexModel,
  formatRpScore,
  type RpIndexUnavailableReason,
  type RpTrendLabel
} from './matchRpIndex.ts'
import { stableStringify } from './aiAnalysisInputSnapshot.ts'
import {
  getItemAssetDetails,
  getPerkAssetDetails
} from '../utils/gameAssetUrls.ts'
import { getChampionDisplayName } from '../utils/championSearchAliases.ts'

export type PostgameAiMode = 'review' | 'praise'
export type PostgameAiAnalysisType = 'postgame'
export type PostgameAiSide = 'blue' | 'red'

export interface PostgameAnalysisBrief {
  schemaVersion: 'postgame_analysis_brief.v1'
  language: 'zh-CN'
  matchFacts: string[]
  teamFacts: string[]
  playerFacts: string[]
  timelineFacts: string[]
  dataQualityFacts: string[]
}

export interface PostgameAiInputSnapshot {
  schemaVersion: 'postgame_ai_input_snapshot.v3'
  analysisType: PostgameAiAnalysisType
  builtAt: string
  inputHash: string
  analysisBrief: PostgameAnalysisBrief
}

export interface PostgameAiMatchSnapshot {
  matchIdHash?: string
  gameIdHash?: string
  queueId: number | null
  queueName?: string
  gameMode?: string
  gameVersion?: string | null
  gameCreation?: number | null
  durationSeconds?: number | null
  isRanked: boolean
  isAram: boolean
  isArena: boolean
}

export interface PostgameAiDataQualitySnapshot {
  hasMatchHistory: boolean
  hasGameDetail: boolean
  hasTimeline: boolean
  participantCount: number
  teamCount: number
  hasRankedTimelineMetrics: boolean
  hasArenaAugments: boolean
  warnings: string[]
}

export interface PostgameAiTeamSnapshot {
  side: PostgameAiSide
  teamId: 100 | 200
  win: boolean | null
  totals: {
    kills: number
    deaths: number
    assists: number
    goldEarned: number
    totalDamageDealtToChampions: number
    totalDamageTaken: number
    visionScore: number
  }
  objectives?: {
    dragons: number | null
    barons: number | null
    heralds: number | null
    grubs: number | null
    towers: number | null
    inhibitors: number | null
    turretPlates: number | null
  }
  rankedMetrics?: {
    teamGoldDiffAt15?: number
    laneGoldDiffAt15?: Partial<Record<Exclude<GoldDiffMetricKey, 'teamAverage'>, number>>
  }
}

export interface PostgameAiPlayerSnapshot {
  playerKey: string
  side: PostgameAiSide
  teamId: number
  participantId: number
  isCurrentPlayer: boolean
  championId: number | null
  championName?: string
  role?: string
  lane?: string
  position?: string
  level?: number
  stats: {
    win: boolean | null
    kills: number
    deaths: number
    assists: number
    kda: number | null
    killParticipation: number | null
    goldEarned: number
    goldShare: number | null
    totalDamageDealtToChampions: number
    damageShare: number | null
    totalDamageTaken: number
    damageTakenShare: number | null
    damageToGoldRatio: number | null
    visionScore: number
    cs: number
    csPerMinute: number | null
    doubleKills: number
    tripleKills: number
    quadraKills: number
    pentaKills: number
    largestKillingSpree: number | null
    legendaryCount: number
  }
  loadout: {
    spellIds: number[]
    itemIds: number[]
    runeIds: number[]
    augmentIds: number[]
  }
  rankedMetrics?: {
    laneGoldDiffAt15?: number
    teamGoldDiffAt15?: number
    turretPlatesTaken?: number
  }
  factTags?: {
    rankings: string[]
    highlights: string[]
  }
}

export interface PostgameAiTimelineSnapshot {
  hasTimeline: boolean
  durationSeconds?: number
  goldDiffPoints?: Array<{
    minute: number
    teamGoldDiff?: number
    topGoldDiff?: number
    jungleGoldDiff?: number
    middleGoldDiff?: number
    bottomGoldDiff?: number
    supportGoldDiff?: number
  }>
  objectiveEvents?: Array<{
    timeSeconds: number
    type: string
    teamId?: number
    side?: PostgameAiSide
    isCurrentPlayerAlive?: boolean
  }>
  deathEvents?: Array<{
    timeSeconds: number
    playerKey: string
    championId?: number
    teamId: number
    side: PostgameAiSide
    teamGoldDiffAtDeath?: number
    secondsBeforeObjective?: number
  }>
  rpIndexPlayers?: Array<{
    playerKey: string
    finalScore: number
    trendLabel?: RpTrendLabel
    points: number[]
  }>
  rpIndexUnavailableReason?: RpIndexUnavailableReason
}

type PostgameAiRpIndexPlayerSnapshot = NonNullable<PostgameAiTimelineSnapshot['rpIndexPlayers']>[number]

interface BuildPostgameAiInputSnapshotParams {
  matchHistory: MatchHistory
  gameDetail: GameDetail | null
  timeline: MatchTimeline | null
  currentPuuid: string
  currentSummonerName: string
  championNamesById?: ChampionNameLookup
}

type SnapshotParticipant = GameParticipant
type ChampionNameLookup = Record<number, string> | Map<number, string>

const POSTGAME_AI_SCHEMA_VERSION = 'postgame_ai_input_snapshot.v3'
const POSTGAME_ANALYSIS_BRIEF_SCHEMA_VERSION = 'postgame_analysis_brief.v1'
const BLUE_TEAM_ID = 100
const RED_TEAM_ID = 200
const RANKED_QUEUE_IDS = new Set([420, 440])
const ARAM_QUEUE_IDS = new Set([450])
const ARENA_QUEUE_IDS = new Set([1700, 1710])
const LANE_METRICS: Array<Exclude<GoldDiffMetricKey, 'teamAverage'>> = [
  'top',
  'jungle',
  'middle',
  'bottom',
  'support'
]
const LANE_METRIC_LABELS: Record<Exclude<GoldDiffMetricKey, 'teamAverage'>, string> = {
  top: '上单',
  jungle: '打野',
  middle: '中单',
  bottom: '下路',
  support: '辅助'
}

export function buildPostgameAiInputSnapshot(
  params: BuildPostgameAiInputSnapshotParams
): PostgameAiInputSnapshot {
  const detail = params.gameDetail?.participants?.length
    ? params.gameDetail
    : toGameDetailFromMatchHistory(params.matchHistory)
  const participants = detail?.participants ?? []
  const identities = detail?.participantIdentities ?? []
  const teamIds = new Set(participants.map(participant => toTeamId(participant.teamId)).filter((teamId): teamId is 100 | 200 => teamId !== null))
  const warnings: string[] = []
  const match = buildMatchSnapshot(params.matchHistory, detail)
  const playerKeyByParticipantId = new Map<number, string>()
  participants.forEach(participant => {
    playerKeyByParticipantId.set(participant.participantId, createPlayerKey(participant))
  })
  const currentParticipantId = findCurrentParticipantId(identities, params.currentPuuid, params.currentSummonerName)

  if (!participants.length) {
    warnings.push('match participants are unavailable')
  }
  if (!params.gameDetail?.participants?.length) {
    warnings.push('game detail is unavailable; using match history summary only')
  }
  if (!hasTimeline(params.timeline)) {
    warnings.push('timeline is unavailable')
  }
  if (currentParticipantId === null) {
    warnings.push('current player could not be matched to a participant')
  }

  const teamTotals = createTeamTotals(participants)
  const teamGoldDiffAt15 = getTeamGoldDiffAtMinute(params.timeline, participants, 15)
  const laneGoldDiffAt15 = createLaneGoldDiffAtMinuteMap(params.timeline, participants, 15)
  const players = withPlayerFactTags(participants.map(participant => toPlayerSnapshot(
    participant,
    currentParticipantId,
    teamTotals,
    match.durationSeconds ?? null,
    teamGoldDiffAt15,
    laneGoldDiffAt15,
    params.championNamesById
  )))
  const timelineSnapshot = createTimelineSnapshot(params.timeline, detail, playerKeyByParticipantId, currentParticipantId)
  const hasRankedTimelineMetrics = match.isRanked
    && teamGoldDiffAt15 !== null
    && laneGoldDiffAt15.size > 0
  const hasArenaAugments = players.some(player => player.loadout.augmentIds.length > 0)
  const teams = ([BLUE_TEAM_ID, RED_TEAM_ID] as const)
    .filter(teamId => teamIds.has(teamId))
    .map(teamId => toTeamSnapshot(
      teamId,
      participants,
      teamTotals,
      detail?.teamObjectives,
      teamGoldDiffAt15,
      laneGoldDiffAt15
    ))
  const dataQuality: PostgameAiDataQualitySnapshot = {
    hasMatchHistory: Boolean(params.matchHistory),
    hasGameDetail: Boolean(params.gameDetail?.participants?.length),
    hasTimeline: hasTimeline(params.timeline),
    participantCount: participants.length,
    teamCount: teamIds.size,
    hasRankedTimelineMetrics,
    hasArenaAugments,
    warnings
  }
  const snapshotWithoutHash: PostgameAiInputSnapshot = {
    schemaVersion: POSTGAME_AI_SCHEMA_VERSION,
    analysisType: 'postgame',
    builtAt: new Date().toISOString(),
    inputHash: '',
    analysisBrief: buildPostgameAnalysisBrief({
      match,
      teams,
      players,
      timeline: timelineSnapshot,
      dataQuality
    })
  }

  return {
    ...snapshotWithoutHash,
    inputHash: createPostgameAiInputHash(snapshotWithoutHash)
  }
}

export function createPostgameAiInputHash(snapshot: PostgameAiInputSnapshot): string {
  const hashInput: Record<string, unknown> = { ...snapshot }
  delete hashInput.builtAt
  delete hashInput.inputHash
  return hashText(stableStringify(hashInput))
}

interface BuildPostgameAnalysisBriefInput {
  match: PostgameAiMatchSnapshot
  teams: PostgameAiTeamSnapshot[]
  players: PostgameAiPlayerSnapshot[]
  timeline: PostgameAiTimelineSnapshot
  dataQuality: PostgameAiDataQualitySnapshot
}

function buildPostgameAnalysisBrief(input: BuildPostgameAnalysisBriefInput): PostgameAnalysisBrief {
  const currentPlayer = input.players.find(player => player.isCurrentPlayer)
  const currentSide = currentPlayer?.side ?? null
  const rpIndexByPlayerKey = new Map(
    (input.timeline.rpIndexPlayers ?? []).map(player => [player.playerKey, player])
  )

  return {
    schemaVersion: POSTGAME_ANALYSIS_BRIEF_SCHEMA_VERSION,
    language: 'zh-CN',
    matchFacts: buildMatchFacts(input.match, input.teams, currentPlayer, currentSide),
    teamFacts: input.teams.map(team => formatTeamFact(team, currentSide)),
    playerFacts: input.players.map(player => formatPlayerFact(player, currentSide, rpIndexByPlayerKey.get(player.playerKey))),
    timelineFacts: buildTimelineFacts(input.timeline, input.players, currentPlayer, currentSide),
    dataQualityFacts: buildDataQualityFacts(input.dataQuality)
  }
}

function buildMatchFacts(
  match: PostgameAiMatchSnapshot,
  teams: PostgameAiTeamSnapshot[],
  currentPlayer: PostgameAiPlayerSnapshot | undefined,
  currentSide: PostgameAiSide | null
): string[] {
  const facts: string[] = []
  const queue = formatQueueLabel(match)
  const winner = teams.find(team => team.win === true)
  const winnerText = winner ? `${formatRelativeSide(winner.side, currentSide)}获胜` : '胜负未知'
  facts.push(`模式：${queue}；时间：${formatMatchDurationClock(match.durationSeconds)}；结果：${winnerText}。`)

  if (currentPlayer) {
    facts.push(`当前用户：${formatRelativeSide(currentPlayer.side, currentSide)}；英雄：${formatChampionLabel(currentPlayer)}；位置：${formatRoleLabel(currentPlayer)}。`)
  } else {
    facts.push('未能确认当前用户对应玩家。')
  }

  return facts
}

function formatQueueLabel(match: PostgameAiMatchSnapshot): string {
  switch (match.queueId) {
    case 420:
      return '单双排位'
    case 440:
      return '灵活排位'
    case 450:
      return '极地大乱斗'
    case 1700:
    case 1710:
      return '斗魂竞技场'
    default:
      return readUsableQueueName(match.queueName)
        ?? match.gameMode
        ?? (match.queueId !== null ? `队列 ${match.queueId}` : '未知队列')
  }
}

function readUsableQueueName(queueName: string | undefined): string | null {
  const value = firstString(queueName)
  if (!value) {
    return null
  }
  return /[?�?]{2,}/u.test(value) ? null : value
}

function formatTeamFact(team: PostgameAiTeamSnapshot, currentSide: PostgameAiSide | null): string {
  const objectiveParts = team.objectives
    ? [
        formatObjectiveCount('小龙', team.objectives.dragons),
        formatObjectiveCount('大龙', team.objectives.barons),
        formatObjectiveCount('先锋', team.objectives.heralds),
        formatObjectiveCount('巢虫', team.objectives.grubs),
        formatObjectiveCount('防御塔', team.objectives.towers),
        formatObjectiveCount('水晶', team.objectives.inhibitors),
        formatObjectiveCount('镀层', team.objectives.turretPlates, { positiveOnly: true })
      ].filter(Boolean)
    : []
  const objectiveText = objectiveParts.length ? `，目标资源：${objectiveParts.join('、')}` : ''
  const rankedMetricText = formatTeamRankedMetricFact(team)

  return `${formatRelativeSide(team.side, currentSide)}${team.win === true ? '胜利' : team.win === false ? '失败' : '胜负未知'}，团队KDA ${team.totals.kills}/${team.totals.deaths}/${team.totals.assists}，总经济${formatInteger(team.totals.goldEarned)}，英雄伤害${formatInteger(team.totals.totalDamageDealtToChampions)}，承伤${formatInteger(team.totals.totalDamageTaken)}，视野分${formatInteger(team.totals.visionScore)}${rankedMetricText}${objectiveText}。`
}

function formatPlayerFact(
  player: PostgameAiPlayerSnapshot,
  currentSide: PostgameAiSide | null,
  rpPlayer?: NonNullable<PostgameAiTimelineSnapshot['rpIndexPlayers']>[number]
): string {
  const parts = [
    `${formatPlayerBriefLabel(player, currentSide)}${player.stats.kills}/${player.stats.deaths}/${player.stats.assists}`,
    player.stats.killParticipation !== null ? `参团率${formatPercent(player.stats.killParticipation)}` : '',
    player.stats.damageShare !== null ? `伤害占比${formatPercent(player.stats.damageShare)}` : '',
    player.stats.goldShare !== null ? `经济占比${formatPercent(player.stats.goldShare)}` : '',
    player.stats.damageTakenShare !== null ? `承伤占比${formatPercent(player.stats.damageTakenShare)}` : '',
    `视野分${formatInteger(player.stats.visionScore)}`,
    `补刀${formatInteger(player.stats.cs)}`,
    player.stats.csPerMinute !== null ? `每分钟补刀${formatDecimal(player.stats.csPerMinute)}` : '',
    formatLoadoutFact(player),
    formatRankedMetricFact(player),
    formatPlayerRpIndexFact(rpPlayer),
    formatFactTagGroup('排名', player.factTags?.rankings),
    formatFactTagGroup('高光', player.factTags?.highlights)
  ].filter(Boolean)

  return `${parts.join('，')}。`
}

function formatPlayerRpIndexFact(rpPlayer: NonNullable<PostgameAiTimelineSnapshot['rpIndexPlayers']>[number] | undefined): string {
  if (!rpPlayer) {
    return ''
  }
  return `RP终局${formatRpScore(rpPlayer.finalScore)}`
}

function formatLoadoutFact(player: PostgameAiPlayerSnapshot): string {
  const parts = [
    formatFinalItemBuildFact(player.loadout.itemIds),
    formatRuneBuildFact(player.loadout.runeIds)
  ].filter(Boolean)
  return parts.join('，')
}

function formatFinalItemBuildFact(itemIds: number[]): string {
  const itemNames = itemIds
    .map(itemId => firstString(getItemAssetDetails(itemId)?.name))
    .filter((name): name is string => name !== null)
  if (!itemNames.length) {
    return ''
  }
  return `最终装备：${itemNames.join('、')}`
}

function formatRuneBuildFact(runeIds: number[]): string {
  const primaryRuneNames = runeIds.slice(0, 4)
    .map(readPerkName)
    .filter(Boolean)
  const secondaryRuneNames = runeIds.slice(4, 6)
    .map(readPerkName)
    .filter(Boolean)
  const primaryStyleName = readPerkName(runeIds[6])
  const secondaryStyleName = readPerkName(runeIds[7])
  const styleText = [primaryStyleName, secondaryStyleName].filter(Boolean).join('/')
  const runeParts: string[] = []
  if (primaryRuneNames.length) {
    runeParts.push(`主系：${primaryRuneNames.join('、')}`)
  }
  if (secondaryRuneNames.length) {
    runeParts.push(`副系：${secondaryRuneNames.join('、')}`)
  }
  if (!styleText && !runeParts.length) {
    return ''
  }
  if (styleText) {
    return `符文：${styleText}${runeParts.length ? `，${runeParts.join('，')}` : ''}`
  }
  return `符文：${runeParts.join('，')}`
}

function readPerkName(perkId: number | undefined): string {
  if (perkId === undefined) {
    return ''
  }
  return firstString(getPerkAssetDetails(perkId)?.name) ?? ''
}

function formatRankedMetricFact(player: PostgameAiPlayerSnapshot): string {
  const metrics = player.rankedMetrics
  if (!metrics) {
    return ''
  }

  const parts: string[] = []
  if (metrics.turretPlatesTaken !== undefined && metrics.turretPlatesTaken > 0) {
    parts.push(`个人镀层${metrics.turretPlatesTaken}`)
  }
  return parts.join('，')
}

function formatTeamRankedMetricFact(team: PostgameAiTeamSnapshot): string {
  const metrics = team.rankedMetrics
  if (!metrics) {
    return ''
  }

  const parts: string[] = []
  if (metrics.teamGoldDiffAt15 !== undefined) {
    parts.push(`15分钟团队经济${formatSignedInteger(metrics.teamGoldDiffAt15)}`)
  }

  const laneGoldDiffParts = LANE_METRICS
    .map(metric => {
      const diff = metrics.laneGoldDiffAt15?.[metric]
      return diff === undefined ? '' : `${LANE_METRIC_LABELS[metric]}${formatSignedInteger(diff)}`
    })
    .filter(Boolean)
  if (laneGoldDiffParts.length) {
    parts.push(`15分钟对位经济：${laneGoldDiffParts.join('、')}`)
  }

  return parts.length ? `，${parts.join('，')}` : ''
}

function formatFactTagGroup(label: string, values: string[] | undefined): string {
  return values?.length ? `${label}：${values.join('、')}` : ''
}

function formatObjectiveCount(label: string, value: number | null, options: { positiveOnly?: boolean } = {}): string {
  if (value === null || (options.positiveOnly && value <= 0)) {
    return ''
  }
  return `${label}${formatInteger(value)}`
}

function buildTimelineFacts(
  timeline: PostgameAiTimelineSnapshot,
  players: PostgameAiPlayerSnapshot[],
  currentPlayer: PostgameAiPlayerSnapshot | undefined,
  currentSide: PostgameAiSide | null
): string[] {
  if (!timeline.hasTimeline) {
    return ['缺少 timeline，不能分析具体时间点、死亡前视野或资源交换。']
  }

  const facts: string[] = []
  const timedFacts: Array<{ timeSeconds: number; order: number; text: string }> = []
  let order = 0
  const addTimedFact = (timeSeconds: number, text: string): void => {
    timedFacts.push({ timeSeconds, order, text })
    order += 1
  }

  if (timeline.durationSeconds !== undefined) {
    facts.push(`timeline 覆盖时长${formatDuration(timeline.durationSeconds)}。`)
  }

  facts.push(...buildRpIndexTimelineFacts(timeline, players, currentSide))

  for (const event of timeline.objectiveEvents ?? []) {
    addTimedFact(event.timeSeconds, `${formatClock(event.timeSeconds)} ${formatObjectiveEventSide(event, currentSide)}获得${formatObjectiveLabel(event.type)}。`)
  }

  const currentDeaths = currentPlayer
    ? (timeline.deathEvents ?? []).filter(event => event.playerKey === currentPlayer.playerKey)
    : []
  for (const event of currentDeaths) {
    const goldText = event.teamGoldDiffAtDeath !== undefined
      ? `，死亡时所在方${formatPerspectiveGoldDiff(event.teamGoldDiffAtDeath)}`
      : ''
    const objectiveText = event.secondsBeforeObjective !== undefined
      ? `，距离下一次资源约${event.secondsBeforeObjective}秒`
      : ''
    addTimedFact(event.timeSeconds, `${formatClock(event.timeSeconds)} ${formatPlayerBriefLabel(currentPlayer as PostgameAiPlayerSnapshot, currentSide)}死亡${goldText}${objectiveText}。`)
  }

  const deathsBeforeObjective = (timeline.deathEvents ?? [])
    .filter(event => event.secondsBeforeObjective !== undefined && event.secondsBeforeObjective <= 60)
  for (const event of deathsBeforeObjective) {
    const player = players.find(candidate => candidate.playerKey === event.playerKey)
    if (!player) {
      continue
    }
    addTimedFact(event.timeSeconds, `${formatClock(event.timeSeconds)} ${formatPlayerBriefLabel(player, currentSide)}在资源前${event.secondsBeforeObjective}秒死亡。`)
  }

  facts.push(...timedFacts
    .sort((left, right) => left.timeSeconds - right.timeSeconds || left.order - right.order)
    .map(fact => fact.text))

  return facts.length ? facts : ['timeline 可用，但没有可确认的关键资源、死亡或经济差事件。']
}

function buildRpIndexTimelineFacts(
  timeline: PostgameAiTimelineSnapshot,
  players: PostgameAiPlayerSnapshot[],
  currentSide: PostgameAiSide | null
): string[] {
  if (timeline.rpIndexPlayers?.length) {
    return []
  }
  const rpIndexPlayers = timeline.rpIndexPlayers ?? []
  if (!rpIndexPlayers.length) {
    return timeline.rpIndexUnavailableReason
      ? [`RP指数不可用：${formatRpUnavailableReason(timeline.rpIndexUnavailableReason)}。`]
      : []
  }

  const facts: string[] = []
  const currentPlayer = players.find(player => player.isCurrentPlayer) ?? null
  const currentRpPlayer = currentPlayer
    ? rpIndexPlayers.find(player => player.playerKey === currentPlayer.playerKey) ?? null
    : null
  const currentOpponent = currentPlayer
    ? findSamePositionOpponent(currentPlayer, players)
    : null
  const currentOpponentRpPlayer = currentOpponent
    ? rpIndexPlayers.find(player => player.playerKey === currentOpponent.playerKey) ?? null
    : null

  const finalOverview = rpIndexPlayers
    .flatMap(rpPlayer => {
      const player = players.find(candidate => candidate.playerKey === rpPlayer.playerKey)
      return player
        ? [`${formatPlayerBriefLabel(player, currentSide)}${formatRpScore(rpPlayer.finalScore)}`]
        : []
    })
    .join('；')
  if (finalOverview) {
    facts.push(`RP指数终局概览：${finalOverview}。`)
  }

  if (currentPlayer && currentRpPlayer) {
    facts.push(formatFocusedRpIndexFact(currentPlayer, currentRpPlayer, currentSide))
  }

  if (currentOpponent && currentOpponentRpPlayer) {
    facts.push(formatFocusedRpIndexFact(currentOpponent, currentOpponentRpPlayer, currentSide, '对位参考'))
  }

  return facts
}

function formatFocusedRpIndexFact(
  player: PostgameAiPlayerSnapshot,
  rpPlayer: PostgameAiRpIndexPlayerSnapshot,
  currentSide: PostgameAiSide | null,
  prefix = '当前用户'
): string {
  const labelText = rpPlayer.trendLabel ? `，标签：${rpPlayer.trendLabel}` : ''
  const sampledText = formatRpSampledPoints(rpPlayer.points)
  const rangeText = formatRpRange(rpPlayer.points)
  return `${prefix}${formatPlayerBriefLabel(player, currentSide)} RP指数：终局${formatRpScore(rpPlayer.finalScore)}${labelText}，走势采样：${sampledText}${rangeText}。`
}

function formatRpSampledPoints(points: number[]): string {
  if (!points.length) {
    return '无可用点'
  }
  const lastMinute = points.length - 1
  const sampledMinutes = Array.from(new Set([
    0,
    ...Array.from({ length: Math.floor(lastMinute / 5) }, (_item, index) => (index + 1) * 5),
    lastMinute
  ])).filter(minute => minute >= 0 && minute <= lastMinute)
  return sampledMinutes
    .map(minute => `${minute}分${formatRpScore(points[minute] ?? 5)}`)
    .join('、')
}

function formatRpRange(points: number[]): string {
  if (!points.length) {
    return ''
  }
  let peakMinute = 0
  let lowMinute = 0
  for (let index = 1; index < points.length; index += 1) {
    if ((points[index] ?? 0) > (points[peakMinute] ?? 0)) {
      peakMinute = index
    }
    if ((points[index] ?? 10) < (points[lowMinute] ?? 10)) {
      lowMinute = index
    }
  }
  return `；峰值${formatRpScore(points[peakMinute] ?? 5)}@${peakMinute}分，低点${formatRpScore(points[lowMinute] ?? 5)}@${lowMinute}分`
}

function findSamePositionOpponent(
  currentPlayer: PostgameAiPlayerSnapshot,
  players: PostgameAiPlayerSnapshot[]
): PostgameAiPlayerSnapshot | null {
  const currentPosition = normalizeRpPositionKey(currentPlayer)
  if (!currentPosition) {
    return null
  }
  return players.find(player => (
    player.teamId !== currentPlayer.teamId &&
    normalizeRpPositionKey(player) === currentPosition
  )) ?? null
}

function normalizeRpPositionKey(player: Pick<PostgameAiPlayerSnapshot, 'position' | 'lane' | 'role'>): string {
  const value = normalizeText(firstString(player.position, player.lane, player.role))
  if (value === 'MIDDLE') {
    return 'MID'
  }
  if (value === 'BOTTOM') {
    return 'ADC'
  }
  if (value === 'UTILITY') {
    return 'SUPPORT'
  }
  return value
}

function formatRpUnavailableReason(reason: RpIndexUnavailableReason): string {
  switch (reason) {
    case 'not_ranked':
      return '仅支持排位 420/440'
    case 'missing_detail':
      return '缺少 game detail'
    case 'missing_timeline':
      return '缺少 timeline'
    case 'short_game':
      return '对局少于 10 分钟'
    case 'incomplete_matchups':
      return '缺少完整五路对位'
  }
}

function buildDataQualityFacts(dataQuality: PostgameAiDataQualitySnapshot): string[] {
  return dataQuality.warnings.map(formatDataQualityWarning)
}

function formatDataQualityWarning(warning: string): string {
  const normalized = warning.toLowerCase()
  if (normalized.includes('timeline')) {
    return '缺少 timeline，不能分析具体时间点、死亡前视野或资源交换。'
  }
  if (normalized.includes('current player')) {
    return '未能确认当前用户对应玩家。'
  }
  if (normalized.includes('game detail')) {
    return '缺少 game detail，部分玩家表现只能来自 match history 简要数据。'
  }
  if (normalized.includes('participants')) {
    return '缺少完整玩家列表。'
  }
  return `数据提示：${warning}`
}

function formatPlayerBriefLabel(player: PostgameAiPlayerSnapshot, currentSide: PostgameAiSide | null): string {
  const owner = player.isCurrentPlayer
    ? `你｜${formatRelativeSide(player.side, currentSide)}${formatRoleLabel(player)}`
    : `${formatRelativeSide(player.side, currentSide)}${formatRoleLabel(player)}`
  return `【${owner}｜${formatChampionLabel(player)}】`
}

function formatChampionLabel(player: Pick<PostgameAiPlayerSnapshot, 'championId' | 'championName'>): string {
  return player.championName || getChampionDisplayName(player.championId) || '未知英雄'
}

function readChampionNameById(championNamesById: ChampionNameLookup | undefined, championId: number | null): string | null {
  if (!championNamesById || championId === null) {
    return null
  }
  const value = championNamesById instanceof Map
    ? championNamesById.get(championId)
    : championNamesById[championId]
  return firstString(value)
}

function formatRoleLabel(player: Pick<PostgameAiPlayerSnapshot, 'position' | 'lane' | 'role'>): string {
  const value = normalizeText(firstString(player.position, player.lane, player.role))
  if (value === 'TOP') {
    return '上单'
  }
  if (value === 'JUNGLE') {
    return '打野'
  }
  if (value === 'MIDDLE' || value === 'MID') {
    return '中单'
  }
  if (value === 'BOTTOM' || value === 'ADC') {
    return '下路'
  }
  if (value === 'UTILITY' || value === 'SUPPORT') {
    return '辅助'
  }
  return '未知位置'
}

function formatRelativeSide(side: PostgameAiSide, currentSide: PostgameAiSide | null): string {
  if (!currentSide) {
    return side === 'blue' ? '蓝方' : '红方'
  }
  return side === currentSide ? '我方' : '敌方'
}

function formatPerspectiveGoldDiff(diff: number): string {
  if (diff === 0) {
    return '与对方经济持平'
  }
  return diff > 0 ? `经济领先${formatInteger(Math.abs(diff))}` : `经济落后${formatInteger(Math.abs(diff))}`
}

function formatObjectiveEventSide(
  event: NonNullable<PostgameAiTimelineSnapshot['objectiveEvents']>[number],
  currentSide: PostgameAiSide | null
): string {
  const side = event.side ?? teamIdToNullableSide(event.teamId ?? null)
  return side ? formatRelativeSide(side, currentSide) : '未知队伍'
}

function formatObjectiveLabel(type: string): string {
  const normalized = normalizeText(type)
  if (normalized.includes('DRAGON')) {
    return '小龙'
  }
  if (normalized.includes('BARON')) {
    return '大龙'
  }
  if (normalized.includes('HERALD')) {
    return '峡谷先锋'
  }
  if (normalized.includes('GRUB')) {
    return '巢虫'
  }
  if (normalized.includes('TOWER') || normalized.includes('TURRET')) {
    return '防御塔'
  }
  if (normalized.includes('INHIBITOR')) {
    return '水晶'
  }
  return type || '目标资源'
}

function formatClock(timeSeconds: number): string {
  const seconds = Math.max(0, Math.round(timeSeconds))
  const minutesPart = Math.floor(seconds / 60)
  const secondsPart = seconds % 60
  return `${minutesPart}:${String(secondsPart).padStart(2, '0')}`
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return '未知'
  }
  const minutesPart = Math.floor(seconds / 60)
  const secondsPart = Math.round(seconds % 60)
  return secondsPart > 0 ? `${minutesPart}分${secondsPart}秒` : `${minutesPart}分钟`
}

function formatMatchDurationClock(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return '未知'
  }
  const safeSeconds = Math.max(0, Math.round(seconds))
  const minutesPart = Math.floor(safeSeconds / 60)
  const secondsPart = safeSeconds % 60
  return `${minutesPart}:${String(secondsPart).padStart(2, '0')}`
}

function formatInteger(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString('zh-CN') : '未知'
}

function formatSignedInteger(value: number): string {
  if (!Number.isFinite(value)) {
    return '未知'
  }
  if (value === 0) {
    return '0'
  }
  return `${value > 0 ? '+' : '-'}${formatInteger(Math.abs(value))}`
}

function formatDecimal(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : '未知'
}

function formatPercent(value: number): string {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : '未知'
}

function buildMatchSnapshot(matchHistory: MatchHistory, detail: GameDetail | null): PostgameAiMatchSnapshot {
  const queueId = firstNumber(detail?.queueId, matchHistory.queueId)
  const gameMode = firstString(detail?.gameMode, matchHistory.gameMode)
  const gameVersion = firstString(readRecordValue(detail, 'gameVersion'), readRecordValue(matchHistory, 'gameVersion'))
  const gameId = firstNumber(detail?.gameId, matchHistory.gameId)
  const matchId = firstString(readRecordValue(matchHistory, 'matchId'), readRecordValue(detail, 'matchId'))
  const queueName = firstString(matchHistory.queueName) ?? undefined

  return {
    ...(matchId ? { matchIdHash: hashText(`match:${matchId}`) } : {}),
    ...(gameId !== null ? { gameIdHash: hashText(`game:${gameId}`) } : {}),
    queueId,
    ...(queueName ? { queueName } : {}),
    ...(gameMode ? { gameMode } : {}),
    gameVersion,
    gameCreation: firstNumber(detail?.gameCreation, matchHistory.gameCreation),
    durationSeconds: firstNumber(detail?.gameDuration, matchHistory.gameDuration),
    isRanked: isRankedQueue(queueId, queueName, gameMode ?? undefined),
    isAram: isAramQueue(queueId, queueName, gameMode ?? undefined),
    isArena: isArenaQueue(queueId, queueName, gameMode ?? undefined)
  }
}

function toTeamSnapshot(
  teamId: 100 | 200,
  participants: SnapshotParticipant[],
  totalsByTeamId: Map<number, PostgameAiTeamSnapshot['totals']>,
  objectiveSummaries: TeamObjectiveSummary[] | undefined,
  teamGoldDiffAt15: number | null,
  laneGoldDiffAt15: Map<GoldDiffMetricKey, number>
): PostgameAiTeamSnapshot {
  const teamPlayers = participants.filter(participant => participant.teamId === teamId)
  const objectiveSummary = objectiveSummaries?.find(summary => summary.teamId === teamId)
  const rankedMetrics = buildTeamRankedMetrics(teamId, teamGoldDiffAt15, laneGoldDiffAt15)
  return {
    side: teamIdToSide(teamId),
    teamId,
    win: readTeamWin(teamPlayers),
    totals: totalsByTeamId.get(teamId) ?? emptyTeamTotals(),
    ...(objectiveSummary ? { objectives: toObjectiveSnapshot(objectiveSummary) } : {}),
    ...(rankedMetrics ? { rankedMetrics } : {})
  }
}

function toPlayerSnapshot(
  participant: SnapshotParticipant,
  currentParticipantId: number | null,
  totalsByTeamId: Map<number, PostgameAiTeamSnapshot['totals']>,
  durationSeconds: number | null,
  teamGoldDiffAt15: number | null,
  laneGoldDiffAt15: Map<GoldDiffMetricKey, number>,
  championNamesById?: ChampionNameLookup,
  idPrefix = 'player'
): PostgameAiPlayerSnapshot {
  const stats = participant.stats
  const teamId = participant.teamId
  const teamTotals = totalsByTeamId.get(teamId) ?? emptyTeamTotals()
  const kills = finiteNumberOrZero(stats.kills)
  const deaths = finiteNumberOrZero(stats.deaths)
  const assists = finiteNumberOrZero(stats.assists)
  const goldEarned = finiteNumberOrZero(stats.goldEarned)
  const damage = finiteNumberOrZero(stats.totalDamageDealtToChampions)
  const damageTaken = finiteNumberOrZero(stats.totalDamageTaken)
  const visionScore = finiteNumberOrZero(stats.visionScore)
  const cs = getCreepScore(stats)
  const lane = resolveParticipantLane(participant)
  const rankedMetrics = buildRankedMetrics(
    participant,
    lane,
    teamGoldDiffAt15,
    laneGoldDiffAt15
  )
  const championId = positiveInteger(participant.championId)
  const championName = firstString(
    readRecordValue(participant, 'championName'),
    readRecordValue(participant, 'championNameCn'),
    readChampionNameById(championNamesById, championId),
    getChampionDisplayName(championId)
  )

  return {
    playerKey: `${idPrefix}:${participant.participantId}`,
    side: teamIdToSide(teamId),
    teamId,
    participantId: participant.participantId,
    isCurrentPlayer: currentParticipantId === participant.participantId,
    championId,
    ...(championName ? { championName } : {}),
    ...(firstString(participant.timeline?.role, readRecordValue(participant, 'role')) ? { role: firstString(participant.timeline?.role, readRecordValue(participant, 'role')) ?? undefined } : {}),
    ...(firstString(participant.timeline?.lane, readRecordValue(participant, 'lane')) ? { lane: firstString(participant.timeline?.lane, readRecordValue(participant, 'lane')) ?? undefined } : {}),
    ...(firstString(participant.teamPosition, participant.individualPosition, participant.selectedPosition, participant.timeline?.teamPosition) ? { position: firstString(participant.teamPosition, participant.individualPosition, participant.selectedPosition, participant.timeline?.teamPosition) ?? undefined } : {}),
    ...(readStatNumber(stats, 'champLevel') !== null ? { level: readStatNumber(stats, 'champLevel') as number } : {}),
    stats: {
      win: typeof stats.win === 'boolean' ? stats.win : null,
      kills,
      deaths,
      assists,
      kda: calculateKda(kills, deaths, assists),
      killParticipation: calculateRate(kills + assists, teamTotals.kills),
      goldEarned,
      goldShare: calculateRate(goldEarned, teamTotals.goldEarned),
      totalDamageDealtToChampions: damage,
      damageShare: calculateRate(damage, teamTotals.totalDamageDealtToChampions),
      totalDamageTaken: damageTaken,
      damageTakenShare: calculateRate(damageTaken, teamTotals.totalDamageTaken),
      damageToGoldRatio: calculateRate(damage, goldEarned),
      visionScore,
      cs,
      csPerMinute: durationSeconds && durationSeconds > 0 ? roundMetric(cs / (durationSeconds / 60)) : null,
      doubleKills: finiteNumberOrZero(stats.doubleKills),
      tripleKills: finiteNumberOrZero(stats.tripleKills),
      quadraKills: finiteNumberOrZero(stats.quadraKills),
      pentaKills: finiteNumberOrZero(stats.pentaKills),
      largestKillingSpree: readStatNumber(stats, 'largestKillingSpree'),
      legendaryCount: finiteNumberOrZero(stats.legendaryCount)
    },
    loadout: {
      spellIds: [
        positiveInteger(participant.spell1Id),
        positiveInteger(participant.spell2Id)
      ].filter((value): value is number => value !== null),
      itemIds: readPositiveIds(stats, ['item0', 'item1', 'item2', 'item3', 'item4', 'item5']),
      runeIds: readPositiveIds(stats, ['perk0', 'perk1', 'perk2', 'perk3', 'perk4', 'perk5', 'perkPrimaryStyle', 'perkSubStyle']),
      augmentIds: readPositiveIds(stats, ['playerAugment1', 'playerAugment2', 'playerAugment3', 'playerAugment4', 'playerAugment5', 'playerAugment6'])
    },
    ...(rankedMetrics ? { rankedMetrics } : {})
  }
}

function withPlayerFactTags(players: PostgameAiPlayerSnapshot[]): PostgameAiPlayerSnapshot[] {
  const rankingFactsByPlayerKey = new Map<string, string[]>()

  addMaxRankingFacts(rankingFactsByPlayerKey, players, 'team', player => player.stats.totalDamageDealtToChampions, '伤害', 'first')
  addMaxRankingFacts(rankingFactsByPlayerKey, players, 'all', player => player.stats.totalDamageDealtToChampions, '伤害', 'first')
  addMaxRankingFacts(rankingFactsByPlayerKey, players, 'team', player => player.stats.goldEarned, '打钱', 'first')
  addMaxRankingFacts(rankingFactsByPlayerKey, players, 'all', player => player.stats.goldEarned, '打钱', 'first')
  addMaxRankingFacts(rankingFactsByPlayerKey, players, 'team', player => player.stats.assists, '助攻', 'first')
  addMaxRankingFacts(rankingFactsByPlayerKey, players, 'all', player => player.stats.assists, '助攻', 'first')
  addMaxRankingFacts(rankingFactsByPlayerKey, players, 'team', player => player.stats.deaths, '死亡', 'most')
  addMaxRankingFacts(rankingFactsByPlayerKey, players, 'all', player => player.stats.deaths, '死亡', 'most')

  return players.map(player => {
    const rankings = removeTeamRankingFactsCoveredByAll(rankingFactsByPlayerKey.get(player.playerKey) ?? [])
    const highlights = buildPlayerHighlightFacts(player)
    if (!rankings.length && !highlights.length) {
      return player
    }

    return {
      ...player,
      factTags: {
        rankings,
        highlights
      }
    }
  })
}

function removeTeamRankingFactsCoveredByAll(rankings: string[]): string[] {
  const coveredAllMetrics = new Set<string>()
  for (const ranking of rankings) {
    const metric = readRankingMetric(ranking, '全场')
    if (metric) {
      coveredAllMetrics.add(metric)
    }
  }

  return rankings.filter(ranking => {
    const metric = readRankingMetric(ranking, '队内')
    return !metric || !coveredAllMetrics.has(metric)
  })
}

function readRankingMetric(ranking: string, scope: '队内' | '全场'): string | null {
  if (!ranking.startsWith(scope)) {
    return null
  }
  const body = ranking.slice(scope.length)
  const suffixes = ['并列第一', '第一', '并列最多', '最多']
  const suffix = suffixes.find(candidate => body.endsWith(candidate))
  if (!suffix) {
    return null
  }
  const metric = body.slice(0, -suffix.length)
  return metric || null
}

function addMaxRankingFacts(
  factsByPlayerKey: Map<string, string[]>,
  players: PostgameAiPlayerSnapshot[],
  scope: 'team' | 'all',
  readValue: (player: PostgameAiPlayerSnapshot) => number,
  metricLabel: string,
  rankKind: 'first' | 'most'
): void {
  const groups = scope === 'team'
    ? groupPlayersByTeam(players)
    : [players]

  for (const group of groups) {
    const candidates = group
      .map(player => ({ player, value: readValue(player) }))
      .filter(entry => Number.isFinite(entry.value) && entry.value > 0)
    if (!candidates.length) {
      continue
    }

    const maxValue = Math.max(...candidates.map(entry => entry.value))
    const leaders = candidates.filter(entry => entry.value === maxValue)
    const scopeLabel = scope === 'team' ? '队内' : '全场'
    const suffix = rankKind === 'first'
      ? (leaders.length > 1 ? `${metricLabel}并列第一` : `${metricLabel}第一`)
      : (leaders.length > 1 ? `${metricLabel}并列最多` : `${metricLabel}最多`)
    for (const leader of leaders) {
      const currentFacts = factsByPlayerKey.get(leader.player.playerKey) ?? []
      currentFacts.push(`${scopeLabel}${suffix}`)
      factsByPlayerKey.set(leader.player.playerKey, currentFacts)
    }
  }
}

function groupPlayersByTeam(players: PostgameAiPlayerSnapshot[]): PostgameAiPlayerSnapshot[][] {
  const groups = new Map<number, PostgameAiPlayerSnapshot[]>()
  for (const player of players) {
    const group = groups.get(player.teamId) ?? []
    group.push(player)
    groups.set(player.teamId, group)
  }
  return [...groups.values()]
}

function buildPlayerHighlightFacts(player: PostgameAiPlayerSnapshot): string[] {
  const facts: string[] = []
  addPositiveCountFact(facts, '双杀', player.stats.doubleKills)
  addPositiveCountFact(facts, '三杀', player.stats.tripleKills)
  addPositiveCountFact(facts, '四杀', player.stats.quadraKills)
  addPositiveCountFact(facts, '五杀', player.stats.pentaKills)
  if (player.stats.largestKillingSpree !== null && player.stats.largestKillingSpree >= 5) {
    facts.push(`最高连杀${formatInteger(player.stats.largestKillingSpree)}`)
  }
  addPositiveCountFact(facts, '超神', player.stats.legendaryCount)
  return facts
}

function addPositiveCountFact(facts: string[], label: string, value: number): void {
  if (Number.isFinite(value) && value > 0) {
    facts.push(`${label}${formatInteger(value)}次`)
  }
}

function buildRankedMetrics(
  participant: SnapshotParticipant,
  lane: GoldDiffMetricKey | null,
  teamGoldDiffAt15: number | null,
  laneGoldDiffAt15: Map<GoldDiffMetricKey, number>
): PostgameAiPlayerSnapshot['rankedMetrics'] | null {
  const metrics: NonNullable<PostgameAiPlayerSnapshot['rankedMetrics']> = {}
  if (teamGoldDiffAt15 !== null) {
    metrics.teamGoldDiffAt15 = participant.teamId === BLUE_TEAM_ID ? teamGoldDiffAt15 : -teamGoldDiffAt15
  }
  if (lane !== null) {
    const laneDiff = laneGoldDiffAt15.get(lane)
    if (laneDiff !== undefined) {
      metrics.laneGoldDiffAt15 = participant.teamId === BLUE_TEAM_ID ? laneDiff : -laneDiff
    }
  }
  const turretPlatesTaken = readStatNumber(participant.stats, 'turretPlatesTaken')
  if (turretPlatesTaken !== null) {
    metrics.turretPlatesTaken = turretPlatesTaken
  }

  return Object.keys(metrics).length ? metrics : null
}

function buildTeamRankedMetrics(
  teamId: 100 | 200,
  teamGoldDiffAt15: number | null,
  laneGoldDiffAt15: Map<GoldDiffMetricKey, number>
): PostgameAiTeamSnapshot['rankedMetrics'] | null {
  const metrics: NonNullable<PostgameAiTeamSnapshot['rankedMetrics']> = {}
  const perspectiveMultiplier = teamId === BLUE_TEAM_ID ? 1 : -1
  if (teamGoldDiffAt15 !== null) {
    metrics.teamGoldDiffAt15 = teamGoldDiffAt15 * perspectiveMultiplier
  }

  const laneDiffs: NonNullable<PostgameAiTeamSnapshot['rankedMetrics']>['laneGoldDiffAt15'] = {}
  for (const lane of LANE_METRICS) {
    const diff = laneGoldDiffAt15.get(lane)
    if (diff !== undefined) {
      laneDiffs[lane] = diff * perspectiveMultiplier
    }
  }
  if (Object.keys(laneDiffs).length) {
    metrics.laneGoldDiffAt15 = laneDiffs
  }

  return Object.keys(metrics).length ? metrics : null
}

function createTimelineSnapshot(
  timeline: MatchTimeline | null,
  gameDetail: GameDetail | null,
  playerKeyByParticipantId: Map<number, string>,
  currentParticipantId: number | null
): PostgameAiTimelineSnapshot {
  if (!hasTimeline(timeline)) {
    return { hasTimeline: false }
  }

  const model = createTimelineChartModel(timeline, gameDetail)
  const objectiveEvents = model.eventMarkers
    .filter(marker => marker.type !== 'kill')
    .map(marker => ({
      timeSeconds: toSeconds(marker.timestamp),
      type: marker.type,
      ...(marker.teamId !== null ? { teamId: marker.teamId } : {}),
      ...(teamIdToNullableSide(marker.teamId) ? { side: teamIdToNullableSide(marker.teamId) as PostgameAiSide } : {})
    }))
  const deathEvents = createDeathEvents(
    timeline,
    gameDetail?.participants ?? [],
    model.eventMarkers.filter(marker => marker.type !== 'kill').map(marker => marker.timestamp),
    playerKeyByParticipantId
  )
  const goldDiffPoints = createGoldDiffPoints(model.seriesByMetric)
  const rpIndex = createMatchRpIndexModel(timeline, gameDetail, {
    trendLabelParticipantId: currentParticipantId
  })
  const rpIndexPlayers = rpIndex.status === 'ready'
    ? rpIndex.players.map(player => ({
        playerKey: playerKeyByParticipantId.get(player.participantId) ?? `player:${player.participantId}`,
        finalScore: player.finalScore,
        points: player.points.map(point => point.score)
      }))
    : []
  const rpIndexUnavailableReason = rpIndex.status === 'unavailable' ? rpIndex.reason : null
  const durationSeconds = getTimelineDurationSeconds(timeline)

  return {
    hasTimeline: true,
    ...(durationSeconds !== null ? { durationSeconds } : {}),
    ...(goldDiffPoints.length ? { goldDiffPoints } : {}),
    ...(objectiveEvents.length ? { objectiveEvents } : {}),
    ...(deathEvents.length ? { deathEvents } : {}),
    ...(rpIndexPlayers.length ? { rpIndexPlayers } : {}),
    ...(rpIndexUnavailableReason !== null ? { rpIndexUnavailableReason } : {})
  }
}

function createGoldDiffPoints(
  seriesByMetric: ReturnType<typeof createTimelineChartModel>['seriesByMetric']
): NonNullable<PostgameAiTimelineSnapshot['goldDiffPoints']> {
  const pointsByMinute = new Map<number, NonNullable<PostgameAiTimelineSnapshot['goldDiffPoints']>[number]>()

  for (const [metric, series] of Object.entries(seriesByMetric) as Array<[GoldDiffMetricKey, typeof seriesByMetric[GoldDiffMetricKey]]>) {
    for (const point of series.points) {
      const minute = Math.round(point.timestamp / 60_000)
      const existing = pointsByMinute.get(minute) ?? { minute }
      const key = metricToGoldDiffKey(metric)
      existing[key] = Math.round(point.diff)
      pointsByMinute.set(minute, existing)
    }
  }

  return [...pointsByMinute.values()].sort((left, right) => left.minute - right.minute)
}

function createDeathEvents(
  timeline: MatchTimeline,
  participants: SnapshotParticipant[],
  objectiveTimestamps: number[],
  playerKeyByParticipantId: Map<number, string>
): NonNullable<PostgameAiTimelineSnapshot['deathEvents']> {
  const participantsById = new Map(participants.map(participant => [participant.participantId, participant]))
  return getTimelineEvents(timeline)
    .filter(event => normalizeText(event.eventType) === 'CHAMPION_KILL')
    .flatMap(event => {
      const victimId = toFiniteNumber(event.victimId)
      const timestamp = toFiniteNumber(event.timestamp)
      if (victimId === null || timestamp === null) {
        return []
      }
      const participant = participantsById.get(victimId)
      if (!participant) {
        return []
      }
      const teamGoldDiff = getTeamGoldDiffAtTimestamp(timeline, participants, timestamp)
      const secondsBeforeObjective = getSecondsBeforeNextObjective(timestamp, objectiveTimestamps)
      return [{
        timeSeconds: toSeconds(timestamp),
        playerKey: playerKeyByParticipantId.get(victimId) ?? `player:${victimId}`,
        ...(positiveInteger(participant.championId) !== null ? { championId: positiveInteger(participant.championId) as number } : {}),
        teamId: participant.teamId,
        side: teamIdToSide(participant.teamId),
        ...(teamGoldDiff !== null ? { teamGoldDiffAtDeath: participant.teamId === BLUE_TEAM_ID ? teamGoldDiff : -teamGoldDiff } : {}),
        ...(secondsBeforeObjective !== null ? { secondsBeforeObjective } : {})
      }]
    })
}

function getSecondsBeforeNextObjective(timestamp: number, objectiveTimestamps: number[]): number | null {
  const nextObjective = objectiveTimestamps.find(objectiveTimestamp => objectiveTimestamp >= timestamp)
  if (nextObjective === undefined) {
    return null
  }
  return Math.max(0, Math.round((nextObjective - timestamp) / 1000))
}

function createTeamTotals(participants: SnapshotParticipant[]): Map<number, PostgameAiTeamSnapshot['totals']> {
  const totals = new Map<number, PostgameAiTeamSnapshot['totals']>()
  for (const participant of participants) {
    const existing = totals.get(participant.teamId) ?? emptyTeamTotals()
    existing.kills += finiteNumberOrZero(participant.stats.kills)
    existing.deaths += finiteNumberOrZero(participant.stats.deaths)
    existing.assists += finiteNumberOrZero(participant.stats.assists)
    existing.goldEarned += finiteNumberOrZero(participant.stats.goldEarned)
    existing.totalDamageDealtToChampions += finiteNumberOrZero(participant.stats.totalDamageDealtToChampions)
    existing.totalDamageTaken += finiteNumberOrZero(participant.stats.totalDamageTaken)
    existing.visionScore += finiteNumberOrZero(participant.stats.visionScore)
    totals.set(participant.teamId, existing)
  }
  return totals
}

function emptyTeamTotals(): PostgameAiTeamSnapshot['totals'] {
  return {
    kills: 0,
    deaths: 0,
    assists: 0,
    goldEarned: 0,
    totalDamageDealtToChampions: 0,
    totalDamageTaken: 0,
    visionScore: 0
  }
}

function toObjectiveSnapshot(summary: TeamObjectiveSummary): NonNullable<PostgameAiTeamSnapshot['objectives']> {
  return {
    dragons: firstNumber(summary.dragonKills),
    barons: firstNumber(summary.baronKills),
    heralds: firstNumber(summary.heraldKills),
    grubs: firstNumber(summary.voidGrubKills),
    towers: firstNumber(summary.turretKills),
    inhibitors: firstNumber(summary.inhibitorKills),
    turretPlates: firstNumber(summary.turretPlatesTaken, summary.turretPlateKills)
  }
}

function getTeamGoldDiffAtMinute(
  timeline: MatchTimeline | null,
  participants: SnapshotParticipant[],
  minute: number
): number | null {
  if (!hasTimeline(timeline)) {
    return null
  }
  const frame = findNearestFrame(timeline.frames ?? [], minute * 60_000)
  return frame ? calculateTeamGoldDiff(frame, participants) : null
}

function createLaneGoldDiffAtMinuteMap(
  timeline: MatchTimeline | null,
  participants: SnapshotParticipant[],
  minute: number
): Map<GoldDiffMetricKey, number> {
  const result = new Map<GoldDiffMetricKey, number>()
  if (!hasTimeline(timeline)) {
    return result
  }
  const frame = findNearestFrame(timeline.frames ?? [], minute * 60_000)
  if (!frame) {
    return result
  }

  for (const lane of LANE_METRICS) {
    const blueParticipant = participants.find(participant => participant.teamId === BLUE_TEAM_ID && resolveParticipantLane(participant) === lane)
    const redParticipant = participants.find(participant => participant.teamId === RED_TEAM_ID && resolveParticipantLane(participant) === lane)
    const blueGold = readFrameTotalGold(frame, blueParticipant?.participantId)
    const redGold = readFrameTotalGold(frame, redParticipant?.participantId)
    if (blueGold !== null && redGold !== null) {
      result.set(lane, blueGold - redGold)
    }
  }
  return result
}

function getTeamGoldDiffAtTimestamp(
  timeline: MatchTimeline,
  participants: SnapshotParticipant[],
  timestamp: number
): number | null {
  const frame = findNearestFrame(timeline.frames ?? [], timestamp)
  return frame ? calculateTeamGoldDiff(frame, participants) : null
}

function calculateTeamGoldDiff(frame: TimelineFrame, participants: SnapshotParticipant[]): number | null {
  let blueGold = 0
  let redGold = 0
  let blueCount = 0
  let redCount = 0
  for (const participant of participants) {
    const gold = readFrameTotalGold(frame, participant.participantId)
    if (gold === null) {
      continue
    }
    if (participant.teamId === BLUE_TEAM_ID) {
      blueGold += gold
      blueCount += 1
    } else if (participant.teamId === RED_TEAM_ID) {
      redGold += gold
      redCount += 1
    }
  }
  return blueCount > 0 && redCount > 0 ? blueGold - redGold : null
}

function findNearestFrame(frames: TimelineFrame[], targetTimestamp: number): TimelineFrame | null {
  const usable = frames.filter(frame => toFiniteNumber(frame.timestamp) !== null)
  if (!usable.length) {
    return null
  }
  return usable.reduce((nearest, frame) => {
    const nearestDistance = Math.abs((toFiniteNumber(nearest.timestamp) ?? 0) - targetTimestamp)
    const frameDistance = Math.abs((toFiniteNumber(frame.timestamp) ?? 0) - targetTimestamp)
    return frameDistance < nearestDistance ? frame : nearest
  }, usable[0] as TimelineFrame)
}

function readFrameTotalGold(frame: TimelineFrame, participantId: number | null | undefined): number | null {
  if (participantId == null) {
    return null
  }
  const directFrame = frame.participantFrames?.[String(participantId)]
  const participantFrame = directFrame ?? Object.values(frame.participantFrames ?? {}).find(candidate => candidate?.participantId === participantId)
  return readParticipantFrameNumber(participantFrame, 'totalGold')
}

function readParticipantFrameNumber(frame: ParticipantFrame | undefined, key: keyof ParticipantFrame): number | null {
  return toFiniteNumber(frame?.[key])
}

function getTimelineDurationSeconds(timeline: MatchTimeline): number | null {
  const timestamps = [
    ...(timeline.frames ?? []).map(frame => toFiniteNumber(frame.timestamp)),
    ...getTimelineEvents(timeline).map(event => toFiniteNumber(event.timestamp))
  ].filter((value): value is number => value !== null)
  if (!timestamps.length) {
    return null
  }
  return Math.round(Math.max(...timestamps) / 1000)
}

function getTimelineEvents(timeline: MatchTimeline): TimelineEvent[] {
  const rootEvents = timeline.events ?? []
  if (rootEvents.length) {
    return rootEvents
  }
  return (timeline.frames ?? []).flatMap(frame => frame.events ?? [])
}

function findCurrentParticipantId(
  identities: GameParticipantIdentity[],
  currentPuuid: string,
  currentSummonerName: string
): number | null {
  const normalizedPuuid = currentPuuid.trim()
  if (normalizedPuuid) {
    const identity = identities.find(item => item.player?.puuid === normalizedPuuid)
    if (identity) {
      return identity.participantId
    }
  }

  const normalizedName = currentSummonerName.trim().toLowerCase()
  if (!normalizedName) {
    return null
  }
  const identity = identities.find(item => formatIdentityName(item).toLowerCase() === normalizedName)
  return identity?.participantId ?? null
}

function formatIdentityName(identity: GameParticipantIdentity): string {
  const gameName = identity.player?.gameName?.trim()
  const tagLine = identity.player?.tagLine?.trim()
  if (gameName) {
    return tagLine ? `${gameName}#${tagLine}` : gameName
  }
  return identity.player?.summonerName?.trim() ?? ''
}

function createPlayerKey(participant: Pick<GameParticipant, 'participantId'>): string {
  return `player:${participant.participantId}`
}

function toGameDetailFromMatchHistory(match: MatchHistory): GameDetail {
  return {
    gameId: match.gameId,
    gameMode: match.gameMode,
    gameType: match.gameType,
    mapId: 0,
    queueId: match.queueId,
    gameDuration: match.gameDuration,
    gameCreation: match.gameCreation,
    participantIdentities: match.participantIdentities.map(identity => ({
      participantId: identity.participantId,
      player: {
        accountId: identity.player?.accountId ?? 0,
        puuid: identity.player?.puuid ?? '',
        platformId: identity.player?.platformId ?? '',
        summonerName: identity.player?.summonerName ?? '',
        gameName: identity.player?.gameName ?? '',
        tagLine: identity.player?.tagLine ?? '',
        summonerId: identity.player?.summonerId ?? 0
      }
    })),
    participants: match.participants.map(participant => ({
      participantId: participant.participantId,
      teamId: participant.teamId,
      championId: participant.championId,
      spell1Id: participant.spell1Id,
      spell2Id: participant.spell2Id,
      teamPosition: participant.teamPosition,
      individualPosition: participant.individualPosition,
      selectedPosition: participant.selectedPosition,
      stats: {
        ...participant.stats,
        totalHeal: participant.stats.totalHeal ?? 0,
        visionWardsBoughtInGame: 0,
        wardsPlaced: 0,
        wardsKilled: 0,
        largestMultiKill: 0,
        doubleKills: participant.stats.doubleKills ?? 0,
        tripleKills: participant.stats.tripleKills ?? 0,
        quadraKills: participant.stats.quadraKills ?? 0,
        pentaKills: participant.stats.pentaKills ?? 0
      },
      timeline: {
        lane: participant.teamPosition || participant.lane || participant.individualPosition || '',
        role: participant.role || '',
        teamPosition: participant.teamPosition,
        rawLane: participant.lane,
        rawRole: participant.role
      }
    })),
    teamObjectives: match.teamObjectives,
    teamBans: match.teamBans
  }
}

function getCreepScore(stats: GameParticipant['stats']): number {
  return (readStatNumber(stats, 'minionsKilled') ?? finiteNumberOrZero(stats.totalMinionsKilled))
    + finiteNumberOrZero(stats.neutralMinionsKilled)
}

function readPositiveIds(stats: GameParticipant['stats'], keys: string[]): number[] {
  return keys
    .map(key => positiveInteger(readStatNumber(stats, key)))
    .filter((value): value is number => value !== null)
}

function readStatNumber(stats: GameParticipant['stats'], key: string): number | null {
  const statsRecord = stats as unknown as Record<string, unknown>
  const extraFields = isRecord(statsRecord.extraFields) ? statsRecord.extraFields : null
  const challenges = isRecord(statsRecord.challenges) ? statsRecord.challenges : null
  return firstNumber(statsRecord[key], extraFields?.[key], challenges?.[key])
}

function metricToGoldDiffKey(metric: GoldDiffMetricKey): keyof NonNullable<PostgameAiTimelineSnapshot['goldDiffPoints']>[number] {
  switch (metric) {
    case 'teamAverage':
      return 'teamGoldDiff'
    case 'top':
      return 'topGoldDiff'
    case 'jungle':
      return 'jungleGoldDiff'
    case 'middle':
      return 'middleGoldDiff'
    case 'bottom':
      return 'bottomGoldDiff'
    case 'support':
      return 'supportGoldDiff'
  }
}

function teamIdToSide(teamId: number): PostgameAiSide {
  return teamId === RED_TEAM_ID ? 'red' : 'blue'
}

function teamIdToNullableSide(teamId: number | null): PostgameAiSide | null {
  if (teamId === BLUE_TEAM_ID || teamId === RED_TEAM_ID) {
    return teamIdToSide(teamId)
  }
  return null
}

function toTeamId(value: unknown): 100 | 200 | null {
  return value === BLUE_TEAM_ID || value === RED_TEAM_ID ? value : null
}

function readTeamWin(players: SnapshotParticipant[]): boolean | null {
  const value = players.find(player => typeof player.stats?.win === 'boolean')?.stats.win
  return typeof value === 'boolean' ? value : null
}

function isRankedQueue(queueId: number | null, queueName?: string, gameMode?: string): boolean {
  return (queueId !== null && RANKED_QUEUE_IDS.has(queueId)) || containsAny(queueName, ['RANKED', '排位', '单排', '双排', '灵活'])
    || containsAny(gameMode, ['RANKED'])
}

function isAramQueue(queueId: number | null, queueName?: string, gameMode?: string): boolean {
  return (queueId !== null && ARAM_QUEUE_IDS.has(queueId)) || containsAny(queueName, ['ARAM', '大乱斗', '极地'])
    || containsAny(gameMode, ['ARAM'])
}

function isArenaQueue(queueId: number | null, queueName?: string, gameMode?: string): boolean {
  return (queueId !== null && ARENA_QUEUE_IDS.has(queueId)) || containsAny(queueName, ['ARENA', 'CHERRY', '斗魂', '竞技场'])
    || containsAny(gameMode, ['CHERRY'])
}

function containsAny(value: string | undefined, keywords: string[]): boolean {
  if (!value) {
    return false
  }
  const upper = value.toUpperCase()
  return keywords.some(keyword => upper.includes(keyword.toUpperCase()))
}

function hasTimeline(timeline: MatchTimeline | null): timeline is MatchTimeline {
  return Boolean(timeline?.frames?.length || timeline?.events?.length)
}

function calculateKda(kills: number, deaths: number, assists: number): number | null {
  if (deaths === 0) {
    return roundMetric(kills + assists)
  }
  return roundMetric((kills + assists) / deaths)
}

function calculateRate(value: number, total: number): number | null {
  if (total <= 0) {
    return null
  }
  return roundMetric(value / total)
}

function toSeconds(timestamp: number): number {
  return Math.round(timestamp / 1000)
}

function roundMetric(value: number): number {
  return Number(value.toFixed(2))
}

function positiveInteger(value: unknown): number | null {
  const numberValue = toFiniteNumber(value)
  return numberValue !== null && Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null
}

function finiteNumberOrZero(value: unknown): number {
  return toFiniteNumber(value) ?? 0
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const numberValue = toFiniteNumber(value)
    if (numberValue !== null) {
      return numberValue
    }
  }
  return null
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return null
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

function readRecordValue(source: unknown, key: string): unknown {
  return isRecord(source) ? source[key] : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hashText(source: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}
