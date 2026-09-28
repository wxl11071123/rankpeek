export type RankPeekFeedbackCategory = 'bug' | 'suggestion' | 'other'

export interface RankPeekFeedbackInput {
  message: string
  contact?: string
  category?: RankPeekFeedbackCategory
}

export interface RankPeekAppMetadata {
  appVersion: string
  platform: string
  locale: string
  installationId: string
}

export interface RankPeekFeedbackPayload {
  category: RankPeekFeedbackCategory
  contact: string
  message: string
  appVersion: string
  platform: string
  locale: string
  installationId: string
  logs?: Record<string, string>
}

export interface RankPeekFeedbackResult {
  id: string
  notificationQueued: boolean
}

export interface RankPeekAnnouncement {
  id: string
  title: string
  body: string
  level: 'info' | 'warning' | 'critical'
  linkUrl: string | null
  startsAt: string | null
  endsAt: string | null
  isUpdate?: boolean
  createdAt?: string
}

export interface RankPeekAnnouncementQuery {
  version: string
  platform: string
  locale: string
  channel?: string
}

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code?: string
    message?: string
  }
}

interface CloudClientOptions {
  baseUrl?: string
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  includeDismissedAnnouncements?: boolean
  limit?: number
}

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
const DEFAULT_CLOUD_API_BASE_URL = 'https://api.rankpeek.cn'
const INSTALLATION_ID_STORAGE_KEY = 'rankpeek.cloud.installationId'
const DISMISSED_ANNOUNCEMENTS_STORAGE_KEY = 'rankpeek.cloud.dismissedAnnouncements'
const READ_ANNOUNCEMENTS_STORAGE_KEY = 'rankpeek.cloud.readAnnouncements'

export const RANKPEEK_CLOUD_API_BASE_URL = normalizeCloudApiBaseUrl(
  viteEnv?.VITE_RANKPEEK_CLOUD_API_BASE_URL || DEFAULT_CLOUD_API_BASE_URL
)

export function normalizeCloudApiBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '')
  return normalized || DEFAULT_CLOUD_API_BASE_URL
}

export function buildRankPeekFeedbackPayload(
  input: RankPeekFeedbackInput,
  metadata: RankPeekAppMetadata,
  logs?: Record<string, string>
): RankPeekFeedbackPayload {
  const payload: RankPeekFeedbackPayload = {
    category: normalizeFeedbackCategory(input.category),
    contact: input.contact?.trim() || '',
    message: input.message.trim(),
    appVersion: metadata.appVersion.trim() || 'unknown',
    platform: metadata.platform.trim() || 'unknown',
    locale: metadata.locale.trim() || 'zh-CN',
    installationId: metadata.installationId.trim()
  }
  if (logs) {
    payload.logs = logs
  }
  return payload
}

