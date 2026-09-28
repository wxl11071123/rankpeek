<template>
  <div class="hextech-view">
    <section class="page-head">
      <div class="head-copy">
        <h1>{{ t('hextech.title') }}</h1>
      </div>
      <div class="head-meta">
        <!-- 数据状态：圆环 + 版本 + 更新时间 + 检查更新（下载中/失败/最新都看这一块） -->
        <span
          v-if="status || dataPackage"
          class="data-ring"
          :class="{ 'is-loading': ringState === 'loading', 'is-error': ringState === 'error' }"
          :title="ringTitle"
        >
          <svg class="ring-svg" viewBox="0 0 36 36" aria-hidden="true">
            <circle class="ring-track" cx="18" cy="18" r="15" />
            <circle
              class="ring-fill"
              cx="18"
              cy="18"
              r="15"
              :style="{ strokeDashoffset: ringState === 'loading' ? '28' : '0' }"
            />
          </svg>
          <span class="ring-glyph">{{ ringState === 'loading' ? '↓' : ringState === 'error' ? '!' : '✓' }}</span>
        </span>
        <span v-if="status || dataPackage" class="meta-item">
          {{ t('hextech.dataVersion') }} <b>{{ dataVersionText }}</b>
        </span>
        <span v-if="status || dataPackage" class="meta-item">
          {{ t('hextech.dataUpdatedAt') }}
          <b>{{ dataPackage?.updatedAt ? new Date(dataPackage.updatedAt).toLocaleString() : '-' }}</b>
        </span>
        <button class="ghost-button" type="button" :disabled="checkingUpdate" @click="reload">
          {{ checkingUpdate ? t('hextech.dataChecking') : t('hextech.checkUpdate') }}
        </button>
      </div>
    </section>

    <!-- 悬浮窗：手动开关 + 「选人与对局中自动弹出」 -->
    <section class="overlay-bar">
      <div class="overlay-copy">
        <b>{{ t('hextech.overlayCardTitle') }}</b>
      </div>
      <div class="overlay-actions">
        <button
          class="overlay-action"
          :class="{ 'overlay-action-on': overlayState.open }"
          type="button"
          @click="toggleOverlayWindow"
        >
          {{ overlayState.open ? t('hextech.overlayClose') : t('hextech.overlayOpen') }}
        </button>
        <button
          class="hextech-switch"
          type="button"
          role="switch"
          :aria-checked="overlayState.autoOpen"
          :class="{ active: overlayState.autoOpen }"
          @click="toggleOverlayAutoOpen"
        >
          <span class="switch-track"><span class="switch-thumb" /></span>
          <span class="switch-label">{{ t('hextech.overlayAutoOpenSwitch') }}</span>
        </button>
      </div>
      <!-- 照参考项目 ARAMGG 的做法，把「独占全屏会挡住浮窗」直接写在开关下面 -->
      <p class="overlay-hint">{{ t('hextech.overlayFullscreenHint') }}</p>
    </section>

    <!-- 匿名数据贡献：未同意时是引导条，已同意时是状态条 -->
    <section v-if="contribution && !contribution.enabled && !contributeBarHidden" class="contribute-bar">
      <p class="contribute-copy">{{ t('hextech.contributeBar') }}</p>
      <div class="contribute-actions">
        <button class="contribute-accept" type="button" @click="openContributeDialog">
          {{ t('hextech.contributeBarAgree') }}
        </button>
        <button class="ghost-button" type="button" @click="hideContributeBar">
          {{ t('hextech.contributeBarNever') }}
        </button>
      </div>
    </section>

    <section v-else-if="contribution && contribution.enabled" class="contribute-bar contribute-bar-active">
      <div class="contribute-copy">
        <p>
          <b>{{ t('hextech.contributeEnabled') }}</b>
          <span v-if="contribution.contributedThisPatch > 0">
            · {{ t('hextech.contributeUploaded', { games: contribution.contributedThisPatch }) }}
          </span>
        </p>
        <p v-if="contribution.lastUploadMessage" class="contribute-sub">
          {{ t('hextech.contributeLastUpload', { message: contribution.lastUploadMessage || '' }) }}
        </p>
        <p v-else-if="contribution.pendingGames === 0" class="contribute-sub">
          {{ t('hextech.contributeNoClient') }}
        </p>
      </div>
      <div class="contribute-actions">
        <button class="ghost-button" type="button" :disabled="savingContribution" @click="disableContribution">
          {{ t('hextech.contributeDisable') }}
        </button>
      </div>
    </section>

    <nav class="tabs" role="tablist">
      <button
        type="button"
        role="tab"
        :aria-selected="tab === 'augments'"
        :class="{ active: tab === 'augments' }"
        @click="switchTab('augments')"
      >
        {{ t('hextech.tabAugments') }}
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="tab === 'champions'"
        :class="{ active: tab === 'champions' }"
        @click="switchTab('champions')"
      >
        {{ t('hextech.tabChampions') }}
      </button>
    </nav>

    <p v-if="error" class="state state-error">{{ t('hextech.error') }}：{{ error }}</p>
    <p v-else-if="loading && !hasData" class="state">{{ t('hextech.loading') }}</p>

    <!-- 强化榜 -->
    <section v-else-if="tab === 'augments'" class="panel">
      <header class="panel-head">
        <div class="panel-tools">
          <input
            v-model="augmentQuery"
            class="search-input"
            type="search"
            :placeholder="t('hextech.searchAugment')"
            :aria-label="t('hextech.searchAugment')"
          />
          <div class="sort-group">
            <button type="button" :class="{ active: sortKey === 'winRate' }" @click="sortKey = 'winRate'">
              {{ t('hextech.sortWinRate') }}
            </button>
            <button type="button" :class="{ active: sortKey === 'pickRate' }" @click="sortKey = 'pickRate'">
              {{ t('hextech.sortPickRate') }}
            </button>
          </div>
        </div>
        <span class="panel-count">{{ filteredAugmentRows.length }} / {{ augmentRows.length }}</span>
      </header>

      <p v-if="!filteredAugmentRows.length" class="board-empty">{{ t('hextech.empty') }}</p>

      <ol v-else class="board">
        <li class="board-head">
          <span class="col-num">{{ t('hextech.colRank') }}</span>
          <span></span>
          <span>{{ t('hextech.colAugment') }}</span>
          <span class="col-num">{{ t('hextech.colWinRate') }}</span>
          <span class="col-num">{{ t('hextech.colPickRate') }}</span>
          <span class="col-num">{{ t('hextech.colChange') }}</span>
          <span>{{ t('hextech.colBestChampions') }}</span>
          <span></span>
        </li>

        <template v-for="(row, index) in filteredAugmentRows" :key="row.augmentId">
          <li
            :id="'hextech-augment-' + row.augmentId"
            class="board-row board-row-clickable"
            :class="{ selected: expandedAugmentId === row.augmentId }"
            role="button"
            tabindex="0"
            @click="toggleAugment(row.augmentId)"
            @keydown.enter="toggleAugment(row.augmentId)"
            @keydown.space.prevent="toggleAugment(row.augmentId)"
          >
            <span class="col-num">{{ index + 1 }}</span>
            <span class="col-icon augment-icon" :class="getAugmentRarityClass(row.rarity)" :title="rarityLabel(row.rarity)">
              <img :src="getAugmentIconUrl(row.augmentId)" :alt="row.name || ''" loading="lazy" @error="hideBrokenIcon" />
            </span>
            <span class="col-name">
              <span class="name-text">{{ row.name || '#' + row.augmentId }}</span>
            </span>
            <span class="col-num">{{ percent(row.winRate) }}</span>
            <span class="col-num">{{ percent(row.pickRate) }}</span>
            <span class="col-delta" :class="deltaClass(row.winRankChange)">{{ deltaText(row.winRankChange) }}</span>
            <span class="col-champs">
              <img
                v-for="championId in row.bestChampionIds.slice(0, 5)"
                :key="championId"
                :src="getChampionIconUrl(championId)"
                :alt="championName(championId)"
                :title="championName(championId)"
                loading="lazy"
              />
            </span>
            <span></span>
          </li>

          <li v-if="expandedAugmentId === row.augmentId" class="board-expand">
            <p v-if="row.description" class="expand-text">{{ row.description }}</p>
            <div class="expand-block">
              <span class="expand-label">{{ t('hextech.colBestChampions') }}</span>
              <div class="expand-champions">
                <span v-for="championId in row.bestChampionIds" :key="championId" class="expand-champion">
                  <img :src="getChampionIconUrl(championId)" :alt="championName(championId)" loading="lazy" />
                  <span>{{ championName(championId) }}</span>
                </span>
              </div>
            </div>
          </li>
        </template>
      </ol>
    </section>

    <!-- 英雄榜 -->
    <section v-else class="panel">
      <header class="panel-head">
        <div class="panel-tools">
          <input
            v-model="championQuery"
            class="search-input"
            type="search"
            :placeholder="t('hextech.searchChampion')"
            :aria-label="t('hextech.searchChampion')"
          />
        </div>
        <span class="panel-count">{{ filteredChampionRows.length }} / {{ championRows.length }}</span>
      </header>

      <p v-if="!filteredChampionRows.length" class="board-empty">{{ t('hextech.empty') }}</p>

      <ol v-else class="board">
        <li class="board-head">
          <span class="col-num">{{ t('hextech.colRank') }}</span>
          <span></span>
          <span>{{ t('hextech.colChampion') }}</span>
          <span class="col-num">{{ t('hextech.colWinRate') }}</span>
          <span class="col-num">{{ t('hextech.colPickRate') }}</span>
          <span class="col-num">{{ t('hextech.colChange') }}</span>
          <span>{{ t('hextech.colTopAugments') }}</span>
          <span></span>
        </li>

        <template v-for="row in championBoardRows" :key="row.championId">
          <li
            :id="'hextech-champion-' + row.championId"
            class="board-row board-row-clickable"
            :class="{ selected: expandedChampionId === row.championId }"
            role="button"
            tabindex="0"
            @click="toggleChampion(row.championId)"
            @keydown.enter="toggleChampion(row.championId)"
            @keydown.space.prevent="toggleChampion(row.championId)"
          >
            <span class="col-num">{{ row.winRank }}</span>
            <img class="col-icon" :src="getChampionIconUrl(row.championId)" :alt="championName(row.championId)" loading="lazy" />
            <span class="col-name">
              <span class="name-text">{{ championName(row.championId) }}</span>
            </span>
            <span class="col-num">{{ percent(row.winRate) }}</span>
            <span class="col-num">{{ percent(row.pickRate) }}</span>
            <span class="col-delta" :class="row.delta.cls">{{ row.delta.text }}</span>
            <span class="col-champs">
              <span
                v-for="augment in row.topAugments"
                :key="augment.augmentId"
                class="augment-chip"
                :class="getAugmentRarityClass(augment.rarity)"
                :title="augmentTitle(augment)"
              >
                <img
                  :src="getAugmentIconUrl(augment.augmentId)"
                  :alt="augment.name || ''"
                  loading="lazy"
                  @error="hideBrokenIcon"
                />
              </span>
            </span>
            <span></span>
          </li>

          <li v-if="expandedChampionId === row.championId" class="board-expand">
            <p v-if="championDetailLoading && !championDetail" class="expand-text">{{ t('hextech.loading') }}</p>
            <p v-else-if="championDetail && !championDetail.augments.length" class="expand-text">
              {{ t('hextech.detailEmpty') }}
            </p>

            <template v-else-if="championDetail">
              <div class="expand-head">
                <span class="expand-label">
                  {{ championName(championDetail.championId) }} · {{ t('hextech.detailAugment') }}
                </span>
                <span class="expand-note">{{ t('hextech.detailWinRateNote') }}</span>
              </div>
              <ol class="detail-list">
                <li class="detail-row detail-row-head">
                  <span class="col-num">{{ t('hextech.colRank') }}</span>
                  <span></span>
                  <span>{{ t('hextech.colTier') }}</span>
                  <span>{{ t('hextech.detailAugment') }}</span>
                  <span class="col-num">{{ t('hextech.colWinRate') }}</span>
                  <span class="col-num">{{ t('hextech.colPickRate') }}</span>
                  <span class="col-num">{{ t('hextech.detailGames') }}</span>
                </li>
                <li v-for="augment in championDetail.augments" :key="augment.augmentId" class="detail-row">
                  <span class="col-num detail-rank">{{ augment.rank || '—' }}</span>
                  <span
                    class="col-icon augment-icon"
                    :class="getAugmentRarityClass(augment.rarity)"
                    :title="rarityLabel(augment.rarity)"
                  >
                    <img :src="getAugmentIconUrl(augment.augmentId)" :alt="augment.name || ''" loading="lazy" @error="hideBrokenIcon" />
                  </span>
                  <span class="detail-tier">{{ tierLabel(augment.tier) }}</span>
                  <span class="name-text">{{ augment.name || '#' + augment.augmentId }}</span>
                  <span class="col-num">{{ formatRate(augment.winRate) }}</span>
                  <span class="col-num">{{ formatRate(augment.pickRate) }}</span>
                  <span class="col-num detail-games">{{ formatGames(augment.numGames) }}</span>
                </li>
              </ol>
            </template>
          </li>
        </template>
      </ol>
    </section>

    <!-- 首次进入海斗页时的同意弹窗（拒绝后不再自动弹出） -->
    <div v-if="contributeDialogOpen" class="dialog-backdrop" @click.self="closeContributeDialog">
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="hextech-contribute-title">
        <h2 id="hextech-contribute-title">{{ t('hextech.contributeTitle') }}</h2>
        <p class="dialog-intro">{{ t('hextech.contributeIntro') }}</p>

        <div class="dialog-columns">
          <div>
            <h3>{{ t('hextech.contributeFieldsTitle') }}</h3>
            <ul class="field-list">
              <li v-for="field in contributionPreview?.fields || []" :key="field">{{ field }}</li>
            </ul>
          </div>
          <div>
            <h3>{{ t('hextech.contributeNeverTitle') }}</h3>
            <ul class="field-list field-list-never">
              <li v-for="field in contributionPreview?.neverUploaded || []" :key="field">{{ field }}</li>
            </ul>
          </div>
        </div>

        <p class="dialog-footer">{{ t('hextech.contributeFooter') }}</p>
        <div class="dialog-actions">
          <button class="ghost-button" type="button" @click="declineContribution">
            {{ t('hextech.contributeDecline') }}
          </button>
          <button class="contribute-accept" type="button" :disabled="savingContribution" @click="acceptContribution">
            {{ t('hextech.contributeAccept') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  isInGamePhase,
  readAutoOpenPreference,
  readAutoOpenPreferenceOrNull,
  writeAutoOpenPreference
} from '@/services/hextechOverlayAutoOpen'
import { useRoute, useRouter } from 'vue-router'
import { apiClient } from '@/api/httpClient'
import { useI18n } from '@/i18n'
import type {
  ChampionOption,
  HextechAugmentBoardRow,
  HextechChampionDetail,
  HextechChampionRank,
  HextechChampionTopAugment,
  HextechContributionPreview,
  HextechContributionStatus,
  HextechDataPackageStatus,
  HextechStatus
} from '@/types/api'
import { championOptionMatchesSearch } from '@/utils/championSearchAliases.ts'
import { getAugmentIconUrl, getAugmentRarityClass, getChampionIconUrl } from '@/utils/gameAssetUrls'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const tab = ref<'augments' | 'champions'>('augments')
const sortKey = ref<'winRate' | 'pickRate'>('winRate')
const status = ref<HextechStatus | null>(null)
const augments = ref<HextechAugmentBoardRow[]>([])
const champions = ref<HextechChampionRank[]>([])
const championOptions = ref<ChampionOption[]>([])
const championNameMap = computed(() => new Map(championOptions.value.map((option) => [Number(option.value), option.label])))
const championOptionMap = computed(() => new Map(championOptions.value.map((option) => [Number(option.value), option])))
const loading = ref(false)
const error = ref('')

// 数据包下载状态（圆环 / 数据版本 / 更新时间 / 检查更新）
const dataPackage = ref<HextechDataPackageStatus | null>(null)
const checkingUpdate = ref(false)

const ringState = computed<'ok' | 'loading' | 'error'>(() => {
  if (checkingUpdate.value) return 'loading'
  const state = dataPackage.value?.state
  if (state === 'checking' || state === 'downloading') return 'loading'
  if (state === 'error' || dataPackage.value?.error) return 'error'
  return 'ok'
})

/** 数据包没拿到时退回 101 的数据日期，避免这一行空着。 */
const dataVersionText = computed(() => dataPackage.value?.dataVersion || status.value?.dataDate || '-')

const ringTitle = computed(() => {
  if (ringState.value === 'error') {
    return `${t('hextech.dataCheckFailed')}：${dataPackage.value?.error || ''}`
  }
  if (dataPackage.value?.state === 'downloading') return t('hextech.dataDownloading')
  if (ringState.value === 'loading') return t('hextech.dataChecking')
  const next = dataPackage.value?.nextCheckAt
  return next ? t('hextech.dataNextCheck', { time: new Date(next).toLocaleString() }) : t('hextech.dataUpToDate')
})

async function loadDataPackage(): Promise<void> {
  try {
    dataPackage.value = await apiClient.getHextechDataPackage()
  } catch {
    // 状态接口拿不到不影响页面其它内容
  }
}

// 搜索
const augmentQuery = ref('')
const championQuery = ref('')

// 行内展开（同一时间只允许一个）
const expandedAugmentId = ref<number | null>(null)
const expandedChampionId = ref<number | null>(null)
const championDetail = ref<HextechChampionDetail | null>(null)
const championDetailLoading = ref(false)

const hasData = computed(() => augments.value.length > 0 || champions.value.length > 0)

// 匿名数据贡献：默认关闭，只有玩家明确同意后才上传
const CONTRIBUTE_DIALOG_SEEN_KEY = 'rankpeek.hextech.contributeDialogSeen'
const contribution = ref<HextechContributionStatus | null>(null)
const contributionPreview = ref<HextechContributionPreview | null>(null)
const contributeDialogOpen = ref(false)
const contributeBarHidden = ref(false)
const savingContribution = ref(false)

async function loadContribution(): Promise<void> {
  try {
    contribution.value = await apiClient.getHextechContribution()
  } catch {
    contribution.value = null
  }
}

function isContributeDialogSeen(): boolean {
  try {
    return window.localStorage.getItem(CONTRIBUTE_DIALOG_SEEN_KEY) === '1'
  } catch {
    return true
  }
}

function markContributeDialogSeen(): void {
  try {
    window.localStorage.setItem(CONTRIBUTE_DIALOG_SEEN_KEY, '1')
  } catch {
    // 存储失败时下次仍会提示，不影响功能
  }
}

async function openContributeDialog(): Promise<void> {
  contributeDialogOpen.value = true
  if (!contributionPreview.value) {
    try {
      contributionPreview.value = await apiClient.getHextechContributionPreview()
    } catch {
      // 预览失败时弹窗只显示通用说明
    }
  }
}

function closeContributeDialog(): void {
  contributeDialogOpen.value = false
}

function hideContributeBar(): void {
  contributeBarHidden.value = true
}

async function acceptContribution(): Promise<void> {
  savingContribution.value = true
  try {
    contribution.value = await apiClient.setHextechContributionEnabled(true)
    markContributeDialogSeen()
    contributeDialogOpen.value = false
  } catch {
    // 失败时保持弹窗打开，玩家可以重试
  } finally {
    savingContribution.value = false
  }
}

function declineContribution(): void {
  markContributeDialogSeen()
  contributeDialogOpen.value = false
}

async function disableContribution(): Promise<void> {
  savingContribution.value = true
  try {
    contribution.value = await apiClient.setHextechContributionEnabled(false)
  } catch {
    // 取消失败时保留原状态
  } finally {
    savingContribution.value = false
  }
}

const augmentRows = computed(() =>
  [...augments.value].sort((a, b) => (sortKey.value === 'winRate' ? a.winRank - b.winRank : a.pickRank - b.pickRank))
)
const championRows = computed(() => [...champions.value].sort((a, b) => a.winRank - b.winRank))

const filteredAugmentRows = computed(() => filterByName(augmentRows.value, augmentQuery.value, (row) => row.name))
/** 复用 RP 已有的别名搜索（小火龙 → 斯莫德、吴E凡 → 厄斐琉斯 等）。 */
const filteredChampionRows = computed(() => {
  const keyword = championQuery.value.trim()
  if (!keyword) {
    return championRows.value
  }
  return championRows.value.filter((row) => {
    const option = championOptionMap.value.get(row.championId)
    return option
      ? championOptionMatchesSearch(option, keyword)
      : championName(row.championId).toLowerCase().includes(keyword.toLowerCase())
  })
})
/** 带上解析后的变化箭头，避免模板里重复解析。 */
const championBoardRows = computed(() =>
  filteredChampionRows.value.map((row) => ({ ...row, delta: parseRankChange(row.rankChangeText) }))
)

function filterByName<T>(rows: T[], query: string, pick: (row: T) => string): T[] {
  const keyword = query.trim().toLowerCase()
  if (!keyword) {
    return rows
  }
  return rows.filter((row) => pick(row).toLowerCase().includes(keyword))
}

function percent(value: number): string {
  return Number.isFinite(value) ? (value * 100).toFixed(2) + '%' : '-'
}

function championName(championId: number): string {
  return championNameMap.value.get(championId) || '#' + championId
}

function deltaText(change: number): string {
  if (change > 0) return '↑' + change
  if (change < 0) return '↓' + Math.abs(change)
  return '—'
}

function deltaClass(change: number): string {
  if (change > 0) return 'up'
  if (change < 0) return 'down'
  return 'flat'
}

/** 101 的英雄榜只给中文变化文案（上升1位/下降2位/未变化），这里统一成与强化榜一致的箭头样式。 */
function parseRankChange(text: string | null): { text: string; cls: string } {
  if (!text) return { text: '—', cls: 'flat' }
  const up = text.match(/上升\s*(\d+)?/)
  if (up) return { text: '↑' + (up[1] ?? ''), cls: 'up' }
  const down = text.match(/下降\s*(\d+)?/)
  if (down) return { text: '↓' + (down[1] ?? ''), cls: 'down' }
  return { text: '—', cls: 'flat' }
}

function tierLabel(tier: string | null): string {
  const num = Number(tier)
  return Number.isFinite(num) && num > 0 ? 'T' + num : '—'
}

function rarityLabel(rarity: string | null): string {
  if (!rarity) return ''
  if (/prismatic/i.test(rarity)) return t('hextech.rarityPrismatic')
  if (/gold/i.test(rarity)) return t('hextech.rarityGold')
  if (/silver/i.test(rarity)) return t('hextech.raritySilver')
  return ''
}

/** aramgg 的比例字段是 0-1 的字符串，且可能为 null（样本不足），不能当 0。 */
function formatRate(value: string | null): string {
  if (value === null || value === '') return '—'
  const num = Number(value)
  return Number.isFinite(num) ? (num * 100).toFixed(2) + '%' : '—'
}

function formatGames(value: string | null): string {
  if (value === null || value === '') return ''
  const num = Number(value)
  if (!Number.isFinite(num)) return ''
  return num >= 10000 ? (num / 10000).toFixed(1) + 'w' : String(num)
}

function augmentTitle(augment: HextechChampionTopAugment): string {
  const parts = [augment.name || '#' + augment.augmentId]
  if (augment.pickRate) parts.push(t('hextech.colPickRate') + ' ' + formatRate(augment.pickRate))
  if (augment.winRate) parts.push(t('hextech.colWinRate') + ' ' + formatRate(augment.winRate))
  return parts.join(' · ')
}

function hideBrokenIcon(event: Event): void {
  const target = event.target as HTMLImageElement | null
  if (target) target.style.visibility = 'hidden'
}

function scrollRowIntoView(prefix: string, id: number): void {
  void nextTick(() => {
    document.getElementById(prefix + id)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })
}

function switchTab(next: 'augments' | 'champions'): void {
  tab.value = next
  expandedAugmentId.value = null
  expandedChampionId.value = null
}

function expandAugment(augmentId: number): void {
  expandedAugmentId.value = augmentId
  expandedChampionId.value = null
  scrollRowIntoView('hextech-augment-', augmentId)
}

function toggleAugment(augmentId: number): void {
  if (expandedAugmentId.value === augmentId) {
    expandedAugmentId.value = null
    return
  }
  expandAugment(augmentId)
}

/** 展开（幂等）：搜索命中、URL 参数、点击都走这里，避免"已经展开时再点一次反而收起"。 */
async function expandChampion(championId: number): Promise<void> {
  expandedChampionId.value = championId
  expandedAugmentId.value = null
  scrollRowIntoView('hextech-champion-', championId)
  await loadChampionDetail(championId)
}

async function toggleChampion(championId: number): Promise<void> {
  if (expandedChampionId.value === championId) {
    expandedChampionId.value = null
    return
  }
  await expandChampion(championId)
}

async function loadChampionDetail(championId: number): Promise<void> {
  if (championDetail.value?.championId === championId) {
    return
  }
  championDetail.value = null
  championDetailLoading.value = true
  try {
    const detail = await apiClient.getHextechChampionDetail(championId)
    // 展开期间用户可能已经切走
    if (expandedChampionId.value === championId) {
      championDetail.value = detail
    }
  } catch {
    championDetail.value = null
  } finally {
    championDetailLoading.value = false
  }
}

/** 搜索到唯一结果时自动展开，方便"搜到即看到"。 */
watch(filteredAugmentRows, (rows) => {
  if (!augmentQuery.value.trim() || rows.length !== 1) return
  expandAugment(rows[0].augmentId)
})

watch(filteredChampionRows, (rows) => {
  if (!championQuery.value.trim() || rows.length !== 1) return
  void expandChampion(rows[0].championId)
})

/**
 * 支持 /hextech?championId=xxx（选人自动跳转的入口）。
 *
 * 参数只消费一次：用完就从 URL 移除，否则应用因为游戏阶段变化重新挂载这个页面时，
 * 会反复触发并清掉用户正在输入的搜索词。
 */
watch(
  () => route.query.championId,
  (value) => {
    const championId = Number(value)
    if (!Number.isFinite(championId) || championId <= 0) {
      return
    }

    const query = { ...route.query }
    delete query.championId
    void router.replace({ query })

    tab.value = 'champions'
    if (!filteredChampionRows.value.some((row) => row.championId === championId)) {
      championQuery.value = ''
    }
    void expandChampion(championId)
  },
  { immediate: true }
)

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [nextStatus, nextAugments, nextChampions] = await Promise.all([
      apiClient.getHextechStatus(),
      apiClient.getHextechAugments(),
      apiClient.getHextechChampions()
    ])
    status.value = nextStatus
    augments.value = nextAugments
    champions.value = nextChampions

    if (!championOptions.value.length) {
      try {
        championOptions.value = await apiClient.getChampionOptions()
      } catch {
        // 英雄名/别名搜索失败不影响榜单展示
      }
    }
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    loading.value = false
  }
}

