import type { Lobby, QueueInfo, SessionData, SessionSummoner, Summoner } from '../types/api.ts'
import { GAME_MODE_OPTIONS } from '../utils/constants.ts'

export const GAMEFLOW_SESSION_REFRESH_PHASES = ['ChampSelect', 'GameStart', 'InProgress'] as const
export const GAMEFLOW_LOBBY_DISPLAY_PHASES = ['Lobby', 'Matchmaking', 'ReadyCheck'] as const
export const GAMEFLOW_SESSION_CLEAR_PHASES = ['Lobby', 'Matchmaking', 'ReadyCheck', 'None', 'EndOfGame', 'WaitingForStats'] as const
export const GAMEFLOW_AUTO_GAMING_ROUTE_PHASES = ['ChampSelect', 'GameStart'] as const
export const GAMEFLOW_POSTGAME_NAVIGATION_PHASES = ['EndOfGame', 'WaitingForStats'] as const
export const GAMEFLOW_POSTGAME_NAVIGATION_LOG_PHASES = GAMEFLOW_POSTGAME_NAVIGATION_PHASES
export const GAMEFLOW_ACTIVE_TRANSITION_PHASES = ['GameStart', 'InProgress'] as const

export function createEmptyGamingSessionData(phase = ''): SessionData {
  return {
    phase,
    sessionKey: undefined,
    empty: true,
    stale: false,
    queueType: '',
    typeCn: '',
    queueId: 0,
    teamOne: [],
    teamTwo: []
  }
}

export function isGameflowSessionRefreshPhase(phase: string): boolean {
  return (GAMEFLOW_SESSION_REFRESH_PHASES as readonly string[]).includes(phase)
}

export function isGameflowLobbyDisplayPhase(phase: string): boolean {
  return (GAMEFLOW_LOBBY_DISPLAY_PHASES as readonly string[]).includes(phase)
}

export function isGameflowSessionClearPhase(phase: string): boolean {
  return (GAMEFLOW_SESSION_CLEAR_PHASES as readonly string[]).includes(phase)
}

export function isGameflowActiveTransitionPhase(phase: string): boolean {
  return (GAMEFLOW_ACTIVE_TRANSITION_PHASES as readonly string[]).includes(phase)
}

export function isGameflowAutoGamingRoutePhase(phase: string): boolean {
  return (GAMEFLOW_AUTO_GAMING_ROUTE_PHASES as readonly string[]).includes(phase)
}

export function isGameflowPostgameNavigationPhase(phase: string): boolean {
  return (GAMEFLOW_POSTGAME_NAVIGATION_PHASES as readonly string[]).includes(phase)
}

export function isPostgameNavigationLogPhase(phase: string): boolean {
  return isGameflowPostgameNavigationPhase(phase)
}

export function resolveLobbyQueueId(lobby: Lobby | null | undefined): number {
  const queueId = normalizePositiveInteger(lobby?.queueId)
  if (queueId > 0) {
    return queueId
  }

  return normalizePositiveInteger(lobby?.gameConfig?.queueId)
}

export function formatLobbyQueueName(lobby: Lobby | null | undefined): string {
  const queueId = resolveLobbyQueueId(lobby)
  const option = GAME_MODE_OPTIONS.find((mode) => mode.value === queueId)
  if (option?.label) {
    return option.label
  }

  const gameMode = lobby?.gameConfig?.gameMode?.trim()
  return gameMode || ''
}

export function buildLobbySessionSummoners(
  lobby: Lobby | null | undefined,
  currentSummoner: Summoner | null | undefined
): SessionSummoner[] {
  if (!Array.isArray(lobby?.members)) {
    return []
  }

  return lobby.members.map((member) => ({
    championId: 0,
    championKey: '',
    summoner: resolveLobbyMemberSummoner(member, currentSummoner),
    matchHistory: [],
    userTag: null,
    rank: createEmptyRank(),
    meetGames: [],
    preGroupMarkers: { name: '', type: '' },
    isLoading: false
  }))
}

export function buildLobbyDisplaySessionSummoners(
  lobby: Lobby | null | undefined,
  currentSummoner: Summoner | null | undefined,
  lobbySessionData: SessionData | null | undefined
): SessionSummoner[] {
  if (hasComputedLobbySessionSummoners(lobbySessionData)) {
    return lobbySessionData.teamOne
  }

  return buildLobbySessionSummoners(lobby, currentSummoner)
}

export interface GameflowPhaseTransitionTracker {
  readonly currentPhase: string
  shouldHandlePhase: (phase: string) => boolean
  reset: (phase?: string) => void
}

export function createGameflowPhaseTransitionTracker(initialPhase = ''): GameflowPhaseTransitionTracker {
  let currentPhase = initialPhase

  return {
    get currentPhase() {
      return currentPhase
    },

    shouldHandlePhase(phase: string) {
      if (phase === currentPhase) {
        return false
      }
      currentPhase = phase
      return true
    },

    reset(phase = '') {
      currentPhase = phase
    }
  }
}

export interface GamingSessionDataState {
  readonly sessionData: SessionData
  readonly currentRequestId: number
  readonly lastSessionKey: string
  beginFetch: () => number
  isCurrentRequest: (requestId: number) => boolean
  applyFetchedData: (requestId: number, data: SessionData) => boolean
  applyFetchFailure: (requestId: number, phase: string) => boolean
  clearForPhase: (phase: string) => SessionData
}

