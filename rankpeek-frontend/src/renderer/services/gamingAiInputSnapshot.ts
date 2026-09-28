import type { MatchHistory, Participant, RecordStatus, SessionData, SessionSummoner, Summoner } from '@/types/api'
import { getChampionDisplayName } from '../utils/championSearchAliases.ts'

export type GamingAiInputMode = 'teammate' | 'opponent'
export type GamingAiTeamSide = 'ally' | 'enemy'

export interface GamingAiInputSnapshot {
  schemaVersion: 'gaming_ai_input_snapshot.v2'
  mode: GamingAiInputMode
  generatedAt: string
  phase: string
  queueId: number
  queueName: string
  matchId?: string
  roundIndex?: number
  currentSummoner?: CurrentSummonerSnapshot
  teammateSnapshot: GamingAiTeamSnapshot
  opponentSnapshot: GamingAiTeamSnapshot
}

export interface GamingAiTeamSnapshot {
  schemaVersion: 'gaming_ai_team_snapshot.v1'
  side: GamingAiTeamSide
  text: string
  players: GamingAiInputPlayer[]
}

export interface CurrentSummonerSnapshot {
  puuid?: string
  gameName?: string
  tagLine?: string
}

export interface GamingAiInputPlayer {
  key: string
  isSelf: boolean
  summaryLine: string
}

export function buildGamingAiInputSnapshot(input: {
  mode: GamingAiInputMode
  sessionData: SessionData
  selectedPlayers: SessionSummoner[]
  currentSummonerPuuid?: string
}): GamingAiInputSnapshot {
  const allyPlayers = pickPreferredTeam(input.sessionData.teammates, input.sessionData.teamOne)
  const enemyPlayers = pickPreferredTeam(input.sessionData.opponents, input.sessionData.teamTwo)
  const currentIdentity = createCurrentSummonerIdentity(input.sessionData.currentSummoner, input.currentSummonerPuuid)
  const currentSummoner = normalizeCurrentSummoner(currentIdentity)
  const generatedAt = new Date().toISOString()
  const context = createSnapshotContext(input.sessionData, generatedAt, currentSummoner)

  const teammatePlayers = allyPlayers.map((player, index) => toInputPlayer(player, currentIdentity, 'ally', index))
  const opponentPlayers = enemyPlayers.map((player, index) => toInputPlayer(player, currentIdentity, 'enemy', index))
  const teammateSnapshot = createTeamSnapshot('ally', teammatePlayers, context.generatedAt, context.queueName)
  const opponentSnapshot = createTeamSnapshot('enemy', opponentPlayers, context.generatedAt, context.queueName)

  return {
    schemaVersion: 'gaming_ai_input_snapshot.v2',
    mode: input.mode,
    ...context,
    teammateSnapshot,
    opponentSnapshot
  }
}

function createSnapshotContext(
  sessionData: SessionData,
  generatedAt: string,
  currentSummoner: CurrentSummonerSnapshot | null
) {
  return {
    generatedAt,
    phase: sessionData.phase || '',
    queueId: finiteNumberOrZero(sessionData.queueId),
    queueName: resolveSnapshotQueueName(sessionData),
    ...(readNonEmptyString(sessionData.matchId) ? { matchId: sessionData.matchId.trim() } : {}),
    ...(toFiniteNumber(sessionData.roundIndex) != null ? { roundIndex: toFiniteNumber(sessionData.roundIndex) as number } : {}),
    ...(currentSummoner ? { currentSummoner } : {})
  }
}

function resolveSnapshotQueueName(sessionData: SessionData): string {
  const typeCn = readNonEmptyString(sessionData.typeCn)
  if (isReadableQueueName(typeCn)) {
    return typeCn
  }

  const queueType = readNonEmptyString(sessionData.queueType)
  if (queueType === 'RANKED_SOLO_5x5') {
    return '单双排'
  }
  if (queueType === 'RANKED_FLEX_SR') {
    return '灵活排位'
  }

  const queueId = toFiniteNumber(sessionData.queueId)
  if (queueId === 420) {
    return '单双排'
  }
  if (queueId === 440) {
    return '灵活排位'
  }
  if (queueId === 430) {
    return '匹配'
  }
  if (queueId === 450) {
    return '极地大乱斗'
  }

  return queueType || 'Unknown'
}

