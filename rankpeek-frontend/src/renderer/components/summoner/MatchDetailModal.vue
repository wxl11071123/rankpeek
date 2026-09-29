<template>
  <div v-if="visible && displayGameDetail" class="match-detail-overlay" @click.self="close">
    <div class="match-detail-modal">
      <button class="close-btn" type="button" @click="close">x</button>

      <header class="match-hero">
        <div class="hero-main">
          <div class="result-pill" :class="{ win: myPlayer?.stats?.win, lose: !myPlayer?.stats?.win }">
            {{ myPlayer?.stats?.win ? t('common.win') : t('common.loss') }}
          </div>
          <div class="hero-copy">
            <h3>{{ queueLabel }}</h3>
            <p>{{ formatDate(displayGameDetail.gameCreation) }} · {{ formatDuration(displayGameDetail.gameDuration) }}</p>
          </div>
        </div>

        <div v-if="myPlayer" class="hero-player">
          <div class="hero-player-row">
            <span class="hero-avatar asset-frame champion-frame">
              <img
                v-if="getChampionIconUrl(myPlayer.championId)"
                :src="getChampionIconUrl(myPlayer.championId)"
                alt=""
                @error="markAssetLoadFailed"
              />
            </span>

            <div v-if="hasHeroLoadoutIcons" class="hero-loadout-stack" aria-label="summoner spells and runes">
              <div v-if="mySpellSlots.length" class="loadout-row">
                <span
                  v-for="slot in mySpellSlots"
                  :key="`hero-spell-${slot.index}`"
                  class="loadout-slot loadout-slot-spell"
                >
                  <img :src="slot.url" alt="" @error="markAssetLoadFailed" />
                </span>
              </div>
              <div v-if="myPerkSlots.length || myAugmentSlots.length" class="loadout-row">
                <span
                  v-for="slot in myPerkSlots"
                  :key="slot.key"
                  class="loadout-slot"
                  :class="`loadout-slot-${slot.kind}`"
                >
                  <img :src="slot.url" alt="" @error="markAssetLoadFailed" />
                </span>
                <span
                  v-for="slot in myAugmentSlots"
                  :key="slot.key"
                  class="loadout-slot"
                  :class="`loadout-slot-${slot.kind}`"
                >
                  <img :src="slot.url" alt="" @error="markAssetLoadFailed" />
                </span>
              </div>
            </div>

            <div class="hero-player-copy">
              <strong>{{ currentPlayerName }}</strong>
              <span>{{ getKdaText(myPlayer) }}</span>
            </div>
          </div>

          <div v-if="myPerformanceTags.length" class="performance-tags hero-tags" aria-label="performance tags">
            <span
              v-for="tag in myPerformanceTags"
              :key="tag.key"
              class="performance-tag"
              :class="`tone-${tag.tone || 'neutral'}`"
            >
              {{ tag.label }}
            </span>
          </div>
        </div>

        <div v-else class="hero-player empty">
          <strong>{{ t('matchDetail.noCurrentPlayer') }}</strong>
          <span>{{ t('matchDetail.title') }}</span>
        </div>
      </header>

      <div v-if="detailNotice" class="detail-load-state" :class="detailStatus" role="status">
        {{ detailNotice }}
      </div>

      <section class="summary-grid">
        <div v-for="metric in summaryStats" :key="metric.key" class="summary-cell">
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
        </div>
      </section>

      <nav class="detail-tabs" :aria-label="t('matchDetail.title')">
        <button
          v-for="tab in detailTabs"
          :key="tab.key"
          type="button"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </nav>

      <section v-if="activeTab === 'overview'" class="tab-panel overview-panel">
        <div class="teams-grid">
          <article class="team-card team-blue-card">
            <div class="team-header blue">
              <strong>{{ t('common.blueTeam') }}</strong>
              <span>{{ getTeamKda(blueTeamTotals) }} · {{ formatNumber(blueTeamTotals.goldEarned) }} {{ t('common.gold') }}</span>
            </div>
            <div class="team-list">
              <button
                v-for="player in blueTeamPlayers"
                :key="player.participantId"
                class="participant-row"
                :class="{ me: player.isCurrentPlayer, clickable: canNavigateToPlayer(player) }"
                :disabled="!canNavigateToPlayer(player)"
                @click="handlePlayerClick(player)"
              >
                <PlayerLine :player="player" />
              </button>
            </div>
          </article>

          <article class="team-card team-red-card">
            <div class="team-header red">
              <strong>{{ t('common.redTeam') }}</strong>
              <span>{{ getTeamKda(redTeamTotals) }} · {{ formatNumber(redTeamTotals.goldEarned) }} {{ t('common.gold') }}</span>
            </div>
            <div class="team-list">
              <button
                v-for="player in redTeamPlayers"
                :key="player.participantId"
                class="participant-row"
                :class="{ me: player.isCurrentPlayer, clickable: canNavigateToPlayer(player) }"
                :disabled="!canNavigateToPlayer(player)"
                @click="handlePlayerClick(player)"
              >
                <PlayerLine :player="player" />
              </button>
            </div>
          </article>
        </div>
      </section>

      <section v-else-if="activeTab === 'damage'" class="tab-panel metric-panel">
        <MetricRows :rows="damageRows" />
      </section>

      <section v-else-if="activeTab === 'economy'" class="tab-panel metric-panel">
        <MetricRows :rows="economyRows" />
      </section>

      <section v-else-if="activeTab === 'vision'" class="tab-panel metric-panel">
        <MetricRows :rows="visionRows" />
      </section>

      <section v-else class="tab-panel items-panel">
        <div class="item-team-list">
          <button
            v-for="player in allPlayers"
            :key="player.participantId"
            class="item-player-row"
            :class="{ me: player.isCurrentPlayer, clickable: canNavigateToPlayer(player) }"
            :disabled="!canNavigateToPlayer(player)"
            @click="handlePlayerClick(player)"
          >
            <div class="item-player-main">
              <span class="champion-icon asset-frame champion-frame">
                <img
                  v-if="getChampionIconUrl(player.championId)"
                  :src="getChampionIconUrl(player.championId)"
                  alt=""
                  @error="markAssetLoadFailed"
                />
              </span>
              <span class="player-name">{{ getPlayerName(player) }}</span>
            </div>
            <div class="player-build">
              <span
                v-for="slot in getPlayerItemSlots(player)"
                :key="`${player.participantId}-items-tab-${slot.index}`"
                class="item-slot"
                :class="{ empty: slot.empty }"
              >
                <img v-if="slot.url" :src="slot.url" alt="" @error="markAssetLoadFailed" />
              </span>
            </div>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref, watch, type PropType } from 'vue'
