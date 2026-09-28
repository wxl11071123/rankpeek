<template>
  <div
    v-if="isLookup || currentSummoner"
    ref="matchHistoryViewRef"
    :data-variant="props.variant"
    class="match-history-view"
  >
    <section
      class="page-shell surface-glow"
    >
      <div class="page-title-row">
        <div class="page-copy">
          <h1>{{ panelTitle }}</h1>
        </div>

        <div
          v-if="isLookup"
          class="lookup-search"
        >
          <span
            class="lookup-search-input-wrap control-glow"
            :style="{ width: lookupInputWidth }"
          >
            <input
              class="lookup-search-input"
              type="text"
              :value="lookupQueryValue"
              :aria-label="t('summoner.placeholder')"
              @input="handleLookupQueryInput"
              @keyup.enter="handleLookupSubmit"
            >
          </span>
          <button
            class="lookup-search-icon-btn control-glow"
            type="button"
            aria-label="查询"
            :disabled="lookupSearchDisabled"
            @click="handleLookupSubmit"
          >
            <svg
              class="lookup-search-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M10.8 5.2a5.6 5.6 0 1 1 0 11.2 5.6 5.6 0 0 1 0-11.2Z" />
              <path d="m15.2 15.2 4 4" />
            </svg>
          </button>
        </div>
      </div>

      <div
        v-if="isLookup && recentLookupSummoners.length"
        class="recent-lookup-strip"
        aria-label="recent lookups"
      >
        <button
          v-for="summoner in recentLookupSummoners"
          :key="getRecentLookupKey(summoner)"
          type="button"
          class="recent-lookup-chip control-glow"
          :class="{ active: normalizeLookupName(formatSummonerName(summoner)) === activeLookupName }"
          :title="maskedFormatSummonerName(summoner)"
          @click="handleRecentLookupSelect(summoner)"
        >
          <img
            v-if="summoner.profileIconId"
            class="recent-lookup-avatar"
            :src="getProfileIconUrl(summoner.profileIconId)"
            alt=""
            @error="markAssetLoadFailed"
          >
          <span
            v-else
            class="recent-lookup-avatar recent-lookup-avatar-fallback"
          />
          <span class="recent-lookup-name">{{ maskedFormatSummonerName(summoner) }}</span>
        </button>
      </div>

      <div
        v-if="currentSummoner"
        class="page-controls"
      >
        <div class="filters">
          <div
            ref="championFilterRef"
            class="filter-control champion-select-control champion-filter-dropdown control-glow"
          >
            <button
              type="button"
              class="filter-select champion-filter-trigger"
              aria-haspopup="listbox"
              :aria-expanded="championFilterOpen"
              @click="toggleChampionFilter"
              @keydown.esc.prevent.stop="closeChampionFilter"
            >
              <span class="champion-filter-current">{{ formatChampionFilterLabel() }}</span>
              <span
                v-if="selectedChampionOption"
                class="champion-option-count"
              >{{ selectedChampionOption.games }}</span>
              <span
                v-if="selectedChampionOption"
                class="champion-option-unit"
              >{{ t('matchHistory.gamesUnit') }}</span>
            </button>
            <div
              v-if="championFilterOpen"
              class="champion-filter-menu"
              role="listbox"
            >
              <div class="champion-filter-scroll">
                <button
                  type="button"
                  class="champion-filter-option"
                  :class="{ active: filterChampionId === -1 }"
                  role="option"
                  :aria-selected="filterChampionId === -1"
                  @click="selectChampionFilter(-1)"
                >
                  <span class="champion-option-name">{{ t('common.allChampions') }}</span>
                </button>
                <button
                  v-for="champion in loadedChampionOptions"
                  :key="champion.value"
                  type="button"
                  class="champion-filter-option"
                  :class="{ active: filterChampionId === champion.value }"
                  role="option"
                  :aria-selected="filterChampionId === champion.value"
                  @click="selectChampionFilter(champion.value)"
                >
                  <span class="champion-option-name">{{ champion.label }}</span>
                  <span class="champion-option-count">{{ champion.games }}</span>
                  <span class="champion-option-unit">{{ t('matchHistory.gamesUnit') }}</span>
                </button>
              </div>
            </div>
          </div>

          <span
            class="filter-control control-glow"
          >
            <select
              v-model.number="filterQueueId"
              class="filter-select"
              @change="handleFilterChange"
            >
              <option :value="0">{{ t('common.allModes') }}</option>
              <option
                v-for="mode in modeOptions"
                :key="mode.id"
                :value="mode.id"
              >
                {{ mode.name }}
              </option>
            </select>
          </span>
        </div>

        <div class="page-actions">
          <RefreshIconButton
            :aria-label="refreshing ? t('common.refreshing') : t('common.refresh')"
            :loading="refreshing"
            :disabled="!currentSummoner"
            @click="handleRefresh"
          />
        </div>
      </div>
    </section>

    <section
      v-if="isLookup && lookupError"
      class="state-card lookup-state surface-glow"
    >
      <strong>{{ t('summoner.errorTitle') }}</strong>
      <span>{{ lookupError }}</span>
    </section>

    <section
      v-if="currentSummoner"
      class="content-stack"
    >
      <div
        class="history-shell surface-glow"
      >
        <div
          v-if="lcuConnectionChecked && !lcuConnected"
          class="state-card inner lcu-disconnected-state surface-glow"
        >
          <strong class="lcu-disconnected-title">{{ t('matchHistory.lcuDisconnectedTitle') }}</strong>
        </div>

        <template v-else>
          <SummonerOverviewPanel
            class="overview-embed"
            :summoner="currentSummoner"
            :user-tag="overviewUserTag"
            :solo-rank="soloRank"
            :flex-rank="flexRank"
            :rank-status="rankLoadStatus"
            :fallback-stats="visibleMatchStats"
            :user-tag-status="userTagLoadStatus"
            embedded
            @copy-name="handleCopyName"
          />

          <div
            v-if="loading && !matchHistory.length"
            class="state-card inner surface-glow"
          >
            <strong>{{ t('matchHistory.loadingTitle') }}</strong>
            <span>{{ t('matchHistory.loadingBody') }}</span>
          </div>

          <div
            v-else-if="!matchHistory.length"
            class="state-card inner surface-glow"
          >
            <strong>{{ matchStateMeta.title }}</strong>
            <span>{{ matchStateMeta.hint }}</span>
          </div>

          <div
            v-else
            class="match-list"
            :aria-busy="summariesLoading"
          >
            <div
              v-if="matchHistory.length && matchRecordStatus === 'ERROR'"
              class="refresh-cache-notice"
              role="status"
            >
              {{ t('matchHistory.refreshFailedUsingCache') }}
            </div>
            <div
              v-for="match in matchHistory"
              :key="match.gameId"
              :ref="element => setMatchListItemRef(match.gameId, element)"
              class="match-list-item"
            >
              <MatchHistoryCard
                :match="match"
                :expanded="expandedGameId === match.gameId"
                :current-puuid="currentSummoner.puuid"
                :current-summoner-name="currentSummonerName"
                :user-tag-summaries="visibleUserTagSummaries"
                :saved-ai-reports="getSavedAiReportsForMatch(match)"
                @open-detail="toggleInlineDetail"
                @open-saved-ai-report="openSavedPostgameReport"
                @navigate-to-player="handleNavigateToPlayer"
              />

              <MatchHistoryInlineDetail
                v-if="expandedGameId === match.gameId"
                :match-history="match"
                :game-detail="selectedGameDetail"
                :current-puuid="currentSummoner.puuid"
                :current-summoner-name="currentSummonerName"
                :detail-status="selectedGameDetailStatus"
                :active-tab="getInlineDetailTab(match.gameId)"
                @update:active-tab="setInlineDetailTab(match.gameId, $event)"
                @navigate-to-player="handleNavigateToPlayer"
              />
            </div>
            <div
              ref="loadMoreSentinelRef"
              class="match-list-sentinel"
              aria-hidden="true"
            />
            <div
              v-if="loadingMore"
              class="match-list-footer"
              role="status"
            >
              {{ t('matchHistory.loadingMoreWithCount', { count: loadedMatchCount }) }}
            </div>
            <div
              v-else-if="loadMoreError"
              class="match-list-footer match-list-footer-error"
              role="status"
            >
              <span>{{ t('matchHistory.loadMoreFailedWithCount', { count: loadedMatchCount }) }}</span>
              <button
                type="button"
                class="load-more-retry"
                @click="loadMoreMatchHistory"
              >
                {{ t('common.retry') }}
              </button>
            </div>
            <button
              v-else-if="hasNext"
              type="button"
              class="match-list-footer load-more-button"
              @click="loadMoreMatchHistory"
            >
              {{ t('matchHistory.loadMoreWithCount', { count: loadedMatchCount }) }}
            </button>
            <div
              v-else
              class="match-list-footer"
              role="status"
            >
              {{ t('matchHistory.noMoreMatchesWithCount', { count: loadedMatchCount }) }}
            </div>
          </div>
        </template>
      </div>
    </section>

    <PostgameAiAnalysisModal
      v-if="selectedSavedPostgameAiRun"
      :open="Boolean(selectedSavedPostgameAiRun)"
      :mode="selectedSavedPostgameAiMode"
      stream-state="completed"
      :stream-text="selectedSavedPostgameAiRun.rawOutputText"
      :roster-players="selectedSavedPostgameAiRosterPlayers"
      :show-start-button="false"
      @start-analysis="noopSavedPostgameReportAction"
      @cancel-analysis="noopSavedPostgameReportAction"
      @close="closeSavedPostgameReport"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiClient } from '@/api/httpClient'
import { wsClient } from '@/api/websocketClient'
import RefreshIconButton from '@/components/common/RefreshIconButton.vue'
import MatchHistoryCard from '@/components/match-history/MatchHistoryCard.vue'
import MatchHistoryInlineDetail from '@/components/match-history/MatchHistoryInlineDetail.vue'
import PostgameAiAnalysisModal from '@/components/match-history/PostgameAiAnalysisModal.vue'
import SummonerOverviewPanel from '@/components/summoner/SummonerOverviewPanel.vue'
import { useI18n } from '@/i18n'
import {
  loadMatchDetailFromLocalCache,
  persistMatchDetailToLocalCache,
  readMatchHistoryFromLocalCache,
  toMatchDetailCacheKey,
  writeMatchHistoryToLocalCache
} from '@/services/localMatchCache'
import { clearPostgameAutoOpenLatestMatchToken } from '@/services/gameflowAutoNavigation'
import {
  loadLocalAiAnalysisResults,
  type LocalAiAnalysisDisplayResult
} from '@/services/localAiAnalysis'
import type { PostgameAiRunOutputV1 } from '@/services/postgameAiRunPersistence'
import {
  RANKED_OVERVIEW_SAMPLE_LIMIT,
  selectRecentMatchLookback,
  selectRecentRankedSample
} from '@/utils/matchHistorySampling'
import { getProfileIconUrl, markAssetLoadFailed } from '@/utils/gameAssetUrls'
import {
  appendUniqueMatches,
  buildLoadedChampionOptions,
  type LoadedChampionOption
} from '@/utils/matchHistoryFilters'
import { maskSummonerName } from '@/utils/privacyMode'
import {
  hasCompleteParticipantStats,
  isRenderableMatchForPuuid
} from '../../../shared/matchQuality.ts'
import { getDefaultMatchQueueMode } from '@/utils/matchPreferences'
import type { RankLoadStatus } from '@/utils/rankDisplay'
import type {
  CacheUpdateEvent,
  ChampionOption,
  GameDetail,
  GameModeOption,
  MatchHistory,
  Participant,
  ParticipantIdentity,
  QueueInfo,
  Rank,
  RankTag,
  RecordStatus,
  Summoner,
  Stats,
  UserTag,
  UserTagSummary
} from '@/types/api'

const props = withDefaults(defineProps<{
  summoner: Summoner | null
  variant?: 'mine' | 'lookup'
  connected?: boolean
  localCacheEnabled?: boolean
  autoOpenLatestMatchToken?: string
  lookupQuery?: string
  lookupLoading?: boolean
  lookupError?: string
  recentLookupSummoners?: Summoner[]
  activeLookupName?: string
}>(), {
  variant: 'mine',
  localCacheEnabled: false,
  autoOpenLatestMatchToken: '',
  lookupQuery: '',
  lookupLoading: false,
  lookupError: '',
  recentLookupSummoners: () => [],
  activeLookupName: ''
})

const emit = defineEmits<{
  (event: 'update:lookupQuery', value: string): void
  (event: 'lookup'): void
  (event: 'select-recent-lookup', value: string): void
}>()

interface MatchHistoryLoadOptions {
  forceRefresh?: boolean
  source?: 'auto' | 'sgp' | 'lcu' | 'cache'
  throwOnError?: boolean
  requestId?: number
  page?: number
  append?: boolean
  autoOpenLatestMatchToken?: string
}

interface MatchHistoryLoadResult {
  requestedSource: MatchHistoryLoadOptions['source']
  responseSource: unknown
  recordStatus: RecordStatus | null
  responseMatches: number
  renderableMatches: number
  persistedToLocalCache: boolean
  hydratedFromCacheAfterPersist: boolean
  visibleListUpdated: boolean
  visibleMatchesAfterLoad: number
  page: number
  hasNext: boolean
  append: boolean
}

interface MatchHistoryHydrateOptions {
  page?: number
  append?: boolean
}

type UserTagLoadStatus = 'idle' | 'loading' | 'loaded' | 'error'
type DetailLoadStatus = 'idle' | 'loading' | 'loaded' | 'error'
type InlineDetailTabKey = 'overview' | 'rp' | 'runes' | 'chart'
type SavedPostgameAiMode = 'review' | 'praise'

interface SavedPostgameAiReports {
  review?: LocalAiAnalysisDisplayResult
  praise?: LocalAiAnalysisDisplayResult
}

interface RecentPerformanceStats {
  sampleCount: number
  kda: number | null
  winRate: number | null
  averageDamage: number | null
  averageGold: number | null
  averageParticipation: number | null
}

