interface PlayerLike {
  puuid?: unknown
}

interface ParticipantIdentityLike {
  participantId?: unknown
  player?: PlayerLike | null
}

interface ParticipantLike {
  participantId?: unknown
  championId?: unknown
  stats?: unknown
}

interface MatchLike {
  participants?: unknown
  participantIdentities?: unknown
}

interface MatchRecordStatsLike {
  championId?: unknown
  win?: unknown
  kills?: unknown
  deaths?: unknown
  assists?: unknown
}

export function getParticipantByPuuid(match: MatchLike, puuid: string): ParticipantLike | null {
  if (!puuid || !Array.isArray(match.participantIdentities) || !Array.isArray(match.participants)) {
    return null
  }

  const identity = match.participantIdentities.find((item): item is ParticipantIdentityLike => (
    isRecord(item) && isRecord(item.player) && item.player.puuid === puuid
  ))
  if (!identity) {
    return null
  }

  return match.participants.find((participant): participant is ParticipantLike => (
    isRecord(participant) && participant.participantId === identity.participantId
  )) ?? null
}

export function hasPositiveChampionId(value: unknown): boolean {
  return isFiniteNumber(value) && value > 0
}

export function hasCompleteParticipantStats(stats: unknown): boolean {
  if (!isRecord(stats)) {
    return false
  }

  return typeof stats.win === 'boolean'
    && isFiniteNumber(stats.kills)
    && isFiniteNumber(stats.deaths)
    && isFiniteNumber(stats.assists)
}

export function isRenderableParticipant(participant: unknown): boolean {
  return isRecord(participant)
    && hasPositiveChampionId(participant.championId)
    && hasCompleteParticipantStats(participant.stats)
}

export function isRenderableMatchForPuuid(match: MatchLike, puuid: string): boolean {
  const participant = getParticipantByPuuid(match, puuid)
  return isRenderableParticipant(participant)
}

export function hasCompleteMatchRecordStats(record: MatchRecordStatsLike): boolean {
  return isBooleanLike(record.win)
    && isFiniteNumber(record.kills)
    && isFiniteNumber(record.deaths)
    && isFiniteNumber(record.assists)
}

export function hasCompleteMatchRecordSummary(record: MatchRecordStatsLike): boolean {
  return hasPositiveChampionId(record.championId) && hasCompleteMatchRecordStats(record)
}

function isBooleanLike(value: unknown): boolean {
  return typeof value === 'boolean' || value === 0 || value === 1
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