import UserTagBadgeList from '@/components/summoner/UserTagBadgeList.vue'
import { useI18n } from '@/i18n'
import type {
  GameDetail,
  GameParticipant,
  GameParticipantIdentity,
  GameStats,
  GameTimeline,
  MatchHistory,
  UserTagSummary
} from '@/types/api'
import {
  getAugmentIconUrl,
  getChampionIconUrl,
  getItemIconSlots,
  getPerkIconUrl,
  getSummonerSpellIconUrl,
  markAssetLoadFailed,
  type ItemIconSlot
} from '@/utils/gameAssetUrls'
import {
  getMatchPerformanceTags,
  type MatchPerformanceTag
} from '@/utils/matchPerformanceTags'
import {
  calculateKda,
  formatDuration,
  formatNumber,
  getCreepScore,
  getCurrentParticipant,
  getTeamParticipants,
  sumTeamStats,
  type MatchDetailParticipant,
  type TeamStatsSummary
} from '@/utils/matchDetailMetrics'

type DetailTabKey = 'overview' | 'damage' | 'economy' | 'vision' | 'items'

interface SummaryStatItem {
  key: string
  label: string
  value: string
}

interface MetricDefinition {
  key: string
  label: string
  read: (player: MatchDetailParticipant) => number | null
  format?: (value: number | null) => string
}

interface MetricValue {
  key: string
  label: string
  value: string
}

interface PlayerMetricRow {
  player: MatchDetailParticipant
  values: MetricValue[]
  ratio: number
}

interface SpellSlot {
  index: number
  spellId: number | null
  url: string
}

interface LoadoutIconSlot {
  key: string
  kind: 'perk' | 'augment'
  id: number
  url: string
}

const props = withDefaults(defineProps<{
  visible: boolean
  gameDetail: GameDetail | null
  matchHistory: MatchHistory | null
  currentPuuid: string
  currentSummonerName: string
  detailStatus?: 'idle' | 'loading' | 'loaded' | 'error'
  userTagSummaries?: Record<string, UserTagSummary>
}>(), {
  detailStatus: 'idle',
  userTagSummaries: () => ({})
})

const emit = defineEmits<{
  close: []
  navigateToPlayer: [gameName: string, tagLine: string]
}>()

const { t } = useI18n()
const activeTab = ref<DetailTabKey>('overview')

const fallbackGameDetail = computed<GameDetail | null>(() => toGameDetailFromMatchHistory(props.matchHistory))
const displayGameDetail = computed<GameDetail | null>(() => {
  const detail = isRenderableGameDetail(props.gameDetail) ? props.gameDetail : null
  return detail ? mergeGameDetailWithSummary(detail, fallbackGameDetail.value) : fallbackGameDetail.value
})
const myPlayer = computed(() => getCurrentParticipant(displayGameDetail.value, props.currentPuuid))
const blueTeamPlayers = computed(() => getTeamParticipants(displayGameDetail.value, 100, props.currentPuuid))
const redTeamPlayers = computed(() => getTeamParticipants(displayGameDetail.value, 200, props.currentPuuid))
const allPlayers = computed(() => [...blueTeamPlayers.value, ...redTeamPlayers.value])
const blueTeamTotals = computed(() => sumTeamStats(blueTeamPlayers.value))
const redTeamTotals = computed(() => sumTeamStats(redTeamPlayers.value))
const myPerformanceTags = computed<MatchPerformanceTag[]>(() =>
  getMatchPerformanceTags(myPlayer.value, allPlayers.value)
)
const mySpellSlots = computed(() => myPlayer.value
  ? getPlayerSpellSlots(myPlayer.value).filter(slot => Boolean(slot.url))
  : []
)
const myPerkSlots = computed(() => myPlayer.value ? getPlayerPerkSlots(myPlayer.value, 1) : [])
const myAugmentSlots = computed(() => myPlayer.value ? getPlayerAugmentSlots(myPlayer.value, 4) : [])
const hasHeroLoadoutIcons = computed(() =>
  mySpellSlots.value.length > 0 ||
  myPerkSlots.value.length > 0 ||
  myAugmentSlots.value.length > 0
)

