<template>
  <div class="opgg-window-view">
    <section class="opgg-toolbar">
      <div class="opgg-heading">
        <h1>
          <button
            class="opgg-brand-link"
            type="button"
            aria-label="打开 OP.GG 官网"
            title="打开 OP.GG 官网"
            @click="openOfficialOpggPage"
          >
            OP.GG
          </button>
        </h1>
        <button
          v-if="activePanel === 'detail'"
          class="opgg-toolbar-back-btn"
          type="button"
          @click="showListPanel"
        >
          返回榜单
        </button>
      </div>

      <div class="opgg-filter-row">
        <input
          v-model="championSearch"
          class="opgg-filter-input"
          type="search"
          aria-label="搜索英雄"
          placeholder="搜索英雄（支持外号、昵称）"
          @input="handleSearchInput"
        />
        <select
          v-model.number="filter.championId"
          class="opgg-filter-select"
          aria-label="英雄"
          @change="handleChampionSelectChange"
        >
          <option :value="0">榜单</option>
          <option
            v-for="champion in filteredChampionOptions"
            :key="champion.value"
            :value="champion.value"
          >
            {{ champion.label }}
          </option>
        </select>
        <select
          v-model="filter.mode"
          class="opgg-filter-select"
          aria-label="模式"
          @change="handleModeFilterChange"
        >
          <option v-for="mode in modeOptions" :key="mode.value" :value="mode.value">
            {{ mode.label }}
          </option>
        </select>
        <select
          v-model="filter.tier"
          class="opgg-filter-select"
          aria-label="段位"
          :disabled="filter.mode !== 'ranked'"
          @change="handleRankFilterChange"
        >
          <option v-for="tier in tierOptions" :key="tier.value" :value="tier.value">
            {{ tier.label }}
          </option>
        </select>
        <select
          v-model="filter.position"
          class="opgg-filter-select"
          aria-label="分路"
          :disabled="filter.mode !== 'ranked'"
          @change="handleRankFilterChange"
        >
          <option v-for="position in positionOptions" :key="position.value" :value="position.value">
            {{ position.label }}
          </option>
        </select>
      </div>

      <div class="opgg-toolbar-actions">
        <button
          class="opgg-follow-btn"
          type="button"
          :class="{ active: followCurrentGame }"
          @click="restoreFollowCurrentGame"
        >
          跟随当前对局
        </button>
        <button class="opgg-refresh-btn" type="button" :disabled="activeLoading" @click="refreshActiveOpggPanel">
          刷新
        </button>
      </div>
    </section>

    <OpggChampionTierTable
      v-if="activePanel === 'list'"
      class="opgg-window-panel"
      :list="opggList"
      :selected-position="filter.mode === 'ranked' ? filter.position : 'none'"
      :champion-options="championOptions"
      :search-text="championSearch"
      :loading="opggListLoading"
      :error="opggListError"
      @select-champion="showChampionDetail"
    />

    <section v-else class="opgg-detail-shell">
      <OpggChampionPanel
        class="opgg-window-panel"
        :query="panelQuery"
        :title="activeChampionTitle"
        :detail="opggDetail"
        :counters="activeDetailCounters"
        :loading="opggLoading"
        :error="opggError"
        :empty-title="emptyTitle"
        :empty-description="emptyDescription"
        @retry="loadOpggDetail"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { apiClient } from '@/api/httpClient'
import { getGamingSessionData } from '@/api/sessionDataAdapter'
import OpggChampionPanel from '@/components/gaming/OpggChampionPanel.vue'
import OpggChampionTierTable from '@/components/gaming/OpggChampionTierTable.vue'
import { useGameStore } from '@/stores/game'
import {
  DEFAULT_OPGG_POSITION,
  resolveDefaultOpggPosition,
  resolveDefaultOpggTier,
  type OpggRankedPosition
} from '@/services/opggDefaultFilters.ts'
import { buildOpggChampionQuery, type OpggChampionQuery } from '@/services/opggChampionQuery'
import {
  getOpggChampionDetail,
  getOpggChampionList,
  type OpggChampionDetail,
  type OpggChampionList,
  type OpggChampionPositionStats
} from '@/services/rankpeekDataClient.ts'
import type { ChampionOption, SessionData, Summoner } from '@/types/api'
import { championOptionMatchesSearch } from '@/utils/championSearchAliases'

