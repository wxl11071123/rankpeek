<template>
  <section class="opgg-panel" aria-labelledby="opgg-panel-title">
    <header class="opgg-panel-header">
      <div class="opgg-title-row">
        <img
          v-if="detail?.championId"
          class="opgg-champion-icon"
          :src="getChampionIconUrl(detail.championId)"
          alt=""
          @error="markAssetLoadFailed"
        />
        <div class="opgg-title-copy">
          <div class="opgg-title-heading">
            <h2 id="opgg-panel-title">{{ panelTitle }}</h2>
            <button
              v-if="showBackButton"
              class="opgg-inline-back-btn"
              type="button"
              @click="$emit('back')"
            >
              返回榜单
            </button>
          </div>
          <p>{{ query.filterLabel || 'KR' }}</p>
        </div>
      </div>

      <div v-if="detail" class="opgg-counter-strip" aria-label="劣势对位">
        <span>劣势对位</span>
        <div v-if="counterChampions.length" class="opgg-counter-icons">
          <img
            v-for="counter in counterChampions"
            :key="counter.championId"
            :src="getChampionIconUrl(counter.championId)"
            alt=""
            @error="markAssetLoadFailed"
          />
        </div>
        <strong v-else class="opgg-counter-empty">-</strong>
      </div>
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
      <strong>{{ emptyTitle || '请选择英雄' }}</strong>
      <span>{{ emptyDescription || query.filterLabel || '选中英雄后会读取当前筛选条件的数据。' }}</span>
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
        :class="{ expandable: canExpandSection(section), expanded: isSectionExpanded(section.key), 'opgg-last-items-section': isLastItemsSection(section) }"
        :role="canExpandSection(section) ? 'button' : undefined"
        :tabindex="canExpandSection(section) ? 0 : undefined"
        :aria-expanded="canExpandSection(section) ? isSectionExpanded(section.key) : undefined"
        @click="toggleSectionExpandedFromCard(section)"
        @keydown.enter.prevent="toggleSectionExpandedFromCard(section)"
        @keydown.space.prevent="toggleSectionExpandedFromCard(section)"
      >
        <header class="opgg-section-header">
          <h3>{{ section.title }}</h3>
          <span
            v-if="canExpandSection(section)"
            class="opgg-section-expand-indicator"
            aria-hidden="true"
          >
            {{ isSectionExpanded(section.key) ? '收起' : '展开' }}
          </span>
        </header>
        <div v-if="isLastItemsSection(section) && section.options.length" class="opgg-last-items-grid">
          <article
            v-for="column in lastItemColumns(section)"
            :key="column.key"
            class="opgg-last-item-column"
          >
            <h4>{{ column.title }}</h4>
            <div v-if="column.options.length" class="opgg-last-item-list">
              <article
                v-for="(option, index) in visibleLastItemColumnOptions(section, column)"
                :key="`${column.key}-${index}`"
                class="opgg-last-item-row"
              >
                <div class="opgg-icon-chain opgg-last-item-icon-chain">
                  <span
                    v-for="(id, idIndex) in option.ids"
                    :key="`${column.key}-${index}-${id}-${idIndex}`"
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
                <div class="opgg-last-item-metrics">
                  <strong>{{ formatPercent(option.winRate) }}</strong>
                  <span>{{ formatLastItemGames(option.games) }}</span>
                </div>
              </article>
            </div>
            <p v-else class="opgg-empty-section">暂无数据</p>
          </article>
        </div>
        <div v-else-if="section.options.length" class="opgg-build-list">
          <article
            v-for="(option, index) in visibleSectionOptions(section)"
            :key="`${section.key}-${index}`"
            :class="section.key === 'runes' ? 'opgg-build-row opgg-rune-row' : 'opgg-build-row'"
          >
            <div v-if="section.key === 'runes'" class="opgg-rune-groups">
              <div class="opgg-rune-board">
                <div v-if="section.options.length > 1" class="opgg-rune-tabs" role="tablist" aria-label="Rune builds">
                  <button
                    v-for="(runeOption, runeIndex) in section.options"
                    :key="`rune-tab-${runeIndex}`"
                    type="button"
                    class="opgg-rune-tab"
                    :class="{ active: selectedRuneOption(section) === runeOption }"
                    role="tab"
                    :aria-selected="selectedRuneOption(section) === runeOption"
                    :tabindex="selectedRuneOption(section) === runeOption ? 0 : -1"
                    @click.stop="selectRuneOption(runeIndex)"
                  >
                    <span class="opgg-rune-tab-icons">
                      <span class="opgg-icon-slot opgg-rune-tab-icon">
                        <img
                          v-if="runeGroup(runeOption).primaryPageId && getIconUrl(section.iconType, runeGroup(runeOption).primaryPageId)"
                          :src="getIconUrl(section.iconType, runeGroup(runeOption).primaryPageId)"
                          alt=""
                          @error="markAssetLoadFailed"
                        />
                      </span>
                      <span class="opgg-icon-slot opgg-rune-tab-icon">
                        <img
                          v-if="runeGroup(runeOption).secondaryPageId && getIconUrl(section.iconType, runeGroup(runeOption).secondaryPageId)"
                          :src="getIconUrl(section.iconType, runeGroup(runeOption).secondaryPageId)"
                          alt=""
                          @error="markAssetLoadFailed"
                        />
                      </span>
                    </span>
                  </button>
                </div>
                <div class="opgg-rune-board-grid">
                  <div class="opgg-rune-tree opgg-rune-tree-primary">
                    <div
                      v-for="row in selectedPrimaryRuneRows(section)"
                      :key="row.key"
                      class="opgg-rune-row-grid"
                      :class="{ 'opgg-rune-keystone-row': row.isKeystone }"
                      :style="{ '--opgg-rune-row-columns': String(row.slots.length) }"
                    >
                      <template
                        v-for="(slot, slotIndex) in row.slots"
                        :key="`${row.key}-${slotIndex}`"
                      >
                        <span
                          v-if="slot.id !== null"
                          class="opgg-icon-slot opgg-rune-slot"
                          :class="{ selected: slot.selected, muted: !slot.selected }"
                        >
                          <AssetHoverTooltip
                            v-if="getIconUrl(section.iconType, slot.id) && getOpggTooltipDetails(section.iconType, slot.id)"
                            :details="getOpggTooltipDetails(section.iconType, slot.id)!"
                          >
                            <img
                              :src="getIconUrl(section.iconType, slot.id)"
                              alt=""
                              @error="markAssetLoadFailed"
                            />
                          </AssetHoverTooltip>
                          <img
                            v-else-if="getIconUrl(section.iconType, slot.id)"
                            :src="getIconUrl(section.iconType, slot.id)"
                            alt=""
                            @error="markAssetLoadFailed"
                          />
                        </span>
                      </template>
                      <span v-if="row.isKeystone" class="opgg-rune-keystone-summary">
                        <strong>{{ runeKeystoneName(option) }}</strong>
                        <span>胜率：{{ formatPercent(option.winRate) }}</span>
                      </span>
                    </div>
                  </div>
                  <div class="opgg-rune-tree opgg-rune-tree-secondary">
                    <div
                      v-for="row in selectedSecondaryRuneRows(section)"
                      :key="row.key"
                      class="opgg-rune-row-grid"
                      :style="{ '--opgg-rune-row-columns': String(row.slots.length) }"
                    >
                      <template
                        v-for="(slot, slotIndex) in row.slots"
                        :key="`${row.key}-${slotIndex}`"
                      >
                        <span
                          v-if="slot.id !== null"
                          class="opgg-icon-slot opgg-rune-slot"
                          :class="{ selected: slot.selected, muted: !slot.selected }"
                        >
                          <AssetHoverTooltip
                            v-if="getIconUrl(section.iconType, slot.id) && getOpggTooltipDetails(section.iconType, slot.id)"
                            :details="getOpggTooltipDetails(section.iconType, slot.id)!"
                          >
                            <img
                              :src="getIconUrl(section.iconType, slot.id)"
                              alt=""
                              @error="markAssetLoadFailed"
                            />
                          </AssetHoverTooltip>
                          <img
                            v-else-if="getIconUrl(section.iconType, slot.id)"
                            :src="getIconUrl(section.iconType, slot.id)"
                            alt=""
                            @error="markAssetLoadFailed"
                          />
                        </span>
                      </template>
                    </div>
                  </div>
                  <div class="opgg-rune-shards">
                    <div
                      v-for="slot in selectedRuneShardRows(section)"
                      :key="slot.key"
                      class="opgg-rune-shard-row"
                    >
                      <span
                        class="opgg-icon-slot opgg-rune-slot opgg-rune-shard-icon selected"
                      >
                        <AssetHoverTooltip
                          v-if="getIconUrl(section.iconType, slot.id) && getOpggTooltipDetails(section.iconType, slot.id)"
                          :details="getOpggTooltipDetails(section.iconType, slot.id)!"
                        >
                          <img
                            :src="getIconUrl(section.iconType, slot.id)"
                            alt=""
                            @error="markAssetLoadFailed"
                          />
                        </AssetHoverTooltip>
                        <img
                          v-else-if="getIconUrl(section.iconType, slot.id)"
                          :src="getIconUrl(section.iconType, slot.id)"
                          alt=""
                          @error="markAssetLoadFailed"
                        />
                      </span>
                      <span class="opgg-rune-shard-label">{{ runeStatLabel(slot.id) }}</span>
                    </div>
                  </div>
                  <div class="opgg-rune-board-metrics">
                    <span class="opgg-rune-board-metric opgg-rune-board-pick">
                      <span>选择率</span>
                      <strong>{{ formatPercent(option.pickRate) }}</strong>
                    </span>
                    <span class="opgg-rune-board-metric opgg-rune-board-games">
                      <span>样本</span>
                      <strong>{{ formatRuneTabGames(option.games) }}</strong>
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div v-else-if="section.key === 'skillOrders'" class="opgg-skill-order">
              <span class="opgg-skill-index">#{{ index + 1 }}</span>
              <div class="opgg-skill-lines">
                <div class="opgg-skill-priority">
                  <template
                    v-for="(id, idIndex) in option.ids"
                    :key="`skill-priority-${index}-${id}-${idIndex}`"
                  >
                    <span :class="skillChipClass(id)">{{ formatSkillId(id) }}</span>
                    <span v-if="idIndex < option.ids.length - 1" class="opgg-skill-arrow">›</span>
                  </template>
                </div>
                <div v-if="skillOrderSequence(option).length" class="opgg-skill-sequence">
                  <span
                    v-for="(id, idIndex) in skillOrderSequence(option)"
                    :key="`skill-sequence-${index}-${id}-${idIndex}`"
                    :class="skillChipClass(id)"
                  >
                    {{ formatSkillId(id) }}
                  </span>
                </div>
              </div>
            </div>
            <div v-else class="opgg-icon-chain">
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
            <div v-if="section.key !== 'runes'" class="opgg-build-meta">
              <div class="opgg-build-meta-column opgg-build-pick">
                <span>选择率</span>
                <strong>{{ formatPercent(option.pickRate) }}</strong>
              </div>
              <div class="opgg-build-meta-column opgg-build-win">
                <span>胜率</span>
                <strong>{{ formatPercent(option.winRate) }}</strong>
              </div>
              <div class="opgg-build-meta-column opgg-build-sample">
                <span>样本</span>
                <em>{{ formatGameCount(option.games) }}</em>
              </div>
            </div>
          </article>
        </div>
        <p v-else class="opgg-empty-section">暂无数据</p>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AssetHoverTooltip from '@/components/common/AssetHoverTooltip.vue'
