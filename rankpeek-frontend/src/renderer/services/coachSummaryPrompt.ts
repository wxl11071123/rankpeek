import type { CoachSummaryDataQuality, CoachSummaryInputSnapshot } from './coachSummaryInputSnapshot'

export const COACH_SUMMARY_PROMPT_VERSION = 'coach_summary.prompt.v4' as const
export const COACH_SUMMARY_REPORT_SCHEMA_VERSION = 'coach_summary_report.v1' as const

export interface CoachSummaryPromptPayload {
  promptVersion: typeof COACH_SUMMARY_PROMPT_VERSION
  systemPrompt: string
  userPrompt: string
}

export interface BuildCoachSummaryPromptPayloadParams {
  snapshot: Pick<CoachSummaryInputSnapshot, 'analysisBrief' | 'dataQuality'>
}

const SYSTEM_PROMPT_LINES = [
  '你是 RankPeek 的英雄联盟近20局排位数据分析助手。你不教玩家打游戏，只做数据分析。',
  '只使用输入里明确给出的事实；不要补写没有出现的数据、英雄、分路、对手或结论。',
  '不要逐局流水账。每局 m01、m02 等只作为证据池，最终要归纳稳定模式、重复问题和改善迹象。',
  '证据引用只能使用 m01、m02 这类 matchRef，或输入里已出现的 eventRef/dataRef；不要输出真实 matchId、gameId、puuid、summonerName、gameName、tagLine。',
  'RP指数是 RankPeek 根据 timeline 计算的单局表现指标，范围0-10，5.0为中性；计算依据包括经济、等级、CS、击杀参与、死亡、关键资源和视野。RP指数是主要依据。',
  '重点关注终局RP序列、平均RP、15分钟对位经济差、参团率、英雄池/位置样本、伤转率、视野、补刀和单局RP标签。',
  '如果输入出现数据缺口，要降低 confidence，并在 warnings 里说明哪些结论受影响；没有数据缺口时不要主动谈数据质量。',
  '低样本英雄不要过度下结论；1局样本的 championAdvice 推荐优先使用 observe_more。',
  'trainingPlan 只能写后续观察项，例如接下来几局继续观察的指标和数据阈值。',
  'championAdvice 不是英雄教学建议，只能写英雄池/位置样本结论。',
  'title 是对最近20局排位表现的一句话概括。禁止使用通用模板标题（如"近20局排位数据分析报告"），必须根据实际英雄、胜率、RP趋势等数据自拟。',
  `只输出 JSON，不要 Markdown，不要代码块。JSON 必须符合 ${COACH_SUMMARY_REPORT_SCHEMA_VERSION}。`,
  '顶层必须包含这些字段：title、summary、verdict、keyFindings、trainingPlan、championAdvice、chartBlocks、warnings、finalSummary。不要把报告包在 report/result/data 字段里。',
  'verdict 必须是对象，至少包含 label、score、confidence、summary；confidence 只能是 high、medium、low。',
  `metadata.promptVersion 必须是 ${COACH_SUMMARY_PROMPT_VERSION}。`,
  'summary、verdict.summary 和 finalSummary 都要用自然语言完整表达核心判断。',
  'keyFindings、trainingPlan、championAdvice 的条目数量按事实量决定；事实不足时保留空数组或少写。',
  'keyFindings 不要写成编号清单、小标题清单或模板化体检报告。每条把事实和判断写进同一段；claim 写完整自然句，evidence 写清关键数据，reasoning 解释为什么重要，advice 只允许写数据观察方向，不要写玩法教学。',
  'keyFindings 每条必须包含 claim、evidence、reasoning、advice、confidence、evidenceRefs。'
] as const

export function buildCoachSummaryPromptPayload({
  snapshot
}: BuildCoachSummaryPromptPayloadParams): CoachSummaryPromptPayload {
  return {
    promptVersion: COACH_SUMMARY_PROMPT_VERSION,
    systemPrompt: SYSTEM_PROMPT_LINES.join('\n'),
    userPrompt: buildNaturalLanguagePromptInput(snapshot)
  }
}

function buildNaturalLanguagePromptInput(
  snapshot: BuildCoachSummaryPromptPayloadParams['snapshot']
): string {
  const lines = [
    '【近20局排位数据】',
    snapshot.analysisBrief.text.trim() || '无可用快照正文。'
  ]
  const dataGapNotice = buildDataGapNotice(snapshot.dataQuality)
  if (dataGapNotice) {
    lines.push('', '【数据缺口】', dataGapNotice)
  }
  return lines.join('\n')
}

function buildDataGapNotice(dataQuality: CoachSummaryDataQuality): string {
  const parts = [
    dataQuality.missingTimelineMatchRefs.length ? `缺timeline：${dataQuality.missingTimelineMatchRefs.join('、')}` : '',
    dataQuality.missingParticipantDetailMatchRefs.length ? `缺详情：${dataQuality.missingParticipantDetailMatchRefs.join('、')}` : '',
    dataQuality.missingEconomyDiffMatchRefs.length ? `缺15分钟经济差：${dataQuality.missingEconomyDiffMatchRefs.join('、')}` : '',
    dataQuality.missingRuneOrItemMatchRefs.length ? `缺符文或装备：${dataQuality.missingRuneOrItemMatchRefs.join('、')}` : ''
  ].filter(Boolean)
  if (dataQuality.confidence === 'high' && parts.length === 0) {
    return ''
  }
  return parts.length
    ? parts.join('；')
    : `整体数据置信度：${dataQuality.confidence}`
}