type OpggMode = 'ranked' | 'aram' | 'arena' | 'urf' | 'nexus_blitz'
type OpggRegion = 'kr'
type OpggPanel = 'list' | 'detail'
type OpggAutoApplyTrigger = 'initial' | 'champion-change'

const OFFICIAL_OPGG_CHAMPIONS_URL = 'https://op.gg/lol/champions'

export interface OpggManualFilterState {
  championId: number
  mode: OpggMode
  region: OpggRegion
  tier: string
  position: string
}

export interface OpggFollowModeState {
  followCurrentGame: boolean
  lastAutoQuery: OpggChampionQuery | null
}

const modeOptions: Array<{ value: OpggMode; label: string }> = [
  { value: 'ranked', label: '排位' },
  { value: 'aram', label: '大乱斗' },
  { value: 'arena', label: '斗魂竞技场' },
  { value: 'urf', label: '无限火力' },
  { value: 'nexus_blitz', label: '极限闪击' }
]

const tierOptions = [
  { value: 'all', label: '全部段位' },
  { value: 'ibsg', label: '铁铜银+' },
  { value: 'gold_plus', label: '黄金+' },
  { value: 'platinum_plus', label: '铂金+' },
  { value: 'emerald_plus', label: '翡翠+' },
  { value: 'diamond_plus', label: '钻石+' },
  { value: 'master', label: '大师' },
  { value: 'master_plus', label: '大师+' },
  { value: 'grandmaster', label: '宗师' },
  { value: 'challenger', label: '王者' }
]

const positionOptions = [
  { value: 'none', label: '全部分路' },
  { value: 'top', label: '上路' },
  { value: 'jungle', label: '打野' },
  { value: 'mid', label: '中路' },
  { value: 'adc', label: '下路' },
  { value: 'support', label: '辅助' }
]

const filter = reactive<OpggManualFilterState>({
  championId: 0,
  mode: 'ranked',
  region: 'kr',
  tier: 'all',
  position: 'none'
})
const gameStore = useGameStore()
const followState = reactive<OpggFollowModeState>({
  followCurrentGame: true,
  lastAutoQuery: null
})
const followCurrentGame = ref(true)
const defaultRankedTier = ref('all')
const defaultRankedPosition = ref<OpggRankedPosition>(DEFAULT_OPGG_POSITION)
const defaultPositionLoading = ref(false)
const activePanel = ref<OpggPanel>('list')
const championOptions = ref<ChampionOption[]>([])
const championSearch = ref('')
const championOptionsError = ref('')
const opggList = ref<OpggChampionList | null>(null)
const opggListLoading = ref(false)
const opggListError = ref('')
const opggDetail = ref<OpggChampionDetail | null>(null)
const opggLoading = ref(false)
const opggError = ref('')
const lastListRequestKey = ref('')
const lastDetailRequestKey = ref('')
let pollTimer: ReturnType<typeof setInterval> | null = null
let removeInitialQueryListener: (() => void) | null = null
let applyingAutoFilter = false
let defaultPositionPuuid = ''
let defaultPositionRequestId = 0
let hasAppliedInitialAutoQuery = false
let hasAppliedInitialDefaultTier = false
let hasAppliedInitialDefaultPosition = false
let lastSeenAutoChampionId: number | null = null

const filteredChampionOptions = computed(() => {
  const keyword = championSearch.value.trim().toLowerCase()
  if (!keyword) {
    return championOptions.value
  }

  return championOptions.value.filter(champion => championOptionMatchesSearch(champion, keyword))
})

const activeChampionTitle = computed(() => {
  if (!filter.championId) return ''
  const selectedChampion = championOptions.value.find(champion => champion.value === filter.championId)
  return selectedChampion?.label?.trim() || opggDetail.value?.championName?.trim() || ''
})

const panelQuery = computed<OpggChampionQuery>(() => ({
  enabled: canLoadDetail(filter),
  reason: readinessReason.value,
  championId: filter.championId || null,
  mode: filter.mode,
  region: filter.region,
  tier: filter.mode === 'ranked' ? filter.tier : 'all',
  position: filter.mode === 'ranked' ? filter.position : 'none',
  filterLabel: buildFilterLabel(filter)
}))

const readinessReason = computed(() => {
  if (!filter.championId) return '从榜单选择英雄'
  if (filter.mode === 'ranked' && filter.tier === 'all') return '排位英雄详情需要选择段位'
  if (filter.mode === 'ranked' && filter.position === 'none') return '排位英雄详情需要选择分路'
  return ''
})