import type { OpggBuildOption, OpggChampionCounter, OpggChampionDetail } from '@/services/rankpeekDataClient.ts'
import type { OpggChampionQuery } from '@/services/opggChampionQuery'
import { splitOpggRuneIds, type OpggRuneGroups } from '@/services/opggRuneGroups.ts'
import {
  getAugmentIconUrl,
  getAugmentTooltipDetails,
  getChampionIconUrl,
  getItemIconUrl,
  getItemTooltipDetails,
  getPerkAssetDetails,
  getPerkIconUrl,
  getPerkTooltipDetails,
  getSummonerSpellIconUrl,
  getSummonerSpellTooltipDetails,
  markAssetLoadFailed,
  type GameAssetTooltipDetails
} from '@/utils/gameAssetUrls'

type IconType = 'spell' | 'perk' | 'item' | 'skill' | 'augment'

interface BuildSection {
  key: string
  title: string
  iconType: IconType
  options: OpggBuildOption[]
}

interface LastItemColumn {
  key: string
  title: string
  options: OpggBuildOption[]
}

interface RuneLayoutSlot {
  id: number | null
  selected: boolean
}

interface RuneLayoutRow {
  key: string
  slots: RuneLayoutSlot[]
  isKeystone: boolean
}

interface RuneShardRow {
  key: string
  id: number
}

