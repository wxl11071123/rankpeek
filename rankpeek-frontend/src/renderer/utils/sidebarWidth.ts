export interface SidebarWidthStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const SIDEBAR_WIDTH_STORAGE_KEY = 'rankpeek.sidebarWidth'
export const DEFAULT_SIDEBAR_WIDTH = 252
export const MIN_SIDEBAR_WIDTH = 200
export const MAX_SIDEBAR_WIDTH = 340

export function clampSidebarWidth(width: number) {
  if (!Number.isFinite(width)) {
    return DEFAULT_SIDEBAR_WIDTH
  }

  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)))
}

export function parseStoredSidebarWidth(rawValue: string | null) {
  if (rawValue == null) {
    return DEFAULT_SIDEBAR_WIDTH
  }

  const parsedWidth = Number(rawValue)
  if (
    !Number.isFinite(parsedWidth)
    || parsedWidth < MIN_SIDEBAR_WIDTH
    || parsedWidth > MAX_SIDEBAR_WIDTH
  ) {
    return DEFAULT_SIDEBAR_WIDTH
  }

  return Math.round(parsedWidth)
}

export function calculateSidebarWidth(clientX: number, sidebarLeft: number) {
  return clampSidebarWidth(clientX - sidebarLeft)
}

export function loadSidebarWidth(storage = getSidebarWidthStorage()) {
  if (!storage) {
    return DEFAULT_SIDEBAR_WIDTH
  }

  try {
    return parseStoredSidebarWidth(storage.getItem(SIDEBAR_WIDTH_STORAGE_KEY))
  } catch {
    return DEFAULT_SIDEBAR_WIDTH
  }
}

export function saveSidebarWidth(width: number, storage = getSidebarWidthStorage()) {
  const normalizedWidth = clampSidebarWidth(width)

  if (!storage) {
    return normalizedWidth
  }

  try {
    storage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(normalizedWidth))
  } catch {
    // Ignore unavailable storage and keep the live layout width.
  }

  return normalizedWidth
}

function getSidebarWidthStorage(): SidebarWidthStorage | null {
  if (typeof localStorage === 'undefined') {
    return null
  }

  return localStorage
}