const activeLoading = computed(() => activePanel.value === 'detail' ? opggLoading.value : opggListLoading.value)
const emptyTitle = computed(() => readinessReason.value || '暂无数据')
const emptyDescription = computed(() => {
  if (followCurrentGame.value && followState.lastAutoQuery?.reason) {
    return followState.lastAutoQuery.reason
  }
  return panelQuery.value.filterLabel || '选中英雄后会读取当前筛选条件的数据。'
})

const selectedDetailPositionStats = computed<OpggChampionPositionStats | null>(() => {
  if (filter.mode !== 'ranked' || filter.position === 'none' || !filter.championId) {
    return null
  }
  const item = opggList.value?.items.find(entry => entry.championId === filter.championId)
  return item?.positions.find(position => position.position === filter.position) || null
})

const activeDetailCounters = computed(() => {
  return (selectedDetailPositionStats.value?.counters || []).slice(0, 3)
})

onMounted(() => {
  void loadChampionOptions()
  void refreshDefaultRankedFilters()
  void loadOpggChampionList()
  removeInitialQueryListener = window.electronAPI?.onOpggInitialQuery?.((query) => {
    handleInitialQuery(query)
  }) || null
  void refreshCurrentGameQuery({ apply: 'initial' })
  pollTimer = setInterval(() => {
    void refreshCurrentGameQuery({ apply: 'champion-change' })
  }, 4000)
})

watch(() => gameStore.currentRank, () => {
  void refreshDefaultRankedFilters()
})

watch(() => gameStore.currentSummoner?.puuid, () => {
  void refreshDefaultRankedFilters()
})

onBeforeUnmount(() => {
  removeInitialQueryListener?.()
  removeInitialQueryListener = null
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})

async function loadChampionOptions() {
  try {
    championOptions.value = await apiClient.getChampionOptions()
    championOptionsError.value = ''
  } catch (error) {
    championOptionsError.value = error instanceof Error && error.message ? error.message : '英雄列表读取失败'
  }
}

async function refreshDefaultRankedFilters(options: {
  sessionData?: SessionData
  query?: OpggChampionQuery
} = {}) {
  let shouldRefreshList = false
  const hasKnownAccount = Boolean(gameStore.currentSummoner?.puuid || options.sessionData?.currentSummoner?.puuid)
  const nextTier = resolveDefaultOpggTier({
    currentRank: gameStore.currentRank,
    sessionQueueId: options.sessionData?.queueId,
    sessionQueueType: options.sessionData?.queueType
  })
  const queryTier = readQueryRankedTier(options.query)
  if (nextTier !== 'all') {
    defaultRankedTier.value = nextTier
  } else if (queryTier !== 'all') {
    defaultRankedTier.value = queryTier
  } else if (!hasKnownAccount) {
    defaultRankedTier.value = 'all'
  }

  const canApplyInitialDefaultTier = followCurrentGame.value && !hasAppliedInitialDefaultTier
  if (
    canApplyInitialDefaultTier &&
    filter.mode === 'ranked' &&
    filter.tier === 'all' &&
    defaultRankedTier.value !== 'all'
  ) {
    filter.tier = defaultRankedTier.value
    hasAppliedInitialDefaultTier = true
    shouldRefreshList = activePanel.value === 'list'
  } else if (canApplyInitialDefaultTier && !hasKnownAccount && filter.mode === 'ranked' && filter.tier !== 'all') {
    filter.tier = 'all'
    hasAppliedInitialDefaultTier = true
    shouldRefreshList = activePanel.value === 'list'
  }

  const summoner = resolveDefaultPositionSummoner(options.sessionData)
  const puuid = normalizePuuid(summoner?.puuid)
  if (!puuid || puuid === defaultPositionPuuid) {
    if (shouldRefreshList) {
      void loadOpggChampionList()
    }
    return
  }

  defaultPositionPuuid = puuid
  const requestId = ++defaultPositionRequestId
  defaultPositionLoading.value = true
  try {
    const position = await resolveDefaultOpggPosition({
      summoner,
      puuid,
      api: apiClient,
      database: window.electronAPI?.database ?? null
    })
    if (requestId !== defaultPositionRequestId) {
      return
    }

    defaultRankedPosition.value = position
    const canApplyInitialDefaultPosition = followCurrentGame.value && !hasAppliedInitialDefaultPosition
    if (
      canApplyInitialDefaultPosition &&
      filter.mode === 'ranked' &&
      filter.position === 'none'
    ) {
      filter.position = position
      hasAppliedInitialDefaultPosition = true
    }
  } finally {
    if (requestId === defaultPositionRequestId) {
      defaultPositionLoading.value = false
    }
  }

  if (shouldRefreshList) {
    void loadOpggChampionList()
  }
}

