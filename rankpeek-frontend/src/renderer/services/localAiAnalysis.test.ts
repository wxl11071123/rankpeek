import test from 'node:test'
import assert from 'node:assert/strict'
import type { AiAnalysisResult, AiAnalysisResultInput, LocalDatabaseAPI } from '../types/localDatabase.ts'
import {
  formatAnalysisTime,
  formatAnalysisType,
  getCoachReportFinalSentence,
  getCoachReportHeadline,
  loadLocalAiAnalysisResults,
  normalizeCoachChartBlocks,
  parseAiAnalysisOutput,
  parseCoachSummaryReportOutput
} from './localAiAnalysis.ts'
import {
  deleteFallbackAiAnalysisResultsByAccount,
  saveFallbackAiAnalysisResult,
  type BrowserAiAnalysisStorage
} from './localAiAnalysisFallbackStore.ts'

async function withMutedWarnings<T>(operation: () => T | Promise<T>): Promise<T> {
  const originalWarn = console.warn
  console.warn = () => undefined
  try {
    return await operation()
  } finally {
    console.warn = originalWarn
  }
}

function createMemoryStorage(): BrowserAiAnalysisStorage {
  const values = new Map<string, string>()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: key => {
      values.delete(key)
    }
  }
}

const savedResult: AiAnalysisResult = {
  id: 7,
  accountPuuid: 'account-puuid',
  matchId: '998877',
  analysisType: 'post_game',
  subjectKey: 'match:998877',
  gameVersion: '15.8',
  modelName: 'local-placeholder',
  promptVersion: 'v1',
  inputHash: 'hash-1',
  outputJson: JSON.stringify({
    title: 'Post-game review',
    summary: 'Review summary',
    verdict: 'Keep farming before dragon fights',
    sections: [
      { title: 'Deaths', summary: 'Two deaths before objectives' },
      'Vision setup needs a wider timing window'
    ]
  }),
  createdAt: '2026-04-29T08:30:00.000Z',
  updatedAt: '2026-04-29T08:30:00.000Z'
}

test('normal JSON output parses preferred AI analysis fields', () => {
  const parsed = parseAiAnalysisOutput(savedResult.outputJson)

  assert.equal(parsed.status, 'parsed')
  assert.equal(parsed.title, 'Post-game review')
  assert.equal(parsed.summary, 'Review summary')
  assert.deepEqual(parsed.highlights, [
    'Keep farming before dragon fights',
    'Deaths: Two deaths before objectives',
    'Vision setup needs a wider timing window'
  ])
})

test('non-standard JSON output falls back to a compact short summary', () => {
  const parsed = parseAiAnalysisOutput(JSON.stringify({
    score: 82,
    tags: ['macro', 'tempo'],
    nested: { turn: 'baron' }
  }))

  assert.equal(parsed.status, 'parsed')
  assert.equal(parsed.title, null)
  assert.match(parsed.summary, /"score":82/)
  assert.ok(parsed.summary.length <= 160)
})

test('malformed output JSON does not throw and returns an invalid summary', async () => {
  const parsed = await withMutedWarnings(() => parseAiAnalysisOutput('{bad-json'))

  assert.equal(parsed.status, 'invalid')
  assert.equal(parsed.title, null)
  assert.equal(parsed.summary, '无法解析的分析结果')
  assert.deepEqual(parsed.highlights, [])
})

test('analysis type and timestamp are formatted for display', () => {
  assert.equal(formatAnalysisType('pre_game'), '赛前分析')
  assert.equal(formatAnalysisType('POST_GAME_REVIEW'), '赛后复盘')
  assert.equal(formatAnalysisType('coach_weekly'), '电子教练')
  assert.equal(formatAnalysisType('fun_mode'), '娱乐分析')
  assert.equal(formatAnalysisType('custom_drill'), 'Custom Drill')
  assert.match(formatAnalysisTime('2026-04-29T08:30:00.000Z'), /2026/)
})

test('loading local AI analysis results skips the database when account puuid is missing', async () => {
  let called = false
  const database = {
    listAnalysisResultsByAccount: async () => {
      called = true
      return { success: true, data: [] }
    }
  } as Pick<LocalDatabaseAPI, 'listAnalysisResultsByAccount'>

  const result = await loadLocalAiAnalysisResults('', {
    database
  })

  assert.equal(called, false)
  assert.deepEqual(result, {
    results: [],
    unavailable: false,
    error: null
  })
})