async function reload(): Promise<void> {
  expandedAugmentId.value = null
  expandedChampionId.value = null
  championDetail.value = null
  checkingUpdate.value = true
  try {
    // 手动「检查更新」无视下载 CD
    dataPackage.value = await apiClient.checkHextechDataPackage()
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    checkingUpdate.value = false
  }
  await load()
}

// 悬浮窗开关（状态存在主进程里，重启后还记得）
const overlayState = ref<{ open: boolean; inGameOpen: boolean; autoOpen: boolean }>({
  open: false,
  inGameOpen: false,
  autoOpen: false
})

interface HextechOverlayBridge {
  getHextechOverlayState?: () => Promise<{ open: boolean; inGameOpen: boolean; autoOpen: boolean }>
  toggleHextechOverlay?: (mode: string) => Promise<{ open: boolean; inGameOpen: boolean; autoOpen: boolean }>
  setHextechOverlayAutoOpen?: (enabled: boolean) => Promise<{ open: boolean; inGameOpen: boolean; autoOpen: boolean }>
}

let overlayStateTimer: number | null = null

function overlayApi(): HextechOverlayBridge | undefined {
  return (window as unknown as { electronAPI?: HextechOverlayBridge }).electronAPI
}

async function loadOverlayState(): Promise<void> {
  const stored = readAutoOpenPreferenceOrNull()
  try {
    const next = await overlayApi()?.getHextechOverlayState?.()
    overlayState.value = {
      open: next?.open === true,
      inGameOpen: next?.inGameOpen === true,
      // 本地显式设置过就用本地的，否则用主进程那份（重启后不会莫名变回关）
      autoOpen: stored ?? next?.autoOpen === true
    }
  } catch {
    // 浏览器里跑（没有 Electron）时只显示开关偏好
    overlayState.value = { open: false, inGameOpen: false, autoOpen: stored ?? false }
  }
}