const INITIAL_VISIBLE_BUILD_OPTIONS = 2
const LAST_ITEM_COLUMN_SIZE = 5
const LAST_ITEM_COLLAPSED_OPTIONS_PER_COLUMN = 2
const LAST_ITEM_COLUMN_TITLES = ['第四件装备', '第五件装备', '第六件装备']
const LAST_ITEMS_SECTION_KEY = 'lastItems'
const RUNE_TREE_LAYOUTS: Record<number, number[][]> = {
  8000: [
    [8005, 8008, 8021, 8010],
    [9101, 9111, 8009],
    [9104, 9105, 9103],
    [8014, 8017, 8299]
  ],
  8100: [
    [8112, 8128, 9923],
    [8126, 8139, 8143],
    [8137, 8140, 8141],
    [8135, 8105, 8106]
  ],
  8200: [
    [8214, 8229, 8230, 8992],
    [8224, 8226, 8275],
    [8210, 8234, 8233],
    [8237, 8232, 8236]
  ],
  8300: [
    [8351, 8360, 8369],
    [8306, 8304, 8321],
    [8313, 8352, 8345],
    [8347, 8410, 8316]
  ],
  8400: [
    [8437, 8439, 8465],
    [8446, 8463, 8401],
    [8429, 8444, 8473],
    [8451, 8453, 8242]
  ]
}
const RUNE_STAT_LABELS: Record<number, string> = {
  5001: '成长生命值',
  5002: '护甲',
  5003: '魔抗',
  5005: '攻击速度',
  5007: '技能急速',
  5008: '适应之力',
  5010: '移动速度',
  5011: '固定生命值',
  5012: '成长双抗'
}