test('loading local AI analysis results maps database records and preserves query options', async () => {
  const calls: unknown[] = []
  const database = {
    listAnalysisResultsByAccount: async (accountPuuid: string, options: unknown) => {
      calls.push({ accountPuuid, options })
      return { success: true, data: [savedResult] }
    }
  } as Pick<LocalDatabaseAPI, 'listAnalysisResultsByAccount'>

  const result = await loadLocalAiAnalysisResults('account-puuid', {
    limit: 20,
    offset: 0,
    database
  })

  assert.equal(result.unavailable, false)
  assert.equal(result.error, null)
  assert.equal(result.results.length, 1)
  assert.equal(result.results[0]?.analysisTypeLabel, '赛后复盘')
  assert.equal(result.results[0]?.output.title, 'Post-game review')
  assert.deepEqual(calls, [
    {
      accountPuuid: 'account-puuid',
      options: {
        limit: 20,
        offset: 0
      }
    }
  ])
})

test('loading local AI analysis results uses browser storage when the Electron database API is unavailable', async () => {
  const storage = createMemoryStorage()
  const input: AiAnalysisResultInput = {
    accountPuuid: 'account-puuid',
    matchId: '998877',
    analysisType: 'postgame_review',
    subjectKey: 'postgame:review',
    gameVersion: null,
    modelName: 'deepseek-v4-flash',
    promptVersion: 'postgame_review_result.v1',
    inputHash: 'hash-browser-fallback',
    outputJson: savedResult.outputJson
  }
  const saved = saveFallbackAiAnalysisResult(input, storage, new Date('2026-05-20T12:00:00.000Z'))
  assert.equal(saved.success, true)

  const result = await loadLocalAiAnalysisResults('account-puuid', {
    limit: 20,
    offset: 0,
    database: null,
    storage
  })

  assert.equal(result.unavailable, false)
  assert.equal(result.error, null)
  assert.equal(result.results.length, 1)
  assert.equal(result.results[0]?.analysisType, 'postgame_review')
  assert.equal(result.results[0]?.inputHash, 'hash-browser-fallback')
})

test('loading local AI analysis results drops legacy rankpeek-server mock fallback records', async () => {
  const storage = createMemoryStorage()
  saveFallbackAiAnalysisResult({
    accountPuuid: 'account-puuid',
    matchId: '998877',
    analysisType: 'postgame_review',
    subjectKey: 'postgame:review',
    gameVersion: null,
    modelName: 'mock',
    promptVersion: 'postgame_review_result.v1',
    inputHash: 'hash-legacy-mock',
    outputJson: JSON.stringify({
      schemaVersion: 'postgame_ai_run_output.v2',
      analysisType: 'postgame',
      mode: 'review',
      rawOutputText: 'rankpeek-server mock generated before DeepSeek was enabled.',
      completedAt: '2026-05-20T12:00:00.000Z',
      usage: null,
      costCny: null,
      streamState: 'completed',
      match: { matchId: '998877' }
    })
  }, storage, new Date('2026-05-20T12:00:00.000Z'))

  const result = await loadLocalAiAnalysisResults('account-puuid', {
    limit: 20,
    offset: 0,
    database: null,
    storage
  })

  assert.equal(result.unavailable, false)
  assert.deepEqual(result.results, [])
})

test('loading local AI analysis results merges browser fallback records when the Electron database is empty', async () => {
  const storage = createMemoryStorage()
  const input: AiAnalysisResultInput = {
    accountPuuid: 'account-puuid',
    matchId: '998877',
    analysisType: 'postgame_review',
    subjectKey: 'postgame:review',
    gameVersion: null,
    modelName: 'deepseek-v4-flash',
    promptVersion: 'postgame_review_result.v1',
    inputHash: 'hash-fallback-after-db-failure',
    outputJson: savedResult.outputJson
  }
  saveFallbackAiAnalysisResult(input, storage, new Date('2026-05-20T12:00:00.000Z'))

  const database = {
    listAnalysisResultsByAccount: async () => ({
      success: true as const,
      data: []
    })
  } as Pick<LocalDatabaseAPI, 'listAnalysisResultsByAccount'>

  const result = await loadLocalAiAnalysisResults('account-puuid', {
    limit: 20,
    offset: 0,
    database,
    storage
  })

  assert.equal(result.unavailable, false)
  assert.equal(result.error, null)
  assert.equal(result.results.length, 1)
  assert.equal(result.results[0]?.inputHash, 'hash-fallback-after-db-failure')
})

