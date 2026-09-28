import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildRankDisplay,
  formatRankDivisionLabel,
  getRankQueueInfo,
  normalizeRankDivisionText,
  type RankLoadStatus
} from './rankDisplay.ts'
import type { QueueInfo, Rank } from '../types/api.ts'

function queueInfo(overrides: Partial<QueueInfo> = {}): QueueInfo {
  return {
    queueType: 'RANKED_SOLO_5x5',
    tier: 'GOLD',
    division: 'II',
    leaguePoints: 63,
    wins: 28,
    losses: 22,
    highestTier: 'GOLD',
    highestDivision: 'II',
    isProvisional: false,
    ...overrides
  }
}

test('maps ranked queue keys to their queue entries', () => {
  const solo = queueInfo({ queueType: 'RANKED_SOLO_5x5', tier: 'PLATINUM' })
  const flex = queueInfo({ queueType: 'RANKED_FLEX_SR', tier: 'GOLD' })
  const rank: Rank = {
    queueMap: {
      RANKED_SOLO_5x5: solo,
      RANKED_FLEX_SR: flex
    }
  }

  assert.equal(getRankQueueInfo(rank, 'RANKED_SOLO_5x5'), solo)
  assert.equal(getRankQueueInfo(rank, 'RANKED_FLEX_SR'), flex)
})

test('formats rank divisions with unicode roman numerals in shared display helpers', () => {
  assert.equal(formatRankDivisionLabel('I'), 'Ⅰ')
  assert.equal(formatRankDivisionLabel('II'), 'Ⅱ')
  assert.equal(formatRankDivisionLabel('III'), 'Ⅲ')
  assert.equal(formatRankDivisionLabel('IV'), 'Ⅳ')
  assert.equal(formatRankDivisionLabel('二'), 'Ⅱ')
  assert.equal(normalizeRankDivisionText('铂金二'), '铂金Ⅱ')
  assert.equal(normalizeRankDivisionText('铂金 II 50 LP'), '铂金 Ⅱ 50 LP')
})

test('formats ranked tier, division, league points, and wins-only copy from queue info', () => {
  const display = buildRankDisplay(queueInfo(), 'loaded')

  assert.equal(display.tierText, '黄金 Ⅱ 63LP')
  assert.equal(display.recordText, '28胜')
  assert.equal(display.state, 'ranked')
  assert.equal(display.iconTier, 'gold')
})

test('formats wins-only rank record from LCU wins without reliable losses or games', () => {
  const display = buildRankDisplay(
    queueInfo({
      wins: 75,
      losses: null,
      games: null,
      totalGames: null
    }),
    'loaded',
    {
      loading: 'Loading rank',
      error: 'Failed to load rank',
      unranked: 'Unranked',
      noData: 'No ranked data',
      wins: count => `${count}W`
    }
  )

  assert.equal(display.recordText, '75W')
  assert.doesNotMatch(display.recordText, /75W\s+72L|Win Rate|胜率/)
})

test('formats rank record from explicit wins and losses without showing losses or win rate', () => {
  const display = buildRankDisplay(queueInfo({
    tier: 'PLATINUM',
    division: 'III',
    leaguePoints: 12,
    wins: 292,
    losses: 308
  }), 'loaded')

  assert.equal(display.tierText, '铂金 Ⅲ 12LP')
  assert.equal(display.recordText, '292胜')
  assert.doesNotMatch(display.recordText, /308L|胜率|%/)
})

test('does not derive rank losses from games when the rank payload omits losses', () => {
  const display = buildRankDisplay(queueInfo({
    tier: 'PLATINUM',
    division: 'III',
    leaguePoints: 12,
    wins: 292,
    losses: undefined,
    games: 600
  }), 'loaded')

  assert.equal(display.recordText, '292胜')
  assert.doesNotMatch(display.recordText, /308L|胜率|%/)
})

test('renders wins-only rank record when losses are zero and total games are unavailable', () => {
  const display = buildRankDisplay(queueInfo({
    tier: 'PLATINUM',
    division: 'III',
    leaguePoints: 12,
    wins: 292,
    losses: 0,
    totalGames: undefined,
    games: undefined
  }), 'loaded')

  assert.equal(display.tierText, '铂金 Ⅲ 12LP')
  assert.equal(display.recordText, '292胜')
})

test('does not show fake unranked records while rank data is loading', () => {
  const display = buildRankDisplay(null, 'loading')

  assert.equal(display.tierText, '段位加载中')
  assert.equal(display.recordText, '')
  assert.equal(display.state, 'loading')
})

test('shows an explicit failed state instead of pretending queues are unranked', () => {
  const display = buildRankDisplay(null, 'error')

  assert.equal(display.tierText, '段位获取失败')
  assert.equal(display.recordText, '')
  assert.equal(display.state, 'error')
})

test('empty queue entries display real unranked copy without fake zero win rate', () => {
  const display = buildRankDisplay(
    queueInfo({
      tier: '',
      division: 'NA',
      leaguePoints: 0,
      wins: 0,
      losses: 0
    }),
    'loaded'
  )

  assert.equal(display.tierText, '未定级')
  assert.equal(display.recordText, '暂无排位数据')
  assert.equal(display.state, 'unranked')
})

test('one missing queue is unranked without hiding the other ranked queue', () => {
  const soloDisplay = buildRankDisplay(queueInfo({ tier: 'EMERALD', division: 'IV', leaguePoints: 35 }), 'loaded')
  const flexDisplay = buildRankDisplay(null, 'loaded')

  assert.equal(soloDisplay.tierText, '翡翠 Ⅳ 35LP')
  assert.equal(soloDisplay.recordText, '28胜')
  assert.equal(flexDisplay.tierText, '未定级')
  assert.equal(flexDisplay.recordText, '暂无排位数据')
})

test('rank load status values stay intentionally narrow', () => {
  const states: RankLoadStatus[] = ['loading', 'loaded', 'error']

  assert.deepEqual(states, ['loading', 'loaded', 'error'])
})
