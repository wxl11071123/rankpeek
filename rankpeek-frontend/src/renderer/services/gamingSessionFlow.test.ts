import test from 'node:test'
import assert from 'node:assert/strict'
import type { SessionData } from '../types/api.ts'
import {
  createGameflowPhaseTransitionTracker,
  createEmptyGamingSessionData,
  createGamingSessionDataState,
  buildLobbyDisplaySessionSummoners,
  buildLobbySessionSummoners,
  formatLobbyQueueName,
  isGameflowLobbyDisplayPhase,
  isGameflowAutoGamingRoutePhase,
  isGameflowPostgameNavigationPhase,
  isGameflowSessionClearPhase,
  isGameflowSessionRefreshPhase,
  resolveLobbyQueueId
} from './gamingSessionFlow.ts'

function session(phase: string, playerName: string, sessionKey = `${phase}:${playerName}`): SessionData {
  return {
    phase,
    queueType: '',
    typeCn: 'ranked',
    queueId: 420,
    sessionKey,
    empty: false,
    stale: false,
    teamOne: [
      {
        championId: 1,
        championKey: 'Annie',
        summoner: {
          gameName: playerName,
          tagLine: 'NA1',
          summonerLevel: 30,
          profileIconId: 1,
          puuid: `${playerName}-puuid`,
          summonerId: 1
        },
        matchHistory: [],
        rank: { queueMap: {} as any },
        meetGames: [],
        preGroupMarkers: {} as any,
        isLoading: false
      }
    ],
    teamTwo: []
  }
}

test('gameflow phase policy refreshes only scout-active phases requested for this pass', () => {
  assert.equal(isGameflowSessionRefreshPhase('ChampSelect'), true)
  assert.equal(isGameflowSessionRefreshPhase('GameStart'), true)
  assert.equal(isGameflowSessionRefreshPhase('InProgress'), true)
  assert.equal(isGameflowSessionRefreshPhase('Lobby'), false)
  assert.equal(isGameflowSessionRefreshPhase('EndOfGame'), false)
})

test('gameflow phase policy routes only champ select and game start to gaming view', () => {
  assert.equal(isGameflowAutoGamingRoutePhase('ChampSelect'), true)
  assert.equal(isGameflowAutoGamingRoutePhase('GameStart'), true)
  assert.equal(isGameflowAutoGamingRoutePhase('InProgress'), false)
  assert.equal(isGameflowAutoGamingRoutePhase('Lobby'), false)
  assert.equal(isGameflowAutoGamingRoutePhase('EndOfGame'), false)
})

test('gameflow phase policy routes postgame phases to match history detail', () => {
  assert.equal(isGameflowPostgameNavigationPhase('EndOfGame'), true)
  assert.equal(isGameflowPostgameNavigationPhase('WaitingForStats'), true)
  assert.equal(isGameflowPostgameNavigationPhase('GameStart'), false)
  assert.equal(isGameflowPostgameNavigationPhase('InProgress'), false)
  assert.equal(isGameflowPostgameNavigationPhase('Lobby'), false)
})

test('gameflow phase policy clears lobby and post-game phases', () => {
  assert.equal(isGameflowSessionClearPhase('Lobby'), true)
  assert.equal(isGameflowSessionClearPhase('Matchmaking'), true)
  assert.equal(isGameflowSessionClearPhase('ReadyCheck'), true)
  assert.equal(isGameflowSessionClearPhase('None'), true)
  assert.equal(isGameflowSessionClearPhase('EndOfGame'), true)
  assert.equal(isGameflowSessionClearPhase('WaitingForStats'), true)
  assert.equal(isGameflowSessionClearPhase('ChampSelect'), false)
})

test('gameflow phase policy displays lobby data through matchmaking and ready check', () => {
  assert.equal(isGameflowLobbyDisplayPhase('Lobby'), true)
  assert.equal(isGameflowLobbyDisplayPhase('Matchmaking'), true)
  assert.equal(isGameflowLobbyDisplayPhase('ReadyCheck'), true)
  assert.equal(isGameflowLobbyDisplayPhase('ChampSelect'), false)
  assert.equal(isGameflowLobbyDisplayPhase('EndOfGame'), false)
})

