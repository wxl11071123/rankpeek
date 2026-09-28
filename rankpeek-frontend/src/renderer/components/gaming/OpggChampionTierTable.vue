<template>
  <section class="opgg-tier-table">
    <div v-if="loading" class="opgg-tier-state">正在读取 OP.GG 榜单</div>
    <div v-else-if="error" class="opgg-tier-state opgg-tier-error">{{ error }}</div>

    <div v-else class="opgg-table-scroll">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>英雄</th>
            <th>梯队</th>
            <th>胜率</th>
            <th>登场率</th>
            <th>禁用率</th>
            <th>劣势对位</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(item, index) in tableItems"
            :key="item.championId"
            class="opgg-tier-row"
            @click="$emit('selectChampion', item.championId)"
          >
            <td>{{ rowRank(item, index) }}</td>
            <td>
              <div class="opgg-champion-cell">
                <img
                  class="opgg-champion-icon"
                  :src="getChampionIconUrl(item.championId)"
                  alt=""
                  @error="markAssetLoadFailed"
                />
                <span>{{ championName(item.championId) }}</span>
              </div>
            </td>
            <td>
              <span class="opgg-tier-badge" :class="`tier-${rowTier(item) ?? 'none'}`">
                {{ formatTier(rowTier(item)) }}
              </span>
            </td>
            <td>{{ formatPercent(rowStats(item).winRate) }}</td>
            <td>{{ formatPercent(rowStats(item).pickRate) }}</td>
            <td>{{ formatPercent(rowStats(item).banRate) }}</td>
            <td>
              <div v-if="rowCounters(item).length" class="opgg-counter-list">
                <img
                  v-for="counter in rowCounters(item)"
                  :key="counter.championId"
                  :src="getChampionIconUrl(counter.championId)"
                  alt=""
                  @error="markAssetLoadFailed"
                />
              </div>
              <span v-else>-</span>
            </td>
          </tr>
          <tr v-if="!tableItems.length">
            <td class="opgg-empty-row" colspan="7">暂无榜单数据</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type {
  OpggChampionCounter,
  OpggChampionList,
  OpggChampionListItem,
  OpggChampionPositionStats,
  OpggChampionStats
} from '@/services/rankpeekDataClient.ts'
import type { ChampionOption } from '@/types/api'
import {
  getChampionIconUrl,
  markAssetLoadFailed
} from '@/utils/gameAssetUrls'
import { championOptionMatchesSearch } from '@/utils/championSearchAliases'

const props = defineProps<{
  list: OpggChampionList | null
  selectedPosition: string
  championOptions: ChampionOption[]
  searchText: string
  loading: boolean
  error: string
}>()

defineEmits<{
  selectChampion: [championId: number]
}>()

const championNameMap = computed(() => {
  const map = new Map<number, string>()
  for (const option of props.championOptions) {
    map.set(option.value, option.label || option.realName || String(option.value))
  }
  return map
})

const championOptionMap = computed(() => {
  const map = new Map<number, ChampionOption>()
  for (const option of props.championOptions) {
    map.set(option.value, option)
  }
  return map
})

const tableItems = computed(() => {
  const keyword = props.searchText.trim().toLowerCase()
  const selectedPosition = props.selectedPosition
  return (props.list?.items || [])
    .filter(item => selectedPosition === 'none' || Boolean(selectedPositionStats(item)))
    .filter(item => {
      if (!keyword) return true
      const option = championOptionMap.value.get(item.championId)
      if (option) {
        return championOptionMatchesSearch(option, keyword)
      }
      const name = championName(item.championId).toLowerCase()
      return name.includes(keyword) || String(item.championId).includes(keyword)
    })
    .toSorted((left, right) => {
      const leftRank = rowRankValue(left)
      const rightRank = rowRankValue(right)
      return leftRank - rightRank
    })
})

function selectedPositionStats(item: OpggChampionListItem): OpggChampionPositionStats | null {
  if (props.selectedPosition === 'none') {
    return null
  }
  return item.positions.find(position => position.position === props.selectedPosition) || null
}

function rowStats(item: OpggChampionListItem): OpggChampionStats {
  return selectedPositionStats(item)?.stats || item.stats
}

function rowCounters(item: OpggChampionListItem): OpggChampionCounter[] {
  return (selectedPositionStats(item)?.counters || []).slice(0, 3)
}

function rowTier(item: OpggChampionListItem): number | null | undefined {
  return selectedPositionStats(item)?.tier ?? item.tier
}

function rowRankValue(item: OpggChampionListItem): number {
  return selectedPositionStats(item)?.rank ?? item.rank ?? Number.MAX_SAFE_INTEGER
}

function rowRank(item: OpggChampionListItem, index: number): number {
  const rank = rowRankValue(item)
  return rank === Number.MAX_SAFE_INTEGER ? index + 1 : rank
}

function championName(championId: number): string {
  return championNameMap.value.get(championId) || String(championId)
}

function formatTier(value?: number | null): string {
  if (value === 0) return 'OP'
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  return String(value)
}

function formatPercent(value?: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  return `${(value * 100).toFixed(2)}%`
}
</script>

<style scoped>
.opgg-tier-table {
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-secondary);
  overflow: hidden;
}

.opgg-table-scroll {
  min-height: 0;
  overflow: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

th,
td {
  height: 48px;
  padding: 0 12px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 800;
  text-align: left;
  white-space: nowrap;
}

th {
  position: sticky;
  top: 0;
  z-index: 1;
  height: 36px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 12px;
}

th:first-child,
td:first-child {
  width: 44px;
  text-align: center;
}

th:nth-child(2),
td:nth-child(2) {
  width: 34%;
}

th:last-child,
td:last-child {
  width: 112px;
}

.opgg-tier-row {
  cursor: pointer;
}

.opgg-tier-row:hover {
  background: rgba(var(--accent-rgb), 0.08);
}

.opgg-champion-cell {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.opgg-champion-icon,
.opgg-counter-list img {
  width: 30px;
  height: 30px;
  border-radius: 4px;
  object-fit: cover;
}

.opgg-champion-cell span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.opgg-tier-badge {
  color: var(--accent-color);
}

.opgg-tier-badge.tier-0 {
  color: #00b7ff;
}

.opgg-tier-badge.tier-1 {
  color: #00d18f;
}

.opgg-tier-badge.tier-4,
.opgg-tier-badge.tier-5 {
  color: #f06a6a;
}

.opgg-counter-list {
  display: flex;
  align-items: center;
  gap: 4px;
}

.opgg-counter-list img {
  width: 22px;
  height: 22px;
}

.opgg-tier-state,
.opgg-empty-row {
  min-height: 280px;
  display: grid;
  place-items: center;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 900;
}

.opgg-tier-error {
  color: var(--danger-color);
}

:global([data-theme="light"] .opgg-tier-table) {
  box-shadow: 0 16px 36px rgba(50, 60, 72, 0.08);
}
</style>
