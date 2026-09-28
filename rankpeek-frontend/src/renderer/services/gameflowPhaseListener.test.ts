import test from 'node:test'
import assert from 'node:assert/strict'
import type { GameState } from '../types/api.ts'
import { listenGameflowPhase, normalizeGameflowPhase } from './gameflowPhaseListener.ts'

function connectedState(phase = ''): GameState {
  return {
    connected: true,
    phase,
    summoner: null,
    timestamp: Date.now()
  }
}

test('normalizes known gameflow phase values', () => {
  assert.equal(normalizeGameflowPhase(' ChampSelect '), 'ChampSelect')
  assert.equal(normalizeGameflowPhase(''), '')
  assert.equal(normalizeGameflowPhase(null), '')
})

test('gameflow listener emits phase from websocket game-state payloads', async () => {
  const emitted: string[] = []
  const callbacks: Array<(state: GameState) => void> = []
  let fallbackCalls = 0

  listenGameflowPhase((phase) => emitted.push(phase), {
    connect: () => {},
    onGameState: (callback) => {
      callbacks.push(callback)
      return () => {}
    },
    getGamePhase: async () => {
      fallbackCalls += 1
      return 'None'
    },
    logger: { debug: () => {}, warn: () => {} }
  })

  callbacks[0](connectedState('ChampSelect'))
  await Promise.resolve()

  assert.deepEqual(emitted, ['ChampSelect'])
  assert.equal(fallbackCalls, 0)
})

test('gameflow listener fetches current phase when websocket payload omits phase', async () => {
  const emitted: string[] = []
  const callbacks: Array<(state: GameState) => void> = []
  let fallbackCalls = 0

  listenGameflowPhase((phase) => emitted.push(phase), {
    connect: () => {},
    onGameState: (callback) => {
      callbacks.push(callback)
      return () => {}
    },
    getGamePhase: async () => {
      fallbackCalls += 1
      return 'InProgress'
    },
    logger: { debug: () => {}, warn: () => {} }
  })

  callbacks[0](connectedState())
  await Promise.resolve()
  await Promise.resolve()

  assert.deepEqual(emitted, ['InProgress'])
  assert.equal(fallbackCalls, 1)
})

test('gameflow listener treats disconnected game-state as None', async () => {
  const emitted: string[] = []
  const callbacks: Array<(state: GameState) => void> = []

  listenGameflowPhase((phase) => emitted.push(phase), {
    connect: () => {},
    onGameState: (callback) => {
      callbacks.push(callback)
      return () => {}
    },
    getGamePhase: async () => 'InProgress',
    logger: { debug: () => {}, warn: () => {} }
  })

  callbacks[0]({ ...connectedState('ChampSelect'), connected: false })
  await Promise.resolve()

  assert.deepEqual(emitted, ['None'])
})

test('gameflow listener ignores late fallback phase lookups after a newer state arrives', async () => {
  const emitted: string[] = []
  const callbacks: Array<(state: GameState) => void> = []
  const oldPhaseLookup: { resolve?: (phase: string) => void } = {}

  listenGameflowPhase((phase) => emitted.push(phase), {
    connect: () => {},
    onGameState: (callback) => {
      callbacks.push(callback)
      return () => {}
    },
    getGamePhase: () => new Promise<string>((resolve) => {
      oldPhaseLookup.resolve = resolve
    }),
    logger: { debug: () => {}, warn: () => {} }
  })

  callbacks[0](connectedState())
  callbacks[0](connectedState('Lobby'))
  oldPhaseLookup.resolve?.('InProgress')
  await Promise.resolve()
  await Promise.resolve()

  assert.deepEqual(emitted, ['Lobby'])
})
