import type { SessionData } from '@/types/api'

type GamingQueueInput = Pick<SessionData, 'queueId' | 'typeCn'>

const QUEUE_ID_LABELS: Record<number, string> = {
  420: '单双排位',
  440: '灵活排位',
  450: '海克斯大乱斗'
}

export function normalizeGamingQueueLabel(sessionData: GamingQueueInput): string {
  const queueIdLabel = QUEUE_ID_LABELS[sessionData.queueId]
  if (queueIdLabel) {
    return queueIdLabel
  }

  const typeCn = sessionData.typeCn?.trim()
  if (typeCn === '单排/双排' || typeCn === '单双排' || typeCn === '单双排位') {
    return '单双排位'
  }
  if (typeCn === '灵活组排' || typeCn === '灵活排位') {
    return '灵活排位'
  }

  return typeCn || '未知模式'
}

export function isGamingAiAnalysisEnabledQueue(sessionData: GamingQueueInput): boolean {
  return sessionData.queueId === 420 || sessionData.queueId === 440
}
