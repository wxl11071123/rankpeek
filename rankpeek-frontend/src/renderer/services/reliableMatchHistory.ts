import {
  readMatchHistoryFromLocalCache,
  writeMatchHistoryToLocalCache
} from './localMatchCache.ts'
import type {
  MatchHistory,
  MatchHistoryPageResponse,
  RecordStatus,
  Summoner
} from '../types/api.ts'
import { apiClient } from '../api/httpClient.ts'
import type { LocalDatabaseAPI, MatchRecordListOptions } from '../types/localDatabase.ts'
import { isRenderableMatchForPuuid } from '../../shared/matchQuality.ts'

export type ReliableMatchHistorySource = 'local-cache' | 'sgp' | 'lcu'
type RemoteMatchHistorySource = 'sgp' | 'lcu'

export interface ReliableMatchHistoryApi {
  getMatchHistoryPage(
    puuid: string,
    options: {
      page?: number
      pageSize?: number
      source?: 'auto' | 'sgp' | 'lcu' | 'cache'
      queueId?: number
      championId?: number
      forceRefresh?: boolean
    }
  ): Promise<MatchHistoryPageResponse>
}

export interface ReliableMatchHistoryUpdate {
  matches: MatchHistory[]
  source: ReliableMatchHistorySource
  recordStatus?: RecordStatus
}

export interface ReliableMatchHistoryResult extends ReliableMatchHistoryUpdate {
  errors: unknown[]
}

export interface ReliableMatchHistoryFilterOptions {
  puuid: string
  queueId?: number
  championId?: number
  limit?: number
}

export interface LoadReliableMatchHistoryOptions {
  summoner: SummonerWithPlatform | null
  puuid?: string
  currentPuuid?: string
  queueId?: number
  championId?: number
  limit?: number
  minQualityMatches?: number
  forceRefresh?: boolean
  api?: ReliableMatchHistoryApi
  database?: MatchHistoryCacheDatabase | null
  onUpdate?: (update: ReliableMatchHistoryUpdate) => void
}

type MatchHistoryCacheDatabase = Pick<
  LocalDatabaseAPI,
  'listMatchRecordsByAccount' | 'upsertAccount' | 'upsertMatchRecords'
>

type SummonerWithPlatform = Summoner & {
  platformId?: string | null
}

const DEFAULT_LOOKBACK_LIMIT = 50
const DEFAULT_MIN_QUALITY_MATCHES = 10

export async function loadReliableMatchHistory(
  options: LoadReliableMatchHistoryOptions
): Promise<ReliableMatchHistoryResult> {
  const puuid = options.currentPuuid || options.puuid || options.summoner?.puuid || ''
  const limit = normalizeLimit(options.limit)
  const minQualityMatches = normalizeMinQualityMatches(options.minQualityMatches)
  const api = options.api ?? await getDefaultApiClient()
  const errors: unknown[] = []
  let bestMatches: MatchHistory[] = []
  let bestSource: ReliableMatchHistorySource = 'local-cache'
  let recordStatus: RecordStatus | undefined

  if (!puuid) {
    return {
      matches: [],
      source: bestSource,
      recordStatus,
      errors
    }
  }

  const emitAcceptedMatches = async (
    matches: MatchHistory[],
    source: ReliableMatchHistorySource,
    nextRecordStatus?: RecordStatus
  ): Promise<boolean> => {
    if (!shouldAcceptMatchSet(matches, bestMatches, minQualityMatches)) {
      return false
    }

    const shouldEmit = source !== 'local-cache' || !hasSameMatchIds(matches, bestMatches)
    bestMatches = matches
    bestSource = source
    recordStatus = nextRecordStatus ?? recordStatus
    if (shouldEmit) {
      options.onUpdate?.({
        matches,
        source,
        recordStatus
      })
    }
    return true
  }

  const cachedMatches = await readLocalMatches(puuid, options, limit)
  await emitAcceptedMatches(cachedMatches, 'local-cache')

  const tryRemote = async (source: RemoteMatchHistorySource): Promise<boolean> => {
    const response = await fetchRemoteMatches(api, puuid, options, limit, source)
    const matches = filterReliableMatches(response.matches ?? [], {
      puuid,
      queueId: options.queueId,
      championId: options.championId,
      limit
    })

    const accepted = await emitAcceptedMatches(matches, source, response.recordStatus)
    if (!accepted) {
      throw new Error(`${source.toUpperCase()} match history did not meet quality threshold`)
    }

    if (source === 'sgp' && options.summoner) {
      await writeMatchHistoryToLocalCache({
        summoner: options.summoner,
        matches,
        database: options.database ?? undefined
      })
    }
    return true
  }

  try {
    await tryRemote('sgp')
  } catch (sgpError) {
    errors.push(sgpError)
    try {
      await tryRemote('lcu')
    } catch (lcuError) {
      errors.push(lcuError)
      try {
        await tryRemote('sgp')
      } catch (retryError) {
        errors.push(retryError)
      }
    }
  }

  return {
    matches: bestMatches,
    source: bestSource,
    recordStatus,
    errors
  }
}

