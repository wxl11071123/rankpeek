import test from 'node:test'
import assert from 'node:assert/strict'
import type { AiAnalysisResult, AiAnalysisResultInput } from '../types/localDatabase.ts'
import type { MatchHistory } from '../types/api.ts'
import type { PostgameAiInputSnapshot } from './postgameAiInputSnapshot.ts'
import type { PostgameAiTokenUsage } from './postgameAiServerStream.ts'
import {
  createPostgameAiRunResultPayload,
  parsePostgameAiRunOutput,
  savePostgameAiRunResultToLocal
} from './postgameAiRunPersistence.ts'
import {
  listFallbackAiAnalysisResultsByAccount,
  type BrowserAiAnalysisStorage
} from './localAiAnalysisFallbackStore.ts'

const rawReviewOutput = JSON.stringify({
  schemaVersion: 'postgame_review_result.v1',
  levels: [
    { label: '夯', players: [{ playerRef: 'player:1', championName: '盲僧', championId: 64, phrase: '节奏发动机' }] },
    { label: '顶级', players: [{ playerRef: 'player:2', championName: '阿狸', championId: 103, phrase: '中路线权稳定' }] },
    {
      label: '人上人',
      players: [
        { playerRef: 'player:3', championName: '凯南', championId: 85, phrase: '团战进场够狠' },
        { playerRef: 'player:4', championName: '金克丝', championId: 222, phrase: '收割完成度高' }
      ]
    },
    {
      label: 'NPC',
      players: [
        { playerRef: 'player:5', championName: '璐璐', championId: 117, phrase: '保护任务完成' },
        { playerRef: 'player:6', championName: '诺手', championId: 122, phrase: '边线压力一般' },
        { playerRef: 'player:7', championName: '豹女', championId: 76, phrase: '资源节奏断档' }
      ]
    },
    {
      label: '拉完了',
      players: [
        { playerRef: 'player:8', championName: '亚索', championId: 157, phrase: '死亡窗口太多' },
        { playerRef: 'player:9', championName: '女警', championId: 51, phrase: '输出空间不足' },
        { playerRef: 'player:10', championName: '锤石', championId: 412, phrase: '先手质量偏低' }
      ]
    }
  ],
  summary: '这局胜负手在中期资源团，我方打野和中单连续拿到主动权，敌方下路组没有打出足够输出空间。'
})

const usage: PostgameAiTokenUsage = {
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
}

const snapshot: PostgameAiInputSnapshot = {
  schemaVersion: 'postgame_ai_input_snapshot.v3',
  analysisType: 'postgame',
  builtAt: '2026-05-20T12:00:00.000Z',
  inputHash: 'snapshot-hash-1',
  analysisBrief: {
    schemaVersion: 'postgame_analysis_brief.v1',
    language: 'zh-CN',
    matchFacts: ['这段 brief 不应该被保存'],
    teamFacts: [],
    playerFacts: ['召唤师名和 PUUID 不应该进入本地结果 envelope'],
    timelineFacts: [],
    dataQualityFacts: []
  }
}

const matchHistory = {
  gameId: 998877,
  gameMode: 'CLASSIC',
  gameType: 'MATCHED_GAME',
  queueId: 420,
  queueName: '单双排',
  gameDuration: 1888,
  gameCreation: 1779278400000,
  platformId: 'HN1',
  participants: [
    {
      participantId: 1,
      teamId: 100,
      championId: 64,
      stats: { win: true }
    }
  ],
  participantIdentities: [
    {
      participantId: 1,
      player: {
        puuid: 'account-puuid',
        gameName: 'ShouldNotPersist',
        tagLine: 'CN1'
      }
    }
  ]
} as MatchHistory