const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const LIVE_MATCH_ONLY_TAG_NAMES = new Set<string>(['\u5f00\u9ed1'])
const USER_TAG_SUMMARY_BATCH_SIZE = 40
const MATCH_HISTORY_PAGE_SIZE = 20
const TAG_OVERVIEW_LOOKBACK_LIMIT = 50
const TAG_ANALYSIS_MODE = 0
const REFRESHING_INDICATOR_MAX_MS = 30000
const LOADOUT_STAT_KEYS = [
  'item0', 'item1', 'item2', 'item3', 'item4', 'item5', 'item6',
  'perk0', 'perk1', 'perk2', 'perk3', 'perk4', 'perk5',
  'perkPrimaryStyle', 'perkSubStyle',
  'playerAugment1', 'playerAugment2', 'playerAugment3',
  'playerAugment4', 'playerAugment5', 'playerAugment6'
] as const
const PARTICIPANT_LOADOUT_ID_KEYS = ['championId', 'spell1Id', 'spell2Id'] as const
const PARTICIPANT_POSITION_KEYS = [
  'teamPosition',
  'individualPosition',
  'selectedPosition',
  'lane',
  'role'
] as const

const matchHistory = ref<MatchHistory[]>([])
const championCandidateMatches = ref<MatchHistory[]>([])
const overviewLookbackMatches = ref<MatchHistory[]>([])
const rank = ref<Rank | null>(null)
const rankLoadStatus = ref<RankLoadStatus>('loading')
const overviewUserTag = ref<UserTag | null>(null)
const userTagLoadStatus = ref<UserTagLoadStatus>('idle')
const lcuConnected = ref(false)
const lcuConnectionChecked = ref(false)
const userTagSummaries = ref<Record<string, UserTagSummary>>({})
const championOptions = ref<ChampionOption[]>([])
const modeOptions = ref<GameModeOption[]>([])
const filterChampionId = ref(-1)
const filterQueueId = ref(0)
const championFilterOpen = ref(false)
const defaultMatchQueueMode = ref(0)
const currentPage = ref(0)
const hasNext = ref(false)
const loadingMore = ref(false)
const loadMoreError = ref(false)
const loadMoreRetryPage = ref<number | null>(null)
const loadedPages = ref<number[]>([])
const loading = ref(false)
const refreshing = ref(false)
const summariesLoading = ref(false)
const matchRecordStatus = ref<RecordStatus | null>(null)
const expandedGameId = ref<number | null>(null)
const activeInlineDetailTabByGameId = ref<Record<string, InlineDetailTabKey>>({})
const selectedGameDetail = ref<GameDetail | null>(null)
const selectedMatchHistory = ref<MatchHistory | null>(null)
const selectedGameDetailStatus = ref<DetailLoadStatus>('idle')
const pendingAutoOpenLatestMatchToken = ref('')
const consumedAutoOpenLatestMatchToken = ref('')
const pendingOpenMatchId = ref('')
const consumedOpenMatchId = ref('')
const savedPostgameAiReportsByMatchId = ref<Record<string, SavedPostgameAiReports>>({})
const selectedSavedPostgameAiResult = ref<LocalAiAnalysisDisplayResult | null>(null)
const matchHistoryViewRef = ref<HTMLElement | null>(null)
const championFilterRef = ref<HTMLElement | null>(null)
const loadMoreSentinelRef = ref<HTMLElement | null>(null)
const matchListItemRefs = new Map<string, HTMLElement>()
let settingsLoadPromise: Promise<void> | null = null
let matchHistoryRequestId = 0
let matchDetailRequestId = 0
let activeListLoadingRequestId: number | null = null
let activeRefreshRunId: number | null = null
let savedPostgameAiReportsRequestId = 0
let refreshRunSequence = 0
let refreshIndicatorStopTimer: number | null = null
let autoOpenLatestMatchRefreshToken = ''
let overviewUserTagAbortController: AbortController | null = null
let summariesAbortController: AbortController | null = null
let unsubscribeCacheUpdate: (() => void) | null = null
let unsubscribeAiAnalysisSaved: (() => void) | null = null
let loadMoreObserver: IntersectionObserver | null = null

const currentSummoner = computed(() => props.summoner)
const isLookup = computed(() => props.variant === 'lookup')
const currentSummonerName = computed(() => maskedFormatSummonerName(currentSummoner.value))
const soloRank = computed<QueueInfo | null>(() => rank.value?.queueMap?.RANKED_SOLO_5x5 || null)
const flexRank = computed<QueueInfo | null>(() => rank.value?.queueMap?.RANKED_FLEX_SR || null)
const hasFilters = computed(() => filterChampionId.value > 0 || filterQueueId.value > 0)
const loadedChampionOptions = computed(() =>
  buildLoadedChampionOptions(
    championCandidateMatches.value.length > 0 ? championCandidateMatches.value : matchHistory.value,
    currentSummoner.value?.puuid || '',
    championOptions.value,
    filterQueueId.value > 0 ? filterQueueId.value : undefined
  )
)
const selectedChampionOption = computed<LoadedChampionOption | null>(() =>
  loadedChampionOptions.value.find(option => option.value === filterChampionId.value) || null
)
const loadedMatchCount = computed(() => matchHistory.value.length)
const overviewSampleMatches = computed<MatchHistory[]>(() =>
  selectRecentRankedSample(getQualityOverviewLookbackMatches(), RANKED_OVERVIEW_SAMPLE_LIMIT)
)
const visibleMatchStats = computed<RecentPerformanceStats>(() =>
  calculateVisibleMatchStats(overviewSampleMatches.value, currentSummoner.value?.puuid || '')
)
const visibleMatchIds = computed(() => (
  [...new Set(matchHistory.value.map(match => String(match.gameId)).filter(Boolean))]
))
const selectedSavedPostgameAiRun = computed<PostgameAiRunOutputV1 | null>(() => (
  selectedSavedPostgameAiResult.value?.output.postgameRun ?? null
))
const selectedSavedPostgameAiMode = computed<SavedPostgameAiMode>(() => (
  selectedSavedPostgameAiRun.value?.mode ?? 'review'
))
const selectedSavedPostgameAiRosterPlayers = computed(() => (
  selectedSavedPostgameAiRun.value?.rosterPlayers ?? []
))
const panelTitle = computed(() =>
  isLookup.value
    ? t('matchHistory.lookupTitle')
    : t('matchHistory.title')
)
const lookupQueryValue = computed(() => props.lookupQuery)
const lookupLoading = computed(() => props.lookupLoading)
const lookupError = computed(() => props.lookupError)
const lookupSearchDisabled = computed(() => lookupLoading.value || !lookupQueryValue.value.trim())
const recentLookupSummoners = computed(() => props.recentLookupSummoners)
const activeLookupName = computed(() => normalizeLookupName(props.activeLookupName))
const lookupInputWidth = computed(() => {
  const length = props.lookupQuery?.length || 8
  return `clamp(180px, ${length + 4}ch, 420px)`
})
const visibleUserTagSummaries = computed<Record<string, UserTagSummary>>(() => {
  const visibleSummaries: Record<string, UserTagSummary> = {}

  for (const [puuid, summary] of Object.entries(userTagSummaries.value)) {
    visibleSummaries[puuid] = filterUserTagSummaryLiveMatchOnlyTags(summary)
  }

  return visibleSummaries
})

const matchStateMeta = computed(() => {
  const status = matchRecordStatus.value || overviewUserTag.value?.recordStatus
  if (status === 'PRIVATE') {
    return {
      title: t('matchHistory.privateTitle'),
      hint: t('matchHistory.privateBody')
    }
  }
  if (status === 'EMPTY') {
    return {
      title: t('matchHistory.emptyTitle'),
      hint: t('matchHistory.emptyBody')
    }
  }
  if (status === 'ERROR') {
    return {
      title: t('matchHistory.errorTitle'),
      hint: t('matchHistory.errorBody')
    }
  }
  if (hasFilters.value) {
    return {
      title: t('matchHistory.filteredEmptyTitle'),
      hint: t('matchHistory.filteredEmptyBody')
    }
  }
  return {
    title: t('matchHistory.noMatchesTitle'),
    hint: t('matchHistory.noMatchesBody')
  }
})

async function ensurePageSettingsLoaded() {
  if (settingsLoadPromise) {
    await settingsLoadPromise
    return
  }

  settingsLoadPromise = (async () => {
    try {
      const [champions, modes, savedDefaultQueueMode] = await Promise.all([
        apiClient.getChampionOptions(),
        apiClient.getGameModes(),
        getDefaultMatchQueueMode()
      ])
      championOptions.value = champions
      modeOptions.value = modes
      defaultMatchQueueMode.value = savedDefaultQueueMode
    } catch (err) {
      console.error('Failed to load page settings', err)
    } finally {
      settingsLoadPromise = null
    }
  })()

  await settingsLoadPromise
}

function applyDefaultFilters() {
  filterChampionId.value = -1
  filterQueueId.value = defaultMatchQueueMode.value
}

function filterLiveMatchOnlyTags(tags: RankTag[]): RankTag[] {
  return tags.filter(tag => !LIVE_MATCH_ONLY_TAG_NAMES.has(tag.tagName))
}

function filterUserTagSummaryLiveMatchOnlyTags(summary: UserTagSummary): UserTagSummary {
  return {
    ...summary,
    tag: filterLiveMatchOnlyTags(summary.tag)
  }
}

function userTagSummaryToUserTag(summary: UserTagSummary): UserTag {
  return {
    recordStatus: summary.recordStatus,
    recentData: summary.recentData,
    tag: filterLiveMatchOnlyTags(summary.tag)
  }
}

function getUserTagSummarySampleCount(summary: Pick<UserTagSummary, 'recentData'> | null | undefined): number {
  const recentData = summary?.recentData
  const wins = recentData?.selectWins ?? 0
  const losses = recentData?.selectLosses ?? 0
  return Math.max(0, wins + losses)
}

function hasUsefulUserTagSummary(summary: UserTagSummary | null | undefined): summary is UserTagSummary {
  if (!summary || summary.recordStatus !== 'NORMAL') {
    return false
  }

  const hasSample = getUserTagSummarySampleCount(summary) > 0
  const hasTags = Array.isArray(summary.tag) && filterLiveMatchOnlyTags(summary.tag).length > 0
  return hasSample || hasTags
}

function hasUsefulOverviewUserTag(userTag: UserTag | null | undefined): boolean {
  if (!userTag || userTag.recordStatus !== 'NORMAL') {
    return false
  }

  const hasSample = getUserTagSummarySampleCount(userTag) > 0
  const hasTags = Array.isArray(userTag.tag) && userTag.tag.length > 0
  return hasSample || hasTags
}

function shouldKeepExistingOverviewUserTag(summary: UserTagSummary | null): boolean {
  return !hasUsefulUserTagSummary(summary) && hasUsefulOverviewUserTag(overviewUserTag.value)
}

function applyOverviewUserTagSummary(summary: UserTagSummary | null) {
  if (!hasUsefulUserTagSummary(summary)) {
    if (shouldKeepExistingOverviewUserTag(summary)) {
      userTagLoadStatus.value = 'loaded'
      return
    }

    if (visibleMatchStats.value.sampleCount > 0) {
      userTagLoadStatus.value = 'idle'
      return
    }

    userTagLoadStatus.value = summary ? 'error' : 'idle'
    return
  }

  overviewUserTag.value = userTagSummaryToUserTag(summary)
  userTagLoadStatus.value = 'loaded'
}

function applyOverviewLookbackMatches(matches: MatchHistory[]) {
  const puuid = currentSummoner.value?.puuid || ''
  overviewLookbackMatches.value = selectRecentMatchLookback(
    puuid ? matches.filter(match => isRenderableMatchForPuuid(match, puuid)) : matches,
    TAG_OVERVIEW_LOOKBACK_LIMIT
  )
}

function startListLoading(requestId: number) {
  activeListLoadingRequestId = requestId
  loading.value = true
}

function stopListLoading(requestId: number) {
  if (activeListLoadingRequestId !== requestId) {
    return
  }

  activeListLoadingRequestId = null
  loading.value = false
}

function startLoadMoreLoading() {
  loadingMore.value = true
  loadMoreError.value = false
}

function stopLoadMoreLoading() {
  loadingMore.value = false
}

function resetMatchHistoryPagination() {
  currentPage.value = 0
  hasNext.value = false
  loadingMore.value = false
  loadMoreError.value = false
  loadMoreRetryPage.value = null
  loadedPages.value = []
}

function getMatchHistoryPageOffset(page: number) {
  return Math.max(0, page - 1) * MATCH_HISTORY_PAGE_SIZE
}

function markMatchHistoryPageLoaded(page: number) {
  if (loadedPages.value.includes(page)) {
    return
  }

  loadedPages.value = [...loadedPages.value, page].sort((left, right) => left - right)
}

function createLoadedPageRange(pageCount: number): number[] {
  return Array.from({ length: Math.max(0, pageCount) }, (_, index) => index + 1)
}

function applyMatchHistoryPage(matches: MatchHistory[], page: number, append: boolean) {
  matchHistory.value = append
    ? appendUniqueMatches(matchHistory.value, matches)
    : [...matches]
  if (filterChampionId.value <= 0) {
    championCandidateMatches.value = append
      ? appendUniqueMatches(championCandidateMatches.value, matches)
      : [...matches]
  }
  currentPage.value = Math.max(currentPage.value, page)
  markMatchHistoryPageLoaded(page)
}

function applyOpenMatchHistoryPageFromCache(cachedMatches: MatchHistory[], targetIndex: number): void {
  const targetPage = Math.floor(Math.max(0, targetIndex) / MATCH_HISTORY_PAGE_SIZE) + 1
  const visibleCount = Math.min(cachedMatches.length, targetPage * MATCH_HISTORY_PAGE_SIZE)
  const visibleMatches = cachedMatches.slice(0, visibleCount)
  matchHistory.value = visibleMatches
  if (filterChampionId.value <= 0) {
    championCandidateMatches.value = [...cachedMatches]
  }
  currentPage.value = targetPage
  loadedPages.value = createLoadedPageRange(targetPage)
  hasNext.value = cachedMatches.length > visibleCount
  loadMoreError.value = false
  loadMoreRetryPage.value = null
}

