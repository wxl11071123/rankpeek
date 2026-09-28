import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  clearPostgameAutoOpenLatestMatchToken,
  createGameflowAutoNavigator,
  postgameAutoOpenLatestMatchToken
} from './gameflowAutoNavigation.ts'

function createFakeRouter(initialRouteName: string) {
  const pushes: Array<{ name: string }> = []
  const router = {
    currentRoute: {
      value: {
        name: initialRouteName
      }
    },
    push(location: { name: string }) {
      pushes.push(location)
      router.currentRoute.value.name = location.name
      return Promise.resolve()
    }
  }

  return { router, pushes }
}

test('gameflow auto navigator pushes gaming once for champ select and skips when already there', () => {
  let phaseCallback: (phase: string) => void = () => {
    throw new Error('phase listener was not registered')
  }
  const { router, pushes } = createFakeRouter('Home')

  createGameflowAutoNavigator(router, {
    listen: callback => {
      phaseCallback = callback
      return () => {}
    },
    logger: { warn() {} },
    now: () => 1000
  })

  phaseCallback('ChampSelect')
  phaseCallback('ChampSelect')
  phaseCallback('GameStart')

  assert.deepEqual(pushes, [{ name: 'Gaming' }])
})

test('gameflow auto navigator requests latest match detail and avoids repeated match-history push', () => {
  clearPostgameAutoOpenLatestMatchToken(postgameAutoOpenLatestMatchToken.value)
  let phaseCallback: (phase: string) => void = () => {
    throw new Error('phase listener was not registered')
  }
  const { router, pushes } = createFakeRouter('Home')

  createGameflowAutoNavigator(router, {
    listen: callback => {
      phaseCallback = callback
      return () => {}
    },
    logger: { warn() {} },
    now: () => 2000
  })

  phaseCallback('EndOfGame')
  assert.deepEqual(pushes, [{ name: 'MatchHistory' }])
  assert.match(postgameAutoOpenLatestMatchToken.value, /^EndOfGame:2000:\d+$/)

  pushes.length = 0
  router.currentRoute.value.name = 'MatchHistory'
  phaseCallback('WaitingForStats')

  assert.deepEqual(pushes, [])
  assert.match(postgameAutoOpenLatestMatchToken.value, /^WaitingForStats:2000:\d+$/)
})

test('app wires gameflow auto navigation at renderer startup', () => {
  const source = readFileSync(new URL('../App.vue', import.meta.url), 'utf8')

  assert.match(source, /import \{ createGameflowAutoNavigator \} from '@\/services\/gameflowAutoNavigation'/)
  assert.match(source, /let stopGameflowAutoNavigation: \(\(\) => void\) \| null = null/)
  assert.match(source, /stopGameflowAutoNavigation = createGameflowAutoNavigator\(router\)/)
  assert.match(source, /stopGameflowAutoNavigation\?\.\(\)/)
})