test('loading local AI analysis results keeps review and praise records with the same snapshot hash', async () => {
  const storage = createMemoryStorage()
  saveFallbackAiAnalysisResult({
    accountPuuid: 'account-puuid',
    matchId: '998877',
    analysisType: 'postgame_praise',
    subjectKey: 'postgame:praise',
    gameVersion: null,
    modelName: 'deepseek-v4-flash',
    promptVersion: 'postgame_praise.v1',
    inputHash: 'shared-postgame-hash',
    outputJson: savedResult.outputJson
  }, storage, new Date('2026-05-20T12:01:00.000Z'))

  const databaseReview: AiAnalysisResult = {
    ...savedResult,
    id: 99,
    analysisType: 'postgame_review',
    subjectKey: 'postgame:review',
    inputHash: 'shared-postgame-hash',
    createdAt: '2026-05-20T12:00:00.000Z',
    updatedAt: '2026-05-20T12:00:00.000Z'
  }
  const database = {
    listAnalysisResultsByAccount: async () => ({
      success: true as const,
      data: [databaseReview]
    })
  } as Pick<LocalDatabaseAPI, 'listAnalysisResultsByAccount'>

  const result = await loadLocalAiAnalysisResults('account-puuid', {
    limit: 20,
    offset: 0,
    database,
    storage
  })

  assert.equal(result.unavailable, false)
  assert.deepEqual(
    result.results.map(item => item.analysisType).sort(),
    ['postgame_praise', 'postgame_review']
  )
  assert.equal(result.results.every(item => item.inputHash === 'shared-postgame-hash'), true)
})

test('fallback AI analysis store deletes selected account records by analysis types', async () => {
  const storage = createMemoryStorage()
  for (const [analysisType, accountPuuid] of [
    ['postgame_review', 'account-puuid'],
    ['postgame_praise', 'account-puuid'],
    ['coach_summary', 'account-puuid'],
    ['match_summary', 'account-puuid'],
    ['postgame_review', 'other-puuid']
  ] as const) {
    saveFallbackAiAnalysisResult({
      accountPuuid,
      matchId: analysisType === 'coach_summary' ? null : `${accountPuuid}-${analysisType}`,
      analysisType,
      inputHash: `${accountPuuid}-${analysisType}`,
      outputJson: savedResult.outputJson
    }, storage)
  }

  const deleted = deleteFallbackAiAnalysisResultsByAccount('account-puuid', {
    analysisTypes: ['postgame_review', 'postgame_praise', 'coach_summary']
  }, storage)
  assert.equal(deleted.success, true)
  assert.equal(deleted.success ? deleted.data.deletedCount : -1, 3)

  const accountResults = await loadLocalAiAnalysisResults('account-puuid', {
    limit: 20,
    offset: 0,
    database: null,
    storage
  })
  assert.deepEqual(accountResults.results.map(result => result.analysisType), ['match_summary'])

  const otherResults = await loadLocalAiAnalysisResults('other-puuid', {
    limit: 20,
    offset: 0,
    database: null,
    storage
  })
  assert.equal(otherResults.results.length, 1)
  assert.equal(otherResults.results[0]?.analysisType, 'postgame_review')
})

