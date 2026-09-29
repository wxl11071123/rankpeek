import type {
  AiAnalysisResult,
  AiAnalysisResultInput,
  DatabaseResult,
  LocalDatabaseAPI
} from '../types/localDatabase'
import type { MatchHistory, Participant } from '../types/api'
import type { PostgameAiInputSnapshot, PostgameAiMode } from './postgameAiInputSnapshot.ts'
import type { PostgameAiReviewRosterPlayer } from './postgameAiStructuredResult.ts'
import {
  estimatePostgameAiTokenCostCny,
  type PostgameAiTokenCostEstimate,
  type PostgameAiTokenUsage
} from './postgameAiServerStream.ts'
import {
  saveFallbackAiAnalysisResult,
  type BrowserAiAnalysisStorage
} from './localAiAnalysisFallbackStore.ts'

export const POSTGAME_AI_RUN_OUTPUT_SCHEMA_VERSION = 'postgame_ai_run_output.v2'
const LEGACY_POSTGAME_AI_RUN_OUTPUT_SCHEMA_VERSION = 'postgame_ai_run_output.v1'

type AiAnalysisSaveDatabase = Pick<LocalDatabaseAPI, 'saveAnalysisResult'>
type ChampionNameLookup = Record<number, string> | Map<number, string>
type PostgameAiStoredAnalysisType = 'postgame_review' | 'postgame_praise'

export interface PostgameAiRunMatchMetadata {
  matchId: string
  queueId: number | null
  queueName: string | null
  championId: number | null
  championName: string | null
  win: boolean | null
  position: string | null
  kills: number | null
  deaths: number | null
  assists: number | null
  gameCreation: number | null
  gameDuration: number | null
}

export interface PostgameAiRunOutputV1 {
  schemaVersion: typeof POSTGAME_AI_RUN_OUTPUT_SCHEMA_VERSION
  analysisType: 'postgame'
  mode: PostgameAiMode
  rawOutputText: string
  completedAt: string
  usage: PostgameAiTokenUsage | null
  costCny: PostgameAiTokenCostEstimate | null
  streamState: 'completed'
  match: PostgameAiRunMatchMetadata
  rosterPlayers?: PostgameAiReviewRosterPlayer[]
}

export type PostgameAiRunOutputParseResult =
  | { status: 'parsed'; run: PostgameAiRunOutputV1 }
  | { status: 'unsupported' | 'invalid'; run: null; error?: string }

export interface CreatePostgameAiRunResultPayloadParams {
  accountPuuid: string
  mode: PostgameAiMode
  rawOutputText: string
  completedAt?: string
  usage?: PostgameAiTokenUsage | null
  snapshot: Pick<PostgameAiInputSnapshot, 'inputHash'>
  matchHistory: MatchHistory
  championNamesById?: ChampionNameLookup
  rosterPlayers?: PostgameAiReviewRosterPlayer[]
}

export interface SavePostgameAiRunResultToLocalParams extends CreatePostgameAiRunResultPayloadParams {
  database?: AiAnalysisSaveDatabase | null
  storage?: BrowserAiAnalysisStorage | null
}

export interface LocalPostgameAiRunSaveResult {
  success: boolean
  id?: number
  error?: string
}

export function createPostgameAiRunResultPayload({
  accountPuuid,
  mode,
  rawOutputText,
  completedAt,
  usage = null,
  snapshot,
  matchHistory,
  championNamesById,
  rosterPlayers = []
}: CreatePostgameAiRunResultPayloadParams): AiAnalysisResultInput {
  const runOutput: PostgameAiRunOutputV1 = {
    schemaVersion: POSTGAME_AI_RUN_OUTPUT_SCHEMA_VERSION,
    analysisType: 'postgame',
    mode,
    rawOutputText,
    completedAt: completedAt ?? new Date().toISOString(),
    usage,
    costCny: usage?.cost ?? null,
    streamState: 'completed',
    match: createMatchMetadata(matchHistory, accountPuuid, championNamesById),
    ...(mode === 'review' ? { rosterPlayers: normalizeRosterPlayersForStorage(rosterPlayers) } : {})
  }

  return {
    accountPuuid: accountPuuid.trim(),
    matchId: runOutput.match.matchId,
    analysisType: toStoredAnalysisType(mode),
    subjectKey: `postgame:${mode}`,
    gameVersion: null,
    modelName: usage?.model ?? null,
    promptVersion: mode === 'review' ? 'postgame_review_result.v1' : 'postgame_praise_result.v1',
    inputHash: snapshot.inputHash,
    outputJson: runOutput
  }
}

