import type {
  LocalDatabaseAPI,
  MatchDetail,
  MatchRecord,
  MatchRecordListOptions
} from '../types/localDatabase'

export type AiAnalysisType =
  | 'account_overview'
  | 'pregame'
  | 'postgame'
  | 'coach_summary'
  | 'entertainment'

export interface AiAnalysisInputSnapshot {
  schemaVersion: number
  analysisType: AiAnalysisType
  builtAt: string
  accountPuuid: string
  accountDisplayName?: string
  inputHash: string

  source: {
    recordSource: 'local_cache'
    matchRecordCount: number
    matchDetailCount: number
    requestedLimit: number
    hasEnoughData: boolean
  }

  aggregate: {
    totalMatches: number
    wins: number
    losses: number
    winRate: number | null
    averageKills: number | null
    averageDeaths: number | null
    averageAssists: number | null
    averageKda: number | null
    mostPlayedChampions: Array<{
      championId: number
      games: number
      wins: number
      losses: number
      winRate: number | null
    }>
    queueBreakdown: Array<{
      queueId: number | null
      queueName?: string
      games: number
      wins: number
      losses: number
      winRate: number | null
    }>
    recentTrend: {
      last10Wins: number
      last10Losses: number
      currentStreakType: 'win' | 'loss' | 'none'
      currentStreakCount: number
    }
  }

  recentMatches: AiMatchSummary[]

  selectedMatch?: {
    matchId: string
    hasDetail: boolean
    summary?: AiMatchSummary
    detailDigest?: AiMatchDetailDigest
  }
}

export interface AiMatchSummary {
  matchId: string
  region: string
  queueId: number | null
  queueName?: string
  gameMode?: string
  gameVersion?: string | null
  gameCreation?: number | null
  gameDuration?: number | null
  championId?: number | null
  win?: boolean | null
  kills?: number | null
  deaths?: number | null
  assists?: number | null
  kda?: number | null
}

export interface AiMatchDetailDigest {
  participantCount: number
  teamCount: number
  currentPlayer?: {
    championId?: number
    teamId?: number
    lane?: string
    role?: string
    totalDamageDealtToChampions?: number
    totalDamageTaken?: number
    goldEarned?: number
    visionScoreLike?: number | null
  }
}

type SnapshotDatabase = Pick<LocalDatabaseAPI, 'listMatchRecordsByAccount' | 'getMatchDetail'>

export interface BuildAccountAnalysisInputSnapshotParams {
  accountPuuid: string
  accountDisplayName?: string
  limit?: number
  offset?: number
  database?: SnapshotDatabase | null
}

const DEFAULT_LIMIT = 20
const DEFAULT_OFFSET = 0
const MIN_ANALYZABLE_MATCHES = 3

export async function buildAccountAnalysisInputSnapshot({
  accountPuuid,
  accountDisplayName,
  limit = DEFAULT_LIMIT,
  offset = DEFAULT_OFFSET,
  database = getRendererDatabase()
}: BuildAccountAnalysisInputSnapshotParams): Promise<AiAnalysisInputSnapshot> {
  const normalizedPuuid = accountPuuid.trim()
  if (!normalizedPuuid) {
    throw new Error('accountPuuid is required to build an AI analysis input snapshot')
  }

  if (!database) {
    throw new Error('Local database API is unavailable')
  }

  const requestedLimit = normalizeLimit(limit)
  const options: MatchRecordListOptions = {
    limit: requestedLimit,
    offset: normalizeOffset(offset)
  }
  const recordsResult = await database.listMatchRecordsByAccount(normalizedPuuid, options)
  if (!recordsResult.success) {
    throw new Error(recordsResult.error)
  }

  const records = recordsResult.data
  const recentMatches = records.map(record => toAiMatchSummary(record, normalizedPuuid))
  const matchDetailCount = await countAvailableMatchDetails(records, database, normalizedPuuid)
  const snapshotWithoutHash: Omit<AiAnalysisInputSnapshot, 'inputHash'> = {
    schemaVersion: 1,
    analysisType: 'account_overview',
    builtAt: new Date().toISOString(),
    accountPuuid: normalizedPuuid,
    ...(nonEmptyString(accountDisplayName) ? { accountDisplayName: accountDisplayName.trim() } : {}),
    source: {
      recordSource: 'local_cache',
      matchRecordCount: records.length,
      matchDetailCount,
      requestedLimit,
      hasEnoughData: records.length >= MIN_ANALYZABLE_MATCHES
    },
    aggregate: buildAggregate(recentMatches),
    recentMatches
  }
  const snapshot: AiAnalysisInputSnapshot = {
    ...snapshotWithoutHash,
    inputHash: ''
  }

  return {
    ...snapshot,
    inputHash: createInputHash(snapshot)
  }
}

