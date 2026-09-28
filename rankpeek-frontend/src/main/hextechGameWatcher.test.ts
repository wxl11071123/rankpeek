import test from 'node:test'
import assert from 'node:assert/strict'
import { startHextechGameWatcher, isChampSelectPhase, isInGamePhase } from './hextechGameWatcher.ts'

/** 用固定阶段序列驱动 watcher，收集边沿事件。 */
async function runPhases(phases: Array<string | null>): Promise<string[]> {
  let index = 0
  const events: string[] = []
  const stop = startHextechGameWatcher({
    backendBaseUrl: 'http://127.0.0.1:1',
    fetchPhase: async () => phases[Math.min(index++, phases.length - 1)] ?? null,
    intervalMs: 5,
    onInGame: () => events.push('in-game'),
    onLeaveGame: () => events.push('left-game'),
    onChampSelect: () => events.push('champ-select')
  })
  // 跑满一轮序列再多跑几拍，确认重复阶段不会再喊
  await new Promise((resolve) => setTimeout(resolve, 40 + phases.length * 12))
  stop()
  return events
}

test('阶段判定：选人和对局分开', () => {
  assert.equal(isInGamePhase('InProgress'), true)
  assert.equal(isInGamePhase('ChampSelect'), false)
  assert.equal(isChampSelectPhase('ChampSelect'), true)
  assert.equal(isChampSelectPhase('InProgress'), false)
  assert.equal(isChampSelectPhase(null), false)
})

test('进选人弹侧栏、进对局弹贴片，各只喊一次', async () => {
  const events = await runPhases(['None', 'ChampSelect', 'ChampSelect', 'InProgress', 'InProgress', 'EndOfGame', 'ChampSelect'])
  assert.deepEqual(events, ['champ-select', 'in-game', 'left-game', 'champ-select'])
})

test('一直停在选人阶段不会反复弹', async () => {
  const events = await runPhases(['ChampSelect', 'ChampSelect', 'ChampSelect', 'ChampSelect'])
  assert.deepEqual(events, ['champ-select'])
})
