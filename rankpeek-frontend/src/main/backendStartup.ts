import { randomUUID } from 'crypto'

const BACKEND_HEALTH_URL = 'http://127.0.0.1:8080/actuator/health'
const BACKEND_IDENTITY_URL = 'http://127.0.0.1:8080/api/v1/system/identity'
const DEFAULT_MAX_RETRIES = 30
const DEFAULT_RETRY_INTERVAL_MS = 500

type FetchLike = (url: string) => Promise<Response>

interface BackendWaitOptions {
  expectedInstanceId?: string | null
  fetchImpl?: FetchLike
  maxRetries?: number
  retryIntervalMs?: number
  sleep?: (milliseconds: number) => Promise<void>
  log?: (message: string) => void
}

export class BackendIdentityMismatchError extends Error {
  constructor(expectedInstanceId: string, actualInstanceId: string | null) {
    super(
      actualInstanceId
        ? `another RankPeek backend is already running on port 8080 (instanceId=${actualInstanceId})`
        : 'another RankPeek backend is already running on port 8080'
    )
    this.name = 'BackendIdentityMismatchError'
    Object.setPrototypeOf(this, BackendIdentityMismatchError.prototype)
    this.expectedInstanceId = expectedInstanceId
    this.actualInstanceId = actualInstanceId
  }

  readonly expectedInstanceId: string
  readonly actualInstanceId: string | null
}

export function createBackendInstanceId() {
  return randomUUID()
}

export async function waitForBackend(options: BackendWaitOptions = {}): Promise<void> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
  const retryIntervalMs = options.retryIntervalMs ?? DEFAULT_RETRY_INTERVAL_MS
  const fetchImpl = options.fetchImpl ?? fetch
  const sleep = options.sleep ?? defaultSleep
  const expectedInstanceId = options.expectedInstanceId?.trim() || null

  for (let index = 0; index < maxRetries; index += 1) {
    try {
      const response = await fetchImpl(BACKEND_HEALTH_URL)
      if (response.ok) {
        if (!expectedInstanceId) {
          options.log?.('Backend is ready')
          return
        }

        const identity = await fetchBackendIdentity(fetchImpl)
        if (identity.instanceId === expectedInstanceId) {
          options.log?.('Backend is ready')
          return
        }

        throw new BackendIdentityMismatchError(expectedInstanceId, identity.instanceId)
      }
    } catch (error) {
      if (error instanceof BackendIdentityMismatchError) {
        throw error
      }
      // Keep waiting until the backend answers.
    }

    await sleep(retryIntervalMs)
  }

  throw new Error('Backend failed to start within timeout')
}

export async function fetchBackendIdentity(fetchImpl: FetchLike = fetch) {
  const response = await fetchImpl(BACKEND_IDENTITY_URL)
  if (!response.ok) {
    return { instanceId: null }
  }

  try {
    return {
      instanceId: readInstanceId(await response.json())
    }
  } catch {
    return { instanceId: null }
  }
}

function readInstanceId(payload: unknown): string | null {
  const identity = unwrapApiResponse(payload)
  if (!isRecord(identity) || typeof identity.instanceId !== 'string') {
    return null
  }

  const instanceId = identity.instanceId.trim()
  return instanceId.length > 0 ? instanceId : null
}

function unwrapApiResponse(payload: unknown): unknown {
  if (!isRecord(payload) || !('data' in payload)) {
    return payload
  }

  return payload.data
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function defaultSleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}