test('postgame AI run envelope parses raw result without surfacing engineering metadata in history cards', () => {
  const rawOutputText = JSON.stringify({
    schemaVersion: 'postgame_review_result.v1',
    levels: [
      { label: '夯', players: [{ playerRef: 'player:1', championName: '盲僧', championId: 64, phrase: '节奏发动机' }] },
      { label: '顶级', players: [{ playerRef: 'player:2', championName: '阿狸', championId: 103, phrase: '中路线权稳定' }] },
      { label: '人上人', players: [
        { playerRef: 'player:3', championName: '凯南', championId: 85, phrase: '团战进场够狠' },
        { playerRef: 'player:4', championName: '金克丝', championId: 222, phrase: '收割完成度高' }
      ] },
      { label: 'NPC', players: [
        { playerRef: 'player:5', championName: '璐璐', championId: 117, phrase: '保护任务完成' },
        { playerRef: 'player:6', championName: '诺手', championId: 122, phrase: '边线压力一般' },
        { playerRef: 'player:7', championName: '豹女', championId: 76, phrase: '资源节奏断档' }
      ] },
      { label: '拉完了', players: [
        { playerRef: 'player:8', championName: '亚索', championId: 157, phrase: '死亡窗口太多' },
        { playerRef: 'player:9', championName: '女警', championId: 51, phrase: '输出空间不足' },
        { playerRef: 'player:10', championName: '锤石', championId: 412, phrase: '先手质量偏低' }
      ] }
    ],
    summary: '这局胜负手在中期资源团，我方打野和中单连续拿到主动权。'
  })
  const parsed = parseAiAnalysisOutput(JSON.stringify({
    schemaVersion: 'postgame_ai_run_output.v1',
    analysisType: 'postgame',
    mode: 'review',
    rawOutputText,
    completedAt: '2026-05-20T12:00:30.000Z',
    streamState: 'completed',
    usage: {
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      promptTokens: 3000,
      completionTokens: 400,
      totalTokens: 3400,
      promptCacheHitTokens: 1000,
      promptCacheMissTokens: 2000,
      cost: {
        currency: 'CNY',
        inputCacheHitCny: 0.00002,
        inputCacheMissCny: 0.002,
        outputCny: 0.0008,
        totalCny: 0.00282,
        pricing: {
          inputCacheHitCnyPerMillionTokens: 0.02,
          inputCacheMissCnyPerMillionTokens: 1,
          outputCnyPerMillionTokens: 2
        }
      }
    },
    costCny: {
      currency: 'CNY',
      inputCacheHitCny: 0.00002,
      inputCacheMissCny: 0.002,
      outputCny: 0.0008,
      totalCny: 0.00282,
      pricing: {
        inputCacheHitCnyPerMillionTokens: 0.02,
        inputCacheMissCnyPerMillionTokens: 1,
        outputCnyPerMillionTokens: 2
      }
    },
    match: {
      matchId: '998877',
      queueId: 420,
      championId: 64,
      championName: '盲僧',
      win: true,
      gameCreation: 1779278400000,
      gameDuration: 1888
    }
  }))

  assert.equal(parsed.status, 'parsed')
  assert.equal(parsed.title, '盲僧 · 胜利')
  assert.match(parsed.summary, /中期资源团/)
  assert.equal(parsed.postgameRun?.mode, 'review')
  assert.equal(parsed.postgameRun?.usage?.promptTokens, 3000)
  assert.equal(parsed.postgameRun?.costCny?.totalCny, 0.00282)
  assert.deepEqual(parsed.highlights, [])
})