function getSavedAiReportsForMatch(match: MatchHistory): { review?: boolean; praise?: boolean } {
  const reports = savedPostgameAiReportsByMatchId.value[String(match.gameId)]
  return {
    review: Boolean(reports?.review),
    praise: Boolean(reports?.praise)
  }
}

async function refreshVisiblePostgameAiReports(): Promise<void> {
  const puuid = currentSummoner.value?.puuid?.trim()
  const matchIds = visibleMatchIds.value
  const requestId = ++savedPostgameAiReportsRequestId
  if (!puuid || matchIds.length === 0) {
    savedPostgameAiReportsByMatchId.value = {}
    return
  }

  const nextReports: Record<string, SavedPostgameAiReports> = {}
  for (let index = 0; index < matchIds.length; index += 100) {
    const chunk = matchIds.slice(index, index + 100)
    const result = await loadLocalAiAnalysisResults(puuid, {
      limit: 200,
      offset: 0,
      matchIds: chunk,
      analysisTypes: ['postgame_review', 'postgame_praise']
    })
    if (requestId !== savedPostgameAiReportsRequestId) {
      return
    }
    for (const report of result.results) {
      const matchId = report.matchId
      if (!matchId || !report.output.postgameRun) {
        continue
      }
      const mode = report.output.postgameRun.mode
      const reports = nextReports[matchId] ?? {}
      if (mode === 'review') {
        reports.review = report
      } else if (mode === 'praise') {
        reports.praise = report
      }
      nextReports[matchId] = reports
    }
  }

  savedPostgameAiReportsByMatchId.value = nextReports
}

function openSavedPostgameReport(match: MatchHistory, mode: SavedPostgameAiMode): void {
  const report = savedPostgameAiReportsByMatchId.value[String(match.gameId)]?.[mode]
  if (!report?.output.postgameRun) {
    return
  }

  selectedSavedPostgameAiResult.value = report
}

function closeSavedPostgameReport(): void {
  selectedSavedPostgameAiResult.value = null
}

function noopSavedPostgameReportAction(): void {
  // Read-only saved report modal.
}

function handlePostgameAiAnalysisSaved(): void {
  void refreshVisiblePostgameAiReports()
}

function shouldLoadMoreMatchHistory() {
  return Boolean(currentSummoner.value?.puuid) &&
    hasNext.value &&
    !loading.value &&
    !refreshing.value &&
    !loadingMore.value
}

function clearRefreshIndicatorStopTimer() {
  if (!refreshIndicatorStopTimer) {
    return
  }

  window.clearTimeout(refreshIndicatorStopTimer)
  refreshIndicatorStopTimer = null
}

function startRefreshing(requestId: number): number {
  void requestId
  const refreshRunId = ++refreshRunSequence
  activeRefreshRunId = refreshRunId
  refreshing.value = true
  clearRefreshIndicatorStopTimer()
  refreshIndicatorStopTimer = window.setTimeout(() => stopRefreshing(refreshRunId), REFRESHING_INDICATOR_MAX_MS)
  return refreshRunId
}

function stopRefreshing(refreshRunId: number) {
  if (activeRefreshRunId !== refreshRunId) {
    return
  }

  clearRefreshIndicatorStopTimer()
  activeRefreshRunId = null
  refreshing.value = false
}

function clearMatchHistoryLoadingState() {
  activeListLoadingRequestId = null
  activeRefreshRunId = null
  clearRefreshIndicatorStopTimer()
  loading.value = false
  loadingMore.value = false
  refreshing.value = false
}

function isMatchHistoryCacheUpdateRelevant(event: CacheUpdateEvent): boolean {
  return event?.type === 'PLAYER_CACHE_UPDATED' &&
    event.puuid === currentSummoner.value?.puuid &&
    event.updatedScopes?.includes('matchHistory') === true
}

function resetPanelState() {
  matchHistoryRequestId += 1
  matchDetailRequestId += 1
  clearMatchHistoryLoadingState()
  resetMatchHistoryPagination()
  matchListItemRefs.clear()
  overviewUserTagAbortController?.abort()
  overviewUserTagAbortController = null
  summariesAbortController?.abort()
  summariesAbortController = null
  rank.value = null
  rankLoadStatus.value = 'loading'
  overviewUserTag.value = null
  overviewLookbackMatches.value = []
  userTagLoadStatus.value = 'idle'
  matchHistory.value = []
  championCandidateMatches.value = []
  matchRecordStatus.value = null
  userTagSummaries.value = {}
  summariesLoading.value = false
  expandedGameId.value = null
  activeInlineDetailTabByGameId.value = {}
  selectedGameDetail.value = null
  selectedMatchHistory.value = null
  selectedGameDetailStatus.value = 'idle'
  pendingOpenMatchId.value = ''
  consumedOpenMatchId.value = ''
  savedPostgameAiReportsByMatchId.value = {}
  selectedSavedPostgameAiResult.value = null
  championFilterOpen.value = false
}

function setMatchListItemRef(gameId: number, element: Element | ComponentPublicInstance | null): void {
  const key = String(gameId)
  if (element instanceof HTMLElement) {
    matchListItemRefs.set(key, element)
    return
  }

  matchListItemRefs.delete(key)
}

function scrollMatchListItemIntoView(gameId: number): void {
  void nextTick(() => {
    window.requestAnimationFrame(() => {
      matchListItemRefs.get(String(gameId))?.scrollIntoView({
        block: 'center',
        behavior: 'smooth'
      })
    })
  })
}

async function refreshLcuConnectionStatus(): Promise<boolean> {
  if (props.connected === true && currentSummoner.value?.puuid) {
    lcuConnected.value = true
    lcuConnectionChecked.value = true
    return true
  }

  try {
    const connected = await apiClient.checkConnection()
    lcuConnected.value = connected
    lcuConnectionChecked.value = true
    return connected
  } catch (err) {
    console.warn('Failed to check LCU connection', err)
    lcuConnected.value = false
    lcuConnectionChecked.value = true
    return false
  }
}

function handleLookupQueryInput(event: Event) {
  const target = event.target as HTMLInputElement | null
  emit('update:lookupQuery', target?.value ?? '')
}

function handleLookupSubmit() {
  if (lookupSearchDisabled.value) {
    return
  }

  emit('lookup')
}

function normalizeLookupName(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase()
}

function formatSummonerName(summoner: Summoner | null): string {
  if (!summoner) {
    return ''
  }
  return summoner.tagLine ? `${summoner.gameName}#${summoner.tagLine}` : summoner.gameName
}

function maskedFormatSummonerName(summoner: Summoner | null): string {
  if (!summoner) {
    return ''
  }
  const name = summoner.tagLine ? `${summoner.gameName}#${summoner.tagLine}` : summoner.gameName
  return maskSummonerName(name, summoner.puuid)
}

function getRecentLookupKey(summoner: Summoner): string {
  return summoner.puuid || normalizeLookupName(formatSummonerName(summoner))
}

function handleRecentLookupSelect(summoner: Summoner) {
  emit('select-recent-lookup', formatSummonerName(summoner))
}

function createEmptyVisibleMatchStats(): RecentPerformanceStats {
  return {
    sampleCount: 0,
    kda: null,
    winRate: null,
    averageDamage: null,
    averageGold: null,
    averageParticipation: null
  }
}

function calculateVisibleMatchStats(matches: MatchHistory[], puuid: string): RecentPerformanceStats {
  if (!puuid) {
    return createEmptyVisibleMatchStats()
  }

  let sampleCount = 0
  let wins = 0
  let kills = 0
  let deaths = 0
  let assists = 0
  let damage = 0
  let gold = 0
  let participation = 0

  for (const match of matches) {
    if (!isRenderableMatchForPuuid(match, puuid)) {
      continue
    }
    const participant = getParticipantByPuuid(match, puuid)
    if (!participant || !hasCompleteParticipantStats(participant.stats)) {
      continue
    }

    const stats = participant.stats
    const matchKills = readStatNumber(stats.kills)
    const matchAssists = readStatNumber(stats.assists)
    const teamKills = getTeamKills(match.participants || [], participant.teamId)

    sampleCount += 1
    wins += stats.win ? 1 : 0
    kills += matchKills
    deaths += readStatNumber(stats.deaths)
    assists += matchAssists
    damage += readStatNumber(stats.totalDamageDealtToChampions)
    gold += readStatNumber(stats.goldEarned)
    participation += teamKills > 0 ? (matchKills + matchAssists) / teamKills : 0
  }

  if (!sampleCount) {
    return createEmptyVisibleMatchStats()
  }

  return {
    sampleCount,
    kda: deaths > 0 ? (kills + assists) / deaths : kills + assists,
    winRate: (wins / sampleCount) * 100,
    averageDamage: damage / sampleCount,
    averageGold: gold / sampleCount,
    averageParticipation: (participation / sampleCount) * 100
  }
}

function getParticipantByPuuid(match: MatchHistory, puuid: string): Participant | null {
  const identity = (match.participantIdentities || []).find(item => item.player?.puuid === puuid)
  if (!identity) {
    return null
  }

  return (match.participants || []).find(
    participant => participant.participantId === identity.participantId
  ) || null
}

async function assertRenderableMatchHistory(
  matches: MatchHistory[],
  puuid: string,
  requestId = matchHistoryRequestId
): Promise<MatchHistory[]> {
  const renderableMatches: MatchHistory[] = []

  for (const match of matches) {
    if (isRenderableMatchForPuuid(match, puuid)) {
      const hydratedMatch = await hydrateMatchHistoryFromLocalDetailIfAvailable(match, puuid, requestId)
      renderableMatches.push(hydratedMatch ?? match)
      continue
    }

    const hydratedMatch = await hydrateMatchHistoryFromLocalDetailIfAvailable(match, puuid, requestId)
    if (hydratedMatch && isRenderableMatchForPuuid(hydratedMatch, puuid)) {
      renderableMatches.push(hydratedMatch)
      continue
    }

    console.warn(`Match history response is missing current player stats for game ${match.gameId}`)
  }

  return renderableMatches
}

async function hydrateMatchHistoryFromLocalDetailIfAvailable(
  match: MatchHistory,
  puuid: string,
  requestId = matchHistoryRequestId
): Promise<MatchHistory | null> {
  void requestId
  if (!match.gameId || !shouldUseLocalMatchCache()) {
    return null
  }

  try {
    const cachedDetail = await loadMatchDetailFromLocalCache({
      ...toMatchDetailCacheKey(match, {
        fallbackRegion: getCurrentSummonerFallbackRegion()
      })
    })
    if (!cachedDetail) {
      return null
    }

    const hydratedMatch = mergeGameDetailIntoMatchHistory(match, cachedDetail)
    return isRenderableMatchForPuuid(hydratedMatch, puuid) ? hydratedMatch : null
  } catch (err) {
    console.warn(`Failed to hydrate match history from local detail for game ${match.gameId}`, err)
    return null
  }
}

function applyGameDetailToVisibleMatchHistory(match: MatchHistory, detail: GameDetail) {
  const puuid = currentSummoner.value?.puuid
  if (!puuid || !isRenderableGameDetail(detail)) {
    return
  }

  const matchId = String(match.gameId)
  let mergedMatch: MatchHistory | null = null
  matchHistory.value = matchHistory.value.map(existingMatch => {
    if (String(existingMatch.gameId) !== matchId) {
      return existingMatch
    }
    const hydratedMatch = mergeGameDetailIntoMatchHistory(existingMatch, detail)
    if (!isRenderableMatchForPuuid(hydratedMatch, puuid)) {
      return existingMatch
    }
    mergedMatch = hydratedMatch
    return hydratedMatch
  })

  if (mergedMatch && String(selectedMatchHistory.value?.gameId) === matchId) {
    selectedMatchHistory.value = mergedMatch
  }
}

function mergeGameDetailIntoMatchHistory(match: MatchHistory, detail: GameDetail): MatchHistory {
  const participantCount = match.participants?.length ?? 0
  const identityCount = match.participantIdentities?.length ?? 0
  const detailParticipants = Array.isArray(detail.participants) ? detail.participants : []
  const detailIdentities = Array.isArray(detail.participantIdentities) ? detail.participantIdentities : []
  const existingParticipantsById = new Map(
    (match.participants || []).map(participant => [participant.participantId, participant])
  )
  return {
    ...match,
    gameMode: match.gameMode || detail.gameMode,
    gameType: match.gameType || detail.gameType,
    queueId: match.queueId || detail.queueId,
    gameDuration: match.gameDuration || detail.gameDuration,
    gameCreation: match.gameCreation || detail.gameCreation,
    teamObjectives: detail.teamObjectives?.length ? detail.teamObjectives : match.teamObjectives,
    teamBans: detail.teamBans?.length ? detail.teamBans : match.teamBans,
    participants: detailParticipants.length >= participantCount
      ? detailParticipants.map(participant => {
          const nextParticipant = toMatchParticipantFromGameDetail(participant)
          const existingParticipant = existingParticipantsById.get(nextParticipant.participantId)
          return mergeParticipantLoadout(existingParticipant, nextParticipant)
        })
      : match.participants,
    participantIdentities: detailIdentities.length >= identityCount
      ? mergeIdentitiesWithNames(match.participantIdentities, detailIdentities)
      : match.participantIdentities
  }
}

/**
 * 合并身份时别把已有的名字弄丢。
 *
 * <p>SGP 的详情接口只给 summonerId + puuid，而列表接口（现在会补名字）是带名字的。
 * 详情覆盖列表时如果直接替换，整张记分板就会全变成 "Unknown Player"。
 */
function mergeIdentitiesWithNames(
  existing: ParticipantIdentity[] | undefined,
  fromDetail: GameDetail['participantIdentities']
): ParticipantIdentity[] {
  const existingById = new Map((existing || []).map(identity => [identity.participantId, identity]))
  return fromDetail.map(identity => {
    const mapped = toMatchParticipantIdentityFromGameDetail(identity)
    const previous = existingById.get(mapped.participantId)
    if (!previous?.player) {
      return mapped
    }
    return {
      ...mapped,
      player: {
        ...mapped.player,
        gameName: mapped.player?.gameName || previous.player.gameName,
        tagLine: mapped.player?.tagLine || previous.player.tagLine,
        summonerName: mapped.player?.summonerName || previous.player.summonerName,
        puuid: mapped.player?.puuid || previous.player.puuid
      }
    }
  })
}