const queueLabel = computed(() => props.matchHistory?.queueName || displayGameDetail.value?.gameMode || t('common.unknownMode'))
const currentPlayerName = computed(() => myPlayer.value?.displayName || props.currentSummonerName || t('common.unknownPlayer'))
const detailNotice = computed(() => {
  if (props.detailStatus === 'loading' && !isRenderableGameDetail(props.gameDetail)) {
    return t('matchDetail.loadingFallback')
  }
  if (props.detailStatus === 'error') {
    return t('matchDetail.failedFallback')
  }
  return ''
})

const detailTabs = computed<Array<{ key: DetailTabKey; label: string }>>(() => [
  { key: 'overview', label: t('matchDetail.overviewTab') },
  { key: 'damage', label: t('matchDetail.damageTab') },
  { key: 'economy', label: t('matchDetail.economyTab') },
  { key: 'vision', label: t('matchDetail.visionTab') },
  { key: 'items', label: t('matchDetail.itemsTab') }
])

const summaryStats = computed<SummaryStatItem[]>(() => {
  const player = myPlayer.value
  if (!player) {
    return [
      { key: 'duration', label: t('matchDetail.duration'), value: formatDuration(displayGameDetail.value?.gameDuration) },
      { key: 'players', label: t('matchDetail.players'), value: String(allPlayers.value.length) }
    ]
  }

  return [
    { key: 'kda', label: 'KDA', value: getKdaText(player) },
    { key: 'cs', label: t('common.cs'), value: formatNumber(getCreepScore(player.stats)) },
    { key: 'gold', label: t('common.gold'), value: formatNumber(player.stats?.goldEarned) },
    { key: 'damage', label: t('common.damage'), value: formatNumber(player.stats?.totalDamageDealtToChampions) },
    { key: 'taken', label: t('matchDetail.damageTaken'), value: formatNumber(player.stats?.totalDamageTaken) },
    { key: 'vision', label: t('matchDetail.vision'), value: formatNumber(getVisionScore(player)) }
  ]
})

const damageRows = computed<PlayerMetricRow[]>(() => makeMetricRows([
  { key: 'total', label: t('common.damage'), read: player => readStatNumber(player, 'totalDamageDealtToChampions') },
  { key: 'magic', label: t('matchDetail.magicDamage'), read: player => readStatNumber(player, 'magicDamageDealtToChampions') },
  { key: 'physical', label: t('matchDetail.physicalDamage'), read: player => readStatNumber(player, 'physicalDamageDealtToChampions') },
  { key: 'true', label: t('matchDetail.trueDamage'), read: player => readStatNumber(player, 'trueDamageDealtToChampions') },
  { key: 'taken', label: t('matchDetail.damageTaken'), read: player => readStatNumber(player, 'totalDamageTaken') }
]))

const economyRows = computed<PlayerMetricRow[]>(() => makeMetricRows([
  { key: 'gold', label: t('common.gold'), read: player => readStatNumber(player, 'goldEarned') },
  { key: 'spent', label: t('matchDetail.goldSpent'), read: player => readStatNumber(player, 'goldSpent') },
  { key: 'cs', label: t('common.cs'), read: player => getCreepScore(player.stats) },
  { key: 'neutral', label: t('matchDetail.neutralCs'), read: player => readStatNumber(player, 'neutralMinionsKilled') },
  { key: 'csMin', label: t('matchDetail.csPerMinute'), read: getCsPerMinute, format: formatDecimal }
]))

const visionRows = computed<PlayerMetricRow[]>(() => makeMetricRows([
  { key: 'vision', label: t('matchDetail.visionScore'), read: getVisionScore },
  { key: 'placed', label: t('matchDetail.wardsPlaced'), read: player => readStatNumber(player, 'wardsPlaced') },
  { key: 'killed', label: t('matchDetail.wardsKilled'), read: player => readStatNumber(player, 'wardsKilled') },
  { key: 'control', label: t('matchDetail.controlWards'), read: player => readStatNumber(player, 'detectorWardsPlaced', 'visionWardsBoughtInGame') }
]))

watch(() => props.visible, visible => {
  if (visible) {
    activeTab.value = 'overview'
  }
})

function close() {
  emit('close')
}

function getPlayerSummary(player: MatchDetailParticipant): UserTagSummary | undefined {
  return player.puuid ? props.userTagSummaries?.[player.puuid] : undefined
}

function getPlayerName(player: MatchDetailParticipant): string {
  return player.displayName || `${t('common.unknownPlayer')} ${player.participantId}`
}

function getPlayerItemSlots(player: MatchDetailParticipant): ItemIconSlot[] {
  return getItemIconSlots(player.stats)
}

function getPlayerSpellSlots(player: MatchDetailParticipant): SpellSlot[] {
  return [player.spell1Id, player.spell2Id].map((spellId, index) => {
    const normalizedSpellId = normalizePositiveInteger(spellId)
    return {
      index,
      spellId: normalizedSpellId,
      url: getSummonerSpellIconUrl(normalizedSpellId)
    }
  })
}

function getPlayerPerkSlots(player: MatchDetailParticipant, limit: number): LoadoutIconSlot[] {
  return getPlayerStatIconSlots(player, ['perk0'], getPerkIconUrl, 'perk', limit)
}

