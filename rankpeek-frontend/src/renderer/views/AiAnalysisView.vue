<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { t, type MessageKey } from '@/i18n'
import PostgameAiAnalysisModal from '@/components/match-history/PostgameAiAnalysisModal.vue'
import CoachSummaryReportModal from '@/components/CoachSummaryReportModal.vue'
import { apiClient } from '@/api/httpClient'
import { useGameStore } from '@/stores/game'
import {
  loadLocalAiAnalysisResults,
  parseCoachSummaryReportOutput,
  type LocalAiAnalysisDisplayResult
} from '@/services/localAiAnalysis'
import type { PostgameAiRunOutputV1 } from '@/services/postgameAiRunPersistence'
import type { CoachSummaryReportV1 } from '@/types/coachSummaryReport'
import {
  buildAccountAnalysisInputSnapshot,
  type AiAnalysisInputSnapshot
} from '@/services/aiAnalysisInputSnapshot'
import {
  getLocalAiSettings,
  type LocalAiSettings
} from '@/services/localAiProviderClient'
import {
  deleteFallbackAiAnalysisResultsByAccount
} from '@/services/localAiAnalysisFallbackStore'
import {
  getLocalAiCostUsageSummary,
  getLocalCostSummary,
  type LocalAiCostUsageSummaryItem,
  type LocalCostSummary
} from '@/services/localCostClient'
import { getChampionIconUrl, getProfileIconUrl, markAssetLoadFailed } from '@/utils/gameAssetUrls'
import { maskSummonerName } from '@/utils/privacyMode'

type ReportTypeFilter = 'all' | 'pregame' | 'postgame' | 'praise' | 'coach'
type ReportCategory = Exclude<ReportTypeFilter, 'all'> | 'fun' | 'other'
type SavedPostgameReplayState = 'streaming' | 'completed'
type DeleteReportType = 'coach' | 'postgame' | 'praise'
type AiCostUsageKey = 'coach' | 'pregame' | 'postgame'

const SAVED_POSTGAME_REPLAY_INITIAL_DELAY_MS = 80
const SAVED_POSTGAME_REPLAY_TARGET_DURATION_MS = 3200
const SAVED_POSTGAME_REPLAY_MIN_STEP_DELAY_MS = 38
const SAVED_POSTGAME_REPLAY_MAX_STEP_DELAY_MS = 120
const SAVED_POSTGAME_REPLAY_SENTENCE_DELAY_MS = 90
const SAVED_POSTGAME_REPLAY_COMMA_DELAY_MS = 40
const SAVED_POSTGAME_REPLAY_MIN_STEPS = 44
const SAVED_POSTGAME_REPLAY_MAX_STEPS = 96
const DELETE_REPORT_TYPE_OPTIONS: Array<{ key: DeleteReportType; labelKey: MessageKey; analysisTypes: string[] }> = [
  {
    key: 'coach',
    labelKey: 'aiAnalysis.deleteReportsCoach',
    analysisTypes: ['coach_summary']
  },
  {
    key: 'postgame',
    labelKey: 'aiAnalysis.deleteReportsPostgame',
    analysisTypes: ['postgame_review', 'postgame', 'post_game', 'review']
  },
  {
    key: 'praise',
    labelKey: 'aiAnalysis.deleteReportsPraise',
    analysisTypes: ['postgame_praise', 'praise', 'compliment']
  }
]
const AI_COST_USAGE_OPTIONS: Array<{ key: AiCostUsageKey; labelKey: MessageKey }> = [
  { key: 'coach', labelKey: 'aiAnalysis.costUsageCoach' },
  { key: 'pregame', labelKey: 'aiAnalysis.costUsagePregame' },
  { key: 'postgame', labelKey: 'aiAnalysis.costUsagePostgame' }
]

const gameStore = useGameStore()
const router = useRouter()

const analysisResults = ref<LocalAiAnalysisDisplayResult[]>([])
const selectedPostgameResult = ref<LocalAiAnalysisDisplayResult | null>(null)
const selectedPostgameChampionIdByName = ref<Record<string, number>>({})
const selectedPostgameReplayText = ref('')
const selectedPostgameReplayState = ref<SavedPostgameReplayState>('completed')
const selectedCoachSummaryResult = ref<LocalAiAnalysisDisplayResult | null>(null)
const selectedCoachSummaryReport = ref<CoachSummaryReportV1 | null>(null)
const loadingResults = ref(false)
const historyUnavailable = ref(false)
const historyError = ref<string | null>(null)
const placeholderNotice = ref('')
const preparedSnapshot = ref<AiAnalysisInputSnapshot | null>(null)
const preparingInput = ref(false)
const preparationUnavailable = ref(false)
const preparationError = ref<string | null>(null)
const selectedReportType = ref<ReportTypeFilter>('all')
const localAiSettings = ref<LocalAiSettings | null>(null)
const todayLocalCostSummary = ref<LocalCostSummary | null>(null)
const localCostSummary = ref<LocalCostSummary | null>(null)
const lastMonthLocalCostSummary = ref<LocalCostSummary | null>(null)
const aiCostUsageSummary = ref<LocalAiCostUsageSummaryItem[]>([])
const localOverviewLoading = ref(false)
const localOverviewError = ref<string | null>(null)
const deleteReportDialogOpen = ref(false)
const deleteReportSelections = ref<Record<DeleteReportType, boolean>>({
  coach: false,
  postgame: false,
  praise: false
})
const deletingReports = ref(false)
const deleteReportsError = ref<string | null>(null)
let loadRequestId = 0
let prepareRequestId = 0
let overviewRequestId = 0
let championIdByNamePromise: Promise<Record<string, number>> | null = null
let selectedPostgameReplayTimer: number | null = null

