<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { coachAnalysisBusy, nextRunAnalysisSerial, getRunAnalysisSerial } from './coachAnalysisState'
import AICoachCards from '@/components/AICoachCards.vue'
import CoachSummaryReportModal from '@/components/CoachSummaryReportModal.vue'
import HomeChart from '@/components/HomeChart.vue'
import { useGameStore } from '@/stores/game'
import {
  FORTUNE_POOL,
  drawDailyFortune,
  getCurrentFortune,
  loadFortuneRecord,
  saveFortuneRecord
} from '@/utils/homeInsights'
import {
  buildCoachSummaryReportOverview,
  prepareCoachSummaryGeneration
} from '@/services/coachSummaryInputSnapshot'
import { buildCoachSummaryPromptPayload } from '@/services/coachSummaryPrompt'
import {
  generateCoachSummaryReport,
  type CoachSummaryAiTokenUsage
} from '@/services/coachSummaryAiClient'
import {
  getCoachReportHeadline,
  loadLocalAiAnalysisResults,
  parseCoachSummaryReportOutput,
  type LocalAiAnalysisDisplayResult
} from '@/services/localAiAnalysis'
import { estimatePostgameAiTokenCostCny } from '@/services/postgameAiServerStream'
import { DEV_COACH_SUMMARY_REPORT_PREVIEW } from '@/services/coachSummaryReportPreview'
import { getProfileIconUrl, markAssetLoadFailed } from '@/utils/gameAssetUrls'
import { t } from '@/i18n'
import type { QueueInfo } from '@/types/api'
import type { Fortune, FortuneRecord } from '@/utils/homeInsights'
import type { RankLoadStatus } from '@/utils/rankDisplay'
import type { CoachSummaryReportV1 } from '@/types/coachSummaryReport'

const gameStore = useGameStore()

const homeViewRef = ref<HTMLElement | null>(null)

const TIER_CN_MAP: Record<string, string> = {
  iron: '黑铁',
  bronze: '青铜',
  silver: '白银',
  gold: '黄金',
  platinum: '铂金',
  emerald: '翡翠',
  diamond: '钻石',
  master: '大师',
  grandmaster: '宗师',
  challenger: '王者',
  坚韧黑铁: '黑铁',
  黑铁: '黑铁',
  英勇黄铜: '青铜',
  青铜: '青铜',
  不屈白银: '白银',
  白银: '白银',
  荣耀黄金: '黄金',
  黄金: '黄金',
  华贵铂金: '铂金',
  铂金: '铂金',
  流光翡翠: '翡翠',
  翡翠: '翡翠',
  璀璨钻石: '钻石',
  钻石: '钻石',
  超凡大师: '大师',
  大师: '大师',
  傲世宗师: '宗师',
  宗师: '宗师',
  最强王者: '王者',
  王者: '王者'
}

const DIVISION_CN_MAP: Record<string, string> = {
  i: 'Ⅰ',
  ii: 'Ⅱ',
  iii: 'Ⅲ',
  iv: 'Ⅳ',
  '1': 'Ⅰ',
  '2': 'Ⅱ',
  '3': 'Ⅲ',
  '4': 'Ⅳ'
}

const UNRANKED_TIER_VALUES = new Set(['', 'unranked', 'none', 'null', 'undefined', '无', '未设置', '未定级'])
const AUTO_ANALYSIS_STORAGE_PREFIX = 'rankpeek.home.aiCoachAutoAnalysis'
const AI_COACH_ACCOUNT_MISSING_NOTICE = '当前账号未识别，请先连接并刷新客户端账号。'
const AI_COACH_LOCAL_DATA_ERROR_NOTICE = '本地数据暂不可用，无法准备电子教练数据。'
const AI_COACH_LOCAL_SAVE_ERROR_NOTICE = '电子教练报告保存失败，请稍后重试。'

const AI_COACH_PREPARING_NOTICE = '正在准备最近 20 局排位数据...'
const AI_COACH_GENERATING_NOTICE = '正在调用电子教练 AI...'
const AI_COACH_GENERATED_NOTICE = '电子教练报告已生成。'
const AI_COACH_SERVER_ERROR_NOTICE = '电子教练 AI 调用失败，请确认本地 AI 配置可用。'
const AI_COACH_PARTIAL_TIMELINE_NOTICE = '部分对局时间线拉取失败，报告数据质量可能较低。'

const AI_COACH_SNAPSHOT_INTEGRITY_FAILED_NOTICE = '电子教练数据校验失败，请刷新战绩后重试'

const RANK_TONE_MAP: Record<string, string> = {
  iron: 'iron',
  黑铁: 'iron',
  bronze: 'bronze',
  青铜: 'bronze',
  silver: 'silver',
  白银: 'silver',
  gold: 'gold',
  黄金: 'gold',
  platinum: 'platinum',
  铂金: 'platinum',
  emerald: 'emerald',
  翡翠: 'emerald',
  diamond: 'diamond',
  钻石: 'diamond',
  master: 'master',
  大师: 'master',
  grandmaster: 'grandmaster',
  宗师: 'grandmaster',
  challenger: 'challenger',
  王者: 'challenger'
}

const RANK_BADGE_STYLES: Record<string, Record<string, string>> = {
  iron: {
    '--rank-border': '#a88462',
    '--rank-border-light': '#6f5136',
    '--rank-hover-border': '#b89571',
    '--rank-hover-border-light': '#8c6b4a',
    '--rank-fill-rgb': '140, 107, 74',
    '--rank-inner-outline': '0 0 0 rgba(0, 0, 0, 0)'
  },
  bronze: {
    '--rank-border': '#bec8d5',
    '--rank-border-light': '#7d8794',
    '--rank-hover-border': '#d1d9e3',
    '--rank-hover-border-light': '#a9b4c2',
    '--rank-fill-rgb': '169, 180, 194',
    '--rank-inner-outline': '0 0 0 rgba(0, 0, 0, 0)'
  },
  silver: {
    '--rank-border': '#c7d0d9',
    '--rank-border-light': '#818b96',
    '--rank-hover-border': '#d7dfe7',
    '--rank-hover-border-light': '#b0b8c1',
    '--rank-fill-rgb': '176, 184, 193',
    '--rank-inner-outline': '0 0 0 rgba(0, 0, 0, 0)'
  },
  gold: {
    '--rank-border': '#d2b862',
    '--rank-border-light': '#967d2d',
    '--rank-hover-border': '#dec778',
    '--rank-hover-border-light': '#c4a747',
    '--rank-fill-rgb': '196, 167, 71',
    '--rank-inner-outline': '0 0 0 rgba(0, 0, 0, 0)'
  },
  platinum: {
    '--rank-border': '#78c7c4',
    '--rank-border-light': '#397b7a',
    '--rank-hover-border': '#8ed4d2',
    '--rank-hover-border-light': '#5da8a6',
    '--rank-fill-rgb': '93, 168, 166',
    '--rank-inner-outline': '0 0 0 rgba(0, 0, 0, 0)'
  },
  emerald: {
    '--rank-border': '#72dc94',
    '--rank-border-light': '#32985c',
    '--rank-hover-border': '#86e6a4',
    '--rank-hover-border-light': '#50c878',
    '--rank-fill-rgb': '80, 200, 120',
    '--rank-inner-outline': '0 0 0 rgba(0, 0, 0, 0)'
  },
  diamond: {
    '--rank-border': '#83aaf1',
    '--rank-border-light': '#3f69bd',
    '--rank-hover-border': '#9bbdf5',
    '--rank-hover-border-light': '#5b8ce9',
    '--rank-fill-rgb': '91, 140, 233',
    '--rank-inner-outline': '0 0 0 rgba(0, 0, 0, 0)'
  },
  master: {
    '--rank-border': '#b5aad7',
    '--rank-border-light': '#75679d',
    '--rank-hover-border': '#c5bbe2',
    '--rank-hover-border-light': '#9b8ec4',
    '--rank-fill-rgb': '155, 142, 196',
    '--rank-inner-outline': '0 0 0 rgba(0, 0, 0, 0)'
  },
  grandmaster: {
    '--rank-border': '#e1c45e',
    '--rank-border-light': '#a98d2f',
    '--rank-hover-border': '#ead275',
    '--rank-hover-border-light': '#c4a747',
    '--rank-fill-rgb': '196, 167, 71',
    '--rank-inner-outline': '0 0 0 rgba(0, 0, 0, 0)'
  },
  challenger: {
    '--rank-border': '#e2c567',
    '--rank-border-light': '#a88722',
    '--rank-hover-border': '#ead27d',
    '--rank-hover-border-light': '#d4af37',
    '--rank-fill-rgb': '212, 175, 55',
    '--rank-inner-outline': 'inset 0 0 0 1px rgba(212, 175, 55, 0.3)'
  },
  unranked: {
    '--rank-border': '#8a94a3',
    '--rank-border-light': '#6b7280',
    '--rank-hover-border': '#a2acbb',
    '--rank-hover-border-light': '#7a8494',
    '--rank-fill-rgb': '122, 132, 148',
    '--rank-inner-outline': '0 0 0 rgba(0, 0, 0, 0)'
  }
}

interface AutoAnalysisSettings {
  enabled: boolean
}

