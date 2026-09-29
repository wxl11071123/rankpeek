import type { SessionData, SessionSummoner } from '@/types/api'
import type { GamingAiAnalysisMode } from './gamingAiAnalysisPreview.ts'
import { isGamingAiAnalysisEnabledQueue } from './gamingAiQueue.ts'

const REQUIRED_TEAM_SIZE = 5
const COMPLETED_RECORD_STATUSES = new Set(['NORMAL', 'PRIVATE', 'EMPTY', 'ERROR'])

export function isGamingAiAnalysisReady(input: {
  mode: GamingAiAnalysisMode
  sessionData: SessionData
}): boolean {
  if (!isGamingAiAnalysisEnabledQueue(input.sessionData)) {
    return false
  }
  if (!isPregameAnalysisPhase(input.sessionData.phase)) {
    return false
  }

  const players = input.mode === 'opponent'
    ? input.sessionData.teamTwo ?? []
    : input.sessionData.teamOne ?? []

  return players.length === REQUIRED_TEAM_SIZE && players.every(isPlayerReadComplete)
}

function isPregameAnalysisPhase(phase: string | undefined): boolean {
  return phase === 'ChampSelect' || phase === 'GameStart' || phase === 'InProgress'
}

function isPlayerReadComplete(player: SessionSummoner): boolean {
  if (player.isLoading === true) {
    return false
  }
  if (!hasPlayerIdentity(player)) {
    return false
  }
  if (!player.userTag) {
    return false
  }
  const recordStatus = player.userTag.recordStatus
  return !recordStatus || COMPLETED_RECORD_STATUSES.has(recordStatus)
}

function hasPlayerIdentity(player: SessionSummoner): boolean {
  const summoner = player.summoner
  return Boolean(
    readNonEmptyString(summoner?.puuid) ||
    readNonEmptyString(summoner?.gameName)
  )
}

function readNonEmptyString(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''
}