async function refreshCurrentGameQuery(options: { apply?: OpggAutoApplyTrigger } = {}) {
  try {
    const sessionData = await getGamingSessionData({ forceRefresh: false })
    const query = buildOpggChampionQuery(sessionData)
    followState.lastAutoQuery = query
    void refreshDefaultRankedFilters({ sessionData, query })
    applyCurrentGameQueryForTrigger(query, options.apply)
  } catch {
    // OP.GG 窗口不能因为对战信息暂时不可用而打断手动筛选。
  }
}

function handleInitialQuery(query: OpggChampionQuery) {
  followState.lastAutoQuery = query
  void refreshDefaultRankedFilters({ query })
  applyCurrentGameQueryForTrigger(query, 'initial')
}

function applyCurrentGameQueryForTrigger(query: OpggChampionQuery, trigger?: OpggAutoApplyTrigger) {
  if (!followCurrentGame.value || !trigger) {
    return
  }

  if (trigger === 'initial') {
    if (hasAppliedInitialAutoQuery) {
      return
    }
    hasAppliedInitialAutoQuery = true
    lastSeenAutoChampionId = readAutoChampionId(query)
    applyCurrentGameQuery(query)
    return
  }

  const championId = readAutoChampionId(query)
  if (!championId || championId === lastSeenAutoChampionId) {
    return
  }
  lastSeenAutoChampionId = championId
  applyCurrentGameQuery(query)
}

function applyCurrentGameQuery(query: OpggChampionQuery) {
  lastSeenAutoChampionId = readAutoChampionId(query)
  applyingAutoFilter = true
  filter.championId = query.championId || 0
  filter.mode = normalizeMode(query.mode)
  filter.region = 'kr'
  filter.tier = filter.mode === 'ranked' ? resolveRankedTier(query.tier) : 'all'
  filter.position = filter.mode === 'ranked' ? resolveRankedPosition(query.position) : 'none'
  applyingAutoFilter = false

  if (canLoadDetail(filter)) {
    activePanel.value = 'detail'
    void loadOpggDetail()
    return
  }

  activePanel.value = 'list'
  void loadOpggChampionList()
}

function handleSearchInput() {
  if (applyingAutoFilter) {
    return
  }
  followCurrentGame.value = false
  followState.followCurrentGame = false
  activePanel.value = 'list'
}

function handleChampionSelectChange() {
  if (applyingAutoFilter) {
    return
  }
  followCurrentGame.value = false
  followState.followCurrentGame = false
  normalizeManualFilter()
  if (filter.championId) {
    showChampionDetail(filter.championId)
    return
  }
  activePanel.value = 'list'
  void loadOpggChampionList()
}

function handleModeFilterChange() {
  if (applyingAutoFilter) {
    return
  }

  followCurrentGame.value = false
  followState.followCurrentGame = false
  normalizeManualFilter()
  if (filter.mode === 'ranked') {
    applyRankedDefaultsForDetail()
  }

  if (filter.championId) {
    activePanel.value = 'detail'
    void loadOpggDetail()
    return
  }

  activePanel.value = 'list'
  void loadOpggChampionList()
}

function handleRankFilterChange() {
  if (applyingAutoFilter) {
    return
  }

  followCurrentGame.value = false
  followState.followCurrentGame = false
  normalizeManualFilter()

  if (filter.championId) {
    activePanel.value = 'detail'
    void loadOpggDetail()
    return
  }

  activePanel.value = 'list'
  void loadOpggChampionList()
}

function restoreFollowCurrentGame() {
  followCurrentGame.value = true
  followState.followCurrentGame = true
  if (followState.lastAutoQuery) {
    hasAppliedInitialAutoQuery = true
    lastSeenAutoChampionId = readAutoChampionId(followState.lastAutoQuery)
    applyCurrentGameQuery(followState.lastAutoQuery)
    return
  }
  void refreshCurrentGameQuery({ apply: 'initial' })
}

