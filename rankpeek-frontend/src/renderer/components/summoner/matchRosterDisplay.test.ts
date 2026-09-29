import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildMatchDetailItems, getTeamKdaLeaders } from './matchRosterDisplay.ts'

test('builds compact current-match detail items with emoji labels', () => {
  const items = buildMatchDetailItems({
    kills: 18,
    deaths: 9,
    assists: 31,
    goldEarned: 20400,
    totalDamageDealtToChampions: 44900,
    totalMinionsKilled: 216,
    neutralMinionsKilled: 0
  })

  assert.deepEqual(items, [
    { label: '💥', value: '44.9k' },
    { label: '🪙', value: '20.4k' },
    { label: '🌾', value: '216' }
  ])
})

test('computes team leader thresholds for kills deaths and assists', () => {
  const leaders = getTeamKdaLeaders([
    { stats: { kills: 6, deaths: 14, assists: 3, goldEarned: 0, totalDamageDealtToChampions: 0, totalMinionsKilled: 0, neutralMinionsKilled: 0 } },
    { stats: { kills: 10, deaths: 10, assists: 3, goldEarned: 0, totalDamageDealtToChampions: 0, totalMinionsKilled: 0, neutralMinionsKilled: 0 } },
    { stats: { kills: 9, deaths: 11, assists: 7, goldEarned: 0, totalDamageDealtToChampions: 0, totalMinionsKilled: 0, neutralMinionsKilled: 0 } }
  ])

  assert.deepEqual(leaders, {
    kills: 10,
    deaths: 14,
    assists: 7
  })
})

test('styles top kills green and top deaths red in recent match roster', () => {
  const componentSource = readFileSync(new URL('./MatchRosterCompact.vue', import.meta.url), 'utf8')

  assert.match(componentSource, /\.kda-number\.leader-kill\s*\{\s*color:\s*#55d187;/)
  assert.match(componentSource, /\.kda-number\.leader-death\s*\{\s*color:\s*#ff6b6b;/)
})

test('shows compact stat details in the match list before opening details', () => {
  const componentSource = readFileSync(new URL('./MatchRosterCompact.vue', import.meta.url), 'utf8')

  assert.match(componentSource, /import \{ buildMatchDetailItems, getTeamKdaLeaders \} from '\.\/matchRosterDisplay'/)
  assert.match(componentSource, /function getMatchDetails\(player: MatchRosterPlayer\)/)
  assert.match(componentSource, /return buildMatchDetailItems\(player\.stats\)/)
  assert.match(componentSource, /class="detail-row"/)
  assert.match(componentSource, /class="detail-pill"/)
  assert.match(componentSource, /class="detail-label"/)
  assert.match(componentSource, /class="detail-value"/)
  assert.doesNotMatch(componentSource, /class="player-build"/)
})