function mergeParticipantLoadout(
  existingParticipant: Participant | undefined,
  nextParticipant: Participant
): Participant {
  if (!existingParticipant) {
    return nextParticipant
  }

  const existingRecord = existingParticipant as unknown as Record<string, unknown>
  const nextRecord = nextParticipant as unknown as Record<string, unknown>
  const mergedRecord: Record<string, unknown> = { ...existingRecord }
  mergeDefinedRecordValues(mergedRecord, nextRecord)

  for (const key of PARTICIPANT_LOADOUT_ID_KEYS) {
    const nextValue = normalizePositiveInteger(nextRecord[key])
    const existingValue = normalizePositiveInteger(existingRecord[key])
    if (nextValue !== null) {
      mergedRecord[key] = nextValue
    } else if (existingValue !== null) {
      mergedRecord[key] = existingValue
    }
  }

  for (const key of PARTICIPANT_POSITION_KEYS) {
    const nextValue = normalizeNonEmptyString(nextRecord[key])
    const existingValue = normalizeNonEmptyString(existingRecord[key])
    if (nextValue !== null) {
      mergedRecord[key] = nextValue
    } else if (existingValue !== null) {
      mergedRecord[key] = existingValue
    }
  }

  const mergedStats = mergeParticipantStatsLoadout(existingParticipant.stats, nextParticipant.stats)
  if (mergedStats) {
    mergedRecord.stats = mergedStats
  }

  return mergedRecord as unknown as Participant
}

function mergeParticipantStatsLoadout(
  existingStats: Stats | undefined,
  nextStats: Stats | undefined
): Stats | undefined {
  if (!existingStats) {
    return nextStats
  }
  if (!nextStats) {
    return existingStats
  }

  const existingRecord = existingStats as unknown as Record<string, unknown>
  const nextRecord = nextStats as unknown as Record<string, unknown>
  const mergedRecord: Record<string, unknown> = { ...existingRecord }
  mergeDefinedRecordValues(mergedRecord, nextRecord)
  mergeChallengesRecord(mergedRecord, existingRecord, nextRecord)

  for (const key of LOADOUT_STAT_KEYS) {
    const nextValue = normalizePositiveInteger(nextRecord[key])
    const existingValue = normalizePositiveInteger(existingRecord[key])
    if (nextValue !== null) {
      mergedRecord[key] = nextValue
    } else if (existingValue !== null) {
      mergedRecord[key] = existingValue
    }
  }

  if (!isRecord(nextRecord.perks) && isRecord(existingRecord.perks)) {
    mergedRecord.perks = existingRecord.perks
  }
  if (!isRecord(nextRecord.extraFields) && isRecord(existingRecord.extraFields)) {
    mergedRecord.extraFields = existingRecord.extraFields
  }

  return mergedRecord as unknown as Stats
}

function mergeDefinedRecordValues(
  target: Record<string, unknown>,
  source: Record<string, unknown>
) {
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== null) {
      target[key] = value
    }
  }
}

function mergeChallengesRecord(
  target: Record<string, unknown>,
  existingRecord: Record<string, unknown>,
  nextRecord: Record<string, unknown>
) {
  const existingChallenges = existingRecord.challenges
  const nextChallenges = nextRecord.challenges
  if (!isRecord(existingChallenges) && !isRecord(nextChallenges)) {
    return
  }

  target.challenges = {
    ...(isRecord(existingChallenges) ? existingChallenges : {}),
    ...(isRecord(nextChallenges) ? nextChallenges : {})
  }
}

function toMatchParticipantFromGameDetail(
  participant: GameDetail['participants'][number]
): Participant {
  const stats = toMatchStatsFromGameDetail(participant.stats)
  return {
    participantId: participant.participantId,
    teamId: participant.teamId,
    championId: participant.championId,
    spell1Id: participant.spell1Id,
    spell2Id: participant.spell2Id,
    ...(stats ? { stats } : {})
  } as Participant
}

function toMatchParticipantIdentityFromGameDetail(
  identity: GameDetail['participantIdentities'][number]
): ParticipantIdentity {
  return {
    participantId: identity.participantId,
    player: {
      accountId: identity.player?.accountId ?? 0,
      summonerId: identity.player?.summonerId ?? 0,
      summonerName: identity.player?.summonerName ?? '',
      gameName: identity.player?.gameName ?? '',
      tagLine: identity.player?.tagLine ?? '',
      puuid: identity.player?.puuid ?? '',
      platformId: identity.player?.platformId ?? ''
    }
  }
}

function toMatchStatsFromGameDetail(stats: GameDetail['participants'][number]['stats'] | undefined): Stats | undefined {
  if (!stats || !hasCompleteParticipantStats(stats)) {
    return undefined
  }

  const sourceRecord = stats as unknown as Record<string, unknown>
  const matchStats = {
    ...createDefaultMatchStats(),
    win: stats.win,
    kills: readDetailStatNumber(stats?.kills),
    deaths: readDetailStatNumber(stats?.deaths),
    assists: readDetailStatNumber(stats?.assists),
    goldEarned: readDetailStatNumber(stats?.goldEarned),
    totalMinionsKilled: readDetailStatNumber(stats?.totalMinionsKilled),
    neutralMinionsKilled: readDetailStatNumber(stats?.neutralMinionsKilled),
    totalDamageDealtToChampions: readDetailStatNumber(stats?.totalDamageDealtToChampions),
    totalDamageTaken: readDetailStatNumber(stats?.totalDamageTaken),
    totalHeal: readDetailStatNumber(stats?.totalHeal),
    item0: readDetailStatNumber(stats?.item0),
    item1: readDetailStatNumber(stats?.item1),
    item2: readDetailStatNumber(stats?.item2),
    item3: readDetailStatNumber(stats?.item3),
    item4: readDetailStatNumber(stats?.item4),
    item5: readDetailStatNumber(stats?.item5),
    item6: readDetailStatNumber(stats?.item6),
    damageDealtToChampionsRate: stats?.damageDealtToChampionsRate,
    damageTakenRate: stats?.damageTakenRate,
    healRate: stats?.healRate,
    mvp: stats?.mvp,
    doubleKills: stats?.doubleKills,
    tripleKills: stats?.tripleKills,
    quadraKills: stats?.quadraKills,
    pentaKills: stats?.pentaKills,
    largestKillingSpree: stats?.largestKillingSpree,
    legendaryCount: stats?.legendaryCount,
    perk0: stats?.perk0,
    minionsKilled: stats?.minionsKilled,
    damageDealtToTurrets: stats?.damageDealtToTurrets,
    playerAugment1: stats?.playerAugment1,
    playerAugment2: stats?.playerAugment2,
    playerAugment3: stats?.playerAugment3,
    playerAugment4: stats?.playerAugment4
  }
  const matchStatsRecord = matchStats as unknown as Record<string, unknown>

  for (const key of LOADOUT_STAT_KEYS) {
    if (sourceRecord[key] !== undefined) {
      matchStatsRecord[key] = sourceRecord[key]
    }
  }

  if (isRecord(sourceRecord.perks)) {
    matchStatsRecord.perks = sourceRecord.perks
  }
  if (isRecord(sourceRecord.extraFields)) {
    matchStatsRecord.extraFields = sourceRecord.extraFields
  }
  if (isRecord(sourceRecord.challenges)) {
    matchStatsRecord.challenges = sourceRecord.challenges
  }

  return matchStats as Stats
}

function createDefaultMatchStats(): Stats {
  return {
    win: false,
    kills: 0,
    deaths: 0,
    assists: 0,
    goldEarned: 0,
    totalMinionsKilled: 0,
    neutralMinionsKilled: 0,
    totalDamageDealtToChampions: 0,
    totalDamageTaken: 0,
    totalHeal: 0,
    item0: 0,
    item1: 0,
    item2: 0,
    item3: 0,
    item4: 0,
    item5: 0,
    item6: 0
  }
}

function readDetailStatNumber(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^\d+$/.test(trimmed)) {
      const parsed = Number(trimmed)
      return parsed > 0 ? parsed : null
    }
  }

  return null
}

function normalizeNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function isRenderableGameDetail(detail: GameDetail | null): detail is GameDetail {
  return Boolean(detail?.participants?.some(participant =>
    participant?.teamId != null &&
    participant.championId != null &&
    hasCompleteParticipantStats(participant.stats)
  ))
}

function getTeamKills(participants: Participant[], teamId: number): number {
  return participants.reduce((total, participant) => {
    if (participant.teamId !== teamId) {
      return total
    }
    return total + readStatNumber(participant.stats?.kills)
  }, 0)
}

