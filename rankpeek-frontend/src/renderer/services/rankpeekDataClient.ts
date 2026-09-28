import {
  RANKPEEK_LOCAL_SERVICE_BASE_URL,
  normalizeRankPeekLocalServiceBaseUrl
} from './rankpeekLocalServiceClient.ts'

export const RANKPEEK_DATA_API_BASE_URL = RANKPEEK_LOCAL_SERVICE_BASE_URL
export const RANKPEEK_DATA_DIAGNOSTICS_ENDPOINT = '/api/v1/system/identity'

const RANKPEEK_DATA_UNAVAILABLE_MESSAGE = 'rankpeek local backend unavailable; confirm 127.0.0.1:8080 is running.'

export const normalizeRankPeekDataBaseUrl = normalizeRankPeekLocalServiceBaseUrl

interface RankPeekDataDiagnosticsResponse {
  success?: boolean
  code?: number
  message?: string
  data?: {
    service?: string
    mode?: string
    version?: string
  }
  error?: {
    message?: string
  } | null
}

interface RankPeekDataApiResponse<T> {
  success?: boolean
  code?: number
  message?: string
  data?: T
  error?: {
    message?: string
  } | null
}

export interface CnChampionMeta {
  tierScope: string
  championId: number
  avgKda?: number | null
  avgGold?: number | null
  avgDamage?: number | null
  dataSourceNote?: string | null
}

export interface OpggChampionStats {
  games: number
  winRate?: number | null
  pickRate?: number | null
  banRate?: number | null
  kda?: number | null
}

export interface OpggBuildOption {
  label: string
  ids: number[]
  order?: number[]
  games?: number | null
  winRate?: number | null
  pickRate?: number | null
}

export interface OpggChampionDetail {
  championId: number
  championName?: string | null
  mode: string
  region: string
  tier: string
  position: string
  version?: string | null
  updatedAt?: string | null
  stats: OpggChampionStats
  summonerSpells: OpggBuildOption[]
  runes: OpggBuildOption[]
  skillOrders: OpggBuildOption[]
  starterItems: OpggBuildOption[]
  boots: OpggBuildOption[]
  coreItems: OpggBuildOption[]
  lastItems?: OpggBuildOption[]
  augments?: OpggBuildOption[]
}

export interface OpggChampionCounter {
  championId: number
  games: number
  wins?: number | null
}

export interface OpggChampionPositionStats {
  position: string
  tier?: number | null
  rank?: number | null
  stats: OpggChampionStats
  counters: OpggChampionCounter[]
}

export interface OpggChampionListItem {
  championId: number
  tier?: number | null
  rank?: number | null
  stats: OpggChampionStats
  positions: OpggChampionPositionStats[]
}

export interface OpggChampionList {
  mode: string
  region: string
  tier: string
  version?: string | null
  updatedAt?: string | null
  items: OpggChampionListItem[]
}

export interface OpggChampionDetailRequest {
  championId: number
  mode: string
  region: string
  tier: string
  position: string
}

export interface OpggChampionListRequest {
  mode: string
  region: string
  tier: string
}

export type RankPeekDataDiagnosticsCheck =
  | {
    available: true
    service: string
    mode: string
    version: string
  }
  | {
    available: false
    message: string
  }

export async function checkRankPeekDataDiagnostics(): Promise<RankPeekDataDiagnosticsCheck> {
  try {
    const response = await fetch(`${RANKPEEK_DATA_API_BASE_URL}${RANKPEEK_DATA_DIAGNOSTICS_ENDPOINT}`, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    })

    if (!response.ok) {
      return { available: false, message: `${RANKPEEK_DATA_UNAVAILABLE_MESSAGE} (HTTP ${response.status})` }
    }

    const payload = await parseDiagnosticsResponse(response)
    if (payload.success === false || (payload.code !== undefined && payload.code !== 200)) {
      return {
        available: false,
        message: payload.error?.message || payload.message || RANKPEEK_DATA_UNAVAILABLE_MESSAGE
      }
    }
    if (!payload.data) {
      return { available: false, message: RANKPEEK_DATA_UNAVAILABLE_MESSAGE }
    }

    return {
      available: true,
      service: payload.data.service || 'rankpeek-backend',
      mode: payload.data.mode || 'local',
      version: payload.data.version || 'unknown'
    }
  } catch {
    return { available: false, message: RANKPEEK_DATA_UNAVAILABLE_MESSAGE }
  }
}

