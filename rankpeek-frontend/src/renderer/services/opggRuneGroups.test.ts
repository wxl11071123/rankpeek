import test from 'node:test'
import assert from 'node:assert/strict'
import { splitOpggRuneIds } from './opggRuneGroups.ts'

test('splits OP.GG rune ids into primary, secondary, and stat shard groups', () => {
  const groups = splitOpggRuneIds([
    8000,
    8100,
    8010,
    9111,
    9104,
    8299,
    8138,
    8135,
    5008,
    5008,
    5002
  ])

  assert.equal(groups.primaryPageId, 8000)
  assert.equal(groups.secondaryPageId, 8100)
  assert.deepEqual(groups.primaryRuneIds, [8010, 9111, 9104, 8299])
  assert.deepEqual(groups.secondaryRuneIds, [8138, 8135])
  assert.deepEqual(groups.statModIds, [5008, 5008, 5002])
})

test('keeps two-rune primary fixtures grouped without swallowing secondary runes', () => {
  const groups = splitOpggRuneIds([
    8000,
    8100,
    8005,
    9111,
    8138,
    8135,
    5008,
    5008,
    5002
  ])

  assert.deepEqual(groups.primaryRuneIds, [8005, 9111])
  assert.deepEqual(groups.secondaryRuneIds, [8138, 8135])
  assert.deepEqual(groups.statModIds, [5008, 5008, 5002])
})