function readStatNumber(value: Stats[keyof Stats] | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function getQualityOverviewLookbackMatches(): MatchHistory[] {
  const puuid = currentSummoner.value?.puuid || ''
  if (!puuid) {
    return []
  }

  const matches = overviewLookbackMatches.value.length > 0
    ? overviewLookbackMatches.value
    : selectRecentMatchLookback(matchHistory.value)
  return matches.filter(match => isRenderableMatchForPuuid(match, puuid))
}

function shouldUseLocalMatchCache() {
  return (props.variant === 'mine' || props.localCacheEnabled === true) && Boolean(window.electronAPI?.database)
}

function getCurrentSummonerFallbackRegion(): string | null {
  const summoner = currentSummoner.value as (Summoner & { platformId?: string | null }) | null
  return typeof summoner?.platformId === 'string' ? summoner.platformId : null
}

function getLocalCacheListOptions(page = 1) {
  return {
    limit: MATCH_HISTORY_PAGE_SIZE,
    offset: getMatchHistoryPageOffset(page),
    queueId: filterQueueId.value > 0 ? filterQueueId.value : undefined,
    championId: filterChampionId.value > 0 ? filterChampionId.value : undefined
  }
}

async function hydrateMatchHistoryFromLocalCache(
  requestId = matchHistoryRequestId,
  options: MatchHistoryHydrateOptions = {}
): Promise<boolean> {
  const puuid = currentSummoner.value?.puuid
  if (!puuid) {
    return false
  }

  const page = options.page ?? 1
  const append = options.append === true && page > 1
  const localCacheEnabled = shouldUseLocalMatchCache()

  if (localCacheEnabled) {
    const cachedMatches = await readMatchHistoryFromLocalCache({
      accountPuuid: puuid,
      options: getLocalCacheListOptions(page)
    })

    if (requestId !== matchHistoryRequestId) {
      return false
    }

    if (cachedMatches.length > 0) {
      applyMatchHistoryPage(cachedMatches, page, append)
      hasNext.value = cachedMatches.length >= MATCH_HISTORY_PAGE_SIZE
      if (!append) {
        userTagSummaries.value = {}
      }
      void hydrateOverviewLookbackMatches(requestId)
      return true
    }
  }

  const hydratedFromBackendCache = await hydrateMatchHistoryFromBackendCache(requestId, { page, append })
  return hydratedFromBackendCache
}

async function hydrateMatchHistoryFromBackendCache(
  requestId: number,
  options: MatchHistoryHydrateOptions = {}
): Promise<boolean> {
  const puuid = currentSummoner.value?.puuid
  if (!puuid) {
    return false
  }

  const page = options.page ?? 1
  const append = options.append === true && page > 1
  try {
    const response = await apiClient.getMatchHistoryPage(puuid, {
      page,
      pageSize: MATCH_HISTORY_PAGE_SIZE,
      source: 'cache',
      championId: filterChampionId.value > 0 ? filterChampionId.value : undefined,
      queueId: filterQueueId.value > 0 ? filterQueueId.value : undefined
    })
    const matches = await assertRenderableMatchHistory(response.matches ?? [], puuid, requestId)

    if (requestId !== matchHistoryRequestId || matches.length === 0) {
      return false
    }

    applyMatchHistoryPage(matches, page, append)
    hasNext.value = response.hasNext === true
    matchRecordStatus.value = response.recordStatus
    if (!append) {
      userTagSummaries.value = {}
    }
    void hydrateOverviewLookbackMatches(requestId)
    return true
  } catch (err) {
    console.warn('Failed to hydrate match history from backend cache', err)
    return false
  }
}

async function persistMatchHistoryToLocalCache(matches: MatchHistory[]): Promise<boolean> {
  const summoner = currentSummoner.value
  if (!summoner || !shouldUseLocalMatchCache()) {
    return false
  }

  const written = await writeMatchHistoryToLocalCache({
    summoner,
    matches
  })

  if (!written) {
    console.warn('Failed to persist local match history cache')
  }
  return written
}

interface OverviewLookbackLoadOptions {
  source?: MatchHistoryLoadOptions['source']
  forceRefresh?: boolean
}

async function readOverviewLookbackFromLocalCache(puuid: string): Promise<MatchHistory[]> {
  if (!shouldUseLocalMatchCache()) {
    return []
  }

  return readMatchHistoryFromLocalCache({
    accountPuuid: puuid,
    options: {
      limit: TAG_OVERVIEW_LOOKBACK_LIMIT,
      offset: 0
    }
  })
}

async function readOverviewLookbackFromBackend(
  puuid: string,
  options: OverviewLookbackLoadOptions = {},
  requestId = matchHistoryRequestId
): Promise<MatchHistory[]> {
  try {
    const response = await apiClient.getMatchHistoryPage(puuid, {
      page: 1,
      pageSize: TAG_OVERVIEW_LOOKBACK_LIMIT,
      source: options.source ?? 'cache',
      forceRefresh: options.forceRefresh === true
    })
    return assertRenderableMatchHistory(response.matches ?? [], puuid, requestId)
  } catch (err) {
    console.warn('Failed to hydrate overview lookback matches', err)
    return []
  }
}

async function hydrateOverviewLookbackMatches(
  requestId = matchHistoryRequestId,
  options: OverviewLookbackLoadOptions = {}
): Promise<boolean> {
  const puuid = currentSummoner.value?.puuid
  if (!puuid) {
    return false
  }

  let bestMatches = await readOverviewLookbackFromLocalCache(puuid)
  if (requestId !== matchHistoryRequestId) {
    return false
  }

  if (bestMatches.length > 0) {
    applyOverviewLookbackMatches(bestMatches)
  }
  if (bestMatches.length >= TAG_OVERVIEW_LOOKBACK_LIMIT) {
    return true
  }

  const backendMatches = await readOverviewLookbackFromBackend(puuid, options, requestId)
  if (requestId !== matchHistoryRequestId) {
    return false
  }

  if (backendMatches.length > bestMatches.length) {
    bestMatches = backendMatches
    applyOverviewLookbackMatches(bestMatches)
    void persistMatchHistoryToLocalCache(bestMatches)
  }

  if (bestMatches.length > 0) {
    return true
  }

  const fallbackMatches = selectRecentMatchLookback(matchHistory.value, TAG_OVERVIEW_LOOKBACK_LIMIT)
  if (fallbackMatches.length > 0) {
    applyOverviewLookbackMatches(fallbackMatches)
    return true
  }

  return false
}

async function refreshRemoteMatchHistory(options: MatchHistoryLoadOptions = {}) {
  const puuid = currentSummoner.value?.puuid
  if (!puuid) {
    return
  }

  const connected = await refreshLcuConnectionStatus()
  if (!connected) {
    return
  }

  const requestId = options.requestId ?? matchHistoryRequestId
  const refreshRunId = startRefreshing(requestId)
  rankLoadStatus.value = 'loading'
  let visibleListUpdated = false
  void loadRankSummary(puuid, requestId)
  void loadOverviewUserTagSummary(puuid, requestId)

  try {
    try {
      const sgpResult = await loadMatchHistoryFromSource('sgp', options, requestId)
      visibleListUpdated = visibleListUpdated || sgpResult?.visibleListUpdated === true
    } catch (sgpErr) {
      if (requestId !== matchHistoryRequestId) {
        return
      }
      console.warn('SGP match history refresh failed, falling back to LCU', sgpErr)
      try {
        const lcuResult = await loadMatchHistoryFromSource('lcu', options, requestId)
        visibleListUpdated = visibleListUpdated || lcuResult?.visibleListUpdated === true
      } catch (lcuErr) {
        if (requestId !== matchHistoryRequestId) {
          return
        }
        console.warn('LCU match history refresh failed, retrying SGP once', lcuErr)
        const retrySgpResult = await loadMatchHistoryFromSource('sgp', options, requestId)
        visibleListUpdated = visibleListUpdated || retrySgpResult?.visibleListUpdated === true
      }
    }
    if (options.autoOpenLatestMatchToken && visibleListUpdated && requestId === matchHistoryRequestId) {
      await openPendingAutoLatestMatch(options.autoOpenLatestMatchToken, requestId)
    }
  } catch (err) {
    if (requestId !== matchHistoryRequestId) {
      return
    }

    await handleRemoteMatchHistoryFailure(requestId, err)
  } finally {
    stopRefreshing(refreshRunId)
  }
}

async function handleRemoteMatchHistoryFailure(requestId: number, err: unknown) {
  if (requestId !== matchHistoryRequestId) {
    return
  }

  console.error('Failed to load match history page', err)
  const hadVisibleMatches = matchHistory.value.length > 0
  const hasCachedMatches = await hydrateMatchHistoryFromLocalCache(requestId)
  if (requestId !== matchHistoryRequestId) {
    return
  }

  matchRecordStatus.value = 'ERROR'
  if (!hadVisibleMatches && !hasCachedMatches) {
    matchHistory.value = []
    summariesLoading.value = false
  }
}

async function loadMatchHistoryFromSource(
  source: 'sgp' | 'lcu',
  options: MatchHistoryLoadOptions,
  requestId: number
): Promise<MatchHistoryLoadResult | undefined> {
  return loadMatchHistory({
    ...options,
    requestId,
    source,
    throwOnError: true
  })
}

async function loadRankSummary(puuid: string, requestId: number) {
  try {
    const rankData = await apiClient.getRank(puuid)
    if (requestId !== matchHistoryRequestId) {
      return
    }
    rank.value = rankData
    rankLoadStatus.value = 'loaded'
  } catch (err) {
    if (requestId !== matchHistoryRequestId) {
      return
    }
    console.error('Failed to load rank summary', err)
    rank.value = null
    rankLoadStatus.value = 'error'
  }
}

async function resolveOverviewUserTagMatches(puuid: string, requestId: number): Promise<MatchHistory[]> {
  if (overviewLookbackMatches.value.length < TAG_OVERVIEW_LOOKBACK_LIMIT) {
    await hydrateOverviewLookbackMatches(requestId)
  }

  if (currentSummoner.value?.puuid !== puuid || requestId !== matchHistoryRequestId) {
    return []
  }

  if (overviewLookbackMatches.value.length > 0) {
    return overviewLookbackMatches.value
  }

  return selectRecentMatchLookback(matchHistory.value, TAG_OVERVIEW_LOOKBACK_LIMIT)
}

async function loadOverviewUserTagSummaryFromMatches(
  puuid: string,
  requestId: number,
  abortController: AbortController
): Promise<UserTagSummary | null> {
  const matches = await resolveOverviewUserTagMatches(puuid, requestId)
  if (abortController.signal.aborted || !isActiveOverviewUserTagRequest(requestId, puuid) || matches.length === 0) {
    return null
  }

  return apiClient.getUserTagSummaryFromMatches(puuid, matches, TAG_ANALYSIS_MODE, {
    signal: abortController.signal,
    suppressErrorLog: true
  })
}

async function loadOverviewUserTagSummary(puuid: string, requestId = matchHistoryRequestId) {
  overviewUserTagAbortController?.abort()
  const abortController = new AbortController()
  overviewUserTagAbortController = abortController
  userTagLoadStatus.value = 'loading'

  try {
    const prefetchedSummary = await loadOverviewUserTagSummaryFromMatches(puuid, requestId, abortController)
    if (abortController.signal.aborted || !isActiveOverviewUserTagRequest(requestId, puuid)) {
      return
    }
    if (prefetchedSummary) {
      applyOverviewUserTagSummary(prefetchedSummary)
      return
    }

    const summaries = await apiClient.getUserTagSummaryBatch([puuid], TAG_ANALYSIS_MODE, {
      signal: abortController.signal,
      suppressErrorLog: true
    })

    if (abortController.signal.aborted || !isActiveOverviewUserTagRequest(requestId, puuid)) {
      return
    }

    applyOverviewUserTagSummary(summaries[puuid] ?? null)
  } catch (err) {
    if (abortController.signal.aborted || !isActiveOverviewUserTagRequest(requestId, puuid)) {
      return
    }

    console.warn('Failed to load overview summary tag', err)
    applyOverviewUserTagSummary(null)
    if (!hasUsefulOverviewUserTag(overviewUserTag.value) && visibleMatchStats.value.sampleCount === 0) {
      userTagLoadStatus.value = 'error'
    }
  } finally {
    if (overviewUserTagAbortController === abortController) {
      overviewUserTagAbortController = null
    }
  }
}

async function loadMatchHistory(options: MatchHistoryLoadOptions = {}): Promise<MatchHistoryLoadResult | undefined> {
  const puuid = currentSummoner.value?.puuid
  if (!puuid) {
    return
  }

  const requestId = options.requestId ?? matchHistoryRequestId
  const requestedSource = options.source ?? 'auto'
  const page = options.page ?? 1
  const append = options.append === true && page > 1
  const pageSize = MATCH_HISTORY_PAGE_SIZE
  const queueId = filterQueueId.value > 0 ? filterQueueId.value : undefined
  const championId = filterChampionId.value > 0 ? filterChampionId.value : undefined
  if (append) {
    startLoadMoreLoading()
  } else {
    startListLoading(requestId)
  }
  try {
    const response = await apiClient.getMatchHistoryPage(puuid, {
      page,
      pageSize,
      source: requestedSource,
      championId,
      queueId,
      forceRefresh: options.forceRefresh === true
    })
    const responseSource = (response as { source?: unknown }).source
    const matches = response.matches ?? []

    if (requestId !== matchHistoryRequestId) {
      return
    }

    const renderableMatches = await assertRenderableMatchHistory(matches, puuid, requestId)
    if (requestId !== matchHistoryRequestId) {
      return
    }

    matchRecordStatus.value = response.recordStatus
    hasNext.value = response.hasNext === true
    loadMoreError.value = false
    loadMoreRetryPage.value = null
    if (!append) {
      userTagSummaries.value = {}
    }
    const persisted = await persistMatchHistoryToLocalCache(renderableMatches)
    const hydrated = persisted ? await hydrateMatchHistoryFromLocalCache(requestId, { page, append }) : false
    let visibleListUpdated = hydrated
    if (!hydrated) {
      applyMatchHistoryPage(renderableMatches, page, append)
      visibleListUpdated = true
    }
    if (requestId !== matchHistoryRequestId) {
      return
    }
    await hydrateOverviewLookbackMatches(requestId, {
      source: requestedSource,
      forceRefresh: options.forceRefresh === true
    })
    if (requestId !== matchHistoryRequestId) {
      return
    }
    void loadOverviewUserTagSummary(puuid, requestId)
    return {
      requestedSource,
      responseSource,
      recordStatus: response.recordStatus ?? null,
      responseMatches: matches.length,
      renderableMatches: renderableMatches.length,
      persistedToLocalCache: persisted,
      hydratedFromCacheAfterPersist: hydrated,
      visibleListUpdated,
      visibleMatchesAfterLoad: matchHistory.value.length,
      page,
      hasNext: response.hasNext === true,
      append
    }
  } catch (err) {
    if (requestId !== matchHistoryRequestId) {
      return
    }

    if (options?.throwOnError === true) {
      throw err
    }
    if (append) {
      console.error('Failed to load more match history', err)
      loadMoreError.value = true
      loadMoreRetryPage.value = page
    } else {
      await handleRemoteMatchHistoryFailure(requestId, err)
    }
  } finally {
    if (append) {
      stopLoadMoreLoading()
    } else {
      stopListLoading(requestId)
    }
  }
}

async function loadMoreMatchHistory() {
  if (!shouldLoadMoreMatchHistory()) {
    return
  }

  const requestId = matchHistoryRequestId
  const page = loadMoreRetryPage.value ?? currentPage.value + 1
  if (loadedPages.value.includes(page) && loadMoreRetryPage.value !== page) {
    return
  }

  startLoadMoreLoading()
  try {
    await hydrateMatchHistoryFromLocalCache(requestId, { page, append: true })
    if (requestId !== matchHistoryRequestId) {
      return
    }

    const connected = await refreshLcuConnectionStatus()
    if (!connected || requestId !== matchHistoryRequestId) {
      return
    }

    await loadMatchHistory({ page, append: true, requestId })
  } finally {
    stopLoadMoreLoading()
  }
}

async function loadSelectedMatchUserTagSummaries(match: MatchHistory, requestId = matchDetailRequestId) {
  summariesAbortController?.abort()
  summariesAbortController = null

  const matchId = String(match.gameId)
  const puuids = collectMatchPuuids(match)
  if (!puuids.length) {
    if (isActiveUserTagSummaryRequest(requestId, matchId)) {
      userTagSummaries.value = {}
      summariesLoading.value = false
    }
    return
  }

  if (isActiveUserTagSummaryRequest(requestId, matchId)) {
    summariesLoading.value = true
  }

  const abortController = new AbortController()
  summariesAbortController = abortController

  const mergedSummaries: Record<string, UserTagSummary> = {}
  try {
    for (const puuidBatch of chunkUserTagSummaryPuuids(puuids)) {
      if (abortController.signal.aborted || !isActiveUserTagSummaryRequest(requestId, matchId)) {
        return
      }

      const summaries = await apiClient.getUserTagSummaryBatch(puuidBatch, TAG_ANALYSIS_MODE, {
        signal: abortController.signal,
        suppressErrorLog: true
      })
      Object.assign(mergedSummaries, summaries)

      if (isActiveUserTagSummaryRequest(requestId, matchId)) {
        userTagSummaries.value = { ...mergedSummaries }
      }
    }
  } catch (err) {
    if (abortController.signal.aborted || !isActiveUserTagSummaryRequest(requestId, matchId)) {
      return
    }
    console.warn('Failed to load summary tags', err)
    userTagSummaries.value = { ...mergedSummaries }
  } finally {
    if (summariesAbortController === abortController) {
      summariesAbortController = null
    }
    if (isActiveUserTagSummaryRequest(requestId, matchId)) {
      summariesLoading.value = false
    }
  }
}

function chunkUserTagSummaryPuuids(puuids: string[]): string[][] {
  const batches: string[][] = []
  for (let index = 0; index < puuids.length; index += USER_TAG_SUMMARY_BATCH_SIZE) {
    batches.push(puuids.slice(index, index + USER_TAG_SUMMARY_BATCH_SIZE))
  }
  return batches
}

function collectMatchPuuids(match: MatchHistory): string[] {
  const unique = new Set<string>()
  for (const identity of match.participantIdentities || []) {
    const puuid = identity.player?.puuid
    if (puuid) {
      unique.add(puuid)
    }
  }
  return [...unique]
}

function formatChampionFilterLabel(): string {
  if (filterChampionId.value <= 0) {
    return t('common.allChampions')
  }

  const selected = selectedChampionOption.value
  if (selected) {
    return selected.label
  }

  const fallback = championOptions.value.find(option => option.value === filterChampionId.value)
  return fallback?.label || `未知英雄 ${filterChampionId.value}`
}

function toggleChampionFilter() {
  championFilterOpen.value = !championFilterOpen.value
}

function closeChampionFilter() {
  championFilterOpen.value = false
}

async function selectChampionFilter(championId: number) {
  championFilterOpen.value = false
  if (filterChampionId.value === championId) {
    return
  }

  filterChampionId.value = championId
  await handleFilterChange()
}

function handleWindowPointerDown(event: PointerEvent) {
  if (!championFilterOpen.value) {
    return
  }

  const target = event.target
  if (target instanceof Node && championFilterRef.value?.contains(target)) {
    return
  }

  championFilterOpen.value = false
}

async function handleFilterChange() {
  collapseInlineDetail()
  const requestId = beginMatchHistoryRequest()
  const hydrated = await hydrateMatchHistoryFromLocalCache(requestId)
  clearMatchHistoryWhenLocalCacheMisses(requestId, hydrated)
  void refreshRemoteMatchHistory({ forceRefresh: true, requestId })
}

async function handleRefresh() {
  collapseInlineDetail()
  const requestId = beginMatchHistoryRequest()
  const hydrated = await hydrateMatchHistoryFromLocalCache(requestId)
  clearMatchHistoryWhenLocalCacheMisses(requestId, hydrated)
  void refreshRemoteMatchHistory({ forceRefresh: true, requestId })
}

async function toggleInlineDetail(match: MatchHistory) {
  if (expandedGameId.value === match.gameId) {
    collapseInlineDetail()
    return
  }

  await openInlineDetail(match)
}

async function openInlineDetail(match: MatchHistory) {
  if (expandedGameId.value === match.gameId && selectedMatchHistory.value?.gameId === match.gameId) {
    return
  }

  const previousExpandedGameId = expandedGameId.value
  if (previousExpandedGameId !== null) {
    clearInlineDetailTab(previousExpandedGameId)
  }

  const requestId = ++matchDetailRequestId
  const fallbackRegion = getCurrentSummonerFallbackRegion()
  const detailCacheKey = toMatchDetailCacheKey(match, {
    fallbackRegion
  })
  const { matchId } = detailCacheKey
  expandedGameId.value = match.gameId
  selectedMatchHistory.value = match
  selectedGameDetail.value = null
  selectedGameDetailStatus.value = 'loading'
  userTagSummaries.value = {}
  summariesLoading.value = false
  void loadSelectedMatchUserTagSummaries(match, requestId)

  let hasCachedDetail = false
  if (shouldUseLocalMatchCache()) {
    const cachedDetail = await loadMatchDetailFromLocalCache({
      ...detailCacheKey
    })
    if (!isActiveMatchDetailRequest(requestId, matchId)) {
      return
    }
    if (isRenderableGameDetail(cachedDetail)) {
      selectedGameDetail.value = cachedDetail
      applyGameDetailToVisibleMatchHistory(match, cachedDetail)
      hasCachedDetail = true
    } else if (cachedDetail) {
      console.warn(`Skipping cached game detail without renderable stats for game ${match.gameId}`)
    }
  }

  try {
    const gameDetail = await apiClient.getGameDetail(match.gameId)
    if (!isActiveMatchDetailRequest(requestId, matchId)) {
      return
    }
    if (!isRenderableGameDetail(gameDetail)) {
      throw new Error('Game detail response missing renderable participant stats')
    }
    selectedGameDetail.value = gameDetail
    applyGameDetailToVisibleMatchHistory(match, gameDetail)
    selectedGameDetailStatus.value = 'loaded'
    if (shouldUseLocalMatchCache()) {
      void persistMatchDetailToLocalCache({
        match,
        gameDetail,
        fallbackRegion
      }).then((written) => {
        if (!written) {
          console.warn('Failed to persist local match detail cache')
        }
      })
    }
  } catch (err) {
    if (!isActiveMatchDetailRequest(requestId, matchId)) {
      return
    }
    if (hasCachedDetail) {
      selectedGameDetailStatus.value = 'error'
      console.warn('Failed to refresh game detail; using local cache', err)
    } else {
      selectedGameDetailStatus.value = 'error'
      console.error('Failed to load game detail', err)
    }
  }
}

async function openPendingAutoLatestMatch(token: string, requestId = matchHistoryRequestId): Promise<boolean> {
  if (
    !token ||
    token !== pendingAutoOpenLatestMatchToken.value ||
    token === consumedAutoOpenLatestMatchToken.value ||
    requestId !== matchHistoryRequestId
  ) {
    return false
  }

  const latestMatch = matchHistory.value[0]
  if (!latestMatch) {
    return false
  }

  consumedAutoOpenLatestMatchToken.value = token
  pendingAutoOpenLatestMatchToken.value = ''
  await openInlineDetail(latestMatch)
  clearPostgameAutoOpenLatestMatchToken(token)
  return true
}

function normalizeOpenMatchId(matchId: unknown): string {
  return typeof matchId === 'string' ? matchId.trim() : ''
}

function requestOpenMatchId(matchId: unknown): void {
  const normalized = normalizeOpenMatchId(matchId)
  if (!normalized || normalized === consumedOpenMatchId.value) {
    return
  }

  filterChampionId.value = -1
  filterQueueId.value = 0
  const requestId = beginMatchHistoryRequest()
  pendingOpenMatchId.value = normalized
  void openPendingMatchId(requestId)
}

async function requestOpenMatchIdForCurrentRequest(matchId: unknown, requestId: number): Promise<boolean> {
  const normalized = normalizeOpenMatchId(matchId)
  if (!normalized || normalized === consumedOpenMatchId.value) {
    return false
  }

  filterChampionId.value = -1
  filterQueueId.value = 0
  pendingOpenMatchId.value = normalized
  return openPendingMatchId(requestId)
}

async function openPendingMatchId(requestId = matchHistoryRequestId): Promise<boolean> {
  const matchId = pendingOpenMatchId.value
  if (!matchId || requestId !== matchHistoryRequestId) {
    return false
  }

  const match = await findMatchForOpenMatchId(matchId, requestId)
  if (!match || requestId !== matchHistoryRequestId || pendingOpenMatchId.value !== matchId) {
    return false
  }

  pendingOpenMatchId.value = ''
  consumedOpenMatchId.value = matchId
  const openTask = openInlineDetail(match)
  scrollMatchListItemIntoView(match.gameId)
  await openTask
  clearOpenMatchIdQuery(matchId)
  return true
}

async function findMatchForOpenMatchId(matchId: string, requestId: number): Promise<MatchHistory | null> {
  const visibleMatch = matchHistory.value.find(match => String(match.gameId) === matchId)
  if (visibleMatch) {
    return visibleMatch
  }

  const puuid = currentSummoner.value?.puuid
  if (!puuid || !shouldUseLocalMatchCache()) {
    return null
  }

  const cachedMatches = await readMatchHistoryFromLocalCache({
    accountPuuid: puuid,
    options: {
      limit: 200,
      offset: 0
    }
  })
  if (requestId !== matchHistoryRequestId) {
    return null
  }

  const targetIndex = cachedMatches.findIndex(match => String(match.gameId) === matchId)
  if (targetIndex < 0) {
    return null
  }

  applyOpenMatchHistoryPageFromCache(cachedMatches, targetIndex)
  return matchHistory.value.find(match => String(match.gameId) === matchId) || cachedMatches[targetIndex] || null
}

function clearOpenMatchIdQuery(matchId: string): void {
  if (route.name !== 'MatchHistory' || route.query.openMatchId !== matchId) {
    return
  }

  const nextQuery = { ...route.query }
  delete nextQuery.openMatchId
  void router.replace({ name: 'MatchHistory', query: nextQuery })
}

function collapseInlineDetail() {
  const collapsedGameId = expandedGameId.value
  matchDetailRequestId += 1
  summariesAbortController?.abort()
  summariesAbortController = null
  clearInlineDetailTab(collapsedGameId)
  expandedGameId.value = null
  selectedGameDetail.value = null
  selectedMatchHistory.value = null
  selectedGameDetailStatus.value = 'idle'
  userTagSummaries.value = {}
  summariesLoading.value = false
}

function clearInlineDetailTab(gameId: number | null): void {
  if (gameId === null) {
    return
  }

  const nextTabs = { ...activeInlineDetailTabByGameId.value }
  delete nextTabs[String(gameId)]
  activeInlineDetailTabByGameId.value = nextTabs
}

function getInlineDetailTab(gameId: number): InlineDetailTabKey {
  return activeInlineDetailTabByGameId.value[String(gameId)] || 'overview'
}

function setInlineDetailTab(gameId: number, tab: InlineDetailTabKey) {
  activeInlineDetailTabByGameId.value = {
    ...activeInlineDetailTabByGameId.value,
    [String(gameId)]: tab
  }
}

function isActiveMatchDetailRequest(requestId: number, matchId: string): boolean {
  return requestId === matchDetailRequestId &&
    String(expandedGameId.value) === matchId &&
    String(selectedMatchHistory.value?.gameId) === matchId
}

function isActiveUserTagSummaryRequest(requestId: number, matchId: string): boolean {
  return requestId === matchDetailRequestId &&
    String(expandedGameId.value) === matchId &&
    String(selectedMatchHistory.value?.gameId) === matchId
}

function isActiveOverviewUserTagRequest(requestId: number, puuid: string): boolean {
  return requestId === matchHistoryRequestId &&
    currentSummoner.value?.puuid === puuid
}

function handleNavigateToPlayer(gameName: string, tagLine: string) {
  const target = tagLine ? `${gameName}#${tagLine}` : gameName
  if (!target) {
    return
  }

  router.push({
    path: '/summoner',
    query: { name: target }
  })
}

function handleCopyName() {
  // Copy is handled inside the overview panel. Keep this event silent to avoid logging player data.
}

function beginMatchHistoryRequest(): number {
  matchHistoryRequestId += 1
  clearMatchHistoryLoadingState()
  resetMatchHistoryPagination()
  return matchHistoryRequestId
}

function clearMatchHistoryWhenLocalCacheMisses(requestId: number, hydrated: boolean) {
  if (requestId !== matchHistoryRequestId || hydrated) {
    return
  }

  matchHistory.value = []
  matchRecordStatus.value = null
  hasNext.value = false
  userTagSummaries.value = {}
}

function requestAutoOpenLatestMatch(token: string) {
  if (!token || token === consumedAutoOpenLatestMatchToken.value) {
    return
  }

  pendingAutoOpenLatestMatchToken.value = token
  if (!currentSummoner.value?.puuid) {
    return
  }
  if (autoOpenLatestMatchRefreshToken === token) {
    return
  }

  filterChampionId.value = -1
  filterQueueId.value = 0

  const requestId = beginMatchHistoryRequest()
  autoOpenLatestMatchRefreshToken = token
  const refreshTask = (async () => {
    const hydrated = await hydrateMatchHistoryFromLocalCache(requestId)
    clearMatchHistoryWhenLocalCacheMisses(requestId, hydrated)
    await refreshRemoteMatchHistory({ forceRefresh: true, requestId, autoOpenLatestMatchToken: token })
  })()
  void refreshTask.finally(() => {
    if (autoOpenLatestMatchRefreshToken === token) {
      autoOpenLatestMatchRefreshToken = ''
    }
  })
}

async function applyDefaultFiltersAfterSettings(requestId: number) {
  await ensurePageSettingsLoaded()
  if (requestId !== matchHistoryRequestId) {
    return
  }
  if (pendingOpenMatchId.value || consumedOpenMatchId.value) {
    return
  }

  const nextQueueId = defaultMatchQueueMode.value
  if (filterChampionId.value === -1 && filterQueueId.value === nextQueueId) {
    return
  }

  const nextRequestId = beginMatchHistoryRequest()
  applyDefaultFilters()
  const hydrated = await hydrateMatchHistoryFromLocalCache(nextRequestId)
  clearMatchHistoryWhenLocalCacheMisses(nextRequestId, hydrated)
  void refreshRemoteMatchHistory({ forceRefresh: true, requestId: nextRequestId })
}

function disconnectLoadMoreObserver() {
  loadMoreObserver?.disconnect()
  loadMoreObserver = null
}

function observeLoadMoreSentinel() {
  disconnectLoadMoreObserver()
  const sentinel = loadMoreSentinelRef.value
  if (!sentinel || typeof IntersectionObserver === 'undefined') {
    return
  }

  loadMoreObserver = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      void loadMoreMatchHistory()
    }
  }, {
    root: null,
    rootMargin: '320px 0px',
    threshold: 0
  })
  loadMoreObserver.observe(sentinel)
}