interface HomeCoachReport {
  id: number | string
  headline?: string
  cardTitle?: string
  shortTitle?: string
  title: string
  body: string
  detail?: string
  meta?: string
}

type CoachReportLoadState = 'loading' | 'ready' | 'missing' | 'unsupported' | 'invalid' | 'error'

interface OpenCoachReportModalOptions {
  preview?: boolean
  createdAt?: string | null
}

interface AutoAnalysisRunOptions {
  force?: boolean
}

type RankBadgeKey = 'solo' | 'flex'

const autoAnalysis = ref<AutoAnalysisSettings>({ enabled: false })
const coachNotice = ref('')
const accountRefreshBusy = ref(false)
const coachReports = ref<HomeCoachReport[]>([])
const coachReportModalOpen = ref(false)
const activeCoachReport = ref<CoachSummaryReportV1 | null>(null)
const activeCoachReportIndex = ref(-1)
const coachReportLoadState = ref<CoachReportLoadState>('ready')
const coachReportError = ref('')
const coachReportCreatedAt = ref<string | null>(null)
const coachReportPreview = ref(false)
let coachReportRequestSerial = 0
let lastAutoAnalysisAttemptKey = ''

const fortuneRecord = ref<FortuneRecord>({ history: [] })
const currentFortune = ref<Fortune | null>(null)
const fortuneRolling = ref(false)
const rollingFortuneLabel = ref('？？？')
let fortuneTimer: number | null = null
let coachNoticeTimer: number | null = null

const defaultRankShineStyle = {
  '--rank-shine-x': '48%',
  '--rank-shine-y': '48%'
}
const rankBadgeShine = ref<Record<RankBadgeKey, Record<string, string>>>({
  solo: { ...defaultRankShineStyle },
  flex: { ...defaultRankShineStyle }
})

const currentSummoner = computed(() => gameStore.currentSummoner)
const accountKey = computed(() => currentSummoner.value?.puuid || 'local')
const accountConnected = computed(() => gameStore.connected && Boolean(currentSummoner.value))
const soloRank = computed(() => gameStore.soloRank)
const flexRank = computed(() => gameStore.flexRank)
const accountRankStatus = computed<RankLoadStatus>(() => {
  if (gameStore.rankLoading) {
    return 'loading'
  }
  return gameStore.rankError ? 'error' : 'loaded'
})
const displayName = computed(() => gameStore.summonerName || t('common.summoner'))
const profileIconUrl = computed(() =>
  currentSummoner.value?.profileIconId
    ? getProfileIconUrl(currentSummoner.value.profileIconId)
    : ''
)

const fortuneTone = computed(() => currentFortune.value?.tone || 'neutral')
const fortuneAlreadyDrawn = computed(() => Boolean(currentFortune.value))
const fortuneButtonText = computed(() => {
  if (fortuneRolling.value) {
    return t('home.fortuneDrawing')
  }
  if (fortuneAlreadyDrawn.value) {
    return t('home.fortuneComeTomorrow')
  }
  return t('home.drawFortune')
})
const fortuneNoticeText = computed(() => {
  if (!currentFortune.value) {
    return ''
  }
  return `${t('home.fortuneOnceDaily')} ${t('home.fortuneDisclaimer')}`
})
const slotDisplayLabel = computed(() => {
  if (fortuneRolling.value) {
    return rollingFortuneLabel.value
  }
  return currentFortune.value?.label || '✦'
})
const slotReelItems = computed(() => {
  const poolLabels = FORTUNE_POOL.map(fortune => fortune.label)
    .filter(label => label && label !== slotDisplayLabel.value)
  return [slotDisplayLabel.value, ...poolLabels.slice(0, 7)]
})

onMounted(() => {
  void gameStore.checkConnection()
  void loadLocalHomeState()
})

onBeforeUnmount(() => {
  clearFortuneTimer()
  clearCoachNoticeTimer()
})

watch(accountKey, () => {
  void loadLocalHomeState()
})

watch(accountConnected, (connected) => {
  if (connected) {
    void maybeRunAutoAnalysis('load')
  }
})

async function loadLocalHomeState() {
  const key = accountKey.value
  autoAnalysis.value = loadAutoAnalysisSettings(key)
  fortuneRecord.value = loadFortuneRecord(key)
  currentFortune.value = getCurrentFortune(fortuneRecord.value)
  coachNotice.value = ''
  await refreshLocalCoachReports()
  void maybeRunAutoAnalysis('load')
}

async function refreshLocalCoachReports() {
  const puuid = currentSummoner.value?.puuid?.trim()
  if (!puuid) {
    coachReports.value = []
    return
  }

  const result = await loadLocalAiAnalysisResults(puuid, {
    limit: 6,
    offset: 0,
    analysisType: 'coach_summary'
  })
  coachReports.value = result.results.map(toHomeCoachReport)
}

function toHomeCoachReport(result: LocalAiAnalysisDisplayResult): HomeCoachReport {
  const parsed = parseCoachSummaryReportOutput(result.outputJson)
  const report = parsed.report
  const title = getCoachReportHeadline({ report, result })
  const summary = firstSentence(report?.summary || result.output.summary)
  return {
    id: result.id,
    headline: report?.headline,
    cardTitle: report?.cardTitle,
    shortTitle: report?.shortTitle,
    title,
    body: summary,
    detail: report?.verdict.summary || summary,
    meta: result.createdAtLabel
  }
}

function firstSentence(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim()
  const match = compact.match(/^(.+?[。.!？?])\s*/)
  return (match?.[1] || compact).slice(0, 72)
}

async function openCoachReport(report: HomeCoachReport | null, index: number) {
  if (!report?.id) {
    activeCoachReportIndex.value = -1
    if (import.meta.env.DEV) {
      openCoachReportModal(DEV_COACH_SUMMARY_REPORT_PREVIEW, { preview: true })
      return
    }
    return
  }

  activeCoachReportIndex.value = index
  await loadCoachReport(report)
}

async function openCoachReportAtIndex(index: number) {
  const count = coachReports.value.length
  if (count <= 0) {
    return
  }

  const normalizedIndex = ((index % count) + count) % count
  const report = coachReports.value[normalizedIndex]
  if (!report) {
    return
  }

  activeCoachReportIndex.value = normalizedIndex
  await loadCoachReport(report)
}

function navigateCoachReport(delta: number) {
  const count = coachReports.value.length
  if (count <= 1 || coachReportPreview.value) {
    return
  }

  const baseIndex = activeCoachReportIndex.value >= 0 ? activeCoachReportIndex.value : 0
  const nextIndex = (baseIndex + delta + count) % count
  void openCoachReportAtIndex(nextIndex)
}

async function loadCoachReport(report: HomeCoachReport) {
  if (!Number.isInteger(Number(report.id)) || Number(report.id) <= 0) {
    openCoachReportError('报告编号无效')
    return
  }

  const database = window.electronAPI?.database
  if (!database) {
    openCoachReportError('本地报告库暂不可用')
    return
  }

  const requestId = ++coachReportRequestSerial
  coachReportModalOpen.value = true
  activeCoachReport.value = null
  coachReportLoadState.value = 'loading'
  coachReportError.value = ''
  coachReportCreatedAt.value = null
  coachReportPreview.value = false

  try {
    const result = await database.getAnalysisResultById(Number(report.id))
    if (requestId !== coachReportRequestSerial) {
      return
    }
    if (!result.success) {
      openCoachReportError(result.error)
      return
    }
    if (!result.data) {
      openCoachReportError('没有找到这份报告', 'missing')
      return
    }

    const parsed = parseCoachSummaryReportOutput(result.data.outputJson)
    if (parsed.status === 'parsed' && parsed.report) {
      openCoachReportModal(parsed.report, {
        createdAt: result.data.createdAt
      })
      return
    }

    openCoachReportError(
      parsed.status === 'unsupported' ? '暂不支持该报告类型' : '报告内容暂时无法解析',
      parsed.status === 'unsupported' ? 'unsupported' : 'invalid'
    )
  } catch (error) {
    if (requestId !== coachReportRequestSerial) {
      return
    }
    openCoachReportError(error instanceof Error ? error.message : String(error))
  }
}

function openCoachReportModal(
  report: CoachSummaryReportV1,
  options: OpenCoachReportModalOptions = {}
) {
  activeCoachReport.value = report
  coachReportLoadState.value = 'ready'
  coachReportError.value = ''
  coachReportCreatedAt.value = options.createdAt ?? null
  coachReportPreview.value = Boolean(options.preview)
  coachReportModalOpen.value = true
}

function openCoachReportError(message: string, state: CoachReportLoadState = 'error') {
  activeCoachReport.value = null
  coachReportLoadState.value = state
  coachReportError.value = message
  coachReportCreatedAt.value = null
  coachReportPreview.value = false
  coachReportModalOpen.value = true
}

function closeCoachReportModal() {
  coachReportRequestSerial += 1
  coachReportModalOpen.value = false
  activeCoachReport.value = null
  activeCoachReportIndex.value = -1
  coachReportLoadState.value = 'ready'
  coachReportError.value = ''
  coachReportCreatedAt.value = null
  coachReportPreview.value = false
}

