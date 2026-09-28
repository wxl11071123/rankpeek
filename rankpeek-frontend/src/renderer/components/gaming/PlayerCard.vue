<template>
  <article
    class="player-card"
    :class="[teamClass, statusClass, { loading: sessionSummoner.isLoading, selected: selected }]"
    role="button"
    tabindex="0"
    :aria-pressed="selected"
    @click="onCardClick"
    @keydown.enter.prevent="onCardClick"
    @keydown.space.prevent="onCardClick"
  >
    <div v-if="sessionSummoner.isLoading" class="skeleton">
      <div class="avatar-skeleton"></div>
      <div class="copy-skeleton">
        <span></span>
        <span></span>
      </div>
    </div>

    <template v-else-if="sessionSummoner.summoner">
      <div class="player-head">
        <div class="avatar-wrap">
          <img v-if="avatarUrl" :src="avatarUrl" class="avatar" alt="" @error="markAssetLoadFailed" />
          <span v-else class="avatar avatar-fallback"></span>
        </div>

        <div class="player-copy">
          <div class="player-id-row">
            <button
              v-if="canNavigateToSummonerLookup"
              class="player-id"
              type="button"
              :title="summonerLookupName"
              :aria-label="`查询 ${summonerLookupName} 战绩`"
              @click.stop="navigateToSummonerLookup"
              @keydown.enter.stop
              @keydown.space.stop
            >
              {{ playerIdText }}
            </button>
            <span v-else class="player-id player-id-text">{{ playerIdText }}</span>
            <span
              v-if="sessionSummoner.preGroupMarkers?.name"
              class="pregroup-badge"
              :class="sessionSummoner.preGroupMarkers.type ? `type-${sessionSummoner.preGroupMarkers.type}` : ''"
            >
              {{ sessionSummoner.preGroupMarkers.name }}
            </span>
          </div>

          <div class="meta-row">
            <div class="tier-row">
              <img :src="tierImgUrl" class="tier-icon" alt="" />
              <span>{{ tierText }}</span>
            </div>

            <div
              v-if="!recordStatusMeta && userTags.length"
              ref="tagContainerRef"
              class="name-tags"
            >
              <div ref="tagMeasureRef" class="tag-measure" aria-hidden="true">
                <span
                  v-for="(tag, index) in userTags"
                  :key="`${tag.tagName}-measure-${index}`"
                  class="tag-chip"
                  :class="tag.good === true ? 'good' : tag.good === false ? 'bad' : 'neutral'"
                  :title="tag.tagDesc || tag.tagName"
                  data-tag-measure
                >
                  {{ tag.tagName }}
                </span>
                <button class="more-chip" type="button" tabindex="-1" data-overflow-measure @click.stop="noop">
                  +{{ overflowMeasureCount }}
                </button>
              </div>

              <div class="visible-tags">
                <span
                  v-for="(tag, index) in visibleUserTags"
                  :key="`${tag.tagName}-${index}`"
                  class="tag-chip"
                  :class="tag.good === true ? 'good' : tag.good === false ? 'bad' : 'neutral'"
                  :title="tag.tagDesc || tag.tagName"
                >
                  {{ tag.tagName }}
                </span>
              </div>
              <div v-if="hiddenUserTagCount" class="tag-overflow">
                <button class="more-chip" type="button" :aria-label="`还有 ${hiddenUserTagCount} 个标签`" @click.stop="noop">
                  +{{ hiddenUserTagCount }}
                </button>
                <div class="hidden-tags-popover">
                  <span
                    v-for="(tag, index) in hiddenUserTags"
                    :key="`${tag.tagName}-hidden-${index}`"
                    class="tag-chip"
                    :class="tag.good === true ? 'good' : tag.good === false ? 'bad' : 'neutral'"
                    :title="tag.tagDesc || tag.tagName"
                  >
                    {{ tag.tagName }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      <div v-if="recordStatusMeta" class="status-banner">
        <strong>{{ recordStatusMeta.label }}</strong>
        <span>{{ recordStatusMeta.hint }}</span>
      </div>

      <template v-else>
        <div class="scout-metrics" aria-label="侦察指标">
          <span
            v-if="hasChampionRecentData"
            class="metric-scope"
            title="当前英雄数据"
            aria-label="当前英雄数据"
          >当前英雄</span>
          <span class="metric-item">
            <span>KDA</span>
            <strong :class="kdaTone">{{ kdaText }}</strong>
          </span>
          <span class="metric-separator" aria-hidden="true"></span>
          <span class="metric-item">
            <span>伤转率</span>
            <strong :class="damageRateTone">{{ damageRateText }}</strong>
          </span>
          <span class="metric-separator" aria-hidden="true"></span>
          <span class="metric-item">
            <span>胜率</span>
            <strong :class="winRateTone">{{ winRateText }}</strong>
          </span>
          <span class="metric-separator" aria-hidden="true"></span>
          <span class="metric-item">
            <span>样本</span>
            <strong>{{ totalGames }}场</strong>
          </span>
        </div>
      </template>

      <div v-if="hasAiInlineContent" class="player-ai-insight" :class="aiInlineToneClass">
        <template v-if="props.aiInsight">
          <span class="player-ai-label">{{ props.aiInsight.label }}</span>
          <span class="player-ai-text">{{ props.aiInsight.text }}</span>
        </template>
        <span v-else-if="props.aiLoading" class="player-ai-text">AI 分析中...</span>
        <span v-else-if="props.aiError" class="player-ai-text">{{ props.aiError }}</span>
      </div>
    </template>

    <div v-else class="empty-state">
      <strong>暂无数据</strong>
      <span>正在等待会话数据...</span>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { QueueInfo, RankTag, RecordStatus, SessionSummoner } from '@/types/api'
import type { GamingAiPlayerInsightEvent } from '@/services/gamingAiServerStream'
import { getLatestChampionMeta, type CnChampionMeta } from '@/services/rankpeekDataClient'
import { getChampionIconUrl, getProfileIconUrl, markAssetLoadFailed } from '@/utils/gameAssetUrls'
import { formatRankDivisionLabel } from '@/utils/rankDisplay'
import { buildSummonerLookupName, createSummonerLookupRoute } from '@/utils/summonerLookupRoute'

import unranked from '@/assets/imgs/tier/unranked.png'
import iron from '@/assets/imgs/tier/iron.png'
import bronze from '@/assets/imgs/tier/bronze.png'
import silver from '@/assets/imgs/tier/silver.png'
import gold from '@/assets/imgs/tier/gold.png'
import platinum from '@/assets/imgs/tier/platinum.png'
import emerald from '@/assets/imgs/tier/emerald.png'
import diamond from '@/assets/imgs/tier/diamond.png'
import master from '@/assets/imgs/tier/master.png'
import grandmaster from '@/assets/imgs/tier/grandmaster.png'
import challenger from '@/assets/imgs/tier/challenger.png'

const props = defineProps<{
  sessionSummoner: SessionSummoner
  team?: 'blue' | 'red'
  isGameInProgress?: boolean
  selected?: boolean
  aiInsight?: GamingAiPlayerInsightEvent | null
  aiLoading?: boolean
  aiError?: string
}>()

const emit = defineEmits<{
  'select-player': []
}>()

function onCardClick() {
  if (props.sessionSummoner.isLoading) return
  emit('select-player')
}

const router = useRouter()

const tierIconMap: Record<string, string> = {
  unranked,
  iron,
  bronze,
  silver,
  gold,
  platinum,
  emerald,
  diamond,
  master,
  grandmaster,
  challenger
}

const CN_META_EXACT_TIERS = new Set([
  'CHALLENGER',
  'GRANDMASTER',
  'MASTER',
  'DIAMOND',
  'EMERALD',
  'PLATINUM',
  'GOLD',
  'SILVER',
  'BRONZE',
  'IRON'
])

const recordStatus = computed<RecordStatus>(() => props.sessionSummoner.userTag?.recordStatus || 'NORMAL')

const recordStatusMeta = computed(() => {
  switch (recordStatus.value) {
    case 'PRIVATE':
      return {
        label: '战绩隐藏',
        hint: 'LCU 能识别到这个玩家，但近期战绩处于隐藏状态。'
      }
    case 'EMPTY':
      return {
        label: '暂无近期对局',
        hint: '近期样本不足，暂时还无法判断这个玩家。'
      }
    case 'ERROR':
      return {
        label: '加载失败',
        hint: '最近一次标签请求没有返回可用数据。'
      }
    default:
      return null
  }
})

const userTags = computed<RankTag[]>(() =>
  (props.sessionSummoner.userTag?.tag || []).filter(
    (tag): tag is RankTag => Boolean(tag?.tagName?.trim()) && tag.tagName !== '开黑'
  )
)
const hasAiInlineContent = computed(() => Boolean(props.aiInsight || props.aiLoading || props.aiError))
const aiInlineToneClass = computed(() => `tone-${props.aiInsight?.tone || 'unknown'}`)
const summonerLookupName = computed(() => buildSummonerLookupName(props.sessionSummoner.summoner))
const canNavigateToSummonerLookup = computed(() => Boolean(summonerLookupName.value))
const playerIdText = computed(() => summonerLookupName.value || '未知玩家')
const measuredVisibleTagCount = ref<number | null>(null)
const tagContainerRef = ref<HTMLElement | null>(null)
const tagMeasureRef = ref<HTMLElement | null>(null)

const visibleTagLimit = computed(() => measuredVisibleTagCount.value ?? userTags.value.length)
const visibleUserTags = computed(() => userTags.value.slice(0, visibleTagLimit.value))
const hiddenUserTags = computed(() => userTags.value.slice(visibleTagLimit.value))
const hiddenUserTagCount = computed(() => hiddenUserTags.value.length)
const overflowMeasureCount = computed(() => Math.max(userTags.value.length, 1))

const TAG_GAP = 6
const MIN_VISIBLE_TAGS_WHEN_COLLAPSED = 1

let tagResizeObserver: ResizeObserver | null = null
let tagMeasureFrame = 0

function getPackedTagWidth(widths: number[], count: number): number {
  if (count <= 0) {
    return 0
  }
  return widths.slice(0, count).reduce((total, width) => total + width, 0) + TAG_GAP * (count - 1)
}

function updateVisibleTagCount() {
  const tags = userTags.value
  if (!tags.length) {
    measuredVisibleTagCount.value = 0
    return
  }

  const container = tagContainerRef.value
  const measure = tagMeasureRef.value
  if (tags.length === 1) {
    measuredVisibleTagCount.value = 1
    return
  }

  if (!container || !measure) {
    measuredVisibleTagCount.value = tags.length
    return
  }

  const availableWidth = Math.floor(container.clientWidth)
  if (availableWidth <= 0) {
    measuredVisibleTagCount.value = tags.length
    return
  }

  const tagWidths = Array.from(measure.querySelectorAll<HTMLElement>('.tag-chip')).map((node) =>
    Math.ceil(node.offsetWidth)
  )
  const moreChipWidth = Math.ceil(measure.querySelector<HTMLElement>('.more-chip')?.offsetWidth || 38)

  if (!tagWidths.length || getPackedTagWidth(tagWidths, tags.length) <= availableWidth) {
    measuredVisibleTagCount.value = tags.length
    return
  }

  let visibleCount = Math.max(
    0,
    Math.min(tags.length - 1, tagWidths.findIndex((_, index) => getPackedTagWidth(tagWidths, index + 1) > availableWidth))
  )

  if (visibleCount < 0) {
    visibleCount = tags.length - 1
  }

  while (visibleCount > MIN_VISIBLE_TAGS_WHEN_COLLAPSED) {
    const packedWidth = getPackedTagWidth(tagWidths, visibleCount) + TAG_GAP + moreChipWidth
    if (packedWidth <= availableWidth) {
      break
    }
    visibleCount -= 1
  }

  if (
    visibleCount === MIN_VISIBLE_TAGS_WHEN_COLLAPSED &&
    getPackedTagWidth(tagWidths, visibleCount) + TAG_GAP + moreChipWidth > availableWidth &&
    moreChipWidth <= availableWidth
  ) {
    visibleCount = 0
  }

  measuredVisibleTagCount.value = visibleCount
}

function scheduleVisibleTagUpdate() {
  if (tagMeasureFrame) {
    window.cancelAnimationFrame(tagMeasureFrame)
  }
  tagMeasureFrame = window.requestAnimationFrame(() => {
    tagMeasureFrame = 0
    updateVisibleTagCount()
  })
}

function observeTagContainer() {
  tagResizeObserver?.disconnect()
  if (tagContainerRef.value) {
    tagResizeObserver?.observe(tagContainerRef.value)
  }
}

onMounted(() => {
  tagResizeObserver = new ResizeObserver(scheduleVisibleTagUpdate)
  observeTagContainer()
  window.addEventListener('resize', scheduleVisibleTagUpdate)
  nextTick(scheduleVisibleTagUpdate)
})

onBeforeUnmount(() => {
  tagResizeObserver?.disconnect()
  window.removeEventListener('resize', scheduleVisibleTagUpdate)
  if (tagMeasureFrame) {
    window.cancelAnimationFrame(tagMeasureFrame)
  }
})

watch(
  () => userTags.value.map((tag) => tag.tagName).join('|'),
  () => {
    measuredVisibleTagCount.value = null
    nextTick(() => {
      observeTagContainer()
      scheduleVisibleTagUpdate()
    })
  },
  { flush: 'post' }
)

const tierLabelMap: Record<string, string> = {
  UNRANKED: '未定级',
  IRON: '黑铁',
  BRONZE: '青铜',
  SILVER: '白银',
  GOLD: '黄金',
  PLATINUM: '铂金',
  EMERALD: '翡翠',
  DIAMOND: '钻石',
  MASTER: '超凡大师',
  GRANDMASTER: '傲世宗师',
  CHALLENGER: '最强王者'
}

const teamClass = computed(() => {
  if (props.team === 'blue') return 'team-blue'
  if (props.team === 'red') return 'team-red'
  return 'team-neutral'
})

const statusClass = computed(() => {
  if (recordStatus.value === 'PRIVATE') return 'status-private'
  if (recordStatus.value === 'EMPTY') return 'status-empty'
  if (recordStatus.value === 'ERROR') return 'status-error'
  return 'status-normal'
})

const avatarUrl = computed(() => {
  if (props.sessionSummoner.championId > 0) {
    return getChampionIconUrl(props.sessionSummoner.championId)
  }
  if (props.sessionSummoner.summoner?.profileIconId) {
    return getProfileIconUrl(props.sessionSummoner.summoner.profileIconId)
  }
  return ''
})

const championRecentData = computed(() => props.sessionSummoner.userTag?.championRecentData || null)
const championRecentTotalGames = computed(() => {
  const wins = championRecentData.value?.selectWins || 0
  const losses = championRecentData.value?.selectLosses || 0
  return wins + losses
})
const hasChampionRecentData = computed(() => championRecentTotalGames.value > 0)
const activeRecentData = computed(() => hasChampionRecentData.value
  ? championRecentData.value
  : props.sessionSummoner.userTag?.recentData
)

const totalGames = computed(() => {
  const wins = activeRecentData.value?.selectWins || 0
  const losses = activeRecentData.value?.selectLosses || 0
  return wins + losses
})

const winRateValue = computed(() => {
  const wins = activeRecentData.value?.selectWins || 0
  const total = totalGames.value
  return total > 0 ? (wins / total) * 100 : null
})

const winRateText = computed(() => {
  return winRateValue.value != null ? `${winRateValue.value.toFixed(1)}%` : '--'
})

const kdaValue = computed(() => {
  const kda = activeRecentData.value?.kda
  return typeof kda === 'number' && Number.isFinite(kda) ? kda : null
})

const kdaText = computed(() => {
  return kdaValue.value != null ? kdaValue.value.toFixed(1) : '--'
})

const damageConversionRate = computed(() => {
  const damage = activeRecentData.value?.averageDamageDealtToChampions
  const gold = activeRecentData.value?.averageGold
  if (
    typeof damage !== 'number' ||
    typeof gold !== 'number' ||
    !Number.isFinite(damage) ||
    !Number.isFinite(gold) ||
    damage <= 0 ||
    gold <= 0
  ) {
    return null
  }
  return (damage / gold) * 100
})

const damageRateText = computed(() => {
  return damageConversionRate.value != null ? `${damageConversionRate.value.toFixed(1)}%` : '--'
})

type MetricTone = 'metric-high' | 'metric-neutral' | 'metric-low'

function getMetricTone(value: number | null, low: number, high: number): MetricTone {
  if (value == null) return 'metric-neutral'
  if (value >= high) return 'metric-high'
  if (value <= low) return 'metric-low'
  return 'metric-neutral'
}

function getBaselineMetricTone(value: number | null, baseline: number | null): MetricTone {
  if (value == null || baseline == null || !Number.isFinite(baseline) || baseline <= 0) {
    return 'metric-neutral'
  }
  const high = baseline * 1.05
  const low = baseline * 0.95
  if (value >= high) return 'metric-high'
  if (value <= low) return 'metric-low'
  return 'metric-neutral'
}

const primaryQueueInfo = computed<QueueInfo | null>(() => {
  const queueMap = props.sessionSummoner.rank?.queueMap
  return queueMap?.RANKED_SOLO_5x5 || queueMap?.RANKED_FLEX_SR || null
})

const cnMeta = ref<CnChampionMeta | null>(null)
const exactTierScope = computed(() => {
  const tier = primaryQueueInfo.value?.tier?.toUpperCase()
  return tier && CN_META_EXACT_TIERS.has(tier) ? tier : null
})
const shouldFetchCnMeta = computed(() =>
  hasChampionRecentData.value &&
  props.sessionSummoner.championId > 0 &&
  Boolean(exactTierScope.value)
)

let cnMetaRequestId = 0

async function loadCnMeta() {
  const requestId = ++cnMetaRequestId
  cnMeta.value = null
  if (!shouldFetchCnMeta.value) {
    return
  }

  const championId = props.sessionSummoner.championId
  const tierScope = exactTierScope.value
  if (!tierScope) {
    return
  }

  const meta = await getLatestChampionMeta(championId, tierScope)
  if (requestId === cnMetaRequestId) {
    cnMeta.value = meta
  }
}

watch(
  [() => props.sessionSummoner.championId, exactTierScope, hasChampionRecentData],
  () => {
    void loadCnMeta()
  },
  { immediate: true }
)

function getPositiveNumber(value?: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

const cnMetaKdaValue = computed(() => getPositiveNumber(cnMeta.value?.avgKda))
const cnMetaDamageConversionRate = computed(() => {
  const damage = getPositiveNumber(cnMeta.value?.avgDamage)
  const gold = getPositiveNumber(cnMeta.value?.avgGold)
  if (damage == null || gold == null) {
    return null
  }
  return (damage / gold) * 100
})

const kdaTone = computed(() => getBaselineMetricTone(kdaValue.value, cnMetaKdaValue.value))
const damageRateTone = computed(() => getBaselineMetricTone(damageConversionRate.value, cnMetaDamageConversionRate.value))
const winRateTone = computed(() => getMetricTone(winRateValue.value, 45, 55))

function getQueueTotalGames(queueInfo?: QueueInfo | null): number {
  if (!queueInfo) {
    return 0
  }
  if (typeof queueInfo.totalGames === 'number' && Number.isFinite(queueInfo.totalGames)) {
    return queueInfo.totalGames
  }
  const wins = typeof queueInfo.wins === 'number' ? queueInfo.wins : 0
  const losses = typeof queueInfo.losses === 'number' ? queueInfo.losses : 0
  return wins + losses
}

function hasTier(queueInfo?: QueueInfo | null): boolean {
  return Boolean(queueInfo?.tier && queueInfo.tier !== 'UNRANKED')
}

function normalizeTierKey(tier?: string): string {
  return tier?.toUpperCase() || 'UNRANKED'
}

function getTierLabel(tier?: string): string {
  const tierKey = normalizeTierKey(tier)
  return tierLabelMap[tierKey] || tier || tierLabelMap.UNRANKED
}

function hasRankSignal(queueInfo?: QueueInfo | null): boolean {
  if (!queueInfo) {
    return false
  }
  return queueInfo.isProvisional || hasTier(queueInfo) || getQueueTotalGames(queueInfo) > 0
}

const tierImgUrl = computed(() => {
  const tier = primaryQueueInfo.value?.tier?.toLowerCase()
  if (!tier || tier === 'unranked') {
    return tierIconMap.unranked
  }
  return tierIconMap[tier] || tierIconMap.unranked
})

const tierText = computed(() => {
  const queueInfo = primaryQueueInfo.value
  if (!queueInfo) {
    return '未定级'
  }

  if (queueInfo.isProvisional) {
    const games = getQueueTotalGames(queueInfo)
    return games > 0 ? `定级中 · ${games}场` : '定级中'
  }

  if (hasTier(queueInfo)) {
    const tierKey = normalizeTierKey(queueInfo.tier)
    const tierLabel = getTierLabel(queueInfo.tier)

    if (['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tierKey)) {
      return `${tierLabel} ${queueInfo.leaguePoints} LP`
    }

    const divisionLabel = formatRankDivisionLabel(queueInfo.division)
    if (divisionLabel) {
      return `${tierLabel} ${divisionLabel} ${queueInfo.leaguePoints} LP`
    }

    return `${tierLabel} ${queueInfo.leaguePoints} LP`
  }

  if (hasRankSignal(queueInfo)) {
    const games = getQueueTotalGames(queueInfo)
    return games > 0 ? `定级中 · ${games}场` : '定级中'
  }

  return '未定级'
})

function navigateToSummonerLookup() {
  const route = createSummonerLookupRoute(summonerLookupName.value)
  if (!route) {
    return
  }
  void router.push(route)
}

function noop() {
  // Keep nested utility buttons from toggling the card.
}

</script>

<style scoped>
.player-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 14px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: inherit;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast);
}

.player-card:focus-visible {
  outline: none;
  border-color: rgba(var(--accent-rgb), 0.46);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.16);
}

