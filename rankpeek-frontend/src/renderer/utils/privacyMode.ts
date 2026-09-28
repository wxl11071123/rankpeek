const STORAGE_KEY = 'rankpeek.privacyMode'

let cached: boolean | null = null

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function isPrivacyEnabled(): boolean {
  if (cached === null) {
    cached = readStored()
  }
  return cached
}

export function refreshPrivacyMode(): boolean {
  cached = null
  return isPrivacyEnabled()
}

function hashPuuid(puuid: string): string {
  let hash = 0
  for (let i = 0; i < puuid.length; i++) {
    hash = ((hash << 5) - hash) + puuid.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36).slice(0, 4).toUpperCase()
}

export function maskSummonerName(displayName: string, puuid?: string | null): string {
  if (!isPrivacyEnabled()) {
    return displayName
  }
  if (!displayName) {
    return displayName
  }
  if (puuid) {
    return `召唤师_${hashPuuid(puuid)}`
  }
  if (displayName.includes('#')) {
    return `召唤师_${hashPuuid(displayName.split('#')[0])}`
  }
  return `召唤师_${hashPuuid(displayName)}`
}