async function runAnalysis() {
  if (coachAnalysisBusy.value) {
    return
  }

  const puuid = currentSummoner.value?.puuid?.trim()
  if (!accountConnected.value || !puuid) {
    showCoachNotice(AI_COACH_ACCOUNT_MISSING_NOTICE)
    return
  }

  const serial = nextRunAnalysisSerial()
  coachAnalysisBusy.value = true
  try {
    setCoachProgressNotice(AI_COACH_PREPARING_NOTICE)
    const result = await prepareCoachSummaryGeneration({
      accountPuuid: puuid,
      onHydrationProgress: (progress) => {
        if (progress.stage === 'preparing') {
          setCoachProgressNotice(AI_COACH_PREPARING_NOTICE)
          return
        }
        if (progress.stage === 'hydrating_match' && progress.current && progress.total) {
          setCoachProgressNotice(`正在补全第 ${progress.current}/${progress.total} 局对局详情...`)
          return
        }
        if (progress.stage === 'partial_failure') {
          setCoachProgressNotice(AI_COACH_PARTIAL_TIMELINE_NOTICE)
        }
      }
    })
    if (result.status === 'ready') {
      console.info('RankPeek coach_summary input snapshot ready:', result.snapshot)
      const promptPayload = buildCoachSummaryPromptPayload({
        snapshot: result.snapshot
      })
      console.info('RankPeek coach_summary prompt payload ready:', promptPayload)
      setCoachProgressNotice(AI_COACH_GENERATING_NOTICE)
      const aiResult = await generateCoachSummaryReport({
        inputHash: result.snapshot.inputHash,
        snapshotSchemaVersion: result.snapshot.schemaVersion,
        dataQualityConfidence: result.snapshot.dataQuality.confidence,
        promptPayload
      })
      if (!aiResult.ok) {
        console.warn('Failed to generate coach_summary report:', aiResult.message)
        showCoachNotice(`${AI_COACH_SERVER_ERROR_NOTICE} ${aiResult.message}`)
        return
      }

      const localOverview = buildCoachSummaryReportOverview(result.snapshot)
      const aiOverview = aiResult.report.overview
      const reportWithLocalOverview = {
        ...aiResult.report,
        overview: {
          ...aiOverview,
          ...localOverview,
          summary: aiOverview?.summary || aiResult.report.summary
        },
        metadata: {
          ...aiResult.report.metadata,
          generatedInputAt: result.snapshot.metadata.generatedInputAt,
          latestMatchTimestamp: result.snapshot.metadata.latestMatchTimestamp,
          latestMatchRef: result.snapshot.metadata.latestMatchRef
        }
      }
      const parsed = parseCoachSummaryReportOutput(JSON.stringify(reportWithLocalOverview))
      if (parsed.status !== 'parsed' || !parsed.report) {
        console.warn('Failed to parse generated coach_summary report:', parsed.error)
        showCoachNotice('电子教练报告格式异常，请稍后重试。')
        return
      }

      const database = window.electronAPI?.database
      if (!database) {
        showCoachNotice(AI_COACH_LOCAL_SAVE_ERROR_NOTICE)
        return
      }

      const report = addCoachSummaryUsageMetadata(parsed.report, aiResult.usage)
      const saved = await database.saveAnalysisResult({
        accountPuuid: puuid,
        analysisType: 'coach_summary',
        subjectKey: `coach_summary:${result.snapshot.inputHash}`,
        modelName: report.metadata.modelName,
        promptVersion: report.metadata.promptVersion,
        inputHash: result.snapshot.inputHash,
        outputJson: report
      })
      if (!saved.success) {
        console.warn('Failed to save coach_summary report:', saved.error)
        showCoachNotice(AI_COACH_LOCAL_SAVE_ERROR_NOTICE)
        return
      }

      await refreshLocalCoachReports()
      activeCoachReportIndex.value = 0
      openCoachReportModal(report, {
        createdAt: saved.data.createdAt
      })
      showCoachNotice(
        (result.snapshot.dataQuality.sgpHydration?.errors.length ?? 0) > 0
          ? `${AI_COACH_GENERATED_NOTICE} ${AI_COACH_PARTIAL_TIMELINE_NOTICE}`
          : AI_COACH_GENERATED_NOTICE
      )
      return
    }

    if (result.status === 'snapshot_integrity_failed') {
      console.warn('RankPeek coach_summary snapshot integrity failed:', result.errors, result.warnings)
      const detail = result.errors.length > 0
        ? `${AI_COACH_SNAPSHOT_INTEGRITY_FAILED_NOTICE} (${result.errors.slice(0, 3).join('; ')})`
        : AI_COACH_SNAPSHOT_INTEGRITY_FAILED_NOTICE
      showCoachNotice(detail)
      return
    }

    showCoachNotice(result.message)
  } catch (error) {
    console.warn('Failed to prepare coach_summary input snapshot:', error)
    showCoachNotice(AI_COACH_LOCAL_DATA_ERROR_NOTICE)
  } finally {
    if (getRunAnalysisSerial() === serial) {
      coachAnalysisBusy.value = false
    }
  }
}

function addCoachSummaryUsageMetadata(
  report: CoachSummaryReportV1,
  usage: CoachSummaryAiTokenUsage | undefined
): CoachSummaryReportV1 {
  if (!usage) {
    return report
  }

  const promptCacheHitTokens = usage.promptCacheHitTokens ?? 0
  const normalizedUsage = {
    ...usage,
    promptCacheHitTokens,
    promptCacheMissTokens: usage.promptCacheMissTokens ?? Math.max(0, usage.promptTokens - promptCacheHitTokens)
  }
  const costCny = estimatePostgameAiTokenCostCny(normalizedUsage)
  console.info('RankPeek coach_summary token usage:', {
    usage: normalizedUsage,
    costCny
  })

  return {
    ...report,
    metadata: {
      ...report.metadata,
      tokenUsage: normalizedUsage,
      costCny
    }
  } as CoachSummaryReportV1
}

function buildAutoAnalysisAttemptKey(): string {
  const puuid = currentSummoner.value?.puuid?.trim() || accountKey.value
  const latestReportId = coachReports.value[0]?.id ?? 'none'
  return `${puuid}:${latestReportId}`
}

async function maybeRunAutoAnalysis(reason: 'load' | 'toggle', options: AutoAnalysisRunOptions = {}) {
  if (!autoAnalysis.value.enabled || !accountConnected.value || coachAnalysisBusy.value) {
    return
  }

  const attemptKey = buildAutoAnalysisAttemptKey()
  if (!options.force && lastAutoAnalysisAttemptKey === attemptKey) {
    return
  }

  lastAutoAnalysisAttemptKey = attemptKey
  console.info('RankPeek coach_summary auto analysis triggered:', { reason, attemptKey })
  await runAnalysis()
}

function toggleAutoAnalysis() {
  autoAnalysis.value = {
    enabled: !autoAnalysis.value.enabled
  }
  saveAutoAnalysisSettings(accountKey.value, autoAnalysis.value)
  lastAutoAnalysisAttemptKey = ''
  if (autoAnalysis.value.enabled) {
    void maybeRunAutoAnalysis('toggle', { force: true })
    return
  }
  clearCoachNotice()
}

async function handleRefreshAccount() {
  if (accountRefreshBusy.value) {
    return
  }

  accountRefreshBusy.value = true
  try {
    await gameStore.refreshSummoner()
  } finally {
    accountRefreshBusy.value = false
  }
}

function drawFortune() {
  if (fortuneRolling.value || fortuneAlreadyDrawn.value) {
    return
  }

  fortuneRolling.value = true
  clearFortuneTimer()
  fortuneTimer = window.setInterval(() => {
    const index = Math.floor(Math.random() * FORTUNE_POOL.length) % FORTUNE_POOL.length
    rollingFortuneLabel.value = FORTUNE_POOL[index].label
  }, 72)

  window.setTimeout(() => {
    clearFortuneTimer()
    const result = drawDailyFortune(fortuneRecord.value)
    fortuneRecord.value = result.record
    currentFortune.value = result.fortune
    rollingFortuneLabel.value = result.fortune.label
    fortuneRolling.value = false
    saveFortuneRecord(accountKey.value, fortuneRecord.value)
  }, 1180)
}

function clearFortuneTimer() {
  if (fortuneTimer) {
    window.clearInterval(fortuneTimer)
    fortuneTimer = null
  }
}

function showCoachNotice(message: string) {
  coachNotice.value = message
  clearCoachNoticeTimer()
  coachNoticeTimer = window.setTimeout(() => {
    coachNotice.value = ''
    coachNoticeTimer = null
  }, 2600)
}

function clearCoachNotice() {
  clearCoachNoticeTimer()
  coachNotice.value = ''
}

function setCoachProgressNotice(message: string) {
  clearCoachNoticeTimer()
  coachNotice.value = message
}

function clearCoachNoticeTimer() {
  if (coachNoticeTimer) {
    window.clearTimeout(coachNoticeTimer)
    coachNoticeTimer = null
  }
}

function loadAutoAnalysisSettings(key: string): AutoAnalysisSettings {
  try {
    const rawValue = localStorage.getItem(`${AUTO_ANALYSIS_STORAGE_PREFIX}.${key}`)
    if (!rawValue) {
      return { enabled: false }
    }
    const parsedValue = JSON.parse(rawValue) as Partial<AutoAnalysisSettings>
    return { enabled: Boolean(parsedValue.enabled) }
  } catch {
    return { enabled: false }
  }
}