function normalizeManualFilter() {
  if (filter.mode !== 'ranked') {
    filter.tier = 'all'
    filter.position = 'none'
  }
}

function applyRankedDefaultsForDetail() {
  if (filter.mode !== 'ranked') {
    return
  }
  if (filter.tier === 'all') {
    filter.tier = defaultRankedTier.value
  }
  if (filter.position === 'none') {
    filter.position = defaultRankedPosition.value
  }
}

function applyRankedDefaultsForList() {
  if (filter.mode !== 'ranked') {
    return
  }
  if (defaultRankedTier.value !== 'all') {
    filter.tier = defaultRankedTier.value
  }
  filter.position = defaultRankedPosition.value
}

function resolveRankedTier(value: unknown) {
  const tier = typeof value === 'string' ? value.trim() : ''
  return tier && tier !== 'all' ? tier : defaultRankedTier.value
}

function readQueryRankedTier(query?: OpggChampionQuery) {
  const tier = typeof query?.tier === 'string' ? query.tier.trim() : ''
  return tier && tier !== 'all' ? tier : 'all'
}

function resolveRankedPosition(value: unknown): OpggRankedPosition | 'none' {
  const position = typeof value === 'string' ? value.trim() : ''
  if (isOpggRankedPosition(position)) {
    return position
  }
  return defaultRankedPosition.value
}

function isOpggRankedPosition(value: string): value is OpggRankedPosition {
  return ['top', 'jungle', 'mid', 'adc', 'support'].includes(value)
}

function resolveDefaultPositionSummoner(sessionData?: SessionData): Summoner | null {
  return gameStore.currentSummoner || sessionData?.currentSummoner || null
}