test('postgame review run envelope uses partial structured summary instead of raw JSON in history cards', () => {
  const rawOutputText = `DeepSeek 分析
{
  "schemaVersion": "postgame_review_result.v1",
  "levels": [
    { "label": "夯", "players": [
      { "playerRef": "敌方打野｜铁血狼母", "championName": "铁血狼母", "phrase": "全场最高击钱，7连杀，节奏碾压全场。" }
    ] },
    { "label": "顶级", "players": [
      { "playerRef": "法外狂徒", "championName": "法外狂徒", "phrase": "中野联动压制力强。" },
      { "playerRef": "探险家", "championName": "探险家", "phrase": "对线期经济领先。" },
      { "playerRef": "荒漠屠夫", "championName": "荒漠屠夫", "phrase": "助攻第一，边线单带压制。" },
      { "playerRef": "流光镜影", "championName": "流光镜影", "phrase": "团队视野压制明显。" }
    ] },
    { "label": "人上人", "players": [
      { "playerRef": "奥术先驱", "championName": "奥术先驱", "phrase": "但阵亡过多，节奏难以为继。" },
      { "playerRef": "爆炎雏龙", "championName": "爆炎雏龙", "phrase": "队内扛输出第一。" }
    ] },
    { "label": "NPC", "players": [
      { "playerRef": "腕豪", "championName": "腕豪", "phrase": "参团率偏低，边路崩盘。" },
      { "playerRef": "放逐之刃", "championName": "放逐之刃", "phrase": "多次资源团前阵亡。" }
    ] },
    { "label": "拉完了", "players": [
      { "playerRef": "你｜我方中单｜德玛西亚之翼", "championName": "德玛西亚之翼", "phrase": "全场死亡最多，经济落后。" }
    ] }
  ],
  "summary": "本局敌方打野前期连续起节奏，我方中期资源交换被压制，最后一波推进前整体`

  const parsed = parseAiAnalysisOutput(JSON.stringify({
    schemaVersion: 'postgame_ai_run_output.v1',
    analysisType: 'postgame',
    mode: 'review',
    rawOutputText,
    completedAt: '2026-05-22T05:08:25.865Z',
    streamState: 'completed',
    usage: null,
    costCny: null,
    match: {
      matchId: '10946133543',
      queueId: 420,
      championId: 133,
      championName: '德玛西亚之翼',
      win: false,
      gameCreation: 1779206481827,
      gameDuration: 1745
    }
  }))

  assert.equal(parsed.status, 'parsed')
  assert.equal(parsed.title, '德玛西亚之翼 · 失败')
  assert.equal(parsed.summary, '本局敌方打野前期连续起节奏，我方中期资源交换被压制，最后一波推进前整体')
  assert.doesNotMatch(parsed.summary, /DeepSeek|schemaVersion|levels|playerRef/)
  assert.equal(parsed.postgameRun?.mode, 'review')
})

test('postgame praise run envelope keeps praise text as the history summary', () => {
  const parsed = parseAiAnalysisOutput(JSON.stringify({
    schemaVersion: 'postgame_ai_run_output.v1',
    analysisType: 'postgame',
    mode: 'praise',
    rawOutputText: '你这把已经尽力了，输赢不该让你背锅。',
    completedAt: '2026-05-20T12:02:00.000Z',
    streamState: 'completed',
    usage: null,
    costCny: null,
    match: {
      matchId: '998877',
      queueId: 420,
      championId: 64,
      championName: '盲僧',
      win: false,
      gameCreation: 1779278400000,
      gameDuration: 1888
    }
  }))

  assert.equal(parsed.status, 'parsed')
  assert.equal(parsed.title, '盲僧 · 失败')
  assert.match(parsed.summary, /尽力/)
  assert.equal(parsed.postgameRun?.mode, 'praise')
  assert.deepEqual(parsed.highlights, [])
})

test('postgame praise run envelope uses structured praise body for the history summary', () => {
  const parsed = parseAiAnalysisOutput(JSON.stringify({
    schemaVersion: 'postgame_ai_run_output.v1',
    analysisType: 'postgame',
    mode: 'praise',
    rawOutputText: JSON.stringify({
      schemaVersion: 'postgame_praise_result.v1',
      headline: '这把真不能全怪你',
      body: '你这把已经把能做的事做了，中期局势断掉以后，本来就不是一个人能硬拽回来的局。'
    }),
    completedAt: '2026-05-20T12:02:00.000Z',
    streamState: 'completed',
    usage: null,
    costCny: null,
    match: {
      matchId: '998877',
      queueId: 420,
      championId: 64,
      championName: '盲僧',
      win: false,
      gameCreation: 1779278400000,
      gameDuration: 1888
    }
  }))

  assert.equal(parsed.status, 'parsed')
  assert.equal(parsed.title, '盲僧 · 失败')
  assert.equal(parsed.summary, '你这把已经把能做的事做了，中期局势断掉以后，本来就不是一个人能硬拽回来的局。')
  assert.equal(parsed.postgamePraise?.headline, '你这把已经把能做的事做了')
  assert.equal(parsed.postgamePraise?.body, '你这把已经把能做的事做了，中期局势断掉以后，本来就不是一个人能硬拽回来的局。')
  assert.doesNotMatch(parsed.summary, /schemaVersion|headline|body/)
  assert.equal(parsed.postgameRun?.mode, 'praise')
  assert.deepEqual(parsed.highlights, [])
})

