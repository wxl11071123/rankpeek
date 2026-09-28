import type { MatchHistory, Participant } from '../types/api.ts'
import { formatDuration } from './matchDetailMetrics.ts'

export type RecentMatchResult = 'win' | 'loss' | 'unknown'

export interface ParticipantRecentMatchItem {
  key: string
  gameId: number
  championId: number | null
  result: RecentMatchResult
  isRanked: boolean
  kdaText: string
  positionText: string
  timeText: string
  startTimeText: string
  durationText: string
  itemIds: number[]
}

export function buildParticipantRecentMatchItems(
  matches: ReadonlyArray<MatchHistory | null | undefined> | null | undefined,
  puuid: string | null | undefined
): ParticipantRecentMatchItem[] {
  if (!matches?.length) {
    return []
  }

  const normalizedPuuid = normalizeText(puuid)
  return matches
    .map((match, index) => ({ match, index }))
    .filter((entry): entry is { match: MatchHistory, index: number } => Boolean(entry.match))
    .sort((left, right) => compareRecentMatches(left.match, right.match, left.index, right.index))
    .slice(0, 20)
    .map(({ match, index }) => buildRecentMatchItem(match, normalizedPuuid, index))
}

function buildRecentMatchItem(match: MatchHistory, puuid: string, index: number): ParticipantRecentMatchItem {
  const participant = findParticipantForPlayer(match, puuid)
  const championId = normalizePositiveInteger(participant?.championId)
  const result = getResult(participant)
  const queueId = normalizePositiveInteger(match.queueId)
  const isRanked = queueId === 420 || queueId === 440

  return {
    key: `${match.gameId || 'match'}-${index}`,
    gameId: match.gameId,
    championId,
    result,
    isRanked,
    kdaText: formatKda(participant),
    positionText: formatPosition(participant),
    timeText: formatShortDate(match.gameCreation),
    startTimeText: formatStartTime(match.gameCreation),
    durationText: formatMatchDuration(match.gameDuration),
    itemIds: extractItemIds(participant)
  }
}

function findParticipantForPlayer(match: MatchHistory, puuid: string): Participant | null {
  const participantId = findParticipantId(match, puuid)
  if (participantId !== null) {
    return match.participants?.find(participant => participant?.participantId === participantId) ?? null
  }

  if (match.participants?.length === 1) {
    return match.participants[0] ?? null
  }

  return null
}

function findParticipantId(match: MatchHistory, puuid: string): number | null {
  if (!puuid || !match.participantIdentities?.length) {
    return null
  }

  const identity = match.participantIdentities.find(item => item?.player?.puuid === puuid)
  return normalizeFiniteNumber(identity?.participantId)
}

function getResult(participant: Participant | null): RecentMatchResult {
  const win = participant?.stats?.win
  if (win === true) return 'win'
  if (win === false) return 'loss'
  return 'unknown'
}

function formatKda(participant: Participant | null): string {
  const stats = participant?.stats
  const kills = normalizeFiniteNumber(stats?.kills)
  const deaths = normalizeFiniteNumber(stats?.deaths)
  const assists = normalizeFiniteNumber(stats?.assists)

  if (kills === null || deaths === null || assists === null) {
    return '--'
  }

  return `${kills} / ${deaths} / ${assists}`
}

function formatPosition(participant: Participant | null): string {
  const raw = normalizeText(participant?.teamPosition) || normalizeText(participant?.individualPosition)
  return POSITION_LABEL_MAP[raw.toUpperCase()] || raw || ''
}

function extractItemIds(participant: Participant | null): number[] {
  const stats = participant?.stats
  const ids: number[] = []
  for (let i = 0; i <= 6; i += 1) {
    const itemId = stats ? (stats as Record<string, unknown>)[`item${i}`] : undefined
    if (typeof itemId === 'number' && Number.isFinite(itemId) && itemId > 0) {
      ids.push(itemId)
    } else {
      ids.push(0)
    }
  }
  return ids
}

const POSITION_LABEL_MAP: Record<string, string> = {
  TOP: '上单',
  JUNGLE: '打野',
  MIDDLE: '中单',
  BOTTOM: 'ADC',
  SUPPORT: '辅助',
  UTILITY: '辅助'
}

function formatShortDate(timestamp: unknown): string {
  const safeTimestamp = normalizeFiniteNumber(timestamp)
  if (safeTimestamp === null || safeTimestamp <= 0) {
    return '--'
  }

  const date = new Date(safeTimestamp)
  if (Number.isNaN(date.getTime())) {
    return '--'
  }

  return `${date.getMonth() + 1}/${date.getDate()}`
}

/** 对局开始时间（月/日 时:分） */
function formatStartTime(timestamp: unknown): string {
  const safeTimestamp = normalizeFiniteNumber(timestamp)
  if (safeTimestamp === null || safeTimestamp <= 0) {
    return '--'
  }

  const date = new Date(safeTimestamp)
  if (Number.isNaN(date.getTime())) {
    return '--'
  }

  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${date.getMonth() + 1}/${date.getDate()} ${hours}:${minutes}`
}

function formatMatchDuration(seconds: unknown): string {
  const safeSeconds = normalizeFiniteNumber(seconds)
  return safeSeconds !== null && safeSeconds > 0 ? formatDuration(safeSeconds) : '--'
}

function compareRecentMatches(left: MatchHistory, right: MatchHistory, leftIndex: number, rightIndex: number): number {
  const leftTime = normalizeFiniteNumber(left.gameCreation)
  const rightTime = normalizeFiniteNumber(right.gameCreation)

  if (leftTime !== null && rightTime !== null && leftTime !== rightTime) {
    return rightTime - leftTime
  }

  if (leftTime !== null && rightTime === null) {
    return -1
  }

  if (leftTime === null && rightTime !== null) {
    return 1
  }

  return leftIndex - rightIndex
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizePositiveInteger(value: unknown): number | null {
  const normalized = normalizeFiniteNumber(value)
  return normalized !== null && Number.isInteger(normalized) && normalized > 0 ? normalized : null
}

function normalizeFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