const currentSummoner = computed(() => gameStore.currentSummoner)
const accountPuuid = computed(() => currentSummoner.value?.puuid ?? '')
const currentSummonerName = computed(() => {
  const summoner = currentSummoner.value
  if (!summoner) {
    return ''
  }

  const name = summoner.tagLine ? `${summoner.gameName}#${summoner.tagLine}` : summoner.gameName
  return maskSummonerName(name, summoner.puuid)
})
const hasResults = computed(() => analysisResults.value.length > 0)
const filteredAnalysisResults = computed(() => {
  if (selectedReportType.value === 'all') {
    return analysisResults.value
  }

  return analysisResults.value.filter(result => getReportCategory(result) === selectedReportType.value)
})
const hasFilteredResults = computed(() => filteredAnalysisResults.value.length > 0)
const selectedDeleteReportTypes = computed(() => (
  DELETE_REPORT_TYPE_OPTIONS.filter(option => deleteReportSelections.value[option.key])
))
const selectedDeleteAnalysisTypes = computed(() => (
  [...new Set(selectedDeleteReportTypes.value.flatMap(option => option.analysisTypes))]
))
const allDeleteReportTypesSelected = computed(() => (
  DELETE_REPORT_TYPE_OPTIONS.every(option => deleteReportSelections.value[option.key])
))
const canDeleteSelectedReports = computed(() => (
  Boolean(accountPuuid.value)
  && selectedDeleteAnalysisTypes.value.length > 0
  && !deletingReports.value
))
const selectedPostgameRun = computed<PostgameAiRunOutputV1 | null>(() => (
  selectedPostgameResult.value?.output.postgameRun ?? null
))
const selectedPostgameRunMode = computed(() => selectedPostgameRun.value?.mode ?? 'review')
const selectedPostgameModalRosterPlayers = computed(() => {
  return selectedPostgameRun.value?.rosterPlayers ?? []
})
const accountStatusLabel = computed(() => currentSummonerName.value || t('aiAnalysis.noAccountStatus'))
const localProviderStatusLabel = computed(() => {
  if (!localAiSettings.value?.enabled) {
    return t('aiAnalysis.providerDisabled')
  }
  return t('aiAnalysis.providerEnabled', {
    model: localAiSettings.value.model
  })
})
const todayCostTotalLabel = computed(() => formatCny(todayLocalCostSummary.value?.totalCostCny ?? 0))
const monthCostTotalLabel = computed(() => formatCny(localCostSummary.value?.totalCostCny ?? 0))
const lastMonthCostTotalLabel = computed(() => formatCny(lastMonthLocalCostSummary.value?.totalCostCny ?? 0))
const selectedCoachSummaryCreatedAt = computed(() => selectedCoachSummaryResult.value?.createdAt ?? null)
const displayedAiCostUsageSummary = computed(() => {
  const summaryByKey = new Map(aiCostUsageSummary.value.map(item => [item.key, item]))
  return AI_COST_USAGE_OPTIONS.map(option => {
    const item = summaryByKey.get(option.key)
    return {
      key: option.key,
      label: t(option.labelKey),
      count: item?.count ?? 0,
      totalCostCny: item?.totalCostCny ?? 0
    }
  })
})
const currentSummonerProfileIconUrl = computed(() => {
  const summoner = currentSummoner.value
  return summoner?.profileIconId ? getProfileIconUrl(summoner.profileIconId) : ''
})
const accountInitial = computed(() => {
  const name = currentSummoner.value?.gameName || currentSummonerName.value
  return name ? name.slice(0, 1).toUpperCase() : '?'
})

const reportTypeTabs = computed<Array<{ key: ReportTypeFilter; label: string; count: number }>>(() => [
  {
    key: 'all',
    label: t('aiAnalysis.filterAll'),
    count: analysisResults.value.length
  },
  {
    key: 'pregame',
    label: t('aiAnalysis.featurePreGame'),
    count: countReportsByCategory('pregame')
  },
  {
    key: 'postgame',
    label: t('aiAnalysis.featurePostGame'),
    count: countReportsByCategory('postgame')
  },
  {
    key: 'praise',
    label: t('aiAnalysis.featurePraise'),
    count: countReportsByCategory('praise')
  },
  {
    key: 'coach',
    label: t('aiAnalysis.featureCoach'),
    count: countReportsByCategory('coach')
  }
])

watch(
  () => accountPuuid.value,
  () => {
    prepareRequestId += 1
    closeReportDetail()
    resetPreparedSnapshot()
    void prepareAnalysisInputSnapshot()
    void refreshLocalAnalysisResults()
  },
  { immediate: true }
)

onMounted(() => {
  refreshLocalAiOverview()
  window.addEventListener('rankpeek:ai-analysis-result-saved', handleLocalAiAnalysisResultSaved)
  window.addEventListener('focus', refreshLocalAiOverview)
})

onBeforeUnmount(() => {
  window.removeEventListener('rankpeek:ai-analysis-result-saved', handleLocalAiAnalysisResultSaved)
  window.removeEventListener('focus', refreshLocalAiOverview)
  stopSavedPostgameReplay()
})

function handleLocalAiAnalysisResultSaved() {
  refreshLocalAiOverview()
  void refreshLocalAnalysisResults()
}

async function refreshLocalAiOverview() {
  const requestId = ++overviewRequestId
  localOverviewLoading.value = true
  localOverviewError.value = null

  try {
    const now = new Date()
    const today = formatDateKey(now)
    const monthStart = formatDateKey(new Date(now.getFullYear(), now.getMonth(), 1))
    const lastMonthStart = formatDateKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))
    const lastMonthEnd = formatDateKey(new Date(now.getFullYear(), now.getMonth(), 0))
    const [settings, todaySummary, monthSummary, lastMonthSummary, costUsageSummary] = await Promise.all([
      getLocalAiSettings(),
      getLocalCostSummary({ from: today, to: today }),
      getLocalCostSummary({ from: monthStart, to: today }),
      getLocalCostSummary({ from: lastMonthStart, to: lastMonthEnd }),
      getLocalAiCostUsageSummary()
    ])

    if (requestId !== overviewRequestId) {
      return
    }

    localAiSettings.value = settings
    todayLocalCostSummary.value = todaySummary
    localCostSummary.value = monthSummary
    lastMonthLocalCostSummary.value = lastMonthSummary
    aiCostUsageSummary.value = costUsageSummary
  } catch (error) {
    if (requestId !== overviewRequestId) {
      return
    }
    console.warn('Failed to load local AI overview:', error)
    localOverviewError.value = t('aiAnalysis.localCostUnavailable')
  } finally {
    if (requestId === overviewRequestId) {
      localOverviewLoading.value = false
    }
  }
}

function resetPreparedSnapshot() {
  preparedSnapshot.value = null
  preparationUnavailable.value = false
  preparationError.value = null
  preparingInput.value = false
}

function countReportsByCategory(category: ReportCategory) {
  return analysisResults.value.filter(result => getReportCategory(result) === category).length
}

function openDeleteReportDialog() {
  deleteReportsError.value = null
  deleteReportDialogOpen.value = true
}

function closeDeleteReportDialog() {
  if (deletingReports.value) {
    return
  }
  deleteReportDialogOpen.value = false
  deleteReportsError.value = null
}

function toggleAllDeleteReportTypes(checked: boolean) {
  deleteReportSelections.value = {
    coach: checked,
    postgame: checked,
    praise: checked
  }
}