const coachSummaryReport = {
  schemaVersion: 'coach_summary_report.v1',
  analysisType: 'coach_summary',
  inputHash: 'hash-coach',
  headline: '贝蕾亚波动偏高',
  title: '近20场排位电子教练简报',
  summary: '近20局中野节奏有起伏，死亡集中在资源刷新前。',
  overview: {
    totalMatches: 20,
    wins: 11,
    losses: 9,
    winRate: 55,
    summary: '主玩打野，贝蕾亚和凯隐占比最高。',
    primaryRoles: [{ role: 'JUNGLE', count: 16 }],
    rpTrend: [
      {
        matchRef: 'm20',
        score: 5.8,
        championId: 233,
        championDisplayName: '贝蕾亚',
        result: 'win',
        trendLabel: '稳稳当当不掉线',
        kdaText: '6/3/8'
      },
      {
        matchRef: 'm19',
        score: 7.1,
        championId: 141,
        championDisplayName: '凯隐',
        result: 'loss'
      }
    ],
    heroStats: [
      {
        championId: 233,
        championCanonicalName: 'Briar',
        championDisplayName: '贝蕾亚',
        role: 'JUNGLE',
        games: 8,
        wins: 4,
        losses: 4,
        winRate: 50,
        kda: '7.1 / 6.0 / 8.4',
        averageKda: 2.58
      }
    ],
    roleStats: [
      { role: 'JUNGLE', games: 16, wins: 9, losses: 7, winRate: 56.25 }
    ]
  },
  verdict: {
    label: '中期死亡拖慢节奏',
    score: 72,
    confidence: 'medium',
    summary: '优势局需要提前处理资源团前站位。'
  },
  keyFindings: [
    {
      id: 'death-before-objective',
      priority: 'high',
      category: 'death',
      claim: '资源刷新前死亡偏多',
      evidence: '20局中有多次资源前120秒死亡。',
      reasoning: '死亡窗口让队伍失去布控和先手。',
      advice: '资源刷新前先推线再进河道。',
      confidence: 'medium',
      evidenceRefs: ['aggregate.objectiveDeaths']
    }
  ],
  trainingPlan: [
    {
      focus: '资源前站位',
      why: '减少资源团前掉点。',
      nextGames: 5,
      task: '资源刷新前45秒避免单人脸探。',
      metricToTrack: 'objective_deaths_before_120s',
      target: '5局内不超过1次',
      priority: 'high'
    }
  ],
  championAdvice: [
    {
      championName: 'Briar',
      role: 'JUNGLE',
      recommendation: 'practice',
      reason: '样本最多但死亡波动偏高。',
      confidence: 'medium'
    }
  ],
  chartBlocks: [
    {
      id: 'hero-winrate',
      title: '主玩英雄胜率',
      kind: 'bar',
      placement: 'overview',
      data: [
        { champion: '贝蕾亚', games: 8, winRate: 50 },
        { champion: '凯隐', games: 6, winRate: 67 }
      ],
      labelKey: 'champion',
      valueKey: 'winRate',
      intent: '对比主玩英雄胜率',
      interpretation: '凯隐更稳定。',
      evidenceRefs: ['overview.heroStats']
    },
    {
      id: 'kda-trend',
      title: 'KDA 趋势',
      kind: 'line',
      placement: 'analysis',
      data: [
        { match: 1, kda: 2.1 },
        { match: 2, kda: 3.4 }
      ],
      xKey: 'match',
      yKeys: ['kda'],
      intent: '观察近期 KDA 波动',
      evidenceRefs: ['aggregate.kdaTrend']
    },
    {
      id: 'future-chart',
      title: '经济差趋势',
      kind: 'line',
      placement: 'analysis',
      dataRef: 'aggregate.goldDiffTrend',
      intent: '后续由确定性聚合提供曲线',
      evidenceRefs: ['aggregate.goldDiffTrend']
    }
  ],
  warnings: [],
  finalSummary: '接下来一周先把资源前死亡压下来。',
  metadata: {
    modelName: 'deepseek-placeholder',
    promptVersion: 'coach_summary.prompt.v1',
    generatedAt: '2026-05-12T00:00:00Z',
    snapshotSchemaVersion: 'coach_summary.v1',
    dataQualityConfidence: 'medium',
    generatedInputAt: '2026-05-11T23:58:00.000Z',
    latestMatchTimestamp: 1_800_000_000_000,
    latestMatchRef: 'm01'
  }
}