export async function submitRankPeekFeedback(
  input: RankPeekFeedbackInput,
  metadata: RankPeekAppMetadata,
  logs?: Record<string, string>,
  options: CloudClientOptions = {}
): Promise<RankPeekFeedbackResult> {
  const response = await fetch(`${resolveBaseUrl(options)}/app/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(buildRankPeekFeedbackPayload(input, metadata, logs))
  })

  return readApiResponse<RankPeekFeedbackResult>(response)
}

export async function fetchRankPeekAnnouncements(
  query: RankPeekAnnouncementQuery,
  options: CloudClientOptions = {}
): Promise<RankPeekAnnouncement[]> {
  const params = buildAnnouncementQueryParams(query)

  try {
    const response = await fetch(`${resolveBaseUrl(options)}/app/announcements?${params.toString()}`, {
      method: 'GET'
    })
    const announcements = await readApiResponse<RankPeekAnnouncement[]>(response)
    if (options.includeDismissedAnnouncements) {
      return announcements
    }
    const storage = options.storage ?? getBrowserStorage()
    return announcements.filter(announcement => !isRankPeekAnnouncementDismissed(announcement.id, storage))
  } catch {
    return []
  }
}

export async function fetchRankPeekAnnouncementArchive(
  query: RankPeekAnnouncementQuery,
  options: CloudClientOptions = {}
): Promise<RankPeekAnnouncement[]> {
  const params = buildAnnouncementQueryParams(query)
  params.set('limit', String(normalizeLimit(options.limit, 20, 50)))

  try {
    const response = await fetch(`${resolveBaseUrl(options)}/app/announcements/archive?${params.toString()}`, {
      method: 'GET'
    })
    return readApiResponse<RankPeekAnnouncement[]>(response)
  } catch {
    return []
  }
}

export function getOrCreateCloudInstallationId(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = getBrowserStorage(),
  uuidFactory = createUuid
): string {
  const stored = storage?.getItem(INSTALLATION_ID_STORAGE_KEY)?.trim()
  if (stored) {
    return stored
  }

  const id = `rp-${uuidFactory()}`
  storage?.setItem(INSTALLATION_ID_STORAGE_KEY, id)
  return id
}

export function dismissRankPeekAnnouncement(
  id: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = getBrowserStorage()
): void {
  if (id === '__update__') return
  storeAnnouncementId(id, storage, DISMISSED_ANNOUNCEMENTS_STORAGE_KEY)
}

export function isRankPeekAnnouncementDismissed(
  id: string,
  storage: Pick<Storage, 'getItem'> | null = getBrowserStorage()
): boolean {
  if (id === '__update__') return false
  return readStoredAnnouncementIds(storage, DISMISSED_ANNOUNCEMENTS_STORAGE_KEY).has(id)
}

export function markRankPeekAnnouncementRead(
  id: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = getBrowserStorage()
): void {
  if (id === '__update__') return
  storeAnnouncementId(id, storage, READ_ANNOUNCEMENTS_STORAGE_KEY)
}

export function isRankPeekAnnouncementRead(
  id: string,
  storage: Pick<Storage, 'getItem'> | null = getBrowserStorage()
): boolean {
  if (id === '__update__') return false
  return readStoredAnnouncementIds(storage, READ_ANNOUNCEMENTS_STORAGE_KEY).has(id)
}

function buildAnnouncementQueryParams(query: RankPeekAnnouncementQuery): URLSearchParams {
  return new URLSearchParams({
    version: query.version,
    platform: query.platform,
    locale: query.locale,
    channel: query.channel || 'stable'
  })
}

function normalizeLimit(value: number | undefined, fallback: number, max: number): number {
  const numericValue = typeof value === 'number' ? value : Number.NaN
  if (!Number.isFinite(numericValue)) {
    return fallback
  }
  return Math.max(1, Math.min(max, Math.trunc(numericValue)))
}

function storeAnnouncementId(
  id: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
  storageKey: string
): void {
  const trimmedId = id.trim()
  if (!trimmedId) {
    return
  }

  const ids = readStoredAnnouncementIds(storage, storageKey)
  ids.add(trimmedId)
  storage?.setItem(storageKey, JSON.stringify(Array.from(ids).slice(-80)))
}

function readStoredAnnouncementIds(storage: Pick<Storage, 'getItem'> | null, storageKey: string): Set<string> {
  try {
    const raw = storage?.getItem(storageKey)
    const parsed = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : [])
  } catch {
    return new Set()
  }
}

async function readApiResponse<T>(response: Response): Promise<T> {
  let payload: ApiResponse<T> | null = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok || !payload?.success) {
    const message = payload?.error?.message || `RankPeek cloud request failed with status ${response.status}`
    throw new Error(message)
  }

  return payload.data as T
}

function normalizeFeedbackCategory(category?: RankPeekFeedbackCategory): RankPeekFeedbackCategory {
  return category === 'bug' || category === 'suggestion' || category === 'other' ? category : 'other'
}

function resolveBaseUrl(options: CloudClientOptions): string {
  return normalizeCloudApiBaseUrl(options.baseUrl || RANKPEEK_CLOUD_API_BASE_URL)
}

function getBrowserStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

function createUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
