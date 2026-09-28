import type { MatchHistory, Participant, QueueInfo, Rank, Summoner } from '../types/api.ts'
import type { LoadReliableMatchHistoryOptions, ReliableMatchHistoryApi } from './reliableMatchHistory.ts'
import { loadReliableMatchHistory } from './reliableMatchHistory.ts'

export type OpggRankedPosition = 'top' | 'jungle' | 'mid' | 'adc' | 'support'

export const DEFAULT_OPGG_POSITION: OpggRankedPosition = 'mid'

const RANKED_QUEUE_IDS = new Set([420, 440])
const RECENT_MATCH_LIMIT = 50
const RECENT_RANKED_SAMPLE_LIMIT = 20

const TIER_MAP: Record<string, string> = {
  IRON: 'ibsg',
  BRONZE: 'ibsg',
  SILVER: 'ibsg',
  GOLD: 'gold_plus',
  PLATINUM: 'platinum_plus',
  EMERALD: 'emerald_plus',
  DIAMOND: 'diamond_plus',
  MASTER: 'master_plus',
  GRANDMASTER: 'grandmaster',
  CHALLENGER: 'challenger'
}

export interface ResolveDefaultOpggTierOptions {
  currentRank?: Rank | null
  sessionQueueId?: number | null
  sessionQueueType?: string | null
}

export interface ResolveDefaultOpggPositionOptions {
  summoner?: Summoner | null
  puuid?: string | null
  api?: ReliableMatchHistoryApi
  database?: LoadReliableMatchHistoryOptions['database']
}

export function resolveDefaultOpggTier(options: ResolveDefaultOpggTierOptions = {}): string {
  const queueMap = options.currentRank?.queueMap as Partial<Record<'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR', QueueInfo | null>> | undefined
  if (!queueMap) {
    return 'all'
  }

  const useFlexFirst = Number(options.sessionQueueId) === 440 || normalizeKey(options.sessionQueueType) === 'RANKED_FLEX_SR'
  const queueInfos = useFlexFirst
    ? [queueMap.RANKED_FLEX_SR, queueMap.RANKED_SOLO_5x5]
    : [queueMap.RANKED_SOLO_5x5, queueMap.RANKED_FLEX_SR]

  for (const queueInfo of queueInfos) {
    const tier = mapRankTierToOpggTier(queueInfo?.tier)
    if (tier !== 'all') {
      return tier
    }
  }

  return 'all'
}

export function mapRankTierToOpggTier(tier: unknown): string {
  const normalized = normalizeKey(tier)
  if (!normalized || normalized === 'UNRANKED') {
    return 'all'
  }
  return TIER_MAP[normalized] || 'all'
}

export async function resolveDefaultOpggPosition(
  options: ResolveDefaultOpggPositionOptions
): Promise<OpggRankedPosition> {
  const puuid = normalizePuuid(options.puuid || options.summoner?.puuid)
  if (!puuid) {
    return DEFAULT_OPGG_POSITION
  }

  try {
    const result = await loadReliableMatchHistory({
      summoner: options.summoner ?? null,
      puuid,
      currentPuuid: puuid,
      limit: RECENT_MATCH_LIMIT,
      minQualityMatches: 1,
      forceRefresh: false,
      api: options.api,
      database: options.database
    })

    const rankedMatches = result.matches
      .filter(match => RANKED_QUEUE_IDS.has(Number(match.queueId)))
      .sort((left, right) => Number(right.gameCreation || 0) - Number(left.gameCreation || 0))
      .slice(0, RECENT_RANKED_SAMPLE_LIMIT)

    return resolveMostFrequentRecentPosition(rankedMatches, puuid) || DEFAULT_OPGG_POSITION
  } catch {
    return DEFAULT_OPGG_POSITION
  }
}

export function resolveParticipantOpggPosition(
  match: MatchHistory,
  puuid: string
): OpggRankedPosition | null {
  const participant = findParticipantByPuuid(match, puuid)
  if (!participant) {
    return null
  }

  return readParticipantPosition(participant)
}

function resolveMostFrequentRecentPosition(
  matches: MatchHistory[],
  puuid: string
): OpggRankedPosition | null {
  const counts = new Map<OpggRankedPosition, { count: number; firstIndex: number }>()

  matches.forEach((match, index) => {
    const position = resolveParticipantOpggPosition(match, puuid)
    if (!position) {
      return
    }

    const current = counts.get(position)
    if (current) {
      current.count += 1
      return
    }

    counts.set(position, { count: 1, firstIndex: index })
  })

  let best: OpggRankedPosition | null = null
  let bestScore: { count: number; firstIndex: number } | null = null
  for (const [position, score] of counts) {
    if (!bestScore || score.count > bestScore.count || (
      score.count === bestScore.count && score.firstIndex < bestScore.firstIndex
    )) {
      best = position
      bestScore = score
    }
  }

  return best
}

function findParticipantByPuuid(match: MatchHistory, puuid: string): Participant | null {
  const normalizedPuuid = normalizePuuid(puuid)
  const identity = (match.participantIdentities || []).find(item => (
    normalizePuuid(item.player?.puuid) === normalizedPuuid
  ))
  if (!identity) {
    return null
  }

  return (match.participants || []).find(participant => (
    participant.participantId === identity.participantId
  )) || null
}

function readParticipantPosition(participant: Participant): OpggRankedPosition | null {
  const directValues = [
    participant.teamPosition,
    participant.individualPosition,
    participant.selectedPosition
  ]
  for (const value of directValues) {
    const mapped = mapPositionValue(value)
    if (mapped) {
      return mapped
    }
  }

  const lane = normalizeKey(participant.lane)
  const role = normalizeKey(participant.role)
  if (lane === 'BOTTOM' || lane === 'BOT') {
    if (role.includes('SUPPORT')) {
      return 'support'
    }
    return 'adc'
  }

  return mapPositionValue(participant.lane) || mapPositionValue(participant.role)
}

function mapPositionValue(value: unknown): OpggRankedPosition | null {
  switch (normalizeKey(value)) {
    case 'TOP':
    case 'TOPLANE':
      return 'top'
    case 'JUNGLE':
    case 'JUNGLER':
      return 'jungle'
    case 'MIDDLE':
    case 'MID':
      return 'mid'
    case 'BOTTOM':
    case 'BOT':
    case 'ADC':
    case 'DUO_CARRY':
    case 'CARRY':
      return 'adc'
    case 'UTILITY':
    case 'SUPPORT':
    case 'DUO_SUPPORT':
      return 'support'
    default:
      return null
  }
}

function normalizeKey(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

function normalizePuuid(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}