async function deleteSelectedAnalysisReports() {
  if (!canDeleteSelectedReports.value) {
    return
  }

  const puuid = accountPuuid.value
  const analysisTypes = selectedDeleteAnalysisTypes.value
  deletingReports.value = true
  deleteReportsError.value = null

  try {
    const database = window.electronAPI?.database
    if (database) {
      const result = await database.deleteAnalysisResultsByAccount(puuid, { analysisTypes })
      if (!result.success) {
        throw new Error(result.error)
      }
    }

    const fallbackResult = deleteFallbackAiAnalysisResultsByAccount(puuid, { analysisTypes })
    if (!fallbackResult.success && !database) {
      throw new Error(fallbackResult.error)
    }

    closeReportDetail()
    deleteReportDialogOpen.value = false
    toggleAllDeleteReportTypes(false)
    placeholderNotice.value = t('aiAnalysis.deleteReportsSuccess')
    await refreshLocalAnalysisResults()
  } catch (error) {
    deleteReportsError.value = error instanceof Error ? error.message : String(error)
  } finally {
    deletingReports.value = false
  }
}

function getReportCategory(result: LocalAiAnalysisDisplayResult): ReportCategory {
  const normalized = result.analysisType.trim().toLowerCase()
  if (!normalized) {
    return 'other'
  }

  if (normalized.includes('postgame_praise') || normalized.includes('praise') || normalized.includes('compliment')) {
    return 'praise'
  }

  if (normalized.includes('pregame') || normalized.includes('pre_game') || normalized.includes('before')) {
    return 'pregame'
  }

  if (normalized.includes('postgame') || normalized.includes('post_game') || normalized.includes('review') || normalized.includes('after')) {
    return 'postgame'
  }

  if (normalized.includes('coach') || normalized.includes('weekly') || normalized.includes('monthly')) {
    return 'coach'
  }

  if (normalized.includes('entertainment') || normalized.includes('fun')) {
    return 'fun'
  }

  return 'other'
}

function getReportCategoryLabel(result: LocalAiAnalysisDisplayResult) {
  switch (getReportCategory(result)) {
    case 'pregame':
      return t('aiAnalysis.featurePreGame')
    case 'postgame':
      return t('aiAnalysis.featurePostGame')
    case 'praise':
      return t('aiAnalysis.featurePraise')
    case 'coach':
      return t('aiAnalysis.featureCoach')
    case 'fun':
      return t('aiAnalysis.featureFun')
    case 'other':
      return result.analysisTypeLabel
  }
}

function getReportTitle(result: LocalAiAnalysisDisplayResult) {
  return result.output.title || result.analysisTypeLabel
}

function getReportDisplayTitle(result: LocalAiAnalysisDisplayResult) {
  return result.output.postgamePraise?.headline || getReportTitle(result)
}

function isPraiseReport(result: LocalAiAnalysisDisplayResult) {
  return Boolean(result.output.postgamePraise)
}

function isPostgameReviewResult(result: LocalAiAnalysisDisplayResult) {
  return result.output.postgameRun?.mode === 'review'
}

function getReportScopeLabel(result: LocalAiAnalysisDisplayResult) {
  return result.matchId ? t('aiAnalysis.singleMatchReport') : t('aiAnalysis.accountReport')
}

function getPostgameMatchMetaText(result: LocalAiAnalysisDisplayResult): string {
  const match = result.output.postgameRun?.match
  if (!match) {
    return getReportScopeLabel(result)
  }

  return [
    formatMatchResult(match.win),
    match.queueName || formatQueueLabel(match.queueId),
    formatPositionLabel(match.position)
  ].filter(Boolean).join(' · ')
}

function formatMatchResult(win: boolean | null): string {
  if (win === true) {
    return '胜利'
  }
  if (win === false) {
    return '失败'
  }
  return '未知胜负'
}

function formatQueueLabel(queueId: number | null): string {
  if (queueId === 420) {
    return '单双排'
  }
  if (queueId === 440) {
    return '灵活组排'
  }
  if (queueId === 450) {
    return '极地大乱斗'
  }
  return queueId ? `队列 ${queueId}` : '未知模式'
}

function formatPositionLabel(position: string | null): string {
  const normalized = position?.trim().toUpperCase()
  if (!normalized || ['INVALID', 'NONE', 'UNKNOWN'].includes(normalized)) {
    return ''
  }
  switch (normalized) {
    case 'TOP':
      return '上路'
    case 'JUNGLE':
      return '打野'
    case 'MIDDLE':
    case 'MID':
      return '中路'
    case 'BOTTOM':
    case 'BOT':
      return '下路'
    case 'UTILITY':
    case 'SUPPORT':
      return '辅助'
    default:
      return normalized || ''
  }
}

function formatPostgameKda(result: LocalAiAnalysisDisplayResult): string {
  const match = result.output.postgameRun?.match
  if (!match) {
    return ''
  }

  const kills = match.kills ?? 0
  const deaths = match.deaths ?? 0
  const assists = match.assists ?? 0
  return `${kills}/${deaths}/${assists}`
}

function getPostgameChampionIcon(result: LocalAiAnalysisDisplayResult): string {
  return getChampionIconUrl(result.output.postgameRun?.match.championId) || ''
}

function openMatchHistoryForReport(result: LocalAiAnalysisDisplayResult, event?: MouseEvent): void {
  event?.stopPropagation()
  const matchId = result.output.postgameRun?.match.matchId || result.matchId
  if (!matchId) {
    return
  }

  void router.push({
    name: 'MatchHistory',
    query: { openMatchId: matchId }
  })
}

function openReportDetail(result: LocalAiAnalysisDisplayResult) {
  const postgameRun = result.output.postgameRun
  if (postgameRun) {
    closeCoachReportDetail()
    selectedPostgameResult.value = result
    startSavedPostgameReplay(postgameRun.rawOutputText)
    void hydrateSelectedPostgameChampionNames()
    return
  }

  openCoachReportDetail(result)
}

function canOpenReportDetail(result: LocalAiAnalysisDisplayResult) {
  if (result.output.postgameRun) {
    return true
  }
  if (getReportCategory(result) !== 'coach') {
    return false
  }
  const parsed = parseCoachSummaryReportOutput(result.outputJson)
  return parsed.status === 'parsed' && Boolean(parsed.report)
}

function openCoachReportDetail(result: LocalAiAnalysisDisplayResult) {
  if (getReportCategory(result) !== 'coach') {
    return
  }

  const parsed = parseCoachSummaryReportOutput(result.outputJson)
  if (parsed.status !== 'parsed' || !parsed.report) {
    return
  }

  stopSavedPostgameReplay()
  selectedPostgameReplayText.value = ''
  selectedPostgameReplayState.value = 'completed'
  selectedPostgameResult.value = null
  selectedCoachSummaryResult.value = result
  selectedCoachSummaryReport.value = parsed.report
}