onMounted(async () => {
  window.addEventListener('pointerdown', handleWindowPointerDown, { passive: true })
  unsubscribeCacheUpdate = wsClient.onCacheUpdate(async (event: CacheUpdateEvent) => {
    if (isMatchHistoryCacheUpdateRelevant(event)) {
      await hydrateMatchHistoryFromLocalCache()
      await hydrateOverviewLookbackMatches()
      await openPendingAutoLatestMatch(pendingAutoOpenLatestMatchToken.value)
      if (currentSummoner.value?.puuid) {
        void loadOverviewUserTagSummary(currentSummoner.value.puuid)
      }
    }
  })
  void ensurePageSettingsLoaded()
  observeLoadMoreSentinel()
  window.addEventListener('rankpeek:ai-analysis-result-saved', handlePostgameAiAnalysisSaved)
  unsubscribeAiAnalysisSaved = () => window.removeEventListener('rankpeek:ai-analysis-result-saved', handlePostgameAiAnalysisSaved)
})

onUnmounted(() => {
  matchHistoryRequestId += 1
  clearMatchHistoryLoadingState()
  window.removeEventListener('pointerdown', handleWindowPointerDown)
  unsubscribeCacheUpdate?.()
  unsubscribeCacheUpdate = null
  unsubscribeAiAnalysisSaved?.()
  unsubscribeAiAnalysisSaved = null
  disconnectLoadMoreObserver()
  overviewUserTagAbortController?.abort()
  overviewUserTagAbortController = null
  summariesAbortController?.abort()
  summariesAbortController = null
})

watch(
  () => props.connected,
  async connected => {
    const summoner = currentSummoner.value
    if (connected !== true || !summoner?.puuid || lcuConnected.value) {
      return
    }
    lcuConnected.value = true
    lcuConnectionChecked.value = true
    const puuid = summoner.puuid
    const requestId = matchHistoryRequestId
    if (await requestOpenMatchIdForCurrentRequest(route.query.openMatchId, requestId)) {
      void hydrateOverviewLookbackMatches(requestId)
      void loadRankSummary(puuid, requestId)
      void loadOverviewUserTagSummary(puuid, requestId)
      return
    }
    await hydrateMatchHistoryFromLocalCache(requestId)
    void hydrateOverviewLookbackMatches(requestId)
    if (props.autoOpenLatestMatchToken) {
      requestAutoOpenLatestMatch(props.autoOpenLatestMatchToken)
      return
    }
    void refreshRemoteMatchHistory({ forceRefresh: true, requestId })
    void applyDefaultFiltersAfterSettings(requestId)
  }
)