.player-card.selected {
  border-bottom-color: rgba(var(--accent-rgb), 0.55);
  box-shadow: 0 2px 8px rgba(var(--accent-rgb), 0.18), 0 0 0 1px rgba(var(--accent-rgb), 0.12);
}

/* 队伍身份用整块淡色面表达，不再用左侧粗竖条 */
.player-card.team-blue {
  border-color: rgba(92, 163, 234, 0.32);
  background: rgba(92, 163, 234, 0.07);
}

.player-card.team-red {
  border-color: rgba(222, 111, 111, 0.32);
  background: rgba(222, 111, 111, 0.07);
}

.player-card.status-private,
.player-card.status-empty {
  background: linear-gradient(180deg, rgba(215, 166, 75, 0.08), rgba(255, 255, 255, 0.02));
}

.player-card.status-error {
  background: linear-gradient(180deg, rgba(196, 92, 92, 0.08), rgba(255, 255, 255, 0.02));
}

.player-head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  align-items: center;
}

.avatar-wrap {
  position: relative;
}

.avatar {
  display: block;
  width: 46px;
  height: 46px;
  border-radius: 10px;
  object-fit: cover;
  background: var(--bg-tertiary);
}

.avatar[data-asset-failed='true'] {
  display: none;
}

.player-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.player-id-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  width: 100%;
}

