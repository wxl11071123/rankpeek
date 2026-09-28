<template>
  <div v-if="open" class="opgg-modal-overlay" @click.self="$emit('close')">
    <section class="opgg-modal-panel" role="dialog" aria-modal="true" aria-labelledby="opgg-modal-title">
      <header class="opgg-modal-header">
        <div class="opgg-title-row">
          <img
            v-if="detail?.championId"
            class="opgg-champion-icon"
            :src="getChampionIconUrl(detail.championId)"
            alt=""
            @error="markAssetLoadFailed"
          />
          <div>
            <h2 id="opgg-modal-title">OP.GG</h2>
            <p>{{ query.filterLabel || 'KR' }}</p>
          </div>
        </div>
        <button class="opgg-close-btn" type="button" aria-label="Close" @click="$emit('close')">×</button>
      </header>

      <div v-if="loading" class="opgg-state">
        <span class="opgg-spinner" aria-hidden="true"></span>
        <span>正在读取 OP.GG 数据</span>
      </div>

      <div v-else-if="error" class="opgg-state opgg-state-error">
        <strong>OP.GG 数据读取失败</strong>
        <span>{{ error }}</span>
        <button class="opgg-retry-btn" type="button" @click="$emit('retry')">重试</button>
      </div>

      <div v-else-if="!detail" class="opgg-state">
        <strong>暂无当前英雄数据</strong>
        <span>{{ query.filterLabel || '当前筛选条件不足' }}</span>
      </div>

      <div v-else class="opgg-content">
        <div class="opgg-summary">
          <article class="opgg-stat-card">
            <span>胜率</span>
            <strong>{{ formatPercent(detail.stats.winRate) }}</strong>
          </article>
          <article class="opgg-stat-card">
            <span>登场率</span>
            <strong>{{ formatPercent(detail.stats.pickRate) }}</strong>
          </article>
          <article class="opgg-stat-card">
            <span>禁用率</span>
            <strong>{{ formatPercent(detail.stats.banRate) }}</strong>
          </article>
          <article class="opgg-stat-card">
            <span>KDA</span>
            <strong>{{ formatNumber(detail.stats.kda) }}</strong>
          </article>
        </div>

        <section
          v-for="section in buildSections"
          :key="section.key"
          class="opgg-section"
        >
          <header>
            <h3>{{ section.title }}</h3>
          </header>
          <div v-if="section.options.length" class="opgg-build-list">
            <article v-for="(option, index) in section.options" :key="`${section.key}-${index}`" class="opgg-build-row">
              <div class="opgg-icon-chain">
                <span
                  v-for="(id, idIndex) in option.ids"
                  :key="`${section.key}-${index}-${id}-${idIndex}`"
                  class="opgg-icon-slot"
                >
                  <AssetHoverTooltip
                    v-if="getIconUrl(section.iconType, id) && getOpggTooltipDetails(section.iconType, id)"
                    :details="getOpggTooltipDetails(section.iconType, id)!"
                  >
                    <img
                      :src="getIconUrl(section.iconType, id)"
                      alt=""
                      @error="markAssetLoadFailed"
                    />
                  </AssetHoverTooltip>
                  <img
                    v-else-if="getIconUrl(section.iconType, id)"
                    :src="getIconUrl(section.iconType, id)"
                    alt=""
                    @error="markAssetLoadFailed"
                  />
                  <span v-else>{{ formatSkillId(id) }}</span>
                </span>
              </div>
              <div class="opgg-build-meta">
                <strong>{{ formatPercent(option.winRate) }}</strong>
                <span>{{ formatPercent(option.pickRate) }} · {{ formatGames(option.games) }}</span>
              </div>
            </article>
          </div>
          <p v-else class="opgg-empty-section">暂无数据</p>
        </section>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AssetHoverTooltip from '@/components/common/AssetHoverTooltip.vue'
import type { OpggBuildOption, OpggChampionDetail } from '@/services/rankpeekDataClient.ts'
import type { OpggChampionQuery } from '@/services/opggChampionQuery'
import {
  getChampionIconUrl,
  getItemIconUrl,
  getItemTooltipDetails,
  getPerkIconUrl,
  getPerkTooltipDetails,
  getSummonerSpellIconUrl,
  markAssetLoadFailed,
  type GameAssetTooltipDetails
} from '@/utils/gameAssetUrls'

type IconType = 'spell' | 'perk' | 'item' | 'skill'

interface BuildSection {
  key: string
  title: string
  iconType: IconType
  options: OpggBuildOption[]
}

const props = defineProps<{
  open: boolean
  query: OpggChampionQuery
  detail: OpggChampionDetail | null
  loading: boolean
  error: string
}>()

defineEmits<{
  close: []
  retry: []
}>()