function getPlayerAugmentSlots(player: MatchDetailParticipant, limit: number): LoadoutIconSlot[] {
  return getPlayerStatIconSlots(
    player,
    ['playerAugment1', 'playerAugment2', 'playerAugment3', 'playerAugment4'],
    getAugmentIconUrl,
    'augment',
    limit
  )
}

function getPlayerStatIconSlots(
  player: MatchDetailParticipant,
  keys: string[],
  resolveUrl: (id?: number | null) => string,
  kind: LoadoutIconSlot['kind'],
  limit: number
): LoadoutIconSlot[] {
  return keys
    .map(key => {
      const id = normalizePositiveInteger(readStatNumber(player, key))
      const url = resolveUrl(id)
      return id && url
        ? {
            key: `${kind}-${key}-${id}`,
            kind,
            id,
            url
          }
        : null
    })
    .filter((slot): slot is LoadoutIconSlot => slot !== null)
    .slice(0, limit)
}

function getPrimaryPerkUrl(player: MatchDetailParticipant): string {
  return getPerkIconUrl(readStatNumber(player, 'perk0'))
}

function getKdaText(player: MatchDetailParticipant): string {
  const kills = readStatNumber(player, 'kills') ?? 0
  const deaths = readStatNumber(player, 'deaths') ?? 0
  const assists = readStatNumber(player, 'assists') ?? 0
  const kda = calculateKda(kills, deaths, assists).toFixed(1)
  return `${kills}/${deaths}/${assists} · ${kda}`
}

function getTeamKda(totals: TeamStatsSummary): string {
  return `${totals.kills}/${totals.deaths}/${totals.assists}`
}

function getVisionScore(player: MatchDetailParticipant): number {
  return readStatNumber(player, 'visionScore')
    ?? ((readStatNumber(player, 'wardsPlaced') ?? 0)
      + (readStatNumber(player, 'wardsKilled') ?? 0)
      + (readStatNumber(player, 'detectorWardsPlaced', 'visionWardsBoughtInGame') ?? 0))
}

function getCsPerMinute(player: MatchDetailParticipant): number | null {
  const duration = normalizePositiveNumber(displayGameDetail.value?.gameDuration)
  if (!duration) {
    return null
  }
  return Math.round((getCreepScore(player.stats) / (duration / 60)) * 10) / 10
}

function makeMetricRows(definitions: MetricDefinition[]): PlayerMetricRow[] {
  const rawRows = allPlayers.value.map(player => {
    const primaryValue = definitions[0]?.read(player) ?? 0
    return {
      player,
      primaryValue,
      values: definitions.map(definition => {
        const value = definition.read(player)
        return {
          key: definition.key,
          label: definition.label,
          value: definition.format ? definition.format(value) : formatNumber(value)
        }
      })
    }
  })
  const maxValue = Math.max(1, ...rawRows.map(row => row.primaryValue))

  return rawRows.map(row => ({
    player: row.player,
    values: row.values,
    ratio: Math.round((row.primaryValue / maxValue) * 100)
  }))
}

function canNavigateToPlayer(player: MatchDetailParticipant): boolean {
  return Boolean(player.gameName && !player.isCurrentPlayer)
}

function handlePlayerClick(player: MatchDetailParticipant) {
  if (!canNavigateToPlayer(player)) {
    return
  }
  emit('navigateToPlayer', player.gameName, player.tagLine)
  close()
}

function formatDate(timestamp?: number): string {
  if (!timestamp) {
    return '--'
  }
  return new Date(timestamp).toLocaleString()
}

function formatDecimal(value: number | null): string {
  return value == null ? '--' : value.toFixed(1)
}

function readStatNumber(player: MatchDetailParticipant, ...keys: string[]): number | null {
  const stats = player.stats as unknown as Record<string, unknown> | null | undefined
  for (const key of keys) {
    const value = stats?.[key]
    const normalized = typeof value === 'number' && Number.isFinite(value) ? value : null
    if (normalized !== null) {
      return normalized
    }
  }
  return null
}

function normalizePositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

function normalizePositiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function toGameDetailFromMatchHistory(match: MatchHistory | null): GameDetail | null {
  if (!match) {
    return null
  }

  return {
    gameId: match.gameId,
    gameMode: match.gameMode,
    gameType: match.gameType,
    mapId: 0,
    queueId: match.queueId,
    gameDuration: match.gameDuration,
    gameCreation: match.gameCreation,
    participantIdentities: (match.participantIdentities || []).map(toGameParticipantIdentity),
    participants: (match.participants || []).map(toGameParticipant)
  }
}

function toGameParticipant(participant: MatchHistory['participants'][number]): GameParticipant {
  return {
    participantId: participant.participantId,
    teamId: participant.teamId,
    championId: participant.championId,
    spell1Id: participant.spell1Id,
    spell2Id: participant.spell2Id,
    teamPosition: participant.teamPosition,
    individualPosition: participant.individualPosition,
    selectedPosition: participant.selectedPosition,
    stats: toGameStats(participant.stats),
    timeline: {
      lane: participant.teamPosition || participant.lane || participant.individualPosition || '',
      role: participant.role || '',
      teamPosition: participant.teamPosition,
      rawLane: participant.lane,
      rawRole: participant.role
    }
  }
}