function closeReportDetail() {
  stopSavedPostgameReplay()
  selectedPostgameReplayText.value = ''
  selectedPostgameReplayState.value = 'completed'
  selectedPostgameResult.value = null
  closeCoachReportDetail()
}

function closeCoachReportDetail() {
  selectedCoachSummaryResult.value = null
  selectedCoachSummaryReport.value = null
}

function startSavedPostgameReplay(rawText: string) {
  stopSavedPostgameReplay()
  const fullText = rawText ?? ''
  selectedPostgameReplayText.value = ''

  if (!fullText) {
    selectedPostgameReplayState.value = 'completed'
    return
  }

  selectedPostgameReplayState.value = 'streaming'
  let offset = 0
  const targetStepCount = clampNumber(
    Math.ceil(fullText.length / 4),
    SAVED_POSTGAME_REPLAY_MIN_STEPS,
    SAVED_POSTGAME_REPLAY_MAX_STEPS
  )
  const chunkSize = Math.max(1, Math.ceil(fullText.length / targetStepCount))
  const stepCount = Math.max(1, Math.ceil(fullText.length / chunkSize))
  const stepDelay = clampNumber(
    Math.round(SAVED_POSTGAME_REPLAY_TARGET_DURATION_MS / stepCount),
    SAVED_POSTGAME_REPLAY_MIN_STEP_DELAY_MS,
    SAVED_POSTGAME_REPLAY_MAX_STEP_DELAY_MS
  )

  const revealNextChunk = () => {
    const previousOffset = offset
    offset = Math.min(fullText.length, offset + chunkSize)
    selectedPostgameReplayText.value = fullText.slice(0, offset)

    if (offset >= fullText.length) {
      selectedPostgameReplayState.value = 'completed'
      selectedPostgameReplayTimer = null
      return
    }

    const delay = getSavedPostgameReplayDelay(fullText.slice(previousOffset, offset), stepDelay)
    selectedPostgameReplayTimer = window.setTimeout(revealNextChunk, delay)
  }

  selectedPostgameReplayTimer = window.setTimeout(revealNextChunk, SAVED_POSTGAME_REPLAY_INITIAL_DELAY_MS)
}

function stopSavedPostgameReplay() {
  if (selectedPostgameReplayTimer === null) {
    return
  }

  window.clearTimeout(selectedPostgameReplayTimer)
  selectedPostgameReplayTimer = null
}