test('coach summary report v1 output parses structured overview and chart blocks', () => {
  const parsed = parseCoachSummaryReportOutput(JSON.stringify(coachSummaryReport))

  assert.equal(parsed.status, 'parsed')
  assert.equal(parsed.report?.schemaVersion, 'coach_summary_report.v1')
  assert.equal(parsed.report?.overview?.heroStats?.[0]?.championDisplayName, '贝蕾亚')
  assert.equal(parsed.report?.overview?.roleStats?.[0]?.role, 'JUNGLE')
  assert.equal(parsed.report?.overview?.rpTrend?.length, 2)
  assert.equal(parsed.report?.overview?.rpTrend?.[0]?.matchRef, 'm20')
  assert.equal(parsed.report?.overview?.rpTrend?.[0]?.score, 5.8)
  assert.equal(parsed.report?.overview?.rpTrend?.[0]?.championId, 233)
  assert.equal(parsed.report?.overview?.rpTrend?.[0]?.championDisplayName, '贝蕾亚')
  assert.equal(parsed.report?.overview?.rpTrend?.[0]?.result, 'win')
  assert.equal(parsed.report?.overview?.rpTrend?.[0]?.trendLabel, '稳稳当当不掉线')
  assert.equal(parsed.report?.overview?.rpTrend?.[0]?.kdaText, '6/3/8')
  assert.equal(parsed.report?.chartBlocks?.length, 3)
  assert.equal(parsed.report?.chartBlocks?.[2]?.dataRef, 'aggregate.goldDiffTrend')
  assert.equal(parsed.report?.metadata.generatedInputAt, '2026-05-11T23:58:00.000Z')
  assert.equal(parsed.report?.metadata.latestMatchTimestamp, 1_800_000_000_000)
  assert.equal(parsed.report?.metadata.latestMatchRef, 'm01')
})

test('coach report headline uses product fallback order and preserves full fallback title', () => {
  assert.equal(getCoachReportHeadline({ report: coachSummaryReport }), '贝蕾亚波动偏高')
  assert.equal(getCoachReportHeadline({ report: { ...coachSummaryReport, headline: '', cardTitle: '凯隐纳亚菲利更稳' } }), '凯隐纳亚菲利更稳')
  assert.equal(getCoachReportHeadline({ report: { ...coachSummaryReport, headline: '', cardTitle: '', shortTitle: '中期死亡拖慢节奏' } }), '中期死亡拖慢节奏')
  assert.equal(getCoachReportHeadline({ report: { ...coachSummaryReport, headline: '', cardTitle: '', shortTitle: '', verdict: { ...coachSummaryReport.verdict, label: '资源团前掉点偏多' } } }), '资源团前掉点偏多')

  const fallbackTitle = getCoachReportHeadline({
    report: {
      ...coachSummaryReport,
      headline: '',
      cardTitle: '',
      shortTitle: '',
      verdict: { ...coachSummaryReport.verdict, label: '' },
      title: '近20场排位电子教练简报：这是一段非常长的模板标题，首页不应该完整展示'
    }
  })
  assert.equal(fallbackTitle, '这是一段非常长的模板标题，首页不应该完整展示')
})

test('coach report headline uses AI title summary instead of generic local coach titles', () => {
  assert.equal(getCoachReportHeadline({
    report: {
      ...coachSummaryReport,
      headline: '',
      cardTitle: '近20局排位数据分析',
      shortTitle: '',
      verdict: { ...coachSummaryReport.verdict, label: '整体表现良好' },
      title: '20局排位数据分析：打野英雄池波动，辅助胜率稳定'
    }
  }), '打野英雄池波动，辅助胜率稳定')
})

test('coach report headline never uses grade-like verdict labels as the card title', () => {
  assert.notEqual(getCoachReportHeadline({
    report: {
      ...coachSummaryReport,
      headline: '',
      cardTitle: '',
      shortTitle: '',
      verdict: { ...coachSummaryReport.verdict, label: 'B-' }
    }
  }), 'B-')
})