/**
 * 手动开关：不在对局就开关选人助手窗口，正在打海斗就开关局内贴片
 * （自动弹出没触发时，这里是兜底入口）。
 */
async function toggleOverlayWindow(): Promise<void> {
  let phase: string | null = null
  try {
    phase = (await apiClient.getHextechOverlay(null))?.phase ?? null
  } catch {
    phase = null
  }
  const mode = isInGamePhase(phase) ? 'in-game' : 'champ-select'
  const next = await overlayApi()?.toggleHextechOverlay?.(mode)
  if (next) {
    overlayState.value = next
  }
}

async function toggleOverlayAutoOpen(): Promise<void> {
  const enabled = !overlayState.value.autoOpen
  writeAutoOpenPreference(enabled)
  void readAutoOpenPreference()
  overlayState.value = { ...overlayState.value, autoOpen: enabled }
  // 主进程那份只是镜像，写不进去也不影响上面的开关
  await overlayApi()?.setHextechOverlayAutoOpen?.(enabled)
}

onMounted(async () => {
  void load()
  void loadDataPackage()
  void loadOverlayState()
  overlayStateTimer = window.setInterval(() => void loadOverlayState(), 5000)
  await loadContribution()
  if (contribution.value && !contribution.value.enabled && !isContributeDialogSeen()) {
    await openContributeDialog()
  }
})