function getSavedPostgameReplayDelay(chunk: string, baseDelay: number) {
  if (/[。！？.!?]\s*$/u.test(chunk)) {
    return baseDelay + SAVED_POSTGAME_REPLAY_SENTENCE_DELAY_MS
  }
  if (/[，、；;：:]\s*$/u.test(chunk)) {
    return baseDelay + SAVED_POSTGAME_REPLAY_COMMA_DELAY_MS
  }
  return baseDelay
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function noopPostgameDetailAction() {
  // Read-only history details do not start or cancel live analysis.
}

async function hydrateSelectedPostgameChampionNames() {
  selectedPostgameChampionIdByName.value = await resolveAiAnalysisChampionIdByName()
}

function resolveAiAnalysisChampionIdByName(): Promise<Record<string, number>> {
  if (!championIdByNamePromise) {
    championIdByNamePromise = apiClient.getChampionOptions()
      .then(options => {
        const championIdByName: Record<string, number> = {}
        for (const option of options) {
          const championId = normalizePositiveInteger(option.value)
          if (championId === null) {
            continue
          }
          addChampionNameMapping(championIdByName, option.label, championId)
          addChampionNameMapping(championIdByName, option.realName, championId)
          addChampionNameMapping(championIdByName, option.nickname, championId)
        }
        return championIdByName
      })
      .catch(() => ({}))
  }
  return championIdByNamePromise
}

function addChampionNameMapping(target: Record<string, number>, name: string | null | undefined, championId: number) {
  const trimmed = name?.trim()
  if (!trimmed) {
    return
  }
  target[trimmed] = championId
  target[normalizeChampionNameKey(trimmed)] = championId
}

function normalizeChampionNameKey(value: string): string {
  return value.replace(/[【】\s]/g, '').toLowerCase()
}

function normalizePositiveInteger(value: unknown): number | null {
  const numberValue = typeof value === 'number'
    ? value
    : (typeof value === 'string' && value.trim() ? Number(value) : Number.NaN)
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null
}

function formatCny(value: number) {
  return `¥${Number(value || 0).toFixed(value >= 1 ? 2 : 6)}`
}

function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function prepareAnalysisInputSnapshot() {
  const puuid = accountPuuid.value
  const requestId = ++prepareRequestId
  preparationUnavailable.value = false
  preparationError.value = null
  placeholderNotice.value = ''

  if (!puuid) {
    resetPreparedSnapshot()
    placeholderNotice.value = t('aiAnalysis.prepareSelectAccount')
    return
  }

  preparingInput.value = true

  try {
    const snapshot = await buildAccountAnalysisInputSnapshot({
      accountPuuid: puuid,
      accountDisplayName: currentSummonerName.value,
      limit: 20,
      offset: 0
    })

    if (requestId !== prepareRequestId) {
      return
    }

    preparedSnapshot.value = snapshot
    placeholderNotice.value = t('aiAnalysis.prepareSuccess', {
      hash: snapshot.inputHash
    })
  } catch (error) {
    if (requestId !== prepareRequestId) {
      return
    }

    console.warn('Failed to prepare AI analysis input snapshot:', error)
    preparedSnapshot.value = null
    preparationUnavailable.value = true
    preparationError.value = error instanceof Error ? error.message : String(error)
    placeholderNotice.value = t('aiAnalysis.prepareUnavailable')
  } finally {
    if (requestId === prepareRequestId) {
      preparingInput.value = false
    }
  }
}

async function refreshLocalAnalysisResults() {
  const puuid = accountPuuid.value
  const requestId = ++loadRequestId
  placeholderNotice.value = ''
  historyError.value = null

  if (!puuid) {
    analysisResults.value = []
    historyUnavailable.value = false
    loadingResults.value = false
    return
  }

  loadingResults.value = true

  const result = await loadLocalAiAnalysisResults(puuid, {
    limit: 20,
    offset: 0
  })

  if (requestId !== loadRequestId) {
    return
  }

  analysisResults.value = result.results
  historyUnavailable.value = result.unavailable
  historyError.value = result.error
  loadingResults.value = false
}
</script>

<template>
  <div class="ai-analysis-view">
    <section class="hero-panel">
      <div class="hero-copy">
        <h1>{{ t('aiAnalysis.title') }}</h1>
        <p>{{ t('aiAnalysis.subtitle') }}</p>
        <p
          v-if="placeholderNotice"
          class="hero-notice"
        >
          {{ placeholderNotice }}
        </p>
      </div>

      <div class="status-card local-provider-card">
        <div class="provider-status-row provider-info-line">
          <strong>{{ localProviderStatusLabel }}</strong>
        </div>
        <div class="account-showcase-item league-account-showcase provider-info-line">
          <img
            v-if="currentSummonerProfileIconUrl"
            class="account-avatar"
            :src="currentSummonerProfileIconUrl"
            alt=""
            @error="markAssetLoadFailed"
          >
          <span
            v-else
            class="account-avatar-placeholder"
          >{{ accountInitial }}</span>
          <span class="league-account-name">{{ accountStatusLabel }}</span>
        </div>
      </div>
    </section>

    <section class="local-cost-section">
      <div class="section-heading billing-heading">
        <span>{{ t('aiAnalysis.costSummaryTitle') }}</span>
      </div>

      <div class="billing-card">
        <p
          v-if="localOverviewError"
          class="billing-state warning"
        >
          {{ localOverviewError }}
        </p>
        <p
          v-else-if="localOverviewLoading"
          class="billing-state"
        >
          {{ t('aiAnalysis.billingLoading') }}
        </p>

        <div class="billing-summary-grid">
          <div class="billing-summary-item">
            <span>{{ t('aiAnalysis.costToday') }}</span>
            <strong>{{ todayCostTotalLabel }}</strong>
          </div>
          <div class="billing-summary-item">
            <span>{{ t('aiAnalysis.costMonth') }}</span>
            <strong>{{ monthCostTotalLabel }}</strong>
          </div>
          <div class="billing-summary-item">
            <span>{{ t('aiAnalysis.costLastMonth') }}</span>
            <strong>{{ lastMonthCostTotalLabel }}</strong>
          </div>
        </div>

        <div class="section-heading recent-runs-heading">
          <span>{{ t('aiAnalysis.costUsageTitle') }}</span>
        </div>

        <div class="ai-cost-usage-grid">
          <article
            v-for="entry in displayedAiCostUsageSummary"
            :key="entry.key"
            class="ai-cost-usage-card"
          >
            <span>{{ entry.label }}</span>
            <strong>{{ formatCny(entry.totalCostCny) }}</strong>
            <small>{{ t('aiAnalysis.costUsageCount', { count: entry.count }) }}</small>
          </article>
        </div>
      </div>
    </section>

    <section class="history-section">
      <div class="section-heading history-heading">
        <span>{{ t('aiAnalysis.historyTitle') }}</span>
      </div>

      <div class="history-toolbar">
        <div
          class="report-type-tabs"
          role="tablist"
          aria-label="AI report type filters"
        >
          <button
            v-for="tab in reportTypeTabs"
            :key="tab.key"
            class="report-type-tab"
            :class="{ active: selectedReportType === tab.key }"
            type="button"
            @click="selectedReportType = tab.key"
          >
            <span>{{ tab.label }}</span>
            <strong>{{ tab.count }}</strong>
          </button>
        </div>

        <button
          class="delete-reports-button"
          type="button"
          :disabled="!currentSummoner || deletingReports"
          @click="openDeleteReportDialog"
        >
          {{ t('aiAnalysis.deleteReportsAction') }}
        </button>
      </div>

      <div
        v-if="!currentSummoner"
        class="empty-card"
      >
        <h2>{{ t('aiAnalysis.noAccountTitle') }}</h2>
        <p>{{ t('aiAnalysis.noAccountHistoryBody') }}</p>
      </div>

      <div
        v-else-if="loadingResults"
        class="empty-card"
      >
        <h2>{{ t('aiAnalysis.loadingHistory') }}</h2>
        <p>{{ t('aiAnalysis.loadingHistoryBody') }}</p>
      </div>

      <div
        v-else-if="historyUnavailable"
        class="empty-card warning"
      >
        <h2>{{ t('aiAnalysis.unavailableTitle') }}</h2>
        <p>{{ historyError || t('aiAnalysis.unavailableBody') }}</p>
      </div>

      <div
        v-else-if="!hasResults"
        class="empty-card"
      >
        <h2>{{ t('aiAnalysis.emptyHistoryTitle') }}</h2>
        <p>{{ t('aiAnalysis.emptyHistoryBody') }}</p>
      </div>

      <div
        v-else-if="!hasFilteredResults"
        class="empty-card"
      >
        <h2>{{ t('aiAnalysis.emptyFilteredTitle') }}</h2>
        <p>{{ t('aiAnalysis.emptyFilteredBody') }}</p>
      </div>

      <div
        v-else
        class="history-list"
      >
        <article
          v-for="result in filteredAnalysisResults"
          :key="result.id"
          class="report-card"
          :class="{
            invalid: result.output.status === 'invalid',
            clickable: canOpenReportDetail(result),
            review: isPostgameReviewResult(result),
            praise: isPraiseReport(result)
          }"
          :tabindex="canOpenReportDetail(result) ? 0 : undefined"
          @click="openReportDetail(result)"
          @keydown.enter="openReportDetail(result)"
        >
          <div class="report-main">
            <div class="report-header">
              <div class="report-title-block">
                <h3 class="report-title">
                  {{ getReportDisplayTitle(result) }}
                </h3>
              </div>
              <div class="report-meta">
                <time>{{ result.createdAtLabel }}</time>
                <span class="report-type-pill">{{ getReportCategoryLabel(result) }}</span>
              </div>
            </div>
          </div>

          <div class="report-context">
            <button
              v-if="result.output.postgameRun"
              class="report-match-link"
              type="button"
              @click="openMatchHistoryForReport(result, $event)"
            >
              <span>{{ currentSummonerName || t('aiAnalysis.currentAccountFallback') }}</span>
              <span class="report-context-separator">|</span>
              <span>{{ getPostgameMatchMetaText(result) }}</span>
              <img
                v-if="getPostgameChampionIcon(result)"
                class="report-context-champion"
                :src="getPostgameChampionIcon(result)"
                alt=""
                @error="markAssetLoadFailed"
              >
              <strong>{{ formatPostgameKda(result) }}</strong>
            </button>
            <template v-else>
              <span>{{ currentSummonerName || t('aiAnalysis.currentAccountFallback') }}</span>
              <span>{{ getReportScopeLabel(result) }}</span>
            </template>
          </div>
        </article>
      </div>

      <PostgameAiAnalysisModal
        v-if="selectedPostgameRun"
        :open="Boolean(selectedPostgameRun)"
        :mode="selectedPostgameRunMode"
        :stream-state="selectedPostgameReplayState"
        :stream-text="selectedPostgameReplayText"
        :roster-players="selectedPostgameModalRosterPlayers"
        :champion-id-by-name="selectedPostgameChampionIdByName"
        :show-start-button="false"
        @start-analysis="noopPostgameDetailAction"
        @cancel-analysis="noopPostgameDetailAction"
        @close="closeReportDetail"
      />

      <CoachSummaryReportModal
        v-if="selectedCoachSummaryReport"
        :open="Boolean(selectedCoachSummaryReport)"
        :report="selectedCoachSummaryReport"
        report-load-state="ready"
        :created-at="selectedCoachSummaryCreatedAt"
        @close="closeCoachReportDetail"
      />

      <div
        v-if="deleteReportDialogOpen"
        class="delete-report-backdrop"
        @click.self="closeDeleteReportDialog"
      >
        <section
          class="delete-report-dialog"
          role="dialog"
          aria-modal="true"
          :aria-label="t('aiAnalysis.deleteReportsAction')"
        >
          <header class="delete-report-dialog-header">
            <h2>{{ t('aiAnalysis.deleteReportsAction') }}</h2>
            <button
              class="delete-report-dialog-close"
              type="button"
              :disabled="deletingReports"
              @click="closeDeleteReportDialog"
            >
              ×
            </button>
          </header>

          <p class="delete-report-dialog-copy">
            {{ t('aiAnalysis.deleteReportsPrompt') }}
          </p>

          <div class="delete-report-options">
            <label
              v-for="option in DELETE_REPORT_TYPE_OPTIONS"
              :key="option.key"
              class="delete-report-option"
            >
              <input
                v-model="deleteReportSelections[option.key]"
                type="checkbox"
                :disabled="deletingReports"
              >
              <span>{{ t(option.labelKey) }}</span>
            </label>
            <label class="delete-report-option select-all">
              <input
                type="checkbox"
                :checked="allDeleteReportTypesSelected"
                :disabled="deletingReports"
                @change="toggleAllDeleteReportTypes(($event.target as HTMLInputElement).checked)"
              >
              <span>{{ t('aiAnalysis.deleteReportsSelectAll') }}</span>
            </label>
          </div>

          <p
            v-if="deleteReportsError"
            class="delete-report-error"
          >
            {{ deleteReportsError }}
          </p>

          <footer class="delete-report-dialog-actions">
            <button
              class="delete-report-cancel"
              type="button"
              :disabled="deletingReports"
              @click="closeDeleteReportDialog"
            >
              {{ t('aiAnalysis.deleteReportsCancel') }}
            </button>
            <button
              class="delete-report-confirm"
              type="button"
              :disabled="!canDeleteSelectedReports"
              @click="deleteSelectedAnalysisReports"
            >
              {{ deletingReports ? t('aiAnalysis.deleteReportsDeleting') : t('aiAnalysis.deleteReportsConfirm') }}
            </button>
          </footer>
        </section>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ai-analysis-view {
  --ai-analysis-module-hover-rgb: 96, 176, 255;
  --ai-analysis-module-hover-border: rgba(var(--ai-analysis-module-hover-rgb), 0.48);
  --ai-analysis-module-hover-shadow:
    0 0 0 1px rgba(var(--ai-analysis-module-hover-rgb), 0.16),
    0 0 18px rgba(var(--ai-analysis-module-hover-rgb), 0.18),
    0 12px 28px rgba(var(--ai-analysis-module-hover-rgb), 0.08);
  --ai-analysis-control-hover-rgb: 78, 215, 255;
  --ai-analysis-control-hover-border: rgba(var(--ai-analysis-control-hover-rgb), 0.46);
  --ai-analysis-control-hover-bg: rgba(var(--ai-analysis-control-hover-rgb), 0.08);
  --ai-analysis-control-hover-shadow:
    0 0 0 1px rgba(var(--ai-analysis-control-hover-rgb), 0.13),
    0 0 14px rgba(var(--ai-analysis-control-hover-rgb), 0.18);
  --ai-analysis-accent-rgb: 212, 175, 55;
  --ai-record-bg: rgba(24, 25, 29, 0.9);
  --ai-record-border: rgba(255, 255, 255, 0.09);
  --ai-record-title: #f5f1e8;
  --ai-record-muted: rgba(245, 245, 247, 0.54);
  --ai-record-divider: rgba(255, 255, 255, 0.07);
  --ai-record-pill-bg: rgba(255, 255, 255, 0.045);
  --ai-record-pill-border: rgba(255, 255, 255, 0.09);
  --ai-record-hover-border: rgba(96, 176, 255, 0.42);
  --ai-record-hover-shadow:
    0 0 0 1px rgba(41, 151, 255, 0.08),
    0 14px 28px rgba(0, 0, 0, 0.24);
  --ai-record-review-font: "Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", "PMingLiU", "Times New Roman", serif;
  --ai-record-praise-font: YouYuan, "You Yuan", "Microsoft YaHei UI", "Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif;
  --ai-record-review-bg: linear-gradient(135deg, rgba(31, 29, 24, 0.96), rgba(18, 24, 30, 0.92));
  --ai-record-review-border: rgba(212, 175, 55, 0.3);
  --ai-record-review-accent: #d8b767;
  --ai-record-praise-bg: linear-gradient(135deg, rgba(43, 32, 37, 0.94), rgba(22, 30, 38, 0.9));
  --ai-record-praise-border: rgba(245, 184, 118, 0.32);
  --ai-record-praise-accent: #f3bc7a;
  max-width: 1120px;
  margin: 0 auto;
  padding-bottom: 36px;
}