function toGameParticipantIdentity(identity: MatchHistory['participantIdentities'][number]): GameParticipantIdentity {
  return {
    participantId: identity.participantId,
    player: {
      accountId: identity.player?.accountId ?? 0,
      puuid: identity.player?.puuid ?? '',
      platformId: identity.player?.platformId ?? '',
      summonerName: identity.player?.summonerName ?? '',
      gameName: identity.player?.gameName ?? '',
      tagLine: identity.player?.tagLine ?? '',
      summonerId: identity.player?.summonerId ?? 0
    }
  }
}

function mergeGameDetailWithSummary(detail: GameDetail, summary: GameDetail | null): GameDetail {
  if (!summary?.participants?.length) {
    return detail
  }

  const summaryByParticipantId = new Map(summary.participants.map(participant => [participant.participantId, participant]))
  return {
    ...detail,
    participants: (detail.participants || []).map(participant =>
      mergeGameParticipantWithSummary(participant, summaryByParticipantId.get(participant.participantId))
    )
  }
}

function mergeGameParticipantWithSummary(
  participant: GameParticipant,
  summaryParticipant?: GameParticipant
): GameParticipant {
  if (!summaryParticipant) {
    return participant
  }

  return {
    ...participant,
    teamPosition: participant.teamPosition || summaryParticipant.teamPosition,
    individualPosition: participant.individualPosition || summaryParticipant.individualPosition,
    selectedPosition: participant.selectedPosition || summaryParticipant.selectedPosition,
    stats: mergeGameStatsWithSummary(participant.stats, summaryParticipant.stats),
    timeline: mergeGameTimelineWithSummary(participant.timeline, summaryParticipant.timeline)
  }
}

function mergeGameTimelineWithSummary(timeline: GameTimeline, summaryTimeline?: GameTimeline): GameTimeline {
  if (!summaryTimeline) {
    return timeline
  }

  return {
    ...timeline,
    lane: timeline?.lane || summaryTimeline.lane,
    role: timeline?.role || summaryTimeline.role,
    teamPosition: timeline?.teamPosition || summaryTimeline.teamPosition,
    positionCn: timeline?.positionCn || summaryTimeline.positionCn,
    rawLane: timeline?.rawLane || summaryTimeline.rawLane,
    rawRole: timeline?.rawRole || summaryTimeline.rawRole
  }
}

function mergeGameStatsWithSummary(stats: GameStats, summaryStats?: GameStats): GameStats {
  if (!summaryStats) {
    return stats
  }

  const merged: GameStats = {
    ...stats,
    perks: stats.perks || summaryStats.perks,
    challenges: stats.challenges || summaryStats.challenges,
    extraFields: {
      ...(summaryStats.extraFields || {}),
      ...(stats.extraFields || {})
    }
  }
  if (!summaryStats.extraFields && !stats.extraFields) {
    delete merged.extraFields
  }

  fillPositiveSummaryStats(merged, summaryStats)
  fillMissingSummaryStats(merged, summaryStats)
  return merged
}

function fillPositiveSummaryStats(target: GameStats, source: GameStats): void {
  const positiveSummaryStatKeys: Array<keyof GameStats> = [
    'perk0',
    'perk1',
    'perk2',
    'perk3',
    'perk4',
    'perk5',
    'perkPrimaryStyle',
    'perkSubStyle',
    'playerAugment1',
    'playerAugment2',
    'playerAugment3',
    'playerAugment4',
    'item0',
    'item1',
    'item2',
    'item3',
    'item4',
    'item5',
    'item6',
    'doubleKills',
    'tripleKills',
    'quadraKills',
    'pentaKills',
    'largestKillingSpree',
    'legendaryCount',
    'totalDamageDealtToChampions',
    'goldEarned',
    'visionScore',
    'totalHeal'
  ]

  positiveSummaryStatKeys.forEach(key => {
    const summaryValue = source[key]
    if (normalizePositiveNumber(summaryValue) && !normalizePositiveNumber(target[key])) {
      (target as unknown as Record<string, unknown>)[key] = summaryValue
    }
  })
}

function fillMissingSummaryStats(target: GameStats, source: GameStats): void {
  const missingSummaryStatKeys: Array<keyof GameStats> = [
    'damageDealtToChampionsRate',
    'damageTakenRate',
    'healRate',
    'mvp',
    'minionsKilled',
    'damageDealtToTurrets'
  ]

  missingSummaryStatKeys.forEach(key => {
    if (target[key] == null && source[key] != null) {
      (target as unknown as Record<string, unknown>)[key] = source[key]
    }
  })
}

