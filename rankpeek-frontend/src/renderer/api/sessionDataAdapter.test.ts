import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  getGamingSessionData,
  isSimulatorSessionDataEnabled
} from './sessionDataAdapter.ts'
import type { SessionData } from '../types/api.ts'

const liveSession: SessionData = {
  phase: 'Lobby',
  queueType: '',
  typeCn: '单/双排',
  queueId: 420,
  teamOne: [],
  teamTwo: []
}

const simulatorSession: SessionData = {
  phase: 'ChampSelect',
  queueType: '',
  typeCn: '单/双排',
  queueId: 420,
  teamOne: [],
  teamTwo: [],
  source: 'simulator',
  simulatorPhase: 'CHAMP_SELECT',
  matchId: 'SIM-MATCH-0001'
}

test('simulator session data flag defaults to disabled', () => {
  assert.equal(isSimulatorSessionDataEnabled({ isDev: true, getFlag: () => null }), false)
  assert.equal(isSimulatorSessionDataEnabled({ isDev: false, getFlag: () => '1' }), false)
})

test('gaming session data uses live endpoint when simulator flag is off', async () => {
  const calls: string[] = []

  const data = await getGamingSessionData({
    flagContext: { isDev: true, getFlag: () => null },
    getLiveSessionData: async (options) => {
      calls.push(`live:${options.forceRefresh}`)
      return liveSession
    },
    getSimulatorSessionData: async () => {
      calls.push('simulator')
      return simulatorSession
    }
  })

  assert.equal(data, liveSession)
  assert.deepEqual(calls, ['live:false'])
})

test('gaming session data forwards forceRefresh to the live endpoint', async () => {
  const calls: boolean[] = []

  const data = await getGamingSessionData({
    forceRefresh: true,
    flagContext: { isDev: true, getFlag: () => null },
    getLiveSessionData: async (options) => {
      calls.push(options.forceRefresh)
      return liveSession
    }
  })

  assert.equal(data, liveSession)
  assert.deepEqual(calls, [true])
})

test('gaming session data uses simulator endpoint only when dev flag is on', async () => {
  const calls: string[] = []

  const data = await getGamingSessionData({
    flagContext: { isDev: true, getFlag: () => '1' },
    getLiveSessionData: async () => {
      calls.push('live')
      return liveSession
    },
    getSimulatorSessionData: async () => {
      calls.push('simulator')
      return simulatorSession
    }
  })

  assert.equal(data, simulatorSession)
  assert.deepEqual(calls, ['simulator'])
})

test('simulator localStorage flag is ignored outside dev mode', async () => {
  const calls: string[] = []

  const data = await getGamingSessionData({
    flagContext: { isDev: false, getFlag: () => '1' },
    getLiveSessionData: async (options) => {
      calls.push(`live:${options.forceRefresh}`)
      return liveSession
    },
    getSimulatorSessionData: async () => {
      calls.push('simulator')
      return simulatorSession
    }
  })

  assert.equal(data, liveSession)
  assert.deepEqual(calls, ['live:false'])
})

test('simulator endpoint failures do not fall back to live session data', async () => {
  const calls: string[] = []

  await assert.rejects(
    () => getGamingSessionData({
      flagContext: { isDev: true, getFlag: () => '1' },
      getLiveSessionData: async () => {
        calls.push('live')
        return liveSession
      },
      getSimulatorSessionData: async () => {
        calls.push('simulator')
        throw new Error('simulator unavailable')
      }
    }),
    /simulator unavailable/
  )

  assert.deepEqual(calls, ['simulator'])
})

test('dev simulator client only exposes the read-only session data endpoint', () => {
  const source = readFileSync(new URL('./devSimulatorClient.ts', import.meta.url), 'utf8')

  assert.match(source, /getSimulatorSessionData/)
  assert.match(source, /\/api\/dev\/simulator/)
  assert.match(source, /\/session-data/)
  assert.doesNotMatch(source, /\/start|\/stop|\/reset|\/next|\/phase\/|\/round\//)
  assert.doesNotMatch(source, /post(?:Void)?\(|\.post\(/)
})