:global([data-theme="light"] .ai-analysis-view) {
  --ai-analysis-module-hover-rgb: 86, 109, 134;
  --ai-analysis-module-hover-border: rgba(var(--ai-analysis-module-hover-rgb), 0.42);
  --ai-analysis-module-hover-shadow:
    0 0 0 1px rgba(var(--ai-analysis-module-hover-rgb), 0.14),
    0 0 18px rgba(var(--ai-analysis-module-hover-rgb), 0.14),
    0 12px 28px rgba(var(--ai-analysis-module-hover-rgb), 0.07);
  --ai-analysis-control-hover-rgb: 78, 215, 255;
  --ai-analysis-control-hover-border: rgba(var(--ai-analysis-control-hover-rgb), 0.42);
  --ai-analysis-control-hover-bg: rgba(var(--ai-analysis-control-hover-rgb), 0.1);
  --ai-analysis-control-hover-shadow:
    0 0 0 1px rgba(var(--ai-analysis-control-hover-rgb), 0.13),
    0 0 12px rgba(var(--ai-analysis-control-hover-rgb), 0.2);
  --ai-analysis-accent-rgb: 166, 133, 32;
  --ai-record-bg: rgba(255, 255, 255, 0.96);
  --ai-record-border: rgba(29, 29, 31, 0.1);
  --ai-record-title: #202124;
  --ai-record-muted: rgba(29, 29, 31, 0.52);
  --ai-record-divider: rgba(29, 29, 31, 0.08);
  --ai-record-pill-bg: rgba(29, 29, 31, 0.035);
  --ai-record-pill-border: rgba(29, 29, 31, 0.09);
  --ai-record-hover-border: rgba(86, 109, 134, 0.36);
  --ai-record-hover-shadow:
    0 0 0 1px rgba(41, 151, 255, 0.08),
    0 14px 26px rgba(21, 27, 35, 0.08);
  --ai-record-review-bg: linear-gradient(135deg, rgba(255, 252, 244, 0.98), rgba(247, 249, 252, 0.98));
  --ai-record-review-border: rgba(166, 133, 32, 0.28);
  --ai-record-review-accent: #9a7418;
  --ai-record-praise-bg: linear-gradient(135deg, rgba(255, 248, 244, 0.98), rgba(247, 250, 255, 0.98));
  --ai-record-praise-border: rgba(194, 114, 76, 0.28);
  --ai-record-praise-accent: #b86743;
}

