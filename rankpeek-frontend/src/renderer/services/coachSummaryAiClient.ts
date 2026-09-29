import {
  LOCAL_AI_CONFIGURATION_REQUIRED_MESSAGE
} from './localAiStreamClient.ts'
import {
  parseLocalJson,
  RANKPEEK_LOCAL_SERVICE_BASE_URL
} from './rankpeekLocalServiceClient.ts'
import type { CoachSummaryPromptPayload } from './coachSummaryPrompt'
import type { CoachSummaryConfidence, CoachSummaryReportV1 } from '../types/coachSummaryReport'

export const RANKPEEK_LOCAL_COACH_SUMMARY_ENDPOINT = '/api/v1/ai/coach-summary'
export const RANKPEEK_SERVER_COACH_SUMMARY_ENDPOINT = RANKPEEK_LOCAL_COACH_SUMMARY_ENDPOINT

const COACH_SUMMARY_UNAVAILABLE_MESSAGE = 'AI 服务暂时不可用，请稍后再试。'
const COACH_SUMMARY_BAD_REQUEST_MESSAGE = '请求无法完成，请稍后再试。'

export interface GenerateCoachSummaryReportParams {
  accessToken?: string
  inputHash: string
  snapshotSchemaVersion: string
  dataQualityConfidence: CoachSummaryConfidence
  promptPayload: CoachSummaryPromptPayload
}

export interface CoachSummaryAiTokenUsage {
  provider: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  promptCacheHitTokens?: number
  promptCacheMissTokens?: number
}

export type GenerateCoachSummaryReportResult = {
  ok: true
  report: CoachSummaryReportV1
  usage?: CoachSummaryAiTokenUsage
} | {
  ok: false
  message: string
}

interface CoachSummaryAiResponseData {
  report?: CoachSummaryReportV1
  usage?: CoachSummaryAiTokenUsage
}

export async function generateCoachSummaryReport(
  params: GenerateCoachSummaryReportParams
): Promise<GenerateCoachSummaryReportResult> {
  try {
    const response = await fetch(`${RANKPEEK_LOCAL_SERVICE_BASE_URL}${RANKPEEK_LOCAL_COACH_SUMMARY_ENDPOINT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputHash: params.inputHash,
        snapshotSchemaVersion: params.snapshotSchemaVersion,
        promptVersion: params.promptPayload.promptVersion,
        dataQualityConfidence: params.dataQualityConfidence,
        systemPrompt: params.promptPayload.systemPrompt,
        userPrompt: params.promptPayload.userPrompt
      })
    })

    const payload = await parseLocalJson<CoachSummaryAiResponseData>(response)
    if (!response.ok || payload.success === false) {
      return {
        ok: false,
        message: toCoachSummaryUserFacingErrorMessage(payload.error?.code, payload.error?.message)
      }
    }
    if (!payload.data?.report) {
      return {
        ok: false,
        message: COACH_SUMMARY_UNAVAILABLE_MESSAGE
      }
    }

    return {
      ok: true,
      report: payload.data.report,
      usage: payload.data.usage
    }
  } catch {
    return {
      ok: false,
      message: COACH_SUMMARY_UNAVAILABLE_MESSAGE
    }
  }
}

function toCoachSummaryUserFacingErrorMessage(code?: string, message?: string): string {
  if (code === 'AI_PROVIDER_NOT_CONFIGURED') {
    return LOCAL_AI_CONFIGURATION_REQUIRED_MESSAGE
  }
  return message?.trim() || COACH_SUMMARY_BAD_REQUEST_MESSAGE
}
