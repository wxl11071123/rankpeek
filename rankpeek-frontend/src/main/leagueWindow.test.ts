import test from 'node:test'
import assert from 'node:assert/strict'
import { computeDockBounds } from './leagueWindow.ts'

const work = { x: 0, y: 0, width: 1920, height: 1080 }

test('客户端在中间：贴左边，高度跟客户端对齐', () => {
  const bounds = computeDockBounds({ x: 500, y: 100, width: 1000, height: 700 }, work, 265)
  assert.deepEqual(bounds, { x: 235, y: 100, width: 265, height: 700 })
})

test('客户端占满屏：左边没地方就贴右边，并夹进工作区', () => {
  const bounds = computeDockBounds({ x: 0, y: 0, width: 1920, height: 1080 }, work, 265)
  assert.equal(bounds.x, 1920 - 265)
  assert.equal(bounds.y, 0)
  assert.equal(bounds.height, 1080)
})

test('客户端比工作区高：高度夹到工作区', () => {
  const bounds = computeDockBounds({ x: 400, y: -50, width: 900, height: 1400 }, work, 265)
  assert.equal(bounds.height, 1080)
  assert.equal(bounds.y, 0)
})

test('客户端在工作区下方：y 夹回来，别跑到屏幕外', () => {
  const bounds = computeDockBounds({ x: 400, y: 900, width: 900, height: 700 }, work, 265)
  assert.equal(bounds.y, 1080 - 700)
})

test('宽度带小数也按整数算，最小不小于 1', () => {
  assert.equal(computeDockBounds({ x: 400, y: 0, width: 900, height: 700 }, work, 264.6).width, 265)
  assert.equal(computeDockBounds({ x: 400, y: 0, width: 900, height: 700 }, work, 0).width, 1)
})

test('工作区有偏移（副屏/任务栏）：左边越界就贴右边并夹进工作区', () => {
  const shifted = { x: 100, y: 40, width: 1280, height: 900 }
  const bounds = computeDockBounds({ x: 300, y: 60, width: 900, height: 700 }, shifted, 265)
  // 左边 300-265=35 已经跑出工作区（x<100），改贴右边：客户端右边 1200，夹到 100+1280-265=1115
  assert.equal(bounds.x, 1115)
  assert.equal(bounds.y, 60)
  assert.equal(bounds.height, 700)
})