watch(
  () => currentSummoner.value?.puuid,
  async puuid => {
    resetPanelState()
    if (!puuid) {
      return
    }
    const requestId = matchHistoryRequestId
    const connected = await refreshLcuConnectionStatus()
    if (!connected || requestId !== matchHistoryRequestId) {
      return
    }
    if (await requestOpenMatchIdForCurrentRequest(route.query.openMatchId, requestId)) {
      void hydrateOverviewLookbackMatches(requestId)
      void loadRankSummary(puuid, requestId)
      void loadOverviewUserTagSummary(puuid, requestId)
      return
    }
    await hydrateMatchHistoryFromLocalCache(requestId)
    void hydrateOverviewLookbackMatches(requestId)
    if (props.autoOpenLatestMatchToken) {
      requestAutoOpenLatestMatch(props.autoOpenLatestMatchToken)
      return
    }
    void refreshRemoteMatchHistory({ forceRefresh: true, requestId })
    void applyDefaultFiltersAfterSettings(requestId)
  },
  { immediate: true }
)

watch(
  () => props.autoOpenLatestMatchToken,
  token => {
    requestAutoOpenLatestMatch(token)
  },
  { immediate: true }
)

watch(
  () => route.query.openMatchId,
  matchId => {
    requestOpenMatchId(matchId)
  },
  { immediate: true }
)

watch(
  () => [currentSummoner.value?.puuid ?? '', visibleMatchIds.value.join('|')],
  () => {
    void refreshVisiblePostgameAiReports()
    void openPendingMatchId()
  },
  { immediate: true }
)

watch(
  () => loadMoreSentinelRef.value,
  () => {
    observeLoadMoreSentinel()
  }
)
</script>

<style scoped>
.match-history-view {
  --control-glow-x: 50%;
  --control-glow-y: 50%;
  --control-edge-width: 1px;
  --control-edge-offset: -1px;
  --edge-glow-size: 82px;
  --match-control-local-glow: transparent;
  --match-control-local-glow-fade: transparent;
  --match-control-border-local-glow: rgba(78, 215, 255, 0.98);
  --match-control-border-local-glow-fade: rgba(41, 151, 255, 0.48);
  --match-control-edge-rgb: 78, 215, 255;
  --match-control-edge-shadow:
    inset 0 1px 0 rgba(var(--match-control-edge-rgb), calc(var(--edge-top-alpha) * 0.82)),
    inset -1px 0 0 rgba(var(--match-control-edge-rgb), calc(var(--edge-right-alpha) * 0.82)),
    inset 0 -1px 0 rgba(var(--match-control-edge-rgb), calc(var(--edge-bottom-alpha) * 0.82)),
    inset 1px 0 0 rgba(var(--match-control-edge-rgb), calc(var(--edge-left-alpha) * 0.82)),
    0 -3px 11px -6px rgba(var(--match-control-edge-rgb), calc(var(--edge-top-alpha) * 0.48)),
    3px 0 11px -6px rgba(var(--match-control-edge-rgb), calc(var(--edge-right-alpha) * 0.48)),
    0 3px 11px -6px rgba(var(--match-control-edge-rgb), calc(var(--edge-bottom-alpha) * 0.48)),
    -3px 0 11px -6px rgba(var(--match-control-edge-rgb), calc(var(--edge-left-alpha) * 0.48));
  --match-module-hover-rgb: 96, 176, 255;
  --match-module-hover-border: rgba(var(--match-module-hover-rgb), 0.48);
  --match-module-hover-shadow:
    0 0 0 1px rgba(var(--match-module-hover-rgb), 0.16),
    0 0 18px rgba(var(--match-module-hover-rgb), 0.18),
    0 12px 28px rgba(var(--match-module-hover-rgb), 0.08);
  --match-control-radius: 10px;
  --match-control-bg: var(--bg-secondary);
  --match-control-bg-hover: rgba(28, 36, 48, 0.96);
  --match-control-bg-hover-local: linear-gradient(var(--match-control-bg-hover), var(--match-control-bg-hover)) padding-box,
    radial-gradient(
      circle at var(--control-glow-x) var(--control-glow-y),
      var(--match-control-border-local-glow) 0%,
      var(--match-control-border-local-glow-fade) 36%,
      var(--match-control-border-hover) 72%
    ) border-box;
  --match-control-bg-active: rgba(13, 17, 24, 0.98);
  --match-control-bg-active-local: linear-gradient(var(--match-control-bg-active), var(--match-control-bg-active)) padding-box,
    radial-gradient(
      circle at var(--control-glow-x) var(--control-glow-y),
      var(--match-control-border-local-glow) 0%,
      var(--match-control-border-local-glow-fade) 34%,
      var(--match-control-border-hover) 72%
    ) border-box;
  --match-control-active-text: var(--text-primary);
  --match-control-border: var(--border-color);
  --match-control-border-hover: rgba(96, 176, 255, 0.58);
  --match-control-text: var(--text-primary);
  --match-control-muted: var(--text-secondary);
  --match-control-shadow: none;
  --match-control-hover-shadow: 0 0 0 1px rgba(41, 151, 255, 0.16), 0 0 16px rgba(41, 151, 255, 0.22);
  --match-control-active-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.34), 0 0 0 1px rgba(41, 151, 255, 0.14);
  --match-page-shell-side-highlight: rgba(255, 255, 255, 0.11);
  --match-page-shell-side-shadow: rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  gap: 22px;
  isolation: isolate;
}

:global([data-theme="light"] .match-history-view) {
  --match-module-hover-rgb: 86, 109, 134;
  --match-module-hover-border: rgba(var(--match-module-hover-rgb), 0.42);
  --match-module-hover-shadow:
    0 0 0 1px rgba(var(--match-module-hover-rgb), 0.14),
    0 0 18px rgba(var(--match-module-hover-rgb), 0.14),
    0 12px 28px rgba(var(--match-module-hover-rgb), 0.07);
  --rp-light-gold-border: var(--border-color);
  --rp-light-gold-border-hover: rgba(86, 109, 134, 0.42);
  --rp-light-gold-edge-core: rgba(78, 215, 255, 0.98);
  --rp-light-gold-edge-fade: rgba(41, 151, 255, 0.48);
  --rp-light-gold-glow: 0 0 0 1px rgba(41, 151, 255, 0.12), 0 0 12px rgba(41, 151, 255, 0.2);
  --rp-light-gold-glow-active: inset 0 1px 2px rgba(17, 77, 116, 0.14), 0 0 0 1px rgba(41, 151, 255, 0.12), 0 0 8px rgba(41, 151, 255, 0.18);
  --rp-light-global-glow: var(--rp-light-gold-glow);
  --rp-gold-border: var(--rp-light-gold-border);
  --rp-gold-border-hover: var(--rp-light-gold-border-hover);
  --rp-gold-glow-soft: none;
  --rp-gold-glow-hover: var(--rp-light-gold-glow);
  --rp-gold-glow-active: var(--rp-light-gold-glow-active);
  --match-control-bg: var(--bg-secondary);
  --match-control-bg-hover: rgba(244, 249, 255, 0.98);
  --match-control-local-glow: transparent;
  --match-control-local-glow-fade: transparent;
  --control-edge-width: 2px;
  --control-edge-offset: -2px;
  --match-control-border-local-glow: var(--rp-light-gold-edge-core);
  --match-control-border-local-glow-fade: var(--rp-light-gold-edge-fade);
  --match-control-edge-rgb: 78, 215, 255;
  --match-control-bg-active: rgba(15, 22, 34, 0.96);
  --match-control-active-text: #f8fbff;
  --match-control-border: var(--rp-gold-border);
  --match-control-border-hover: rgba(86, 109, 134, 0.42);
  --match-control-text: #24384d;
  --match-control-muted: #52697f;
  --match-control-shadow: var(--rp-gold-glow-soft);
  --match-control-hover-shadow: var(--rp-gold-glow-hover);
  --match-control-active-shadow: var(--rp-gold-glow-active);
  --match-page-shell-side-highlight: rgba(255, 255, 255, 0.68);
  --match-page-shell-side-shadow: rgba(92, 163, 234, 0.08);
}

:global([data-theme="light"] .match-history-view .page-shell) {
  border-color: rgba(92, 163, 234, 0.24);
  background:
    linear-gradient(90deg, var(--match-page-shell-side-highlight), transparent 16%, transparent 84%, var(--match-page-shell-side-highlight)),
    linear-gradient(135deg, rgba(255, 255, 255, 0.82), rgba(255, 255, 255, 0.34)),
    rgba(255, 255, 255, 0.56);
  box-shadow:
    0 10px 26px rgba(92, 163, 234, 0.13),
    0 4px 14px rgba(255, 255, 255, 0.18),
    inset 10px 0 18px var(--match-page-shell-side-shadow),
    inset -10px 0 18px var(--match-page-shell-side-shadow),
    inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

:global([data-theme="light"] .match-history-view .lookup-search-input-wrap) {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0.9)),
    rgba(255, 255, 255, 0.92);
  color: #101722;
  color-scheme: light;
  box-shadow:
    var(--match-control-shadow),
    inset 0 1px 0 rgba(255, 255, 255, 0.82);
}

:global([data-theme="light"] .match-history-view .lookup-search-icon-btn) {
  color: #000;
}

:global([data-theme="light"] .match-history-view .lookup-search-icon-btn:hover),
:global([data-theme="light"] .match-history-view .lookup-search-icon-btn:focus-visible) {
  color: #000;
}

:global([data-theme="light"] .match-history-view .lookup-search-icon),
:global([data-theme="light"] .match-history-view .lookup-search-icon path) {
  color: #000;
  stroke: #000;
}

:global([data-theme="light"] .match-history-view .page-shell:hover),
:global([data-theme="light"] .match-history-view .page-shell.surface-glow[data-near-glow='true']) {
  border-color: rgba(92, 163, 234, 0.36);
  box-shadow:
    0 12px 30px rgba(92, 163, 234, 0.16),
    0 0 0 1px rgba(41, 151, 255, 0.1),
    0 0 20px rgba(41, 151, 255, 0.12),
    inset 10px 0 18px var(--match-page-shell-side-shadow),
    inset -10px 0 18px var(--match-page-shell-side-shadow),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

:global([data-theme="light"] .match-history-view .filter-control) {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.64), rgba(255, 255, 255, 0.28)),
    rgba(255, 255, 255, 0.42);
  box-shadow:
    var(--match-control-shadow),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

:global([data-theme="light"] .match-history-view .history-shell:hover),
:global([data-theme="light"] .match-history-view .history-shell.surface-glow[data-near-glow='true']),
:global([data-theme="light"] .match-history-view .state-card:hover),
:global([data-theme="light"] .match-history-view .state-card.surface-glow[data-near-glow='true']) {
  border-color: rgba(86, 109, 134, 0.36);
  box-shadow:
    0 10px 24px rgba(92, 163, 234, 0.12),
    0 0 0 1px rgba(41, 151, 255, 0.08),
    0 0 18px rgba(41, 151, 255, 0.12);
}

.history-shell,
.state-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  transition: border-color 0.24s ease, box-shadow 0.24s ease, background 0.24s ease;
}

.history-shell:hover,
.history-shell.surface-glow[data-near-glow='true'],
.state-card:hover,
.state-card.surface-glow[data-near-glow='true'] {
  border-color: rgba(148, 211, 255, 0.28);
  box-shadow:
    0 10px 26px rgba(0, 0, 0, 0.18),
    0 0 0 1px rgba(148, 211, 255, 0.08),
    0 0 18px rgba(41, 151, 255, 0.11);
}

.page-shell {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
  flex-wrap: nowrap;
  position: relative;
  z-index: 20;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-height: 86px;
  height: auto;
  padding: 14px 24px;
  margin-inline: 0;
  margin-bottom: 4px;
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 20px;
  isolation: isolate;
  background:
    linear-gradient(90deg, var(--match-page-shell-side-highlight), transparent 16%, transparent 84%, var(--match-page-shell-side-highlight)),
    linear-gradient(135deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.035)),
    rgba(10, 13, 20, 0.62);
  box-shadow:
    0 10px 26px rgba(0, 0, 0, 0.24),
    0 3px 12px rgba(41, 151, 255, 0.07),
    inset 10px 0 18px var(--match-page-shell-side-shadow),
    inset -10px 0 18px var(--match-page-shell-side-shadow),
    inset 0 1px 0 rgba(255, 255, 255, 0.16);
  transition:
    border-color 0.24s ease,
    box-shadow 0.24s ease,
    background 0.24s ease;
}

.page-shell::after {
  content: '';
  position: absolute;
  inset: 1px;
  z-index: 0;
  border-radius: calc(20px - 1px);
  background:
    linear-gradient(
      112deg,
      transparent 0%,
      rgba(148, 211, 255, 0.1) 18%,
      transparent 36%,
      rgba(41, 151, 255, 0.055) 58%,
      transparent 78%
    );
  background-size: 220% 100%;
  opacity: 0.32;
  pointer-events: none;
}

.page-shell.surface-glow::before {
  z-index: 2;
}

.page-shell:hover,
.page-shell.surface-glow[data-near-glow='true'] {
  border-color: rgba(148, 211, 255, 0.38);
  box-shadow:
    0 14px 32px rgba(0, 0, 0, 0.27),
    0 0 0 1px rgba(148, 211, 255, 0.12),
    0 0 22px rgba(41, 151, 255, 0.14),
    inset 10px 0 18px var(--match-page-shell-side-shadow),
    inset -10px 0 18px var(--match-page-shell-side-shadow),
    inset 0 1px 0 rgba(255, 255, 255, 0.14);
}

.match-history-view[data-variant='lookup'] .page-shell,
.match-history-view[data-variant='lookup'] .history-shell,
.match-history-view[data-variant='lookup'] .state-card {
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  box-shadow: none;
}

.match-history-view[data-variant='lookup'] .page-shell::after {
  display: none;
}

.match-history-view[data-variant='lookup'] .page-shell:hover,
.match-history-view[data-variant='lookup'] .page-shell:focus-within,
.match-history-view[data-variant='lookup'] .history-shell:hover,
.match-history-view[data-variant='lookup'] .history-shell:focus-within,
.match-history-view[data-variant='lookup'] .state-card:hover,
.match-history-view[data-variant='lookup'] .state-card:focus-within {
  border-color: var(--match-module-hover-border);
  box-shadow: var(--match-module-hover-shadow);
}

