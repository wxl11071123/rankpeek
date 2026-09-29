import test from 'node:test'
import assert from 'node:assert/strict'
import {
  generateCoachSummaryReport,
  RANKPEEK_LOCAL_COACH_SUMMARY_ENDPOINT
} from './coachSummaryAiClient.ts'
import { RANKPEEK_LOCAL_SERVICE_BASE_URL } from './rankpeekLocalServiceClient.ts'

const report = {
  schemaVersion: 'coach_summary_report.v1',
  analysisType: 'coach_summary',
  inputHash: 'coach-hash-1',
  title: 'Resource setup',
  summary: 'Recent games need tighter setup.',
  verdict: {
    label: 'Mid-game setup needs work',
    score: 72,
    confidence: 'medium',
    summary: 'Stable champion pool with fixable objective setup mistakes.'
  },
  keyFindings: [],
  trainingPlan: [],
  championAdvice: [],
  chartBlocks: [],
  warnings: [],
  metadata: {
        modelName: 'deepseek-v4-flash',
        promptVersion: 'coach_summary.prompt.v4',
    generatedAt: '2026-05-25T00:00:00.000Z',
    snapshotSchemaVersion: 'coach_summary_input_snapshot.v2',
    dataQualityConfidence: 'medium'
  }
}

function createCoachSummaryParams() {
  return {
    inputHash: 'coach-hash-1',
    snapshotSchemaVersion: 'coach_summary_input_snapshot.v2',
    dataQualityConfidence: 'medium' as const,
    promptPayload: {
      promptVersion: 'coach_summary.prompt.v4' as const,
      systemPrompt: 'system prompt',
      userPrompt: '{"currentSnapshotText":"recent games"}'
    }
  }
}

test('generateCoachSummaryReport posts prompt payload to local backend without Authorization', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify({
      success: true,
      data: {
        report,
        usage: {
          provider: 'deepseek',
          model: 'deepseek-v4-flash',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150
        }
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }) as typeof fetch

  try {
    const result = await generateCoachSummaryReport(createCoachSummaryParams())

    assert.equal(result.ok, true)
    assert.equal(result.ok && result.report.title, 'Resource setup')
    assert.equal(result.ok && result.usage?.totalTokens, 150)
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.url, `${RANKPEEK_LOCAL_SERVICE_BASE_URL}${RANKPEEK_LOCAL_COACH_SUMMARY_ENDPOINT}`)
    assert.equal(calls[0]?.init.method, 'POST')
    assert.deepEqual(calls[0]?.init.headers, { 'Content-Type': 'application/json' })
    const body = JSON.parse(String(calls[0]?.init.body))
    assert.equal(body.inputHash, 'coach-hash-1')
    assert.equal(body.snapshotSchemaVersion, 'coach_summary_input_snapshot.v2')
    assert.equal(body.promptVersion, 'coach_summary.prompt.v4')
    assert.equal(body.dataQualityConfidence, 'medium')
    assert.equal(body.systemPrompt, 'system prompt')
    assert.match(body.userPrompt, /recent games/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('generateCoachSummaryReport maps missing provider configuration to friendly text', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify({
    success: false,
    error: {
      code: 'AI_PROVIDER_NOT_CONFIGURED',
      message: 'Please configure AI provider and API key first.'
    }
  }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' }
  })) as typeof fetch

  try {
    const result = await generateCoachSummaryReport(createCoachSummaryParams())

    assert.equal(result.ok, false)
    assert.equal(result.ok ? '' : result.message, '请先在设置里配置 AI 服务商和 API Key。')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('generateCoachSummaryReport returns a failed result for local backend errors', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify({
    success: false,
    error: {
      code: 'AI_PROVIDER_ERROR',
      message: 'provider failed'
    }
  }), {
    status: 502,
    headers: { 'Content-Type': 'application/json' }
  })) as typeof fetch

  try {
    const result = await generateCoachSummaryReport(createCoachSummaryParams())

    assert.equal(result.ok, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})