export function createInputHash(snapshot: AiAnalysisInputSnapshot): string {
  const { builtAt: _builtAt, inputHash: _inputHash, ...hashInput } = snapshot
  const source = stableStringify(hashInput)
  let hash = 0x811c9dc5

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  return hash.toString(16).padStart(8, '0')
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(toStableJsonValue(value))
}

function toAiMatchSummary(record: MatchRecord, accountPuuid: string): AiMatchSummary {
  const rawSummary = parseJsonObject(record.rawSummaryJson, `match summary ${record.matchId}`)
  const rawCurrentParticipant = findCurrentParticipant(rawSummary, accountPuuid)
  const rawStats = isRecord(rawCurrentParticipant?.stats) ? rawCurrentParticipant.stats : null
  const kills = firstNumber(record.kills, rawStats?.kills)
  const deaths = firstNumber(record.deaths, rawStats?.deaths)
  const assists = firstNumber(record.assists, rawStats?.assists)

  return {
    matchId: record.matchId,
    region: firstString(record.region, rawSummary?.platformId) ?? 'UNKNOWN',
    queueId: firstNumber(record.queueId, rawSummary?.queueId),
    ...(firstString(record.queueName, rawSummary?.queueName) ? { queueName: firstString(record.queueName, rawSummary?.queueName) ?? undefined } : {}),
    ...(firstString(record.gameMode, rawSummary?.gameMode) ? { gameMode: firstString(record.gameMode, rawSummary?.gameMode) ?? undefined } : {}),
    gameVersion: firstString(record.gameVersion, rawSummary?.gameVersion),
    gameCreation: firstNumber(record.gameCreation, rawSummary?.gameCreation),
    gameDuration: firstNumber(record.gameDuration, rawSummary?.gameDuration),
    championId: firstNumber(record.championId, rawCurrentParticipant?.championId),
    win: firstBoolean(record.win, rawStats?.win),
    kills,
    deaths,
    assists,
    kda: calculateKda(kills, deaths, assists)
  }
}

async function countAvailableMatchDetails(
  records: MatchRecord[],
  database: SnapshotDatabase,
  accountPuuid: string
): Promise<number> {
  let count = 0

  for (const record of records) {
    try {
      const result = await database.getMatchDetail(record.region, record.matchId)
      if (!result.success) {
        console.warn(`Failed to read local match detail ${record.matchId}:`, result.error)
        continue
      }

      if (result.data && buildDetailDigest(result.data, accountPuuid)) {
        count += 1
      }
    } catch (error) {
      console.warn(`Failed to read local match detail ${record.matchId}:`, error)
    }
  }

  return count
}