.hero-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 18px;
  align-items: stretch;
  padding: 24px;
}

.hero-copy {
  position: relative;
  min-width: 0;
}

.hero-copy h1 {
  margin: 0 0 8px;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 760;
  letter-spacing: 0;
}

.hero-copy p {
  max-width: 560px;
  margin: 0 0 20px;
  color: var(--text-secondary);
  font-size: 16px;
  line-height: 1.6;
}

.hero-panel,
.status-card,
.empty-card,
.billing-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.hero-panel:hover,
.hero-panel:focus-within,
.empty-card:hover,
.empty-card:focus-within {
  border-color: var(--ai-analysis-module-hover-border);
  box-shadow: var(--ai-analysis-module-hover-shadow);
}

.status-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 14px;
  padding: 18px;
}

.local-provider-card {
  gap: 10px;
  padding: 18px 20px;
}

.account-showcase-card {
  align-items: stretch;
}

.account-showcase-item {
  min-width: 0;
  overflow-wrap: anywhere;
}

.rankpeek-account-value {
  color: var(--text-secondary);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.45;
}

.league-account-showcase {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0 0;
  border-top: 1px solid var(--border-subtle);
}

.provider-info-line {
  min-height: 34px;
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 760;
  line-height: 1.35;
}

.provider-status-row {
  display: flex;
  align-items: center;
}

.provider-status-row strong {
  min-width: 0;
  color: inherit;
  font-size: inherit;
  font-weight: inherit;
  line-height: inherit;
  overflow-wrap: anywhere;
}

.league-account-name {
  min-width: 0;
  color: var(--text-primary);
  font-size: inherit;
  font-weight: inherit;
  line-height: inherit;
}

.balance-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.balance-showcase {
  color: rgb(var(--ai-analysis-accent-rgb));
  font-size: 21px;
  font-weight: 820;
  line-height: 1.2;
}

.balance-recharge-button {
  min-height: 28px;
  flex: 0 0 auto;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 0 10px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 750;
  letter-spacing: 0;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    color 0.18s ease,
    box-shadow 0.2s ease;
}

.balance-recharge-button:hover,
.balance-recharge-button:focus-visible {
  border-color: var(--ai-analysis-control-hover-border);
  background: var(--ai-analysis-control-hover-bg);
  box-shadow: var(--ai-analysis-control-hover-shadow);
  color: var(--text-primary);
  outline: none;
}

.account-avatar,
.account-avatar-placeholder {
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  border-radius: 50%;
}

.account-avatar {
  display: block;
  object-fit: cover;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-subtle);
}

.account-avatar-placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  border: 1px solid rgba(var(--accent-rgb), 0.22);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
}

.notice-line {
  margin: 16px 0 0;
  padding: 10px 14px;
  border: 1px solid rgba(var(--ai-analysis-accent-rgb), 0.22);
  border-radius: var(--radius-md);
  background: rgba(var(--ai-analysis-accent-rgb), 0.08);
  color: rgb(var(--ai-analysis-accent-rgb));
  font-size: 13px;
  font-weight: 600;
}

.hero-notice {
  position: absolute;
  top: 82px;
  left: 0;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  width: fit-content;
  max-width: min(560px, 100%);
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgb(var(--ai-analysis-accent-rgb));
  line-height: 1.35;
}

.hero-notice::before {
  content: "";
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  border-radius: 999px;
  background: rgb(var(--ai-analysis-accent-rgb));
  box-shadow: 0 0 10px rgba(var(--ai-analysis-accent-rgb), 0.34);
}

.local-cost-section {
  margin-top: 24px;
}

.ai-billing-section,
.history-section {
  margin-top: 24px;
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  color: var(--text-secondary);
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.section-heading small {
  color: var(--text-tertiary);
  font-family: var(--font-text);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
}

.empty-card h2 {
  margin: 0;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-weight: 700;
  letter-spacing: 0;
}

.empty-card p {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.55;
}

.report-type-pill {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 9px;
  border: 1px solid rgba(var(--ai-analysis-accent-rgb), 0.2);
  border-radius: var(--radius-sm);
  background: rgba(var(--ai-analysis-accent-rgb), 0.08);
  color: rgb(var(--ai-analysis-accent-rgb));
  font-size: 12px;
  font-weight: 650;
}

.empty-card {
  padding: 22px;
}

.empty-card h2 {
  font-size: 17px;
}

.empty-card p {
  margin: 6px 0 0;
}

.empty-card.warning {
  border-color: rgba(255, 159, 10, 0.22);
  background: linear-gradient(135deg, var(--bg-secondary), rgba(255, 159, 10, 0.08));
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 55vh;
  overflow-y: auto;
}

.history-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.report-type-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.report-type-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 11px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0;
  transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.2s ease, color 0.18s ease;
}

.report-type-tab:hover,
.report-type-tab:focus-visible {
  border-color: var(--ai-analysis-control-hover-border);
  background: var(--ai-analysis-control-hover-bg);
  box-shadow: var(--ai-analysis-control-hover-shadow);
  color: var(--text-primary);
  outline: none;
}

.report-type-tab strong {
  color: var(--text-tertiary);
  font-size: 12px;
  font-weight: 700;
}

.report-type-tab.active {
  border-color: rgba(var(--accent-rgb), 0.32);
  background: rgba(var(--accent-rgb), 0.1);
  color: var(--text-primary);
}

.report-type-tab.active strong {
  color: var(--accent-color);
}

.delete-reports-button {
  flex: 0 0 auto;
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid rgba(255, 92, 92, 0.45);
  border-radius: var(--radius-md);
  background: rgba(255, 92, 92, 0.08);
  color: #ff8a8a;
  font-size: 13px;
  font-weight: 700;
  transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.2s ease, color 0.18s ease;
}

