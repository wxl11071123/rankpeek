import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parsePartialPostgameAiStructuredResult,
  parsePostgameAiPraiseResult,
  parsePostgameAiStructuredResult,
  POSTGAME_LADU_LEVELS
} from './postgameAiStructuredResult.ts'

function createStructuredResultText(): string {
  return `\`\`\`json
{
  "schemaVersion": "postgame_review_result.v1",
  "levels": [
    {
      "label": "夯",
      "players": [
        { "playerRef": "你｜我方打野｜凯隐", "championName": "凯隐", "phrase": "前期节奏能开局，后续资源判断要更稳。" },
        { "playerRef": "我方中单｜阿狸", "championName": "阿狸", "phrase": "中期支援把节奏撑住。" }
      ]
    },
    {
      "label": "顶级",
      "players": [
        { "playerRef": "敌方上单｜奎桑提", "championName": "奎桑提", "phrase": "边线抗压和团战入口都清楚。" },
        { "playerRef": "我方辅助｜洛", "championName": "洛", "phrase": "开团选择比较干净。" }
      ]
    },
    {
      "label": "人上人",
      "players": [
        { "playerRef": "我方下路｜金克丝", "championName": "金克丝", "phrase": "输出环境好时能接管团战。" },
        { "playerRef": "敌方中单｜维克托", "championName": "维克托", "phrase": "阵地战威胁稳定。" }
      ]
    },
    {
      "label": "NPC",
      "players": [
        { "playerRef": "敌方打野｜盲僧", "championName": "盲僧", "phrase": "前期做事少，资源交换慢。" },
        { "playerRef": "敌方辅助｜璐璐", "championName": "璐璐", "phrase": "保护在线但主动性不足。" }
      ]
    },
    {
      "label": "拉完了",
      "players": [
        { "playerRef": "我方上单｜盖伦", "championName": "盖伦", "phrase": "对线亏损后没有止损。" },
        { "playerRef": "敌方下路｜伊泽瑞尔", "championName": "伊泽瑞尔", "phrase": "伤害转化不足。" }
      ]
    }
  ],
  "summary": "客观总结：本局我方前期依靠打野和中路获得节奏，但中后期资源团处理不够稳定，最终胜负主要由团战入口和边线止损决定。"
}
\`\`\``
}

test('parses fenced DeepSeek postgame review JSON into a five-level ladu chart', () => {
  const parsed = parsePostgameAiStructuredResult(createStructuredResultText())

  assert.equal(parsed.ok, true)
  if (!parsed.ok) {
    return
  }

  assert.deepEqual(parsed.result.levels.map(level => level.label), POSTGAME_LADU_LEVELS)
  assert.equal(parsed.result.players.length, 10)
  assert.equal(parsed.result.players.filter(player => player.playerRef.includes('你｜')).length, 1)
  assert.equal(parsed.result.players[0]?.level, '夯')
  assert.equal(parsed.result.players[0]?.championName, '凯隐')
  assert.match(parsed.result.summary, /客观总结/)
})

test('rejects incomplete structured postgame results', () => {
  const parsed = parsePostgameAiStructuredResult(JSON.stringify({
    schemaVersion: 'postgame_review_result.v1',
    levels: [
      { label: '夯', players: [{ playerRef: '你｜我方打野｜凯隐', championName: '凯隐', phrase: '一句话。' }] }
    ],
    summary: '客观总结：玩家数量不足。'
  }))

  assert.equal(parsed.ok, false)
  if (parsed.ok) {
    return
  }
  assert.match(parsed.error, /10/)
})

test('partially parses completed player objects from streaming review JSON', () => {
  const parsed = parsePartialPostgameAiStructuredResult(`
DeepSeek 分析
{
  "schemaVersion": "postgame_review_result.v1",
  "levels": [
    {
      "label": "${POSTGAME_LADU_LEVELS[0]}",
      "players": [
        { "playerRef": "你｜我方打野｜凯隐", "championName": "凯隐", "phrase": "前期主动找节奏" },
        { "playerRef": "我方中单｜阿狸", "championName": "阿狸", "phrase": "支援到位"
`)

  assert.equal(parsed.ok, true)
  if (!parsed.ok) {
    return
  }
  assert.equal(parsed.partial, true)
  assert.equal(parsed.result.players.length, 1)
  assert.equal(parsed.result.players[0]?.playerRef, '你｜我方打野｜凯隐')
  assert.equal(parsed.result.players[0]?.championName, '凯隐')
  assert.equal(parsed.result.players[0]?.level, POSTGAME_LADU_LEVELS[0])
  assert.equal(parsed.result.summary, '')
})

test('partially parses an unterminated streaming summary string', () => {
  const parsed = parsePartialPostgameAiStructuredResult(`
{
  "schemaVersion": "postgame_review_result.v1",
  "levels": [],
  "summary": "客观总结：前期节奏清楚，中期资源团正在分析
`)

  assert.equal(parsed.ok, true)
  if (!parsed.ok) {
    return
  }
  assert.equal(parsed.partial, true)
  assert.equal(parsed.result.players.length, 0)
  assert.equal(parsed.result.summary, '客观总结：前期节奏清楚，中期资源团正在分析')
})