test('gameflow phase transition tracker handles only changed phases', () => {
  const tracker = createGameflowPhaseTransitionTracker()

  assert.equal(tracker.shouldHandlePhase('ChampSelect'), true)
  assert.equal(tracker.currentPhase, 'ChampSelect')
  assert.equal(tracker.shouldHandlePhase('ChampSelect'), false)
  assert.equal(tracker.shouldHandlePhase('InProgress'), true)
  assert.equal(tracker.currentPhase, 'InProgress')
  assert.equal(tracker.shouldHandlePhase('InProgress'), false)
  assert.equal(tracker.shouldHandlePhase('Lobby'), true)
})

test('lobby queue label uses lobby game config without creating active session teams', () => {
  const lobby = {
    lobbyId: '',
    queueId: undefined as unknown as number,
    gameConfig: {
      queueId: 2400,
      gameMode: 'KIWI',
      isCustom: false
    },
    members: [
      {
        puuid: 'my-puuid',
        summonerName: '',
        summonerId: 1,
        isLeader: true,
        ready: true,
        teamId: 0
      }
    ]
  }

  assert.equal(resolveLobbyQueueId(lobby), 2400)
  assert.equal(formatLobbyQueueName(lobby), '海克斯大乱斗')
})

test('lobby members become temporary player cards using current summoner identity', () => {
  const lobby = {
    lobbyId: '',
    queueId: undefined as unknown as number,
    gameConfig: {
      queueId: 2400,
      gameMode: 'KIWI',
      isCustom: false
    },
    members: [
      {
        puuid: 'my-puuid',
        summonerName: '',
        summonerId: 1,
        isLeader: true,
        ready: true,
        teamId: 0
      }
    ]
  }

  const players = buildLobbySessionSummoners(lobby, {
    gameName: '练习两年半的ikun',
    tagLine: '58092',
    summonerLevel: 392,
    profileIconId: 4655,
    puuid: 'my-puuid',
    summonerId: 1
  })

  assert.equal(players.length, 1)
  assert.equal(players[0]?.summoner.gameName, '练习两年半的ikun')
  assert.equal(players[0]?.summoner.tagLine, '58092')
  assert.equal(players[0]?.summoner.profileIconId, 4655)
  assert.equal(players[0]?.championId, 0)
  assert.equal(players[0]?.rank.queueMap.RANKED_SOLO_5x5.tier, 'UNRANKED')
  assert.equal(players[0]?.preGroupMarkers.name, '')
})

test('lobby display players prefer computed session data over temporary lobby cards', () => {
  const lobby = {
    lobbyId: '',
    queueId: 2400,
    gameConfig: {
      queueId: 2400,
      gameMode: 'KIWI',
      isCustom: false
    },
    members: [
      {
        puuid: 'player-puuid',
        summonerName: 'temporary-name',
        summonerId: 1,
        isLeader: true,
        ready: true,
        teamId: 0
      }
    ]
  }

  const computedSession: SessionData = {
    ...createEmptyGamingSessionData('Lobby'),
    empty: false,
    stale: false,
    queueId: 2400,
    teamOne: [
      {
        championId: 0,
        championKey: '',
        summoner: {
          gameName: 'computed-name',
          tagLine: 'CN1',
          summonerLevel: 400,
          profileIconId: 22,
          puuid: 'player-puuid',
          summonerId: 1
        },
        matchHistory: [{ gameId: 1, queueId: 2400 } as any],
        userTag: {
          recordStatus: 'NORMAL',
          recentData: {
            kda: 4,
            kills: 8,
            deaths: 2,
            assists: 8,
            selectMode: 2400,
            selectModeCn: '娴峰厠鏂ぇ涔辨枟',
            selectWins: 12,
            selectLosses: 8,
            groupRate: 0,
            averageGold: 12000,
            goldRate: 0,
            averageDamageDealtToChampions: 24000,
            damageDealtToChampionsRate: 0,
            friendAndDispute: {
              friendsRate: 0,
              disputeRate: 0,
              friendsSummoner: [],
              disputeSummoner: []
            }
          },
          tag: [{ tagName: '楂樿儨鐜?', good: true }]
        },
        rank: { queueMap: {} as any },
        meetGames: [],
        preGroupMarkers: { name: '', type: '' },
        isLoading: false
      }
    ],
    teamTwo: []
  }

  const players = buildLobbyDisplaySessionSummoners(lobby, null, computedSession)

  assert.equal(players.length, 1)
  assert.equal(players[0]?.summoner.gameName, 'computed-name')
  assert.equal(players[0]?.userTag?.recentData.selectWins, 12)
  assert.equal(players[0]?.matchHistory.length, 1)
})

