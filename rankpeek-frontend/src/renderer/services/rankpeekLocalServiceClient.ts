export const DEFAULT_RANKPEEK_LOCAL_SERVICE_BASE_URL = 'http://127.0.0.1:8080'

export const RANKPEEK_LOCAL_SERVICE_BASE_URL = normalizeRankPeekLocalServiceBaseUrl(
  import.meta.env?.VITE_RANKPEEK_LOCAL_SERVICE_BASE_URL
)

export function normalizeRankPeekLocalServiceBaseUrl(value: string | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed) {
    return DEFAULT_RANKPEEK_LOCAL_SERVICE_BASE_URL
  }
  return trimmed.replace(/\/+$/, '')
}

export interface LocalApiResponse<T> {
  success?: boolean
  code?: number
  message?: string
  data?: T
  error?: {
    code?: string
    message?: string
  } | null
}

export async function parseLocalJson<T>(response: Response): Promise<LocalApiResponse<T>> {
  try {
    return await response.json() as LocalApiResponse<T>
  } catch {
    return {}
  }
}
