import type {
  AiAnalysisDeleteOptions,
  AiAnalysisDeleteResult,
  AiAnalysisListOptions,
  AiAnalysisResult,
  AiAnalysisResultInput,
  DatabaseResult
} from '../types/localDatabase'

const FALLBACK_SCHEMA_VERSION = 'rankpeek_ai_analysis_fallback_store.v2'
const FALLBACK_STORAGE_KEY = 'rankpeek.aiAnalysisResults.v2'
const FALLBACK_MAX_RECORDS = 200

export interface BrowserAiAnalysisStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface FallbackStore {
  schemaVersion: typeof FALLBACK_SCHEMA_VERSION
  nextId: number
  records: AiAnalysisResult[]
}

export function saveFallbackAiAnalysisResult(
  result: AiAnalysisResultInput,
  storage: BrowserAiAnalysisStorage | null | undefined = getBrowserStorage(),
  now: Date = new Date()
): DatabaseResult<AiAnalysisResult> {
  if (!storage) {
    return { success: false, error: 'Local database unavailable' }
  }

  try {
    const store = readFallbackStore(storage)
    const retainedRecords = applyFallbackRetention(store.records)
    const nextId = Math.max(store.nextId, ...retainedRecords.map(record => record.id + 1), 1)
    const timestamp = now.toISOString()
    const matchId = result.matchId ?? null
    const existingIndex = matchId
      ? retainedRecords.findIndex(record => (
        record.accountPuuid === result.accountPuuid
        && record.matchId === matchId
        && record.analysisType === result.analysisType
      ))
      : -1
    const saved: AiAnalysisResult = {
      id: existingIndex >= 0 ? retainedRecords[existingIndex].id : nextId,
      accountPuuid: result.accountPuuid,
      matchId,
      analysisType: result.analysisType,
      subjectKey: result.subjectKey ?? null,
      gameVersion: result.gameVersion ?? null,
      modelName: result.modelName ?? null,
      promptVersion: result.promptVersion ?? null,
      inputHash: result.inputHash ?? null,
      outputJson: stringifyOutputJson(result.outputJson),
      createdAt: timestamp,
      updatedAt: timestamp
    }
    const retainedWithoutExisting = existingIndex >= 0
      ? retainedRecords.filter((_record, index) => index !== existingIndex)
      : retainedRecords

    writeFallbackStore(storage, {
      schemaVersion: FALLBACK_SCHEMA_VERSION,
      nextId: existingIndex >= 0 ? store.nextId : nextId + 1,
      records: [saved, ...retainedWithoutExisting].slice(0, FALLBACK_MAX_RECORDS)
    })

    return { success: true, data: saved }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export function deleteFallbackAiAnalysisResultsByAccount(
  accountPuuid: string,
  options: AiAnalysisDeleteOptions | undefined = {},
  storage: BrowserAiAnalysisStorage | null | undefined = getBrowserStorage()
): DatabaseResult<AiAnalysisDeleteResult> {
  if (!storage) {
    return { success: false, error: 'Local database unavailable' }
  }

  try {
    const store = readFallbackStore(storage)
    const retainedRecords = applyFallbackRetention(store.records)
    const analysisTypes = normalizeStringList(options?.analysisTypes)
    const nextRecords = retainedRecords.filter(record => {
      if (record.accountPuuid !== accountPuuid) {
        return true
      }
      if (analysisTypes === null) {
        return false
      }
      return !analysisTypes.includes(record.analysisType)
    })
    writeFallbackStore(storage, {
      schemaVersion: FALLBACK_SCHEMA_VERSION,
      nextId: store.nextId,
      records: nextRecords
    })

    return {
      success: true,
      data: {
        deletedCount: retainedRecords.length - nextRecords.length
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export function listFallbackAiAnalysisResultsByAccount(
  accountPuuid: string,
  options: AiAnalysisListOptions | undefined = {},
  storage: BrowserAiAnalysisStorage | null | undefined = getBrowserStorage()
): DatabaseResult<AiAnalysisResult[]> {
  if (!storage) {
    return { success: false, error: 'Local database unavailable' }
  }

  try {
    const store = readFallbackStore(storage)
    const retainedRecords = applyFallbackRetention(store.records)
    if (retainedRecords.length !== store.records.length) {
      writeFallbackStore(storage, {
        schemaVersion: FALLBACK_SCHEMA_VERSION,
        nextId: store.nextId,
        records: retainedRecords
      })
    }

    const limit = normalizeLimit(options?.limit)
    const offset = normalizeOffset(options?.offset)
    const results = retainedRecords
      .filter(record => record.accountPuuid === accountPuuid)
      .filter(record => !options?.analysisType || record.analysisType === options.analysisType)
      .filter(record => !options?.analysisTypes || options.analysisTypes.includes(record.analysisType))
      .filter(record => !options?.matchId || record.matchId === options.matchId)
      .filter(record => !options?.matchIds || (record.matchId !== null && options.matchIds.includes(record.matchId)))
      .sort(compareAiAnalysisResultsDesc)
      .slice(offset, offset + limit)

    return { success: true, data: results }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

function getBrowserStorage(): BrowserAiAnalysisStorage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage
    }
  } catch {
    return null
  }

  return null
}

function readFallbackStore(storage: BrowserAiAnalysisStorage): FallbackStore {
  const raw = storage.getItem(FALLBACK_STORAGE_KEY)
  if (!raw) {
    return createEmptyStore()
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed) || parsed.schemaVersion !== FALLBACK_SCHEMA_VERSION) {
      return createEmptyStore()
    }

    return {
      schemaVersion: FALLBACK_SCHEMA_VERSION,
      nextId: normalizePositiveInteger(parsed.nextId, 1),
      records: Array.isArray(parsed.records)
        ? parsed.records.map(normalizeStoredRecord).filter((record): record is AiAnalysisResult => Boolean(record))
        : []
    }
  } catch {
    return createEmptyStore()
  }
}

function writeFallbackStore(storage: BrowserAiAnalysisStorage, store: FallbackStore): void {
  storage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(store))
}

function createEmptyStore(): FallbackStore {
  return {
    schemaVersion: FALLBACK_SCHEMA_VERSION,
    nextId: 1,
    records: []
  }
}

function applyFallbackRetention(records: AiAnalysisResult[]): AiAnalysisResult[] {
  return records.filter(record => (
    Number.isFinite(Date.parse(record.createdAt))
    && !isRankPeekServerMockAnalysisRecord(record)
  ))
}

function isRankPeekServerMockAnalysisRecord(record: AiAnalysisResult): boolean {
  return record.outputJson.includes('rankpeek-server mock')
    || record.outputJson.includes('RankPeek postgame mock stream started')
    || record.outputJson.includes('RankPeek mock stream started')
}

function normalizeStoredRecord(value: unknown): AiAnalysisResult | null {
  if (!isRecord(value)) {
    return null
  }

  const id = normalizePositiveInteger(value.id, 0)
  const accountPuuid = readString(value.accountPuuid)
  const analysisType = readString(value.analysisType)
  const outputJson = readString(value.outputJson)
  const createdAt = readString(value.createdAt)
  const updatedAt = readString(value.updatedAt)
  if (!id || !accountPuuid || !analysisType || !outputJson || !createdAt || !updatedAt) {
    return null
  }

  return {
    id,
    accountPuuid,
    matchId: readNullableString(value.matchId),
    analysisType,
    subjectKey: readNullableString(value.subjectKey),
    gameVersion: readNullableString(value.gameVersion),
    modelName: readNullableString(value.modelName),
    promptVersion: readNullableString(value.promptVersion),
    inputHash: readNullableString(value.inputHash),
    outputJson,
    createdAt,
    updatedAt
  }
}

function stringifyOutputJson(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function compareAiAnalysisResultsDesc(left: AiAnalysisResult, right: AiAnalysisResult): number {
  const timeDiff = Date.parse(right.createdAt) - Date.parse(left.createdAt)
  return timeDiff || right.id - left.id
}

function normalizeLimit(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 50
  }
  return Math.max(1, Math.min(Math.trunc(value), 200))
}

function normalizeOffset(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.trunc(value))
}

function normalizeStringList(values: string[] | undefined): string[] | null {
  if (!Array.isArray(values)) {
    return null
  }
  return [...new Set(values.map(value => value.trim()).filter(Boolean))]
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