function toGameStats(stats: MatchHistory['participants'][number]['stats'] | undefined): GameStats {
  return {
    win: stats?.win ?? false,
    kills: stats?.kills ?? 0,
    deaths: stats?.deaths ?? 0,
    assists: stats?.assists ?? 0,
    totalMinionsKilled: stats?.totalMinionsKilled ?? 0,
    neutralMinionsKilled: stats?.neutralMinionsKilled ?? 0,
    goldEarned: stats?.goldEarned ?? 0,
    totalDamageDealtToChampions: stats?.totalDamageDealtToChampions ?? 0,
    totalDamageTaken: stats?.totalDamageTaken ?? 0,
    totalHeal: stats?.totalHeal ?? 0,
    visionScore: stats?.visionScore,
    visionWardsBoughtInGame: 0,
    wardsPlaced: 0,
    wardsKilled: 0,
    largestMultiKill: 0,
    doubleKills: stats?.doubleKills ?? 0,
    tripleKills: stats?.tripleKills ?? 0,
    quadraKills: stats?.quadraKills ?? 0,
    pentaKills: stats?.pentaKills ?? 0,
    largestKillingSpree: stats?.largestKillingSpree,
    legendaryCount: stats?.legendaryCount,
    item0: stats?.item0 ?? 0,
    item1: stats?.item1 ?? 0,
    item2: stats?.item2 ?? 0,
    item3: stats?.item3 ?? 0,
    item4: stats?.item4 ?? 0,
    item5: stats?.item5 ?? 0,
    item6: stats?.item6 ?? 0,
    damageDealtToChampionsRate: stats?.damageDealtToChampionsRate,
    damageTakenRate: stats?.damageTakenRate,
    healRate: stats?.healRate,
    mvp: stats?.mvp,
    perk0: stats?.perk0,
    perk1: stats?.perk1,
    perk2: stats?.perk2,
    perk3: stats?.perk3,
    perk4: stats?.perk4,
    perk5: stats?.perk5,
    perkPrimaryStyle: stats?.perkPrimaryStyle,
    perkSubStyle: stats?.perkSubStyle,
    perks: stats?.perks,
    minionsKilled: stats?.minionsKilled,
    damageDealtToTurrets: stats?.damageDealtToTurrets,
    playerAugment1: stats?.playerAugment1,
    playerAugment2: stats?.playerAugment2,
    playerAugment3: stats?.playerAugment3,
    playerAugment4: stats?.playerAugment4,
    challenges: stats?.challenges,
    extraFields: stats?.extraFields
  }
}

function isRenderableGameDetail(detail: GameDetail | null): detail is GameDetail {
  return Boolean(detail?.participants?.some(participant =>
    participant?.teamId != null &&
    participant.championId != null &&
    participant.stats?.kills != null &&
    participant.stats.deaths != null &&
    participant.stats.assists != null
  ))
}

const PlayerLine = defineComponent({
  name: 'PlayerLine',
  props: {
    player: {
      type: Object as PropType<MatchDetailParticipant>,
      required: true
    }
  },
  setup(componentProps) {
    return () => h('div', { class: 'participant-line' }, [
      h('div', { class: 'player-identity' }, [
        h('span', { class: 'champion-icon asset-frame champion-frame' }, [
          getChampionIconUrl(componentProps.player.championId)
            ? h('img', {
                src: getChampionIconUrl(componentProps.player.championId),
                alt: '',
                onError: markAssetLoadFailed
              })
            : null
        ]),
        h('div', { class: 'name-stack' }, [
          h('div', { class: 'player-name-row' }, [
            h('span', { class: 'player-name' }, getPlayerName(componentProps.player)),
            componentProps.player.isCurrentPlayer
              ? h('span', { class: 'me-tag' }, t('common.me'))
              : null
          ]),
          h(UserTagBadgeList, {
            compact: true,
            recordStatus: getPlayerSummary(componentProps.player)?.recordStatus,
            tags: getPlayerSummary(componentProps.player)?.tag
          })
        ])
      ]),
      h('div', { class: 'spell-rune-stack' }, [
        h('div', { class: 'spell-row' }, getPlayerSpellSlots(componentProps.player).map(slot =>
          h('span', {
            key: `spell-${slot.index}`,
            class: ['spell-slot', { empty: !slot.url }]
          }, slot.url
            ? [h('img', { src: slot.url, alt: '', onError: markAssetLoadFailed })]
            : [])
        )),
        h('span', { class: ['perk-slot', { empty: !getPrimaryPerkUrl(componentProps.player) }] },
          getPrimaryPerkUrl(componentProps.player)
            ? [h('img', { src: getPrimaryPerkUrl(componentProps.player), alt: '', onError: markAssetLoadFailed })]
            : []
        )
      ]),
      h('div', { class: 'stat-grid' }, [
        h('span', getKdaText(componentProps.player)),
        h('span', formatNumber(getCreepScore(componentProps.player.stats))),
        h('span', formatNumber(componentProps.player.stats?.goldEarned)),
        h('span', formatNumber(componentProps.player.stats?.totalDamageDealtToChampions)),
        h('span', formatNumber(componentProps.player.stats?.totalDamageTaken)),
        h('span', formatNumber(getVisionScore(componentProps.player)))
      ]),
      h('div', { class: 'player-build' }, getPlayerItemSlots(componentProps.player).map(slot =>
        h('span', {
          key: `item-${slot.index}`,
          class: ['item-slot', { empty: slot.empty }]
        }, slot.url
          ? [h('img', { src: slot.url, alt: '', onError: markAssetLoadFailed })]
          : [])
      ))
    ])
  }
})