onUnmounted(() => {
  if (overlayStateTimer !== null) {
    window.clearInterval(overlayStateTimer)
    overlayStateTimer = null
  }
})
</script>

<style scoped>
.hextech-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ---------- 悬浮窗开关 ---------- */
.overlay-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 16px;
  padding: 12px 16px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
}

/* 全屏警告：必须显眼 —— 玩家不改设置，浮窗永远看不到 */
.overlay-hint {
  flex-basis: 100%;
  margin: 0;
  padding: 8px 12px;
  border: 1px solid rgba(226, 162, 60, 0.45);
  border-left: 3px solid #e2a23c;
  border-radius: 4px;
  background: rgba(226, 162, 60, 0.1);
  color: #f0c479;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
}

/* ---------- 海斗数据状态圆环 ---------- */
.data-ring {
  position: relative;
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ring-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ring-track {
  fill: none;
  stroke: rgba(244, 236, 220, 0.16);
  stroke-width: 3;
}

.ring-fill {
  fill: none;
  stroke: #54d884;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-dasharray: 94.2;
  stroke-dashoffset: 0;
  transition: stroke-dashoffset 0.3s ease;
  transform-box: fill-box;
  transform-origin: center;
}

.data-ring.is-loading .ring-fill {
  stroke: #e2c27a;
  animation: ring-spin 1s linear infinite;
}

.data-ring.is-error .ring-fill {
  stroke: #e5534b;
}

.ring-glyph {
  position: relative;
  font-size: 13px;
  font-weight: 900;
  line-height: 1;
  color: #54d884;
}

.data-ring.is-loading .ring-glyph {
  color: #e2c27a;
}

.data-ring.is-error .ring-glyph {
  color: #e5534b;
}

@keyframes ring-spin {
  to {
    transform: rotate(360deg);
  }
}

.overlay-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.overlay-copy b {
  font-size: 14px;
  color: var(--text-primary);
}

.overlay-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

/* 一次性动作按钮：关着的时候是主按钮（提示可以打开），开着的时候是次要按钮 */
.overlay-action {
  min-height: 34px;
  padding: 0 16px;
  border: 1px solid var(--accent-color);
  border-radius: 4px;
  background: var(--accent-color);
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.overlay-action:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}

.overlay-action-on {
  background: transparent;
  border-color: var(--border-color);
  color: var(--text-secondary);
}

.overlay-action-on:hover {
  background: var(--bg-tertiary);
  border-color: var(--border-light);
  color: var(--text-primary);
}

.hextech-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease;
}