function buildDetailDigest(detail: MatchDetail, accountPuuid: string): AiMatchDetailDigest | null {
  const parsed = parseJsonObject(detail.rawDetailJson, `match detail ${detail.matchId}`)
  if (!parsed) {
    return null
  }

  const participants = Array.isArray(parsed.participants) ? parsed.participants.filter(isRecord) : []
  const teamIds = new Set<number>()
  for (const participant of participants) {
    const teamId = firstNumber(participant.teamId)
    if (teamId !== null) {
      teamIds.add(teamId)
    }
  }

  const digest: AiMatchDetailDigest = {
    participantCount: participants.length,
    teamCount: teamIds.size
  }
  const currentParticipant = findCurrentParticipant(parsed, accountPuuid)
  if (currentParticipant) {
    const stats = isRecord(currentParticipant.stats) ? currentParticipant.stats : null
    const timeline = isRecord(currentParticipant.timeline) ? currentParticipant.timeline : null
    const visionScoreLike = sumNumbers(
      stats?.visionScore,
      stats?.visionWardsBoughtInGame,
      stats?.wardsPlaced,
      stats?.wardsKilled
    )

    digest.currentPlayer = {
      ...(firstNumber(currentParticipant.championId) !== null ? { championId: firstNumber(currentParticipant.championId) ?? undefined } : {}),
      ...(firstNumber(currentParticipant.teamId) !== null ? { teamId: firstNumber(currentParticipant.teamId) ?? undefined } : {}),
      ...(firstString(timeline?.lane) ? { lane: firstString(timeline?.lane) ?? undefined } : {}),
      ...(firstString(timeline?.role) ? { role: firstString(timeline?.role) ?? undefined } : {}),
      ...(firstNumber(stats?.totalDamageDealtToChampions) !== null ? { totalDamageDealtToChampions: firstNumber(stats?.totalDamageDealtToChampions) ?? undefined } : {}),
      ...(firstNumber(stats?.totalDamageTaken) !== null ? { totalDamageTaken: firstNumber(stats?.totalDamageTaken) ?? undefined } : {}),
      ...(firstNumber(stats?.goldEarned) !== null ? { goldEarned: firstNumber(stats?.goldEarned) ?? undefined } : {}),
      visionScoreLike
    }
  }

  return digest
}

function buildAggregate(matches: AiMatchSummary[]): AiAnalysisInputSnapshot['aggregate'] {
  const wins = matches.filter(match => match.win === true).length
  const losses = matches.filter(match => match.win === false).length

  return {
    totalMatches: matches.length,
    wins,
    losses,
    winRate: calculateRate(wins, wins + losses),
    averageKills: average(matches.map(match => match.kills)),
    averageDeaths: average(matches.map(match => match.deaths)),
    averageAssists: average(matches.map(match => match.assists)),
    averageKda: average(matches.map(match => match.kda)),
    mostPlayedChampions: buildChampionBreakdown(matches),
    queueBreakdown: buildQueueBreakdown(matches),
    recentTrend: buildRecentTrend(matches)
  }
}

function buildChampionBreakdown(matches: AiMatchSummary[]): AiAnalysisInputSnapshot['aggregate']['mostPlayedChampions'] {
  const breakdown = new Map<number, { championId: number, games: number, wins: number, losses: number }>()

  for (const match of matches) {
    if (match.championId === null || match.championId === undefined) {
      continue
    }

    const existing = breakdown.get(match.championId) ?? {
      championId: match.championId,
      games: 0,
      wins: 0,
      losses: 0
    }
    existing.games += 1
    if (match.win === true) {
      existing.wins += 1
    } else if (match.win === false) {
      existing.losses += 1
    }
    breakdown.set(match.championId, existing)
  }

  return Array.from(breakdown.values())
    .map(item => ({
      ...item,
      winRate: calculateRate(item.wins, item.wins + item.losses)
    }))
    .sort((left, right) => {
      if (right.games !== left.games) {
        return right.games - left.games
      }
      if (right.wins !== left.wins) {
        return right.wins - left.wins
      }
      return left.championId - right.championId
    })
    .slice(0, 5)
}

function buildQueueBreakdown(matches: AiMatchSummary[]): AiAnalysisInputSnapshot['aggregate']['queueBreakdown'] {
  const breakdown = new Map<string, {
    queueId: number | null
    queueName?: string
    games: number
    wins: number
    losses: number
  }>()

  for (const match of matches) {
    const key = String(match.queueId ?? 'null')
    const existing = breakdown.get(key) ?? {
      queueId: match.queueId,
      ...(match.queueName ? { queueName: match.queueName } : {}),
      games: 0,
      wins: 0,
      losses: 0
    }
    if (!existing.queueName && match.queueName) {
      existing.queueName = match.queueName
    }
    existing.games += 1
    if (match.win === true) {
      existing.wins += 1
    } else if (match.win === false) {
      existing.losses += 1
    }
    breakdown.set(key, existing)
  }

  return Array.from(breakdown.values())
    .map(item => ({
      ...item,
      winRate: calculateRate(item.wins, item.wins + item.losses)
    }))
    .sort((left, right) => {
      if (right.games !== left.games) {
        return right.games - left.games
      }
      return (left.queueId ?? Number.MAX_SAFE_INTEGER) - (right.queueId ?? Number.MAX_SAFE_INTEGER)
    })
}