const props = defineProps<{
  query: OpggChampionQuery
  title?: string
  detail: OpggChampionDetail | null
  counters?: OpggChampionCounter[]
  showBackButton?: boolean
  loading: boolean
  error: string
  emptyTitle?: string
  emptyDescription?: string
}>()

defineEmits<{
  retry: []
  back: []
}>()

const expandedSectionKeys = ref<Set<string>>(new Set())
const selectedRuneOptionIndex = ref(0)

const panelTitle = computed(() => {
  const explicitTitle = props.title?.trim()
  if (explicitTitle) return explicitTitle
  return props.detail?.championName?.trim() || 'OP.GG'
})
const counterChampions = computed(() => (props.counters || []).slice(0, 3))
const runeGroupCache = new WeakMap<OpggBuildOption, OpggRuneGroups>()

const buildSections = computed<BuildSection[]>(() => {
  const detail = props.detail
  if (!detail) return []
  const sections: BuildSection[] = [
    { key: 'summonerSpells', title: '召唤师技能', iconType: 'spell', options: detail.summonerSpells || [] }
  ]
  if (detail.mode === 'arena') {
    sections.push({ key: 'augments', title: '强化符文', iconType: 'augment', options: detail.augments || [] })
  }
  sections.push(
    { key: 'runes', title: '符文', iconType: 'perk', options: detail.runes || [] },
    { key: 'skillOrders', title: '技能点法', iconType: 'skill', options: detail.skillOrders || [] },
    { key: 'starterItems', title: '出门装', iconType: 'item', options: detail.starterItems || [] },
    { key: 'boots', title: '鞋子', iconType: 'item', options: detail.boots || [] },
    { key: 'coreItems', title: '核心装备', iconType: 'item', options: detail.coreItems || [] },
    { key: LAST_ITEMS_SECTION_KEY, title: '第四/五/六件装备', iconType: 'item', options: detail.lastItems || [] }
  )
  return sections
})