const MetricRows = defineComponent({
  name: 'MetricRows',
  props: {
    rows: {
      type: Array as PropType<PlayerMetricRow[]>,
      required: true
    }
  },
  setup(componentProps) {
    return () => h('div', { class: 'metric-list' }, componentProps.rows.map(row =>
      h('button', {
        key: row.player.participantId,
        class: ['metric-row', { me: row.player.isCurrentPlayer, clickable: canNavigateToPlayer(row.player) }],
        disabled: !canNavigateToPlayer(row.player),
        onClick: () => handlePlayerClick(row.player)
      }, [
        h('div', { class: 'metric-player' }, [
          h('span', { class: 'champion-icon asset-frame champion-frame' }, [
            getChampionIconUrl(row.player.championId)
              ? h('img', { src: getChampionIconUrl(row.player.championId), alt: '', onError: markAssetLoadFailed })
              : null
          ]),
          h('span', { class: 'player-name' }, getPlayerName(row.player))
        ]),
        h('div', { class: 'metric-values' }, row.values.map(value =>
          h('span', { key: value.key }, [
            h('small', value.label),
            h('strong', value.value)
          ])
        )),
        h('span', { class: 'metric-bar' }, [
          h('span', { style: { width: `${Math.max(4, row.ratio)}%` } })
        ])
      ])
    ))
  }
})
</script>

<style scoped>
.match-detail-overlay {
  position: fixed;
  inset: 0;
  z-index: 2100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 22px;
  background: rgba(0, 0, 0, 0.72);
}

.match-detail-modal {
  position: relative;
  width: min(1180px, 94vw);
  max-height: 92vh;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  border: 1px solid var(--border-color);
  border-radius: 16px;
  background: var(--bg-secondary);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.34);
}

.close-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 2;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.match-hero,
.summary-grid,
.detail-tabs,
.tab-panel,
.team-card {
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.025);
}

.match-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
  padding: 16px 54px 16px 16px;
  background:
    linear-gradient(135deg, rgba(var(--accent-rgb), 0.12), transparent 58%),
    rgba(255, 255, 255, 0.025);
}

.hero-main,
.hero-player,
.hero-player-row,
.player-identity,
.metric-player,
.item-player-main,
.spell-row {
  min-width: 0;
  display: flex;
  align-items: center;
}

.hero-main,
.hero-player,
.hero-player-row {
  gap: 12px;
}

.hero-player {
  flex-direction: column;
  align-items: flex-end;
  gap: 7px;
}

.hero-player-row {
  justify-content: flex-end;
}

.result-pill {
  flex: 0 0 auto;
  padding: 8px 12px;
  border-radius: 10px;
  font-weight: 750;
}

.result-pill.win {
  background: rgba(61, 155, 122, 0.14);
  color: #62d49e;
}

.result-pill.lose {
  background: rgba(196, 92, 92, 0.14);
  color: #ee7a82;
}

.hero-copy,
.hero-player-copy,
.name-stack {
  min-width: 0;
}

.hero-copy h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 750;
  letter-spacing: 0;
}

.hero-copy p,
.hero-player-copy span,
.summary-cell span,
.team-header span,
.stat-grid,
.metric-values small {
  color: var(--text-secondary);
}

.hero-copy p {
  margin: 5px 0 0;
  font-size: 13px;
}

.hero-player-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: right;
}

.hero-player-copy strong,
.hero-player.empty strong,
.summary-cell strong,
.team-header strong,
.player-name,
.metric-values strong {
  color: var(--text-primary);
}

.hero-loadout-stack {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.loadout-row {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  min-width: 0;
}

.loadout-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 21px;
  height: 21px;
  flex: 0 0 21px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.055);
}

.loadout-slot-perk {
  border-radius: 50%;
}

.loadout-slot img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.performance-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
}

.hero-tags {
  justify-content: flex-end;
  max-width: 360px;
}

.performance-tag {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  padding: 2px 6px;
  border: 1px solid rgba(124, 139, 164, 0.18);
  border-radius: 999px;
  background: rgba(124, 139, 164, 0.1);
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 750;
  line-height: 1.15;
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
  color: #62d49e;
}

.performance-tag.tone-warning {
  border-color: rgba(219, 164, 60, 0.3);
  background: rgba(219, 164, 60, 0.13);
  color: #d89b35;
}

.performance-tag.tone-danger {
  border-color: rgba(207, 83, 96, 0.28);
  background: rgba(207, 83, 96, 0.12);
  color: #ee7a82;
}

.hero-player.empty {
  align-items: flex-end;
  flex-direction: column;
  gap: 4px;
  text-align: right;
}

.detail-load-state {
  padding: 9px 12px;
  border: 1px solid rgba(240, 196, 79, 0.24);
  border-radius: 8px;
  background: rgba(240, 196, 79, 0.08);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.35;
}

.detail-load-state.error {
  border-color: rgba(196, 92, 92, 0.28);
  background: rgba(196, 92, 92, 0.1);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.045);
}

.summary-cell {
  min-width: 0;
  padding: 11px 12px;
  background: var(--bg-secondary);
}

.summary-cell span,
.summary-cell strong {
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
}

.summary-cell span {
  font-size: 11px;
}

.summary-cell strong {
  margin-top: 4px;
  font-size: 15px;
  font-weight: 750;
}

.detail-tabs {
  display: flex;
  gap: 6px;
  padding: 6px;
  overflow-x: auto;
}