function saveAutoAnalysisSettings(key: string, settings: AutoAnalysisSettings) {
  localStorage.setItem(`${AUTO_ANALYSIS_STORAGE_PREFIX}.${key}`, JSON.stringify(settings))
}

function isUnrankedTier(tier?: string): boolean {
  return UNRANKED_TIER_VALUES.has((tier || '').trim().toLowerCase())
}

function formatTierCn(rank: QueueInfo): string {
  const displayTier = rank.displayRank?.trim().split(/\s+/)[0]
  const candidates = [rank.tier, rank.tierCn, displayTier]
  let fallback = ''

  for (const candidate of candidates) {
    const key = candidate?.trim()
    if (!key) {
      continue
    }
    const mappedTier = TIER_CN_MAP[key.toLowerCase()] || TIER_CN_MAP[key]
    if (mappedTier) {
      return mappedTier
    }
    if (!isUnrankedTier(key)) {
      fallback ||= key
    }
  }

  return fallback || '未定级'
}

function formatDivision(rank: QueueInfo): string {
  const displayDivision = rank.displayRank?.trim().split(/\s+/)[1]
  const candidates = [rank.division, displayDivision]

  for (const candidate of candidates) {
    const key = candidate?.trim()
    if (!key) {
      continue
    }
    return DIVISION_CN_MAP[key.toLowerCase()] || toRomanNumeral(key)
  }

  return ''
}

function toRomanNumeral(value: string): string {
  const numericValue = Number.parseInt(value, 10)
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return value
  }

  const romanPairs: Array<[number, string]> = [
    [10, 'Ⅹ'],
    [9, 'Ⅸ'],
    [5, 'Ⅴ'],
    [4, 'Ⅳ'],
    [1, 'Ⅰ']
  ]
  let remainingValue = numericValue
  let result = ''

  for (const [amount, symbol] of romanPairs) {
    while (remainingValue >= amount) {
      result += symbol
      remainingValue -= amount
    }
  }

  return result
}

function rankTone(rank: QueueInfo | null): string {
  if (!rank || isUnrankedTier(rank.tier)) {
    return 'unranked'
  }

  const displayTier = rank.displayRank?.trim().split(/\s+/)[0]
  const candidates = [rank.tier, rank.tierCn, displayTier]

  for (const candidate of candidates) {
    const key = candidate?.trim()
    if (!key) {
      continue
    }
    const normalizedKey = key.toLowerCase()
    const mappedTier = TIER_CN_MAP[normalizedKey] || TIER_CN_MAP[key] || key
    const tone = RANK_TONE_MAP[normalizedKey] || RANK_TONE_MAP[mappedTier]
    if (tone) {
      return tone
    }
  }

  return 'unranked'
}

function rankBadgeStyle(rank: QueueInfo | null, badgeKey: RankBadgeKey): Record<string, string> {
  return {
    ...(RANK_BADGE_STYLES[rankTone(rank)] || RANK_BADGE_STYLES.unranked),
    ...rankBadgeShine.value[badgeKey]
  }
}

function handleRankBadgeMouseMove(event: MouseEvent, badgeKey: RankBadgeKey) {
  const target = event.currentTarget as HTMLElement | null
  if (!target) {
    return
  }

  const rect = target.getBoundingClientRect()
  if (!rect.width || !rect.height) {
    return
  }

  const xRatio = clamp((event.clientX - rect.left) / rect.width, 0, 1)
  const yRatio = clamp((event.clientY - rect.top) / rect.height, 0, 1)
  const xOffset = ((xRatio - 0.5) * 30).toFixed(1)
  const yOffset = ((yRatio - 0.5) * 30).toFixed(1)

  rankBadgeShine.value = {
    ...rankBadgeShine.value,
    [badgeKey]: {
      '--rank-shine-x': formatRankShineOffset(Number(xOffset)),
      '--rank-shine-y': formatRankShineOffset(Number(yOffset))
    }
  }
}

