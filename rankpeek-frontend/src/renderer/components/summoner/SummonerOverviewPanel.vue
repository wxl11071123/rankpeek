<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/i18n'
import type { QueueInfo, Summoner, UserTag } from '@/types/api'
import { getProfileIconUrl as getStableProfileIconUrl, markAssetLoadFailed } from '@/utils/gameAssetUrls'
import { buildRankDisplay, type RankLoadStatus, type RankDisplayText } from '@/utils/rankDisplay'
import { maskSummonerName, isPrivacyEnabled } from '@/utils/privacyMode'

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

type UserTagLoadStatus = 'idle' | 'loading' | 'loaded' | 'error'

interface RecentPerformanceStats {
  sampleCount: number
  kda: number | null
  winRate: number | null
  averageDamage: number | null
  averageGold: number | null
  averageParticipation: number | null
}

const props = withDefaults(defineProps<{
  summoner: Summoner
  userTag: UserTag | null
  soloRank: QueueInfo | null
  flexRank: QueueInfo | null
  rankStatus?: RankLoadStatus
  fallbackStats?: RecentPerformanceStats | null
  userTagStatus?: UserTagLoadStatus
  embedded?: boolean
}>(), {
  rankStatus: 'loaded',
  fallbackStats: null,
  userTagStatus: 'idle',
  embedded: false
})

const emit = defineEmits<{
  copyName: []
}>()

const { t } = useI18n()

const recentPerformanceStats = computed<RecentPerformanceStats | null>(() => props.fallbackStats ?? null)

const recentStatsSampleCount = computed(() => recentPerformanceStats.value?.sampleCount ?? 0)
const hasFallbackStats = computed(() => recentStatsSampleCount.value > 0)

const friendRows = computed(() => props.userTag?.recentData?.friendAndDispute?.friendsSummoner.slice(0, 3) || [])
const opponentRows = computed(() => props.userTag?.recentData?.friendAndDispute?.disputeSummoner.slice(0, 3) || [])
const hasRelationships = computed(() => friendRows.value.length > 0 || opponentRows.value.length > 0)

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

const rankDisplayText = computed<RankDisplayText>(() => ({
  loading: t('overview.rankLoading'),
  error: t('overview.rankFailed'),
  unranked: t('tier.UNRANKED'),
  noData: t('overview.rankNoData'),
  wins: count => t('overview.wins', { count })
}))

const rankItems = computed(() => [
  {
    key: 'solo',
    label: t('overview.soloQueue'),
    display: buildRankDisplay(props.soloRank, props.rankStatus, rankDisplayText.value)
  },
  {
    key: 'flex',
    label: t('overview.flexQueue'),
    display: buildRankDisplay(props.flexRank, props.rankStatus, rankDisplayText.value)
  }
])

const statBlocks = computed(() => {
  const recent = recentPerformanceStats.value
  if (!recent) {
    return []
  }

  return [
    {
      key: 'kda',
      label: 'KDA',
      value: formatOptionalDecimal(recent.kda),
      tone: getKdaTone(recent.kda)
    },
    {
      key: 'win-rate',
      label: t('overview.winRate'),
      value: formatOptionalPercent(recent.winRate),
      tone: getRateTone(recent.winRate)
    },
    {
      key: 'damage',
      label: t('common.damage'),
      value: formatOptionalCompactNumber(recent.averageDamage)
    },
    {
      key: 'gold',
      label: t('common.gold'),
      value: formatOptionalCompactNumber(recent.averageGold)
    },
    {
      key: 'participation',
      label: t('overview.participation'),
      value: formatOptionalPercent(recent.averageParticipation)
    }
  ]
})

function fullName(): string {
  const name = props.summoner.tagLine
    ? `${props.summoner.gameName}#${props.summoner.tagLine}`
    : props.summoner.gameName
  return maskSummonerName(name, props.summoner.puuid)
}

const privacyMode = computed(() => isPrivacyEnabled())

function maskedPlayerName(summoner: { gameName: string; tagLine?: string | null; puuid?: string | null }): string {
  const name = summoner.tagLine ? `${summoner.gameName}#${summoner.tagLine}` : summoner.gameName
  return maskSummonerName(name, summoner.puuid)
}

function copyName() {
  void navigator.clipboard?.writeText(fullName()).catch(() => undefined)
  emit('copyName')
}

function getProfileIconUrl(profileIconId?: number): string {
  return getStableProfileIconUrl(profileIconId)
}

function getTierIcon(tier?: string): string {
  const key = tier?.toLowerCase() || 'unranked'
  return tierIconMap[key] || tierIconMap.unranked
}