watch(() => props.detail?.championId, () => {
  expandedSectionKeys.value = new Set()
  selectedRuneOptionIndex.value = 0
})

function visibleSectionOptions(section: BuildSection): OpggBuildOption[] {
  if (section.key === 'runes') {
    const option = selectedRuneOption(section)
    return option ? [option] : []
  }
  if (isSectionExpanded(section.key)) {
    return section.options
  }
  return section.options.slice(0, INITIAL_VISIBLE_BUILD_OPTIONS)
}

function canExpandSection(section: BuildSection): boolean {
  if (section.key === 'runes') {
    return false
  }
  if (isLastItemsSection(section)) {
    return lastItemColumns(section).some(column => column.options.length > LAST_ITEM_COLLAPSED_OPTIONS_PER_COLUMN)
  }
  return section.options.length > INITIAL_VISIBLE_BUILD_OPTIONS
}

function isLastItemsSection(section: BuildSection): boolean {
  return section.key === LAST_ITEMS_SECTION_KEY
}

function lastItemColumns(section: BuildSection): LastItemColumn[] {
  return LAST_ITEM_COLUMN_TITLES.map((title, index) => {
    const start = index * LAST_ITEM_COLUMN_SIZE
    return {
      key: `${LAST_ITEMS_SECTION_KEY}-${index}`,
      title,
      options: section.options.slice(start, start + LAST_ITEM_COLUMN_SIZE)
    }
  })
}

function visibleLastItemColumnOptions(section: BuildSection, column: LastItemColumn): OpggBuildOption[] {
  if (isSectionExpanded(section.key)) {
    return column.options
  }
  return column.options.slice(0, LAST_ITEM_COLLAPSED_OPTIONS_PER_COLUMN)
}

function isSectionExpanded(sectionKey: string): boolean {
  return expandedSectionKeys.value.has(sectionKey)
}

function toggleSectionExpanded(sectionKey: string) {
  const nextKeys = new Set(expandedSectionKeys.value)
  if (nextKeys.has(sectionKey)) {
    nextKeys.delete(sectionKey)
  } else {
    nextKeys.add(sectionKey)
  }
  expandedSectionKeys.value = nextKeys
}

function toggleSectionExpandedFromCard(section: BuildSection) {
  if (!canExpandSection(section)) return
  toggleSectionExpanded(section.key)
}

function runeGroup(option: OpggBuildOption): OpggRuneGroups {
  const cached = runeGroupCache.get(option)
  if (cached) {
    return cached
  }
  const groups = splitOpggRuneIds(option.ids || [])
  runeGroupCache.set(option, groups)
  return groups
}

function selectedRuneOption(section: BuildSection): OpggBuildOption | null {
  if (section.key !== 'runes' || !section.options.length) {
    return null
  }
  const index = Math.min(Math.max(selectedRuneOptionIndex.value, 0), section.options.length - 1)
  return section.options[index] || section.options[0] || null
}

function selectRuneOption(index: number) {
  selectedRuneOptionIndex.value = Math.max(0, index)
}

function selectedRuneGroup(section: BuildSection): OpggRuneGroups | null {
  const option = selectedRuneOption(section)
  return option ? runeGroup(option) : null
}

function selectedPrimaryRuneRows(section: BuildSection): RuneLayoutRow[] {
  const group = selectedRuneGroup(section)
  return group ? runeTreeRows(group.primaryPageId, group.primaryRuneIds, true) : []
}

function selectedSecondaryRuneRows(section: BuildSection): RuneLayoutRow[] {
  const group = selectedRuneGroup(section)
  return group ? runeTreeRows(group.secondaryPageId, group.secondaryRuneIds, false) : []
}

function selectedRuneShardRows(section: BuildSection): RuneShardRow[] {
  const group = selectedRuneGroup(section)
  return group ? runeStatRows(group.statModIds) : []
}