function normalizePuuid(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function readAutoChampionId(query: OpggChampionQuery) {
  const championId = Number(query.championId)
  return Number.isFinite(championId) && championId > 0 ? championId : null
}

function showChampionDetail(championId: number) {
  if (!applyingAutoFilter) {
    followCurrentGame.value = false
    followState.followCurrentGame = false
  }
  filter.championId = championId
  applyRankedDefaultsForDetail()
  activePanel.value = 'detail'
  void loadOpggDetail()
}

function showListPanel() {
  activePanel.value = 'list'
  filter.championId = 0
  applyRankedDefaultsForList()
  void loadOpggChampionList()
}

function refreshActiveOpggPanel() {
  if (activePanel.value === 'detail') {
    void loadOpggDetail({ force: true })
    return
  }
  void loadOpggChampionList({ force: true })
}

async function openOfficialOpggPage() {
  try {
    const result = await window.electronAPI?.openExternal?.(OFFICIAL_OPGG_CHAMPIONS_URL)
    if (result?.success) {
      return
    }
  } catch (error) {
    console.error('Failed to open OP.GG page', error)
  }
  window.open(OFFICIAL_OPGG_CHAMPIONS_URL, '_blank', 'noopener,noreferrer')
}

async function loadOpggChampionList(options: { force?: boolean } = {}) {
  opggListError.value = ''
  if (!canLoadList(filter)) {
    opggList.value = null
    opggListLoading.value = false
    return
  }

  const requestKey = buildListRequestKey(filter)
  if (!options.force && requestKey === lastListRequestKey.value && opggList.value) {
    return
  }

  lastListRequestKey.value = requestKey
  opggListLoading.value = true
  try {
    opggList.value = await getOpggChampionList({
      mode: filter.mode,
      region: filter.region,
      tier: filter.mode === 'ranked' ? filter.tier : 'all'
    })
  } catch (error) {
    opggList.value = null
    opggListError.value = error instanceof Error && error.message ? error.message : 'OP.GG 榜单读取失败'
  } finally {
    opggListLoading.value = false
  }
}

async function loadOpggDetail(options: { force?: boolean } = {}) {
  opggError.value = ''
  if (!canLoadDetail(filter)) {
    opggDetail.value = null
    opggLoading.value = false
    return
  }

  const requestKey = buildDetailRequestKey(filter)
  if (!options.force && requestKey === lastDetailRequestKey.value && opggDetail.value) {
    return
  }

  lastDetailRequestKey.value = requestKey
  opggLoading.value = true
  try {
    opggDetail.value = await getOpggChampionDetail({
      championId: filter.championId,
      mode: filter.mode,
      region: filter.region,
      tier: filter.mode === 'ranked' ? filter.tier : 'all',
      position: filter.mode === 'ranked' ? filter.position : 'none'
    })
  } catch (error) {
    opggDetail.value = null
    opggError.value = error instanceof Error && error.message ? error.message : 'OP.GG 数据读取失败'
  } finally {
    opggLoading.value = false
  }
}

function canLoadList(filterState: OpggManualFilterState) {
  return Boolean(filterState.mode && filterState.region)
}

function canLoadDetail(filterState: OpggManualFilterState) {
  if (!filterState.championId) {
    return false
  }
  if (filterState.mode === 'ranked') {
    return Boolean(filterState.tier && filterState.tier !== 'all' && filterState.position && filterState.position !== 'none')
  }
  return Boolean(filterState.mode && filterState.region)
}

function buildListRequestKey(filterState: OpggManualFilterState) {
  return [
    filterState.mode,
    filterState.region,
    filterState.mode === 'ranked' ? filterState.tier : 'all'
  ].join(':')
}

function buildDetailRequestKey(filterState: OpggManualFilterState) {
  return [
    filterState.championId,
    filterState.mode,
    filterState.region,
    filterState.mode === 'ranked' ? filterState.tier : 'all',
    filterState.mode === 'ranked' ? filterState.position : 'none'
  ].join(':')
}

function buildFilterLabel(filterState: OpggManualFilterState) {
  const modeLabel = modeOptions.find(option => option.value === filterState.mode)?.label || filterState.mode
  if (filterState.mode !== 'ranked') {
    return `KR · ${modeLabel}`
  }

  const tierLabel = tierOptions.find(option => option.value === filterState.tier)?.label || '全部段位'
  const positionLabel = positionOptions.find(option => option.value === filterState.position)?.label || '全部分路'
  return `KR · ${modeLabel} · ${tierLabel} · ${positionLabel}`
}

function normalizeMode(value: unknown): OpggMode {
  const mode = String(value || '').trim()
  return modeOptions.some(option => option.value === mode) ? mode as OpggMode : 'ranked'
}
</script>

<style scoped>
.opgg-window-view {
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  min-width: 720px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 10px;
  padding: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.opgg-toolbar {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(396px, 1fr) auto;
  align-items: center;
  gap: 6px;
  padding: 6px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
}

.opgg-heading {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.opgg-heading h1 {
  margin: 0;
  font-size: 20px;
  line-height: 1;
}

.opgg-brand-link {
  display: inline-flex;
  align-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-weight: 900;
  letter-spacing: 0;
  cursor: pointer;
  transition: color 0.16s ease, text-shadow 0.16s ease;
}

.opgg-brand-link:hover,
.opgg-brand-link:focus-visible {
  color: #1ea7ff;
  text-shadow: 0 0 10px rgba(30, 167, 255, 0.35);
  outline: none;
}

.opgg-brand-link:focus-visible {
  border-radius: 4px;
  box-shadow: 0 0 0 2px rgba(30, 167, 255, 0.36);
}

.opgg-filter-row {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(96px, 210px) 64px 86px 82px 68px;
  gap: 4px;
  align-items: center;
}

.opgg-filter-input,
.opgg-filter-select {
  width: 100%;
  min-width: 0;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 800;
  outline: none;
}

.opgg-filter-select:disabled {
  opacity: 0.55;
}

.opgg-toolbar-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: nowrap;
  gap: 4px;
}

.opgg-follow-btn,
.opgg-refresh-btn,
.opgg-toolbar-back-btn {
  min-height: 30px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
  cursor: pointer;
}

.opgg-toolbar-back-btn {
  min-height: 30px;
  border-color: rgba(var(--accent-rgb), 0.32);
}

.opgg-follow-btn.active {
  border-color: rgba(var(--accent-rgb), 0.42);
  color: var(--accent-color);
}

.opgg-refresh-btn:disabled {
  cursor: wait;
  opacity: 0.58;
}

.opgg-window-panel {
  min-height: 0;
}

.opgg-detail-shell {
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
}

:global([data-theme="light"] .opgg-window-view .opgg-toolbar),
:global([data-theme="light"] .opgg-window-view .opgg-window-panel) {
  box-shadow: 0 16px 36px rgba(50, 60, 72, 0.08);
}
</style>
