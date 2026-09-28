import type { GameDetail, MatchHistory, Participant } from '../types/api.ts'
import {
  hasCompleteParticipantStats,
  hasPositiveChampionId
} from '../../shared/matchQuality.ts'

export type HomeChartLaneKey = 'all' | 'top' | 'jungle' | 'mid' | 'bottom' | 'support' | 'unknown'

export interface HomeChartEntry {
  gameId: number
  gameCreation: number
  championId: number
  win: boolean
  lane: HomeChartLaneKey
  laneLabel: string
  kills: number
  deaths: number
  assists: number
  kdaText: string
  gold: number | null
  totalDamage: number | null
  damageRate: number | null
  goldDiff15: number | null
  visionScore: number | null
  rpIndex?: number | null
}

export type HomeChartDetailLookup = Map<number, GameDetail> | Record<string, GameDetail | undefined>

type DetailParticipant = GameDetail['participants'][number]
type StatsRecord = Record<string, unknown>

const GOLD_DIFF_15_KEYS = [
  'earlyGoldDiff',
  'laneGoldDiff15',
  'goldDiff15',
  'goldDiffAt15',
  'goldDifferenceAt15',
  'fifteenMinuteGoldDiff'
]

const LANE_LABELS: Record<HomeChartLaneKey, string> = {
  all: 'All',
  top: 'Top',
  jungle: 'Jungle',
  mid: 'Mid',
  bottom: 'Bottom',
  support: 'Support',
  unknown: 'Unknown'
}

export function createHomeChartEntries(
  matches: MatchHistory[],
  puuid: string,
  detailsByGameId?: HomeChartDetailLookup
): HomeChartEntry[] {
  const detailLookup = normalizeDetailLookup(detailsByGameId)
  return matches
    .slice()
    .sort((a, b) => (b.gameCreation || 0) - (a.gameCreation || 0))
    .map(match => createHomeChartEntry(match, puuid, detailLookup.get(match.gameId)))
    .filter((entry): entry is HomeChartEntry => Boolean(entry))
}

export function createHomeChartEntry(
  match: MatchHistory,
  puuid: string,
  detail?: GameDetail | null,
  rpIndex?: number | null
): HomeChartEntry | null {
  const matchParticipant = getMatchParticipantByPuuid(match, puuid)
  if (!matchParticipant || !hasPositiveChampionId(matchParticipant.championId)) {
    return null
  }

  const summaryStats = toRecord(matchParticipant.stats)
  if (!summaryStats || !hasCompleteParticipantStats(summaryStats)) {
    return null
  }

  const detailParticipant = getDetailParticipantByPuuid(detail, puuid, matchParticipant.participantId)
  const detailStats = toRecord(detailParticipant?.stats)
  const stats = {
    ...summaryStats,
    ...(detailStats || {})
  }
  const lane = resolveLane(detailParticipant, matchParticipant)
  const kills = readRequiredNumber(summaryStats, 'kills')
  const deaths = readRequiredNumber(summaryStats, 'deaths')
  const assists = readRequiredNumber(summaryStats, 'assists')
  const win = summaryStats.win

  if (
    kills == null ||
    deaths == null ||
    assists == null ||
    typeof win !== 'boolean'
  ) {
    return null
  }
  if (isShortZeroKdaSummary(match, stats, kills, deaths, assists)) {
    return null
  }

  return {
    gameId: match.gameId,
    gameCreation: match.gameCreation,
    championId: positiveNumber(detailParticipant?.championId) ?? matchParticipant.championId,
    win,
    lane,
    laneLabel: LANE_LABELS[lane],
    kills,
    deaths,
    assists,
    kdaText: `${kills}/${deaths}/${assists}`,
    gold: readNumber(stats, ['goldEarned']),
    totalDamage: readNumber(stats, ['totalDamageDealtToChampions']),
    damageRate: calculateDamageConversion(stats),
    goldDiff15: calculateGoldDiff15(stats),
    visionScore: readVisionScore(stats),
    ...(rpIndex != null ? { rpIndex: roundOneDecimal(rpIndex) } : {})
  }
}

function isShortZeroKdaSummary(
  match: MatchHistory,
  stats: StatsRecord,
  kills: number,
  deaths: number,
  assists: number
): boolean {
  if (kills !== 0 || deaths !== 0 || assists !== 0) {
    return false
  }

  const duration = readNumber(toRecord(match), ['gameDuration'])
  if (duration == null || duration >= 300) {
    return false
  }

  const gold = readNumber(stats, ['goldEarned'])
  const damage = readNumber(stats, ['totalDamageDealtToChampions'])
  return (gold == null || gold <= 1200) && (damage == null || damage <= 1000)
}

export function mergeHomeChartDetail(
  entry: HomeChartEntry,
  match: MatchHistory,
  detail: GameDetail | null,
  puuid: string,
  rpIndex?: number | null
): HomeChartEntry {
  const enhancedEntry = createHomeChartEntry(match, puuid, detail, rpIndex)
  return enhancedEntry ?? entry
}

