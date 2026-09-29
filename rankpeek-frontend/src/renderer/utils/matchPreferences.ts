import { apiClient } from '@/api/httpClient'
import { QUEUE_ID } from './constants'

export const DEFAULT_ANALYSIS_QUEUE_MODE = QUEUE_ID.SOLO_5X5
const DEFAULT_MATCH_QUEUE_MODE_CONFIG_KEY = 'settings.match.defaultQueueMode'
const DEFAULT_QUEUE_MODE_MIGRATION_KEY = 'rankpeek.migration.defaultQueueMode.v1'
const LEGACY_DEFAULT_QUEUE_MODE_KEYS = [
  'rankpeek.settings.match.defaultQueueMode',
  'rankpeek.match.defaultQueueMode',
  'rankpeek.defaultMatchQueueMode',
  'settings.match.defaultQueueMode',
  'defaultQueueMode'
] as const

const VALID_MATCH_QUEUE_MODES = new Set<number>([
  0,
  QUEUE_ID.SOLO_5X5,
  QUEUE_ID.FLEX_SR,
  QUEUE_ID.NORMAL,
  QUEUE_ID.ARAM,
  QUEUE_ID.HEXTECH_ARAM
])

let cachedDefaultMatchQueueMode: number | null = null
let pendingDefaultMatchQueueMode: Promise<number> | null = null

export function normalizeMatchQueueMode(value: unknown): number {
  const rawValue = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number.parseInt(value, 10)
      : Number.NaN

  return VALID_MATCH_QUEUE_MODES.has(rawValue) ? rawValue : 0
}

export async function getDefaultMatchQueueMode(forceReload = false): Promise<number> {
  if (!forceReload && cachedDefaultMatchQueueMode != null) {
    return cachedDefaultMatchQueueMode
  }

  if (!forceReload && pendingDefaultMatchQueueMode) {
    return pendingDefaultMatchQueueMode
  }

  pendingDefaultMatchQueueMode = (async () => {
    try {
      const value = await apiClient.getConfigValue(DEFAULT_MATCH_QUEUE_MODE_CONFIG_KEY)
      cachedDefaultMatchQueueMode = await migrateLegacyDefaultQueueMode(value) ?? normalizeMatchQueueMode(value)
    } catch (error) {
      console.warn('Failed to load default match queue mode, fallback to all modes', error)
      cachedDefaultMatchQueueMode = 0
    } finally {
      pendingDefaultMatchQueueMode = null
    }

    return cachedDefaultMatchQueueMode
  })()

  return pendingDefaultMatchQueueMode
}

export function setCachedDefaultMatchQueueMode(value: unknown): number {
  cachedDefaultMatchQueueMode = normalizeMatchQueueMode(value)
  markDefaultQueueModeMigrationDone()
  return cachedDefaultMatchQueueMode
}

async function migrateLegacyDefaultQueueMode(serverValue: unknown): Promise<number | null> {
  if (typeof localStorage === 'undefined') {
    return null
  }

  if (localStorage.getItem(DEFAULT_QUEUE_MODE_MIGRATION_KEY) === 'done') {
    return null
  }

  const serverMode = normalizeMatchQueueMode(serverValue)
  if (serverMode !== 0) {
    return null
  }

  const legacyMode = readLegacyDefaultQueueMode()
  if (legacyMode == null || legacyMode === 0) {
    return null
  }

  try {
    // Older builds kept this preference only in localStorage. Because the first
    // user-store schema cannot distinguish an untouched 0 from an explicit 0,
    // migrate only non-default legacy values while the server still reports 0.
    await apiClient.setConfig(DEFAULT_MATCH_QUEUE_MODE_CONFIG_KEY, legacyMode)
    markDefaultQueueModeMigrationDone()
    return legacyMode
  } catch (error) {
    console.warn('Failed to migrate legacy default match queue mode', error)
    return null
  }
}

function markDefaultQueueModeMigrationDone() {
  if (typeof localStorage === 'undefined') {
    return
  }

  localStorage.setItem(DEFAULT_QUEUE_MODE_MIGRATION_KEY, 'done')
}

function readLegacyDefaultQueueMode(): number | null {
  if (typeof localStorage === 'undefined') {
    return null
  }

  for (const key of LEGACY_DEFAULT_QUEUE_MODE_KEYS) {
    const rawValue = localStorage.getItem(key)
    if (rawValue == null) {
      continue
    }

    const queueMode = parseStoredQueueMode(rawValue)
    if (queueMode != null) {
      return queueMode
    }
  }

  return null
}

function parseStoredQueueMode(rawValue: string): number | null {
  const trimmed = rawValue.trim()
  if (!trimmed) {
    return null
  }

  const parsedValue = parseJsonValue(trimmed)
  return toValidMatchQueueMode(parsedValue)
}

function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function toValidMatchQueueMode(value: unknown): number | null {
  if (typeof value === 'number') {
    return VALID_MATCH_QUEUE_MODES.has(value) ? value : null
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    return VALID_MATCH_QUEUE_MODES.has(parsed) ? parsed : null
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return toValidMatchQueueMode(record.value)
      ?? toValidMatchQueueMode(record.defaultQueueMode)
      ?? toValidMatchQueueMode((record.settings as Record<string, unknown> | undefined)?.match)
  }

  return null
}
