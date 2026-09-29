import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('main process owns a singleton OP.GG window and sender-scoped window controls', () => {
  const source = readFileSync(new URL('./main.ts', import.meta.url), 'utf8')

  assert.match(source, /let opggWindow: BrowserWindow \| null = null/)
  // 窗口位置记在实测挑出来的可写 userData 目录下（见 main.ts 里 pickWritableDir 的说明）
  assert.match(source, /const opggBoundsFile = join\(userDataDir, 'opgg-window-bounds\.json'\)/)
  assert.match(source, /ipcMain\.handle\('opgg:openWindow'[\s\S]*openOpggWindow/)
  assert.match(source, /function getIpcSenderWindow\(event: (Electron\.)?IpcMainInvokeEvent\)/)
  assert.match(source, /BrowserWindow\.fromWebContents\(event\.sender\)/)
  assert.match(source, /ipcMain\.handle\('window:minimize', \(event\) => \{[\s\S]*getIpcSenderWindow\(event\)\?\.minimize\(\)/)
  assert.match(source, /ipcMain\.handle\('window:close', \(event\) => \{[\s\S]*getIpcSenderWindow\(event\)\?\.close\(\)/)
})

test('OP.GG window loads the standalone route and is centered on screen', () => {
  const source = readFileSync(new URL('./main.ts', import.meta.url), 'utf8')

  assert.match(source, /function createOpggWindow/)
  assert.match(source, /function focusOrCreateOpggWindow/)
  assert.match(source, /#\/opgg/)
  assert.match(source, /opggWindow\.webContents\.send\('opgg:initialQuery'/)
  assert.match(source, /screen\.getPrimaryDisplay\(\)\.workArea/)
  assert.match(source, /function clampBoundsToWorkArea/)
})

test('OP.GG window uses RP-OPGG as the taskbar window title', () => {
  const source = readFileSync(new URL('./main.ts', import.meta.url), 'utf8')

  assert.match(source, /const OPGG_WINDOW_TITLE = 'RP-OPGG'/)
  assert.match(source, /title: OPGG_WINDOW_TITLE/)
  assert.match(source, /createdWindow\.setTitle\(OPGG_WINDOW_TITLE\)/)
  assert.match(source, /createdWindow\.on\('page-title-updated', \(event\) => \{[\s\S]*event\.preventDefault\(\)[\s\S]*createdWindow\.setTitle\(OPGG_WINDOW_TITLE\)/)
})