export function createGamingSessionDataState(
  initialSessionData: SessionData = createEmptyGamingSessionData()
): GamingSessionDataState {
  let sessionData = initialSessionData
  let currentRequestId = 0
  let lastSessionKey = shouldDisplaySessionData(initialSessionData) ? resolveSessionKey(initialSessionData) : ''

  return {
    get sessionData() {
      return sessionData
    },

    get currentRequestId() {
      return currentRequestId
    },

    get lastSessionKey() {
      return lastSessionKey
    },

    beginFetch() {
      currentRequestId += 1
      return currentRequestId
    },

    isCurrentRequest(requestId: number) {
      return requestId === currentRequestId
    },

    applyFetchedData(requestId: number, data: SessionData) {
      if (requestId !== currentRequestId) {
        return false
      }
      if (!shouldDisplaySessionData(data)) {
        if (shouldRetainActiveSessionData(data, sessionData)) {
          sessionData = {
            ...sessionData,
            phase: data.phase || sessionData.phase,
            source: data.source ?? sessionData.source,
            updatedAt: data.updatedAt ?? sessionData.updatedAt,
            empty: false,
            stale: false
          }
          return true
        }

        sessionData = {
          ...createEmptyGamingSessionData(data.phase || sessionData.phase),
          source: data.source,
          stale: data.stale === true,
          empty: data.empty === true || data.stale === true
        }
        lastSessionKey = ''
        return true
      }

      const nextSessionKey = resolveSessionKey(data)
      sessionData = {
        ...data,
        sessionKey: nextSessionKey || data.sessionKey,
        empty: false,
        stale: false
      }
      lastSessionKey = nextSessionKey
      return true
    },

    applyFetchFailure(requestId: number, phase: string) {
      if (requestId !== currentRequestId) {
        return false
      }
      sessionData = createEmptyGamingSessionData(phase)
      lastSessionKey = ''
      return true
    },

    clearForPhase(phase: string) {
      currentRequestId += 1
      sessionData = createEmptyGamingSessionData(phase)
      lastSessionKey = ''
      return sessionData
    }
  }
}

function shouldDisplaySessionData(data: SessionData): boolean {
  if (data.stale === true || data.empty === true) {
    return false
  }
  return hasPlayers(data.teamOne) || hasPlayers(data.teamTwo)
}

function shouldRetainActiveSessionData(incoming: SessionData, current: SessionData): boolean {
  const incomingPhase = incoming.phase || ''
  const currentPhase = current.phase || ''
  return Boolean(
    incoming.stale !== true &&
      isGameflowActiveTransitionPhase(incomingPhase) &&
      shouldDisplaySessionData(current) &&
      !isGameflowSessionClearPhase(currentPhase)
  )
}

function hasPlayers(players: SessionData['teamOne']): boolean {
  return Array.isArray(players) && players.length > 0
}

function hasComputedLobbySessionSummoners(
  data: SessionData | null | undefined
): data is SessionData & { teamOne: SessionSummoner[] } {
  return Boolean(
    data != null &&
      isGameflowLobbyDisplayPhase(data.phase) &&
      data.stale !== true &&
      data.empty !== true &&
      hasPlayers(data.teamOne)
  )
}

function resolveSessionKey(data: SessionData): string {
  const explicitKey = data.sessionKey?.trim()
  if (explicitKey) {
    return explicitKey
  }

  const matchId = data.matchId?.trim()
  if (matchId) {
    return `match:${matchId}`
  }

  const playerParts = [
    ...playerFingerprints('ally', data.teamOne || []),
    ...playerFingerprints('enemy', data.teamTwo || [])
  ].sort()

  if (playerParts.length === 0) {
    return ''
  }

  return [
    `phase:${data.phase || ''}`,
    `game:${data.gameId ?? ''}`,
    `queue:${data.queueId ?? 0}`,
    `me:${data.currentSummoner?.puuid || ''}`,
    ...playerParts
  ].join('|')
}

function playerFingerprints(side: string, players: SessionData['teamOne']): string[] {
  return players.map((player, index) => {
    const puuid = player.summoner?.puuid?.trim()
    const summonerId = player.summoner?.summonerId
    const riotId = [player.summoner?.gameName?.trim(), player.summoner?.tagLine?.trim()].filter(Boolean).join('#')
    const identity = puuid || (summonerId ? `summoner:${summonerId}` : riotId) || `slot:${index}`
    return `${side}:${identity}:champion:${player.championId ?? 0}`
  })
}

function normalizePositiveInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }
  return value > 0 ? Math.trunc(value) : 0
}

function resolveLobbyMemberSummoner(member: Lobby['members'][number], currentSummoner: Summoner | null | undefined): Summoner {
  if (isCurrentSummoner(member, currentSummoner)) {
    return currentSummoner
  }

  return {
    gameName: member.summonerName?.trim() || '',
    tagLine: '',
    summonerLevel: 0,
    profileIconId: 0,
    puuid: member.puuid || '',
    summonerId: member.summonerId || 0
  }
}

function isCurrentSummoner(member: Lobby['members'][number], currentSummoner: Summoner | null | undefined): currentSummoner is Summoner {
  if (!currentSummoner) {
    return false
  }
  if (member.puuid && currentSummoner.puuid && member.puuid === currentSummoner.puuid) {
    return true
  }
  return Boolean(member.summonerId && currentSummoner.summonerId && member.summonerId === currentSummoner.summonerId)
}

function createEmptyRank() {
  return {
    queueMap: {
      RANKED_SOLO_5x5: createUnrankedQueueInfo('RANKED_SOLO_5x5'),
      RANKED_FLEX_SR: createUnrankedQueueInfo('RANKED_FLEX_SR')
    }
  }
}

function createUnrankedQueueInfo(queueType: string): QueueInfo {
  return {
    queueType,
    tier: 'UNRANKED',
    division: '',
    leaguePoints: 0,
    wins: 0,
    losses: 0,
    highestTier: '',
    highestDivision: '',
    isProvisional: false
  }
}
