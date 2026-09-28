import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  allowedEditDistance,
  isLikelyTitleSlotText,
  levenshtein,
  matchAugmentTitle,
  matchAugmentTitles,
  normalizeAugmentTitle,
  type AugmentCandidate
} from './augmentTitleMatcher.ts'

const CANDIDATES: AugmentCandidate[] = [
  { augmentId: 1, name: '魔鬼之舞' },
  { augmentId: 2, name: '无休回复' },
  { augmentId: 3, name: '物法皆修' },
  { augmentId: 4, name: '大地苏醒' },
  { augmentId: 5, name: '面包和奶酪' },
  { augmentId: 6, name: '魄罗爆破手' },
  { augmentId: 7, name: '坦克引擎' },
  { augmentId: 8, name: '缩小引擎' },
  { augmentId: 9, name: '亮出你的剑' },
  { augmentId: 10, name: '术士果汁盒' },
  { augmentId: 11, name: '循环往复' },
  { augmentId: 12, name: '裁决使' }
]

test('normalizeAugmentTitle strips punctuation, spacing and full-width forms', () => {
  assert.equal(normalizeAugmentTitle('  魔鬼之舞 '), '魔鬼之舞')
  assert.equal(normalizeAugmentTitle('质变：棱彩阶'), '质变棱彩阶')
  assert.equal(normalizeAugmentTitle('ＡＢＣ'), 'abc')
  assert.equal(normalizeAugmentTitle('面包和奶酪\n'), '面包和奶酪')
  assert.equal(normalizeAugmentTitle(''), '')
})

test('levenshtein counts per character', () => {
  assert.equal(levenshtein('魔鬼之舞', '魔鬼之舞'), 0)
  assert.equal(levenshtein('无休回复', '无体回复'), 1)
  assert.equal(levenshtein('', 'abc'), 3)
})

test('allowedEditDistance follows the 2/3/long rule', () => {
  assert.equal(allowedEditDistance(2), 0)
  assert.equal(allowedEditDistance(3), 1)
  assert.equal(allowedEditDistance(4), 1)
  assert.equal(allowedEditDistance(6), 2)
})

test('exact match wins', () => {
  const match = matchAugmentTitle('坦克引擎', CANDIDATES)
  assert.equal(match?.augmentId, 7)
  assert.equal(match?.strategy, 'exact')
  assert.equal(match?.confidence, 1)
})

test('known Tesseract misreads are fixed by the alias table', () => {
  const cases: Array<[string, number]> = [
    ['台所之舞', 1],
    ['无体回复', 2],
    ['物法江', 3],
    ['大昌闪本', 4],
    ['面包和奶栈', 5],
    ['zjama', 6]
  ]
  for (const [raw, expectedId] of cases) {
    const match = matchAugmentTitle(raw, CANDIDATES)
    assert.equal(match?.augmentId, expectedId, raw + ' should map to augment ' + expectedId)
    assert.equal(match?.strategy, 'alias')
  }
})

test('fuzzy match tolerates one wrong character in longer names', () => {
  const match = matchAugmentTitle('坦克引擊', CANDIDATES)
  assert.equal(match?.augmentId, 7)
  assert.equal(match?.strategy, 'fuzzy')
  assert.equal(match?.distance, 1)
})

test('short names are never fuzzy matched', () => {
  // 「缩小引擎」长度 4 允许 1 错；而两字名字必须完全一致
  const shortCandidates: AugmentCandidate[] = [{ augmentId: 99, name: '巨人' }]
  assert.equal(matchAugmentTitle('巨入', shortCandidates), null)
})

test('descriptive text is rejected instead of being fuzzy matched', () => {
  assert.equal(matchAugmentTitle('获得 10 点攻击力', CANDIDATES), null)
  assert.equal(matchAugmentTitle('你的技能冷却时间减少', CANDIDATES), null)
  assert.equal(matchAugmentTitle('持续 5 秒', CANDIDATES), null)
})

test('garbage and empty text are rejected', () => {
  assert.equal(matchAugmentTitle('', CANDIDATES), null)
  assert.equal(matchAugmentTitle('   ', CANDIDATES), null)
  assert.equal(matchAugmentTitle('x', CANDIDATES), null)
  assert.equal(matchAugmentTitle('completely unrelated english text', CANDIDATES), null)
})

test('substring match handles OCR eating neighbouring characters', () => {
  const match = matchAugmentTitle('坦克引擎的', CANDIDATES)
  assert.equal(match?.augmentId, 7)
  assert.ok(match?.strategy === 'substring' || match?.strategy === 'fuzzy')
})

test('sliding window matches when OCR glues neighbouring characters onto the title', () => {
  // 实测场景：截图区域没对齐时，OCR 会把左侧的层数/序号一起读进来
  const match = matchAugmentTitle('3 循环往复', CANDIDATES)
  assert.equal(match?.augmentId, 11)
})

test('sliding window tolerates trailing noise after the name', () => {
  const match = matchAugmentTitle('裁决使x', CANDIDATES)
  assert.equal(match?.augmentId, 12)
})

test('length guard rejects description lines that merely contain the name', () => {
  assert.equal(isLikelyTitleSlotText('裁决使', '裁决使'), true)
  assert.equal(isLikelyTitleSlotText('3 循环往复', '循环往复'), true)
  assert.equal(
    isLikelyTitleSlotText('对生命值低于30%的敌人们多造成10%伤害', '裁决使'),
    false
  )
})

test('matchAugmentTitles dedupes and orders by confidence', () => {
  const matches = matchAugmentTitles(['坦克引擎', '坦克引擊', '', '面包和奶栈'], CANDIDATES)
  assert.equal(matches.length, 2)
  assert.equal(matches[0].augmentId, 7)
  assert.equal(matches[0].confidence, 1)
  assert.equal(matches[1].augmentId, 5)
})