test('lobby display players prefer computed session data during matchmaking', () => {
  const lobby = {
    lobbyId: '',
    queueId: 2400,
    gameConfig: {
      queueId: 2400,
      gameMode: 'KIWI',
      isCustom: false
    },
    members: [
      {
        puuid: 'player-puuid',
        summonerName: 'temporary-name',
        summonerId: 1,
        isLeader: true,
        ready: true,
        teamId: 0
      }
    ]
  }

  const computedSession: SessionData = {
    ...session('Matchmaking', 'computed-name'),
    source: 'LOBBY',
    queueId: 2400
  }

  const players = buildLobbyDisplaySessionSummoners(lobby, null, computedSession)

  assert.equal(players.length, 1)
  assert.equal(players[0]?.summoner.gameName, 'computed-name')
})

test('lobby display players fall back to temporary lobby cards when computed data is empty', () => {
  const lobby = {
    lobbyId: '',
    queueId: 2400,
    gameConfig: {
      queueId: 2400,
      gameMode: 'KIWI',
      isCustom: false
    },
    members: [
      {
        puuid: 'my-puuid',
        summonerName: '',
        summonerId: 1,
        isLeader: true,
        ready: true,
        teamId: 0
      }
    ]
  }

  const players = buildLobbyDisplaySessionSummoners(lobby, {
    gameName: '缁冧範涓ゅ勾鍗婄殑ikun',
    tagLine: '58092',
    summonerLevel: 392,
    profileIconId: 4655,
    puuid: 'my-puuid',
    summonerId: 1
  }, createEmptyGamingSessionData('Lobby'))

  assert.equal(players.length, 1)
  assert.equal(players[0]?.summoner.gameName, '缁冧範涓ゅ勾鍗婄殑ikun')
  assert.equal(players[0]?.userTag, null)
  assert.equal(players[0]?.matchHistory.length, 0)
})

test('clearing from old session data removes stale teams while preserving current phase', () => {
  const state = createGamingSessionDataState(session('InProgress', 'old-player'))

  state.clearForPhase('Lobby')

  assert.deepEqual(state.sessionData, createEmptyGamingSessionData('Lobby'))
  assert.equal(state.sessionData.teamOne.length, 0)
  assert.equal(state.sessionData.teamTwo.length, 0)
  assert.equal(state.lastSessionKey, '')
})

test('fetch failure clears previous teams instead of keeping the last match', () => {
  const state = createGamingSessionDataState(session('InProgress', 'old-player'))
  const requestId = state.beginFetch()

  const applied = state.applyFetchFailure(requestId, 'ChampSelect')

  assert.equal(applied, true)
  assert.equal(state.sessionData.phase, 'ChampSelect')
  assert.equal(state.sessionData.teamOne.length, 0)
  assert.equal(state.sessionData.teamTwo.length, 0)
  assert.equal(state.lastSessionKey, '')
})

test('stale fetched session data clears previous teams instead of showing old players', () => {
  const state = createGamingSessionDataState(session('InProgress', 'old-player', 'old-key'))
  const requestId = state.beginFetch()

  const applied = state.applyFetchedData(requestId, {
    ...session('InProgress', 'stale-player', 'stale-key'),
    stale: true
  })

  assert.equal(applied, true)
  assert.equal(state.sessionData.phase, 'InProgress')
  assert.equal(state.sessionData.teamOne.length, 0)
  assert.equal(state.sessionData.teamTwo.length, 0)
  assert.equal(state.sessionData.stale, true)
  assert.equal(state.lastSessionKey, '')
})

test('empty fetched session data clears previous teams and invalidates the session key', () => {
  const state = createGamingSessionDataState(session('ChampSelect', 'old-player', 'old-key'))
  const requestId = state.beginFetch()

  const applied = state.applyFetchedData(requestId, {
    ...createEmptyGamingSessionData('ChampSelect'),
    empty: true
  })

  assert.equal(applied, true)
  assert.equal(state.sessionData.phase, 'ChampSelect')
  assert.equal(state.sessionData.teamOne.length, 0)
  assert.equal(state.sessionData.teamTwo.length, 0)
  assert.equal(state.sessionData.empty, true)
  assert.equal(state.lastSessionKey, '')
})