function isReadableQueueName(value: string): boolean {
  return value.length > 0 && !/^\?+(?:\/\?+)?$/.test(value)
}

function createTeamSnapshot(
  side: GamingAiTeamSide,
  players: GamingAiInputPlayer[],
  generatedAt: string,
  queueName: string
): GamingAiTeamSnapshot {
  const sideLabel = side === 'ally' ? '我方' : '敌方'
  const header = `当前snapshot时间：${generatedAt}。模式：${queueName}。阵营：${sideLabel}。`
  const body = players.map(player => player.summaryLine).join('\n\n')

  return {
    schemaVersion: 'gaming_ai_team_snapshot.v1',
    side,
    text: body ? `${header}\n\n${body}` : header,
    players
  }
}

function pickPreferredTeam(preferred: SessionSummoner[] | undefined, fallback: SessionSummoner[] | undefined): SessionSummoner[] {
  return preferred?.length ? preferred : (fallback ?? [])
}

interface CurrentSummonerIdentity {
  puuid?: string
  summonerId?: number
  gameName?: string
  tagLine?: string
}

function toInputPlayer(
  player: SessionSummoner,
  currentIdentity: CurrentSummonerIdentity,
  side: GamingAiTeamSide,
  index: number
): GamingAiInputPlayer {
  const recentData = player.userTag?.recentData
  const wins = finiteNumberOrZero(recentData?.selectWins)
  const losses = finiteNumberOrZero(recentData?.selectLosses)
  const sample = wins + losses
  const averageGold = toFiniteNumber(recentData?.averageGold)
  const averageDamage = toFiniteNumber(recentData?.averageDamageDealtToChampions)
  const damageConversionRate = averageDamage != null && averageGold != null && averageDamage > 0 && averageGold > 0
    ? (averageDamage / averageGold) * 100
    : null
  const selectedPosition = normalizePosition(readSelectedPosition(player))
  const recordStatus = normalizeRecordStatus(player.userTag?.recordStatus)
  const tags = (player.userTag?.tag ?? [])
    .filter(tag => readNonEmptyString(tag.tagName))
    .map(tag => tag.tagName.trim())
  const metrics = {
    sample,
    winRate: sample > 0 ? (wins / sample) * 100 : null,
    kda: toFiniteNumber(recentData?.kda),
    kills: toFiniteNumber(recentData?.kills),
    deaths: toFiniteNumber(recentData?.deaths),
    assists: toFiniteNumber(recentData?.assists),
    damageConversionRate,
    groupRate: toFiniteNumber(recentData?.groupRate)
  }

  const isSelf = isCurrentSummonerPlayer(player, currentIdentity)
  const inputPlayer: Omit<GamingAiInputPlayer, 'summaryLine'> = {
    key: getPlayerSnapshotKey(player),
    isSelf
  }

  return {
    ...inputPlayer,
    summaryLine: formatGamingAiInputPlayerSummary({
      playerRef: formatAnonymousPlayerRef(side, index, isSelf),
      playerKey: inputPlayer.key,
      isSelf: inputPlayer.isSelf,
      selectedPosition,
      recordStatus,
      tags,
      metrics,
      recentMatches: player.matchHistory,
      puuid: readNonEmptyString(player.summoner?.puuid)
    })
  }
}

interface GamingAiInputPlayerSummaryInput {
  playerRef: string
  playerKey: string
  isSelf: boolean
  selectedPosition?: string
  recordStatus: RecordStatus
  tags: string[]
  metrics: {
    sample: number
    winRate: number | null
    kda: number | null
    kills: number | null
    deaths: number | null
    assists: number | null
    damageConversionRate: number | null
    groupRate: number | null
  }
  recentMatches?: MatchHistory[]
  puuid?: string
}