export async function savePostgameAiRunResultToLocal({
  database,
  storage,
  ...params
}: SavePostgameAiRunResultToLocalParams): Promise<LocalPostgameAiRunSaveResult> {
  if (!params.accountPuuid.trim()) {
    return { success: false, error: 'Missing accountPuuid' }
  }
  if (!params.rawOutputText.trim()) {
    return { success: false, error: 'Missing rawOutputText' }
  }
  if (!params.snapshot.inputHash.trim()) {
    return { success: false, error: 'Missing inputHash' }
  }
  const matchId = readFiniteNumber(params.matchHistory.gameId)?.toString() ?? ''
  if (!matchId) {
    return { success: false, error: 'Missing matchId' }
  }

  const payload = createPostgameAiRunResultPayload(params)
  const databaseApi = database ?? getRendererDatabase()
  if (!databaseApi) {
    const saved = saveFallbackAiAnalysisResult(payload, storage)
    const result = toSaveResult(saved)
    notifyLocalAiAnalysisSaved(result)
    return result
  }

  try {
    const saved = await databaseApi.saveAnalysisResult(payload)
    const result = toSaveResult(saved)
    if (result.success) {
      notifyLocalAiAnalysisSaved(result)
      return result
    }

    const fallbackResult = toSaveResult(saveFallbackAiAnalysisResult(payload, storage))
    notifyLocalAiAnalysisSaved(fallbackResult)
    return fallbackResult.success ? fallbackResult : result
  } catch (error) {
    const fallbackResult = toSaveResult(saveFallbackAiAnalysisResult(payload, storage))
    notifyLocalAiAnalysisSaved(fallbackResult)
    if (fallbackResult.success) {
      return fallbackResult
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

function notifyLocalAiAnalysisSaved(result: LocalPostgameAiRunSaveResult): void {
  if (!result.success || typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new Event('rankpeek:ai-analysis-result-saved'))
}

export function parsePostgameAiRunOutput(outputJson: string): PostgameAiRunOutputParseResult {
  try {
    const parsed = JSON.parse(outputJson) as unknown
    const run = normalizePostgameAiRunOutput(parsed)
    if (run) {
      return { status: 'parsed', run }
    }
    return { status: 'unsupported', run: null }
  } catch (error) {
    return {
      status: 'invalid',
      run: null,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export function normalizePostgameAiRunOutput(value: unknown): PostgameAiRunOutputV1 | null {
  const source = readRecord(value)
  if (!source || (
    source.schemaVersion !== POSTGAME_AI_RUN_OUTPUT_SCHEMA_VERSION
    && source.schemaVersion !== LEGACY_POSTGAME_AI_RUN_OUTPUT_SCHEMA_VERSION
  )) {
    return null
  }

  const mode = source.mode === 'praise' ? 'praise' : source.mode === 'review' ? 'review' : null
  const rawOutputText = readString(source.rawOutputText)
  const completedAt = readString(source.completedAt)
  const match = normalizeMatchMetadata(source.match)
  if (!mode || !rawOutputText || !completedAt || !match) {
    return null
  }

  const usage = normalizeTokenUsage(source.usage)
  return {
    schemaVersion: POSTGAME_AI_RUN_OUTPUT_SCHEMA_VERSION,
    analysisType: 'postgame',
    mode,
    rawOutputText,
    completedAt,
    usage,
    costCny: normalizeTokenCost(source.costCny) ?? usage?.cost ?? null,
    streamState: 'completed',
    match,
    rosterPlayers: normalizeRosterPlayersForStorage(readArray(source.rosterPlayers))
  }
}

function normalizeRosterPlayersForStorage(rawPlayers: unknown[]): PostgameAiReviewRosterPlayer[] {
  return rawPlayers
    .map(normalizeRosterPlayerForStorage)
    .filter((player): player is PostgameAiReviewRosterPlayer => Boolean(player))
}

function normalizeRosterPlayerForStorage(value: unknown): PostgameAiReviewRosterPlayer | null {
  const source = readRecord(value)
  if (!source) {
    return null
  }

  const playerRef = readString(source.playerRef)
  const championName = readString(source.championName)
  if (!playerRef || !championName) {
    return null
  }

  const championId = readNullableNumber(source.championId)
  return {
    playerRef,
    championName,
    championId,
    ...(readNullableString(source.side) ? { side: readNullableString(source.side) as string } : {}),
    ...(readNullableString(source.role) ? { role: readNullableString(source.role) as string } : {}),
    ...(typeof source.isSelf === 'boolean' ? { isSelf: source.isSelf } : {})
  }
}

function createMatchMetadata(
  matchHistory: MatchHistory,
  accountPuuid: string,
  championNamesById?: ChampionNameLookup
): PostgameAiRunMatchMetadata {
  const participant = findCurrentParticipant(matchHistory, accountPuuid.trim())
  const championId = readFiniteNumber(participant?.championId)
  const championName = championId === null ? null : readChampionName(championNamesById, championId)
  const stats = participant?.stats

  return {
    matchId: readFiniteNumber(matchHistory.gameId)?.toString() ?? '',
    queueId: readFiniteNumber(matchHistory.queueId),
    queueName: readNullableString(matchHistory.queueName),
    championId,
    championName,
    win: typeof stats?.win === 'boolean' ? stats.win : null,
    position: normalizePosition(participant),
    kills: readFiniteNumber(stats?.kills),
    deaths: readFiniteNumber(stats?.deaths),
    assists: readFiniteNumber(stats?.assists),
    gameCreation: readFiniteNumber(matchHistory.gameCreation),
    gameDuration: readFiniteNumber(matchHistory.gameDuration)
  }
}

function findCurrentParticipant(matchHistory: MatchHistory, accountPuuid: string): Participant | null {
  if (!accountPuuid) {
    return null
  }
  const identity = matchHistory.participantIdentities?.find(item => item.player?.puuid === accountPuuid)
  if (!identity) {
    return null
  }
  return matchHistory.participants?.find(participant => participant.participantId === identity.participantId) ?? null
}

function readChampionName(championNamesById: ChampionNameLookup | undefined, championId: number): string | null {
  if (!championNamesById) {
    return null
  }
  const name = championNamesById instanceof Map
    ? championNamesById.get(championId)
    : championNamesById[championId]
  return typeof name === 'string' && name.trim() ? name.trim() : null
}

function toStoredAnalysisType(mode: PostgameAiMode): PostgameAiStoredAnalysisType {
  return mode === 'praise' ? 'postgame_praise' : 'postgame_review'
}

function normalizeMatchMetadata(value: unknown): PostgameAiRunMatchMetadata | null {
  const source = readRecord(value)
  if (!source) {
    return null
  }
  const matchId = readNullableString(source.matchId)
  if (!matchId) {
    return null
  }

  return {
    matchId,
    queueId: readNullableNumber(source.queueId),
    queueName: readNullableString(source.queueName),
    championId: readNullableNumber(source.championId),
    championName: readNullableString(source.championName),
    win: typeof source.win === 'boolean' ? source.win : null,
    position: readNullableString(source.position),
    kills: readNullableNumber(source.kills),
    deaths: readNullableNumber(source.deaths),
    assists: readNullableNumber(source.assists),
    gameCreation: readNullableNumber(source.gameCreation),
    gameDuration: readNullableNumber(source.gameDuration)
  }
}

function normalizePosition(participant: Participant | null): string | null {
  const raw = readNullableString(participant?.teamPosition)
    || readNullableString(participant?.individualPosition)
    || readNullableString(participant?.selectedPosition)
    || readNullableString(participant?.lane)
    || readNullableString(participant?.role)
  if (!raw) {
    return null
  }

  const normalized = raw.trim().toUpperCase()
  if (!normalized || normalized === 'NONE' || normalized === 'UNKNOWN') {
    return null
  }

  return normalized
}

function normalizeTokenUsage(value: unknown): PostgameAiTokenUsage | null {
  const source = readRecord(value)
  if (!source) {
    return null
  }

  const rawUsage = {
    provider: readString(source.provider) || 'deepseek',
    model: readString(source.model) || 'deepseek-v4-flash',
    promptTokens: readNonNegativeInteger(source.promptTokens),
    completionTokens: readNonNegativeInteger(source.completionTokens),
    totalTokens: readNonNegativeInteger(source.totalTokens),
    promptCacheHitTokens: readNonNegativeInteger(source.promptCacheHitTokens),
    promptCacheMissTokens: readNonNegativeInteger(source.promptCacheMissTokens)
  }

  return {
    ...rawUsage,
    cost: normalizeTokenCost(source.cost) ?? estimatePostgameAiTokenCostCny(rawUsage)
  }
}

function normalizeTokenCost(value: unknown): PostgameAiTokenCostEstimate | null {
  const source = readRecord(value)
  const pricing = readRecord(source?.pricing)
  if (!source || !pricing || source.currency !== 'CNY') {
    return null
  }

  return {
    currency: 'CNY',
    inputCacheHitCny: readCurrencyNumber(source.inputCacheHitCny),
    inputCacheMissCny: readCurrencyNumber(source.inputCacheMissCny),
    outputCny: readCurrencyNumber(source.outputCny),
    totalCny: readCurrencyNumber(source.totalCny),
    pricing: {
      inputCacheHitCnyPerMillionTokens: readCurrencyNumber(pricing.inputCacheHitCnyPerMillionTokens),
      inputCacheMissCnyPerMillionTokens: readCurrencyNumber(pricing.inputCacheMissCnyPerMillionTokens),
      outputCnyPerMillionTokens: readCurrencyNumber(pricing.outputCnyPerMillionTokens)
    }
  }
}

function toSaveResult(result: DatabaseResult<AiAnalysisResult>): LocalPostgameAiRunSaveResult {
  if (!result.success) {
    return {
      success: false,
      error: result.error
    }
  }

  return {
    success: true,
    id: result.data.id
  }
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readNullableString(value: unknown): string | null {
  const text = readString(value)
  return text || null
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readNullableNumber(value: unknown): number | null {
  return readFiniteNumber(value)
}

function readNonNegativeInteger(value: unknown): number {
  const numberValue = readFiniteNumber(value)
  return numberValue !== null && numberValue > 0 ? Math.floor(numberValue) : 0
}

function readCurrencyNumber(value: unknown): number {
  const numberValue = readFiniteNumber(value)
  return numberValue !== null && numberValue > 0 ? numberValue : 0
}

function getRendererDatabase(): AiAnalysisSaveDatabase | null {
  if (typeof window === 'undefined') {
    return null
  }

  return window.electronAPI?.database ?? null
}