const buildSections = computed<BuildSection[]>(() => {
  const detail = props.detail
  if (!detail) return []
  return [
    { key: 'summonerSpells', title: '召唤师技能', iconType: 'spell', options: detail.summonerSpells || [] },
    { key: 'runes', title: '符文', iconType: 'perk', options: detail.runes || [] },
    { key: 'skillOrders', title: '技能顺序', iconType: 'skill', options: detail.skillOrders || [] },
    { key: 'starterItems', title: '出门装', iconType: 'item', options: detail.starterItems || [] },
    { key: 'boots', title: '鞋子', iconType: 'item', options: detail.boots || [] },
    { key: 'coreItems', title: '核心装备', iconType: 'item', options: detail.coreItems || [] },
    { key: 'lastItems', title: '第四/五/六件装备', iconType: 'item', options: detail.lastItems || [] }
  ]
})

function getIconUrl(iconType: IconType, id: number): string {
  if (iconType === 'spell') return getSummonerSpellIconUrl(id)
  if (iconType === 'perk') return getPerkIconUrl(id)
  if (iconType === 'item') return getItemIconUrl(id)
  return ''
}

function getOpggTooltipDetails(iconType: IconType, id: number): GameAssetTooltipDetails | null {
  if (iconType === 'perk') return getPerkTooltipDetails(id)
  if (iconType === 'item') return getItemTooltipDetails(id)
  return null
}

function formatPercent(value?: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  return `${(value * 100).toFixed(1)}%`
}

function formatNumber(value?: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  return value.toFixed(2)
}

function formatGames(value?: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '样本 -'
  return `样本 ${Math.round(value).toLocaleString()}`
}

function formatSkillId(id: number): string {
  const labels: Record<number, string> = {
    1: 'Q',
    2: 'W',
    3: 'E',
    4: 'R'
  }
  return labels[id] || String(id)
}
</script>

<style scoped>
.opgg-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 22px;
  background: rgba(0, 0, 0, 0.58);
}

.opgg-modal-panel {
  width: min(860px, calc(100vw - 32px));
  max-height: min(760px, calc(100vh - 42px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  color: var(--text-primary);
  box-shadow: 0 26px 68px rgba(0, 0, 0, 0.38);
}

.opgg-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border-color);
}

.opgg-title-row {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.opgg-champion-icon {
  flex: 0 0 auto;
  width: 42px;
  height: 42px;
  border-radius: 10px;
  object-fit: cover;
  border: 1px solid var(--border-color);
}

.opgg-title-row h2 {
  margin: 0;
  font-size: 22px;
  line-height: 1.1;
}

.opgg-title-row p {
  margin: 5px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
}

.opgg-close-btn {
  width: 34px;
  height: 34px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.opgg-content {
  min-height: 0;
  overflow: auto;
  display: grid;
  gap: 12px;
  padding: 16px 18px 18px;
}

.opgg-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.opgg-stat-card {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-tertiary);
}

.opgg-stat-card span {
  display: block;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
}

.opgg-stat-card strong {
  display: block;
  margin-top: 5px;
  color: var(--text-primary);
  font-size: 20px;
  line-height: 1.1;
}

.opgg-section {
  min-width: 0;
  padding: 13px;
  border: 1px solid var(--border-color);
  border-radius: 11px;
  background: rgba(var(--accent-rgb), 0.035);
}

.opgg-section header {
  margin-bottom: 10px;
}

.opgg-section h3 {
  margin: 0;
  font-size: 15px;
  line-height: 1.2;
}

.opgg-build-list {
  display: grid;
  gap: 9px;
}

.opgg-build-row {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 10px;
  border-radius: 9px;
  background: var(--bg-tertiary);
}

.opgg-icon-chain {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.opgg-icon-slot {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 900;
  overflow: hidden;
}

.opgg-icon-slot img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.opgg-icon-slot :deep(.asset-tooltip-trigger) {
  width: 100%;
  height: 100%;
}

.opgg-build-meta {
  flex: 0 0 auto;
  min-width: 92px;
  text-align: right;
}

.opgg-build-meta strong,
.opgg-build-meta span {
  display: block;
}

.opgg-build-meta strong {
  color: var(--text-primary);
  font-size: 13px;
}

.opgg-build-meta span {
  margin-top: 2px;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
}

.opgg-state {
  min-height: 220px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  padding: 28px;
  color: var(--text-secondary);
  text-align: center;
}

.opgg-state strong {
  color: var(--text-primary);
  font-size: 17px;
}

.opgg-state-error {
  color: #f59e9e;
}

.opgg-spinner {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: 3px solid rgba(var(--accent-rgb), 0.18);
  border-top-color: rgba(var(--accent-rgb), 0.86);
  animation: opgg-spin 0.8s linear infinite;
}

.opgg-retry-btn {
  min-height: 32px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-weight: 800;
  cursor: pointer;
}

.opgg-empty-section {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

:global([data-theme="light"] .opgg-modal-panel) {
  box-shadow: 0 24px 58px rgba(50, 60, 72, 0.22);
}

@keyframes opgg-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 720px) {
  .opgg-modal-overlay {
    padding: 12px;
  }

  .opgg-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .opgg-build-row {
    align-items: stretch;
    flex-direction: column;
  }

  .opgg-build-meta {
    min-width: 0;
    text-align: left;
  }
}
</style>
