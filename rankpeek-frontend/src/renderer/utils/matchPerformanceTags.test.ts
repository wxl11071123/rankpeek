import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getMatchPerformanceTags,
  type MatchPerformanceTag
} from './matchPerformanceTags.ts'

interface TestParticipant {
  participantId: number
  stats: Record<string, number>
}

function makeParticipant(participantId: number, stats: Record<string, number> = {}): TestParticipant {
  return {
    participantId,
    stats: {
      kills: 0,
      deaths: 0,
      assists: 0,
      goldEarned: 0,
      totalDamageDealtToChampions: 0,
      ...stats
    }
  }
}

function makeRoster(targetStats: Record<string, number>, tiedStats: Record<string, number> = {}): TestParticipant[] {
  return Array.from({ length: 10 }, (_, index) => {
    if (index === 0) {
      return makeParticipant(1, targetStats)
    }
    if (index === 1) {
      return makeParticipant(2, tiedStats)
    }
    return makeParticipant(index + 1, {
      deaths: 1,
      assists: 1,
      goldEarned: 9000 + index,
      totalDamageDealtToChampions: 10000 + index
    })
  })
}

function labels(tags: MatchPerformanceTag[]): string[] {
  return tags.map(tag => tag.label)
}

test('multi-kill tags only show the highest achieved tier', () => {
  const roster = makeRoster({})

  assert.deepEqual(labels(getMatchPerformanceTags(makeParticipant(1, {
    doubleKills: 2,
    tripleKills: 1,
    quadraKills: 1,
    pentaKills: 1
  }), roster)), ['五杀'])

  assert.deepEqual(labels(getMatchPerformanceTags(makeParticipant(1, {
    doubleKills: 2,
    tripleKills: 1,
    quadraKills: 1
  }), roster)), ['四杀'])

  assert.deepEqual(labels(getMatchPerformanceTags(makeParticipant(1, {
    doubleKills: 2,
    tripleKills: 1
  }), roster)), ['三杀'])

  assert.deepEqual(labels(getMatchPerformanceTags(makeParticipant(1, {
    doubleKills: 1
  }), roster)), ['双杀'])
})

test('legendary tags use reliable spree fields', () => {
  assert.deepEqual(labels(getMatchPerformanceTags(
    makeParticipant(1, { largestKillingSpree: 8 }),
    makeRoster({})
  )), ['超神'])

  assert.deepEqual(labels(getMatchPerformanceTags(
    makeParticipant(1, { legendaryCount: 1 }),
    makeRoster({})
  )), ['超神'])
})

test('top damage, deaths, assists, and gold include ties for first place', () => {
  const target = makeParticipant(1, {
    deaths: 9,
    assists: 31,
    goldEarned: 18100,
    totalDamageDealtToChampions: 48200
  })
  const roster = makeRoster(target.stats, {
    deaths: 9,
    assists: 31,
    goldEarned: 18100,
    totalDamageDealtToChampions: 48200
  })

  assert.deepEqual(labels(getMatchPerformanceTags(target, roster)), [
    '伤害第一',
    '死亡第一',
    '助攻第一',
    '打钱第一'
  ])
})

test('top metric tags are not emitted without a complete comparison roster', () => {
  const target = makeParticipant(1, {
    deaths: 9,
    assists: 31,
    goldEarned: 18100,
    totalDamageDealtToChampions: 48200
  })

  assert.deepEqual(labels(getMatchPerformanceTags(target, [target])), [])
})

test('does not infer consecutive-death tag from total deaths alone', () => {
  const target = makeParticipant(1, { deaths: 12 })

  assert.equal(labels(getMatchPerformanceTags(target, makeRoster(target.stats))).includes('超鬼'), false)
})
