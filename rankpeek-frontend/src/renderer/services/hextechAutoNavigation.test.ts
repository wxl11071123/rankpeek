import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHextechAutoNavigator, resolveLockedChampionId } from './hextechAutoNavigation.ts'

const HEXTECH_QUEUE = 2400

function createHarness(options: { queueId?: number | null; championId?: number; startPath?: string } = {}) {
  const pushed: Array<{ path: string; query: Record<string, string> }> = []
  let emit: ((payload: unknown) => void) | null = null
  const router = {
    currentRoute: {
      value: { path: options.startPath ?? '/', query: {} as Record<string, unknown> }
    },
    push: (location: { path: string; query: Record<string, string> }) => {
      pushed.push(location)
      router.currentRoute.value = { path: location.path, query: { ...location.query } }
      return Promise.resolve()
    }
  }

  const stop = createHextechAutoNavigator(router, {
    subscribe: (callback) => {
      emit = callback
      return () => {
        emit = null
      }
    },
    resolveQueueId: async () => options.queueId ?? HEXTECH_QUEUE,
    logger: { warn: () => {} }
  })

  return {
    pushed,
    router,
    stop,
    fire: (payload: unknown) => emit?.(payload),
    flush: () => new Promise((resolve) => setTimeout(resolve, 0))
  }
}

function championSelect(gameId: number, championId: number, pickIntent = 0) {
  return {
    gameId,
    localPlayerCellId: 2,
    myTeam: [
      { cellId: 0, championId: 1 },
      { cellId: 2, championId, championPickIntent: pickIntent }
    ]
  }
}

test('resolveLockedChampionId prefers the locked champion', () => {
  assert.equal(resolveLockedChampionId(championSelect(1, 157, 22)), 157)
})

test('resolveLockedChampionId falls back to the pick intent', () => {
  assert.equal(resolveLockedChampionId(championSelect(1, 0, 22)), 22)
})

test('resolveLockedChampionId returns null without a local player or team', () => {
  assert.equal(resolveLockedChampionId(null), null)
  assert.equal(resolveLockedChampionId({}), null)
  assert.equal(resolveLockedChampionId({ localPlayerCellId: 9, myTeam: [{ cellId: 1, championId: 5 }] }), null)
  assert.equal(resolveLockedChampionId({ localPlayerCellId: 1, myTeam: [{ cellId: 1, championId: 0, championPickIntent: 0 }] }), null)
})

test('navigates to the champion board when a champion is locked in the mayhem queue', async () => {
  const harness = createHarness({ queueId: HEXTECH_QUEUE })
  harness.fire(championSelect(100, 157))
  await harness.flush()
  assert.deepEqual(harness.pushed, [{ path: '/hextech', query: { championId: '157' } }])
  harness.stop()
})

test('stays put outside the mayhem queue', async () => {
  const harness = createHarness({ queueId: 420 })
  harness.fire(championSelect(100, 157))
  await harness.flush()
  assert.deepEqual(harness.pushed, [])
  harness.stop()
})

test('does not navigate twice for the same champion in the same game', async () => {
  const harness = createHarness()
  harness.fire(championSelect(100, 157))
  await harness.flush()
  harness.fire(championSelect(100, 157))
  await harness.flush()
  assert.equal(harness.pushed.length, 1)
  harness.stop()
})

test('navigates again for the same champion in a new game when the route moved away', async () => {
  const harness = createHarness()
  harness.fire(championSelect(100, 157))
  await harness.flush()
  // 新一局开始前用户可能已经切到别的页面
  harness.router.currentRoute.value = { path: '/', query: {} }
  harness.fire(championSelect(200, 157))
  await harness.flush()
  assert.equal(harness.pushed.length, 2)
  harness.stop()
})

test('does not navigate again for the same champion in a new game while already on its page', async () => {
  const harness = createHarness()
  harness.fire(championSelect(100, 157))
  await harness.flush()
  harness.fire(championSelect(200, 157))
  await harness.flush()
  assert.equal(harness.pushed.length, 1)
  harness.stop()
})

test('skips navigation when the route already shows that champion', async () => {
  const harness = createHarness()
  harness.fire(championSelect(100, 157))
  await harness.flush()
  harness.fire(championSelect(200, 157))
  await harness.flush()
  const router = { currentRoute: { value: { path: '/hextech', query: { championId: '157' } } }, push: () => { throw new Error('should not push') } }
  const stop = createHextechAutoNavigator(router as never, {
    subscribe: (callback) => {
      callback(championSelect(300, 157))
      return () => {}
    },
    resolveQueueId: async () => HEXTECH_QUEUE,
    logger: { warn: () => {} }
  })
  await harness.flush()
  stop()
  harness.stop()
})
