<script setup lang="ts">
import { computed } from 'vue'
import AssetHoverTooltip from '@/components/common/AssetHoverTooltip.vue'
import { useI18n } from '@/i18n'
import type { MatchHistory, Participant, Stats, UserTagSummary } from '@/types/api'
import {
  getAugmentIconUrl,
  getAugmentAssetDetails,
  getAugmentRarityClass,
  getAugmentTooltipDetails,
  getChampionIconUrl,
  getItemIconSlots,
  getItemAssetDetails,
  getItemTooltipDetails,
  getPerkIconUrl,
  getPerkAssetDetails,
  getPerkTooltipDetails,
  getSummonerSpellIconUrl,
  getSummonerSpellTooltipDetails,
  markAssetLoadFailed,
  type GameAssetTooltipDetails
} from '@/utils/gameAssetUrls'
import {
  getMatchPerformanceTags,
  type MatchPerformanceTag
} from '@/utils/matchPerformanceTags'
import { isRemakeMatch } from '@/utils/matchHistorySampling'

interface MatchLoadoutIconSlot {
  key: string
  kind: 'spell' | 'perk' | 'augment'
  id: number
  url: string
}

type MatchTraitMode = 'perk' | 'augment'
type SavedAiReportMode = 'review' | 'praise'

interface SavedAiReports {
  review?: boolean
  praise?: boolean
}

interface MatchTraitIconSlot {
  key: string
  kind: MatchTraitMode
  id: number | null
  url: string
  empty: boolean
  label?: string
  rarityClass?: string
}

const props = withDefaults(defineProps<{
  match: MatchHistory
  currentPuuid?: string
  currentSummonerName?: string
  userTagSummaries?: Record<string, UserTagSummary>
  expanded?: boolean
  savedAiReports?: SavedAiReports
}>(), {
  currentPuuid: '',
  currentSummonerName: '',
  userTagSummaries: () => ({}),
  expanded: false,
  savedAiReports: () => ({})
})

const emit = defineEmits<{
  'open-detail': [match: MatchHistory]
  'navigate-to-player': [gameName: string, tagLine: string]
  'open-saved-ai-report': [match: MatchHistory, mode: SavedAiReportMode]
}>()

const { t } = useI18n()

const currentPlayer = computed(() => getCurrentPlayer(props.match))
const currentStats = computed(() => currentPlayer.value?.stats)
const kdaRatioText = computed(() => formatKdaRatio(currentStats.value))
const killParticipationText = computed(() => formatKillParticipation(currentPlayer.value, props.match.participants || []))
const isWin = computed(() => Boolean(currentStats.value?.win))
const isRemake = computed(() => isRemakeMatch(props.match))
const resultText = computed(() =>
  isRemake.value ? '重开' : isWin.value ? t('common.win') : t('common.loss')
)
const blueTeamSlots = computed(() => getTeamChampionSlots(props.match, 100))
const redTeamSlots = computed(() => getTeamChampionSlots(props.match, 200))
const currentItemSlots = computed(() => getItemIconSlots(currentStats.value))
const currentSpellSlots = computed(() => getSpellSlots(currentPlayer.value))
const currentTraitMode = computed<MatchTraitMode>(() =>
  hasValidAugment(currentPlayer.value) ? 'augment' : 'perk'
)
const currentTraitSlots = computed(() => getTraitSlots(currentPlayer.value))
const performanceTags = computed<MatchPerformanceTag[]>(() =>
  getMatchPerformanceTags(currentPlayer.value, props.match.participants || [])
)
const hasSavedAiReports = computed(() => Boolean(props.savedAiReports.review || props.savedAiReports.praise))

function getTeamChampionSlots(match: MatchHistory, teamId: number): Array<Participant | null> {
  const players = (match.participants || [])
    .filter(participant => participant.teamId === teamId)
    .sort((left, right) => left.participantId - right.participantId)
    .slice(0, 5)

  return Array.from({ length: 5 }, (_, index) => players[index] || null)
}

function getCurrentPlayer(match: MatchHistory): Participant | null {
  if (!props.currentPuuid) {
    return null
  }

  const identity = (match.participantIdentities || []).find(
    item => item.player?.puuid === props.currentPuuid
  )
  if (!identity) {
    return null
  }

  return (match.participants || []).find(
    item => item.participantId === identity.participantId
  ) || null
}