function savedAnalysis(input: AiAnalysisResultInput, id = 91): AiAnalysisResult {
  return {
    id,
    accountPuuid: input.accountPuuid,
    matchId: input.matchId ?? null,
    analysisType: input.analysisType,
    subjectKey: input.subjectKey ?? null,
    gameVersion: input.gameVersion ?? null,
    modelName: input.modelName ?? null,
    promptVersion: input.promptVersion ?? null,
    inputHash: input.inputHash ?? null,
    outputJson: typeof input.outputJson === 'string' ? input.outputJson : JSON.stringify(input.outputJson),
    createdAt: '2026-05-20T12:01:00.000Z',
    updatedAt: '2026-05-20T12:01:00.000Z'
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

test('postgame AI run payload stores raw output and metadata without the snapshot body', () => {
  const payload = createPostgameAiRunResultPayload({
    accountPuuid: ' account-puuid ',
    mode: 'review',
    rawOutputText: rawReviewOutput,
    completedAt: '2026-05-20T12:00:30.000Z',
    usage,
    snapshot,
    matchHistory,
    championNamesById: { 64: '盲僧' }
  })

  assert.equal(payload.accountPuuid, 'account-puuid')
  assert.equal(payload.analysisType, 'postgame_review')
  assert.equal(payload.matchId, '998877')
  assert.equal(payload.subjectKey, 'postgame:review')
  assert.equal(payload.modelName, 'deepseek-v4-flash')
  assert.equal(payload.inputHash, 'snapshot-hash-1')

  const outputText = JSON.stringify(payload.outputJson)
  assert.match(outputText, /postgame_ai_run_output\.v2/)
  assert.match(outputText, /rawOutputText/)
  assert.match(outputText, /deepseek-v4-flash/)
  assert.match(outputText, /0\.00282/)
  assert.doesNotMatch(outputText, /analysisBrief|matchFacts|playerFacts|ShouldNotPersist|account-puuid/)

  const output = payload.outputJson as Record<string, unknown>
  assert.equal(output.rawOutputText, rawReviewOutput)
  assert.deepEqual(output.usage, usage)
  assert.deepEqual(output.costCny, usage.cost)
  assert.deepEqual(output.match, {
    matchId: '998877',
    queueId: 420,
    queueName: '单双排',
    championId: 64,
    championName: '盲僧',
    win: true,
    position: null,
    kills: null,
    deaths: null,
    assists: null,
    gameCreation: 1779278400000,
    gameDuration: 1888
  })
})

test('postgame AI run payload can persist minimal review roster data for history icon mapping', () => {
  const payload = createPostgameAiRunResultPayload({
    accountPuuid: 'account-puuid',
    mode: 'review',
    rawOutputText: rawReviewOutput,
    completedAt: '2026-05-20T12:00:30.000Z',
    usage,
    snapshot,
    matchHistory,
    championNamesById: { 64: '鐩插儳' },
    rosterPlayers: [
      {
        playerRef: '我方打野｜百裂冥犬',
        championName: '百裂冥犬',
        championId: 910,
        side: '我方',
        role: '打野',
        isSelf: true,
        iconUrl: 'https://example.invalid/should-not-persist.png'
      }
    ]
  })

  const output = payload.outputJson as Record<string, unknown>
  assert.deepEqual(output.rosterPlayers, [
    {
      playerRef: '我方打野｜百裂冥犬',
      championName: '百裂冥犬',
      championId: 910,
      side: '我方',
      role: '打野',
      isSelf: true
    }
  ])
  assert.doesNotMatch(JSON.stringify(output), /should-not-persist|puuid|summonerName|gameName/)
})

test('praise mode changes only the stored analysis type and mode metadata', () => {
  const payload = createPostgameAiRunResultPayload({
    accountPuuid: 'account-puuid',
    mode: 'praise',
    rawOutputText: '你这把已经尽力了，输赢不该让你背锅。',
    completedAt: '2026-05-20T12:02:00.000Z',
    usage,
    snapshot,
    matchHistory,
    championNamesById: { 64: '盲僧' }
  })

  assert.equal(payload.analysisType, 'postgame_praise')
  assert.equal(payload.subjectKey, 'postgame:praise')
  assert.equal(payload.promptVersion, 'postgame_praise_result.v1')
  assert.equal((payload.outputJson as Record<string, unknown>).mode, 'praise')
})

test('postgame AI run output parses back from the stored JSON envelope', () => {
  const payload = createPostgameAiRunResultPayload({
    accountPuuid: 'account-puuid',
    mode: 'review',
    rawOutputText: rawReviewOutput,
    completedAt: '2026-05-20T12:00:30.000Z',
    usage,
    snapshot,
    matchHistory,
    championNamesById: { 64: '盲僧' }
  })

  const parsed = parsePostgameAiRunOutput(JSON.stringify(payload.outputJson))

  assert.equal(parsed.status, 'parsed')
  assert.equal(parsed.run?.schemaVersion, 'postgame_ai_run_output.v2')
  assert.equal(parsed.run?.mode, 'review')
  assert.equal(parsed.run?.rawOutputText, rawReviewOutput)
  assert.equal(parsed.run?.usage?.promptTokens, 3000)
  assert.equal(parsed.run?.match.championName, '盲僧')
})

test('postgame AI run output parses saved review roster data for history rendering', () => {
  const parsed = parsePostgameAiRunOutput(JSON.stringify({
    schemaVersion: 'postgame_ai_run_output.v1',
    analysisType: 'postgame',
    mode: 'review',
    rawOutputText: rawReviewOutput,
    completedAt: '2026-05-20T12:00:30.000Z',
    usage: null,
    costCny: null,
    streamState: 'completed',
    match: {
      matchId: '998877',
      queueId: 420,
      championId: 910,
      championName: '百裂冥犬',
      win: false,
      gameCreation: 1779278400000,
      gameDuration: 1888
    },
    rosterPlayers: [
      {
        playerRef: '我方打野｜百裂冥犬',
        championName: '百裂冥犬',
        championId: 910,
        side: '我方',
        role: '打野',
        isSelf: true,
        iconUrl: 'https://example.invalid/ignored.png'
      }
    ]
  }))

  assert.equal(parsed.status, 'parsed')
  assert.deepEqual(parsed.run?.rosterPlayers, [
    {
      playerRef: '我方打野｜百裂冥犬',
      championName: '百裂冥犬',
      championId: 910,
      side: '我方',
      role: '打野',
      isSelf: true
    }
  ])
})

test('saving a postgame AI run writes one local database record and returns its id', async () => {
  const savedPayloads: AiAnalysisResultInput[] = []
  const result = await savePostgameAiRunResultToLocal({
    accountPuuid: 'account-puuid',
    mode: 'review',
    rawOutputText: rawReviewOutput,
    completedAt: '2026-05-20T12:00:30.000Z',
    usage,
    snapshot,
    matchHistory,
    championNamesById: { 64: '盲僧' },
    database: {
      saveAnalysisResult: async payload => {
        savedPayloads.push(payload)
        return {
          success: true,
          data: savedAnalysis(payload, 123)
        }
      }
    }
  })

  assert.deepEqual(result, {
    success: true,
    id: 123
  })
  assert.equal(savedPayloads.length, 1)
  assert.equal(savedPayloads[0]?.analysisType, 'postgame_review')
  assert.equal(savedPayloads[0]?.inputHash, 'snapshot-hash-1')
})

test('saving a postgame AI run falls back to browser storage when the Electron database API is unavailable', async () => {
  const storage = createMemoryStorage()
  const result = await savePostgameAiRunResultToLocal({
    accountPuuid: 'account-puuid',
    mode: 'review',
    rawOutputText: rawReviewOutput,
    completedAt: '2026-05-20T12:00:30.000Z',
    usage,
    snapshot,
    matchHistory,
    championNamesById: { 64: '鐩插儳' },
    database: null,
    storage
  })

  assert.equal(result.success, true)

  const stored = listFallbackAiAnalysisResultsByAccount('account-puuid', {
    limit: 20,
    offset: 0
  }, storage)
  assert.equal(stored.success, true)
  assert.equal(stored.success ? stored.data.length : 0, 1)
  assert.equal(stored.success ? stored.data[0]?.analysisType : '', 'postgame_review')
  assert.equal(stored.success ? stored.data[0]?.inputHash : '', 'snapshot-hash-1')
})

test('saving a postgame AI run falls back to browser storage when the Electron database write fails', async () => {
  const storage = createMemoryStorage()
  const result = await savePostgameAiRunResultToLocal({
    accountPuuid: 'account-puuid',
    mode: 'review',
    rawOutputText: rawReviewOutput,
    completedAt: '2026-05-20T12:00:30.000Z',
    usage,
    snapshot,
    matchHistory,
    championNamesById: { 64: '鐩插儳' },
    database: {
      saveAnalysisResult: async () => ({
        success: false,
        error: 'Invalid AI analysis payload'
      })
    },
    storage
  })

  assert.equal(result.success, true)

  const stored = listFallbackAiAnalysisResultsByAccount('account-puuid', {
    limit: 20,
    offset: 0
  }, storage)
  assert.equal(stored.success, true)
  assert.equal(stored.success ? stored.data.length : 0, 1)
  assert.equal(stored.success ? stored.data[0]?.analysisType : '', 'postgame_review')
})

test('saving a postgame AI run rejects missing account, raw output, hash, and database', async () => {
  const base = {
    accountPuuid: 'account-puuid',
    mode: 'review' as const,
    rawOutputText: rawReviewOutput,
    completedAt: '2026-05-20T12:00:30.000Z',
    usage,
    snapshot,
    matchHistory,
    championNamesById: { 64: '盲僧' },
    database: {
      saveAnalysisResult: async (payload: AiAnalysisResultInput) => ({
        success: true as const,
        data: savedAnalysis(payload)
      })
    }
  }

  assert.deepEqual(await savePostgameAiRunResultToLocal({ ...base, accountPuuid: '   ' }), {
    success: false,
    error: 'Missing accountPuuid'
  })
  assert.deepEqual(await savePostgameAiRunResultToLocal({ ...base, rawOutputText: '   ' }), {
    success: false,
    error: 'Missing rawOutputText'
  })
  assert.deepEqual(await savePostgameAiRunResultToLocal({
    ...base,
    snapshot: { ...snapshot, inputHash: '' }
  }), {
    success: false,
    error: 'Missing inputHash'
  })
  assert.deepEqual(await savePostgameAiRunResultToLocal({ ...base, database: null }), {
    success: false,
    error: 'Local database unavailable'
  })
})
