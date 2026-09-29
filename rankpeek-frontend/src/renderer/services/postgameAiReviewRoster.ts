import type { PostgameAiReviewRosterPlayer } from './postgameAiStructuredResult.ts'

export interface PostgameAiReviewRosterBuildPlayer {
  participantId?: number | null
  teamId?: number | null
  championId?: number | null
  puuid?: string | null
  isCurrentPlayer?: boolean | null
  teamPosition?: string | null
  individualPosition?: string | null
  selectedPosition?: string | null
  lane?: string | null
  role?: string | null
  timeline?: {
    teamPosition?: string | null
    lane?: string | null
    role?: string | null
  } | null
}

export interface BuildPostgameAiReviewRosterPlayersParams {
  players: PostgameAiReviewRosterBuildPlayer[]
  currentPuuid?: string | null
  championNamesById?: Record<number, string>
  getChampionIconUrl?: (championId: number) => string
}

export function buildPostgameAiReviewRosterPlayers(
  params: BuildPostgameAiReviewRosterPlayersParams
): PostgameAiReviewRosterPlayer[] {
  const currentPuuid = params.currentPuuid?.trim() ?? ''
  const currentPlayer = params.players.find(player => (
    player.isCurrentPlayer === true ||
    Boolean(currentPuuid && player.puuid?.trim() === currentPuuid)
  ))
  const currentTeamId = normalizeTeamId(currentPlayer?.teamId)

  return params.players.map(player => {
    const championId = normalizePositiveInteger(player.championId)
    const championName = readChampionName(championId, params.championNamesById)
    const side = formatSideLabel(normalizeTeamId(player.teamId), currentTeamId)
    const role = formatRoleLabel(player)
    const isSelf = player.isCurrentPlayer === true || Boolean(currentPuuid && player.puuid?.trim() === currentPuuid)
    const playerRef = `${isSelf ? '你｜' : ''}${side}${role}｜${championName}`
    return {
      playerRef,
      championName,
      championId,
      side,
      role,
      isSelf,
      ...(championId !== null && params.getChampionIconUrl ? { iconUrl: params.getChampionIconUrl(championId) } : {})
    }
  })
}

function readChampionName(championId: number | null, championNamesById: Record<number, string> = {}): string {
  if (championId === null) {
    return '未知英雄'
  }
  return championNamesById[championId]?.trim() || `英雄${championId}`
}

function formatSideLabel(teamId: number | null, currentTeamId: number | null): string {
  if (currentTeamId === null) {
    return teamId === 100 ? '蓝方' : '红方'
  }
  return teamId === currentTeamId ? '我方' : '敌方'
}

function formatRoleLabel(player: PostgameAiReviewRosterBuildPlayer): string {
  const value = normalizeRoleText(firstText(
    player.teamPosition,
    player.timeline?.teamPosition,
    player.individualPosition,
    player.selectedPosition,
    player.timeline?.lane,
    player.timeline?.role,
    player.lane,
    player.role
  ))
  if (value === 'TOP') {
    return '上单'
  }
  if (value === 'JUNGLE') {
    return '打野'
  }
  if (value === 'MIDDLE' || value === 'MID') {
    return '中单'
  }
  if (value === 'BOTTOM' || value === 'ADC') {
    return '下路'
  }
  if (value === 'UTILITY' || value === 'SUPPORT') {
    return '辅助'
  }
  return '未知位置'
}

function firstText(...values: Array<string | null | undefined>): string {
  return values.find(value => typeof value === 'string' && value.trim().length > 0)?.trim() ?? ''
}

function normalizeRoleText(value: string): string {
  return value.trim().toUpperCase()
}

function normalizeTeamId(value: unknown): number | null {
  const numberValue = normalizeFiniteNumber(value)
  return numberValue === 100 || numberValue === 200 ? numberValue : null
}

function normalizePositiveInteger(value: unknown): number | null {
  const numberValue = normalizeFiniteNumber(value)
  return numberValue !== null && Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null
}

function normalizeFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
