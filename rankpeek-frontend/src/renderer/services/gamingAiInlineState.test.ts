import test from 'node:test'
import assert from 'node:assert/strict'
import {
  beginGamingAiInlineRun,
  clearGamingAiInlineMode,
  completeGamingAiInlineRun,
  gamingAiInlineState,
  hasCompletedGamingAiInlineRun,
  restoreCompletedGamingAiInlineRun,
  upsertGamingAiInlineInsight
} from './gamingAiInlineState.ts'

test('completed pregame inline analysis is cached and restorable after view state clears', () => {
  const requestKey = 'match:10984065683::opponent::enemy-lineup'
  const insight = {
    playerKey: 'puuid:enemy-1',
    label: '上等马',
    tone: 'risk' as const,
    text: '对线压制力强。'
  }
  const { controller, requestId } = beginGamingAiInlineRun('opponent', requestKey)

  upsertGamingAiInlineInsight('opponent', requestId, insight)
  completeGamingAiInlineRun('opponent', requestId, controller)

  assert.equal(hasCompletedGamingAiInlineRun('opponent', requestKey), true)

  clearGamingAiInlineMode('opponent')
  assert.equal(gamingAiInlineState.opponent.requestKey, '')
  assert.deepEqual(gamingAiInlineState.opponent.playerInsights, {})

  assert.equal(restoreCompletedGamingAiInlineRun('opponent', requestKey), true)
  assert.equal(gamingAiInlineState.opponent.streamState, 'completed')
  assert.equal(gamingAiInlineState.opponent.requestKey, requestKey)
  assert.deepEqual(gamingAiInlineState.opponent.playerInsights, {
    [insight.playerKey]: insight
  })
})
