import type {
  GameDetail,
  GameParticipant,
  GameParticipantIdentity
} from '../types/api'
import { maskSummonerName } from './privacyMode.ts'

export interface MatchDetailParticipant extends GameParticipant {
  puuid: string
  gameName: string
  tagLine: string
  summonerName: string
  displayName: string
  isCurrentPlayer: boolean
}

export interface TeamStatsSummary {
  kills: number
  deaths: number
  assists: number
  goldEarned: number
  totalDamageDealtToChampions: number
  totalDamageTaken: number
  totalHeal: number
  creepScore: number
  wardsPlaced: number
  wardsKilled: number
  visionWardsBoughtInGame: number
  damageDealtToTurrets: number
}

export function getCurrentParticipant(
  gameDetail: GameDetail | null | undefined,
  currentPuuid: string | null | undefined
): MatchDetailParticipant | null {
  const normalizedPuuid = currentPuuid?.trim()
  if (!gameDetail || !normalizedPuuid) {
    return null
  }

  const identity = gameDetail.participantIdentities.find(
    item => item.player?.puuid === normalizedPuuid
  )
  if (!identity) {
    return null
  }

  const participant = gameDetail.participants.find(
    item => item.participantId === identity.participantId
  )
  if (!participant) {
    return null
  }

  return toParticipantWithIdentity(participant, identity, normalizedPuuid)
}

export function getParticipantDisplayName(
  identity: GameParticipantIdentity | null | undefined,
  fallbackParticipantId?: number
): string {
  const gameName = identity?.player?.gameName?.trim()
  const tagLine = identity?.player?.tagLine?.trim()
  let name: string
  if (gameName) {
    name = tagLine ? `${gameName}#${tagLine}` : gameName
  } else {
    const summonerName = identity?.player?.summonerName?.trim()
    if (summonerName) {
      name = summonerName
    } else {
      name = fallbackParticipantId ? `Unknown Player ${fallbackParticipantId}` : 'Unknown Player'
    }
  }
  return maskSummonerName(name, identity?.player?.puuid)
}

export function getTeamParticipants(
  gameDetail: GameDetail | null | undefined,
  teamId: number,
  currentPuuid?: string | null
): MatchDetailParticipant[] {
  if (!gameDetail) {
    return []
  }

  const normalizedPuuid = currentPuuid?.trim() ?? ''
  return gameDetail.participants
    .filter(participant => participant.teamId === teamId)
    .map(participant => {
      const identity = gameDetail.participantIdentities.find(
        item => item.participantId === participant.participantId
      )
      return toParticipantWithIdentity(participant, identity, normalizedPuuid)
    })
}

export function calculateKda(kills?: number | null, deaths?: number | null, assists?: number | null): number {
  const safeKills = toFiniteNumber(kills) ?? 0
  const safeDeaths = toFiniteNumber(deaths) ?? 0
  const safeAssists = toFiniteNumber(assists) ?? 0
  const value = safeDeaths === 0 ? safeKills + safeAssists : (safeKills + safeAssists) / safeDeaths
  return Math.round(value * 10) / 10
}

export function rankWithinTeam(
  players: MatchDetailParticipant[],
  metricGetter: (player: MatchDetailParticipant) => number | null | undefined,
  targetParticipantId: number | null | undefined
): number | null {
  if (targetParticipantId == null) {
    return null
  }

  const target = players.find(player => player.participantId === targetParticipantId)
  if (!target) {
    return null
  }

  const targetValue = toFiniteNumber(metricGetter(target))
  if (targetValue === null) {
    return null
  }

  const greaterValues = players
    .map(player => toFiniteNumber(metricGetter(player)))
    .filter((value): value is number => value !== null && value > targetValue)

  return greaterValues.length + 1
}

export function sumTeamStats(players: Array<Pick<MatchDetailParticipant, 'stats'>>): TeamStatsSummary {
  return players.reduce<TeamStatsSummary>((total, player) => {
    const stats = player.stats
    total.kills += toFiniteNumber(stats?.kills) ?? 0
    total.deaths += toFiniteNumber(stats?.deaths) ?? 0
    total.assists += toFiniteNumber(stats?.assists) ?? 0
    total.goldEarned += toFiniteNumber(stats?.goldEarned) ?? 0
    total.totalDamageDealtToChampions += toFiniteNumber(stats?.totalDamageDealtToChampions) ?? 0
    total.totalDamageTaken += toFiniteNumber(stats?.totalDamageTaken) ?? 0
    total.totalHeal += toFiniteNumber(stats?.totalHeal) ?? 0
    total.creepScore += getCreepScore(stats)
    total.wardsPlaced += toFiniteNumber(stats?.wardsPlaced) ?? 0
    total.wardsKilled += toFiniteNumber(stats?.wardsKilled) ?? 0
    total.visionWardsBoughtInGame += toFiniteNumber(stats?.visionWardsBoughtInGame) ?? 0
    total.damageDealtToTurrets += toFiniteNumber(stats?.damageDealtToTurrets) ?? 0
    return total
  }, emptyTeamStats())
}

export function formatNumber(value?: number | null): string {
  const safeValue = toFiniteNumber(value)
  if (safeValue === null) {
    return '--'
  }

  if (safeValue >= 1000000) {
    return `${(safeValue / 1000000).toFixed(1).replace(/\.0$/, '')}m`
  }

  if (safeValue >= 1000) {
    return `${(safeValue / 1000).toFixed(safeValue >= 10000 ? 1 : 2).replace(/\.0$/, '')}k`
  }

  return String(safeValue)
}

export function formatDuration(seconds?: number | null): string {
  const safeSeconds = toFiniteNumber(seconds)
  if (safeSeconds === null) {
    return '--'
  }

  const minutes = Math.floor(safeSeconds / 60)
  const remain = Math.floor(safeSeconds % 60)
  return `${minutes}:${String(remain).padStart(2, '0')}`
}

export function isCurrentParticipant(
  player: Pick<MatchDetailParticipant, 'puuid'> | null | undefined,
  currentPuuid: string | null | undefined
): boolean {
  const normalizedPuuid = currentPuuid?.trim()
  return Boolean(player?.puuid && normalizedPuuid && player.puuid === normalizedPuuid)
}

export function getCreepScore(stats: GameParticipant['stats'] | null | undefined): number {
  return (toFiniteNumber(stats?.minionsKilled) ?? toFiniteNumber(stats?.totalMinionsKilled) ?? 0)
    + (toFiniteNumber(stats?.neutralMinionsKilled) ?? 0)
}

function toParticipantWithIdentity(
  participant: GameParticipant,
  identity: GameParticipantIdentity | undefined,
  currentPuuid: string
): MatchDetailParticipant {
  const puuid = identity?.player?.puuid ?? ''
  return {
    ...participant,
    puuid,
    gameName: identity?.player?.gameName ?? '',
    tagLine: identity?.player?.tagLine ?? '',
    summonerName: identity?.player?.summonerName ?? '',
    displayName: getParticipantDisplayName(identity, participant.participantId),
    isCurrentPlayer: Boolean(puuid && currentPuuid && puuid === currentPuuid)
  }
}

function emptyTeamStats(): TeamStatsSummary {
  return {
    kills: 0,
    deaths: 0,
    assists: 0,
    goldEarned: 0,
    totalDamageDealtToChampions: 0,
    totalDamageTaken: 0,
    totalHeal: 0,
    creepScore: 0,
    wardsPlaced: 0,
    wardsKilled: 0,
    visionWardsBoughtInGame: 0,
    damageDealtToTurrets: 0
  }
}

function toFiniteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