test('coach report headline does not evaluate missing fallback strings as render errors', () => {
  assert.equal(getCoachReportHeadline({
    report: {
      ...coachSummaryReport,
      headline: '',
      cardTitle: '20 games, 12 wins',
      shortTitle: '',
      verdict: { ...coachSummaryReport.verdict, label: 'B-' },
      title: null,
      summary: null
    }
  }), '20 games, 12 wins')
})

test('coach report final sentence uses finalSummary first sentence for modal header', () => {
  assert.equal(
    getCoachReportFinalSentence({
      ...coachSummaryReport,
      finalSummary: '中期团战筑造优势。后续先压低团前死亡。',
      verdict: { ...coachSummaryReport.verdict, summary: '不应该优先显示这句。' }
    }),
    '中期团战筑造优势。'
  )
})

test('coach report final sentence falls back to verdict summary first sentence', () => {
  assert.equal(
    getCoachReportFinalSentence({
      ...coachSummaryReport,
      finalSummary: '',
      verdict: { ...coachSummaryReport.verdict, summary: '资源团前先站稳！第二句不展示。' }
    }),
    '资源团前先站稳！'
  )
})

test('coach report final sentence trims long text and appends punctuation when needed', () => {
  const sentence = getCoachReportFinalSentence({
    ...coachSummaryReport,
    finalSummary: '中期资源团站位和视野联动已经能稳定筑造优势但还需要控制追击成本'
  })

  assert.ok(sentence.length <= 25)
  assert.match(sentence, /…$/)
  assert.doesNotMatch(sentence, /开发环境|DEV|预览说明/)

  assert.equal(
    getCoachReportFinalSentence({
      ...coachSummaryReport,
      finalSummary: '',
      verdict: { ...coachSummaryReport.verdict, label: '', summary: '' },
      cardTitle: '',
      shortTitle: '',
      headline: '中期团战筑造优势'
    }),
    '中期团战筑造优势。'
  )
})

test('coach report final sentence prefers report titles over verdict label', () => {
  const sentence = getCoachReportFinalSentence({
    ...coachSummaryReport,
    finalSummary: '',
    verdict: {
      ...coachSummaryReport.verdict,
      summary: '',
      label: 'verdict label should not win'
    },
    headline: 'Headline should win'
  })

  assert.match(sentence, /^Headline should win/)
  assert.doesNotMatch(sentence, /verdict label should not win/)
})

test('coach chart blocks normalize malformed values without throwing', () => {
  const blocks = normalizeCoachChartBlocks([
    coachSummaryReport.chartBlocks[0],
    { id: 'bad-kind', title: '坏图', kind: 'pie', placement: 'overview', data: [{ x: 1 }], evidenceRefs: [] },
    { id: 'bad-placement', title: '坏位置', kind: 'bar', placement: 'sidecar', data: [{ x: 1 }], evidenceRefs: [] },
    { id: 'bad-data', title: '坏数据', kind: 'bar', placement: 'analysis', data: ['nope'], evidenceRefs: [42] },
    { id: 'legacy', title: '旧字段图表', type: 'gold_curve', dataRef: 'matches[*].economyTimeline', description: '旧 schema 图表', highlight: '先保留 dataRef' }
  ])

  assert.equal(blocks.length, 3)
  assert.equal(blocks[0]?.kind, 'bar')
  assert.equal(blocks[1]?.kind, 'bar')
  assert.equal(blocks[1]?.data, undefined)
  assert.equal(blocks[1]?.evidenceRefs.length, 0)
  assert.equal(blocks[2]?.placement, 'analysis')
  assert.equal(blocks[2]?.dataRef, 'matches[*].economyTimeline')
})

test('unsupported or malformed coach summary JSON does not throw', async () => {
  const malformed = await withMutedWarnings(() => parseCoachSummaryReportOutput('{bad-json'))
  const unsupported = parseCoachSummaryReportOutput(JSON.stringify({ schemaVersion: 'other', analysisType: 'coach_summary' }))

  assert.equal(malformed.status, 'invalid')
  assert.equal(unsupported.status, 'unsupported')
  assert.equal(malformed.report, null)
  assert.equal(unsupported.report, null)
})