.match-history-view[data-variant='lookup'] .page-shell.surface-glow[data-near-glow='true']:not(:hover):not(:focus-within),
.match-history-view[data-variant='lookup'] .history-shell.surface-glow[data-near-glow='true']:not(:hover):not(:focus-within),
.match-history-view[data-variant='lookup'] .state-card.surface-glow[data-near-glow='true']:not(:hover):not(:focus-within) {
  border-color: var(--border-color);
  box-shadow: none;
}

.page-title-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 1 1 auto;
  min-width: 0;
  max-width: 100%;
  position: relative;
  z-index: 3;
}

.match-history-view[data-variant='lookup'] .page-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    "title controls"
    "recent recent";
  align-items: center;
  justify-content: stretch;
  gap: 8px 16px;
}

.match-history-view[data-variant='lookup'] .page-title-row {
  grid-area: title;
  justify-content: flex-start;
  flex-wrap: nowrap;
}

.match-history-view[data-variant='lookup'] .page-copy {
  flex: 0 0 auto;
}

.lookup-search {
  --lookup-control-height: 38px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
}

.recent-lookup-strip {
  grid-area: recent;
  display: flex;
  align-items: center;
  width: 100%;
  flex: 0 1 auto;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
  margin-top: -1px;
  overflow-x: auto;
  scrollbar-width: none;
}

.recent-lookup-strip::-webkit-scrollbar {
  display: none;
}

.recent-lookup-chip {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: 0 0 auto;
  max-width: 178px;
  min-height: 30px;
  padding: 4px 9px 4px 5px;
  border: 1px solid var(--match-control-border);
  border-radius: 999px;
  background: var(--match-control-bg);
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.24s ease;
}

.recent-lookup-chip:hover,
.recent-lookup-chip:focus-visible,
.recent-lookup-chip.active {
  border-color: var(--match-control-border-hover);
  background: var(--match-control-bg-hover-local);
  color: var(--text-primary);
  box-shadow:
    var(--match-control-hover-shadow),
    var(--match-control-edge-shadow);
  outline: none;
}

.recent-lookup-avatar {
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
  border-radius: 50%;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.1);
}

.recent-lookup-avatar[data-asset-failed='true'] {
  display: none;
}

.recent-lookup-avatar-fallback {
  display: inline-block;
}

.recent-lookup-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
}

.lookup-search-input-wrap {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  flex: 0 1 auto;
  min-width: 180px;
  max-width: min(420px, 52vw);
  height: var(--lookup-control-height);
  min-height: var(--lookup-control-height);
  border: 1px solid var(--match-control-border);
  border-radius: var(--match-control-radius);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02)),
    var(--match-control-bg);
  color: var(--match-control-text);
  box-shadow:
    var(--match-control-shadow),
    inset 0 1px 0 rgba(255, 255, 255, 0.07);
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.24s ease,
    color 0.18s ease;
}

.lookup-search-input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 100%;
  padding: 9px 12px;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.1;
  outline: none;
}

.lookup-search-icon-btn {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 var(--lookup-control-height);
  width: var(--lookup-control-height);
  min-width: var(--lookup-control-height);
  height: var(--lookup-control-height);
  min-height: var(--lookup-control-height);
  padding: 0;
  border: 1px solid rgba(92, 163, 234, 0);
  border-radius: 10px;
  background: transparent;
  color: #fff;
  box-shadow: none;
  line-height: 1.1;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    color 0.18s ease,
    opacity 0.15s ease,
    box-shadow 0.24s ease;
}

.lookup-search-icon {
  width: 23px;
  height: 23px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.45;
  filter: drop-shadow(0 0 5px rgba(92, 163, 234, 0.18));
}

.lookup-search-icon-btn:hover,
.lookup-search-icon-btn:focus-visible {
  border-color: var(--match-control-border-hover);
  background: var(--match-control-bg-hover-local);
  color: #fff;
  box-shadow:
    var(--match-control-hover-shadow),
    var(--match-control-edge-shadow);
  outline: none;
}

.lookup-search-icon-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.lookup-search-input-wrap:hover,
.lookup-search-input-wrap:focus-within {
  border-color: var(--match-control-border-hover);
  background: var(--match-control-bg-hover-local);
  box-shadow:
    var(--match-control-hover-shadow),
    var(--match-control-edge-shadow),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
  outline: none;
}

.lookup-search-input-wrap:focus-within,
.lookup-search-input-wrap:active {
  border-color: var(--match-control-border-hover);
  background: var(--match-control-bg-active-local);
  color: var(--match-control-active-text);
  box-shadow:
    var(--match-control-active-shadow),
    var(--match-control-edge-shadow),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
  outline: none;
}

.lookup-search-input-wrap.control-glow[data-near-glow='true']:not(:hover):not(:focus-within) {
  border-color: var(--match-control-border);
  box-shadow:
    var(--match-control-edge-shadow),
    inset 0 1px 0 rgba(255, 255, 255, 0.09);
}

.lookup-search-icon-btn.control-glow[data-near-glow='true']:not(:hover):not(:focus) {
  border-color: rgba(92, 163, 234, 0);
  box-shadow: var(--match-control-edge-shadow);
}

.page-copy {
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  min-height: 38px;
  min-width: 0;
  overflow: hidden;
  position: relative;
  z-index: 3;
}

.page-copy h1 {
  margin: 0;
  color: var(--text-primary);
  font-size: clamp(24px, 2vw, 30px);
  line-height: 1.05;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.state-card span {
  margin: 6px 0 0;
  color: var(--text-secondary);
}

.page-actions {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  position: relative;
  z-index: 1;
}

.page-controls {
  width: auto;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-left: auto;
  flex: 0 0 auto;
  flex-wrap: wrap;
  position: relative;
  z-index: 3;
}

.match-history-view[data-variant='lookup'] .page-controls {
  grid-area: controls;
  width: auto;
  flex: 0 0 auto;
  flex-wrap: nowrap;
  align-self: center;
}

.filter-control {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  min-height: 38px;
  border: 1px solid var(--match-control-border);
  border-radius: var(--match-control-radius);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02)),
    var(--match-control-bg);
  color: var(--match-control-text);
  box-shadow:
    var(--match-control-shadow),
    inset 0 1px 0 rgba(255, 255, 255, 0.07);
  cursor: pointer;
}

.filter-select {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-height: 36px;
  padding: 0 11px;
  border: 0;
  background: transparent;
  color: inherit;
  color-scheme: dark;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.1;
  cursor: pointer;
  outline: none;
}

.filter-select option {
  background: #101722;
  color: #f8fbff;
}

.champion-filter-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  white-space: nowrap;
  appearance: none;
}

.champion-filter-current,
.champion-option-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.champion-option-count {
  flex: 0 0 auto;
  color: #4aa3ff;
  font-variant-numeric: tabular-nums;
}

.champion-option-unit {
  flex: 0 0 auto;
  color: var(--match-control-muted);
}

.champion-filter-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: -1px;
  left: -1px;
  z-index: 60;
  box-sizing: border-box;
  width: auto;
  max-height: 284px;
  padding: 6px;
  overflow: hidden;
  border: 1px solid var(--match-control-border-hover);
  border-radius: 10px;
  background: rgba(13, 17, 24, 0.98);
  box-shadow: 0 18px 34px rgba(0, 0, 0, 0.38), 0 0 0 1px rgba(41, 151, 255, 0.1);
}

.champion-filter-scroll {
  max-height: 272px;
  overflow-x: hidden;
  overflow-y: auto;
  border-radius: 7px;
  scrollbar-gutter: stable;
}

.champion-filter-option {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  min-height: 30px;
  gap: 4px;
  padding: 0 9px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.1;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.champion-filter-option:hover,
.champion-filter-option:focus-visible,
.champion-filter-option.active {
  background: rgba(41, 151, 255, 0.16);
  outline: none;
}

.control-glow {
  --control-glow-x: 50%;
  --control-glow-y: 50%;
  --control-edge-width: 1px;
  --control-edge-offset: -1px;
  --edge-glow-size: 82px;
  --edge-top-alpha: 0;
  --edge-right-alpha: 0;
  --edge-bottom-alpha: 0;
  --edge-left-alpha: 0;
  position: relative;
  isolation: isolate;
  overflow: visible;
}

.surface-glow {
  --control-glow-x: 50%;
  --control-glow-y: 50%;
  --control-edge-width: 1px;
  --control-edge-offset: -1px;
  --edge-glow-size: 220px;
  --edge-top-alpha: 0;
  --edge-right-alpha: 0;
  --edge-bottom-alpha: 0;
  --edge-left-alpha: 0;
  position: relative;
  isolation: isolate;
  overflow: visible;
}

.control-glow::before,
.surface-glow::before {
  content: '';
  position: absolute;
  inset: var(--control-edge-offset);
  border-radius: inherit;
  background: radial-gradient(
    circle var(--edge-glow-size) at calc(var(--control-glow-x) + 1px) calc(var(--control-glow-y) + 1px),
    var(--match-control-border-local-glow) 0%,
    var(--match-control-border-local-glow-fade) 42%,
    transparent 78%
  );
  padding: var(--control-edge-width);
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.14s ease;
}

.control-glow:hover::before,
.control-glow:focus-within::before,
.control-glow:focus-visible::before,
.control-glow[data-near-glow='true']::before,
.surface-glow:hover::before,
.surface-glow:focus-visible::before,
.surface-glow[data-near-glow='true']::before {
  opacity: 1;
}

.control-glow:active:not(:disabled)::before,
.surface-glow:active::before {
  opacity: 0.55;
}

.filter-control {
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.24s ease,
    color 0.18s ease;
}

.filter-control:hover,
.filter-control:focus-within {
  border-color: var(--match-control-border-hover);
  background: var(--match-control-bg-hover-local);
  box-shadow:
    var(--match-control-hover-shadow),
    var(--match-control-edge-shadow),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
  outline: none;
}

.filter-control:focus-within,
.filter-control:active {
  border-color: var(--match-control-border-hover);
  background: var(--match-control-bg-active-local);
  color: var(--match-control-active-text);
  box-shadow:
    var(--match-control-active-shadow),
    var(--match-control-edge-shadow),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
  outline: none;
}

.filter-control.control-glow[data-near-glow='true']:not(:hover):not(:focus-within) {
  border-color: var(--match-control-border);
  box-shadow:
    var(--match-control-edge-shadow),
    inset 0 1px 0 rgba(255, 255, 255, 0.09);
}

.content-stack {
  min-width: 0;
}

.history-shell {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  max-width: 100%;
}

.overview-embed {
  margin-bottom: 2px;
}

.filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
  min-width: 0;
  flex: 0 1 auto;
}

.match-history-view[data-variant='lookup'] .filters {
  flex-wrap: nowrap;
}

.filter-control {
  box-sizing: border-box;
  width: 108px;
  min-width: 108px;
  max-width: 108px;
}

.champion-select-control {
  width: 148px;
  min-width: 148px;
  max-width: 148px;
}

.state-card {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.state-card.inner {
  background: var(--bg-tertiary);
}

.state-card.lookup-state {
  border-color: rgba(196, 92, 92, 0.4);
}

.lcu-disconnected-state {
  align-items: flex-start;
  justify-content: center;
  min-height: 112px;
}

.lcu-disconnected-title {
  font-size: clamp(22px, 2vw, 30px);
  font-weight: 800;
  line-height: 1.08;
}

.state-card strong {
  color: var(--text-primary);
}

.match-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  max-width: 100%;
}

.match-list-item {
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-width: 100%;
}

.refresh-cache-notice {
  padding: 8px 10px;
  border: 1px solid rgba(240, 196, 79, 0.22);
  border-radius: 8px;
  background: rgba(240, 196, 79, 0.08);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.match-list-sentinel {
  width: 100%;
  height: 1px;
  margin-top: -1px;
}

.match-list-footer {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 34px;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
}

.load-more-button,
.load-more-retry {
  cursor: pointer;
}

.load-more-button:hover,
.load-more-button:focus-visible,
.load-more-retry:hover,
.load-more-retry:focus-visible {
  border-color: var(--match-control-border-hover);
  color: var(--text-primary);
  outline: none;
}

.load-more-retry {
  min-height: 26px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 800;
}

.match-list-footer-error {
  border-color: rgba(196, 92, 92, 0.3);
  color: var(--text-primary);
}

@media (prefers-reduced-motion: reduce) {
  .page-shell,
  .filter-control {
    transition-duration: 0.01ms;
  }
}

@media (max-width: 820px) {
  .page-shell {
    gap: 10px;
    padding-inline: 14px;
  }

  .page-controls {
    justify-content: flex-end;
    gap: 6px;
  }

  .lookup-search {
    max-width: none;
    min-width: 0;
  }

  .filters {
    gap: 6px;
  }

  .filter-control,
  .page-actions {
    flex: 0 0 auto;
  }

  .filter-control {
    width: 108px;
    min-width: 108px;
    max-width: 108px;
  }

  .champion-select-control {
    width: 148px;
    min-width: 148px;
    max-width: 148px;
  }

}

@media (max-width: 760px) {
  .page-shell {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .page-controls,
  .match-history-view[data-variant='lookup'] .page-controls {
    width: 100%;
    margin-left: 0;
    justify-content: flex-start;
    flex: 0 1 auto;
  }

  .match-history-view[data-variant='lookup'] .page-title-row {
    width: 100%;
  }
}

@media (max-width: 520px) {
  .match-history-view[data-variant='lookup'] .page-shell {
    align-items: stretch;
  }

  .match-history-view[data-variant='lookup'] .page-title-row {
    align-items: center;
    display: flex;
  }

  .lookup-search {
    width: auto;
  }

  .match-history-view[data-variant='lookup'] .page-controls {
    justify-content: flex-start;
    overflow-x: auto;
    padding-bottom: 2px;
  }
}

@media (max-width: 430px) {
  .lookup-search {
    display: flex;
    align-items: center;
  }

  .lookup-search-icon-btn {
    width: 38px;
  }
}
</style>