function runeKeystoneName(option: OpggBuildOption): string {
  const keystoneId = runeGroup(option).primaryRuneIds[0]
  const details = getPerkAssetDetails(keystoneId)
  return details?.name?.trim() || details?.nameTRA?.trim() || '基石符文'
}

function runeTreeRows(pageId: number | null, selectedIds: number[], includeKeystone: boolean): RuneLayoutRow[] {
  if (!pageId) {
    return fallbackRuneRows(selectedIds, includeKeystone ? 'primary' : 'secondary')
  }
  const layoutRows = includeKeystone ? RUNE_TREE_LAYOUTS[pageId] : RUNE_TREE_LAYOUTS[pageId]?.slice(1)
  if (!layoutRows?.length) {
    return fallbackRuneRows(selectedIds, includeKeystone ? 'primary' : 'secondary')
  }
  const selectedSet = new Set(selectedIds)
  return layoutRows
    .map((rowIds, rowIndex) => {
      const isKeystoneRow = includeKeystone && rowIndex === 0
      const visibleRuneRowIds = isKeystoneRow ? rowIds.filter(id => selectedSet.has(id)) : rowIds

      return {
        key: `${pageId}-${includeKeystone ? 'primary' : 'secondary'}-${rowIndex}`,
        isKeystone: isKeystoneRow,
        slots: visibleRuneRowIds.map(id => ({ id, selected: selectedSet.has(id) }))
      }
    })
    .filter(row => row.slots.length > 0)
}

function runeStatRows(selectedIds: number[]): RuneShardRow[] {
  return selectedIds
    .filter(id => Number.isFinite(id) && id > 0)
    .map((id, index) => ({
      key: `stat-${index}-${id}`,
      id,
      label: runeStatLabel(id)
    }))
}

function runeStatLabel(id: number): string {
  return RUNE_STAT_LABELS[id] || '属性碎片'
}

function fallbackRuneRows(ids: number[], keyPrefix: string): RuneLayoutRow[] {
  return ids.map((id, index) => ({
    key: `${keyPrefix}-fallback-${index}`,
    isKeystone: keyPrefix === 'primary' && index === 0,
    slots: [{ id, selected: true }]
  }))
}

function skillOrderSequence(option: OpggBuildOption): number[] {
  return (option.order?.length ? option.order : option.ids).filter(id => id >= 1 && id <= 4)
}

function getIconUrl(iconType: IconType, id: number): string {
  if (iconType === 'spell') return getSummonerSpellIconUrl(id)
  if (iconType === 'augment') return getAugmentIconUrl(id)
  if (iconType === 'perk') return getPerkIconUrl(id)
  if (iconType === 'item') return getItemIconUrl(id)
  return ''
}

function getOpggTooltipDetails(iconType: IconType, id: number): GameAssetTooltipDetails | null {
  if (iconType === 'spell') return getSummonerSpellTooltipDetails(id)
  if (iconType === 'augment') return getAugmentTooltipDetails(id)
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

function formatGameCount(value?: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  return Math.round(value).toLocaleString()
}

function formatLastItemGames(value?: number | null): string {
  const count = formatGameCount(value)
  return count === '-' ? '-' : `${count} 场次`
}

function formatRuneTabGames(value?: number | null): string {
  const count = formatGameCount(value)
  return count === '-' ? '-' : `${count} 场次`
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

function skillChipClass(id: number): string {
  return `opgg-skill-chip opgg-skill-${formatSkillId(id).toLowerCase()}`
}
</script>

<style scoped>
.opgg-panel {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  color: var(--text-primary);
}

.opgg-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: nowrap;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color);
}

.opgg-title-row {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.opgg-title-copy {
  min-width: 0;
}

.opgg-title-heading {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
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
  font-size: 21px;
  line-height: 1.1;
}

.opgg-inline-back-btn {
  min-height: 26px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
  cursor: pointer;
}

.opgg-title-row p {
  margin: 5px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
}

.opgg-counter-strip {
  flex: 0 0 300px;
  min-width: 210px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 10px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-tertiary);
}

.opgg-counter-strip > span {
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 900;
  line-height: 1;
  white-space: nowrap;
}