function getSpellSlots(participant: Participant | null | undefined): MatchLoadoutIconSlot[] {
  return [participant?.spell1Id, participant?.spell2Id]
    .map<MatchLoadoutIconSlot | null>((spellId, index) => {
      const id = normalizePositiveInteger(spellId)
      const url = getSummonerSpellIconUrl(id)
      return id && url
        ? {
            key: `spell-${index}-${id}`,
            kind: 'spell' as const,
            id,
            url
          }
        : null
    })
    .filter((slot): slot is MatchLoadoutIconSlot => slot !== null)
}

function getTraitSlots(participant: Participant | null | undefined): MatchTraitIconSlot[] {
  const statsRecord = participant?.stats as unknown as Record<string, unknown> | null | undefined
  const participantRecord = participant as unknown as Record<string, unknown> | null | undefined

  if (hasValidAugment(participant)) {
    return buildAugmentTraitSlots(statsRecord, participantRecord)
  }

  return buildPerkTraitSlots(statsRecord, participantRecord)
}

function hasValidAugment(participant: Participant | null | undefined): boolean {
  const statsRecord = participant?.stats as unknown as Record<string, unknown> | null | undefined
  const participantRecord = participant as unknown as Record<string, unknown> | null | undefined
  return getAugmentKeys().some(key => readTraitId(statsRecord, participantRecord, key) !== null)
}

function buildPerkTraitSlots(
  statsRecord: Record<string, unknown> | null | undefined,
  participantRecord: Record<string, unknown> | null | undefined
): MatchTraitIconSlot[] {
  const primaryId = readTraitId(statsRecord, participantRecord, 'perk0') ||
    readNestedPerkSelectionId(statsRecord, participantRecord, 0) ||
    readNestedPerkId(statsRecord, participantRecord, 0)
  const secondaryId = readTraitId(statsRecord, participantRecord, 'perkSubStyle') ||
    readNestedPerkPropertyId(statsRecord, participantRecord, [
      'perkSubStyle',
      'subStyle',
      'secondaryStyle',
      'secondaryStyleId'
    ]) ||
    readNestedPerkStyleId(statsRecord, participantRecord, 1) ||
    readTraitId(statsRecord, participantRecord, 'perk5') ||
    readNestedPerkSelectionId(statsRecord, participantRecord, 5) ||
    readNestedPerkId(statsRecord, participantRecord, 5) ||
    readTraitId(statsRecord, participantRecord, 'perk4') ||
    readNestedPerkSelectionId(statsRecord, participantRecord, 4) ||
    readNestedPerkId(statsRecord, participantRecord, 4) ||
    readTraitId(statsRecord, participantRecord, 'perkPrimaryStyle') ||
    readNestedPerkPropertyId(statsRecord, participantRecord, [
      'perkStyle',
      'primaryStyle',
      'primaryStyleId'
    ]) ||
    readNestedPerkStyleId(statsRecord, participantRecord, 0)

  return [
    createTraitSlot('perk', 0, primaryId),
    createTraitSlot('perk', 1, secondaryId)
  ]
}

function buildAugmentTraitSlots(
  statsRecord: Record<string, unknown> | null | undefined,
  participantRecord: Record<string, unknown> | null | undefined
): MatchTraitIconSlot[] {
  const keys = getAugmentKeys()
  return Array.from({ length: 6 }, (_, index) =>
    createTraitSlot('augment', index, readTraitId(statsRecord, participantRecord, keys[index]))
  )
}

function createTraitSlot(kind: MatchTraitMode, index: number, id: number | null): MatchTraitIconSlot {
  const url = id === null
    ? ''
    : kind === 'augment'
      ? getAugmentIconUrl(id)
      : getPerkIconUrl(id)
  return {
    key: `${kind}-${index}-${id || 'empty'}`,
    kind,
    id,
    url,
    empty: id === null || !url,
    label: getTraitSlotLabel(kind, id),
    rarityClass: getTraitRarityClass(kind, id)
  }
}

function getTraitRarityClass(kind: MatchTraitMode, id: number | null): string {
  if (kind !== 'augment' || id === null) {
    return ''
  }

  return getAugmentRarityClass(getAugmentAssetDetails(id)?.rarity)
}

