import type { CacheClearFailure, CacheClearResult } from '../types/api.ts'

export interface CacheClearAlertMessages {
  cleared: string
  partial: string
  failed: string
}

export function buildCacheClearAlertMessage(
  result: CacheClearResult,
  messages: CacheClearAlertMessages
): string {
  const failed = result.failed || []
  if (result.success && failed.length === 0) {
    return messages.cleared
  }

  const details = formatFailures(failed) || result.message
  if ((result.cleared || []).length > 0) {
    return `${messages.partial}：${details}`
  }
  return `${messages.failed}：${details}`
}

export function extractCacheClearErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  if (typeof error === 'object' && error && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) {
      return message
    }
  }
  if (typeof error === 'string' && error.trim()) {
    return error
  }
  return ''
}

function formatFailures(failures: CacheClearFailure[]): string {
  return failures
    .map((failure) => {
      const name = failure.name || 'unknown'
      return failure.message ? `${name}: ${failure.message}` : name
    })
    .join('；')
}