.player-id {
  display: block;
  align-self: flex-start;
  width: fit-content;
  min-width: 0;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-primary);
  text-align: left;
  font-size: 14px;
  line-height: 1.15;
  font-weight: 800;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pregroup-badge {
  flex: 0 0 auto;
  max-width: 86px;
  padding: 2px 6px;
  border: 1px solid rgba(92, 163, 234, 0.42);
  border-radius: 999px;
  background: rgba(92, 163, 234, 0.14);
  color: #5ca3ea;
  font-size: 10px;
  font-weight: 800;
  line-height: 1.1;
  white-space: nowrap;
}

.pregroup-badge.type-warning {
  border-color: rgba(245, 197, 86, 0.45);
  background: rgba(245, 197, 86, 0.14);
  color: #e5b93f;
}

.pregroup-badge.type-error {
  border-color: rgba(255, 107, 107, 0.45);
  background: rgba(255, 107, 107, 0.14);
  color: #ff7a7a;
}

.pregroup-badge.type-info {
  border-color: rgba(143, 164, 255, 0.45);
  background: rgba(143, 164, 255, 0.14);
  color: #9aa8ff;
}

.player-id:hover {
  color: var(--accent-color);
}

.player-id:focus-visible {
  outline: none;
  color: var(--accent-color);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.player-id-text {
  cursor: default;
}

.player-id-text:hover {
  color: var(--text-primary);
}

.name-tags {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  flex-wrap: nowrap;
  gap: 6px;
  max-width: 100%;
  min-width: 0;
}

.visible-tags {
  display: flex;
  align-items: center;
  flex: 0 1 auto;
  gap: 6px;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
}

.tag-measure {
  position: absolute;
  left: -9999px;
  top: -9999px;
  display: flex;
  align-items: center;
  gap: 6px;
  visibility: hidden;
  pointer-events: none;
  white-space: nowrap;
}

.tag-overflow {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
}

.more-chip {
  min-width: 30px;
  min-height: 20px;
  padding: 1px 7px;
  border: 1px solid rgba(var(--accent-rgb), 0.35);
  border-radius: 999px;
  background: rgba(var(--accent-rgb), 0.12);
  color: var(--accent-hover);
  font-size: 11px;
  line-height: 1.1;
  font-weight: 800;
  cursor: pointer;
}

.hidden-tags-popover {
  position: absolute;
  left: 0;
  top: calc(100% + 6px);
  z-index: 4;
  width: max-content;
  max-width: min(260px, 70vw);
  display: none;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-elevated);
  box-shadow: var(--shadow-lg);
}