test('transient GameStart empty payload preserves previous active scout teams', () => {
  const state = createGamingSessionDataState(session('ChampSelect', 'old-player', 'old-key'))
  const requestId = state.beginFetch()

  const applied = state.applyFetchedData(requestId, {
    ...createEmptyGamingSessionData('GameStart'),
    source: 'GAMESTART_TRANSIENT_EMPTY',
    updatedAt: 1234,
    empty: true
  })

  assert.equal(applied, true)
  assert.equal(state.sessionData.phase, 'GameStart')
  assert.equal(state.sessionData.source, 'GAMESTART_TRANSIENT_EMPTY')
  assert.equal(state.sessionData.updatedAt, 1234)
  assert.equal(state.sessionData.empty, false)
  assert.equal(state.sessionData.stale, false)
  assert.equal(state.sessionData.teamOne.length, 1)
  assert.equal(state.sessionData.teamOne[0]?.summoner.gameName, 'old-player')
  assert.equal(state.sessionData.sessionKey, 'old-key')
  assert.equal(state.lastSessionKey, 'old-key')
})

test('transient InProgress empty payload preserves previous active scout teams', () => {
  const state = createGamingSessionDataState(session('ChampSelect', 'old-player', 'old-key'))
  const requestId = state.beginFetch()

  const applied = state.applyFetchedData(requestId, {
    ...createEmptyGamingSessionData('InProgress'),
    source: 'GAME_SESSION_EMPTY',
    empty: true
  })

  assert.equal(applied, true)
  assert.equal(state.sessionData.phase, 'InProgress')
  assert.equal(state.sessionData.source, 'GAME_SESSION_EMPTY')
  assert.equal(state.sessionData.empty, false)
  assert.equal(state.sessionData.teamOne[0]?.summoner.gameName, 'old-player')
  assert.equal(state.lastSessionKey, 'old-key')
})

test('empty clear-phase payloads still clear previous active scout teams', () => {
  for (const phase of ['Lobby', 'Matchmaking', 'ReadyCheck', 'None', 'EndOfGame', 'WaitingForStats']) {
    const state = createGamingSessionDataState(session('ChampSelect', 'old-player', 'old-key'))
    const requestId = state.beginFetch()

    const applied = state.applyFetchedData(requestId, {
      ...createEmptyGamingSessionData(phase),
      source: `${phase}_EMPTY`,
      empty: true
    })

    assert.equal(applied, true)
    assert.equal(state.sessionData.phase, phase)
    assert.equal(state.sessionData.teamOne.length, 0)
    assert.equal(state.sessionData.teamTwo.length, 0)
    assert.equal(state.sessionData.empty, true)
    assert.equal(state.lastSessionKey, '')
  }
})

test('session key changes replace previous session data normally', () => {
  const state = createGamingSessionDataState(session('ChampSelect', 'old-player', 'old-key'))
  const requestId = state.beginFetch()

  const applied = state.applyFetchedData(requestId, session('ChampSelect', 'new-player', 'new-key'))

  assert.equal(applied, true)
  assert.equal(state.sessionData.sessionKey, 'new-key')
  assert.equal(state.lastSessionKey, 'new-key')
  assert.equal(state.sessionData.teamOne[0]?.summoner.gameName, 'new-player')
})

test('late old fetch responses cannot overwrite a newer cleared state', () => {
  const state = createGamingSessionDataState(session('InProgress', 'old-player'))
  const oldRequestId = state.beginFetch()

  state.clearForPhase('EndOfGame')
  const applied = state.applyFetchedData(oldRequestId, session('InProgress', 'late-old-player'))

  assert.equal(applied, false)
  assert.deepEqual(state.sessionData, createEmptyGamingSessionData('EndOfGame'))
})

test('late old fetch responses cannot overwrite newer fetched session data', () => {
  const state = createGamingSessionDataState(session('InProgress', 'old-player'))
  const oldRequestId = state.beginFetch()
  const newRequestId = state.beginFetch()

  assert.equal(state.applyFetchedData(newRequestId, session('ChampSelect', 'new-player')), true)
  assert.equal(state.applyFetchedData(oldRequestId, session('InProgress', 'late-old-player')), false)

  assert.equal(state.sessionData.phase, 'ChampSelect')
  assert.equal(state.sessionData.teamOne[0]?.summoner.gameName, 'new-player')
})