async function parseDiagnosticsResponse(response: Response): Promise<RankPeekDataDiagnosticsResponse> {
  try {
    return await response.json() as RankPeekDataDiagnosticsResponse
  } catch {
    return {}
  }
}

const championMetaCache = new Map<string, Promise<CnChampionMeta | null>>()

export function getLatestChampionMeta(championId: number, tierScope: string): Promise<CnChampionMeta | null> {
  const normalizedTier = tierScope.trim().toUpperCase()
  if (!Number.isFinite(championId) || championId <= 0 || !normalizedTier) {
    return Promise.resolve(null)
  }

  const cacheKey = `${championId}:${normalizedTier}`
  if (championMetaCache.has(cacheKey)) {
    return championMetaCache.get(cacheKey) as Promise<CnChampionMeta | null>
  }

  const endpoint = `/api/v1/cn-meta/champions/${encodeURIComponent(String(championId))}/latest?tierScope=${encodeURIComponent(normalizedTier)}`
  const request = fetch(`${RANKPEEK_DATA_API_BASE_URL}${endpoint}`, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  })
    .then(async (response): Promise<CnChampionMeta | null> => {
      if (!response.ok) {
        championMetaCache.delete(cacheKey)
        return null
      }
      const payload = await parseDataJson<CnChampionMeta[]>(response)
      if (payload.success === false || !Array.isArray(payload.data) || payload.data.length === 0) {
        championMetaCache.delete(cacheKey)
        return null
      }
      const meta = payload.data[0] || null
      if (!meta) {
        championMetaCache.delete(cacheKey)
      }
      return meta
    })
    .catch(() => {
      championMetaCache.delete(cacheKey)
      return null
    })

  championMetaCache.set(cacheKey, request)
  return request
}

export async function getOpggChampionDetail(query: OpggChampionDetailRequest): Promise<OpggChampionDetail | null> {
  if (!Number.isFinite(query.championId) || query.championId <= 0 || !query.mode || !query.region) {
    return null
  }

  const params = new URLSearchParams()
  params.set('mode', query.mode)
  params.set('region', query.region)
  if (query.tier) params.set('tier', query.tier)
  if (query.position) params.set('position', query.position)

  const endpoint = `/api/v1/opgg/champions/${encodeURIComponent(String(query.championId))}/detail?${params.toString()}`
  const response = await fetch(`${RANKPEEK_DATA_API_BASE_URL}${endpoint}`, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  })
  const payload = await parseDataJson<OpggChampionDetail>(response)
  if (!response.ok || payload.success === false || (payload.code !== undefined && payload.code !== 200)) {
    throw new Error(payload.error?.message || payload.message || `OP.GG detail request failed: HTTP ${response.status}`)
  }
  return payload.data || null
}

export async function getOpggChampionList(query: OpggChampionListRequest): Promise<OpggChampionList | null> {
  if (!query.mode || !query.region) {
    return null
  }

  const params = new URLSearchParams()
  params.set('mode', query.mode)
  params.set('region', query.region)
  params.set('tier', query.tier || 'all')

  const endpoint = `/api/v1/opgg/champions?${params.toString()}`
  const response = await fetch(`${RANKPEEK_DATA_API_BASE_URL}${endpoint}`, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  })
  const payload = await parseDataJson<OpggChampionList>(response)
  if (!response.ok || payload.success === false || (payload.code !== undefined && payload.code !== 200)) {
    throw new Error(payload.error?.message || payload.message || `OP.GG champion list request failed: HTTP ${response.status}`)
  }
  return payload.data || null
}

async function parseDataJson<T>(response: Response): Promise<RankPeekDataApiResponse<T>> {
  try {
    return await response.json() as RankPeekDataApiResponse<T>
  } catch {
    return {}
  }
}