test('parses postgame praise JSON into a friend-note result', () => {
  const parsed = parsePostgameAiPraiseResult(`\`\`\`json
{
  "schemaVersion": "postgame_praise_result.v1",
  "headline": "奎因打野节奏拉满",
  "paragraphs": [
    "你这把德玛西亚之翼打野前面虽然被针对得很难受，但你一直在找机会做事，能把节奏往河道和边线带已经很不容易。",
    "队伍中期几波节奏断掉以后，本来就很难靠一个人硬掰回来，这局输得更像是整体资源和阵容执行被压住，不是你一个人的锅。"
  ]
}
\`\`\``)

  assert.equal(parsed.ok, true)
  if (!parsed.ok) {
    return
  }

  assert.equal(parsed.result.schemaVersion, 'postgame_praise_result.v1')
  assert.equal(parsed.result.headline, '奎因打野节奏拉满')
  assert.deepEqual(parsed.result.paragraphs, [
    '你这把德玛西亚之翼打野前面虽然被针对得很难受，但你一直在找机会做事，能把节奏往河道和边线带已经很不容易。',
    '队伍中期几波节奏断掉以后，本来就很难靠一个人硬掰回来，这局输得更像是整体资源和阵容执行被压住，不是你一个人的锅。'
  ])
  assert.equal(parsed.result.body, parsed.result.paragraphs.join('\n\n'))
  assert.doesNotMatch(parsed.result.body, /```|DeepSeek/)
})

test('keeps expressive AI praise headlines instead of falling back to a fixed blame title', () => {
  const parsed = parsePostgameAiPraiseResult(`{
  "schemaVersion": "postgame_praise_result.v1",
  "headline": "奎因打野把节奏扛在肩上飞",
  "body": "这局你用德玛西亚之翼打野，前中期一直在给队伍找节奏。"
}`)

  assert.equal(parsed.ok, true)
  if (!parsed.ok) {
    return
  }

  assert.equal(parsed.result.headline, '奎因打野把节奏扛在肩上飞')
  assert.notEqual(parsed.result.headline, '这把真不能全怪你')
  assert.deepEqual(parsed.result.paragraphs, ['这局你用德玛西亚之翼打野，前中期一直在给队伍找节奏。'])
})

test('derives a contextual praise headline when the model sends a banned fixed title', () => {
  const parsed = parsePostgameAiPraiseResult(`{
  "schemaVersion": "postgame_praise_result.v1",
  "headline": "这把真不能全怪你",
  "body": "这局你用德玛西亚之翼（奎因）打野，21/8/7的豪华KDA和队内打钱第一都说明你是胜利核心。"
}`)

  assert.equal(parsed.ok, true)
  if (!parsed.ok) {
    return
  }

  assert.equal(parsed.result.headline, '这局你用德玛西亚之翼（奎因）打野')
  assert.notEqual(parsed.result.headline, '这把真不能全怪你')
  assert.deepEqual(parsed.result.paragraphs, ['这局你用德玛西亚之翼（奎因）打野，21/8/7的豪华KDA和队内打钱第一都说明你是胜利核心。'])
})

test('does not treat incomplete praise JSON before paragraphs start as legacy text', () => {
  const parsed = parsePostgameAiPraiseResult(`
{
  "schemaVersion": "postgame_praise_result.v1",
  "headline": "逆风中的不屈猎鹰",
`)

  assert.equal(parsed.ok, false)
})

test('parses streaming postgame praise paragraph before the JSON object is complete', () => {
  const parsed = parsePostgameAiPraiseResult(`
{
  "schemaVersion": "postgame_praise_result.v1",
  "headline": "这把真不能全怪你",
  "paragraphs": [
    "你这把奎因打野不是没声音，前面几波节奏其实都在尽力往队伍身上补。中期局势断掉以后
`)

  assert.equal(parsed.ok, true)
  if (!parsed.ok) {
    return
  }

  assert.equal(parsed.result.headline, '你这把奎因打野不是没声音')
  assert.deepEqual(parsed.result.paragraphs, ['你这把奎因打野不是没声音，前面几波节奏其实都在尽力往队伍身上补。中期局势断掉以后'])
  assert.equal(parsed.result.body, '你这把奎因打野不是没声音，前面几波节奏其实都在尽力往队伍身上补。中期局势断掉以后')
})

test('normalizes legacy postgame praise text for the new one-piece UI', () => {
  const parsed = parsePostgameAiPraiseResult(`
DeepSeek 分析
【你的全图打野，虽败犹荣的暗影猎手！】
这把真不能全怪你。你一直在找机会做事。

下局建议：下把继续按自己的节奏找机会，别急着给自己背锅。
`)

  assert.equal(parsed.ok, true)
  if (!parsed.ok) {
    return
  }

  assert.equal(parsed.result.headline, '你的全图打野，虽败犹荣的暗影猎手')
  assert.deepEqual(parsed.result.paragraphs, [
    '这把真不能全怪你。你一直在找机会做事。',
    '下局建议：下把继续按自己的节奏找机会，别急着给自己背锅。'
  ])
  assert.equal(parsed.result.body, parsed.result.paragraphs.join('\n\n'))
  assert.doesNotMatch(parsed.result.body, /DeepSeek|【|】/)
})