function formatGamingAiInputPlayerSummary(input: GamingAiInputPlayerSummaryInput): string {
  return `玩家 [${input.playerKey}] ${input.playerRef} 战绩状态：${formatRecordStatusLabel(input.recordStatus)}。当前位置：${formatPositionLabel(input.selectedPosition)}，tag：${input.tags.length ? input.tags.join('、') : '无'}，场均击杀/死亡/助攻：${formatNumber(input.metrics.kills)}/${formatNumber(input.metrics.deaths)}/${formatNumber(input.metrics.assists)}，平均KDA：${formatNumber(input.metrics.kda)}，胜率：${formatPercent(input.metrics.winRate)}，伤转：${formatPercent(input.metrics.damageConversionRate)}，样本数：${input.metrics.sample}，参团率：${formatPercent(input.metrics.groupRate)}，最近对局：${formatRecentMatches(input.recentMatches, input.puuid)}。`
}

function formatAnonymousPlayerRef(side: GamingAiTeamSide, index: number, isSelf: boolean): string {
  if (isSelf) {
    return '你'
  }
  return `${side === 'ally' ? '我方' : '敌方'}${index + 1}`
}

function formatRecentMatches(matchHistory: MatchHistory[] | undefined, puuid?: string): string {
  const recentLines = (matchHistory ?? [])
    .slice(0, 20)
    .map(match => {
      const participant = findParticipantInMatch(match, puuid)
      if (!participant) {
        return ''
      }

      const stats = participant.stats
      return [
        readParticipantChampionName(participant),
        formatPositionLabel(normalizePosition(readParticipantPosition(participant))),
        stats?.win === true ? '胜' : '负',
        `${formatKdaCount(stats?.kills)}/${formatKdaCount(stats?.deaths)}/${formatKdaCount(stats?.assists)}`
      ].join(' ')
    })
    .filter(line => line.length > 0)

  return recentLines.length ? recentLines.join('、') : '暂无'
}

function findParticipantInMatch(match: MatchHistory, puuid?: string): Participant | null {
  const normalizedPuuid = readNonEmptyString(puuid)
  const identity = normalizedPuuid
    ? match.participantIdentities?.find(item => readNonEmptyString(item.player?.puuid) === normalizedPuuid)
    : undefined

  if (identity) {
    return match.participants?.find(participant => participant.participantId === identity.participantId) ?? null
  }

  return match.participants?.[0] ?? null
}

function readParticipantChampionName(participant: Participant): string {
  const source = participant as unknown as Record<string, unknown>
  const championId = toFiniteNumber(participant.championId)
  const rawChampionName = firstString(
    source.championNameCn,
    source.championName
  )
  if (rawChampionName && containsCjkText(rawChampionName)) {
    return rawChampionName
  }

  const mappedChampionName = getChampionDisplayName(championId)
  if (mappedChampionName) {
    return mappedChampionName
  }

  if (rawChampionName) {
    return rawChampionName
  }

  const championKey = readNonEmptyString(source.championKey)
  if (championKey && !/^\d+$/.test(championKey)) {
    return championKey
  }

  return championId != null ? `英雄${championId}` : '未知英雄'
}

function containsCjkText(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value)
}

function readParticipantPosition(participant: Participant): string {
  return firstString(
    participant.selectedPosition,
    participant.teamPosition,
    participant.individualPosition,
    participant.lane,
    participant.role
  )
}

function formatKdaCount(value: unknown): string {
  const number = toFiniteNumber(value)
  return number != null ? String(Math.round(number)) : '未知'
}

function createCurrentSummonerIdentity(summoner: Summoner | undefined, currentSummonerPuuid?: string): CurrentSummonerIdentity {
  const puuid = readNonEmptyString(currentSummonerPuuid) || readNonEmptyString(summoner?.puuid)
  const summonerId = toFiniteNumber(summoner?.summonerId)
  const gameName = readNonEmptyString(summoner?.gameName)
  const tagLine = readNonEmptyString(summoner?.tagLine)

  return {
    ...(puuid ? { puuid } : {}),
    ...(summonerId != null ? { summonerId } : {}),
    ...(gameName ? { gameName } : {}),
    ...(tagLine ? { tagLine } : {})
  }
}