export async function runWithConcurrencyLimit<TItem, TResult>(
  items: TItem[],
  limit: number,
  operation: (item: TItem, index: number) => Promise<TResult>,
  onError?: (error: unknown, item: TItem, index: number) => void
): Promise<Array<TResult | undefined>> {
  const results: Array<TResult | undefined> = new Array(items.length)
  const workerCount = Math.min(items.length, Math.max(1, Math.floor(limit)))
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      const item = items[index]
      try {
        results[index] = await operation(item, index)
      } catch (error) {
        onError?.(error, item, index)
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

function normalizeDetailLookup(detailsByGameId?: HomeChartDetailLookup): Map<number, GameDetail> {
  if (!detailsByGameId) {
    return new Map()
  }
  if (detailsByGameId instanceof Map) {
    return detailsByGameId
  }

  const lookup = new Map<number, GameDetail>()
  for (const [gameId, detail] of Object.entries(detailsByGameId)) {
    const numericGameId = Number(gameId)
    if (Number.isFinite(numericGameId) && detail) {
      lookup.set(numericGameId, detail)
    }
  }
  return lookup
}

function getMatchParticipantByPuuid(match: MatchHistory, puuid: string): Participant | null {
  const identity = (match.participantIdentities || []).find(item => item.player?.puuid === puuid)
  if (!identity) {
    return null
  }

  return (match.participants || []).find(
    participant => participant.participantId === identity.participantId
  ) || null
}

function getDetailParticipantByPuuid(
  detail: GameDetail | null | undefined,
  puuid: string,
  fallbackParticipantId: number
): DetailParticipant | undefined {
  if (!detail) {
    return undefined
  }

  const identity = (detail.participantIdentities || []).find(item => item.player?.puuid === puuid)
  const participantId = identity?.participantId ?? fallbackParticipantId
  return (detail.participants || []).find(participant => participant.participantId === participantId)
}

function resolveLane(
  detailParticipant?: DetailParticipant,
  matchParticipant?: Participant
): HomeChartLaneKey {
  const detailRecord = toRecord(detailParticipant)
  const matchRecord = toRecord(matchParticipant)
  const timeline = toRecord(detailRecord?.timeline) || toRecord(matchRecord?.timeline)

  return normalizeLane(
    readString(timeline, ['lane']) || readString(detailRecord, ['lane']),
    readString(timeline, ['role']) || readString(detailRecord, ['role']),
    readString(detailRecord, ['teamPosition']) || readString(matchRecord, ['teamPosition']),
    readString(detailRecord, ['individualPosition']) || readString(matchRecord, ['individualPosition'])
  )
}

function normalizeLane(
  lane?: string,
  role?: string,
  teamPosition?: string,
  individualPosition?: string
): HomeChartLaneKey {
  const laneKey = normalizePosition(lane)
  const roleKey = normalizePosition(role)
  const teamPositionKey = normalizePosition(teamPosition)
  const individualPositionKey = normalizePosition(individualPosition)
  const positionCandidates = [laneKey, teamPositionKey, individualPositionKey, roleKey]

  if (positionCandidates.some(value => value === 'JUNGLE')) {
    return 'jungle'
  }
  if (positionCandidates.some(value => value === 'TOP')) {
    return 'top'
  }
  if (positionCandidates.some(value => value === 'MIDDLE' || value === 'MID')) {
    return 'mid'
  }
  if (
    roleKey.includes('SUPPORT') ||
    teamPositionKey === 'UTILITY' ||
    teamPositionKey === 'SUPPORT' ||
    individualPositionKey === 'UTILITY' ||
    individualPositionKey === 'SUPPORT' ||
    laneKey === 'UTILITY'
  ) {
    return 'support'
  }
  if (
    laneKey === 'BOTTOM' ||
    laneKey === 'BOT' ||
    roleKey === 'DUO_CARRY' ||
    teamPositionKey === 'BOTTOM' ||
    teamPositionKey === 'BOT' ||
    individualPositionKey === 'BOTTOM' ||
    individualPositionKey === 'BOT'
  ) {
    return 'bottom'
  }

  return 'unknown'
}

function calculateDamageConversion(stats: StatsRecord): number | null {
  const challenges = toRecord(stats.challenges)
  const challengeValue = readNumber(challenges, ['damagePerGold'])
  if (challengeValue != null) {
    return challengeValue * 100
  }

  const damage = readNumber(stats, ['totalDamageDealtToChampions'])
  const gold = readNumber(stats, ['goldEarned'])
  if (damage == null || gold == null || damage <= 0 || gold <= 0) {
    return null
  }
  return (damage / gold) * 100
}

function calculateGoldDiff15(stats: StatsRecord): number | null {
  const challenges = toRecord(stats.challenges)
  return readNumber(stats, GOLD_DIFF_15_KEYS) ?? readNumber(challenges, GOLD_DIFF_15_KEYS)
}

function readVisionScore(stats: StatsRecord): number | null {
  const directValue = readNumber(stats, ['visionScore'])
  if (directValue != null) {
    return directValue
  }

  const challenges = toRecord(stats.challenges)
  return readNumber(challenges, ['visionScore'])
}

function readRequiredNumber(record: StatsRecord, key: string): number | null {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function normalizePosition(value?: string): string {
  return (value || '').trim().toUpperCase().replace(/\s+/g, '_')
}

function toRecord(value: unknown): StatsRecord | null {
  return value && typeof value === 'object' ? value as StatsRecord : null
}

function readString(record: StatsRecord | null, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record?.[key]
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }
  return undefined
}

function readNumber(record: StatsRecord | null, keys: string[]): number | null {
  for (const key of keys) {
    const value = record?.[key]
    if (value === null) {
      return null
    }
    const numberValue = typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN
    if (Number.isFinite(numberValue)) {
      return numberValue
    }
  }
  return null
}

function roundOneDecimal(value: number): number {
  return Number(value.toFixed(1))
}