function resetRankBadgeShine(badgeKey: RankBadgeKey) {
  rankBadgeShine.value = {
    ...rankBadgeShine.value,
    [badgeKey]: { ...defaultRankShineStyle }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function formatRankShineOffset(offset: number) {
  const direction = offset >= 0 ? '+' : '-'
  return `calc(48% ${direction} ${Math.abs(offset).toFixed(1)}px)`
}

function formatRankTierPart(rank: QueueInfo | null, status: RankLoadStatus = 'loaded'): string {
  if (status === 'loading') {
    return t('overview.rankLoading')
  }
  if (status === 'error') {
    return t('overview.rankFailed')
  }
  if (!rank || isUnrankedTier(rank.tier)) {
    return t('tier.UNRANKED')
  }

  return formatTierCn(rank)
}

function formatRankDivisionPart(rank: QueueInfo | null, status: RankLoadStatus = 'loaded'): string {
  if (status !== 'loaded' || !rank || isUnrankedTier(rank.tier)) {
    return ''
  }

  return formatDivision(rank)
}

</script>

<template>
  <div ref="homeViewRef" class="home-view">
    <section
      v-if="accountConnected && currentSummoner"
      class="account-panel surface-glow"
    >
      <div class="account-identity">
        <img
          v-if="profileIconUrl"
          class="account-avatar"
          :src="profileIconUrl"
          alt=""
          @error="markAssetLoadFailed"
        />
        <span v-else class="account-avatar account-avatar-fallback"></span>
        <div class="account-main">
          <div class="summoner-heading">
            <h2>{{ displayName }}</h2>
            <span class="connection-pill connected">{{ t('home.clientConnected') }}</span>
          </div>
          <div class="rank-row">
            <span
              class="rank-badge"
              :style="rankBadgeStyle(soloRank, 'solo')"
              @mousemove="handleRankBadgeMouseMove($event, 'solo')"
              @mouseleave="resetRankBadgeShine('solo')"
            >
              <span class="rank-emblem" aria-hidden="true"></span>
              <span class="rank-label">
                <span class="rank-queue">{{ t('home.soloQueue') }}：</span>
                <span class="rank-tier">{{ formatRankTierPart(soloRank, accountRankStatus) }}</span>
                <span v-if="formatRankDivisionPart(soloRank, accountRankStatus)" class="rank-division">{{ formatRankDivisionPart(soloRank, accountRankStatus) }}</span>
              </span>
            </span>
            <span
              class="rank-badge"
              :style="rankBadgeStyle(flexRank, 'flex')"
              @mousemove="handleRankBadgeMouseMove($event, 'flex')"
              @mouseleave="resetRankBadgeShine('flex')"
            >
              <span class="rank-emblem" aria-hidden="true"></span>
              <span class="rank-label">
                <span class="rank-queue">{{ t('home.flexQueue') }}：</span>
                <span class="rank-tier">{{ formatRankTierPart(flexRank, accountRankStatus) }}</span>
                <span v-if="formatRankDivisionPart(flexRank, accountRankStatus)" class="rank-division">{{ formatRankDivisionPart(flexRank, accountRankStatus) }}</span>
              </span>
            </span>
          </div>
        </div>
      </div>
      <button
        class="primary-btn control-glow"
        :disabled="accountRefreshBusy"
        type="button"
        @click="handleRefreshAccount"
      >
        {{ accountRefreshBusy ? t('common.refreshing') : t('common.refreshConnection') }}
      </button>
    </section>

    <section
      v-else
      class="account-panel disconnected-panel surface-glow"
    >
      <div class="account-identity">
        <div class="disconnected-mark">!</div>
        <div class="account-main">
          <div class="account-kicker">
            <span class="connection-pill">{{ t('common.disconnected') }}</span>
          </div>
          <h2>{{ t('home.noClientTitle') }}</h2>
          <p>{{ t('home.noClientBody') }}</p>
        </div>
      </div>
      <button
        class="primary-btn control-glow"
        type="button"
        @click="gameStore.checkConnection"
      >
        {{ t('common.refreshConnection') }}
      </button>
    </section>

    <section
      class="ai-analysis-card surface-glow"
    >
      <div class="ai-analysis-main">
        <h2>电子教练</h2>
        <div class="action-row">
          <button
            class="primary-btn control-glow"
            type="button"
            :disabled="coachAnalysisBusy"
            @click="runAnalysis"
          >
            {{ t('home.analyzeNow') }}
          </button>
          <button
            class="auto-analysis-switch control-glow"
            type="button"
            role="switch"
            :aria-checked="autoAnalysis.enabled"
            :class="{ active: autoAnalysis.enabled }"
            :disabled="!accountConnected"
            @click="toggleAutoAnalysis"
          >
            <span class="switch-track">
              <span class="switch-thumb"></span>
            </span>
            <span class="switch-label">自动分析</span>
          </button>
        </div>
      </div>

      <p v-if="coachNotice" class="coach-notice">{{ coachNotice }}</p>
    </section>

    <section class="coach-report-grid">
      <div
        class="coach-report-panel surface-glow"
      >
        <AICoachCards
          :reports="coachReports"
          @open-report="openCoachReport"
        />
      </div>
      <article
        class="fortune-card surface-glow"
        :class="fortuneTone"
      >
        <div class="panel-eyebrow fortune-eyebrow">抽个签</div>
        <div class="fortune-layout">
          <div
            class="slot-window edge-glow"
            :class="{ settled: currentFortune && !fortuneRolling }"
            aria-live="polite"
          >
            <span class="slot-edge-light" aria-hidden="true"></span>
            <div class="slot-reel-list" :class="{ rolling: fortuneRolling }">
              <span
                v-for="(label, index) in slotReelItems"
                :key="`${label}-${index}`"
                class="slot-reel-item"
              >
                {{ label }}
              </span>
            </div>
          </div>
          <button
            class="fortune-button control-glow"
            type="button"
            :disabled="fortuneRolling || fortuneAlreadyDrawn"
            @click="drawFortune"
          >
            {{ fortuneButtonText }}
          </button>
          <p v-if="fortuneNoticeText" class="fortune-disclaimer">
            {{ fortuneNoticeText }}
          </p>
        </div>
      </article>
    </section>

    <HomeChart :summoner="currentSummoner" :puuid="currentSummoner?.puuid" :connected="accountConnected" />

    <CoachSummaryReportModal
      :open="coachReportModalOpen"
      :report="activeCoachReport"
      :report-load-state="coachReportLoadState"
      :error-message="coachReportError"
      :created-at="coachReportCreatedAt"
      :is-preview="coachReportPreview"
      :can-navigate="coachReports.length > 1 && !coachReportPreview"
      :active-index="activeCoachReportIndex"
      :report-count="coachReports.length"
      @close="closeCoachReportModal"
      @previous="navigateCoachReport(-1)"
      @next="navigateCoachReport(1)"
    />
  </div>
</template>

<style scoped>
.home-view {
  --module-edge-color: rgba(232, 221, 186, 0.46);
  --module-edge-soft: rgba(96, 176, 255, 0.14);
  --module-edge-glow: 0 0 0 1px rgba(96, 176, 255, 0.14), 0 10px 24px rgba(41, 151, 255, 0.1);
  --module-edge-glow-strong: 0 0 0 1px rgba(96, 176, 255, 0.16), 0 12px 28px rgba(41, 151, 255, 0.11);
  --home-module-hover-rgb: 96, 176, 255;
  --home-module-hover-border: rgba(var(--home-module-hover-rgb), 0.48);
  --home-module-hover-shadow:
    0 0 0 1px rgba(var(--home-module-hover-rgb), 0.16),
    0 0 18px rgba(var(--home-module-hover-rgb), 0.18),
    0 12px 28px rgba(var(--home-module-hover-rgb), 0.08);
  --control-glow-x: 50%;
  --control-glow-y: 50%;
  --control-edge-width: 1px;
  --control-edge-offset: -1px;
  --edge-glow-size: 82px;
  --home-control-local-glow: transparent;
  --home-control-local-glow-fade: transparent;
  --home-control-border-local-glow: rgba(78, 215, 255, 0.98);
  --home-control-border-local-glow-fade: rgba(41, 151, 255, 0.48);
  --home-control-edge-rgb: 78, 215, 255;
  --home-control-edge-shadow:
    inset 0 1px 0 rgba(var(--home-control-edge-rgb), calc(var(--edge-top-alpha) * 0.82)),
    inset -1px 0 0 rgba(var(--home-control-edge-rgb), calc(var(--edge-right-alpha) * 0.82)),
    inset 0 -1px 0 rgba(var(--home-control-edge-rgb), calc(var(--edge-bottom-alpha) * 0.82)),
    inset 1px 0 0 rgba(var(--home-control-edge-rgb), calc(var(--edge-left-alpha) * 0.82)),
    0 -3px 11px -6px rgba(var(--home-control-edge-rgb), calc(var(--edge-top-alpha) * 0.48)),
    3px 0 11px -6px rgba(var(--home-control-edge-rgb), calc(var(--edge-right-alpha) * 0.48)),
    0 3px 11px -6px rgba(var(--home-control-edge-rgb), calc(var(--edge-bottom-alpha) * 0.48)),
    -3px 0 11px -6px rgba(var(--home-control-edge-rgb), calc(var(--edge-left-alpha) * 0.48));
  --home-control-radius: 10px;
  --home-control-bg: var(--bg-secondary);
  --home-control-bg-hover: rgba(28, 36, 48, 0.96);
  --home-control-bg-hover-local: linear-gradient(var(--home-control-bg-hover), var(--home-control-bg-hover)) padding-box,
    radial-gradient(
      circle at var(--control-glow-x) var(--control-glow-y),
      var(--home-control-border-local-glow) 0%,
      var(--home-control-border-local-glow-fade) 36%,
      var(--home-control-border) 72%
    ) border-box;
  --home-control-bg-active: rgba(13, 17, 24, 0.98);
  --home-control-border: var(--border-color);
  --home-control-border-hover: rgba(96, 176, 255, 0.58);
  --home-control-text: var(--text-primary);
  --home-control-shadow: none;
  --home-control-hover-shadow: 0 0 0 1px rgba(41, 151, 255, 0.16), 0 0 16px rgba(41, 151, 255, 0.22);
  --home-control-active-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.34), 0 0 0 1px rgba(41, 151, 255, 0.14);
  --home-panel-hover-bg: #2a2a2d;
  --home-panel-hover-border: var(--home-module-hover-border);
  --home-panel-hover-shadow: var(--home-module-hover-shadow);
  --home-ai-hover-bg: rgba(42, 42, 45, 0.86);
  --home-ai-hover-border: var(--home-module-hover-border);
  --home-ai-hover-shadow: var(--home-module-hover-shadow);
  --control-hover-shadow: var(--home-control-hover-shadow);
  --coach-gold: rgba(238, 205, 112, 0.96);
  --coach-gold-muted: rgba(232, 221, 186, 0.72);
  --slot-window-bg: rgba(12, 13, 17, 0.72);
  --slot-window-sheen: linear-gradient(180deg, rgba(255, 255, 255, 0.055), transparent 34%, rgba(0, 0, 0, 0.14));
  --slot-window-border: rgba(232, 221, 186, 0.16);
  --slot-window-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.35), inset 0 -1px 0 rgba(255, 255, 255, 0.06), 0 0 0 1px rgba(232, 221, 186, 0.1), 0 10px 20px rgba(0, 0, 0, 0.16);
  --slot-window-top-fade: linear-gradient(180deg, rgba(0, 0, 0, 0.42), transparent);
  --slot-window-bottom-fade: linear-gradient(0deg, rgba(0, 0, 0, 0.36), transparent);
  --slot-window-active-border: rgba(232, 221, 186, 0.28);
  --slot-edge-rgb: var(--home-control-edge-rgb);
  --slot-edge-core: var(--home-control-border-local-glow);
  --slot-edge-fade: var(--home-control-border-local-glow-fade);
  --slot-edge-size: 104px;
  --slot-edge-width: 3px;
  --slot-edge-inset-width: 2px;
  --slot-edge-inset-alpha: 0.46;
  --slot-edge-outer-alpha: 0.14;
  --slot-item-height: 72px;
  --rank-text: #e0e0e0;
  --switch-track-off: rgba(23, 23, 25, 0.98);
  --switch-track-on: rgba(33, 196, 255, 0.78);
  --switch-track-border: var(--border-color);
  --switch-thumb-color: #9eabb8;
  --switch-thumb-active: #dbeeff;
  --switch-thumb-shadow: 0 1px 2px rgba(0, 0, 0, 0.28);
  max-width: 1180px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.account-panel,
.ai-analysis-card,
.fortune-card,
.coach-report-panel {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: none;
  transition: background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
}

.account-panel:hover,
.account-panel:focus-within {
  background: var(--home-panel-hover-bg);
}

.ai-analysis-card:hover,
.ai-analysis-card:focus-within,
.fortune-card:hover,
.fortune-card:focus-within,
.coach-report-panel:hover,
.coach-report-panel:focus-within {
  background: var(--home-ai-hover-bg);
}

.account-panel:hover,
.account-panel:focus-within,
.ai-analysis-card:hover,
.ai-analysis-card:focus-within,
.fortune-card:hover,
.fortune-card:focus-within,
.coach-report-panel:hover,
.coach-report-panel:focus-within {
  border-color: var(--home-module-hover-border);
  box-shadow: var(--home-module-hover-shadow);
}

.account-main p,
.coach-notice,
.fortune-disclaimer {
  color: var(--text-secondary);
}

.connection-pill {
  flex-shrink: 0;
  padding: 8px 12px;
  border-radius: var(--radius-pill);
  background: var(--error-bg);
  color: var(--error-color);
  font-size: 13px;
  font-weight: 700;
}

.connection-pill.connected {
  background: var(--success-bg);
  color: var(--success-color);
}

.account-panel {
  min-height: 122px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  align-items: center;
  gap: 18px;
  padding: 22px;
}

.account-identity {
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 18px;
  overflow: hidden;
}

.account-avatar,
.disconnected-mark {
  width: 88px;
  height: 88px;
  border-radius: 20px;
  background: var(--bg-tertiary);
}

.account-avatar {
  display: block;
  object-fit: cover;
}

.account-avatar[data-asset-failed='true'] {
  display: none;
}

.disconnected-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--warning-color);
  border: 1px solid var(--warning-color);
  font-size: 42px;
  font-weight: 900;
}