function normalizeCurrentSummoner(identity: CurrentSummonerIdentity): CurrentSummonerSnapshot | null {
  const puuid = readNonEmptyString(identity.puuid)
  const gameName = readNonEmptyString(identity.gameName)
  const tagLine = readNonEmptyString(identity.tagLine)

  if (!puuid && !gameName && !tagLine) {
    return null
  }

  return {
    ...(puuid ? { puuid } : {}),
    ...(gameName ? { gameName } : {}),
    ...(tagLine ? { tagLine } : {})
  }
}

function isCurrentSummonerPlayer(player: SessionSummoner, identity: CurrentSummonerIdentity): boolean {
  const playerPuuid = readNonEmptyString(player.summoner?.puuid)
  if (identity.puuid) {
    return playerPuuid === identity.puuid
  }

  const playerSummonerId = toFiniteNumber(player.summoner?.summonerId)
  if (identity.summonerId != null && playerSummonerId != null && playerSummonerId === identity.summonerId) {
    return true
  }

  const gameName = readNonEmptyString(player.summoner?.gameName)
  if (!identity.gameName || !gameName || gameName !== identity.gameName) {
    return false
  }

  return readNonEmptyString(player.summoner?.tagLine) === readNonEmptyString(identity.tagLine)
}

function normalizeRecordStatus(status: RecordStatus | undefined): RecordStatus {
  if (status === 'PRIVATE' || status === 'EMPTY' || status === 'ERROR') {
    return status
  }
  return 'NORMAL'
}

function formatPositionLabel(position: string | undefined): string {
  if (position === 'TOP') {
    return '上路'
  }
  if (position === 'JUNGLE') {
    return '打野'
  }
  if (position === 'MIDDLE') {
    return '中路'
  }
  if (position === 'BOTTOM') {
    return '下路'
  }
  if (position === 'SUPPORT') {
    return '辅助'
  }
  return '未知位置'
}

function formatRecordStatusLabel(status: RecordStatus): string {
  if (status === 'PRIVATE') {
    return '战绩隐藏'
  }
  if (status === 'EMPTY') {
    return '样本不足'
  }
  if (status === 'ERROR') {
    return '获取失败'
  }
  return '正常'
}

function formatPercent(value: number | null): string {
  return Number.isFinite(value) && value != null ? `${value.toFixed(1)}%` : '未知'
}

function formatNumber(value: number | null): string {
  return Number.isFinite(value) && value != null ? value.toFixed(1) : '未知'
}

function getPlayerSnapshotKey(player: SessionSummoner): string {
  return getGamingPlayerKey(player)
}

export function getGamingPlayerKey(player: { summoner?: { puuid?: string | null; summonerId?: number | null; gameName?: string | null; tagLine?: string | null } | null }): string {
  const puuid = readNonEmptyString(player.summoner?.puuid)
  if (puuid) {
    return `puuid:${puuid}`
  }

  const summonerId = toFiniteNumber(player.summoner?.summonerId)
  if (summonerId != null) {
    return `summoner:${summonerId}`
  }

  const gameName = readNonEmptyString(player.summoner?.gameName) || 'Unknown player'
  const tagLine = readNonEmptyString(player.summoner?.tagLine)
  return `name:${tagLine ? `${gameName}#${tagLine}` : gameName}`
}

function readSelectedPosition(player: SessionSummoner): string {
  return firstString(
    player.selectedPosition,
    player.position,
    player.assignedPosition,
    player.teamPosition,
    player.individualPosition
  )
}

function normalizePosition(value: string): string {
  const normalized = value.trim().toUpperCase()
  if (normalized === 'TOP') {
    return 'TOP'
  }
  if (normalized === 'JUNGLE') {
    return 'JUNGLE'
  }
  if (normalized === 'MID' || normalized === 'MIDDLE') {
    return 'MIDDLE'
  }
  if (normalized === 'ADC' || normalized === 'BOTTOM' || normalized === 'BOT') {
    return 'BOTTOM'
  }
  if (normalized === 'SUPPORT' || normalized === 'UTILITY') {
    return 'SUPPORT'
  }
  return ''
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

function readNonEmptyString(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function finiteNumberOrZero(value: unknown): number {
  return toFiniteNumber(value) ?? 0
}