.detail-tabs button {
  flex: 0 0 auto;
  min-width: 72px;
  padding: 8px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.detail-tabs button.active {
  background: rgba(var(--accent-rgb), 0.16);
  color: var(--text-primary);
}

.tab-panel {
  padding: 14px;
}

.teams-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.team-card {
  overflow: hidden;
}

.team-blue-card {
  border-color: rgba(92, 163, 234, 0.22);
}

.team-red-card {
  border-color: rgba(222, 111, 111, 0.22);
}

.team-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.team-header.blue strong {
  color: #5ca3ea;
}

.team-header.red strong {
  color: #de6f6f;
}

.team-list,
.item-team-list,
.metric-list {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.participant-row,
.metric-row,
.item-player-row {
  width: 100%;
  min-width: 0;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.055);
  background: transparent;
  color: inherit;
  text-align: left;
}

.participant-row:last-child,
.metric-row:last-child,
.item-player-row:last-child {
  border-bottom: 0;
}

.participant-row.clickable,
.metric-row.clickable,
.item-player-row.clickable {
  cursor: pointer;
}

.participant-row.clickable:hover,
.metric-row.clickable:hover,
.item-player-row.clickable:hover {
  background: rgba(92, 163, 234, 0.06);
}

.participant-row.me,
.metric-row.me,
.item-player-row.me {
  background: rgba(var(--accent-rgb), 0.1);
  box-shadow: inset 3px 0 0 rgba(var(--accent-rgb), 0.72);
}

.participant-line {
  display: grid;
  grid-template-columns: minmax(180px, 1.25fr) 66px minmax(168px, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-width: 0;
  padding: 11px 12px;
}

.player-identity,
.metric-player,
.item-player-main {
  gap: 9px;
}

.asset-frame {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: var(--bg-tertiary);
}

.asset-frame img,
.item-slot img,
.loadout-slot img,
.spell-slot img,
.perk-slot img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.asset-frame img[data-asset-failed='true'],
.item-slot img[data-asset-failed='true'],
.loadout-slot img[data-asset-failed='true'],
.spell-slot img[data-asset-failed='true'],
.perk-slot img[data-asset-failed='true'] {
  display: none;
}

.hero-avatar {
  width: 54px;
  height: 54px;
  border-radius: 14px;
}

.champion-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
}

.player-name-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.player-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 700;
}

.me-tag {
  flex: 0 0 auto;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(var(--accent-rgb), 0.15);
  color: var(--accent-color);
  font-size: 10px;
}

.spell-rune-stack {
  display: flex;
  gap: 5px;
  align-items: center;
  min-width: 0;
}

.spell-row {
  gap: 3px;
}

.spell-slot,
.perk-slot,
.item-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.055);
}

.spell-slot,
.perk-slot {
  width: 20px;
  height: 20px;
  border-radius: 5px;
}

.perk-slot {
  border-radius: 50%;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 3px 8px;
  min-width: 0;
  font-size: 12px;
  text-align: right;
}

.stat-grid span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-build {
  display: grid;
  grid-template-columns: repeat(7, 22px);
  gap: 4px;
  justify-content: end;
}

.item-slot {
  width: 22px;
  height: 22px;
  border-radius: 5px;
}

.item-slot.empty,
.spell-slot.empty,
.perk-slot.empty {
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.012)),
    var(--bg-tertiary);
}

.metric-row,
.item-player-row {
  display: grid;
  grid-template-columns: minmax(180px, 0.85fr) minmax(280px, 1.15fr);
  gap: 12px;
  align-items: center;
  padding: 12px;
}

.metric-row {
  grid-template-columns: minmax(180px, 0.75fr) minmax(360px, 1.25fr);
}

.metric-values {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  min-width: 0;
}

.metric-values span {
  min-width: 0;
  padding: 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
}

.metric-values small,
.metric-values strong {
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
}

.metric-values small {
  font-size: 10px;
}

.metric-values strong {
  margin-top: 3px;
  font-size: 13px;
}

.metric-bar {
  grid-column: 1 / -1;
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.055);
}

.metric-bar span {
  display: block;
  height: 100%;
  max-width: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, rgba(92, 163, 234, 0.36), rgba(92, 163, 234, 0.95));
}

.item-player-row {
  grid-template-columns: minmax(180px, 1fr) auto;
}

:global([data-theme="light"] .match-detail-modal) {
  box-shadow: 0 24px 70px rgba(40, 53, 83, 0.16);
}

:global([data-theme="light"] .match-detail-modal .match-hero),
:global([data-theme="light"] .match-detail-modal .summary-grid),
:global([data-theme="light"] .match-detail-modal .detail-tabs),
:global([data-theme="light"] .match-detail-modal .tab-panel),
:global([data-theme="light"] .match-detail-modal .team-card) {
  border-color: rgba(var(--accent-rgb), 0.14);
  background: rgba(255, 255, 255, 0.72);
}

@media (max-width: 1040px) {
  .summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .teams-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 860px) {
  .match-detail-overlay {
    padding: 12px;
  }

  .match-hero {
    grid-template-columns: 1fr;
    padding-right: 52px;
  }

  .hero-player,
  .hero-player-row,
  .hero-player-copy,
  .hero-player.empty {
    align-items: flex-start;
    text-align: left;
  }

  .hero-player-row,
  .loadout-row,
  .hero-tags {
    justify-content: flex-start;
  }

  .participant-line,
  .metric-row,
  .item-player-row {
    grid-template-columns: 1fr;
  }

  .stat-grid {
    text-align: left;
  }

  .player-build {
    justify-content: start;
  }

  .metric-values {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .match-detail-modal {
    width: 100%;
    padding: 14px;
  }

  .summary-grid,
  .metric-values {
    grid-template-columns: 1fr;
  }

  .hero-main {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