.panel-eyebrow {
  color: var(--text-tertiary);
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 6px;
}

.account-main {
  min-width: 0;
  overflow: hidden;
}

.summoner-heading {
  min-width: 0;
  width: 100%;
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 10px;
  margin-bottom: 8px;
  white-space: nowrap;
}

.account-kicker {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 8px;
}

.account-kicker .panel-eyebrow {
  margin-bottom: 0;
}

.account-main h2,
.ai-analysis-main h2,
.fortune-card h2 {
  color: var(--text-primary);
  margin: 0;
}

.account-main h2 {
  font-size: 30px;
  line-height: 1.15;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summoner-heading h2 {
  min-width: 0;
  flex: 1 1 auto;
}

.rank-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  min-width: 0;
  overflow: hidden;
}

.rank-badge {
  --rank-border: #8a94a3;
  --rank-border-light: #6b7280;
  --rank-hover-border: #a2acbb;
  --rank-hover-border-light: #7a8494;
  --rank-fill-rgb: 122, 132, 148;
  --rank-fill-opacity: 0.12;
  --rank-inner-outline: 0 0 0 rgba(0, 0, 0, 0);
  --rank-shine-x: 48%;
  --rank-shine-y: 48%;
  --rank-shine-soft: rgba(255, 255, 255, 0.06);
  --rank-shine-core: rgba(255, 255, 255, 0.1);
  position: relative;
  isolation: isolate;
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 10px;
  border: 1px solid var(--rank-border);
  border-radius: 8px;
  background:
    linear-gradient(
      135deg,
      transparent 30%,
      var(--rank-shine-soft) 45%,
      var(--rank-shine-core) 50%,
      var(--rank-shine-soft) 55%,
      transparent 70%
    ),
    rgba(var(--rank-fill-rgb), var(--rank-fill-opacity));
  background-position: var(--rank-shine-x) var(--rank-shine-y), center;
  background-size: 220% 220%, auto;
  color: var(--rank-text);
  box-shadow:
    inset -1px -1px 2px rgba(0, 0, 0, 0.15),
    var(--rank-inner-outline);
  overflow: visible;
  text-shadow: none;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background 0.2s ease,
    background-position 0.25s ease-out;
}

.rank-badge:hover {
  --rank-fill-opacity: 0.16;
  --rank-shine-soft: rgba(255, 255, 255, 0.08);
  --rank-shine-core: rgba(255, 255, 255, 0.14);
  border-color: var(--rank-hover-border);
  box-shadow:
    inset -1px -1px 2px rgba(0, 0, 0, 0.15),
    var(--rank-inner-outline),
    0 2px 4px rgba(0, 0, 0, 0.12);
}

.rank-emblem {
  position: relative;
  z-index: 1;
  width: 9px;
  height: 9px;
  flex: 0 0 auto;
  transform: rotate(45deg);
  border: 1px solid var(--rank-border);
  border-radius: 2px;
  background: rgba(var(--rank-fill-rgb), 0.22);
  box-shadow: inset -1px -1px 1px rgba(0, 0, 0, 0.16);
}

.rank-emblem::after {
  content: '';
  position: absolute;
  inset: 2px;
  border-radius: 1px;
  background: var(--rank-border);
  opacity: 0.72;
}

.rank-label {
  position: relative;
  z-index: 1;
  white-space: nowrap;
}

.rank-queue {
  font-weight: 700;
}

.rank-tier {
  font-weight: 500;
  letter-spacing: 0.5px;
}

.rank-division {
  margin-left: 2px;
  font-family: 'Times New Roman', serif;
  font-weight: 400;
  color: inherit;
  opacity: 1;
}

.coach-report-grid {
  --fortune-column-width: 286px;
  --coach-grid-gap: 16px;
  --coach-report-height: 318px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--fortune-column-width);
  align-items: start;
  gap: var(--coach-grid-gap);
  overflow: visible;
}

.coach-report-panel {
  min-width: 0;
  min-height: var(--coach-report-height);
  height: var(--coach-report-height);
  position: relative;
  z-index: 1;
  border-radius: 12px;
  overflow: visible;
}

.ai-analysis-card,
.fortune-card {
  padding: 18px 20px;
}

.ai-analysis-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: visible;
}

.ai-analysis-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 18px;
}

.fortune-card {
  --home-control-border-local-glow: rgba(78, 215, 255, 0.98);
  --home-control-border-local-glow-fade: rgba(41, 151, 255, 0.48);
  --home-control-edge-rgb: 78, 215, 255;
  --home-ai-hover-border: var(--home-module-hover-border);
  --home-ai-hover-shadow: var(--home-module-hover-shadow);
  --slot-window-border: rgba(232, 221, 186, 0.16);
  --slot-window-active-border: rgba(232, 221, 186, 0.3);
  --slot-edge-rgb: 78, 215, 255;
  --slot-edge-core: rgba(78, 215, 255, 0.98);
  --slot-edge-fade: rgba(41, 151, 255, 0.48);
  min-height: var(--coach-report-height);
  height: var(--coach-report-height);
  box-sizing: border-box;
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
}

.ai-analysis-main h2 {
  font-size: 22px;
  line-height: 1.25;
  margin: 0;
}

.action-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.primary-btn,
.secondary-btn,
.fortune-button {
  min-height: 42px;
  padding: 0 16px;
  border: 1px solid var(--home-control-border);
  border-radius: var(--home-control-radius);
  background: var(--home-control-bg);
  color: var(--home-control-text);
  box-shadow: var(--home-control-shadow);
  text-shadow: none;
  font-size: 15px;
  font-weight: 800;
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.24s ease,
    color 0.18s ease,
    opacity 0.24s ease;
}

/* 交互反馈只保留边框和底色变化：跟随鼠标的边缘泛光需要每次鼠标移动都重绘几十个元素，
   低配机器代价太高，也属于装饰性效果，包豪斯风格里直接去掉。 */
.control-glow,
.surface-glow {
  position: relative;
}

.primary-btn:hover:not(:disabled),
.secondary-btn:hover:not(:disabled),
.fortune-button:hover:not(:disabled) {
  border-color: transparent;
  background: var(--home-control-bg-hover-local);
  box-shadow: var(--home-control-hover-shadow), var(--home-control-edge-shadow);
}

.primary-btn:active:not(:disabled),
.secondary-btn:active:not(:disabled),
.fortune-button:active:not(:disabled) {
  border-color: var(--home-control-border);
  background: var(--home-control-bg-active);
  box-shadow: var(--home-control-active-shadow), var(--home-control-edge-shadow);
}

.primary-btn:focus-visible,
.secondary-btn:focus-visible,
.fortune-button:focus-visible {
  border-color: transparent;
  background: var(--home-control-bg-hover-local);
  box-shadow: var(--home-control-hover-shadow), var(--home-control-edge-shadow);
  outline: none;
}

.primary-btn.control-glow[data-near-glow='true']:not(:disabled):not(:hover):not(:focus-visible),
.secondary-btn.control-glow[data-near-glow='true']:not(:disabled):not(:hover):not(:focus-visible),
.fortune-button.control-glow[data-near-glow='true']:not(:disabled):not(:hover):not(:focus-visible) {
  box-shadow: var(--home-control-edge-shadow);
}

.secondary-btn {
  min-width: 112px;
}

.secondary-btn.active {
  border-color: transparent;
  background: var(--home-control-bg-hover-local);
}

.auto-analysis-switch {
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border: 1px solid var(--home-control-border);
  border-radius: 999px;
  background: var(--home-control-bg);
  color: var(--home-control-text);
  box-shadow: var(--home-control-shadow);
  font-size: 14px;
  font-weight: 800;
  transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.24s ease, opacity 0.24s ease;
}

.auto-analysis-switch:hover:not(:disabled) {
  border-color: transparent;
  background: var(--home-control-bg-hover-local);
  box-shadow: var(--control-hover-shadow), var(--home-control-edge-shadow);
}

.auto-analysis-switch:active:not(:disabled) {
  border-color: var(--home-control-border);
  background: var(--home-control-bg-active);
  box-shadow: var(--home-control-active-shadow), var(--home-control-edge-shadow);
}

.auto-analysis-switch:focus-visible {
  border-color: transparent;
  background: var(--home-control-bg-hover-local);
  box-shadow: var(--control-hover-shadow), var(--home-control-edge-shadow);
  outline: none;
}

.auto-analysis-switch.control-glow[data-near-glow='true']:not(:disabled):not(:hover):not(:focus-visible) {
  box-shadow: var(--home-control-edge-shadow);
}