.tag-overflow:hover .hidden-tags-popover,
.tag-overflow:focus-within .hidden-tags-popover {
  display: flex;
}

.meta-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.tier-row span,
.status-banner span,
.empty-state span {
  color: var(--text-secondary);
  font-size: 12px;
}

.tier-row {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 5px;
  min-width: 0;
}

.tier-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.status-banner {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
}

.status-banner strong,
.empty-state strong {
  color: var(--text-primary);
  font-size: 12px;
  white-space: nowrap;
}

.tag-chip {
  flex: 0 0 auto;
  box-sizing: border-box;
  min-width: 0;
  max-width: min(132px, 100%);
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1.15;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-chip.good {
  background: rgba(61, 155, 122, 0.14);
  color: #3d9b7a;
}

.tag-chip.bad {
  background: rgba(196, 92, 92, 0.14);
  color: #c45c5c;
}

.tag-chip.neutral {
  background: rgba(184, 192, 204, 0.16);
  color: var(--text-secondary);
}

.scout-metrics {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 6px 10px;
  min-width: 0;
  width: 100%;
  padding-top: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.2;
  font-weight: 800;
  overflow: visible;
}

.metric-scope {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: max-content;
  height: 18px;
  padding: 0 8px;
  border: 1px solid rgba(var(--accent-rgb), 0.32);
  border-radius: 999px;
  background: rgba(var(--accent-rgb), 0.1);
  color: var(--accent-hover);
  font-size: 11px;
  line-height: 18px;
  font-weight: 900;
  white-space: nowrap;
}

.metric-item {
  display: inline-flex;
  align-items: center;
  align-self: center;
  justify-content: center;
  gap: 3px;
  flex: 1 1 76px;
  min-width: max-content;
  height: 18px;
  line-height: 18px;
  white-space: nowrap;
}

.metric-item span,
.metric-item strong {
  display: inline-flex;
  align-items: center;
  height: 18px;
  line-height: 18px;
}

.metric-item strong {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 900;
}

.metric-item strong.metric-high {
  color: #55d187;
}

.metric-item strong.metric-neutral {
  color: var(--text-primary);
}

.metric-item strong.metric-low {
  color: #ff6b6b;
}

.metric-separator {
  display: none;
  flex: 0 0 auto;
  width: 1px;
  height: 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
}

.player-ai-insight {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 6px 10px;
  border: 1px solid rgba(var(--accent-rgb), 0.18);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.035);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.55;
}

