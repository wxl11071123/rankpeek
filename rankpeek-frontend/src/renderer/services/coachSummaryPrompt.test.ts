import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

const promptModuleUrl = new URL('./coachSummaryPrompt.ts', import.meta.url)

function makeSnapshot() {
  return {
    schemaVersion: 'coach_summary.v1',
    analysisType: 'coach_summary',
    inputHash: 'coach-input-hash',
    analysisBrief: {
      schemaVersion: 'coach_summary_analysis_brief.v1',
      language: 'zh-CN',
      text: [
        '20局总览：20局12胜8负，胜率60.0%，平均RP6.4，15分钟对位经济平均+88，参团率52.4%。',
        'RP终局序列：m01 7.2、m02 6.1、m03 RP不可用。',
        'm01 胜，卡尔玛 辅助，K/D/A 2/1/18，RP标签稳稳当当不掉线，RP终局7.2，参团率66.7%，伤害占比18.0%，视野45，补刀1.2/分，伤转率98.4%，15分钟对位经济+420。'
      ].join('\n'),
      overviewFacts: [],
      trendFacts: [],
      championFacts: [],
      roleFacts: [],
      matchFacts: [],
      dataQualityFacts: [],
      overallState: {
        state: 'good',
        label: '良好',
        reasons: ['12胜8负，胜率60.0%']
      }
    },
    dataQuality: {
      confidence: 'high',
      hasAllTimelines: true,
      hasAllParticipantDetails: true,
      hasAllRuneData: true,
      hasAllItemData: true,
      hasAnyRuneOrItemData: true,
      missingTimelineMatchRefs: [],
      missingParticipantDetailMatchRefs: [],
      missingRuneMatchRefs: [],
      missingItemMatchRefs: [],
      missingRuneOrItemMatchRefs: [],
      missingLaneOpponentMatchRefs: [],
      missingEconomyDiffMatchRefs: [],
      missingDataReasons: []
    },
    metadata: {
      generatedInputAt: '2026-05-25T12:00:00.000Z',
      matchRefs: ['m01'],
      anchorMatchRefs: ['m01'],
      source: 'local_sqlite'
    }
  }
}

test('coach summary prompt sends only the current 20-match analysis facts without coaching or history noise', async () => {
  assert.equal(existsSync(promptModuleUrl), true)
  const { buildCoachSummaryPromptPayload, COACH_SUMMARY_PROMPT_VERSION } = await import('./coachSummaryPrompt.ts')

  const payload = buildCoachSummaryPromptPayload({
    snapshot: makeSnapshot()
  })

  assert.equal(COACH_SUMMARY_PROMPT_VERSION, 'coach_summary.prompt.v4')
  assert.equal(payload.promptVersion, 'coach_summary.prompt.v4')
  assert.match(payload.systemPrompt, /近20局排位数据分析/)
  assert.match(payload.systemPrompt, /不教玩家打游戏/)
  assert.match(payload.systemPrompt, /只输出 JSON/)
  assert.match(payload.systemPrompt, /coach_summary_report\.v1/)
  assert.match(payload.systemPrompt, /顶层必须包含这些字段：title、summary、verdict/)
  assert.match(payload.systemPrompt, /不要把报告包在 report\/result\/data 字段里/)
  assert.match(payload.systemPrompt, /RP指数/)
  assert.match(payload.systemPrompt, /终局RP/)
  assert.match(payload.systemPrompt, /RP指数是主要依据/)
  assert.match(payload.systemPrompt, /不要逐局流水账/)
  assert.doesNotMatch(payload.systemPrompt, /不超过 \d+ 个中文字符/)
  assert.doesNotMatch(payload.systemPrompt, /\d+-\d+ 个中文字符/)
  assert.doesNotMatch(payload.systemPrompt, /keyFindings 优先 \d+ 条/)
  assert.doesNotMatch(payload.systemPrompt, /trainingPlan \d+-\d+ 条/)
  assert.doesNotMatch(payload.systemPrompt, /championAdvice \d+-\d+ 条/)
  assert.match(payload.systemPrompt, /summary、verdict\.summary 和 finalSummary 都要用自然语言完整表达核心判断。/)
  assert.doesNotMatch(payload.systemPrompt, /不要限制各字段自然语言字数|长度由事实量决定/)
  assert.match(payload.systemPrompt, /m01/)
  assert.match(payload.systemPrompt, /不要输出真实 matchId、gameId、puuid、summonerName、gameName、tagLine/)
  assert.doesNotMatch(payload.systemPrompt, /自然语言分段|历史上下文|历史电子教练|训练|教练语气|玩法指导/)
  assert.match(payload.systemPrompt, /后续观察项/)
  assert.match(payload.systemPrompt, /样本结论/)

  assert.match(payload.userPrompt, /【近20局排位数据】/)
  assert.match(payload.userPrompt, /20局总览：20局12胜8负/)
  assert.match(payload.userPrompt, /RP终局序列：m01 7\.2/)
  assert.match(payload.userPrompt, /K\/D\/A 2\/1\/18/)
  assert.doesNotMatch(payload.userPrompt, /coach-input-hash|schemaVersion|analysisBriefSchemaVersion|overallState|dataQuality|generatedAt|matchRefs|anchorMatchRefs/)
  assert.doesNotMatch(payload.userPrompt, /历史|上次报告|currentSnapshotText|currentSnapshotMeta|historicalCoachContext/)
  assert.doesNotMatch(payload.userPrompt.trim(), /^\{/)
})

test('coach summary prompt includes a short data gap notice only when key data is incomplete', async () => {
  assert.equal(existsSync(promptModuleUrl), true)
  const { buildCoachSummaryPromptPayload } = await import('./coachSummaryPrompt.ts')
  const snapshot = makeSnapshot()
  snapshot.dataQuality.confidence = 'medium'
  snapshot.dataQuality.hasAllTimelines = false
  snapshot.dataQuality.missingTimelineMatchRefs = ['m03']
  snapshot.dataQuality.missingEconomyDiffMatchRefs = ['m03']

  const payload = buildCoachSummaryPromptPayload({
    snapshot
  })

  assert.match(payload.userPrompt, /【数据缺口】/)
  assert.match(payload.userPrompt, /缺timeline：m03/)
  assert.match(payload.userPrompt, /缺15分钟经济差：m03/)
  assert.doesNotMatch(payload.userPrompt, /inputHash|generatedAt|anchorMatchRefs/)
  assert.doesNotMatch(payload.userPrompt, /undefined|null/)
})