.switch-track {
  width: 54px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  padding: 2px;
  border: 1px solid var(--switch-track-border);
  border-radius: 999px;
  background: var(--switch-track-off);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
  transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.switch-thumb {
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  border-radius: 999px;
  background: var(--switch-thumb-color);
  box-shadow: var(--switch-thumb-shadow);
  transform: translateX(0);
  transition: transform 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}

.auto-analysis-switch:hover:not(:disabled) .switch-track,
.auto-analysis-switch:focus-visible .switch-track {
  border-color: var(--home-control-border-hover);
  box-shadow:
    inset 0 1px 2px rgba(0, 0, 0, 0.2),
    var(--home-control-hover-shadow);
}

.auto-analysis-switch.active {
  border-color: var(--home-control-border);
}

.auto-analysis-switch.active .switch-track {
  background: var(--switch-track-on);
  border-color: var(--switch-track-border);
}

.auto-analysis-switch.active .switch-thumb {
  transform: translateX(24px);
  background: var(--switch-thumb-active);
}

.auto-analysis-switch:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.primary-btn:disabled,
.secondary-btn:disabled,
.fortune-button:disabled {
  opacity: 0.48;
  cursor: not-allowed;
  transform: none;
}

.coach-notice {
  margin: 0;
  color: var(--coach-gold-muted);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.5;
}

.coach-report-panel {
  --module-edge-color: rgba(120, 190, 255, 0.46);
  --module-edge-soft: rgba(41, 151, 255, 0.14);
  --module-edge-glow: 0 0 0 1px rgba(41, 151, 255, 0.14), 0 10px 24px rgba(41, 151, 255, 0.1);
  --module-edge-glow-strong: 0 0 0 1px rgba(41, 151, 255, 0.16), 0 12px 28px rgba(41, 151, 255, 0.11);
  --coach-report-hover-shadow:
    0 0 0 1px rgba(var(--home-module-hover-rgb), 0.08),
    0 0 10px rgba(var(--home-module-hover-rgb), 0.08);
  --coach-report-near-shadow: none;
  --home-ai-hover-border: var(--home-module-hover-border);
  --home-ai-hover-shadow: var(--home-module-hover-shadow);
  --home-control-border-local-glow: rgba(120, 190, 255, 0.78);
  --home-control-border-local-glow-fade: rgba(77, 143, 204, 0.3);
  --home-control-edge-rgb: 120, 190, 255;
  --control-edge-width: 2px;
  --control-edge-offset: -2px;
  --edge-glow-size: 188px;
}

.coach-report-panel:hover,
.coach-report-panel:focus-within {
  box-shadow: var(--coach-report-hover-shadow);
}

.coach-report-panel.surface-glow[data-near-glow='true'] {
  box-shadow: var(--coach-report-near-shadow);
}

.coach-report-panel.surface-glow::before {
  z-index: 3;
}

.coach-report-panel :deep(.ai-coach-cards) {
  --record-panel-hover-shadow: var(--coach-report-hover-shadow);
  position: relative;
  z-index: 1;
  min-height: var(--coach-report-height);
  height: var(--coach-report-height);
  overflow: visible;
}

:global([data-theme="light"] .coach-report-panel) {
  --module-edge-color: rgba(41, 151, 255, 0.5);
  --module-edge-soft: rgba(41, 151, 255, 0.12);
  --module-edge-glow: 0 0 0 1px rgba(41, 151, 255, 0.14), 0 10px 24px rgba(41, 151, 255, 0.1);
  --module-edge-glow-strong: 0 0 0 1px rgba(41, 151, 255, 0.16), 0 12px 28px rgba(41, 151, 255, 0.11);
}

:global([data-theme="light"] .rank-badge) {
  --rank-shine-soft: rgba(255, 255, 255, 0.16);
  --rank-shine-core: rgba(255, 255, 255, 0.25);
  border-color: var(--rank-border-light);
  color: var(--rank-text);
}

:global([data-theme="light"] .rank-queue),
:global([data-theme="light"] .rank-tier) {
  color: #2c2c2c;
}

:global([data-theme="light"] .rank-division) {
  color: #2c2c2c;
  opacity: 1;
}

:global([data-theme="light"] .rank-badge:hover) {
  --rank-shine-soft: rgba(255, 255, 255, 0.2);
  --rank-shine-core: rgba(255, 255, 255, 0.32);
  border-color: var(--rank-hover-border-light);
}

:global([data-theme="light"] .rank-emblem) {
  border-color: var(--rank-border-light);
}

:global([data-theme="light"] .rank-emblem::after) {
  background: var(--rank-border-light);
}

:global([data-theme="light"] .home-view) {
  --rp-light-gold-border: var(--border-color);
  --rp-light-gold-border-hover: rgba(86, 109, 134, 0.42);
  --rp-light-gold-edge-core: rgba(78, 215, 255, 0.98);
  --rp-light-gold-edge-fade: rgba(41, 151, 255, 0.48);
  --rp-light-gold-glow: 0 0 0 1px rgba(41, 151, 255, 0.12), 0 0 12px rgba(41, 151, 255, 0.2);
  --rp-light-gold-glow-active: inset 0 1px 2px rgba(17, 77, 116, 0.14), 0 0 0 1px rgba(41, 151, 255, 0.12), 0 0 8px rgba(41, 151, 255, 0.18);
  --rp-light-global-glow: var(--rp-light-gold-glow);
  --rp-fortune-blue-border: rgba(41, 151, 255, 0.2);
  --rp-fortune-blue-border-strong: rgba(33, 196, 255, 0.42);
  --rp-fortune-blue-edge-core: rgba(78, 215, 255, 0.98);
  --rp-fortune-blue-edge-fade: rgba(41, 151, 255, 0.48);
  --rp-fortune-blue-glow: 0 0 0 2px rgba(41, 151, 255, 0.14), 0 0 14px rgba(33, 196, 255, 0.24);
  --rp-fortune-blue-glow-active: inset 0 1px 2px rgba(17, 77, 116, 0.18), 0 0 0 2px rgba(41, 151, 255, 0.08), 0 0 7px rgba(33, 196, 255, 0.18);
  --rp-gold-border: var(--rp-light-gold-border);
  --rp-gold-border-hover: var(--rp-light-gold-border-hover);
  --rp-gold-glow-soft: none;
  --rp-gold-glow-hover: var(--rp-light-gold-glow);
  --rp-gold-glow-active: var(--rp-light-gold-glow-active);
  --rp-blue-glow-hover: 0 0 0 2px rgba(41, 151, 255, 0.12), 0 0 6px rgba(41, 151, 255, 0.22);
  --module-edge-color: rgba(86, 109, 134, 0.36);
  --module-edge-soft: rgba(86, 109, 134, 0.1);
  --module-edge-glow: 0 0 0 1px rgba(86, 109, 134, 0.1), 0 10px 22px rgba(86, 109, 134, 0.08);
  --module-edge-glow-strong: 0 0 0 1px rgba(86, 109, 134, 0.13), 0 12px 26px rgba(86, 109, 134, 0.1);
  --home-module-hover-rgb: 86, 109, 134;
  --home-module-hover-border: rgba(var(--home-module-hover-rgb), 0.42);
  --home-module-hover-shadow:
    0 0 0 1px rgba(var(--home-module-hover-rgb), 0.14),
    0 0 18px rgba(var(--home-module-hover-rgb), 0.14),
    0 12px 28px rgba(var(--home-module-hover-rgb), 0.07);
  --home-control-bg: var(--bg-secondary);
  --home-control-bg-hover: rgba(244, 249, 255, 0.98);
  --home-control-local-glow: transparent;
  --home-control-local-glow-fade: transparent;
  --control-edge-width: 2px;
  --control-edge-offset: -2px;
  --home-control-border-local-glow: var(--rp-light-gold-edge-core);
  --home-control-border-local-glow-fade: var(--rp-light-gold-edge-fade);
  --home-control-edge-rgb: 78, 215, 255;
  --home-control-bg-active: rgba(232, 241, 252, 0.98);
  --home-control-border: var(--rp-gold-border);
  --home-control-border-hover: var(--rp-gold-border-hover);
  --home-control-text: #24384d;
  --home-control-shadow: var(--rp-gold-glow-soft);
  --home-control-hover-shadow: var(--rp-gold-glow-hover);
  --home-control-active-shadow: var(--rp-gold-glow-active);
  --home-panel-hover-bg: var(--bg-secondary);
  --home-panel-hover-border: var(--home-module-hover-border);
  --home-panel-hover-shadow: var(--home-module-hover-shadow);
  --home-ai-hover-bg: var(--bg-secondary);
  --home-ai-hover-border: var(--home-module-hover-border);
  --home-ai-hover-shadow: var(--home-module-hover-shadow);
  --control-hover-shadow: var(--home-control-hover-shadow);
  --coach-gold: #6f5b19;
  --coach-gold-muted: rgba(111, 91, 25, 0.64);
  --slot-window-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 255, 0.9));
  --slot-window-sheen: linear-gradient(180deg, rgba(255, 255, 255, 0.74), transparent 46%, rgba(41, 151, 255, 0.035));
  --slot-window-border: rgba(41, 151, 255, 0.16);
  --slot-window-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.82), inset 0 -1px 2px rgba(15, 23, 42, 0.04), 0 8px 18px rgba(15, 23, 42, 0.06);
  --slot-window-top-fade: linear-gradient(180deg, rgba(255, 255, 255, 0.58), transparent);
  --slot-window-bottom-fade: linear-gradient(0deg, rgba(220, 229, 245, 0.34), transparent);
  --slot-window-active-border: rgba(41, 151, 255, 0.22);
  --slot-edge-rgb: 78, 215, 255;
  --slot-edge-core: rgba(78, 215, 255, 0.98);
  --slot-edge-fade: rgba(41, 151, 255, 0.48);
  --slot-edge-size: 124px;
  --slot-edge-width: 4px;
  --slot-edge-inset-width: 3px;
  --slot-edge-inset-alpha: 0.68;
  --slot-edge-outer-alpha: 0.26;
  --rank-text: #2c2c2c;
  --switch-track-off: rgba(245, 245, 247, 0.98);
  --switch-track-on: rgba(41, 151, 255, 0.46);
  --switch-track-border: var(--border-color);
  --switch-thumb-color: #fffaf0;
  --switch-thumb-active: #ffffff;
  --switch-thumb-shadow: 0 1px 2px rgba(90, 70, 20, 0.2);
}