.hextech-switch:hover {
  border-color: rgba(var(--accent-rgb), 0.42);
}

.hextech-switch .switch-track {
  width: 40px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  padding: 2px;
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  background: var(--bg-active);
  transition: background 0.18s ease, border-color 0.18s ease;
}

.hextech-switch .switch-thumb {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  border-radius: 999px;
  background: var(--text-tertiary);
  transform: translateX(0);
  transition: transform 0.18s ease, background 0.18s ease;
}

.hextech-switch.active .switch-track {
  background: rgba(var(--accent-rgb), 0.35);
  border-color: rgba(var(--accent-rgb), 0.55);
}

.hextech-switch.active .switch-thumb {
  transform: translateX(18px);
  background: var(--accent-color);
}

/* ---------- 匿名数据贡献 ---------- */
.contribute-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
}

.contribute-bar-active {
  border-left: 3px solid var(--accent-color);
}

.contribute-copy {
  min-width: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.contribute-copy b {
  color: var(--text-primary);
}

.contribute-sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-tertiary);
}

.contribute-actions {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
}

.contribute-accept {
  padding: 6px 14px;
  border: 1px solid var(--accent-color);
  border-radius: 4px;
  background: var(--accent-color);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: opacity 120ms ease;
}

.contribute-accept:hover:not(:disabled) {
  opacity: 0.88;
}