function buildRecentTrend(matches: AiMatchSummary[]): AiAnalysisInputSnapshot['aggregate']['recentTrend'] {
  const latestTen = matches.slice(0, 10)
  const last10Wins = latestTen.filter(match => match.win === true).length
  const last10Losses = latestTen.filter(match => match.win === false).length
  const firstOutcome = matches[0]?.win

  if (firstOutcome !== true && firstOutcome !== false) {
    return {
      last10Wins,
      last10Losses,
      currentStreakType: 'none',
      currentStreakCount: 0
    }
  }

  let currentStreakCount = 0
  for (const match of matches) {
    if (match.win !== firstOutcome) {
      break
    }
    currentStreakCount += 1
  }

  return {
    last10Wins,
    last10Losses,
    currentStreakType: firstOutcome ? 'win' : 'loss',
    currentStreakCount
  }
}

function calculateKda(kills: number | null, deaths: number | null, assists: number | null): number | null {
  if (kills === null || deaths === null || assists === null) {
    return null
  }

  if (deaths === 0) {
    return roundMetric(kills + assists)
  }

  return roundMetric((kills + assists) / deaths)
}

function calculateRate(count: number, total: number): number | null {
  if (total <= 0) {
    return null
  }

  return roundMetric(count / total)
}

function average(values: Array<number | null | undefined>): number | null {
  const usable = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (!usable.length) {
    return null
  }

  return roundMetric(usable.reduce((sum, value) => sum + value, 0) / usable.length)
}

function roundMetric(value: number): number {
  return Number(value.toFixed(3))
}

function parseJsonObject(value: string, label: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown
    return isRecord(parsed) ? parsed : null
  } catch (error) {
    console.warn(`Skipping malformed local ${label} JSON:`, error)
    return null
  }
}

function findCurrentParticipant(rawMatch: Record<string, unknown> | null, accountPuuid: string): Record<string, unknown> | null {
  if (!rawMatch) {
    return null
  }

  const identities = Array.isArray(rawMatch.participantIdentities)
    ? rawMatch.participantIdentities.filter(isRecord)
    : []
  const currentIdentity = identities.find(identity => {
    const player = isRecord(identity.player) ? identity.player : null
    return firstString(player?.puuid) === accountPuuid
  })
  const participantId = firstNumber(currentIdentity?.participantId)
  if (participantId === null) {
    return null
  }

  const participants = Array.isArray(rawMatch.participants)
    ? rawMatch.participants.filter(isRecord)
    : []
  return participants.find(participant => firstNumber(participant.participantId) === participantId) ?? null
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }

  return null
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return null
}

function firstBoolean(...values: unknown[]): boolean | null {
  for (const value of values) {
    if (typeof value === 'boolean') {
      return value
    }
    if (value === 1) {
      return true
    }
    if (value === 0) {
      return false
    }
  }

  return null
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function sumNumbers(...values: unknown[]): number | null {
  const numbers = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (!numbers.length) {
    return null
  }

  return numbers.reduce((sum, value) => sum + value, 0)
}

function toStableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toStableJsonValue)
  }

  if (!isRecord(value)) {
    return value
  }

  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((stable, key) => {
      const childValue = value[key]
      if (childValue !== undefined) {
        stable[key] = toStableJsonValue(childValue)
      }
      return stable
    }, {})
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_LIMIT
  }

  return Math.max(0, Math.floor(value))
}

function normalizeOffset(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_OFFSET
  }

  return Math.max(0, Math.floor(value))
}

function getRendererDatabase(): SnapshotDatabase | null {
  if (typeof window === 'undefined') {
    return null
  }

  return window.electronAPI?.database ?? null
}