export function filterReliableMatches(
  matches: MatchHistory[],
  options: ReliableMatchHistoryFilterOptions
): MatchHistory[] {
  const limit = normalizeLimit(options.limit)
  return matches
    .filter(match => isExpectedQueue(match, options.queueId))
    .filter(match => isExpectedChampion(match, options.championId, options.puuid))
    .filter(match => isRenderableMatchForPuuid(match, options.puuid))
    .sort((a, b) => (b.gameCreation || 0) - (a.gameCreation || 0))
    .slice(0, limit)
}

async function readLocalMatches(
  puuid: string,
  options: LoadReliableMatchHistoryOptions,
  limit: number
): Promise<MatchHistory[]> {
  const listOptions: MatchRecordListOptions = {
    limit,
    offset: 0,
    queueId: options.queueId,
    championId: options.championId
  }
  const matches = await readMatchHistoryFromLocalCache({
    accountPuuid: puuid,
    options: listOptions,
    database: options.database ?? undefined
  })
  return filterReliableMatches(matches, {
    puuid,
    queueId: options.queueId,
    championId: options.championId,
    limit
  })
}

async function fetchRemoteMatches(
  api: ReliableMatchHistoryApi,
  puuid: string,
  options: LoadReliableMatchHistoryOptions,
  limit: number,
  source: RemoteMatchHistorySource
): Promise<MatchHistoryPageResponse> {
  const response = await api.getMatchHistoryPage(puuid, {
    page: 1,
    pageSize: limit,
    source,
    queueId: options.queueId,
    championId: options.championId,
    forceRefresh: options.forceRefresh !== false
  })
  const responseSource = (response.source || '').toLowerCase()
  if (responseSource && responseSource !== source) {
    throw new Error(`${source.toUpperCase()} refresh returned ${response.source}`)
  }
  return response
}

function shouldAcceptMatchSet(
  candidateMatches: MatchHistory[],
  currentMatches: MatchHistory[],
  minQualityMatches: number
): boolean {
  if (candidateMatches.length === 0) {
    return false
  }

  if (currentMatches.length === 0) {
    return true
  }

  const requiredMatches = Math.min(currentMatches.length, minQualityMatches)
  return candidateMatches.length >= requiredMatches
}

function hasSameMatchIds(left: MatchHistory[], right: MatchHistory[]): boolean {
  if (left.length !== right.length) {
    return false
  }
  return left.every((match, index) => match.gameId === right[index]?.gameId)
}

function isExpectedQueue(match: MatchHistory, queueId?: number): boolean {
  return queueId == null || queueId <= 0 || match.queueId === queueId
}

function isExpectedChampion(match: MatchHistory, championId: number | undefined, puuid: string): boolean {
  if (championId == null || championId <= 0) {
    return true
  }

  const identity = (match.participantIdentities || []).find(item => item.player?.puuid === puuid)
  const participant = identity
    ? (match.participants || []).find(item => item.participantId === identity.participantId)
    : null
  return participant?.championId === championId
}

function normalizeLimit(limit?: number): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_LOOKBACK_LIMIT
  }
  return Math.max(1, Math.floor(limit))
}

function normalizeMinQualityMatches(minQualityMatches?: number): number {
  if (
    typeof minQualityMatches !== 'number' ||
    !Number.isFinite(minQualityMatches) ||
    minQualityMatches <= 0
  ) {
    return DEFAULT_MIN_QUALITY_MATCHES
  }
  return Math.max(1, Math.floor(minQualityMatches))
}

function getDefaultApiClient(): ReliableMatchHistoryApi {
  return apiClient
}