function readTraitId(
  statsRecord: Record<string, unknown> | null | undefined,
  participantRecord: Record<string, unknown> | null | undefined,
  key: string
): number | null {
  const extraFields = statsRecord?.extraFields as Record<string, unknown> | null | undefined
  return normalizePositiveInteger(statsRecord?.[key] ?? participantRecord?.[key] ?? extraFields?.[key])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readNestedPerkStyleId(
  statsRecord: Record<string, unknown> | null | undefined,
  participantRecord: Record<string, unknown> | null | undefined,
  styleIndex: number
): number | null {
  const style = readNestedPerkStyles(statsRecord, participantRecord)?.[styleIndex]
  return isRecord(style) ? normalizePositiveInteger(style.style) : null
}

function readNestedPerkPropertyId(
  statsRecord: Record<string, unknown> | null | undefined,
  participantRecord: Record<string, unknown> | null | undefined,
  keys: string[]
): number | null {
  for (const perks of readNestedPerkRecords(statsRecord, participantRecord)) {
    for (const key of keys) {
      const id = normalizePositiveInteger(perks[key])
      if (id !== null) {
        return id
      }
    }
  }

  return null
}

function readNestedPerkId(
  statsRecord: Record<string, unknown> | null | undefined,
  participantRecord: Record<string, unknown> | null | undefined,
  perkIndex: number
): number | null {
  for (const perks of readNestedPerkRecords(statsRecord, participantRecord)) {
    if (!Array.isArray(perks.perkIds)) {
      continue
    }

    const id = normalizePositiveInteger(perks.perkIds[perkIndex])
    if (id !== null) {
      return id
    }
  }

  return null
}

function readNestedPerkSelectionId(
  statsRecord: Record<string, unknown> | null | undefined,
  participantRecord: Record<string, unknown> | null | undefined,
  selectionIndex: number
): number | null {
  const styles = readNestedPerkStyles(statsRecord, participantRecord)
  if (!styles) {
    return null
  }

  let currentIndex = 0
  for (const style of styles) {
    if (!isRecord(style) || !Array.isArray(style.selections)) {
      continue
    }

    for (const selection of style.selections) {
      if (currentIndex === selectionIndex) {
        return isRecord(selection) ? normalizePositiveInteger(selection.perk) : null
      }
      currentIndex += 1
    }
  }

  return null
}

function readNestedPerkStyles(
  statsRecord: Record<string, unknown> | null | undefined,
  participantRecord: Record<string, unknown> | null | undefined
): unknown[] | null {
  for (const perks of readNestedPerkRecords(statsRecord, participantRecord)) {
    if (Array.isArray(perks.styles)) {
      return perks.styles
    }
  }

  return null
}

function readNestedPerkRecords(
  statsRecord: Record<string, unknown> | null | undefined,
  participantRecord: Record<string, unknown> | null | undefined
): Record<string, unknown>[] {
  const statsExtraFieldsValue = statsRecord?.extraFields
  const participantExtraFieldsValue = participantRecord?.extraFields
  const statsExtraFields = isRecord(statsExtraFieldsValue) ? statsExtraFieldsValue : null
  const participantExtraFields = isRecord(participantExtraFieldsValue) ? participantExtraFieldsValue : null
  const perkSources = [
    statsRecord?.perks,
    participantRecord?.perks,
    statsExtraFields?.perks,
    participantExtraFields?.perks
  ]

  return perkSources.filter((perks): perks is Record<string, unknown> => isRecord(perks))
}

function getAugmentKeys(): string[] {
  return [
    'playerAugment1',
    'playerAugment2',
    'playerAugment3',
    'playerAugment4',
    'playerAugment5',
    'playerAugment6'
  ]
}

function getTraitSlotLabel(kind: MatchTraitMode, id: number | null): string {
  if (id === null) {
    return kind === 'augment' ? '空强化槽' : '空符文槽'
  }
  const details = kind === 'augment' ? getAugmentAssetDetails(id) : getPerkAssetDetails(id)
  const fallback = kind === 'augment' ? '强化' : '符文'
  return details?.name ? `${details.name} (${id})` : `${fallback} ${id}`
}

function getTraitTooltipDetails(slot: MatchTraitIconSlot): GameAssetTooltipDetails | null {
  if (slot.empty || slot.id === null) {
    return null
  }

  return slot.kind === 'augment'
    ? getAugmentTooltipDetails(slot.id)
    : getPerkTooltipDetails(slot.id)
}

function getItemSlotLabel(slot: { itemId: number | null, empty: boolean }): string {
  if (slot.empty || slot.itemId === null) {
    return '空装备槽'
  }
  const details = getItemAssetDetails(slot.itemId)
  return details?.name ? `${details.name} (${slot.itemId})` : `装备 ${slot.itemId}`
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

function formatDuration(seconds?: number): string {
  const safeSeconds = seconds || 0
  const minutes = Math.floor(safeSeconds / 60)
  const remain = safeSeconds % 60
  return `${minutes}:${String(remain).padStart(2, '0')}`
}

function formatShortDate(timestamp?: number): string {
  if (!timestamp) {
    return '--'
  }
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

/** 对局开始时间（月/日 时:分），列表右侧展示，时长放在 tooltip 里 */
function formatStartTime(timestamp?: number): string {
  if (!timestamp) {
    return '--'
  }
  const date = new Date(timestamp)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${date.getMonth() + 1}/${date.getDate()} ${hours}:${minutes}`
}

function formatKda(stats?: Stats): string {
  return `${stats?.kills || 0} / ${stats?.deaths || 0} / ${stats?.assists || 0}`
}

function formatKdaRatio(stats?: Stats): string {
  if (!stats) {
    return '--'
  }

  const kills = stats.kills || 0
  const deaths = stats.deaths || 0
  const assists = stats.assists || 0
  const kda = deaths === 0 ? kills + assists : (kills + assists) / deaths
  return kda.toFixed(1)
}

function formatKillParticipation(participant: Participant | null | undefined, participants: Participant[]): string {
  if (!participant?.stats) {
    return '--'
  }

  const kills = participant.stats.kills || 0
  const assists = participant.stats.assists || 0
  const teamKills = participants
    .filter(player => player.teamId === participant.teamId)
    .reduce((total, player) => total + (player.stats?.kills || 0), 0)

  if (teamKills <= 0) {
    return '--'
  }

  return `${Math.round(((kills + assists) / teamKills) * 100)}%`
}

function displayMode(match: MatchHistory): string {
  return match.queueName || match.gameMode || t('common.unknownMode')
}

function handleCardClick(event: MouseEvent): void {
  if (isInteractiveCardClickTarget(event.target)) {
    return
  }

  emit('open-detail', props.match)
}

function isInteractiveCardClickTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false
  }

  return target.closest('button, a, input, select, textarea, [role="button"], [data-card-click-ignore], .asset-tooltip-trigger') !== null
}

function openSavedAiReport(mode: SavedAiReportMode): void {
  emit('open-saved-ai-report', props.match, mode)
}
</script>

<template>
  <article
    class="match-history-card"
    :class="{ remake: isRemake, win: !isRemake && isWin, loss: !isRemake && !isWin, expanded }"
    @click="handleCardClick"
  >
    <div class="match-meta">
      <strong class="result-text">{{ resultText }}</strong>
      <span>{{ displayMode(match) }}</span>
      <span :title="`时长 ${formatDuration(match.gameDuration)}`">{{ formatStartTime(match.gameCreation) }}</span>
    </div>

    <div class="player-summary">
      <div class="identity-row">
        <div class="champion-block">
          <img
            v-if="getChampionIconUrl(currentPlayer?.championId)"
            class="champion-avatar"
            :src="getChampionIconUrl(currentPlayer?.championId)"
            alt=""
            @error="markAssetLoadFailed"
          />
          <span v-else class="champion-avatar placeholder"></span>
        </div>

        <div v-if="currentSpellSlots.length" class="loadout-column spell-column" aria-label="summoner spells">
          <span
            v-for="slot in currentSpellSlots"
            :key="slot.key"
            class="loadout-slot"
            :class="`loadout-slot-${slot.kind}`"
          >
            <AssetHoverTooltip
              v-if="slot.url && getSummonerSpellTooltipDetails(slot.id)"
              :details="getSummonerSpellTooltipDetails(slot.id)!"
            >
              <img :src="slot.url" alt="" @error="markAssetLoadFailed" />
            </AssetHoverTooltip>
            <img v-else-if="slot.url" :src="slot.url" alt="" @error="markAssetLoadFailed" />
          </span>
        </div>

        <div
          :class="currentTraitMode === 'augment' ? 'trait-grid' : 'trait-column'"
          aria-label="runes or augments"
        >
          <span
            v-for="slot in currentTraitSlots"
            :key="slot.key"
            class="loadout-slot trait-slot"
            :aria-label="slot.label"
            :class="[
              `loadout-slot-${slot.kind}`,
              slot.rarityClass,
              { empty: slot.empty }
            ]"
          >
            <AssetHoverTooltip
              v-if="slot.url && !slot.empty && getTraitTooltipDetails(slot)"
              :details="getTraitTooltipDetails(slot)!"
            >
              <img v-if="slot.url" :src="slot.url" alt="" @error="markAssetLoadFailed" />
            </AssetHoverTooltip>
            <img v-else-if="slot.url" :src="slot.url" alt="" @error="markAssetLoadFailed" />
          </span>
        </div>

        <div class="combat-block">
          <strong class="kda-line">{{ formatKda(currentStats) }}</strong>
          <span class="kda-ratio-line">KDA {{ kdaRatioText }}</span>
        </div>

        <div class="participation-block">
          <span>参团率</span>
          <strong>{{ killParticipationText }}</strong>
        </div>
      </div>

      <div class="build-strip">
        <div class="item-row" aria-label="items">
          <span
            v-for="slot in currentItemSlots"
            :key="`${match.gameId}-item-${slot.index}`"
            class="item-slot"
            :aria-label="getItemSlotLabel(slot)"
            :class="{ empty: slot.empty }"
          >
            <AssetHoverTooltip
              v-if="slot.url && !slot.empty && slot.itemId !== null"
              :details="getItemTooltipDetails(slot.itemId)!"
            >
              <img v-if="slot.url" :src="slot.url" alt="" @error="markAssetLoadFailed" />
            </AssetHoverTooltip>
            <img v-else-if="slot.url" :src="slot.url" alt="" @error="markAssetLoadFailed" />
          </span>
        </div>

        <div v-if="performanceTags.length" class="performance-tags" aria-label="performance tags">
          <span
            v-for="tag in performanceTags"
            :key="tag.key"
            class="performance-tag"
            :class="`tone-${tag.tone || 'neutral'}`"
          >
            {{ tag.label }}
          </span>
        </div>
      </div>
    </div>

    <div
      class="saved-ai-actions"
      :class="{ empty: !hasSavedAiReports }"
      :data-card-click-ignore="hasSavedAiReports ? '' : null"
    >
      <button
        v-if="savedAiReports.review"
        class="saved-ai-action saved-ai-action-review"
        type="button"
        @click.stop="openSavedAiReport('review')"
      >
        复盘报告
      </button>
      <button
        v-if="savedAiReports.praise"
        class="saved-ai-action saved-ai-action-praise"
        type="button"
        @click.stop="openSavedAiReport('praise')"
      >
        夸夸报告
      </button>
    </div>

    <div class="teams-strip" aria-label="5v5 champion thumbnails">
      <div class="team-row blue" aria-label="blue team champions">
        <span
          v-for="(participant, index) in blueTeamSlots"
          :key="`${match.gameId}-blue-${index}`"
          class="mini-champion"
          :class="{ active: participant?.participantId === currentPlayer?.participantId, empty: !participant }"
        >
          <img
            v-if="getChampionIconUrl(participant?.championId)"
            :src="getChampionIconUrl(participant?.championId)"
            alt=""
            @error="markAssetLoadFailed"
          />
        </span>
      </div>

      <div class="team-row red" aria-label="red team champions">
        <span
          v-for="(participant, index) in redTeamSlots"
          :key="`${match.gameId}-red-${index}`"
          class="mini-champion"
          :class="{ active: participant?.participantId === currentPlayer?.participantId, empty: !participant }"
        >
          <img
            v-if="getChampionIconUrl(participant?.championId)"
            :src="getChampionIconUrl(participant?.championId)"
            alt=""
            @error="markAssetLoadFailed"
          />
        </span>
      </div>
    </div>

    <button
      class="detail-chevron"
      :class="{ expanded }"
      type="button"
      :aria-expanded="expanded"
      :aria-label="expanded ? 'Collapse match detail' : 'Expand match detail'"
      @click.stop="emit('open-detail', match)"
    >
      <svg class="chevron-icon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 6l4 4 4-4" />
      </svg>
    </button>
  </article>
</template>

<style scoped>
.match-history-card {
  --card-bg: #ffffff;
  --card-bg-hover: #f6f8fa;
  --card-bg-win: #f1f7f3;
  --card-bg-win-hover: #e8f2ec;
  --card-bg-loss: #fbf2f3;
  --card-bg-loss-hover: #f7e8ea;
  --card-border: rgba(24, 35, 54, 0.13);
  --card-border-hover: rgba(47, 111, 188, 0.3);
  --slot-bg: rgba(34, 46, 65, 0.08);
  --slot-border: rgba(34, 46, 65, 0.1);
  --avatar-border: rgba(255, 255, 255, 0.88);
  --team-blue: #2f73b8;
  --team-red: #cb4d5a;
  --win-color: #16865a;
  --loss-color: #c54856;
  --remake-color: #6b7280;
  --saved-ai-actions-width: 74px;
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 86px) minmax(0, 1fr) var(--saved-ai-actions-width) auto auto;
  gap: 12px;
  align-items: center;
  width: 100%;
  max-width: 100%;
  min-height: 98px;
  min-width: 0;
  box-sizing: border-box;
  /* 长列表：屏外卡片跳过布局与绘制，滚动时省 CPU */
  content-visibility: auto;
  contain-intrinsic-size: auto 98px;
  overflow: hidden;
  padding: 10px 12px;
  border: 1px solid var(--card-border);
  border-radius: 4px;
  background: var(--card-bg);
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

/* 胜/负用整块色面表达，不再用左边的装饰竖条 */
.match-history-card.win {
  background: var(--card-bg-win);
}

.match-history-card.loss {
  background: var(--card-bg-loss);
}

[data-theme="dark"] .match-history-card {
  --card-bg: #141a23;
  --card-bg-hover: #18202b;
  --card-bg-win: #0f2019;
  --card-bg-win-hover: #12271e;
  --card-bg-loss: #211316;
  --card-bg-loss-hover: #2a181c;
  --card-border: rgba(255, 255, 255, 0.07);
  --card-border-hover: rgba(92, 163, 234, 0.32);
  --slot-bg: rgba(255, 255, 255, 0.055);
  --slot-border: rgba(255, 255, 255, 0.07);
  --avatar-border: rgba(255, 255, 255, 0.12);
  --team-blue: #5ca3ea;
  --team-red: #de6f6f;
  --win-color: #62d49e;
  --loss-color: #ee7a82;
  --remake-color: #a3aab6;
}

.saved-ai-actions {
  display: grid;
  gap: 6px;
  align-items: center;
  justify-items: stretch;
  width: var(--saved-ai-actions-width);
  min-width: var(--saved-ai-actions-width);
}

.saved-ai-actions.empty {
  pointer-events: none;
}

.saved-ai-action {
  width: 100%;
  min-height: 26px;
  padding: 0 9px;
  border: 1px solid rgba(96, 176, 255, 0.32);
  border-radius: 7px;
  background: rgba(41, 151, 255, 0.1);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 850;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
}

.saved-ai-action:hover,
.saved-ai-action:focus-visible {
  border-color: rgba(96, 176, 255, 0.58);
  background: rgba(41, 151, 255, 0.18);
  outline: none;
  transform: translateY(-1px);
}

.saved-ai-action-praise {
  border-color: rgba(245, 184, 118, 0.34);
  background: rgba(245, 184, 118, 0.11);
}

[data-theme="light"] .match-history-card {
  --card-bg: #ffffff;
  --card-bg-hover: #f6f8fa;
  --card-bg-win: #f1f7f3;
  --card-bg-win-hover: #e8f2ec;
  --card-bg-loss: #fbf2f3;
  --card-bg-loss-hover: #f7e8ea;
  --card-border: rgba(24, 35, 54, 0.13);
  --card-border-hover: rgba(47, 111, 188, 0.3);
  --slot-bg: rgba(34, 46, 65, 0.08);
  --slot-border: rgba(34, 46, 65, 0.1);
  --avatar-border: rgba(255, 255, 255, 0.88);
  --team-blue: #2f73b8;
  --team-red: #cb4d5a;
  --win-color: #16865a;
  --loss-color: #c54856;
  --remake-color: #6b7280;
}

.match-history-card:hover {
  border-color: var(--card-border-hover);
  background: var(--card-bg-hover);
}

.match-history-card.win:hover {
  background: var(--card-bg-win-hover);
}

.match-history-card.loss:hover {
  background: var(--card-bg-loss-hover);
}

.match-history-card.expanded {
  border-bottom-right-radius: 4px;
  border-bottom-left-radius: 4px;
}

.match-meta {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.25;
}

.match-meta span,
.result-text {
  font-variant-numeric: tabular-nums;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-text {
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 900;
  letter-spacing: 0.02em;
  line-height: 1.15;
}

.match-history-card.win .result-text {
  color: var(--win-color);
}

.match-history-card.loss .result-text {
  color: var(--loss-color);
}

.match-history-card.remake .result-text {
  color: var(--remake-color);
}

.player-summary {
  --loadout-slot-size: 19px;
  --trait-grid-gap: 3px;
  --spell-column-width: var(--loadout-slot-size);
  --trait-column-width: calc((var(--loadout-slot-size) * 3) + (var(--trait-grid-gap) * 2));
  --combat-column-width: 98px;
  --participation-column-width: 54px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 7px;
  min-width: 0;
  max-width: 100%;
}

.identity-row {
  display: grid;
  grid-template-columns: 42px var(--spell-column-width) var(--trait-column-width) var(--combat-column-width) var(--participation-column-width);
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
}

.champion-block {
  display: flex;
  grid-column: 1;
  align-items: center;
  flex: 0 0 auto;
  min-width: 0;
}

.champion-avatar {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  border: 1px solid var(--avatar-border);
  border-radius: 7px;
  object-fit: cover;
  background: var(--bg-tertiary);
}

.champion-avatar[data-asset-failed='true'],
.loadout-slot img[data-asset-failed='true'],
.item-slot img[data-asset-failed='true'],
.mini-champion img[data-asset-failed='true'] {
  display: none;
}

.placeholder {
  display: inline-block;
}

.combat-block {
  display: flex;
  grid-column: 4;
  flex-direction: column;
  justify-content: center;
  flex: 0 1 auto;
  width: var(--combat-column-width);
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.participation-block {
  display: flex;
  grid-column: 5;
  flex: 0 0 54px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: var(--participation-column-width);
  margin-left: 0;
  color: var(--text-secondary);
  line-height: 1.1;
  text-align: center;
  white-space: nowrap;
}

.participation-block span {
  font-size: 10px;
  font-weight: 750;
}

.participation-block strong {
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 900;
}

.loadout-column {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  flex: 0 0 auto;
  min-width: 0;
}

.spell-column {
  grid-column: 2;
}

.trait-column,
.trait-grid {
  grid-column: 3;
}

.trait-column {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 0 0 auto;
  min-width: 0;
}

.trait-grid {
  display: grid;
  grid-template-columns: repeat(3, var(--loadout-slot-size));
  grid-auto-rows: var(--loadout-slot-size);
  gap: var(--trait-grid-gap);
  flex: 0 0 auto;
  align-content: center;
}

.loadout-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--loadout-slot-size);
  height: var(--loadout-slot-size);
  flex: 0 0 var(--loadout-slot-size);
  overflow: hidden;
  border: 1px solid var(--augment-rarity-border, var(--slot-border));
  border-radius: 4px;
  background: var(--augment-rarity-bg, var(--slot-bg));
}

.trait-slot {
  width: var(--loadout-slot-size);
  height: var(--loadout-slot-size);
  flex: 0 0 var(--loadout-slot-size);
}

.loadout-slot-perk {
  border-radius: 50%;
}

.loadout-slot-augment {
  border-radius: 4px;
}

.trait-slot.loadout-slot-perk,
.trait-slot.loadout-slot-augment {
  border-radius: 4px;
}

.loadout-slot.empty,
.trait-slot.empty {
  border-color: var(--slot-border);
  background: var(--slot-bg);
}

.loadout-slot img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.kda-line {
  color: var(--text-primary);
  font-size: 17px;
  line-height: 1.12;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kda-ratio-line {
  margin-top: 3px;
  color: var(--accent-color);
  font-size: 11px;
  font-weight: 800;
  line-height: 1.1;
  white-space: nowrap;
}

.build-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.performance-tags {
  display: flex;
  flex-wrap: nowrap;
  gap: 3px;
  flex: 1 1 auto;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.performance-tag {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  min-width: 0;
  padding: 2px 5px;
  border: 1px solid rgba(124, 139, 164, 0.18);
  border-radius: 999px;
  background: rgba(124, 139, 164, 0.1);
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 700;
  line-height: 1.1;
  white-space: nowrap;
}

.performance-tag.tone-accent {
  border-color: rgba(var(--accent-rgb), 0.28);
  background: rgba(var(--accent-rgb), 0.13);
  color: var(--accent-color);
}

.performance-tag.tone-success {
  border-color: rgba(40, 170, 112, 0.26);
  background: rgba(40, 170, 112, 0.12);
  color: var(--win-color);
}

.performance-tag.tone-warning {
  border-color: rgba(219, 164, 60, 0.3);
  background: rgba(219, 164, 60, 0.13);
  color: #d89b35;
}

.performance-tag.tone-danger {
  border-color: rgba(207, 83, 96, 0.28);
  background: rgba(207, 83, 96, 0.12);
  color: var(--loss-color);
}

.item-row {
  display: flex;
  flex-wrap: nowrap;
  gap: 3px;
  flex: 0 0 172px;
  width: 172px;
  min-width: 0;
  overflow: hidden;
}

.item-slot {
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  border-radius: 4px;
  background: var(--slot-bg);
  overflow: hidden;
}

.item-slot img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.teams-strip {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.team-row {
  display: flex;
  gap: 4px;
  min-width: 0;
}

.mini-champion {
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  border: 1px solid var(--slot-border);
  border-radius: 5px;
  background: var(--slot-bg);
  overflow: hidden;
}

.mini-champion.active {
  outline: 2px solid var(--accent-color);
  outline-offset: -2px;
}

.mini-champion img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.mini-champion.empty {
  opacity: 0.55;
}

.detail-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid rgba(124, 139, 164, 0.18);
  border-radius: 6px;
  background: rgba(124, 139, 164, 0.08);
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    color 0.16s ease,
    border-color 0.16s ease,
    background 0.16s ease;
}

.detail-chevron:hover,
.detail-chevron:focus-visible,
.detail-chevron.expanded {
  border-color: rgba(var(--accent-rgb), 0.34);
  background: rgba(var(--accent-rgb), 0.12);
  color: var(--accent-color);
}

.chevron-icon {
  width: 14px;
  height: 14px;
  transition: transform 0.16s ease;
}

.detail-chevron.expanded .chevron-icon {
  transform: rotate(180deg);
}

.chevron-icon path {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (max-width: 1100px) {
  .match-history-card {
    --saved-ai-actions-width: 72px;
    grid-template-columns: minmax(0, 82px) minmax(0, 1fr) var(--saved-ai-actions-width) auto auto;
    gap: 10px;
  }

  .mini-champion {
    width: 24px;
    height: 24px;
    flex-basis: 24px;
  }
}

@media (max-width: 720px) {
  .match-history-card {
    --saved-ai-actions-width: 68px;
    grid-template-columns: minmax(0, 68px) minmax(0, 1fr) var(--saved-ai-actions-width) auto auto;
    gap: 8px;
    min-height: 96px;
    padding-right: 10px;
  }

  .player-summary {
    --loadout-slot-size: 17px;
    --trait-grid-gap: 2px;
    --combat-column-width: 78px;
    --participation-column-width: 46px;
    gap: 6px;
  }

  .identity-row,
  .build-strip {
    gap: 6px;
  }

  .identity-row {
    grid-template-columns: 36px var(--spell-column-width) var(--trait-column-width) var(--combat-column-width) var(--participation-column-width);
  }

  .champion-avatar {
    width: 36px;
    height: 36px;
  }

  .kda-line {
    font-size: 15px;
  }

  .trait-grid {
    gap: 2px;
  }

  .performance-tag {
    padding-inline: 4px;
    font-size: 9px;
  }

  .item-row {
    gap: 2px;
    flex-basis: 138px;
    width: 138px;
  }

  .item-slot {
    width: 18px;
    height: 18px;
    flex-basis: 18px;
  }

  .mini-champion {
    width: 24px;
    height: 24px;
    flex-basis: 24px;
  }

  .team-row {
    gap: 3px;
  }
}
</style>