function formatCompactNumber(value?: number): string {
  const safeValue = Number(value || 0)
  if (safeValue >= 1000000) {
    return `${trimDecimal(safeValue / 1000000)}m`
  }
  if (safeValue >= 1000) {
    return `${trimDecimal(safeValue / 1000)}k`
  }
  return `${Math.round(safeValue)}`
}

function formatOptionalCompactNumber(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '--'
  }
  return formatCompactNumber(value)
}

function formatOptionalDecimal(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '--'
  }
  return value.toFixed(1)
}

function formatOptionalPercent(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '--'
  }
  return `${Math.round(value)}%`
}

function trimDecimal(value: number): string {
  const rounded = value.toFixed(1)
  return rounded.endsWith('.0') ? rounded.slice(0, -2) : rounded
}

function getRateTone(rate?: number | null): string {
  if (rate == null) {
    return 'neutral'
  }
  if (rate >= 55) {
    return 'good'
  }
  if (rate <= 40) {
    return 'bad'
  }
  return 'neutral'
}

function getKdaTone(kda?: number | null): string {
  if (kda == null) {
    return 'neutral'
  }
  if (kda >= 4) {
    return 'good'
  }
  if (kda <= 1.5) {
    return 'bad'
  }
  return 'neutral'
}

function statusMeta() {
  switch (props.userTag?.recordStatus) {
    case 'PRIVATE':
      return {
        label: t('badge.private'),
        className: 'private'
      }
    case 'EMPTY':
      return {
        label: t('matchHistory.emptyTitle'),
        className: 'empty'
      }
    case 'ERROR':
      if (!hasFallbackStats.value) {
        return {
          label: t('badge.error'),
          className: 'error'
        }
      }
      break
    default:
      break
  }

  if (props.userTagStatus === 'error' && !hasFallbackStats.value) {
    return {
      label: t('badge.error'),
      className: 'error'
    }
  }

  if (props.userTagStatus === 'loaded' && !props.userTag?.tag?.length) {
    return {
      label: t('badge.noTags'),
      className: 'empty'
    }
  }

  return null
}
</script>

