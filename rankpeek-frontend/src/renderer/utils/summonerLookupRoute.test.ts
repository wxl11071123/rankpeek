import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSummonerLookupName,
  createSummonerLookupRoute
} from './summonerLookupRoute.ts'

test('uses displayName directly when it already contains a Riot tag', () => {
  assert.equal(
    buildSummonerLookupName({
      displayName: 'Faker#KR1',
      gameName: 'Ignored',
      tagLine: 'NA1'
    }),
    'Faker#KR1'
  )
})

test('builds a Riot ID from separate gameName and tagLine fields', () => {
  assert.equal(
    buildSummonerLookupName({
      gameName: 'Hide on bush',
      tagLine: 'KR1'
    }),
    'Hide on bush#KR1'
  )
})

test('falls back to gameName without throwing when tagLine and displayName are missing', () => {
  assert.equal(
    buildSummonerLookupName({
      gameName: 'SoloName'
    }),
    'SoloName'
  )
})

test('returns an empty lookup name when no usable player identity exists', () => {
  assert.equal(buildSummonerLookupName({}), '')
  assert.equal(buildSummonerLookupName(null), '')
})

test('creates the existing summoner lookup route with the name query', () => {
  assert.deepEqual(createSummonerLookupRoute('Faker#KR1'), {
    path: '/summoner',
    query: { name: 'Faker#KR1' }
  })
  assert.equal(createSummonerLookupRoute(''), null)
})
