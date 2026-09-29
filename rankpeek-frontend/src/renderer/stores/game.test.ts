import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('game store confirms LCU connection before trusting stale disconnected game-state events', () => {
  const source = readFileSync(new URL('./game.ts', import.meta.url), 'utf8')
  const initFunction = source.match(/async function initConnection\(\) \{[\s\S]*?async function checkConnection/)?.[0] || ''
  const checkFunction = source.match(/async function checkConnection\(\) \{[\s\S]*?async function refreshSummoner/)?.[0] || ''
  const applyFunction = source.match(/async function applyGameState\(state: GameState, options: \{ confirmDisconnect\?: boolean \} = \{\}\) \{[\s\S]*?async function initConnection/)?.[0] || ''

  assert.match(source, /async function applyGameState\(state: GameState, options: \{ confirmDisconnect\?: boolean \} = \{\}\)/)
  assert.match(applyFunction, /if \(!state\.connected && options\.confirmDisconnect !== false\) \{[\s\S]*const stillConnected = await apiClient\.checkConnection\(\)[\s\S]*if \(stillConnected\) \{[\s\S]*connected\.value = true[\s\S]*return[\s\S]*\}/)
  assert.match(initFunction, /wsClient\.onGameState\(\(state: GameState\) => \{[\s\S]*void applyGameState\(state\)/)
  assert.match(checkFunction, /const connectedNow = await apiClient\.checkConnection\(\)[\s\S]*connected\.value = connectedNow[\s\S]*if \(!connectedNow\) \{[\s\S]*clearConnectedSessionState\(\)[\s\S]*return/)
  assert.match(checkFunction, /await applyGameState\(state, \{ confirmDisconnect: false \}\)/)
})

test('game store refreshes LCU asset metadata overlay after connection is confirmed', () => {
  const source = readFileSync(new URL('./game.ts', import.meta.url), 'utf8')
  const applyFunction = source.match(/async function applyGameState\(state: GameState, options: \{ confirmDisconnect\?: boolean \} = \{\}\) \{[\s\S]*?async function initConnection/)?.[0] || ''
  const checkFunction = source.match(/async function checkConnection\(\) \{[\s\S]*?async function refreshSummoner/)?.[0] || ''
  const refreshFunction = source.match(/function refreshLcuGameAssetMetadataOverlay\(\) \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(source, /import \{ loadLcuGameAssetMetadataOverlay \} from '@\/utils\/gameAssetUrls'/)
  assert.match(source, /let assetMetadataOverlayRefreshPromise: Promise<void> \| null = null/)
  assert.match(source, /const assetMetadataOverlayRefreshIntervalMs = 60_000/)
  assert.match(refreshFunction, /loadLcuGameAssetMetadataOverlay\(\)/)
  assert.match(applyFunction, /connected\.value = true[\s\S]*refreshLcuGameAssetMetadataOverlay\(\)/)
  assert.match(checkFunction, /connected\.value = connectedNow[\s\S]*if \(!connectedNow\)[\s\S]*refreshLcuGameAssetMetadataOverlay\(\)/)
})