<template>
  <div
    class="overview-panel"
    :class="{ embedded: props.embedded }"
  >
    <section class="identity-section">
      <div class="avatar-wrapper">
        <img
          v-if="getProfileIconUrl(summoner.profileIconId)"
          class="avatar-img"
          :src="getProfileIconUrl(summoner.profileIconId)"
          alt=""
          @error="markAssetLoadFailed"
        >
        <span
          v-else
          class="avatar-img avatar-fallback"
        />
        <span class="level-badge">{{ summoner.summonerLevel }}</span>
      </div>

      <div class="identity-copy">
        <div class="riot-id-line">
          <span class="user-name">{{ privacyMode ? fullName() : summoner.gameName }}</span>
          <button
            v-if="!privacyMode"
            class="riot-id"
            type="button"
            :aria-label="t('overview.copy')"
            @click="copyName"
          >
            <span>#{{ summoner.tagLine }}</span>
            <svg
              class="copy-icon"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path d="M7 3.5A2.5 2.5 0 0 1 9.5 1h5A2.5 2.5 0 0 1 17 3.5v5A2.5 2.5 0 0 1 14.5 11h-5A2.5 2.5 0 0 1 7 8.5v-5Zm2.5-.9a.9.9 0 0 0-.9.9v5a.9.9 0 0 0 .9.9h5a.9.9 0 0 0 .9-.9v-5a.9.9 0 0 0-.9-.9h-5Z" />
              <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H6v1.6h-.5a.9.9 0 0 0-.9.9v6a.9.9 0 0 0 .9.9h6a.9.9 0 0 0 .9-.9V14H14v.5a2.5 2.5 0 0 1-2.5 2.5h-6A2.5 2.5 0 0 1 3 14.5v-6Z" />
            </svg>
          </button>
        </div>

        <span
          v-if="statusMeta()"
          class="status-chip"
          :class="statusMeta()!.className"
        >
          {{ statusMeta()!.label }}
        </span>

        <div
          v-else-if="userTag?.tag?.length"
          class="tags-row"
        >
          <span
            v-for="tag in userTag.tag"
            :key="tag.tagName"
            class="tag"
            :class="tag.good === true ? 'good' : tag.good === false ? 'bad' : 'neutral'"
            :title="tag.tagDesc"
          >
            {{ tag.tagName }}
          </span>
        </div>
      </div>
    </section>

    <section
      class="rank-section"
      aria-label="rank summary"
    >
      <article
        v-for="rank in rankItems"
        :key="rank.key"
        class="rank-item"
        :title="rank.label"
      >
        <img
          class="rank-img"
          :src="getTierIcon(rank.display.iconTier)"
          alt=""
        >
        <div class="rank-copy">
          <strong class="rank-tier">{{ rank.display.tierText }}</strong>
          <span
            v-if="rank.display.recordText"
            class="rank-record"
          >{{ rank.display.recordText }}</span>
        </div>
      </article>
    </section>

    <section
      v-if="statBlocks.length"
      class="stats-section"
      aria-label="recent performance"
    >
      <article
        v-for="stat in statBlocks"
        :key="stat.key"
        class="stat-block"
        :class="stat.tone"
      >
        <span class="stat-label">{{ stat.label }}</span>
        <strong class="stat-value">{{ stat.value }}</strong>
      </article>
      <span class="sample-count">{{ t('overview.recentStatsSample', { count: recentStatsSampleCount }) }}</span>
    </section>

    <section
      v-if="hasRelationships"
      class="relationship-section"
      aria-label="relationship summary"
    >
      <div
        v-if="friendRows.length"
        class="relationship-group"
      >
        <span class="relationship-title good">{{ t('overview.bestAllies') }}</span>
        <div class="relationship-list">
          <div
            v-for="friend in friendRows"
            :key="friend.summoner.puuid"
            class="relationship-item"
          >
            <img
              v-if="getProfileIconUrl(friend.summoner.profileIconId)"
              class="relationship-avatar"
              :src="getProfileIconUrl(friend.summoner.profileIconId)"
              alt=""
              @error="markAssetLoadFailed"
            >
            <span
              v-else
              class="relationship-avatar relationship-avatar-fallback"
            />
            <span class="relationship-name">{{ privacyMode ? maskedPlayerName(friend.summoner) : friend.summoner.gameName }}</span>
            <span class="relationship-rate">{{ friend.winRate }}%</span>
          </div>
        </div>
      </div>

      <div
        v-if="opponentRows.length"
        class="relationship-group"
      >
        <span class="relationship-title bad">{{ t('overview.toughOpponents') }}</span>
        <div class="relationship-list">
          <div
            v-for="enemy in opponentRows"
            :key="enemy.summoner.puuid"
            class="relationship-item"
          >
            <img
              v-if="getProfileIconUrl(enemy.summoner.profileIconId)"
              class="relationship-avatar"
              :src="getProfileIconUrl(enemy.summoner.profileIconId)"
              alt=""
              @error="markAssetLoadFailed"
            >
            <span
              v-else
              class="relationship-avatar relationship-avatar-fallback"
            />
            <span class="relationship-name">{{ privacyMode ? maskedPlayerName(enemy.summoner) : enemy.summoner.gameName }}</span>
            <span class="relationship-rate">{{ enemy.winRate }}%</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.overview-panel {
  --overview-divider: var(--border-subtle);
  --overview-good: var(--success-color);
  --overview-bad: var(--error-color);
  display: grid;
  grid-template-columns: minmax(210px, 0.95fr) minmax(170px, 230px) minmax(330px, 1.35fr);
  gap: clamp(10px, 1.25vw, 18px);
  align-items: center;
  min-width: 0;
  max-width: 100%;
  color: var(--text-primary);
}

[data-theme="dark"] .overview-panel {
  --overview-divider: var(--border-subtle);
  --overview-good: var(--success-color);
  --overview-bad: var(--error-color);
}

[data-theme="light"] .overview-panel {
  --overview-divider: var(--border-subtle);
  --overview-good: var(--success-color);
  --overview-bad: var(--error-color);
}

.identity-section,
.rank-section,
.stats-section,
.relationship-section {
  min-width: 0;
}

.identity-section {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 14px;
  align-items: center;
}

.avatar-wrapper {
  position: relative;
  width: 62px;
  height: 62px;
  flex: 0 0 auto;
}

.avatar-img {
  display: block;
  width: 62px;
  height: 62px;
  border: 1px solid var(--border-color);
  border-radius: 18px;
  object-fit: cover;
  background: var(--bg-tertiary);
}

.avatar-img[data-asset-failed='true'] {
  display: none;
}

.level-badge {
  position: absolute;
  right: -5px;
  bottom: -5px;
  min-width: 24px;
  height: 20px;
  padding: 0 6px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-pill);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}

.identity-copy {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.riot-id-line {
  display: flex;
  flex-wrap: nowrap;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
}

.user-name {
  min-width: 0;
  color: var(--text-primary);
  font-size: 19px;
  font-weight: 760;
  line-height: 1.12;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.riot-id {
  display: inline-flex;
  flex: 0 1 auto;
  align-items: center;
  gap: 4px;
  width: fit-content;
  max-width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
}

.riot-id span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copy-icon {
  width: 12px;
  height: 12px;
  flex: 0 0 auto;
  fill: currentColor;
  opacity: 0;
  transform: translateX(-2px);
  transition: opacity var(--transition-fast), transform var(--transition-fast), color var(--transition-fast);
}

.riot-id:hover,
.riot-id:focus-visible {
  color: var(--accent-color);
}

.riot-id:hover .copy-icon,
.riot-id:focus-visible .copy-icon {
  opacity: 1;
  transform: translateX(0);
}

.tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  min-width: 0;
}

.tag,
.status-chip {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  max-width: 100%;
  padding: 3px 8px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-pill);
  background: transparent;
  font-size: 11px;
  font-weight: 650;
  line-height: 1.2;
}