:global([data-theme="light"] .home-view .coach-report-panel) {
  --module-edge-color: var(--rp-fortune-blue-border-strong);
  --module-edge-soft: rgba(41, 151, 255, 0.12);
  --module-edge-glow: 0 0 0 1px rgba(41, 151, 255, 0.12), 0 10px 24px rgba(33, 196, 255, 0.12);
  --home-ai-hover-border: var(--home-module-hover-border);
  --home-ai-hover-shadow: var(--home-module-hover-shadow);
  --home-control-border-local-glow: var(--rp-fortune-blue-edge-core);
  --home-control-border-local-glow-fade: var(--rp-fortune-blue-edge-fade);
  --home-control-edge-rgb: 33, 196, 255;
}

:global([data-theme="light"] .home-view .coach-report-panel .ai-coach-cards) {
  --record-panel-border-hover: var(--home-module-hover-border);
  --record-panel-glow-rgb: var(--home-module-hover-rgb);
  --record-panel-glow: rgba(var(--record-panel-glow-rgb), 0.16);
  --record-panel-glow-soft: rgba(var(--record-panel-glow-rgb), 0.06);
  --record-panel-hover-shadow: var(--coach-report-hover-shadow);
  --record-card-border-hover: rgba(41, 151, 255, 0.42);
  --record-card-local-glow: rgba(41, 151, 255, 0.12);
  --record-stack-border-hover: rgba(41, 151, 255, 0.18);
}

:global([data-theme="light"] .home-view .fortune-card) {
  --home-control-bg-hover: rgba(245, 246, 248, 0.98);
  --home-control-bg-active: rgba(229, 231, 235, 0.94);
  --home-control-border: rgba(86, 109, 134, 0.22);
  --home-control-border-hover: rgba(86, 109, 134, 0.3);
  --home-control-border-local-glow: rgba(78, 215, 255, 0.98);
  --home-control-border-local-glow-fade: rgba(41, 151, 255, 0.48);
  --home-control-edge-rgb: 78, 215, 255;
  --home-control-hover-shadow: 0 0 0 1px rgba(41, 151, 255, 0.1), 0 0 10px rgba(41, 151, 255, 0.16);
  --home-control-active-shadow: inset 0 1px 2px rgba(31, 41, 55, 0.1), 0 0 0 1px rgba(41, 151, 255, 0.12);
  --control-hover-shadow: var(--home-control-hover-shadow);
  --home-ai-hover-bg: var(--bg-secondary);
  --home-ai-hover-border: var(--home-module-hover-border);
  --home-ai-hover-shadow: var(--home-module-hover-shadow);
  --coach-gold: #4f421e;
  --coach-gold-muted: rgba(79, 66, 30, 0.64);
  --slot-window-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 247, 249, 0.94));
  --slot-window-sheen: linear-gradient(180deg, rgba(255, 255, 255, 0.82), transparent 44%, rgba(229, 231, 235, 0.18));
  --slot-window-border: rgba(86, 109, 134, 0.18);
  --slot-window-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.86), inset 0 -1px 2px rgba(31, 41, 55, 0.04), 0 8px 18px rgba(31, 41, 55, 0.055);
  --slot-window-top-fade: linear-gradient(180deg, rgba(255, 255, 255, 0.64), transparent);
  --slot-window-bottom-fade: linear-gradient(0deg, rgba(229, 231, 235, 0.34), transparent);
  --slot-window-active-border: rgba(86, 109, 134, 0.32);
  --slot-edge-rgb: 78, 215, 255;
  --slot-edge-core: rgba(78, 215, 255, 0.98);
  --slot-edge-fade: rgba(41, 151, 255, 0.48);
  --slot-edge-inset-alpha: 0.56;
  --slot-edge-outer-alpha: 0.22;
  --slot-reel-shadow: none;
}

.fortune-card {
  display: flex;
  flex-direction: column;
  position: relative;
  text-align: center;
}

.fortune-eyebrow {
  color: var(--text-primary);
  font-size: 22px;
  font-weight: 800;
  line-height: 1.25;
  letter-spacing: 0;
  text-shadow: none;
}

.fortune-layout {
  display: flex;
  min-height: 0;
  height: calc(100% - 34px);
  width: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.slot-window {
  --control-glow-x: 50%;
  --control-glow-y: 50%;
  --edge-glow-size: 82px;
  --edge-top-alpha: 0;
  --edge-right-alpha: 0;
  --edge-bottom-alpha: 0;
  --edge-left-alpha: 0;
  position: relative;
  width: min(204px, 100%);
  height: var(--slot-item-height);
  border: 1px solid var(--slot-window-border);
  border-radius: 14px;
  background:
    var(--slot-window-sheen),
    var(--slot-window-bg);
  box-shadow: var(--slot-window-shadow);
  overflow: hidden;
  isolation: isolate;
  transition: border-color 0.18s ease, box-shadow 0.24s ease;
}

.slot-window.edge-glow[data-near-glow='true'],
.slot-window.edge-glow:hover {
  box-shadow:
    var(--slot-window-shadow),
    inset 0 0 0 var(--slot-edge-inset-width) rgba(var(--slot-edge-rgb), var(--slot-edge-inset-alpha)),
    0 0 18px rgba(var(--slot-edge-rgb), var(--slot-edge-outer-alpha));
}

.slot-edge-light {
  position: absolute;
  inset: 0;
  z-index: 4;
  border-radius: inherit;
  padding: var(--slot-edge-width);
  background: radial-gradient(
    circle var(--slot-edge-size) at var(--control-glow-x) var(--control-glow-y),
    var(--slot-edge-core) 0%,
    var(--slot-edge-fade) 44%,
    transparent 78%
  );
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.14s ease;
}

.slot-window.edge-glow[data-near-glow='true'] .slot-edge-light,
.slot-window.edge-glow:hover .slot-edge-light {
  opacity: 1;
}

.slot-window::before,
.slot-window::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 18px;
  pointer-events: none;
  z-index: 2;
}

.slot-window::before {
  top: 0;
  background: var(--slot-window-top-fade);
}

.slot-window::after {
  bottom: 0;
  background: var(--slot-window-bottom-fade);
}

.slot-window.settled {
  border-color: var(--slot-window-active-border);
}

.slot-reel-list {
  display: flex;
  flex-direction: column;
  transform: translateY(0);
  will-change: transform;
}

.slot-reel-list.rolling {
  animation: slot-spin 1.18s cubic-bezier(0.25, 1, 0.5, 1) both;
}

.slot-reel-item {
  height: var(--slot-item-height);
  min-height: var(--slot-item-height);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 18px;
  color: var(--coach-gold);
  font-family: 'Noto Serif SC', 'Source Han Serif SC', SimSun, PMingLiU, 'Times New Roman', serif;
  font-size: 22px;
  font-weight: 800;
  line-height: 1.1;
  text-align: center;
  text-shadow: var(--slot-reel-shadow, 0 0 12px rgba(212, 175, 55, 0.16));
  overflow-wrap: anywhere;
}

.fortune-card.bad .slot-reel-item:first-child {
  color: #d88a72;
}

.fortune-card.good .slot-window {
  border-color: var(--slot-window-active-border);
}

.fortune-card.good .slot-reel-item:first-child {
  color: var(--coach-gold);
}

.fortune-button {
  min-width: 160px;
}

.fortune-disclaimer {
  position: absolute;
  right: 20px;
  bottom: 18px;
  left: 20px;
  box-sizing: border-box;
  margin: 0;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

@keyframes slot-spin {
  0% {
    transform: translateY(0);
  }

  42% {
    transform: translateY(calc(var(--slot-item-height) * -4));
  }

  70% {
    transform: translateY(calc(var(--slot-item-height) * -7));
  }

  88% {
    transform: translateY(calc(var(--slot-item-height) * -0.28));
  }

  100% {
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .slot-reel-list.rolling {
    animation: none;
  }

  .slot-reel-list.rolling {
    transition: opacity 0.18s ease;
  }
}

@media (max-width: 920px) {
  .coach-report-grid {
    grid-template-columns: 1fr;
  }

  .coach-report-grid {
    --fortune-column-width: 0px;
  }

  .account-panel {
    align-items: center;
    gap: 12px;
    padding: 18px;
  }

  .account-identity {
    gap: 14px;
  }

  .summoner-heading {
    display: flex;
    min-height: auto;
    overflow: visible;
  }

  .summoner-heading h2 {
    font-size: 24px;
    max-width: none;
  }

  .summoner-heading .connection-pill.connected {
    position: static;
    transform: none;
  }

  .account-avatar,
  .disconnected-mark {
    width: 76px;
    height: 76px;
  }

  .action-row {
    justify-content: flex-start;
  }
}
</style>