.delete-reports-button:hover,
.delete-reports-button:focus-visible {
  border-color: rgba(255, 92, 92, 0.72);
  background: rgba(255, 92, 92, 0.14);
  box-shadow: 0 0 0 1px rgba(255, 92, 92, 0.16), 0 0 16px rgba(255, 92, 92, 0.16);
  color: #ffd1d1;
  outline: none;
}

.delete-reports-button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
  box-shadow: none;
}

.delete-report-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.58);
}

.delete-report-dialog {
  width: min(440px, 100%);
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: var(--radius-lg);
  background: var(--bg-secondary);
  box-shadow: 0 28px 70px rgba(0, 0, 0, 0.4);
}

.delete-report-dialog-header,
.delete-report-dialog-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.delete-report-dialog-header h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 0;
}

.delete-report-dialog-close {
  width: 34px;
  height: 34px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
  font-size: 22px;
  line-height: 1;
}

.delete-report-dialog-copy {
  margin: 14px 0 16px;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.delete-report-options {
  display: grid;
  gap: 10px;
}

.delete-report-option {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 650;
}

.delete-report-option.select-all {
  border-color: rgba(var(--accent-rgb), 0.28);
  background: rgba(var(--accent-rgb), 0.08);
}

.delete-report-option input {
  width: 16px;
  height: 16px;
}

.delete-report-error {
  margin: 12px 0 0;
  color: #ff9b9b;
  font-size: 13px;
  line-height: 1.45;
}

.delete-report-dialog-actions {
  justify-content: flex-end;
  margin-top: 18px;
}

.delete-report-cancel,
.delete-report-confirm {
  min-height: 36px;
  padding: 0 15px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 750;
}

.delete-report-cancel {
  border: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.delete-report-confirm {
  border: 1px solid rgba(255, 92, 92, 0.52);
  background: rgba(255, 92, 92, 0.16);
  color: #ffd1d1;
}

.delete-report-cancel:disabled,
.delete-report-confirm:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.billing-card {
  padding: 18px;
}

.billing-heading {
  align-items: center;
}

.recent-runs-heading {
  margin: 16px 0;
}

.billing-description,
.billing-state {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.55;
}

.billing-state {
  margin-top: 12px;
}

.billing-state.warning {
  color: rgb(var(--ai-analysis-accent-rgb));
}

.billing-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.billing-summary-item {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-tertiary);
}

.billing-summary-item span,
.billing-summary-item strong {
  display: block;
  overflow-wrap: anywhere;
}

.billing-summary-item span {
  color: var(--text-tertiary);
  font-size: 12px;
  font-weight: 650;
}

.billing-summary-item strong {
  margin-top: 6px;
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 780;
}

.ai-cost-usage-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.ai-cost-usage-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-tertiary);
}

.ai-cost-usage-card span,
.ai-cost-usage-card small {
  color: var(--text-tertiary);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.ai-cost-usage-card strong {
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 820;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.report-card {
  --ai-record-active-accent: rgb(var(--ai-analysis-accent-rgb));
  position: relative;
  overflow: hidden;
  padding: 18px;
  border: 1px solid var(--ai-record-border);
  border-radius: 4px;
  background: var(--ai-record-bg);
  box-shadow: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, transform 0.2s ease;
}

.report-card:hover,
.report-card:focus-within {
  border-color: var(--ai-record-hover-border);
  box-shadow: var(--ai-record-hover-shadow);
}

.report-card.invalid {
  border-color: rgba(255, 159, 10, 0.22);
}

.report-card.clickable {
  cursor: pointer;
}

.report-card.clickable:focus-visible {
  border-color: var(--ai-record-hover-border);
  box-shadow: var(--ai-record-hover-shadow);
  outline: none;
}

.report-card.review {
  --ai-record-active-accent: var(--ai-record-review-accent);
  border-color: var(--ai-record-review-border);
  background: var(--ai-record-review-bg);
}

.report-card.praise {
  --ai-record-active-accent: var(--ai-record-praise-accent);
  border-color: var(--ai-record-praise-border);
  background: var(--ai-record-praise-bg);
}

.report-card.review:hover,
.report-card.review:focus-within {
  border-color: var(--ai-record-review-accent);
}

.report-card.praise:hover,
.report-card.praise:focus-within {
  border-color: var(--ai-record-praise-accent);
}

.report-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.report-title-block {
  min-width: 0;
}

.report-title {
  margin: 0;
  color: var(--ai-record-title);
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 760;
  line-height: 1.35;
  letter-spacing: 0;
  overflow-wrap: anywhere;
}

.report-card.review .report-title {
  font-family: var(--ai-record-review-font);
  font-size: 20px;
  font-weight: 700;
  line-height: 1.35;
}

.report-card.praise .report-title {
  font-family: var(--ai-record-praise-font);
  font-size: 21px;
  font-weight: 800;
  line-height: 1.34;
}

.report-meta {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  max-width: 44%;
}

.report-meta time {
  flex: 0 0 auto;
  color: var(--ai-record-muted);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.2;
  white-space: nowrap;
}

.report-meta .report-type-pill {
  border-color: var(--ai-record-pill-border);
  background: var(--ai-record-pill-bg);
  color: var(--ai-record-active-accent);
}

.report-card.praise .report-type-pill {
  font-family: var(--ai-record-praise-font);
  font-weight: 800;
}

.report-context {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--ai-record-divider);
}

.report-context span {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 9px;
  border-radius: var(--radius-sm);
  background: var(--ai-record-pill-bg);
  color: var(--ai-record-muted);
  font-size: 12px;
  font-weight: 650;
}

.report-match-link {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 3px 9px;
  border: 1px solid var(--ai-record-pill-border);
  border-radius: var(--radius-sm);
  background: var(--ai-record-pill-bg);
  color: var(--ai-record-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.report-match-link:hover,
.report-match-link:focus-visible {
  border-color: var(--ai-record-active-accent);
  color: var(--ai-record-title);
  outline: none;
}

.report-match-link span,
.report-match-link strong {
  min-height: 0;
  padding: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  font-size: inherit;
  line-height: 1.35;
}

.report-context-separator {
  opacity: 0.55;
}

.report-context-champion {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  object-fit: cover;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.14);
}

@media (max-width: 1120px) {
  .billing-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 840px) {
  .hero-panel {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .hero-panel {
    padding: 20px;
  }

  .hero-copy h1 {
    font-size: 28px;
  }

  .report-header {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }

  .report-meta {
    max-width: none;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .billing-summary-grid {
    grid-template-columns: 1fr;
  }

  .ai-cost-usage-grid {
    grid-template-columns: 1fr;
  }
}
</style>