.opgg-counter-icons {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.opgg-counter-icons img {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  object-fit: cover;
  background: var(--bg-secondary);
}

.opgg-counter-empty {
  color: var(--text-secondary);
  font-size: 16px;
  line-height: 1;
}

.opgg-content {
  min-height: 0;
  overflow: auto;
  display: grid;
  gap: 12px;
  padding: 14px 16px 16px;
}

.opgg-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(112px, 1fr));
  gap: 10px;
}

.opgg-stat-card {
  min-width: 0;
  padding: 11px 12px;
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

.opgg-section.expandable {
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.opgg-section.expandable:hover,
.opgg-section.expandable:focus-visible {
  border-color: rgba(var(--accent-rgb), 0.45);
  background: rgba(var(--accent-rgb), 0.06);
  outline: none;
}

.opgg-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.opgg-section h3 {
  margin: 0;
  font-size: 15px;
  line-height: 1.2;
}

.opgg-section-expand-indicator {
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid rgba(var(--accent-rgb), 0.45);
  border-radius: 7px;
  background: rgba(var(--accent-rgb), 0.12);
  color: var(--accent-color);
  font-size: 12px;
  font-weight: 900;
  line-height: 1;
}

.opgg-section-expand-indicator::after {
  content: "";
  width: 6px;
  height: 6px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(45deg) translateY(-1px);
  transition: transform 0.16s ease;
}

.opgg-section.expanded .opgg-section-expand-indicator::after {
  transform: rotate(225deg) translateY(-1px);
}

.opgg-build-list {
  display: grid;
  gap: 9px;
}

.opgg-last-items-grid {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--border-color);
}

.opgg-last-item-column {
  min-width: 0;
  background: var(--bg-tertiary);
}

.opgg-last-item-column h4 {
  margin: 0;
  padding: 9px 10px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 900;
  line-height: 1;
}

.opgg-last-item-list {
  display: grid;
}

.opgg-last-item-row {
  min-width: 0;
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.055);
}

.opgg-last-item-row:first-child {
  border-top: 0;
}

.opgg-last-item-icon-chain {
  flex: 1 1 auto;
}

.opgg-last-item-metrics {
  flex: 0 0 auto;
  min-width: 64px;
  display: grid;
  gap: 3px;
  justify-items: end;
  text-align: right;
  white-space: nowrap;
}

.opgg-last-item-metrics strong {
  color: #4f8cff;
  font-size: 13px;
  font-weight: 950;
  line-height: 1;
}

.opgg-last-item-metrics span {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
}

.opgg-build-row {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: nowrap;
  gap: 8px;
  padding: 8px;
  border-radius: 9px;
  background: var(--bg-tertiary);
  overflow-x: auto;
}

.opgg-rune-row {
  align-items: stretch;
  padding: 0;
  background: transparent;
  overflow-x: hidden;
}

.opgg-rune-groups {
  flex: 1 1 auto;
  min-width: 0;
}

.opgg-rune-board {
  min-width: 0;
  min-height: 196px;
  display: grid;
  align-content: start;
  gap: 16px;
  padding: 10px 12px 14px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.035);
}

.opgg-rune-tabs {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
}

.opgg-rune-tab {
  flex: 0 0 auto;
  min-height: 40px;
  min-width: 86px;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 7px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.16);
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.opgg-rune-tab.active {
  border-color: rgba(var(--accent-rgb), 0.72);
  background: rgba(var(--accent-rgb), 0.14);
}

.opgg-rune-tab:focus-visible {
  outline: 2px solid rgba(var(--accent-rgb), 0.66);
  outline-offset: 2px;
}

.opgg-rune-tab-icons {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
}

.opgg-rune-tab-icon {
  width: 24px;
  height: 24px;
  border-radius: 6px;
}

.opgg-rune-board-grid {
  min-width: 0;
  min-height: 138px;
  display: grid;
  grid-template-columns: max-content max-content max-content minmax(96px, 1fr);
  justify-content: start;
  align-items: start;
  gap: clamp(24px, 4.6vw, 42px);
  padding: 2px 4px 0;
}

.opgg-rune-tree {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 14px;
}

.opgg-rune-tree-secondary {
  justify-items: start;
  padding-top: 34px;
}

