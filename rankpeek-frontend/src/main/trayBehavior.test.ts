import test from 'node:test'
import assert from 'node:assert/strict'
import { getTrayMenuEntries, getWindowCloseAction, getWindowMinimizeAction } from './trayBehavior.ts'

test('close quits immediately regardless of tray mode', () => {
  assert.strictEqual(
    getWindowCloseAction({
      isTrayEnabled: true,
      isQuitting: false
    }),
    'quit'
  )
})

test('close exits when app is already quitting', () => {
  assert.equal(
    getWindowCloseAction({
      isTrayEnabled: true,
      isQuitting: true
    }),
    'quit'
  )
})

test('minimize stays minimized even when tray mode is available', () => {
  assert.equal(
    getWindowMinimizeAction({
      isTrayEnabled: true,
      isQuitting: false
    }),
    'keep-minimized'
  )
})

test('minimize stays minimized when tray mode is disabled', () => {
  assert.equal(
    getWindowMinimizeAction({
      isTrayEnabled: false,
      isQuitting: false
    }),
    'keep-minimized'
  )
})

test('tray menu exposes core navigation and utility actions', () => {
  const entries = getTrayMenuEntries()

  assert.deepEqual(
    entries.map((entry) => entry.action),
    [
      'show-window',
      'hide-window',
      'separator',
      'navigate-home',
      'navigate-summoner',
      'navigate-match-history',
      'separator',
      'toggle-devtools',
      'quit'
    ]
  )
})