.player-ai-label {
  width: max-content;
  max-width: 100%;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(var(--accent-rgb), 0.12);
  color: var(--accent-hover);
  font-size: 12px;
  line-height: 1.35;
  font-weight: 900;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-ai-text {
  min-width: 0;
  color: var(--text-primary);
  font-weight: 700;
}

.player-ai-insight.tone-carry,
.player-ai-insight.tone-stable {
  border-color: rgba(61, 155, 122, 0.26);
  background: rgba(61, 155, 122, 0.07);
}

.player-ai-insight.tone-risk,
.player-ai-insight.tone-weak {
  border-color: rgba(196, 92, 92, 0.26);
  background: rgba(196, 92, 92, 0.07);
}

.player-ai-insight.tone-unknown {
  border-color: rgba(var(--accent-rgb), 0.18);
}

.skeleton {
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar-skeleton,
.copy-skeleton span {
  background: rgba(255, 255, 255, 0.06);
  animation: pulse 1.2s ease-in-out infinite;
}

.avatar-skeleton {
  width: 48px;
  height: 48px;
  border-radius: 12px;
}

.copy-skeleton {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.copy-skeleton span:first-child {
  width: 140px;
  height: 15px;
  border-radius: 8px;
}

.copy-skeleton span:last-child {
  width: 100px;
  height: 11px;
  border-radius: 6px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 0.9;
  }
}

@media (max-width: 720px) {
  .player-card {
    padding: 8px;
  }

  .player-head {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
  }

  .avatar {
    width: 40px;
    height: 40px;
  }

  .player-id {
    font-size: 14px;
  }

  .scout-metrics {
    flex-wrap: wrap;
    justify-content: flex-start;
    gap: 5px 6px;
    overflow: visible;
  }

  .metric-item {
    flex: 0 1 auto;
    height: 17px;
    line-height: 17px;
    font-size: 11px;
  }

  .metric-item span,
  .metric-item strong {
    height: 17px;
    line-height: 17px;
  }

  .metric-item strong {
    font-size: 13px;
  }

  .metric-separator {
    height: 10px;
  }
}
</style>