.opgg-rune-row-grid {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(var(--opgg-rune-row-columns), 28px);
  align-items: center;
  column-gap: clamp(16px, 3.4vw, 28px);
  row-gap: 12px;
}

.opgg-rune-keystone-row {
  grid-template-columns: 28px max-content;
  column-gap: 8px;
}

.opgg-rune-keystone-summary {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 900;
  line-height: 1.1;
  white-space: nowrap;
}

.opgg-rune-keystone-summary strong {
  font-size: 15px;
  font-weight: 950;
}

.opgg-rune-keystone-summary span {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 900;
}

.opgg-rune-shards {
  min-width: 0;
  display: grid;
  grid-auto-rows: max-content;
  gap: 10px;
  justify-items: start;
  padding-top: 34px;
}

.opgg-rune-shard-row {
  min-width: 0;
  display: grid;
  grid-template-columns: 28px max-content;
  align-items: center;
  column-gap: 8px;
}

.opgg-rune-shard-label {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 850;
  line-height: 1.1;
  white-space: nowrap;
}

.opgg-rune-shard-icon {
  background: rgba(var(--accent-rgb), 0.08);
}

.opgg-rune-board-metrics {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 12px;
  justify-items: end;
  padding-top: 34px;
  white-space: nowrap;
}

.opgg-rune-board-metric {
  min-width: 0;
  display: grid;
  gap: 4px;
  justify-items: end;
  text-align: right;
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 950;
  line-height: 1.1;
}

.opgg-rune-board-metric > span {
  color: #38bdf8;
  font-size: 13px;
  font-weight: 850;
}

.opgg-rune-board-metric strong {
  font-size: 16px;
}

.opgg-rune-slot {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.22);
}

.opgg-rune-slot.selected {
  border-color: rgba(var(--accent-rgb), 0.58);
  background: rgba(var(--accent-rgb), 0.12);
  box-shadow: 0 0 0 1px rgba(var(--accent-rgb), 0.12);
}

.opgg-rune-slot.muted {
  opacity: 0.56;
}

.opgg-rune-slot.muted img {
  filter: grayscale(1);
  opacity: 0.48;
}

.opgg-skill-order {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}

.opgg-skill-index {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 900;
}

.opgg-skill-lines {
  min-width: 0;
  display: grid;
  gap: 8px;
}

.opgg-skill-priority,
.opgg-skill-sequence {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: nowrap;
}

.opgg-skill-arrow {
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 900;
}

.opgg-skill-chip {
  width: 25px;
  height: 25px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 950;
  line-height: 1;
}

.opgg-skill-sequence .opgg-skill-chip {
  width: 22px;
  height: 22px;
  font-size: 11px;
}

.opgg-skill-q {
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.1);
}

.opgg-skill-w {
  color: #22c55e;
  background: rgba(34, 197, 94, 0.1);
}

.opgg-skill-e {
  color: #f97316;
  background: rgba(249, 115, 22, 0.1);
}

.opgg-skill-r {
  color: #8b5cf6;
  background: rgba(139, 92, 246, 0.12);
}

.opgg-icon-chain {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: nowrap;
}

.opgg-icon-slot {
  width: 28px;
  height: 28px;
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
  align-self: center;
  min-width: 240px;
  display: grid;
  grid-template-columns: repeat(3, max-content);
  align-content: center;
  align-items: start;
  justify-content: flex-end;
  column-gap: 16px;
  text-align: right;
  white-space: nowrap;
}

.opgg-build-meta-column {
  min-width: 0;
  display: grid;
  grid-template-rows: auto auto;
  align-content: start;
  gap: 4px;
  justify-items: end;
}

.opgg-build-meta strong {
  color: var(--text-primary);
  font-size: 17px;
  line-height: 1.1;
}

.opgg-build-meta span {
  color: #38bdf8;
  font-size: 13px;
  font-weight: 900;
  font-style: normal;
  line-height: 1.1;
  white-space: nowrap;
}

.opgg-build-sample em {
  position: static;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
  font-style: normal;
  line-height: 1;
  white-space: nowrap;
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

@keyframes opgg-spin {
  to {
    transform: rotate(360deg);
  }
}

</style>