.contribute-accept:disabled {
  opacity: 0.55;
  cursor: default;
}

.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.45);
}

.dialog {
  width: min(720px, 100%);
  max-height: 86vh;
  overflow: auto;
  padding: 22px 24px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
}

.dialog h2 {
  margin: 0 0 10px;
  font-size: 17px;
  color: var(--text-primary);
}

.dialog-intro {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
}

.dialog-columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 18px;
}

.dialog-columns h3 {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--text-primary);
}

.field-list {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--text-secondary);
}

.field-list-never {
  color: #d9534f;
}

.dialog-footer {
  margin: 16px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-secondary);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}

.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
}

.head-copy h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}

.subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-tertiary);
}

.head-meta {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 12px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.meta-item b {
  color: var(--text-secondary);
  font-weight: 600;
}

.ghost-button {
  padding: 6px 12px;
  border: 1px solid var(--border-light);
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.ghost-button:hover:not(:disabled) {
  border-color: var(--accent-color);
  background: var(--bg-hover);
  color: var(--text-primary);
}

.ghost-button:disabled {
  opacity: 0.5;
  cursor: default;
}

.tabs {
  display: flex;
  border-bottom: 1px solid var(--border-color);
}

.tabs button {
  padding: 9px 18px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 14px;
  cursor: pointer;
}

.tabs button:hover {
  color: var(--text-secondary);
}

.tabs button.active {
  border-bottom-color: var(--accent-color);
  color: var(--text-primary);
}

.panel {
  /* 表头与数据行是两个独立 grid：固定列必须写死宽度，否则两处会各算各的；末尾 1fr 吸收多余空间 */
  --hextech-columns: 34px 30px minmax(88px, 220px) 66px 66px 48px 132px minmax(0, 1fr);

  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-subtle);
}

.panel-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.search-input {
  width: 200px;
  padding: 5px 10px;
  border: 1px solid var(--border-light);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 12px;
}

.search-input:focus {
  border-color: var(--accent-color);
  outline: none;
}

.sort-group {
  display: flex;
  gap: 6px;
}

.sort-group button {
  padding: 4px 10px;
  border: 1px solid var(--border-light);
  border-radius: 4px;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 12px;
  cursor: pointer;
}

.sort-group button.active {
  border-color: var(--accent-color);
  color: var(--text-primary);
}

.panel-count,
.panel-title {
  flex: none;
  color: var(--text-tertiary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.board {
  margin: 0;
  padding: 0;
  list-style: none;
}

.board-head {
  display: grid;
  grid-template-columns: var(--hextech-columns);
  gap: 8px;
  padding: 9px 14px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-tertiary);
  font-size: 11px;
}

.board-row {
  display: grid;
  grid-template-columns: var(--hextech-columns);
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 13px;
  content-visibility: auto;
  contain-intrinsic-size: auto 46px;
}

.board-row:hover {
  background: var(--bg-hover);
}

.board-row-clickable {
  cursor: pointer;
}

.board-row-clickable.selected {
  background: var(--bg-active);
}

.board-empty {
  margin: 0;
  padding: 22px 14px;
  color: var(--text-tertiary);
  font-size: 13px;
  text-align: center;
}

.col-rank {
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.col-icon {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  background: var(--bg-tertiary);
  object-fit: cover;
}

/* 强化图标是白色字形，需要放在稀有度底色上（与游戏内表现一致） */
.augment-icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--augment-rarity-border, var(--border-light));
  background: var(--augment-rarity-bg, var(--bg-tertiary));
  object-fit: unset;
}

.augment-icon img {
  width: 22px;
  height: 22px;
  object-fit: contain;
}

.col-name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.name-text {
  overflow: hidden;
  color: var(--text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-num {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.col-delta {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.col-delta.up {
  color: var(--success-color);
}

.col-delta.down {
  color: var(--error-color);
}

.col-delta.flat {
  color: var(--text-tertiary);
}

.col-champs {
  display: flex;
  gap: 3px;
  padding-left: 6px;
}

.col-champs img {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  background: var(--bg-tertiary);
}

/* 英雄榜的顶级强化：白色字形 + 稀有度底色，与游戏内一致 */
.augment-chip {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 1px solid var(--augment-rarity-border, var(--border-light));
  border-radius: 4px;
  background: var(--augment-rarity-bg, var(--bg-tertiary));
}

.augment-chip img {
  width: 17px;
  height: 17px;
  object-fit: contain;
  /* .col-champs img 会给 img 本身加底色（浅色主题下近白），会把白色字形盖住 */
  background: transparent;
}

/* 行内展开面板 */
/* 展开的详情：更深一层底色 + 左侧强调条 + 缩进，明确"这是嵌套内容"而不是榜单行 */
.board-expand {
  position: relative;
  padding: 12px 14px 14px 54px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-primary);
}

.board-expand::before {
  content: '';
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 26px;
  width: 2px;
  background: var(--accent-color);
  opacity: 0.55;
}

.expand-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.expand-label {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.expand-note {
  color: var(--text-tertiary);
  font-size: 11px;
}

.expand-text {
  margin: 0 0 10px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.expand-block {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.expand-champions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.expand-champion {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--text-secondary);
  font-size: 12px;
}

.expand-champion img {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  background: var(--bg-secondary);
}

.detail-list {
  max-height: 300px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.detail-row {
  display: grid;
  grid-template-columns: 34px 30px 30px minmax(110px, 200px) 68px 68px 54px;
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 12px;
}

.detail-row:hover {
  background: var(--bg-tertiary);
}

.detail-row:last-child {
  border-bottom: 0;
}

.detail-row-head {
  position: sticky;
  top: 0;
  padding-top: 8px;
  padding-bottom: 8px;
  background: var(--bg-primary);
  color: var(--text-tertiary);
  font-size: 11px;
}

.detail-tier {
  color: var(--text-tertiary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.detail-games {
  color: var(--text-tertiary);
}

.state {
  margin: 0;
  padding: 24px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-tertiary);
  text-align: center;
}

.state-error {
  border-color: var(--error-color);
  color: var(--error-color);
}

/* 窄窗口（应用最小宽度 720px）：整体缩小尺寸，不隐藏任何内容 */
@media (max-width: 1040px) {
  .panel {
    --hextech-columns: 32px 28px minmax(78px, 220px) 54px 54px 40px 104px minmax(0, 1fr);
  }

  .board-row,
  .board-head {
    gap: 6px;
    padding: 7px 12px;
  }

  .board-row {
    font-size: 12px;
  }

  .col-champs {
    gap: 2px;
  }

  .col-champs img {
    width: 18px;
    height: 18px;
  }

  .augment-chip {
    width: 20px;
    height: 20px;
  }

  .augment-chip img {
    width: 14px;
    height: 14px;
  }

  .augment-icon {
    width: 26px;
    height: 26px;
  }

  .augment-icon img {
    width: 18px;
    height: 18px;
  }

  .head-meta {
    gap: 10px;
    font-size: 11px;
  }

  .search-input {
    width: 140px;
  }

  .board-expand {
    padding-left: 34px;
  }

  .board-expand::before {
    left: 16px;
  }

  .detail-row {
    grid-template-columns: 30px 26px 26px minmax(90px, 160px) 58px 58px 46px 54px;
    gap: 6px;
  }
}
</style>
