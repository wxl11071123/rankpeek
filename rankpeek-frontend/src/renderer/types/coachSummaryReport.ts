export type CoachSummaryConfidence = 'high' | 'medium' | 'low'
export type CoachSummaryPriority = 'high' | 'medium' | 'low'
export type CoachSummaryChartKind = 'bar' | 'line' | 'scatter' | 'timeline' | 'table'
export type CoachSummaryChartPlacement = 'overview' | 'analysis' | 'summary'
export type CoachSummaryChartValue = string | number | boolean | null
export type CoachSummaryChartDatum = Record<string, CoachSummaryChartValue>

export interface CoachSummaryReportV1 {
  schemaVersion: 'coach_summary_report.v1'
  analysisType: 'coach_summary'
  inputHash: string
  headline?: string
  cardTitle?: string
  shortTitle?: string
  title: string
  summary: string
  overview?: CoachSummaryOverview
  verdict: CoachSummaryVerdict
  keyFindings: CoachSummaryKeyFinding[]
  trainingPlan: CoachSummaryTrainingItem[]
  championAdvice: CoachSummaryChampionAdvice[]
  chartBlocks?: NormalizedCoachSummaryChartBlock[]
  warnings: CoachSummaryWarning[]
  finalSummary?: string
  metadata: CoachSummaryMetadata
}

export interface CoachSummaryOverview {
  totalMatches: number
  wins?: number
  losses?: number
  winRate?: number
  summary: string
  overallState?: 'excellent' | 'good' | 'stable' | 'volatile' | 'struggling'
  overallStateLabel?: string
  primaryRoles?: Array<{
    role: string
    count: number
  }>
  heroStats?: CoachSummaryHeroStat[]
  roleStats?: CoachSummaryRoleStat[]
  rpTrend?: CoachSummaryRpTrendPoint[]
}

export interface CoachSummaryRpTrendPoint {
  matchRef: string
  score: number
  championId?: number
  championDisplayName?: string
  result?: 'win' | 'loss' | 'unknown'
  trendLabel?: string
  kdaText?: string
}

export interface CoachSummaryHeroStat {
  championId?: number
  championCanonicalName?: string
  championDisplayName: string
  role: string
  games: number
  wins?: number
  losses?: number
  winRate?: number
  kda?: string
  averageKda?: number
  summary?: string
}

export interface CoachSummaryRoleStat {
  role: string
  games: number
  wins?: number
  losses?: number
  winRate?: number
}

export interface CoachSummaryVerdict {
  label: string
  score: number
  confidence: CoachSummaryConfidence
  summary: string
}

export interface CoachSummaryKeyFinding {
  id: string
  priority: CoachSummaryPriority
  category: string
  claim: string
  evidence: string
  reasoning: string
  advice: string
  confidence: CoachSummaryConfidence
  evidenceRefs: string[]
}

export interface CoachSummaryTrainingItem {
  focus: string
  why: string
  nextGames: number
  task: string
  metricToTrack: string
  target: string
  priority: CoachSummaryPriority
}

export interface CoachSummaryChampionAdvice {
  championName: string
  role: string
  recommendation: 'keep' | 'practice' | 'avoid_temporarily' | 'observe_more'
  reason: string
  confidence: CoachSummaryConfidence
}

export interface CoachSummaryChartBlock {
  id: string
  title: string
  kind?: CoachSummaryChartKind
  type?: string
  placement?: CoachSummaryChartPlacement
  dataRef?: string
  data?: CoachSummaryChartDatum[]
  xKey?: string
  yKeys?: string[]
  labelKey?: string
  valueKey?: string
  intent?: string
  interpretation?: string
  evidenceRefs?: string[]
  description?: string
  highlight?: string
}

export interface NormalizedCoachSummaryChartBlock extends CoachSummaryChartBlock {
  kind: CoachSummaryChartKind
  placement: CoachSummaryChartPlacement
  evidenceRefs: string[]
}

export interface CoachSummaryWarning {
  type: string
  message: string
}

export interface CoachSummaryMetadata {
  modelName: string
  promptVersion: string
  generatedAt: string
  snapshotSchemaVersion: string
  dataQualityConfidence: CoachSummaryConfidence
  generatedInputAt?: string
  latestMatchTimestamp?: number
  latestMatchRef?: string
}
