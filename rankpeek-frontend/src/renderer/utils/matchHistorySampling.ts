import type { MatchHistory } from '../types/api.ts'

export const MATCH_HISTORY_OVERVIEW_LOOKBACK_LIMIT = 50
export const RANKED_OVERVIEW_SAMPLE_LIMIT = 20
export const REMAKE_DURATION_THRESHOLD_SECONDS = 300

const RANKED_QUEUE_IDS = new Set<number>([420, 440])

export function selectRecentMatchLookback(
  matches: MatchHistory[],
  lookbackLimit = MATCH_HISTORY_OVERVIEW_LOOKBACK_LIMIT
): MatchHistory[] {
  if (!matches.length) {
    return []
  }

  return [...matches]
    .filter((match): match is MatchHistory => Boolean(match))
    .sort((left, right) => (right.gameCreation || 0) - (left.gameCreation || 0))
    .slice(0, Math.max(1, lookbackLimit))
}

export function selectRecentRankedSample(
  matches: MatchHistory[],
  sampleLimit = RANKED_OVERVIEW_SAMPLE_LIMIT
): MatchHistory[] {
  if (!matches.length) {
    return []
  }

  return [...matches]
    .filter(match => RANKED_QUEUE_IDS.has(match.queueId) && !isRemakeMatch(match))
    .sort((left, right) => (right.gameCreation || 0) - (left.gameCreation || 0))
    .slice(0, Math.max(1, sampleLimit))
}

export function isRemakeMatch(match: MatchHistory): boolean {
  return match.remake === true ||
    (match.gameDuration > 0 && match.gameDuration < REMAKE_DURATION_THRESHOLD_SECONDS)
}