.tag {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag.good,
.status-chip.private {
  color: var(--success-color);
}

.tag.bad,
.status-chip.error {
  color: var(--error-color);
}

.tag.neutral,
.status-chip.empty {
  color: var(--text-secondary);
}

.rank-section {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  justify-self: stretch;
  max-width: 230px;
  padding-inline: 14px;
  border-inline: 1px solid var(--overview-divider);
}

.rank-item {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  min-width: 0;
  max-width: 100%;
}

.rank-img {
  width: 42px;
  height: 42px;
  object-fit: contain;
}

.rank-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.rank-tier {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 760;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-record {
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stats-section {
  display: grid;
  grid-template-columns: repeat(5, minmax(50px, 1fr));
  gap: clamp(6px, 0.8vw, 10px);
  align-items: center;
  min-width: 0;
}

.stat-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  min-width: 0;
}

.stat-value {
  display: block;
  color: var(--text-primary);
  font-size: clamp(19px, 1.8vw, 24px);
  font-weight: 780;
  line-height: 1.05;
  letter-spacing: 0;
  white-space: nowrap;
}

.stat-block.good .stat-value {
  color: var(--overview-good);
}

.stat-block.bad .stat-value {
  color: var(--overview-bad);
}

.stat-label,
.sample-count {
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.25;
  white-space: nowrap;
}

.sample-count {
  grid-column: 1 / -1;
  margin-top: -2px;
}

.relationship-section {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  padding-top: 12px;
  border-top: 1px solid var(--overview-divider);
}

.relationship-group {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.relationship-title {
  flex: 0 0 auto;
  color: var(--text-tertiary);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
}

.relationship-title.good {
  color: var(--success-color);
}

.relationship-title.bad {
  color: var(--error-color);
}

.relationship-list {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  min-width: 0;
}

.relationship-item {
  display: inline-grid;
  grid-template-columns: 20px minmax(54px, auto) auto;
  gap: 5px;
  align-items: center;
  min-width: 0;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.2;
}

.relationship-avatar {
  display: block;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  object-fit: cover;
  background: var(--bg-tertiary);
}

.relationship-avatar[data-asset-failed='true'] {
  display: none;
}

.relationship-name {
  min-width: 0;
  max-width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.relationship-rate {
  color: var(--text-tertiary);
  font-weight: 700;
}

@media (max-width: 1180px) {
  .overview-panel {
    grid-template-columns: minmax(190px, 0.9fr) minmax(160px, 210px) minmax(300px, 1.4fr);
    gap: 12px;
  }

  .rank-section {
    max-width: 210px;
    padding-inline: 12px;
  }

  .rank-item {
    grid-template-columns: 40px minmax(0, 1fr);
    gap: 7px;
  }

  .rank-img {
    width: 40px;
    height: 40px;
  }

  .stats-section {
    grid-template-columns: repeat(5, minmax(50px, 1fr));
    gap: 6px;
  }

  .stat-value {
    font-size: clamp(18px, 1.6vw, 22px);
  }
}

@media (max-width: 980px) {
  .overview-panel {
    grid-template-columns: minmax(0, 1fr) minmax(150px, 210px);
    gap: 12px;
  }

  .rank-section {
    grid-template-columns: minmax(0, 1fr);
    max-width: 210px;
    padding: 0 0 0 12px;
    border-inline: 0;
    border-left: 1px solid var(--overview-divider);
  }

  .stats-section {
    grid-column: 1 / -1;
    grid-template-columns: repeat(5, minmax(50px, 1fr));
    gap: 6px;
    padding-top: 14px;
    border-top: 1px solid var(--overview-divider);
  }
}

@media (max-width: 760px) {
  .overview-panel {
    grid-template-columns: minmax(0, 1fr) minmax(140px, 190px);
    gap: 10px;
  }

  .rank-section {
    grid-template-columns: minmax(0, 1fr);
    max-width: 190px;
    padding-left: 10px;
  }

  .stat-value {
    font-size: 22px;
  }

  .relationship-section {
    flex-direction: column;
    align-items: stretch;
  }

  .relationship-group {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (max-width: 560px) {
  .overview-panel {
    grid-template-columns: minmax(0, 1fr) minmax(128px, 160px);
  }

  .identity-section {
    gap: 10px;
  }

  .rank-section {
    max-width: 160px;
  }
}
</style>
