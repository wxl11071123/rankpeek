<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { apiClient } from '@/api/httpClient'
import AssetHoverTooltip from '@/components/common/AssetHoverTooltip.vue'
import PostgameAiAnalysisModal from '@/components/match-history/PostgameAiAnalysisModal.vue'
import { useI18n, type MessageKey } from '@/i18n'
import {
  buildPostgameAiInputSnapshot
} from '@/services/postgameAiInputSnapshot'
import type { PostgameAiInputSnapshot } from '@/services/postgameAiInputSnapshot'
import {
  createPostgameAiStreamRequest,
  streamPostgameAiAnalysis,
  type PostgameAiStreamState,
  type PostgameAiTokenUsage
} from '@/services/postgameAiServerStream'
import { savePostgameAiRunResultToLocal } from '@/services/postgameAiRunPersistence'
import {
  parsePostgameAiPraiseResult,
  parsePostgameAiStructuredResult,
  type PostgameAiReviewRosterPlayer
} from '@/services/postgameAiStructuredResult'
import { buildPostgameAiReviewRosterPlayers } from '@/services/postgameAiReviewRoster'
import type {
  DragonType,
  GameDetail,
  GameParticipant,
  GameParticipantIdentity,
  GameStats,
  GameTimeline,
  MatchHistory,
  MatchTimeline,
  TeamBanSummary,
  TeamObjectiveEvent,
  TeamObjectiveSummary
} from '@/types/api'
import {
  createGoldDiffDomain,
  createTimelineChartModel,
  describeTimelineEventMarker,
  formatGoldDiffTick,
  formatTimelineTime,
  type GoldDiffMetricKey,
  type GoldDiffPoint,
  type GoldDiffSeries,
  type TimelineEventCluster,
  type TimelineEventMarker
} from '@/services/matchTimelineChart'
import {
  createMatchRpIndexModel,
  formatRpScore,
  type MatchRpIndexModel,
  type RpIndexPoint,
  type RpPlayerIndex
} from '@/services/matchRpIndex'
import {
  getAugmentAssetDetails,
  getAugmentIconUrl,
  getAugmentRarityClass,
  getAugmentTooltipDetails,
  getChampionIconUrl,
  getItemAssetDetails,
  getItemIconSlots,
  getItemTooltipDetails,
  getObjectiveIconUrl,
  getPerkAssetDetails,
  getPerkIconUrl,
  getPerkTooltipDetails,
  getSummonerSpellIconUrl,
  getSummonerSpellTooltipDetails,
  markAssetLoadFailed,
  normalizeRiotTooltipText,
  type GameAssetMetadataEntry,
  type GameAssetTooltipDetails,
  type ItemIconSlot,
  type ObjectiveIconKind
} from '@/utils/gameAssetUrls'
import {
  formatNumber,
  getCreepScore,
  getTeamParticipants,
  sumTeamStats,
  type MatchDetailParticipant,
  type TeamStatsSummary
} from '@/utils/matchDetailMetrics'

export type InlineDetailTabKey = 'overview' | 'rp' | 'runes' | 'chart'

type PostgameAiAnalysisMode = 'review' | 'praise'
type DetailLoadStatus = 'idle' | 'loading' | 'loaded' | 'error'
type TeamTone = 'blue' | 'red'
type TraitKind = 'perk' | 'augment'

interface SpellSlot {
  key: string
  id: number | null
  url: string
  empty: boolean
}

interface TraitSlot {
  key: string
  kind: TraitKind
  id: number | null
  url: string
  empty: boolean
  label: string
  rarityClass?: string
}

interface RuneStyleColumn {
  key: 'primary' | 'secondary'
  styleId: number | null
  styleSlot: TraitSlot | null
  title: string
  slots: TraitSlot[]
}

interface RuneStatDisplayRow {
  key: string
  text: string
}

interface RuneTeamSection {
  key: TeamTone
  teamId: number
  label: string
  players: MatchDetailParticipant[]
}

interface TeamSection {
  key: TeamTone
  teamId: number
  label: string
  result: string
  won: boolean
  players: MatchDetailParticipant[]
  totals: TeamStatsSummary
}

interface ObjectiveDisplayIcon {
  key: string
  kind: ObjectiveIconKind
  label: string
  iconUrl: string
  timestamp: number | null
}

interface ObjectiveDisplayItem {
  key: string
  kind: ObjectiveIconKind
  label: string
  count: number | null
  showCount: boolean
  title: string
  iconUrl: string
  icons?: ObjectiveDisplayIcon[]
  tooltipGroups: ObjectiveTooltipGroup[]
}

interface ObjectiveTooltipGroup {
  key: string
  championId: number
  count: number
  label: string
}

interface ObjectiveEventDescriptor {
  kind: TeamObjectiveEvent['kind']
  dragonType?: DragonType
}

type StructureObjectiveSourceKey = 'turret' | 'inhibitor' | 'turretPlate'
type StructureObjectiveSummaryKey = 'turretKills' | 'inhibitorKills' | 'turretPlateKills' | 'turretPlatesTaken'

interface StructureObjectiveSource {
  summaryKey: StructureObjectiveSummaryKey
  summaryKeys?: StructureObjectiveSummaryKey[]
  eventKind: TeamObjectiveEvent['kind']
  directStatKeys: string[]
  lastFallbackStatKeys: string[]
}

interface TimestampedDragonObjectiveEvent {
  event: TeamObjectiveEvent
  timestamp: number
  index: number
  dragonType: DragonType
}

type TimelineLoadStatus = 'idle' | 'loading' | 'loaded' | 'empty' | 'error'
type ChartHoverSource = 'chart' | 'axis'

interface GoldDiffMetricOption {
  key: GoldDiffMetricKey
  labelKey: MessageKey
}

interface SaveCompletedPostgameAiAnalysisParams {
  snapshot: PostgameAiInputSnapshot
  mode: PostgameAiAnalysisMode
  championNamesById: Record<number, string>
}

interface ChartGridLine {
  key: string
  value: number
  y: number
  label: string
  zero: boolean
}

interface ChartTimeTick {
  key: string
  timestamp: number
  x: number
  label: string
}

interface ChartLineSegment {
  key: string
  tone: TeamTone
  d: string
}

interface LaneMatchupWatermark {
  key: string
  tone: TeamTone
  championId: number
  iconUrl: string
  x: number
  y: number
  size: number
}

interface TeamAverageWatermarkGroup {
  key: TeamTone
  tone: TeamTone
  watermarks: LaneMatchupWatermark[]
}

interface TimelineEventTrack {
  key: TeamTone
  clusters: TimelineEventCluster[]
}

interface TimelineAxisClusterOptions {
  windowMs?: number
}

interface TimelineEventTooltipRow {
  key: string
  actorText: string
  actionText: string
  targetText: string
  actorChampionId: number | null
  targetChampionId: number | null
}

interface TimelineEventTooltipAnchor {
  x: number
  y: number
  arrowLeft: string
}

interface RpScoreCard {
  participantId: number
  teamId: number
  championId: number | null
  finalScore: number
  trendLabel?: string
  selected: boolean
  color: string
  playerLabel: string
}

interface RpScoreGroup {
  key: 'win' | 'loss'
  label: string
  players: RpScoreCard[]
}

interface RpTrendBadge {
  key: string
  label: string
}

interface RpChartSeries {
  key: string
  participantId: number
  color: string
  playerLabel: string
  points: RpIndexPoint[]
}

interface RpHoverPoint {
  series: RpChartSeries
  point: RpIndexPoint
}

interface RpTooltipRow {
  key: string
  color: string
  score: number
  y: number
}

const LANE_BASED_QUEUE_IDS = new Set([400, 420, 430, 440, 490, 700])
const NON_LANE_BASED_QUEUE_IDS = new Set([450, 900, 1020, 1700, 1710])
const LANE_BASED_GAME_MODES = new Set(['CLASSIC'])
const NON_LANE_BASED_GAME_MODES = new Set(['ARAM', 'CHERRY'])
const RANKED_QUEUE_IDS = new Set([420, 440])
const CHART_WIDTH = 680
const CHART_HEIGHT = 220
const CHART_PADDING = {
  top: 22,
  right: 24,
  bottom: 34,
  left: 58
}
const CHART_PLOT_WIDTH = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right
const CHART_PLOT_HEIGHT = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom
const CHART_Y_TICK_LABEL_MIN_GAP = 28
const MAX_CHART_Y_TICK_COUNT = Math.max(3, Math.floor(CHART_PLOT_HEIGHT / CHART_Y_TICK_LABEL_MIN_GAP) + 1)
const RP_CHART_WIDTH = CHART_WIDTH
const RP_CHART_HEIGHT = CHART_HEIGHT
const RP_CHART_PADDING = CHART_PADDING
const RP_CHART_PLOT_WIDTH = CHART_PLOT_WIDTH
const RP_CHART_PLOT_HEIGHT = CHART_PLOT_HEIGHT
const RP_CHART_COLORS = [
  '#ff4d6d',
  '#ffd166',
  '#4cc9f0',
  '#7ae582',
  '#c77dff',
  '#3a86ff',
  '#f72585',
  '#ff8c42',
  '#ff3dcb',
  '#d6ff4d'
]
const LANE_WATERMARK_SIZE = 46
const LANE_WATERMARK_AXIS_GAP = 8
const TEAM_WATERMARK_SIZE = 34
const TEAM_WATERMARK_GAP = 6
const TEAM_WATERMARK_AXIS_GAP = 8
const WATERMARK_CORNER_RADIUS = 14
const WATERMARK_IMAGE_CROP_OUTSET = 3
const TIMELINE_AXIS_CLUSTER_WINDOW_MS = 60_000
const goldDiffMetricOptions: GoldDiffMetricOption[] = [
  { key: 'teamAverage', labelKey: 'matchDetail.timelineMetricTeamAverage' },
  { key: 'top', labelKey: 'matchDetail.timelineMetricTop' },
  { key: 'jungle', labelKey: 'matchDetail.timelineMetricJungle' },
  { key: 'middle', labelKey: 'matchDetail.timelineMetricMiddle' },
  { key: 'bottom', labelKey: 'matchDetail.timelineMetricBottom' },
  { key: 'support', labelKey: 'matchDetail.timelineMetricSupport' }
]
const LANE_BASED_QUEUE_KEYWORDS = [
  '召唤师峡谷',
  '单排',
  '双排',
  '灵活',
  '匹配',
  'RANKED_SOLO_5x5',
  'RANKED_FLEX_SR',
  'CLASSIC',
  'SUMMONER'
]
const NON_LANE_BASED_QUEUE_KEYWORDS = [
  '大乱斗',
  '极地',
  '海克斯大乱斗',
  '斗魂',
  '竞技场',
  '无限火力',
  '克隆',
  'ARAM',
  'CHERRY',
  'ARENA',
  'URF',
  'ONE FOR ALL'
]
const RANKED_QUEUE_KEYWORDS = [
  '排位',
  '单排',
  '双排',
  '灵活',
  'RANKED',
  'SOLO',
  'FLEX'
]
const DRAGON_GROUP_LABEL = '小龙'
const DRAGON_TYPE_ORDER: DragonType[] = ['infernal', 'mountain', 'ocean', 'cloud', 'hextech', 'chemtech']
const DRAGON_TYPE_ALIASES: Record<Exclude<DragonType, 'unknown'>, string[]> = {
  infernal: ['infernal', 'fire', 'fire_dragon', 'FIRE_DRAGON', 'INFERNAL_DRAGON'],
  ocean: ['ocean', 'water', 'water_dragon', 'WATER_DRAGON'],
  mountain: ['mountain', 'earth', 'earth_dragon', 'EARTH_DRAGON', 'MOUNTAIN_DRAGON'],
  cloud: ['cloud', 'air', 'air_dragon', 'AIR_DRAGON', 'CLOUD_DRAGON'],
  hextech: ['hextech', 'hextech_dragon', 'HEXTECH_DRAGON'],
  chemtech: ['chemtech', 'chemtech_dragon', 'CHEMTECH_DRAGON']
}
const DRAGON_TYPE_LABELS: Record<DragonType, string> = {
  infernal: '炼狱龙',
  mountain: '山脉龙',
  ocean: '海洋龙',
  cloud: '云端龙',
  hextech: '海克斯龙',
  chemtech: '炼金龙',
  unknown: '小龙'
}
const STRUCTURE_OBJECTIVE_SOURCES: Record<StructureObjectiveSourceKey, StructureObjectiveSource> = {
  turret: {
    summaryKey: 'turretKills',
    eventKind: 'turret',
    directStatKeys: ['turretKills'],
    lastFallbackStatKeys: ['turretTakedowns']
  },
  inhibitor: {
    summaryKey: 'inhibitorKills',
    eventKind: 'inhibitor',
    directStatKeys: ['inhibitorKills'],
    lastFallbackStatKeys: ['inhibitorTakedowns']
  },
  turretPlate: {
    summaryKey: 'turretPlateKills',
    summaryKeys: ['turretPlateKills', 'turretPlatesTaken'],
    eventKind: 'turretPlate',
    directStatKeys: ['turretPlatesTaken'],
    lastFallbackStatKeys: []
  }
}

type RuneStatVarKey = 'var1' | 'var2' | 'var3'

interface RuneStatDefinition {
  key: string
  valueKeys: RuneStatVarKey[]
  text: (value: number) => string
  showZero?: boolean
}

const RUNE_STYLE_NAMES: Record<number, string> = {
  8000: '精密',
  8100: '主宰',
  8200: '巫术',
  8300: '启迪',
  8400: '坚决'
}
const RUNE_STAT_DEFINITIONS: Record<number, RuneStatDefinition[]> = {
  8005: [
    {
      key: 'damage',
      valueKeys: ['var1'],
      text: value => `已造成 ${formatRuneStatValue(value)} 额外伤害`
    }
  ],
  8010: [
    {
      key: 'healing',
      valueKeys: ['var1', 'var2', 'var3'],
      text: value => `已回复 ${formatRuneStatValue(value)} 生命值`
    }
  ],
  8014: [
    {
      key: 'damage',
      valueKeys: ['var1'],
      text: value => `已造成 ${formatRuneStatValue(value)} 额外伤害`
    }
  ],
  8128: [
    {
      key: 'souls',
      valueKeys: ['var1'],
      text: value => `已收集 ${formatRuneStatValue(value)} 灵魂`
    },
    {
      key: 'damage',
      valueKeys: ['var2'],
      text: value => `已造成 ${formatRuneStatValue(value)} 额外伤害`
    }
  ],
  8214: [
    {
      key: 'damage',
      valueKeys: ['var1'],
      text: value => `已造成 ${formatRuneStatValue(value)} 伤害`
    },
    {
      key: 'shield',
      valueKeys: ['var2'],
      text: value => `已提供 ${formatRuneStatValue(value)} 护盾`
    }
  ],
  8226: [
    {
      key: 'mana',
      valueKeys: ['var1'],
      text: value => `已回复 ${formatRuneStatValue(value)} 法力值`
    }
  ],
  8237: [
    {
      key: 'damage',
      valueKeys: ['var1'],
      text: value => `已造成 ${formatRuneStatValue(value)} 伤害`
    }
  ],
  8304: [
    {
      key: 'gold-saved',
      valueKeys: ['var1'],
      text: value => `已节省 ${formatRuneStatValue(value)} 金币`
    }
  ],
  8321: [
    {
      key: 'gold',
      valueKeys: ['var1', 'var2', 'var3'],
      text: value => `已返还 ${formatRuneStatValue(value)} 金币`
    }
  ],
  8345: [
    {
      key: 'health',
      valueKeys: ['var1'],
      text: value => `已回复 ${formatRuneStatValue(value)} 生命值`
    },
    {
      key: 'mana',
      valueKeys: ['var2'],
      text: value => `已回复 ${formatRuneStatValue(value)} 法力值`
    }
  ],
  8437: [
    {
      key: 'damage',
      valueKeys: ['var1'],
      text: value => `已造成 ${formatRuneStatValue(value)} 伤害`
    },
    {
      key: 'healing',
      valueKeys: ['var2'],
      text: value => `已回复 ${formatRuneStatValue(value)} 生命值`
    },
    {
      key: 'max-health',
      valueKeys: ['var3'],
      text: value => `已获得 ${formatRuneStatValue(value)} 最大生命值`
    }
  ],
  8463: [
    {
      key: 'turret-damage',
      valueKeys: ['var1'],
      text: value => `已造成 ${formatRuneStatValue(value)} 防御塔伤害`
    }
  ],
  8473: [
    {
      key: 'damage-reduced',
      valueKeys: ['var1', 'var2', 'var3'],
      text: value => `已减免 ${formatRuneStatValue(value)} 伤害`
    }
  ],
  9111: [
    {
      key: 'healing',
      valueKeys: ['var1'],
      text: value => `已回复 ${formatRuneStatValue(value)} 生命值`
    },
    {
      key: 'gold',
      valueKeys: ['var2'],
      text: value => `已获得 ${formatRuneStatValue(value)} 金币`
    }
  ]
}

const props = withDefaults(defineProps<{
  matchHistory: MatchHistory
  gameDetail: GameDetail | null
  currentPuuid: string
  currentSummonerName: string
  detailStatus?: DetailLoadStatus
  activeTab?: InlineDetailTabKey
}>(), {
  detailStatus: 'idle',
  activeTab: 'overview'
})

const emit = defineEmits<{
  'update:activeTab': [tab: InlineDetailTabKey]
  navigateToPlayer: [gameName: string, tagLine: string]
}>()

const { t } = useI18n()

const activeTabValue = computed<InlineDetailTabKey>({
  get: () => props.activeTab,
  set: tab => emit('update:activeTab', tab)
})

const fallbackGameDetail = computed<GameDetail | null>(() => toGameDetailFromMatchHistory(props.matchHistory))
const displayGameDetail = computed<GameDetail | null>(() => {
  const detail = isRenderableGameDetail(props.gameDetail) ? props.gameDetail : null
  return detail ? mergeGameDetailWithSummary(detail, fallbackGameDetail.value) : fallbackGameDetail.value
})
const blueTeamPlayers = computed(() => getTeamParticipants(displayGameDetail.value, 100, props.currentPuuid))
const redTeamPlayers = computed(() => getTeamParticipants(displayGameDetail.value, 200, props.currentPuuid))
const allPlayers = computed(() => [...blueTeamPlayers.value, ...redTeamPlayers.value])
const runeTeamSections = computed<RuneTeamSection[]>(() => {
  const sections: RuneTeamSection[] = [
    { key: 'blue', teamId: 100, label: t('common.blueTeam'), players: blueTeamPlayers.value },
    { key: 'red', teamId: 200, label: t('common.redTeam'), players: redTeamPlayers.value }
  ]
  return sections.filter(section => section.players.length > 0)
})
const blueTeamTotals = computed(() => sumTeamStats(blueTeamPlayers.value))
const redTeamTotals = computed(() => sumTeamStats(redTeamPlayers.value))
const maxChampionDamage = computed(() => maxPlayerMetric(player => readStatNumber(player, 'totalDamageDealtToChampions')))
const maxDamageTaken = computed(() => maxPlayerMetric(player => readStatNumber(player, 'totalDamageTaken')))
const topKillValue = computed(() => getTopMetricValue(allPlayers.value, player => readStatNumber(player, 'kills')))
const topDeathValue = computed(() => getTopMetricValue(allPlayers.value, player => readStatNumber(player, 'deaths')))
const topAssistValue = computed(() => getTopMetricValue(allPlayers.value, player => readStatNumber(player, 'assists')))
const topDamageValue = computed(() => getTopMetricValue(allPlayers.value, player => readStatNumber(player, 'totalDamageDealtToChampions')))
const topTakenValue = computed(() => getTopMetricValue(allPlayers.value, player => readStatNumber(player, 'totalDamageTaken')))
const topGoldValue = computed(() => getTopMetricValue(allPlayers.value, player => readStatNumber(player, 'goldEarned')))
const showVisionScoreColumn = computed(() => isRankedMode(props.matchHistory) || isRankedMode(displayGameDetail.value))
const showDraftAndObjectiveSummary = computed(() => isRankedMode(props.matchHistory) || isRankedMode(displayGameDetail.value))
const isChartRankedMode = computed(() => isRankedMode(props.matchHistory) || isRankedMode(displayGameDetail.value))
const currentTimelineGameId = computed(() => normalizeFiniteNumber(props.matchHistory.gameId))
const selectedGoldDiffMetric = ref<GoldDiffMetricKey>('teamAverage')
const timelineLoadStatus = ref<TimelineLoadStatus>('idle')
const timelineRequestedGameId = ref<number | null>(null)
const timelineData = ref<MatchTimeline | null>(null)
const timelineLastError = ref('')
const chartHoverSource = ref<ChartHoverSource | null>(null)
const hoveredGoldDiffPoint = ref<GoldDiffPoint | null>(null)
const hoveredGoldDiffTooltipAnchor = ref<TimelineEventTooltipAnchor | null>(null)
const hoveredEventCluster = ref<TimelineEventCluster | null>(null)
const hoveredEventTooltipAnchor = ref<TimelineEventTooltipAnchor | null>(null)
const selectedRpParticipantIds = ref<Set<number>>(new Set())
const rpSelectionInitializedGameId = ref<number | null>(null)
const hoveredRpPoint = ref<RpHoverPoint | null>(null)
const hoveredRpTooltipAnchor = ref<TimelineEventTooltipAnchor | null>(null)
const timelineChartModel = computed(() => createTimelineChartModel(timelineData.value, displayGameDetail.value))
const selectedGoldDiffSeries = computed<GoldDiffSeries>(() => timelineChartModel.value.seriesByMetric[selectedGoldDiffMetric.value])
const selectedGoldDiffDomain = computed(() => createGoldDiffDomain(selectedGoldDiffSeries.value.points, { maxTickCount: MAX_CHART_Y_TICK_COUNT }))
const chartEventClusters = computed(() => timelineChartModel.value.eventClusters)
const timelineMaxTimestamp = computed(() => Math.max(
  timelineChartModel.value.maxTimestamp,
  ...selectedGoldDiffSeries.value.points.map(point => point.timestamp),
  1
))
const chartHasAnySeriesData = computed(() => goldDiffMetricOptions.some(
  option => timelineChartModel.value.seriesByMetric[option.key].points.length > 0
))
const hasTimelineData = computed(() => isChartRankedMode.value && timelineLoadStatus.value === 'loaded' && chartHasAnySeriesData.value)
const currentRpParticipantId = computed(() => getCurrentParticipantId())
const rpIndexModel = computed<MatchRpIndexModel>(() => createMatchRpIndexModel(timelineData.value, displayGameDetail.value, {
  trendLabelParticipantId: currentRpParticipantId.value
}))
const hasRpIndexData = computed(() => isChartRankedMode.value && timelineLoadStatus.value === 'loaded' && rpIndexModel.value.status === 'ready')
const rpScoreGroups = computed<RpScoreGroup[]>(() => createRpScoreGroups())
const rpTrendBadges = computed<RpTrendBadge[]>(() => createRpTrendBadges())
const rpSelectedSeries = computed<RpChartSeries[]>(() => createRpSelectedSeries())
const rpChartDomain = computed(() => createRpChartDomain(rpSelectedSeries.value.flatMap(series => series.points)))
const rpChartGridLines = computed<ChartGridLine[]>(() => createRpChartGridLines())
const rpChartTimeTicks = computed<ChartTimeTick[]>(() => createRpChartTimeTicks())
const rpTooltipRows = computed<RpTooltipRow[]>(() => createRpTooltipRows())
const selectedGoldDiffSegments = computed<ChartLineSegment[]>(() => createGoldDiffSegments(selectedGoldDiffSeries.value.points))
const chartGridLines = computed<ChartGridLine[]>(() => createChartGridLines())
const chartTimeTicks = computed<ChartTimeTick[]>(() => createChartTimeTicks())
const zeroAxisY = computed(() => getChartY(0))
const positiveDiffFillHeight = computed(() => Math.max(0, zeroAxisY.value - CHART_PADDING.top))
const negativeDiffFillHeight = computed(() => Math.max(0, CHART_HEIGHT - CHART_PADDING.bottom - zeroAxisY.value))
const selectedGoldDiffMetricLabel = computed(() => getGoldDiffMetricLabel(selectedGoldDiffMetric.value))
const selectedLaneParticipantIds = computed<Set<number>>(() => createSelectedLaneParticipantIdSet())
const laneMatchupWatermarks = computed<LaneMatchupWatermark[]>(() => createLaneMatchupWatermarks())
const teamAverageWatermarkGroups = computed<TeamAverageWatermarkGroup[]>(() => createTeamAverageWatermarkGroups())
const timelineEventTracks = computed<TimelineEventTrack[]>(() => createTimelineEventTracks())
const activeChartCrosshairTimestamp = computed<number | null>(() => {
  if (chartHoverSource.value === 'axis') {
    return hoveredEventCluster.value?.timestamp ?? null
  }
  if (chartHoverSource.value === 'chart') {
    return hoveredGoldDiffPoint.value?.timestamp ?? null
  }
  return null
})
const staticTeamGoldDiff = computed(() => blueTeamTotals.value.goldEarned - redTeamTotals.value.goldEarned)
const failedObjectiveIconKeys = ref(new Set<string>())
const expandedRuneParticipantKey = ref('')
const postgameAiModalOpen = ref(false)
const postgameAiModalMode = ref<PostgameAiAnalysisMode>('review')
const postgameAiStreamState = ref<PostgameAiStreamState>('idle')
const postgameAiStreamText = ref('')
const postgameAiStreamError = ref('')
const postgameAiStreamUsage = ref<PostgameAiTokenUsage | null>(null)
const postgameAiStreamAbortController = ref<AbortController | null>(null)
const postgameAiChampionNamesById = ref<Record<number, string>>({})
const postgameAiReviewRosterPlayers = computed<PostgameAiReviewRosterPlayer[]>(() => createPostgameAiReviewRosterPlayers())

const detailTabs = computed<Array<{ key: InlineDetailTabKey; label: string }>>(() => {
  const baseTabs: Array<{ key: InlineDetailTabKey; label: string }> = [
    { key: 'overview', label: t('matchDetail.overviewTab') },
    { key: 'rp', label: t('matchDetail.rpTab') },
    { key: 'runes', label: t('matchDetail.runesTab') },
    { key: 'chart', label: t('matchDetail.chartTab') }
  ]
  if (!isChartRankedMode.value) {
    return baseTabs.filter(tab => tab.key !== 'rp' && tab.key !== 'chart')
  }
  return baseTabs
})

const teamSections = computed<TeamSection[]>(() => [
  createTeamSection('blue', 100, t('common.blueTeam'), blueTeamPlayers.value, blueTeamTotals.value),
  createTeamSection('red', 200, t('common.redTeam'), redTeamPlayers.value, redTeamTotals.value)
])

const detailNotice = computed(() => {
  if (props.detailStatus === 'loading' && !isRenderableGameDetail(props.gameDetail)) {
    return t('matchDetail.loadingFallback')
  }
  if (props.detailStatus === 'error') {
    return t('matchDetail.failedFallback')
  }
  return ''
})

watch(
  () => [activeTabValue.value, props.matchHistory.gameId, props.currentPuuid, allPlayers.value.length],
  () => {
    if (activeTabValue.value === 'runes') {
      ensureCurrentRuneParticipantExpanded()
      return
    }
    expandedRuneParticipantKey.value = ''
  },
  { immediate: true }
)

watch(
  () => detailTabs.value.map(tab => tab.key).join('|'),
  () => {
    if (!detailTabs.value.some(tab => tab.key === activeTabValue.value)) {
      activeTabValue.value = 'overview'
    }
  },
  { immediate: true }
)

watch(
  () => currentTimelineGameId.value,
  () => {
    resetTimelineChartState()
  }
)

watch(
  () => [activeTabValue.value, currentTimelineGameId.value, isChartRankedMode.value],
  () => {
    if (activeTabValue.value === 'chart' || activeTabValue.value === 'rp') {
      void loadTimelineForCurrentGame()
    }
  },
  { immediate: true }
)

watch(
  () => [rpIndexModel.value.status, currentTimelineGameId.value, currentRpParticipantId.value, allPlayers.value.length],
  () => {
    initializeRpSelectionForCurrentGame()
  },
  { immediate: true }
)

function selectTab(tab: InlineDetailTabKey): void {
  activeTabValue.value = tab
}

function openPostgameAiModal(mode: PostgameAiAnalysisMode): void {
  postgameAiStreamAbortController.value?.abort()
  postgameAiStreamAbortController.value = null
  postgameAiStreamState.value = 'idle'
  postgameAiStreamText.value = ''
  postgameAiStreamError.value = ''
  postgameAiStreamUsage.value = null
  postgameAiModalMode.value = mode
  postgameAiModalOpen.value = true
}

function closePostgameAiModal(): void {
  postgameAiStreamAbortController.value?.abort()
  postgameAiStreamAbortController.value = null
  postgameAiStreamState.value = 'idle'
  postgameAiStreamText.value = ''
  postgameAiStreamError.value = ''
  postgameAiStreamUsage.value = null
  postgameAiModalOpen.value = false
}

function cancelPostgameAiAnalysis(): void {
  postgameAiStreamAbortController.value?.abort()
  postgameAiStreamAbortController.value = null
  if (postgameAiStreamState.value === 'preparing' || postgameAiStreamState.value === 'streaming') {
    postgameAiStreamState.value = 'idle'
  }
  postgameAiStreamUsage.value = null
}

async function startPostgameAiAnalysis(): Promise<void> {
  if (postgameAiStreamState.value === 'preparing' || postgameAiStreamState.value === 'streaming') {
    return
  }

  const abortController = new AbortController()
  postgameAiStreamAbortController.value = abortController
  postgameAiStreamState.value = 'preparing'
  postgameAiStreamText.value = ''
  postgameAiStreamError.value = ''
  postgameAiStreamUsage.value = null
  const mode = postgameAiModalMode.value

  try {
    const timeline = await resolvePostgameTimelineForSnapshot()
    if (abortController.signal.aborted) {
      return
    }
    const championNamesById = await resolvePostgameChampionNamesById()
    if (abortController.signal.aborted) {
      return
    }
    postgameAiChampionNamesById.value = championNamesById

    const accountPuuid = resolvePostgameAiAccountPuuid()
    const snapshot = buildPostgameAiInputSnapshot({
      matchHistory: props.matchHistory,
      gameDetail: displayGameDetail.value,
      timeline,
      currentPuuid: accountPuuid,
      currentSummonerName: props.currentSummonerName,
      championNamesById
    })
    const request = createPostgameAiStreamRequest(snapshot, mode)
    postgameAiStreamState.value = 'streaming'
    let postgameAiSaveStarted = false
    let postgameAiSavePromise: Promise<void> | null = null
    const saveCompletedStreamOnce = (): Promise<void> => {
      if (postgameAiSaveStarted) {
        return postgameAiSavePromise ?? Promise.resolve()
      }
      postgameAiSaveStarted = true
      postgameAiSavePromise = saveCompletedPostgameAiAnalysis({
        snapshot,
        mode,
        championNamesById
      })
      return postgameAiSavePromise
    }

    const result = await streamPostgameAiAnalysis(request, {
      onDelta: text => appendPostgameAiStreamText(text),
      onError: message => {
        postgameAiStreamError.value = message
        postgameAiStreamState.value = 'failed'
      },
      onUsage: usage => {
        postgameAiStreamUsage.value = usage
      },
      onDone: () => {
        if (postgameAiStreamState.value !== 'failed') {
          postgameAiStreamState.value = 'completed'
          void saveCompletedStreamOnce()
        }
      }
    }, {
      signal: abortController.signal
    })

    if (abortController.signal.aborted) {
      return
    }
    if (!result.ok) {
      postgameAiStreamError.value = result.message
      postgameAiStreamState.value = 'failed'
      return
    }
    if (postgameAiStreamState.value === 'streaming') {
      postgameAiStreamState.value = 'completed'
    }
    if (postgameAiStreamState.value === 'completed') {
      await saveCompletedStreamOnce()
    }
  } catch (error) {
    if (!abortController.signal.aborted) {
      postgameAiStreamError.value = error instanceof Error ? error.message : '本地 AI 暂不可用'
      postgameAiStreamState.value = 'failed'
    }
  } finally {
    if (postgameAiStreamAbortController.value === abortController) {
      postgameAiStreamAbortController.value = null
    }
  }
}

async function saveCompletedPostgameAiAnalysis(params: SaveCompletedPostgameAiAnalysisParams): Promise<void> {
  const { snapshot, mode, championNamesById } = params
  const rawOutputText = postgameAiStreamText.value.trim()
  if (!rawOutputText) {
    return
  }
  if (!isPostgameAiStructuredOutputValid(mode, rawOutputText)) {
    return
  }

  const saveResult = await savePostgameAiRunResultToLocal({
    accountPuuid: resolvePostgameAiAccountPuuid(),
    mode,
    rawOutputText,
    usage: postgameAiStreamUsage.value,
    snapshot,
    matchHistory: props.matchHistory,
    championNamesById,
    rosterPlayers: postgameAiReviewRosterPlayers.value
  })

  if (!saveResult.success) {
    console.warn('Failed to save postgame AI run result:', saveResult.error)
  }
}

function isPostgameAiStructuredOutputValid(mode: PostgameAiAnalysisMode, rawOutputText: string): boolean {
  return mode === 'praise'
    ? parsePostgameAiPraiseResult(rawOutputText).ok
    : parsePostgameAiStructuredResult(rawOutputText).ok
}

function resolvePostgameAiAccountPuuid(): string {
  const propPuuid = props.currentPuuid.trim()
  if (propPuuid) {
    return propPuuid
  }

  const currentPlayer = allPlayers.value.find(player => {
    const playerPuuid = player.puuid?.trim()
    return Boolean(player.isCurrentPlayer && playerPuuid)
  })
  if (currentPlayer?.puuid?.trim()) {
    return currentPlayer.puuid.trim()
  }

  const currentSummonerName = props.currentSummonerName.trim().toLocaleLowerCase()
  if (!currentSummonerName) {
    return ''
  }

  const matchedPlayer = allPlayers.value.find(player => {
    const displayName = player.displayName.trim().toLocaleLowerCase()
    const riotId = `${player.gameName}#${player.tagLine}`.trim().toLocaleLowerCase()
    return displayName === currentSummonerName || riotId === currentSummonerName
  })
  return matchedPlayer?.puuid?.trim() ?? ''
}

async function resolvePostgameChampionNamesById(): Promise<Record<number, string>> {
  try {
    const options = await apiClient.getChampionOptions()
    return Object.fromEntries(
      options
        .map(option => [Number(option.value), option.label || option.realName || option.nickname || ''] as const)
        .filter(([id, name]) => Number.isFinite(id) && name.trim().length > 0)
    )
  } catch {
    return {}
  }
}

async function resolvePostgameTimelineForSnapshot(): Promise<MatchTimeline | null> {
  if (timelineData.value) {
    return timelineData.value
  }
  if (!isChartRankedMode.value) {
    return null
  }

  const gameId = currentTimelineGameId.value
  if (gameId === null) {
    return null
  }

  try {
    const result = await apiClient.getGameTimeline(gameId, { source: 'auto' })
    if (result.status === 'FETCHED' && hasRenderableTimeline(result.timeline)) {
      timelineRequestedGameId.value = gameId
      timelineData.value = result.timeline
      timelineLoadStatus.value = 'loaded'
      timelineLastError.value = ''
      return result.timeline
    }
    return null
  } catch {
    return null
  }
}

function appendPostgameAiStreamText(text: string): void {
  postgameAiStreamText.value += text
}

function createPostgameAiReviewRosterPlayers(): PostgameAiReviewRosterPlayer[] {
  return buildPostgameAiReviewRosterPlayers({
    players: allPlayers.value,
    currentPuuid: props.currentPuuid,
    championNamesById: postgameAiChampionNamesById.value,
    getChampionIconUrl
  })
}

function resetTimelineChartState(): void {
  timelineLoadStatus.value = 'idle'
  timelineRequestedGameId.value = null
  timelineData.value = null
  timelineLastError.value = ''
  chartHoverSource.value = null
  hoveredGoldDiffPoint.value = null
  hoveredGoldDiffTooltipAnchor.value = null
  hoveredEventCluster.value = null
  hoveredEventTooltipAnchor.value = null
  hoveredRpPoint.value = null
  hoveredRpTooltipAnchor.value = null
  selectedRpParticipantIds.value = new Set()
  rpSelectionInitializedGameId.value = null
  selectedGoldDiffMetric.value = 'teamAverage'
}

async function loadTimelineForCurrentGame(): Promise<void> {
  if (activeTabValue.value !== 'chart' && activeTabValue.value !== 'rp') {
    return
  }
  if (!isChartRankedMode.value) {
    return
  }

  const gameId = currentTimelineGameId.value
  if (gameId === null) {
    timelineLoadStatus.value = 'empty'
    return
  }
  if (timelineRequestedGameId.value === gameId) {
    return
  }

  timelineRequestedGameId.value = gameId
  timelineLoadStatus.value = 'loading'
    timelineData.value = null
    timelineLastError.value = ''
    chartHoverSource.value = null
    hoveredGoldDiffPoint.value = null
    hoveredGoldDiffTooltipAnchor.value = null
    hoveredEventCluster.value = null
    hoveredEventTooltipAnchor.value = null

  try {
    const result = await apiClient.getGameTimeline(gameId, { source: 'auto' })
    if (timelineRequestedGameId.value !== gameId) {
      return
    }

    if (result.status === 'FETCHED' && hasRenderableTimeline(result.timeline)) {
      timelineData.value = result.timeline
      timelineLoadStatus.value = 'loaded'
      return
    }

    timelineLoadStatus.value = 'empty'
    timelineLastError.value = result.lastError ?? ''
  } catch (error) {
    if (timelineRequestedGameId.value !== gameId) {
      return
    }
    timelineLoadStatus.value = 'error'
    timelineLastError.value = error instanceof Error ? error.message : ''
  }
}

function hasRenderableTimeline(timeline: MatchTimeline | null | undefined): timeline is MatchTimeline {
  return Boolean(timeline?.frames?.length)
}

function getGoldDiffMetricLabel(metric: GoldDiffMetricKey): string {
  const option = goldDiffMetricOptions.find(item => item.key === metric)
  return option ? t(option.labelKey) : ''
}

function selectGoldDiffMetric(metric: GoldDiffMetricKey): void {
  selectedGoldDiffMetric.value = metric
  hoveredGoldDiffPoint.value = null
}

function createGoldDiffSegments(points: GoldDiffPoint[]): ChartLineSegment[] {
  const segments: ChartLineSegment[] = []
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const previousX = getChartX(previous.timestamp)
    const previousY = getChartY(previous.diff)
    const currentX = getChartX(current.timestamp)
    const currentY = getChartY(current.diff)
    const previousTone = getGoldDiffTone(previous.diff)
    const currentTone = getGoldDiffTone(current.diff)

    if (previousTone === currentTone || previous.diff === 0 || current.diff === 0) {
      const tone = current.diff === 0 ? previousTone : currentTone
      segments.push(createGoldDiffSegment(`segment-${index}`, tone, previousX, previousY, currentX, currentY))
      continue
    }

    const crossingRatio = Math.abs(previous.diff) / (Math.abs(previous.diff) + Math.abs(current.diff))
    const zeroX = previousX + (currentX - previousX) * crossingRatio
    const zeroY = zeroAxisY.value
    segments.push(createGoldDiffSegment(`segment-${index}-a`, previousTone, previousX, previousY, zeroX, zeroY))
    segments.push(createGoldDiffSegment(`segment-${index}-b`, currentTone, zeroX, zeroY, currentX, currentY))
  }
  return segments
}

function createGoldDiffSegment(
  key: string,
  tone: TeamTone,
  startX: number,
  startY: number,
  endX: number,
  endY: number
): ChartLineSegment {
  return {
    key,
    tone,
    d: `M ${startX.toFixed(2)} ${startY.toFixed(2)} L ${endX.toFixed(2)} ${endY.toFixed(2)}`
  }
}

function getGoldDiffTone(diff: number): TeamTone {
  return diff >= 0 ? 'blue' : 'red'
}

function createChartGridLines(): ChartGridLine[] {
  const domain = selectedGoldDiffDomain.value
  return domain.ticks.map(value => ({
    key: `grid-${value}`,
    value,
    y: getChartY(value),
    label: formatGoldDiffTick(value),
    zero: value === 0
  }))
}

function createChartTimeTicks(): ChartTimeTick[] {
  const maxTimestamp = timelineMaxTimestamp.value
  return Array.from({ length: 5 }, (_item, index) => {
    const timestamp = Math.round(maxTimestamp * index / 4)
    return {
      key: `tick-${index}-${timestamp}`,
      timestamp,
      x: getChartX(timestamp),
      label: formatTimelineTime(timestamp)
    }
  })
}

function getChartX(timestamp: number): number {
  const maxTimestamp = Math.max(timelineMaxTimestamp.value, 1)
  const ratio = Math.max(0, Math.min(1, timestamp / maxTimestamp))
  return CHART_PADDING.left + ratio * CHART_PLOT_WIDTH
}

function getChartY(diff: number): number {
  const domain = selectedGoldDiffDomain.value
  const range = Math.max(1, domain.max - domain.min)
  const ratio = (domain.max - diff) / range
  return CHART_PADDING.top + Math.max(0, Math.min(1, ratio)) * CHART_PLOT_HEIGHT
}

function initializeRpSelectionForCurrentGame(): void {
  const gameId = currentTimelineGameId.value
  if (gameId === null || rpIndexModel.value.status !== 'ready') {
    return
  }
  if (rpSelectionInitializedGameId.value === gameId) {
    return
  }

  const currentParticipantId = getCurrentParticipantId()
  selectedRpParticipantIds.value = currentParticipantId === null
    ? new Set()
    : new Set([currentParticipantId])
  rpSelectionInitializedGameId.value = gameId
}

function createRpScoreGroups(): RpScoreGroup[] {
  if (rpIndexModel.value.status !== 'ready') {
    return []
  }

  const cards = rpIndexModel.value.players.map(player => createRpScoreCard(player))
  const groups: RpScoreGroup[] = [
    {
      key: 'win',
      label: t('matchDetail.rpWinningSide'),
      players: cards.filter(card => isWinningTeamCard(card))
    },
    {
      key: 'loss',
      label: t('matchDetail.rpLosingSide'),
      players: cards.filter(card => !isWinningTeamCard(card))
    }
  ]
  return groups.filter(group => group.players.length > 0)
}

function createRpScoreCard(player: RpPlayerIndex): RpScoreCard {
  const detailPlayer = findDetailPlayerByParticipantId(player.participantId)
  return {
    participantId: player.participantId,
    teamId: player.teamId,
    championId: player.championId,
    finalScore: player.finalScore,
    trendLabel: player.trendLabel,
    selected: selectedRpParticipantIds.value.has(player.participantId),
    color: getRpPlayerColor(player.participantId),
    playerLabel: detailPlayer ? getPlayerName(detailPlayer) : `${t('common.unknownPlayer')} ${player.participantId}`
  }
}

function isWinningTeamCard(card: RpScoreCard): boolean {
  const player = findDetailPlayerByParticipantId(card.participantId)
  return Boolean(player?.stats?.win)
}

function createRpTrendBadges(): RpTrendBadge[] {
  if (rpIndexModel.value.status !== 'ready') {
    return []
  }
  const currentParticipantId = getCurrentParticipantId()
  const currentRpPlayer = currentParticipantId === null
    ? null
    : rpIndexModel.value.players.find(player => player.participantId === currentParticipantId) ?? null
  if (!currentRpPlayer?.trendLabel) {
    return []
  }
  return [{
    key: `rp-trend-${currentRpPlayer.participantId}`,
    label: currentRpPlayer.trendLabel
  }]
}

function createRpSelectedSeries(): RpChartSeries[] {
  if (rpIndexModel.value.status !== 'ready') {
    return []
  }

  return rpIndexModel.value.players
    .filter(player => selectedRpParticipantIds.value.has(player.participantId))
    .map(player => {
      const detailPlayer = findDetailPlayerByParticipantId(player.participantId)
      const color = getRpPlayerColor(player.participantId)
      return {
        key: `rp-series-${player.participantId}`,
        participantId: player.participantId,
        color,
        playerLabel: detailPlayer ? getPlayerName(detailPlayer) : `${t('common.unknownPlayer')} ${player.participantId}`,
        points: player.points
      }
    })
}

function createRpChartDomain(points: RpIndexPoint[]): { min: number; max: number; ticks: number[] } {
  const scores = points.map(point => point.score).filter(score => Number.isFinite(score))
  const rawMin = scores.length ? Math.min(5, ...scores) : 4.5
  const rawMax = scores.length ? Math.max(5, ...scores) : 5.5
  const min = Math.max(0, Math.floor((rawMin - 0.5) * 2) / 2)
  const max = Math.min(10, Math.ceil((rawMax + 0.5) * 2) / 2)
  const safeMax = Math.max(max, min + 1)
  const middle = Math.round(((min + safeMax) / 2) * 10) / 10
  const ticks = [...new Set([min, middle, 5, safeMax])].sort((left, right) => left - right)
  return { min, max: safeMax, ticks }
}

function createRpChartGridLines(): ChartGridLine[] {
  return rpChartDomain.value.ticks.map(value => ({
    key: `rp-grid-${value}`,
    value,
    y: getRpChartY(value),
    label: formatRpScore(value),
    zero: value === 5
  }))
}

function createRpChartTimeTicks(): ChartTimeTick[] {
  const maxTimestamp = getRpMaxTimestamp()
  return Array.from({ length: 5 }, (_item, index) => {
    const timestamp = Math.round(maxTimestamp * index / 4)
    return {
      key: `rp-tick-${index}-${timestamp}`,
      timestamp,
      x: getRpChartX(timestamp),
      label: formatTimelineTime(timestamp)
    }
  })
}

function createRpLinePath(points: RpIndexPoint[]): string {
  return points
    .map((point, index) => {
      const command = index === 0 ? 'M' : 'L'
      return `${command} ${getRpChartX(point.timestamp).toFixed(2)} ${getRpChartY(point.score).toFixed(2)}`
    })
    .join(' ')
}

function createRpTooltipRows(): RpTooltipRow[] {
  const hovered = hoveredRpPoint.value
  if (!hovered) {
    return []
  }
  return rpSelectedSeries.value
    .flatMap(series => {
      const point = series.points.find(candidate => candidate.minute === hovered.point.minute)
      return point
        ? [{
            key: `${series.participantId}-${point.minute}`,
            color: series.color,
            score: point.score,
            y: getRpChartY(point.score)
          }]
        : []
    })
    .sort((left, right) => right.score - left.score)
}

function getRpChartX(timestamp: number): number {
  const maxTimestamp = Math.max(getRpMaxTimestamp(), 1)
  const ratio = Math.max(0, Math.min(1, timestamp / maxTimestamp))
  return RP_CHART_PADDING.left + ratio * RP_CHART_PLOT_WIDTH
}

function getRpChartY(score: number): number {
  const domain = rpChartDomain.value
  const range = Math.max(1, domain.max - domain.min)
  const ratio = (domain.max - score) / range
  return RP_CHART_PADDING.top + Math.max(0, Math.min(1, ratio)) * RP_CHART_PLOT_HEIGHT
}

function getRpMaxTimestamp(): number {
  return rpIndexModel.value.status === 'ready'
    ? Math.max(1, rpIndexModel.value.maxMinute * 60_000)
    : 1
}

function getRpHoverX(): number {
  return hoveredRpPoint.value ? getRpChartX(hoveredRpPoint.value.point.timestamp) : RP_CHART_PADDING.left
}

function toggleRpParticipant(participantId: number): void {
  const next = new Set(selectedRpParticipantIds.value)
  if (next.has(participantId)) {
    next.delete(participantId)
  } else {
    next.add(participantId)
  }
  selectedRpParticipantIds.value = next
  hoveredRpPoint.value = null
  hoveredRpTooltipAnchor.value = null
}

function showRpTooltip(event: PointerEvent, series: RpChartSeries, point: RpIndexPoint): void {
  hoveredRpPoint.value = { series, point }
  hoveredRpTooltipAnchor.value = getRpChartPointerAnchor(event, point)
}

function moveRpTooltip(event: PointerEvent, series: RpChartSeries, point: RpIndexPoint): void {
  hoveredRpPoint.value = { series, point }
  hoveredRpTooltipAnchor.value = getRpChartPointerAnchor(event, point)
}

function hideRpTooltip(): void {
  hoveredRpPoint.value = null
  hoveredRpTooltipAnchor.value = null
}

function getRpTooltipStyle(): Record<string, string> {
  const hovered = hoveredRpPoint.value
  if (!hovered) {
    return {}
  }
  const anchor = hoveredRpTooltipAnchor.value
  const left = anchor?.x ?? getRpChartX(hovered.point.timestamp)
  const top = anchor?.y ?? getRpChartY(hovered.point.score)
  return {
    left: `${left}px`,
    top: `${top}px`,
    '--timeline-chart-tooltip-arrow-left': anchor?.arrowLeft ?? '50%'
  }
}

function getRpChartPointerAnchor(event: PointerEvent, point: RpIndexPoint): TimelineEventTooltipAnchor {
  const target = event.currentTarget instanceof Element ? event.currentTarget : null
  const stage = target?.closest('.rp-chart-stage')
  if (!(stage instanceof HTMLElement)) {
    return {
      x: getRpChartX(point.timestamp),
      y: getRpChartY(point.score),
      arrowLeft: '50%'
    }
  }

  const rect = stage.getBoundingClientRect()
  const rawX = event.clientX - rect.left
  const rawY = event.clientY - rect.top
  const x = Math.max(14, Math.min(rect.width - 14, rawX))
  const y = Math.max(24, Math.min(rect.height - 10, rawY))
  const arrowOffset = Math.round(rawX - x)
  return {
    x,
    y,
    arrowLeft: arrowOffset === 0 ? '50%' : `calc(50% + ${arrowOffset}px)`
  }
}

function getRpScoreCardStyle(card: RpScoreCard): Record<string, string> {
  return {
    '--rp-player-color': card.color
  }
}

function getRpSeriesStyle(series: RpChartSeries): Record<string, string> {
  return {
    '--rp-player-color': series.color
  }
}

function getRpPointKey(series: RpChartSeries, point: RpIndexPoint): string {
  return `${series.participantId}-${point.minute}`
}

function findDetailPlayerByParticipantId(participantId: number): MatchDetailParticipant | null {
  return allPlayers.value.find(player => player.participantId === participantId) ?? null
}

function getCurrentParticipantId(): number | null {
  const currentPuuid = props.currentPuuid.trim()
  const player = allPlayers.value.find(candidate => {
    if (candidate.isCurrentPlayer) {
      return true
    }
    return Boolean(currentPuuid && candidate.puuid === currentPuuid)
  })
  return normalizePositiveInteger(player?.participantId)
}

function getRpPlayerColor(participantId: number): string {
  const index = Math.max(0, (participantId - 1) % RP_CHART_COLORS.length)
  return RP_CHART_COLORS[index]
}

function createLaneMatchupWatermarks(): LaneMatchupWatermark[] {
  const metric = selectedGoldDiffMetric.value
  if (metric === 'teamAverage') {
    return []
  }

  const matchup = timelineChartModel.value.laneMatchups[metric]
  if (!matchup) {
    return []
  }

  const centerX = CHART_PADDING.left + CHART_PLOT_WIDTH / 2
  const blueY = zeroAxisY.value - LANE_WATERMARK_SIZE / 2 - LANE_WATERMARK_AXIS_GAP
  const redY = zeroAxisY.value + LANE_WATERMARK_SIZE / 2 + LANE_WATERMARK_AXIS_GAP
  const watermarks: LaneMatchupWatermark[] = []

  if (matchup.blue?.championId) {
    watermarks.push(createLaneMatchupWatermark('blue', matchup.blue.championId, centerX, blueY))
  }
  if (matchup.red?.championId) {
    watermarks.push(createLaneMatchupWatermark('red', matchup.red.championId, centerX, redY))
  }
  return watermarks
}

function createTeamAverageWatermarkGroups(): TeamAverageWatermarkGroup[] {
  if (selectedGoldDiffMetric.value !== 'teamAverage') {
    return []
  }

  const groups: TeamAverageWatermarkGroup[] = [
    {
      key: 'blue',
      tone: 'blue',
      watermarks: createTeamChampionWatermarks('blue', blueTeamPlayers.value)
    },
    {
      key: 'red',
      tone: 'red',
      watermarks: createTeamChampionWatermarks('red', redTeamPlayers.value)
    }
  ]
  const blueCount = groups[0].watermarks.length
  const redCount = groups[1].watermarks.length
  if (!blueCount && !redCount) {
    return []
  }

  const centerX = CHART_PADDING.left + CHART_PLOT_WIDTH / 2
  const blueRowY = zeroAxisY.value - TEAM_WATERMARK_SIZE - TEAM_WATERMARK_AXIS_GAP
  const redRowY = zeroAxisY.value + TEAM_WATERMARK_AXIS_GAP

  for (const group of groups) {
    const rowWidth = group.watermarks.length * TEAM_WATERMARK_SIZE
      + Math.max(0, group.watermarks.length - 1) * TEAM_WATERMARK_GAP
    let nextX = centerX - rowWidth / 2 + TEAM_WATERMARK_SIZE / 2
    const rowY = group.tone === 'blue' ? blueRowY : redRowY
    group.watermarks = group.watermarks.map(watermark => {
      const positioned = {
        ...watermark,
        x: nextX,
        y: rowY + TEAM_WATERMARK_SIZE / 2
      }
      nextX += TEAM_WATERMARK_SIZE + TEAM_WATERMARK_GAP
      return positioned
    })
  }

  return groups.filter(group => group.watermarks.length > 0)
}

function createTeamChampionWatermarks(
  tone: TeamTone,
  players: MatchDetailParticipant[]
): LaneMatchupWatermark[] {
  const candidates = players.slice(0, 5)
  if (!candidates.length) {
    return []
  }

  return candidates.flatMap((player, index) => {
    const iconUrl = getChampionIconUrl(player.championId)
    if (!iconUrl) {
      return []
    }

    return [{
      key: `teamAverage-${tone}-${player.participantId}-${player.championId}`,
      tone,
      championId: player.championId,
      iconUrl,
      x: index * (TEAM_WATERMARK_SIZE + TEAM_WATERMARK_GAP),
      y: 0,
      size: TEAM_WATERMARK_SIZE
    }]
  })
}

function createLaneMatchupWatermark(
  tone: TeamTone,
  championId: number,
  x: number,
  y: number
): LaneMatchupWatermark {
  return {
    key: `${selectedGoldDiffMetric.value}-${tone}-${championId}`,
    tone,
    championId,
    iconUrl: getChampionIconUrl(championId),
    x,
    y,
    size: LANE_WATERMARK_SIZE
  }
}

function getLaneMatchupWatermarkTransform(watermark: LaneMatchupWatermark): string {
  const x = watermark.x - watermark.size / 2
  const y = watermark.y - watermark.size / 2
  return `translate(${x.toFixed(2)} ${y.toFixed(2)})`
}

function getChartTooltipStyle(point: GoldDiffPoint): Record<string, string> {
  const anchor = hoveredGoldDiffTooltipAnchor.value
  if (anchor) {
    return {
      left: `${anchor.x.toFixed(1)}px`,
      top: `${anchor.y.toFixed(1)}px`,
      '--timeline-chart-tooltip-arrow-left': anchor.arrowLeft
    }
  }

  const xRatio = getChartX(point.timestamp) / CHART_WIDTH * 100
  const yRatio = Math.max(9, Math.min(92, getChartY(point.diff) / CHART_HEIGHT * 100))
  return {
    left: `${xRatio.toFixed(3)}%`,
    top: `${yRatio.toFixed(3)}%`,
    '--timeline-chart-tooltip-arrow-left': '50%'
  }
}

function showGoldDiffTooltip(event: PointerEvent, point: GoldDiffPoint): void {
  chartHoverSource.value = 'chart'
  hoveredGoldDiffPoint.value = point
  hoveredGoldDiffTooltipAnchor.value = getChartPointerAnchor(event, point)
}

function moveGoldDiffTooltip(event: PointerEvent, point: GoldDiffPoint): void {
  if (chartHoverSource.value !== 'chart') {
    return
  }
  hoveredGoldDiffPoint.value = point
  hoveredGoldDiffTooltipAnchor.value = getChartPointerAnchor(event, point)
}

function hideGoldDiffTooltip(): void {
  if (chartHoverSource.value === 'chart') {
    chartHoverSource.value = null
  }
  hoveredGoldDiffPoint.value = null
  hoveredGoldDiffTooltipAnchor.value = null
}

function getChartPointerAnchor(event: PointerEvent, point: GoldDiffPoint): TimelineEventTooltipAnchor {
  const target = event.currentTarget instanceof Element ? event.currentTarget : null
  const stage = target?.closest('.timeline-chart-stage')
  if (!(stage instanceof HTMLElement)) {
    return {
      x: getChartX(point.timestamp),
      y: getChartY(point.diff),
      arrowLeft: '50%'
    }
  }

  const rect = stage.getBoundingClientRect()
  const rawX = event.clientX - rect.left
  const rawY = event.clientY - rect.top
  const x = Math.max(14, Math.min(rect.width - 14, rawX))
  const y = Math.max(24, Math.min(rect.height - 10, rawY))
  const arrowOffset = Math.round(rawX - x)
  return {
    x,
    y,
    arrowLeft: arrowOffset === 0 ? '50%' : `calc(50% + ${arrowOffset}px)`
  }
}

function getTimelineClusterStyle(cluster: TimelineEventCluster): Record<string, string> {
  const x = getTimelineAxisX(cluster.timestamp)
  return {
    left: `${(x / CHART_WIDTH * 100).toFixed(3)}%`,
    '--timeline-axis-marker-size': `${cluster.markerSize}px`
  }
}

function getTimelineAxisX(timestamp: number): number {
  const maxTimestamp = Math.max(timelineMaxTimestamp.value, 1)
  return getChartX(Math.max(0, Math.min(maxTimestamp, timestamp)))
}

function getTimelineEventTooltipStyle(cluster: TimelineEventCluster): Record<string, string> {
  const anchor = hoveredEventTooltipAnchor.value
  if (anchor) {
    return {
      left: `${anchor.x.toFixed(1)}px`,
      top: `${anchor.y.toFixed(1)}px`,
      '--timeline-axis-tooltip-arrow-left': anchor.arrowLeft
    }
  }

  const xRatio = getTimelineAxisX(cluster.timestamp) / CHART_WIDTH * 100
  return {
    left: `${xRatio.toFixed(3)}%`,
    top: 'calc(100% - 32px)',
    '--timeline-axis-tooltip-arrow-left': '50%'
  }
}

function showTimelineEventTooltip(event: PointerEvent, cluster: TimelineEventCluster): void {
  chartHoverSource.value = 'axis'
  hoveredGoldDiffPoint.value = null
  hoveredGoldDiffTooltipAnchor.value = null
  hoveredEventCluster.value = cluster
  hoveredEventTooltipAnchor.value = getTimelinePointerAnchor(event)
}

function moveTimelineEventTooltip(event: PointerEvent): void {
  if (!hoveredEventCluster.value) {
    return
  }
  hoveredEventTooltipAnchor.value = getTimelinePointerAnchor(event)
}

function hideTimelineEventTooltip(): void {
  if (chartHoverSource.value === 'axis') {
    chartHoverSource.value = null
  }
  hoveredEventCluster.value = null
  hoveredEventTooltipAnchor.value = null
}

function getTimelinePointerAnchor(event: PointerEvent): TimelineEventTooltipAnchor {
  const target = event.currentTarget instanceof Element ? event.currentTarget : null
  const stage = target?.closest('.timeline-chart-stage')
  if (!(stage instanceof HTMLElement)) {
    const fallbackX = getTimelineAxisX(hoveredEventCluster.value?.timestamp ?? 0)
    return {
      x: fallbackX,
      y: CHART_HEIGHT - CHART_PADDING.bottom,
      arrowLeft: '50%'
    }
  }

  const rect = stage.getBoundingClientRect()
  const rawX = event.clientX - rect.left
  const rawY = event.clientY - rect.top
  const x = Math.max(14, Math.min(rect.width - 14, rawX))
  const y = Math.max(24, Math.min(rect.height - 10, rawY))
  const arrowOffset = Math.round(rawX - x)
  return {
    x,
    y,
    arrowLeft: arrowOffset === 0 ? '50%' : `calc(50% + ${arrowOffset}px)`
  }
}

function createTimelineEventTracks(): TimelineEventTrack[] {
  const clusters = chartEventClusters.value
  const blueClusters = clusterTimelineAxisMarkers(clusters, 100)
  const redClusters = clusterTimelineAxisMarkers(clusters, 200)
  return [
    { key: 'blue', clusters: blueClusters },
    { key: 'red', clusters: redClusters }
  ]
}

function createSelectedLaneParticipantIdSet(): Set<number> {
  const metric = selectedGoldDiffMetric.value
  if (metric === 'teamAverage') {
    return new Set()
  }

  const matchup = timelineChartModel.value.laneMatchups[metric]
  return new Set(
    [matchup?.blue?.participantId, matchup?.red?.participantId]
      .filter((participantId): participantId is number => (
        typeof participantId === 'number' && Number.isFinite(participantId)
      ))
  )
}

function getTimelineClusterRelevanceClass(cluster: TimelineEventCluster): string {
  if (!shouldHighlightSelectedLaneTimelineEvents()) {
    return ''
  }
  return isTimelineClusterRelatedToSelectedLane(cluster)
    ? 'timeline-axis-marker--related'
    : 'timeline-axis-marker--dimmed'
}

function shouldHighlightSelectedLaneTimelineEvents(): boolean {
  return selectedGoldDiffMetric.value !== 'teamAverage' && selectedLaneParticipantIds.value.size > 0
}

function isTimelineClusterRelatedToSelectedLane(cluster: TimelineEventCluster): boolean {
  return cluster.items.some(marker => isTimelineEventMarkerRelatedToSelectedLane(marker))
}

function isTimelineEventMarkerRelatedToSelectedLane(marker: TimelineEventMarker): boolean {
  return isTimelineEventMarkerRelatedToParticipantIds(marker, selectedLaneParticipantIds.value)
}

function isTimelineEventMarkerRelatedToParticipantIds(
  marker: TimelineEventMarker,
  participantIds: Set<number>
): boolean {
  if (!participantIds.size) {
    return false
  }

  if (
    (marker.participantId !== null && participantIds.has(marker.participantId))
    || (marker.killerId !== null && participantIds.has(marker.killerId))
    || (marker.victimId !== null && participantIds.has(marker.victimId))
  ) {
    return true
  }

  return (marker.assistingParticipantIds ?? []).some(participantId => participantIds.has(participantId))
}

function clusterTimelineAxisMarkers(
  clusters: TimelineEventCluster[],
  teamId: number,
  options?: TimelineAxisClusterOptions
): TimelineEventCluster[] {
  const windowMs = Math.max(0, options?.windowMs ?? TIMELINE_AXIS_CLUSTER_WINDOW_MS)
  const axisClusters: TimelineEventCluster[] = []
  const teamClusters = clusters
    .filter(cluster => cluster.teamId === teamId)
    .sort((left, right) => left.timestamp - right.timestamp)

  for (const sourceCluster of teamClusters) {
    const cluster = createTimelineAxisCluster(sourceCluster)
    const previousCluster = axisClusters[axisClusters.length - 1]
    if (
      previousCluster
      && cluster.timestamp - previousCluster.endTimestamp <= windowMs
    ) {
      previousCluster.items.push(...cluster.items)
      previousCluster.endTimestamp = Math.max(previousCluster.endTimestamp, cluster.endTimestamp)
      previousCluster.timestamp = getTimelineAxisClusterTimestamp(previousCluster)
      previousCluster.count = getTimelineAxisClusterCount(previousCluster)
      previousCluster.markerSize = getTimelineAxisClusterMarkerSize(previousCluster.count)
      previousCluster.key = createTimelineAxisClusterKey(previousCluster)
      continue
    }

    axisClusters.push(cluster)
  }

  return axisClusters
}

function createTimelineAxisCluster(cluster: TimelineEventCluster): TimelineEventCluster {
  const axisCluster: TimelineEventCluster = {
    ...cluster,
    key: createTimelineAxisClusterKey(cluster),
    items: [...cluster.items],
    count: getTimelineAxisClusterCount(cluster),
    markerSize: getTimelineAxisClusterMarkerSize(getTimelineAxisClusterCount(cluster))
  }
  axisCluster.timestamp = getTimelineAxisClusterTimestamp(axisCluster)
  return axisCluster
}

function getTimelineAxisClusterCount(cluster: TimelineEventCluster): number {
  return cluster.items.length || cluster.count
}

function getTimelineAxisClusterTimestamp(cluster: TimelineEventCluster): number {
  const timestamps = cluster.items
    .map(item => item.timestamp)
    .filter(timestamp => Number.isFinite(timestamp))
  if (!timestamps.length) {
    return cluster.timestamp
  }
  return Math.round(timestamps.reduce((total, timestamp) => total + timestamp, 0) / timestamps.length)
}

function getTimelineAxisClusterMarkerSize(count: number): number {
  if (count >= 4) {
    return 19
  }
  if (count >= 2) {
    return 15
  }
  return 11
}

function createTimelineAxisClusterKey(cluster: TimelineEventCluster): string {
  return `axis-cluster-${cluster.teamId ?? 'unknown'}-${cluster.items[0]?.timestamp ?? cluster.timestamp}-${cluster.count}`
}

function getTimelineClusterLabel(cluster: TimelineEventCluster): string {
  return cluster.count > 1
    ? `${formatTimelineTime(cluster.timestamp)} ${cluster.count}`
    : t(getTimelineEventLabelKey(cluster.type))
}

function getTimelineEventLabelKey(type: TimelineEventMarker['type']): MessageKey {
  switch (type) {
    case 'kill':
      return 'matchDetail.timelineEventKill'
    case 'turret':
      return 'matchDetail.timelineEventTurret'
    case 'dragon':
      return 'matchDetail.timelineEventDragon'
    case 'baron':
      return 'matchDetail.timelineEventBaron'
    case 'herald':
      return 'matchDetail.timelineEventHerald'
    case 'voidgrub':
      return 'matchDetail.timelineEventVoidgrub'
  }
}

function getTimelineClusterTooltipRows(cluster: TimelineEventCluster): TimelineEventTooltipRow[] {
  return cluster.items.map(marker => {
    const description = describeTimelineEventMarker(marker)
    return {
      key: marker.key,
      actorText: description.actorText,
      actionText: description.actionText,
      targetText: description.targetText,
      actorChampionId: description.actorChampionId,
      targetChampionId: description.targetChampionId
    }
  })
}

function getChartPointKey(point: GoldDiffPoint, index: number): string {
  return `${selectedGoldDiffMetric.value}-${point.timestamp}-${index}`
}

function formatChartTooltipMetricLine(label: string, point: GoldDiffPoint): string {
  return `${label}(${formatGoldDiffMagnitude(point.diff)})`
}

function formatGoldDiffMagnitude(value?: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--'
  }
  return Math.round(Math.abs(value)).toLocaleString('en-US')
}

function createTeamSection(
  key: TeamTone,
  teamId: number,
  label: string,
  players: MatchDetailParticipant[],
  totals: TeamStatsSummary
): TeamSection {
  const won = Boolean(players[0]?.stats?.win)
  return {
    key,
    teamId,
    label,
    result: won ? t('common.win') : t('common.loss'),
    won,
    players,
    totals
  }
}

function getPlayerName(player: MatchDetailParticipant): string {
  return player.displayName || `${t('common.unknownPlayer')} ${player.participantId}`
}

function canNavigatePlayer(player: MatchDetailParticipant): boolean {
  return Boolean(player.gameName && player.tagLine)
}

function handlePlayerClick(player: MatchDetailParticipant): void {
  if (canNavigatePlayer(player)) {
    emit('navigateToPlayer', player.gameName, player.tagLine)
  }
}

function getPlayerSpellSlots(player: MatchDetailParticipant): SpellSlot[] {
  return [player.spell1Id, player.spell2Id].map((spellId, index) => {
    const id = normalizePositiveInteger(spellId)
    const url = getSummonerSpellIconUrl(id)
    return {
      key: `spell-${index}-${id || 'empty'}`,
      id,
      url,
      empty: id === null || !url
    }
  })
}

function getPlayerItemSlots(player: MatchDetailParticipant): ItemIconSlot[] {
  return getItemIconSlots(player.stats)
}

function getItemSlotLabel(slot: ItemIconSlot): string {
  if (slot.empty || slot.itemId === null) {
    return t('matchDetail.emptyItemSlot')
  }
  const details = getItemAssetDetails(slot.itemId)
  return details?.name ? `${details.name} (${slot.itemId})` : `${t('matchDetail.itemLabel')} ${slot.itemId}`
}

function getRuneParticipantKey(player: MatchDetailParticipant): string {
  return `${props.matchHistory.gameId}-${player.participantId}`
}

function getCurrentRuneParticipant(): MatchDetailParticipant | null {
  const currentPlayer = allPlayers.value.find(player => {
    const playerRecord = player as unknown as Record<string, unknown>
    return player.isCurrentPlayer || playerRecord.puuid === props.currentPuuid
  })
  return currentPlayer || null
}

function ensureCurrentRuneParticipantExpanded(): void {
  if (activeTabValue.value !== 'runes') {
    return
  }

  const expandedPlayerExists = allPlayers.value.some(player =>
    getRuneParticipantKey(player) === expandedRuneParticipantKey.value
  )
  if (expandedRuneParticipantKey.value && expandedPlayerExists) {
    return
  }

  const currentPlayer = getCurrentRuneParticipant()
  if (currentPlayer) {
    expandedRuneParticipantKey.value = getRuneParticipantKey(currentPlayer)
  }
}

function isRuneParticipantExpanded(player: MatchDetailParticipant): boolean {
  return expandedRuneParticipantKey.value === getRuneParticipantKey(player)
}

function toggleRuneParticipant(player: MatchDetailParticipant): void {
  const participantKey = getRuneParticipantKey(player)
  expandedRuneParticipantKey.value = expandedRuneParticipantKey.value === participantKey
    ? ''
    : participantKey
}

function getPlayerTraitSlots(player: MatchDetailParticipant): TraitSlot[] {
  return hasValidAugment(player) ? getAugmentTraitSlots(player) : getPerkTraitSlots(player)
}

function getPerkTraitSlots(player: MatchDetailParticipant): TraitSlot[] {
  return [...getPrimaryRuneSlots(player), ...getSecondaryRuneSlots(player)]
}

function getRuneDetailSlots(player: MatchDetailParticipant): TraitSlot[] {
  return getPlayerTraitSlots(player).filter(slot => !slot.empty && slot.id !== null)
}

function getPlayerRuneColumns(player: MatchDetailParticipant): RuneStyleColumn[] {
  const primaryStyleSlot = getRuneStyleSlot(player, 0)
  const secondaryStyleSlot = getRuneStyleSlot(player, 1)
  return [
    {
      key: 'primary',
      styleId: primaryStyleSlot?.id ?? null,
      styleSlot: primaryStyleSlot,
      title: getRuneStyleTitle('primary', primaryStyleSlot),
      slots: getPrimaryRuneSlots(player)
    },
    {
      key: 'secondary',
      styleId: secondaryStyleSlot?.id ?? null,
      styleSlot: secondaryStyleSlot,
      title: getRuneStyleTitle('secondary', secondaryStyleSlot),
      slots: getSecondaryRuneSlots(player)
    }
  ]
}

function getPrimaryRuneSlots(player: MatchDetailParticipant): TraitSlot[] {
  const styles = readPerkStyles(player)
  const nestedSlots = getRuneSlotsFromStyleSelections(styles[0], 'primary')
  if (nestedSlots.length) {
    return nestedSlots
  }

  return ['perk0', 'perk1', 'perk2', 'perk3']
    .map((key, index) => createTraitSlot('perk', key, readTraitId(player, key) || readNestedPerkId(player, index)))
    .filter(isFilledTraitSlot)
}

function getSecondaryRuneSlots(player: MatchDetailParticipant): TraitSlot[] {
  const styles = readPerkStyles(player)
  const nestedSlots = getRuneSlotsFromStyleSelections(styles[1], 'secondary')
  if (nestedSlots.length) {
    return nestedSlots
  }

  return ['perk4', 'perk5']
    .map((key, index) => createTraitSlot('perk', key, readTraitId(player, key) || readNestedPerkId(player, index + 4)))
    .filter(isFilledTraitSlot)
}

function getRuneStyleSlot(player: MatchDetailParticipant, styleIndex: number): TraitSlot | null {
  const fallbackKey = styleIndex === 0 ? 'perkPrimaryStyle' : 'perkSubStyle'
  const styleId = readNestedPerkStyleId(player, styleIndex) || readTraitId(player, fallbackKey)
  return styleId === null ? null : createTraitSlot('perk', `${styleIndex === 0 ? 'primary' : 'secondary'}-style`, styleId)
}

function getRuneSlotsFromStyleSelections(style: unknown, columnKey: RuneStyleColumn['key']): TraitSlot[] {
  if (!isRecord(style) || !Array.isArray(style.selections)) {
    return []
  }

  return style.selections
    .map((selection, index) => {
      if (!isRecord(selection)) {
        return null
      }

      return createTraitSlot('perk', `${columnKey}-${index}`, normalizePositiveInteger(selection.perk))
    })
    .filter((slot): slot is TraitSlot => slot !== null && isFilledTraitSlot(slot))
}

function getRuneStyleTitle(key: RuneStyleColumn['key'], styleSlot: TraitSlot | null): string {
  if (styleSlot?.id && RUNE_STYLE_NAMES[styleSlot.id]) {
    return RUNE_STYLE_NAMES[styleSlot.id]
  }

  if (styleSlot?.id) {
    return getPerkAssetDetails(styleSlot.id)?.name || getTraitDetailName(styleSlot)
  }

  return key === 'primary' ? '主系' : '副系'
}

function isFilledTraitSlot(slot: TraitSlot): boolean {
  return !slot.empty && slot.id !== null
}

function getAugmentTraitSlots(player: MatchDetailParticipant): TraitSlot[] {
  return ['playerAugment1', 'playerAugment2', 'playerAugment3', 'playerAugment4', 'playerAugment5', 'playerAugment6']
    .map(key => createTraitSlot('augment', key, readTraitId(player, key)))
}

function getPlayerOverviewAugmentSlots(player: MatchDetailParticipant): TraitSlot[] {
  return getAugmentTraitSlots(player).filter(slot => !slot.empty && slot.id !== null)
}

function createTraitSlot(kind: TraitKind, key: string, id: number | null): TraitSlot {
  const url = id === null
    ? ''
    : kind === 'augment'
      ? getAugmentIconUrl(id)
      : getPerkIconUrl(id)
  return {
    key: `${kind}-${key}-${id || 'empty'}`,
    kind,
    id,
    url,
    empty: id === null || !url,
    label: getTraitSlotLabel(kind, id),
    rarityClass: getTraitRarityClass(kind, id)
  }
}

function getTraitRarityClass(kind: TraitKind, id: number | null): string {
  if (kind !== 'augment' || id === null) {
    return ''
  }

  return getAugmentRarityClass(getAugmentAssetDetails(id)?.rarity)
}

function hasValidAugment(player: MatchDetailParticipant): boolean {
  return ['playerAugment1', 'playerAugment2', 'playerAugment3', 'playerAugment4', 'playerAugment5', 'playerAugment6']
    .some(key => readTraitId(player, key) !== null)
}

function readTraitId(player: MatchDetailParticipant, key: string): number | null {
  return normalizePositiveInteger(readStatNumber(player, key))
}

function getTraitSlotLabel(kind: TraitKind, id: number | null): string {
  if (id === null) {
    return kind === 'augment' ? t('matchDetail.emptyAugmentSlot') : t('matchDetail.emptyRuneSlot')
  }

  const details = kind === 'augment' ? getAugmentAssetDetails(id) : getPerkAssetDetails(id)
  const fallback = kind === 'augment' ? t('matchDetail.augmentLabel') : t('matchDetail.runeLabel')
  const name = details?.name || `${fallback} ${id}`
  const description = normalizeRiotTooltipText(details?.description || details?.tooltip || details?.shortDesc || details?.longDesc || details?.plaintext || '')
  return description ? `${name} (${id}) - ${description}` : `${name} (${id})`
}

function getTraitTooltipDetails(slot: TraitSlot): GameAssetTooltipDetails | null {
  if (slot.empty || slot.id === null) {
    return null
  }

  return slot.kind === 'augment'
    ? getAugmentTooltipDetails(slot.id)
    : getPerkTooltipDetails(slot.id)
}

function getTraitDetailName(slot: TraitSlot): string {
  if (slot.id === null) {
    return slot.label
  }

  const details = slot.kind === 'augment' ? getAugmentAssetDetails(slot.id) : getPerkAssetDetails(slot.id)
  return details?.name || slot.label
}

function getRuneDisplayName(slot: TraitSlot): string {
  if (slot.id === null) {
    return slot.label
  }

  const details = slot.kind === 'augment' ? getAugmentAssetDetails(slot.id) : getPerkAssetDetails(slot.id)
  return details?.name || slot.label.split(' - ')[0] || slot.label
}

function getRuneSelectionRecord(
  player: MatchDetailParticipant,
  perkId: number
): Record<string, unknown> | null {
  return readPerkSelections(player).find(selection =>
    normalizePositiveInteger(selection.perk) === perkId
  ) || null
}

function getRuneStatDisplayRows(
  player: MatchDetailParticipant,
  slot: TraitSlot
): RuneStatDisplayRow[] {
  if (slot.kind !== 'perk' || slot.id === null) {
    return []
  }

  const selection = getRuneSelectionRecord(player, slot.id)
  if (!selection) {
    return []
  }

  const metadataRows = getMetadataRuneStatRows(slot.id, selection)
  if (metadataRows.length) {
    return metadataRows
  }

  return getDefinedRuneStatRows(slot.id, selection)
}

function getDefinedRuneStatRows(
  perkId: number,
  selection: Record<string, unknown>
): RuneStatDisplayRow[] {
  const definitions = RUNE_STAT_DEFINITIONS[perkId] || []
  if (!definitions.length) {
    return []
  }

  return definitions
    .map(definition => {
      const value = readRuneStatDefinitionValue(selection, definition)
      return value === null
        ? null
        : {
            key: `${perkId}-${definition.key}`,
            text: definition.text(value)
          }
    })
    .filter((row): row is RuneStatDisplayRow => row !== null)
}

function getMetadataRuneStatRows(
  perkId: number,
  selection: Record<string, unknown>
): RuneStatDisplayRow[] {
  const descriptions = getPerkEndOfGameStatDescriptions(perkId)
  if (!descriptions.length) {
    return []
  }

  return descriptions
    .map((description, index) => {
      const valueKeys = getRuneStatDescriptionVarKeys(description)
      if (!hasPositiveRuneStatValue(selection, valueKeys)) {
        return null
      }

      const text = formatPerkEndOfGameStatDescription(description, selection)
      return text
        ? {
            key: `${perkId}-metadata-${index}`,
            text
          }
        : null
    })
    .filter((row): row is RuneStatDisplayRow => row !== null)
}

function getPerkEndOfGameStatDescriptions(perkId: number): string[] {
  const details = getPerkAssetDetails(perkId) as (GameAssetMetadataEntry & {
    endOfGameStatDescs?: unknown
    endOfGameStatDesc?: unknown
  }) | null
  if (!details) {
    return []
  }

  const descriptions = [
    ...(Array.isArray(details.endOfGameStatDescs) ? details.endOfGameStatDescs : []),
    details.endOfGameStatDesc
  ]
    .map(normalizeRuneStatDescriptionText)
    .filter(Boolean)

  return Array.from(new Set(descriptions))
}

// LCU end-of-game descriptions can use @eogvar1@, @eogvar2@, @eogvar3@, {{var1}}, or {var1}.
function formatPerkEndOfGameStatDescription(
  description: string,
  selection: Record<string, unknown>
): string {
  let text = normalizeRuneStatDescriptionText(description)
  const valueKeys = getRuneStatDescriptionVarKeys(text)
  for (const key of valueKeys) {
    const value = normalizeFiniteNumber(selection[key])
    if (value === null) {
      return ''
    }

    const formattedValue = formatRuneStatValue(value)
    const keyNumber = key.replace('var', '')
    text = text
      .replace(new RegExp(`@eogvar${keyNumber}@`, 'g'), formattedValue)
      .replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), formattedValue)
      .replace(new RegExp(`\\{${key}\\}`, 'g'), formattedValue)
  }

  text = normalizeRuneStatDescriptionText(text)
  if (!text || /@[^@\s]+@|\{\{|\}\}|\{var/.test(text) || /^[\d.,+\-\s%]+$/.test(text)) {
    return ''
  }

  return text
}

function getRuneStatDescriptionVarKeys(description: string): RuneStatVarKey[] {
  return (['var1', 'var2', 'var3'] as const).filter(key => {
    const keyNumber = key.replace('var', '')
    return new RegExp(`@eogvar${keyNumber}@|\\{\\{\\s*${key}\\s*\\}\\}|\\{${key}\\}`).test(description)
  })
}

function hasPositiveRuneStatValue(
  selection: Record<string, unknown>,
  keys?: RuneStatVarKey[]
): boolean {
  const values = keys?.length
    ? keys.map(key => selection[key])
    : [selection.var1, selection.var2, selection.var3]

  return values.some(rawValue => {
    const value = normalizeFiniteNumber(rawValue)
    return value !== null && value > 0
  })
}

function normalizeRuneStatDescriptionText(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  return value
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|ul|ol|tr|table|maintext|stats|rules)>/gi, '\n')
    .replace(/<li(?:\s[^>]*)?>/gi, '\n')
    .replace(/%i:[^%\s]+%?/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n+ */g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function readRuneStatDefinitionValue(
  selection: Record<string, unknown>,
  definition: RuneStatDefinition
): number | null {
  for (const key of definition.valueKeys) {
    if (!Object.prototype.hasOwnProperty.call(selection, key)) {
      continue
    }

    const value = normalizeFiniteNumber(selection[key])
    if (value === null) {
      continue
    }

    if (definition.showZero ? value >= 0 : value > 0) {
      return value
    }
  }

  return null
}

function readPerkStyles(player: MatchDetailParticipant): unknown[] {
  for (const perks of readPerkRecords(player)) {
    if (Array.isArray(perks.styles)) {
      return perks.styles
    }
  }

  return []
}

function readPerkSelections(player: MatchDetailParticipant): Record<string, unknown>[] {
  const selections: Record<string, unknown>[] = []
  for (const style of readPerkStyles(player)) {
    if (!isRecord(style) || !Array.isArray(style.selections)) {
      continue
    }

    for (const selection of style.selections) {
      if (isRecord(selection)) {
        selections.push(selection)
      }
    }
  }
  return selections
}

function readNestedPerkStyleId(player: MatchDetailParticipant, styleIndex: number): number | null {
  const style = readPerkStyles(player)[styleIndex]
  return isRecord(style) ? normalizePositiveInteger(style.style) : null
}

function readNestedPerkId(player: MatchDetailParticipant, perkIndex: number): number | null {
  for (const perks of readPerkRecords(player)) {
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

function readPerkRecords(player: MatchDetailParticipant): Record<string, unknown>[] {
  const statsRecord = player.stats as unknown as Record<string, unknown> | null | undefined
  const playerRecord = player as unknown as Record<string, unknown>
  const statsExtraFieldsValue = statsRecord?.extraFields
  const playerExtraFieldsValue = playerRecord.extraFields
  const statsExtraFields = isRecord(statsExtraFieldsValue) ? statsExtraFieldsValue : null
  const playerExtraFields = isRecord(playerExtraFieldsValue) ? playerExtraFieldsValue : null
  const perkSources = [
    statsRecord?.perks,
    statsExtraFields?.perks,
    playerRecord.perks,
    playerExtraFields?.perks
  ]

  return perkSources.filter((perks): perks is Record<string, unknown> => isRecord(perks))
}

function formatRuneStatValue(value: unknown): string {
  const normalizedValue = normalizeFiniteNumber(value)
  if (normalizedValue === null) {
    return ''
  }

  return Number.isInteger(normalizedValue) ? String(normalizedValue) : String(Number(normalizedValue.toFixed(2)))
}

function isLaneBasedMode(match: MatchHistory | GameDetail | null | undefined): boolean {
  if (!match) {
    return false
  }

  const queueId = normalizeFiniteNumber(match.queueId)
  const gameMode = normalizeModeText(match.gameMode)
  const queueName = normalizeModeText(getQueueName(match))
  const modeText = `${queueName} ${gameMode}`.trim()

  if (queueId !== null && NON_LANE_BASED_QUEUE_IDS.has(queueId)) {
    return false
  }
  if (NON_LANE_BASED_GAME_MODES.has(gameMode)) {
    return false
  }
  if (containsModeKeyword(modeText, NON_LANE_BASED_QUEUE_KEYWORDS)) {
    return false
  }
  if (queueId !== null && LANE_BASED_QUEUE_IDS.has(queueId)) {
    return true
  }
  if (LANE_BASED_GAME_MODES.has(gameMode)) {
    return true
  }
  return containsModeKeyword(modeText, LANE_BASED_QUEUE_KEYWORDS)
}

function isRankedMode(match: MatchHistory | GameDetail | null | undefined): boolean {
  if (!match) {
    return false
  }

  const queueId = normalizeFiniteNumber(match.queueId)
  const queueName = normalizeModeText(getQueueName(match))
  if (queueId !== null && RANKED_QUEUE_IDS.has(queueId)) {
    return true
  }
  if (containsModeKeyword(queueName, RANKED_QUEUE_KEYWORDS)) {
    return true
  }
  return false
}

function getQueueName(match: MatchHistory | GameDetail): string {
  const queueName = 'queueName' in match ? match.queueName : ''
  return typeof queueName === 'string' ? queueName : ''
}

function normalizeModeText(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

function containsModeKeyword(value: string, keywords: string[]): boolean {
  return keywords.some(keyword => value.includes(keyword.toUpperCase()))
}

function getDisplayPosition(player: MatchDetailParticipant): string {
  if (!isLaneBasedMode(displayGameDetail.value || props.matchHistory)) {
    return ''
  }
  return getPositionLabel(player)
}

function getPositionLabel(player: MatchDetailParticipant): string {
  return player.timeline?.positionCn ||
    player.teamPosition ||
    player.timeline?.teamPosition ||
    player.individualPosition ||
    player.selectedPosition ||
    ''
}

function getChampionLevel(player: MatchDetailParticipant): number | null {
  return normalizePositiveInteger(
    readStatNumber(player, 'champLevel') ??
    readStatNumber(player, 'championLevel') ??
    readStatNumber(player, 'level')
  )
}

function getPlayerKills(player: MatchDetailParticipant): number {
  return readStatNumber(player, 'kills') ?? 0
}

function getPlayerDeaths(player: MatchDetailParticipant): number {
  return readStatNumber(player, 'deaths') ?? 0
}

function getPlayerAssists(player: MatchDetailParticipant): number {
  return readStatNumber(player, 'assists') ?? 0
}

function getTeamKda(totals: TeamStatsSummary): string {
  return `${totals.kills}/${totals.deaths}/${totals.assists}`
}

function getTeamBans(teamId: number): number[] {
  const summaryBans = getTeamObjectiveSummary(teamId)?.bans || []
  const standaloneBans = getTeamBanSummary(teamId)?.bans || []
  const source = summaryBans.length ? summaryBans : standaloneBans
  return source
    .map(championId => normalizePositiveInteger(championId))
    .filter((championId): championId is number => championId !== null)
    .slice(0, 5)
}

function getTeamObjectiveItems(teamId: number): ObjectiveDisplayItem[] {
  const summary = getTeamObjectiveSummary(teamId)
  if (!summary) {
    return []
  }
  return buildObjectiveDisplayItems(teamId, summary)
}

function buildObjectiveDisplayItems(teamId: number, summary: TeamObjectiveSummary): ObjectiveDisplayItem[] {
  const items: ObjectiveDisplayItem[] = []
  addStructureObjectiveItem(items, teamId, 'turret', 'turret', '塔', readStructureObjectiveCount(teamId, summary, 'turret'))
  addStructureObjectiveItem(items, teamId, 'inhibitor', 'inhibitor', '水晶', readStructureObjectiveCount(teamId, summary, 'inhibitor'))
  addStructureObjectiveItem(items, teamId, 'turret-plate', 'turretPlate', '镀层', readStructureObjectiveCount(teamId, summary, 'turretPlate'))
  addObjectiveItem(items, teamId, 'baron', 'baron', '男爵', readObjectiveCount(summary.baronKills))
  addObjectiveItem(items, teamId, 'elder', 'elder', '远古龙', readObjectiveCount(summary.elderDragonKills))
  addDragonObjectiveItems(items, teamId, summary)
  addObjectiveItem(items, teamId, 'herald', 'herald', '先锋', readObjectiveCount(summary.heraldKills))
  addObjectiveItem(items, teamId, 'voidgrub', 'voidgrub', '虚空巢虫', readObjectiveCount(summary.voidGrubKills))
  return items
}

function getObjectiveItemIcons(item: ObjectiveDisplayItem): ObjectiveDisplayIcon[] {
  if (item.icons?.length) {
    return item.icons
  }
  return [createObjectiveDisplayIcon(item.key, item.kind, item.label, null)]
}

function shouldUseObjectiveIconImage(icon: ObjectiveDisplayIcon): boolean {
  return Boolean(icon.iconUrl) && !failedObjectiveIconKeys.value.has(icon.key)
}

function getObjectiveCountText(item: ObjectiveDisplayItem): string {
  return item.count === null ? '--' : String(item.count)
}

function formatObjectiveTitle(label: string, count: number | null): string {
  return count === null ? `${label} --` : `${label} x${count}`
}

function handleObjectiveIconLoadFailed(event: Event, key: string): void {
  markAssetLoadFailed(event)
  failedObjectiveIconKeys.value = new Set([...failedObjectiveIconKeys.value, key])
}

function getTeamObjectiveSummary(teamId: number): TeamObjectiveSummary | null {
  return (displayGameDetail.value?.teamObjectives || [])
    .find(summary => normalizeTeamId(summary?.teamId) === teamId) || null
}

function getTeamBanSummary(teamId: number): TeamBanSummary | null {
  return (displayGameDetail.value?.teamBans || [])
    .find(summary => normalizeTeamId(summary?.teamId) === teamId) || null
}

function readStructureObjectiveCount(teamId: number, summary: TeamObjectiveSummary, sourceKey: StructureObjectiveSourceKey): number | null {
  const source = STRUCTURE_OBJECTIVE_SOURCES[sourceKey]
  const summaryCount = readStructureSummaryObjectiveCount(summary, source)
  const directStatCount = sumTeamParticipantObjectiveStats(teamId, source.directStatKeys)
  const lastFallbackStatCount = sumTeamParticipantObjectiveStats(teamId, source.lastFallbackStatKeys)
  const eventCount = countObjectiveEvents(summary, teamId, source.eventKind)

  if (sourceKey === 'turretPlate') {
    if (summaryCount !== null && summaryCount > 0) {
      return summaryCount
    }
    if (directStatCount !== null && directStatCount > 0) {
      return directStatCount
    }
    if (eventCount !== null && eventCount > 0) {
      return eventCount
    }
    if (lastFallbackStatCount !== null && lastFallbackStatCount > 0) {
      return lastFallbackStatCount
    }
    if (summaryCount !== null) {
      return summaryCount
    }
    if (directStatCount !== null) {
      return directStatCount
    }
    if (lastFallbackStatCount !== null) {
      return lastFallbackStatCount
    }
    return null
  }

  if (eventCount !== null && eventCount > 0) {
    return eventCount
  }

  if (directStatCount !== null && directStatCount > 0) {
    return directStatCount
  }

  if (lastFallbackStatCount !== null && lastFallbackStatCount > 0) {
    return lastFallbackStatCount
  }

  if (summaryCount !== null && summaryCount > 0) {
    return summaryCount
  }
  if (directStatCount !== null) {
    return directStatCount
  }
  if (eventCount !== null && summaryCount !== null) {
    return eventCount
  }
  if (lastFallbackStatCount !== null) {
    return lastFallbackStatCount
  }
  if (summaryCount !== null) {
    return summaryCount
  }
  return null
}

function readStructureSummaryObjectiveCount(summary: TeamObjectiveSummary, source: StructureObjectiveSource): number | null {
  const keys = source.summaryKeys ?? [source.summaryKey]
  let knownZeroCount: number | null = null
  for (const key of keys) {
    const count = readNullableObjectiveCount(summary[key])
    if (count !== null && count > 0) {
      return count
    }
    if (count !== null && knownZeroCount === null) {
      knownZeroCount = count
    }
  }
  return knownZeroCount
}

function countObjectiveEvents(summary: TeamObjectiveSummary, teamId: number, kind: TeamObjectiveEvent['kind']): number | null {
  if (!Array.isArray(summary.objectiveEvents)) {
    return null
  }
  return summary.objectiveEvents
    .filter(event => matchesObjectiveEvent(event, { kind }, teamId))
    .length
}

function sumTeamParticipantObjectiveStats(teamId: number, fieldKeys: string[]): number | null {
  if (!fieldKeys.length) {
    return null
  }
  let total = 0
  let hasKnownValue = false
  for (const player of allPlayers.value) {
    if (normalizeTeamId(player.teamId) !== teamId) {
      continue
    }
    const value = readParticipantObjectiveStat(player, fieldKeys)
    if (value === null) {
      continue
    }
    hasKnownValue = true
    total += value
  }
  return hasKnownValue ? total : null
}

function readParticipantObjectiveStat(player: MatchDetailParticipant, fieldKeys: string[]): number | null {
  for (const key of fieldKeys) {
    const value = readParticipantObjectiveField(player, key)
    if (value !== null) {
      return Math.max(0, Math.floor(value))
    }
  }
  return null
}

function readParticipantObjectiveField(player: MatchDetailParticipant, key: string): number | null {
  const statsValue = readStatNumber(player, key)
  if (statsValue !== null && statsValue > 0) {
    return statsValue
  }
  const challenges = player.stats?.challenges as Record<string, unknown> | null | undefined
  const challengeValue = normalizeFiniteNumber(challenges?.[key])
  return challengeValue !== null ? challengeValue : statsValue
}

function addStructureObjectiveItem(
  items: ObjectiveDisplayItem[],
  teamId: number,
  key: string,
  kind: ObjectiveIconKind,
  label: string,
  count: number | null
): void {
  items.push({
    key: `${teamId}-${key}`,
    kind,
    label,
    count,
    showCount: true,
    title: formatObjectiveTitle(label, count),
    iconUrl: getObjectiveIconUrl(kind),
    tooltipGroups: getObjectiveTooltipGroups(teamId, key, label)
  })
}

function addDragonObjectiveItems(items: ObjectiveDisplayItem[], teamId: number, summary: TeamObjectiveSummary): void {
  const icons = getDragonTimelineObjectiveIcons(teamId, summary)
  const dragonIcons = icons.length ? icons : getFallbackDragonObjectiveIcons(teamId, summary)
  addDragonObjectiveItem(items, teamId, dragonIcons)
}

function getDragonTimelineObjectiveIcons(teamId: number, summary: TeamObjectiveSummary): ObjectiveDisplayIcon[] {
  const events = getSortedTimestampedDragonEvents(summary, teamId)
  const totalDragonKills = readObjectiveCount(summary.dragonKills)
  if (totalDragonKills > 0 && events.length < totalDragonKills) {
    return []
  }
  return events.map((entry, timelineIndex) => {
    const kind = getObjectiveIconKindForDragonType(entry.dragonType)
    const label = DRAGON_TYPE_LABELS[entry.dragonType]
    return createObjectiveDisplayIcon(
      `${teamId}-dragon-timeline-${timelineIndex}-${entry.dragonType}-${entry.timestamp}`,
      kind,
      label,
      entry.timestamp
    )
  })
}

function getFallbackDragonObjectiveIcons(teamId: number, summary: TeamObjectiveSummary): ObjectiveDisplayIcon[] {
  const icons: ObjectiveDisplayIcon[] = []
  const dragonKillsByType = normalizeDragonKillsByType(summary.dragonKillsByType)
  let fallbackIndex = 0
  for (const dragonType of DRAGON_TYPE_ORDER) {
    const count = dragonKillsByType[dragonType] || 0
    for (let repeatIndex = 0; repeatIndex < count; repeatIndex += 1) {
      const kind = getObjectiveIconKindForDragonType(dragonType)
      icons.push(createObjectiveDisplayIcon(
        `${teamId}-dragon-fallback-${fallbackIndex}-${dragonType}`,
        kind,
        DRAGON_TYPE_LABELS[dragonType],
        null
      ))
      fallbackIndex += 1
    }
  }
  if (icons.length) {
    return icons
  }

  const totalDragonKills = readObjectiveCount(summary.dragonKills)
  for (let index = 0; index < totalDragonKills; index += 1) {
    icons.push(createObjectiveDisplayIcon(
      `${teamId}-dragon-fallback-${index}`,
      'dragon',
      DRAGON_GROUP_LABEL,
      null
    ))
  }
  return icons
}

function addDragonObjectiveItem(items: ObjectiveDisplayItem[], teamId: number, icons: ObjectiveDisplayIcon[]): void {
  if (!icons.length) {
    return
  }
  items.push({
    key: `${teamId}-dragon`,
    kind: 'dragon',
    label: DRAGON_GROUP_LABEL,
    count: null,
    showCount: false,
    title: `${DRAGON_GROUP_LABEL}：${icons.map(icon => icon.label).join(' / ')}`,
    iconUrl: getObjectiveIconUrl('dragon'),
    icons,
    tooltipGroups: getObjectiveTooltipGroups(teamId, 'dragon', DRAGON_GROUP_LABEL)
  })
}

function createObjectiveDisplayIcon(
  key: string,
  kind: ObjectiveIconKind,
  label: string,
  timestamp: number | null
): ObjectiveDisplayIcon {
  return {
    key,
    kind,
    label,
    iconUrl: getObjectiveIconUrl(kind),
    timestamp
  }
}

function getSortedTimestampedDragonEvents(summary: TeamObjectiveSummary, teamId: number): TimestampedDragonObjectiveEvent[] {
  return (summary.objectiveEvents || [])
    .map((event, index): TimestampedDragonObjectiveEvent | null => {
      if (event.kind !== 'dragon') {
        return null
      }
      const timestamp = normalizeFiniteNumber(event.timestamp)
      if (timestamp === null || !matchesObjectiveEvent(event, { kind: 'dragon' }, teamId)) {
        return null
      }
      return {
        event,
        timestamp,
        index,
        dragonType: normalizeDragonTypeKey(event.subType)
      }
    })
    .filter((entry): entry is TimestampedDragonObjectiveEvent => entry !== null)
    .sort((left, right) => left.timestamp - right.timestamp || left.index - right.index)
}

function addObjectiveItem(
  items: ObjectiveDisplayItem[],
  teamId: number,
  key: string,
  kind: ObjectiveIconKind,
  label: string,
  count: number,
  title = formatObjectiveTitle(label, count)
): void {
  if (count <= 0) {
    return
  }
  items.push({
    key: `${teamId}-${key}`,
    kind,
    label,
    count,
    showCount: true,
    title,
    iconUrl: getObjectiveIconUrl(kind),
    tooltipGroups: getObjectiveTooltipGroups(teamId, key, label)
  })
}

function getObjectiveTooltipGroups(teamId: number, itemKey: string, itemLabel: string): ObjectiveTooltipGroup[] {
  const summary = getTeamObjectiveSummary(teamId)
  const descriptor = getObjectiveEventDescriptor(itemKey)
  const groups = new Map<number, ObjectiveTooltipGroup>()
  if (summary && descriptor && summary.objectiveEvents?.length) {
    for (const event of summary.objectiveEvents) {
      if (!matchesObjectiveEvent(event, descriptor, teamId)) {
        continue
      }
      const championId = getObjectiveEventChampionId(event)
      if (championId === null) {
        continue
      }
      const existing = groups.get(championId)
      if (existing) {
        existing.count += 1
        continue
      }
      groups.set(championId, {
        key: `${teamId}-${itemKey}-${championId}`,
        championId,
        count: 1,
        label: itemLabel
      })
    }
  }
  const eventGroups = Array.from(groups.values())
  return eventGroups.length ? eventGroups : getParticipantObjectiveTooltipGroups(teamId, itemKey, itemLabel)
}

function getParticipantObjectiveTooltipGroups(teamId: number, itemKey: string, itemLabel: string): ObjectiveTooltipGroup[] {
  const fieldKeys = getObjectiveParticipantStatKeys(itemKey)
  if (!fieldKeys.length) {
    return []
  }
  return allPlayers.value
    .filter(player => normalizeTeamId(player.teamId) === teamId)
    .map(player => {
      const count = readParticipantObjectiveStat(player, fieldKeys)
      const championId = normalizePositiveInteger(player.championId)
      if (count === null || count <= 0 || championId === null) {
        return null
      }
      return {
        key: `${teamId}-${itemKey}-${championId}`,
        championId,
        count,
        label: itemLabel
      }
    })
    .filter((group): group is ObjectiveTooltipGroup => group !== null)
}

function getObjectiveParticipantStatKeys(itemKey: string): string[] {
  const sourceKey = getStructureObjectiveSourceKey(itemKey)
  if (!sourceKey) {
    return []
  }
  const source = STRUCTURE_OBJECTIVE_SOURCES[sourceKey]
  return [...source.directStatKeys, ...source.lastFallbackStatKeys]
}

function getStructureObjectiveSourceKey(itemKey: string): StructureObjectiveSourceKey | null {
  if (itemKey === 'turret') {
    return 'turret'
  }
  if (itemKey === 'inhibitor') {
    return 'inhibitor'
  }
  if (itemKey === 'turret-plate') {
    return 'turretPlate'
  }
  return null
}

function getObjectiveEventDescriptor(itemKey: string): ObjectiveEventDescriptor | null {
  if (itemKey === 'turret') {
    return { kind: 'turret' }
  }
  if (itemKey === 'turret-plate') {
    return { kind: 'turretPlate' }
  }
  if (itemKey === 'inhibitor') {
    return { kind: 'inhibitor' }
  }
  if (itemKey === 'baron') {
    return { kind: 'baron' }
  }
  if (itemKey === 'herald') {
    return { kind: 'herald' }
  }
  if (itemKey === 'voidgrub') {
    return { kind: 'voidGrub' }
  }
  if (itemKey === 'elder') {
    return { kind: 'elderDragon' }
  }
  if (itemKey === 'dragon') {
    return { kind: 'dragon' }
  }
  if (itemKey.startsWith('dragon-')) {
    const dragonType = normalizeDragonTypeKey(itemKey.slice('dragon-'.length))
    return dragonType === 'unknown' ? null : { kind: 'dragon', dragonType }
  }
  return null
}

function matchesObjectiveEvent(
  event: TeamObjectiveEvent,
  descriptor: ObjectiveEventDescriptor,
  teamId: number
): boolean {
  if (event.kind !== descriptor.kind) {
    return false
  }
  const ownerTeamId = getObjectiveEventOwnerTeamId(event)
  if (ownerTeamId !== null && ownerTeamId !== teamId) {
    return false
  }
  if (descriptor.kind === 'dragon' && descriptor.dragonType) {
    return normalizeDragonTypeKey(event.subType) === descriptor.dragonType
  }
  return true
}

function getObjectiveEventOwnerTeamId(event: TeamObjectiveEvent): number | null {
  const participantId = normalizePositiveInteger(event.participantId)
  if (participantId !== null) {
    const participant = displayGameDetail.value?.participants?.find(candidate => candidate.participantId === participantId)
    const participantTeamId = normalizeTeamId(participant?.teamId)
    if (participantTeamId !== null) {
      return participantTeamId
    }
  }
  return normalizeTeamId(event.teamId)
}

function getObjectiveEventChampionId(event: TeamObjectiveEvent): number | null {
  const directChampionId = normalizePositiveInteger(event.championId)
  if (directChampionId !== null) {
    return directChampionId
  }
  const participantId = normalizePositiveInteger(event.participantId)
  if (participantId === null) {
    return null
  }
  const participant = displayGameDetail.value?.participants?.find(candidate => candidate.participantId === participantId)
  return normalizePositiveInteger(participant?.championId)
}

function normalizeDragonKillsByType(
  source: Partial<Record<DragonType, number>> | Record<string, unknown> | null | undefined
): Partial<Record<DragonType, number>> {
  const result: Partial<Record<DragonType, number>> = {}
  if (!source || typeof source !== 'object') {
    return result
  }
  for (const [rawType, rawCount] of Object.entries(source)) {
    const dragonType = normalizeDragonTypeKey(rawType)
    if (dragonType === 'unknown') {
      continue
    }
    const count = readObjectiveCount(rawCount)
    if (count > 0) {
      result[dragonType] = (result[dragonType] || 0) + count
    }
  }
  return result
}

function normalizeDragonTypeKey(value: unknown): DragonType | 'unknown' {
  if (typeof value !== 'string') {
    return 'unknown'
  }
  const normalized = normalizeDragonToken(value)
  if (!normalized) {
    return 'unknown'
  }
  for (const [dragonType, aliases] of Object.entries(DRAGON_TYPE_ALIASES) as Array<[Exclude<DragonType, 'unknown'>, string[]]>) {
    if (aliases.some(alias => normalizeDragonToken(alias) === normalized)) {
      return dragonType
    }
  }
  return 'unknown'
}

function normalizeDragonToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function getObjectiveIconKindForDragonType(type: DragonType): ObjectiveIconKind {
  switch (type) {
    case 'infernal':
      return 'infernal'
    case 'mountain':
      return 'mountain'
    case 'ocean':
      return 'ocean'
    case 'cloud':
      return 'cloud'
    case 'hextech':
      return 'hextech'
    case 'chemtech':
      return 'chemtech'
    case 'unknown':
      return 'unknownDragon'
  }
}

function readObjectiveCount(value: unknown): number {
  const numberValue = normalizeFiniteNumber(value)
  return numberValue !== null && Number.isInteger(numberValue) && numberValue > 0 ? numberValue : 0
}

function readNullableObjectiveCount(value: unknown): number | null {
  const numberValue = normalizeFiniteNumber(value)
  if (numberValue === null || !Number.isInteger(numberValue)) {
    return null
  }
  return Math.max(0, numberValue)
}

function getKillParticipation(player: MatchDetailParticipant, team: TeamSection): string {
  if (!team.totals.kills) {
    return '--'
  }
  const kills = getPlayerKills(player)
  const assists = getPlayerAssists(player)
  return `${Math.round(((kills + assists) / team.totals.kills) * 100)}%`
}

function getVisionScoreText(player: MatchDetailParticipant): string {
  const value = readStatNumber(player, 'visionScore')
  return value === null ? '--' : formatNumber(value)
}

function getTopMetricValue(
  players: MatchDetailParticipant[],
  read: (player: MatchDetailParticipant) => number | null
): number | null {
  const values = players
    .map(read)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)

  return values.length ? Math.max(...values) : null
}

function isTopMetricPlayer(
  player: MatchDetailParticipant,
  topValue: number | null,
  read: (player: MatchDetailParticipant) => number | null
): boolean {
  const value = read(player)
  return topValue !== null && value !== null && Number.isFinite(value) && value > 0 && value === topValue
}

function isTopKillPlayer(player: MatchDetailParticipant): boolean {
  return isTopMetricPlayer(player, topKillValue.value, target => readStatNumber(target, 'kills'))
}

function isTopDeathPlayer(player: MatchDetailParticipant): boolean {
  return isTopMetricPlayer(player, topDeathValue.value, target => readStatNumber(target, 'deaths'))
}

function isTopAssistPlayer(player: MatchDetailParticipant): boolean {
  return isTopMetricPlayer(player, topAssistValue.value, target => readStatNumber(target, 'assists'))
}

function isTopDamagePlayer(player: MatchDetailParticipant): boolean {
  return isTopMetricPlayer(player, topDamageValue.value, target => readStatNumber(target, 'totalDamageDealtToChampions'))
}

function isTopTakenPlayer(player: MatchDetailParticipant): boolean {
  return isTopMetricPlayer(player, topTakenValue.value, target => readStatNumber(target, 'totalDamageTaken'))
}

function isTopGoldPlayer(player: MatchDetailParticipant): boolean {
  return isTopMetricPlayer(player, topGoldValue.value, target => readStatNumber(target, 'goldEarned'))
}

function getDamageRatio(player: MatchDetailParticipant): number {
  return getMetricRatio(readStatNumber(player, 'totalDamageDealtToChampions'), maxChampionDamage.value)
}

function getTakenRatio(player: MatchDetailParticipant): number {
  return getMetricRatio(readStatNumber(player, 'totalDamageTaken'), maxDamageTaken.value)
}

function getMetricRatio(value: number | null, maxValue: number): number {
  if (!value || maxValue <= 0) {
    return 0
  }
  return Math.max(4, Math.min(100, Math.round((value / maxValue) * 100)))
}

function getMetricBarStyle(ratio: number): Record<string, string> {
  return { width: `${ratio}%` }
}

function maxPlayerMetric(read: (player: MatchDetailParticipant) => number | null): number {
  return allPlayers.value.reduce((maxValue, player) => Math.max(maxValue, read(player) ?? 0), 0)
}

function readStatNumber(player: MatchDetailParticipant, key: string): number | null {
  const statsRecord = player.stats as unknown as Record<string, unknown> | null | undefined
  const playerRecord = player as unknown as Record<string, unknown>
  const extraFields = statsRecord?.extraFields as Record<string, unknown> | null | undefined
  return normalizeFiniteNumber(statsRecord?.[key] ?? playerRecord?.[key] ?? extraFields?.[key])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizePositiveInteger(value: unknown): number | null {
  const numberValue = normalizeFiniteNumber(value)
  return numberValue !== null && Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null
}

function normalizeTeamId(value: unknown): number | null {
  const numberValue = normalizeFiniteNumber(value)
  return numberValue !== null && Number.isInteger(numberValue) ? numberValue : null
}

function normalizeFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function formatSignedNumber(value: number): string {
  if (value === 0) {
    return '0'
  }
  return `${value > 0 ? '+' : '-'}${formatNumber(Math.abs(value))}`
}

function toGameDetailFromMatchHistory(match: MatchHistory | null | undefined): GameDetail | null {
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
    participants: (match.participants || []).map(toGameParticipant),
    teamObjectives: match.teamObjectives,
    teamBans: match.teamBans
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
    timeline: toGameTimeline(participant)
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

function toGameTimeline(participant: MatchHistory['participants'][number]): GameTimeline {
  return {
    lane: participant.teamPosition || participant.lane || participant.individualPosition || '',
    role: participant.role || '',
    teamPosition: participant.teamPosition,
    rawLane: participant.lane,
    rawRole: participant.role
  }
}

function toGameStats(stats: MatchHistory['participants'][number]['stats'] | undefined): GameStats {
  const statsRecord = stats as unknown as Record<string, unknown> | null | undefined
  const extraFields = {
    ...(stats?.extraFields || {}),
    turretKills: statsRecord?.turretKills,
    inhibitorKills: statsRecord?.inhibitorKills,
    turretPlatesTaken: statsRecord?.turretPlatesTaken,
    turretTakedowns: statsRecord?.turretTakedowns,
    inhibitorTakedowns: statsRecord?.inhibitorTakedowns,
    playerAugment5: stats?.playerAugment5,
    playerAugment6: stats?.playerAugment6
  }

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
    turretKills: stats?.turretKills,
    inhibitorKills: stats?.inhibitorKills,
    turretPlatesTaken: stats?.turretPlatesTaken,
    turretTakedowns: stats?.turretTakedowns,
    inhibitorTakedowns: stats?.inhibitorTakedowns,
    playerAugment1: stats?.playerAugment1,
    playerAugment2: stats?.playerAugment2,
    playerAugment3: stats?.playerAugment3,
    playerAugment4: stats?.playerAugment4,
    challenges: stats?.challenges,
    extraFields
  }
}

function mergeGameDetailWithSummary(detail: GameDetail, summary: GameDetail | null): GameDetail {
  if (!summary?.participants?.length) {
    return detail
  }

  const summaryByParticipantId = new Map(summary.participants.map(participant => [participant.participantId, participant]))
  return {
    ...detail,
    teamObjectives: detail.teamObjectives?.length ? detail.teamObjectives : summary.teamObjectives,
    teamBans: detail.teamBans?.length ? detail.teamBans : summary.teamBans,
    participants: (detail.participants || []).map(participant =>
      mergeGameParticipantWithSummary(participant, summaryByParticipantId.get(participant.participantId))
    )
  }
}

function mergeGameParticipantWithSummary(participant: GameParticipant, summaryParticipant?: GameParticipant): GameParticipant {
  if (!summaryParticipant) {
    return participant
  }

  return {
    ...participant,
    teamPosition: participant.teamPosition || summaryParticipant.teamPosition,
    individualPosition: participant.individualPosition || summaryParticipant.individualPosition,
    selectedPosition: participant.selectedPosition || summaryParticipant.selectedPosition,
    stats: mergeGameStatsWithSummary(participant.stats, summaryParticipant.stats),
    timeline: {
      ...participant.timeline,
      lane: participant.timeline?.lane || summaryParticipant.timeline?.lane || '',
      role: participant.timeline?.role || summaryParticipant.timeline?.role || '',
      teamPosition: participant.timeline?.teamPosition || summaryParticipant.timeline?.teamPosition,
      positionCn: participant.timeline?.positionCn || summaryParticipant.timeline?.positionCn,
      rawLane: participant.timeline?.rawLane || summaryParticipant.timeline?.rawLane,
      rawRole: participant.timeline?.rawRole || summaryParticipant.timeline?.rawRole
    }
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

  for (const key of [
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
    'totalDamageDealtToChampions',
    'goldEarned',
    'totalDamageTaken',
    'visionScore',
    'totalHeal'
  ] as Array<keyof GameStats>) {
    if (normalizePositiveInteger(summaryStats[key]) && !normalizePositiveInteger(merged[key])) {
      (merged as unknown as Record<string, unknown>)[key] = summaryStats[key]
    }
  }

  return merged
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
</script>

<template>
  <section class="inline-match-detail" aria-label="match detail">
    <div v-if="detailNotice" class="detail-load-state" role="status">
      {{ detailNotice }}
    </div>

    <div class="inline-detail-toolbar">
      <nav class="inline-detail-tabs" aria-label="match detail tabs">
        <button
          v-for="tab in detailTabs"
          :key="tab.key"
          class="inline-detail-tab"
          :class="{ active: activeTabValue === tab.key }"
          type="button"
          @click="selectTab(tab.key)"
        >
          {{ tab.label }}
        </button>
      </nav>

      <div class="postgame-ai-actions" aria-label="赛后 AI 分析入口">
        <button
          class="postgame-ai-action postgame-ai-action-review"
          type="button"
          @click="openPostgameAiModal('review')"
        >
          赛后复盘
        </button>
        <button
          class="postgame-ai-action postgame-ai-action-praise"
          type="button"
          @click="openPostgameAiModal('praise')"
        >
          夸夸机
        </button>
      </div>
    </div>

    <section class="inline-detail-body">
      <div v-if="activeTabValue === 'overview'" class="overview-tab">
        <article
          v-for="team in teamSections"
          :key="team.key"
          class="team-detail-table"
          :class="[team.key, { win: team.won, loss: !team.won, 'with-vision-score': showVisionScoreColumn }]"
        >
          <header class="team-detail-header">
            <div class="team-header-main">
              <strong>{{ team.result }} · {{ team.label }}</strong>
              <div class="team-header-summary">
                <span
                  class="team-kda-summary"
                  aria-label="team score"
                >
                  {{ getTeamKda(team.totals) }}
                </span>
                <div
                  v-if="showDraftAndObjectiveSummary && getTeamObjectiveItems(team.teamId).length"
                  class="team-header-resources"
                >
                  <div
                    class="team-objective-icons"
                    aria-label="objectives"
                  >
                    <span
                      v-for="item in getTeamObjectiveItems(team.teamId)"
                      :key="item.key"
                      class="objective-pill compact-objective-pill"
                      :class="`objective-${item.kind}`"
                      :aria-label="item.title"
                      tabindex="0"
                    >
                      <template
                        v-for="icon in getObjectiveItemIcons(item)"
                        :key="icon.key"
                      >
                        <img
                          v-if="shouldUseObjectiveIconImage(icon)"
                          class="objective-icon objective-icon-img"
                          :src="icon.iconUrl"
                          alt=""
                          @error="handleObjectiveIconLoadFailed($event, icon.key)"
                        />
                        <span
                          v-else
                          class="objective-icon objective-fallback-icon"
                          :class="`objective-fallback-${icon.kind}`"
                          aria-hidden="true"
                        >
                          <svg
                            viewBox="0 0 16 16"
                            aria-hidden="true"
                            focusable="false"
                          >
                            <path d="M8 1.3c2.6 1.5 4.2 3.7 4.2 6.3 0 3.1-1.8 5.6-4.2 7.1-2.4-1.5-4.2-4-4.2-7.1 0-2.6 1.6-4.8 4.2-6.3Zm0 3.1C6.5 5.5 5.7 6.6 5.7 8c0 1.5.9 2.7 2.3 3.6 1.4-.9 2.3-2.1 2.3-3.6 0-1.4-.8-2.5-2.3-3.6Z" />
                          </svg>
                        </span>
                      </template>
                      <strong
                        v-if="item.showCount"
                        class="objective-count"
                      >
                        {{ getObjectiveCountText(item) }}
                      </strong>
                      <span
                        v-if="item.tooltipGroups.length || item.title"
                        class="objective-tooltip"
                        role="tooltip"
                      >
                        <span class="objective-tooltip-title">{{ item.title }}</span>
                        <span
                          v-if="item.tooltipGroups.length"
                          class="objective-tooltip-actors"
                        >
                          <span
                            v-for="group in item.tooltipGroups"
                            :key="group.key"
                            class="objective-tooltip-actor"
                            :aria-label="`${group.label} x${group.count}`"
                          >
                            <img
                              v-if="getChampionIconUrl(group.championId)"
                              class="objective-tooltip-avatar"
                              :src="getChampionIconUrl(group.championId)"
                              alt=""
                              @error="markAssetLoadFailed"
                            />
                            <span class="objective-tooltip-count">x{{ group.count }}</span>
                          </span>
                        </span>
                      </span>
                    </span>
                  </div>
                </div>
                <div
                  v-if="showDraftAndObjectiveSummary && getTeamBans(team.teamId).length"
                  class="team-draft-row"
                >
                  <span class="draft-objective-label">禁用</span>
                  <div
                    v-if="getTeamBans(team.teamId).length"
                    class="team-ban-icons"
                    aria-label="banned champions"
                  >
                    <span
                      v-for="championId in getTeamBans(team.teamId)"
                      :key="`${team.teamId}-ban-${championId}`"
                      class="ban-champion-icon"
                    >
                      <img
                        v-if="getChampionIconUrl(championId)"
                        :src="getChampionIconUrl(championId)"
                        alt=""
                        @error="markAssetLoadFailed"
                      />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div class="team-row-labels" aria-hidden="true">
            <span>Player</span>
            <span>KDA</span>
            <span>{{ t('common.damage') }}</span>
            <span>{{ t('matchDetail.damageTaken') }}</span>
            <span>{{ t('common.cs') }}</span>
            <span>{{ t('common.gold') }}</span>
            <span v-if="showVisionScoreColumn" class="vision-score-head">{{ t('matchDetail.visionScore') }}</span>
            <span class="items-head">{{ t('matchDetail.itemsTab') }}</span>
          </div>

          <div
            v-for="player in team.players"
            :key="player.participantId"
            class="participant-row"
            :class="{ me: player.isCurrentPlayer, clickable: canNavigatePlayer(player) }"
            @click="handlePlayerClick(player)"
          >
            <div class="player-cell">
              <span class="champion-wrap">
                <img
                  v-if="getChampionIconUrl(player.championId)"
                  :src="getChampionIconUrl(player.championId)"
                  alt=""
                  @error="markAssetLoadFailed"
                />
                <span v-if="getChampionLevel(player)" class="champion-level">{{ getChampionLevel(player) }}</span>
              </span>
              <span class="spell-stack">
                <span
                  v-for="slot in getPlayerSpellSlots(player)"
                  :key="slot.key"
                  class="mini-slot spell-slot"
                  :class="{ empty: slot.empty }"
                >
                  <AssetHoverTooltip
                    v-if="slot.url && !slot.empty && getSummonerSpellTooltipDetails(slot.id)"
                    :details="getSummonerSpellTooltipDetails(slot.id)!"
                  >
                    <img v-if="slot.url" :src="slot.url" alt="" @error="markAssetLoadFailed" />
                  </AssetHoverTooltip>
                  <img v-else-if="slot.url" :src="slot.url" alt="" @error="markAssetLoadFailed" />
                </span>
              </span>
              <span
                class="trait-pair"
                v-if="!hasValidAugment(player)"
              >
                <span
                  v-for="slot in getPlayerTraitSlots(player).slice(0, 2)"
                  :key="slot.key"
                  class="mini-slot trait-slot"
                  :class="[`trait-${slot.kind}`, slot.rarityClass, { empty: slot.empty }]"
                  :aria-label="slot.label"
                >
                  <AssetHoverTooltip
                    v-if="slot.url && !slot.empty && getTraitTooltipDetails(slot)"
                    :details="getTraitTooltipDetails(slot)!"
                  >
                    <img v-if="slot.url" :src="slot.url" alt="" @error="markAssetLoadFailed" />
                  </AssetHoverTooltip>
                  <img v-else-if="slot.url" :src="slot.url" alt="" @error="markAssetLoadFailed" />
                </span>
              </span>
              <span
                class="player-identity-main"
                :class="{ 'with-augments': getPlayerOverviewAugmentSlots(player).length }"
              >
                <span class="player-copy player-name-wrap">
                  <strong>{{ getPlayerName(player) }}</strong>
                  <span v-if="getDisplayPosition(player)">{{ getDisplayPosition(player) }}</span>
                </span>
                <span
                  class="overview-augment-strip"
                  v-if="getPlayerOverviewAugmentSlots(player).length"
                  aria-label="augments"
                >
                  <span
                    v-for="slot in getPlayerOverviewAugmentSlots(player)"
                    :key="`overview-${slot.key}`"
                    class="overview-augment-slot"
                    :class="slot.rarityClass"
                    :aria-label="slot.label"
                  >
                    <AssetHoverTooltip
                      v-if="slot.url && !slot.empty && getTraitTooltipDetails(slot)"
                      :details="getTraitTooltipDetails(slot)!"
                    >
                      <img v-if="slot.url" :src="slot.url" alt="" @error="markAssetLoadFailed" />
                    </AssetHoverTooltip>
                    <img v-else-if="slot.url" :src="slot.url" alt="" @error="markAssetLoadFailed" />
                  </span>
                </span>
              </span>
            </div>

            <div class="kda-cell">
              <span class="player-kda-score">
                <span class="kda-kills" :class="{ 'top-kills': isTopKillPlayer(player) }">
                  {{ getPlayerKills(player) }}
                </span>
                <span class="kda-separator">/</span>
                <span class="kda-deaths" :class="{ 'top-deaths': isTopDeathPlayer(player) }">
                  {{ getPlayerDeaths(player) }}
                </span>
                <span class="kda-separator">/</span>
                <span class="kda-assists" :class="{ 'top-assists': isTopAssistPlayer(player) }">
                  {{ getPlayerAssists(player) }}
                </span>
              </span>
              <span>{{ t('matchDetail.killParticipation') }} {{ getKillParticipation(player, team) }}</span>
            </div>

            <div class="metric-cell">
              <span class="metric-value-with-icon">
                {{ formatNumber(readStatNumber(player, 'totalDamageDealtToChampions')) }}
                <span
                  class="top-metric-icon top-damage-icon"
                  v-if="isTopDamagePlayer(player)"
                  title="全场最高伤害"
                  aria-label="全场最高伤害"
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                    <path d="M8.8 1.2c.4 2.2-.7 3.2-1.8 4.3-.9.9-1.8 1.9-1.8 3.4 0 1.6 1.1 2.8 2.8 2.8 1.9 0 3.1-1.4 3.1-3.1 0-1-.4-2-1.1-2.9 1.9 1.1 3.1 2.9 3.1 5 0 2.6-2.1 4.4-5.1 4.4s-5.1-1.8-5.1-4.6c0-2 .9-3.4 2-4.7 1.4-1.6 3-2.8 3.9-4.6Z" />
                  </svg>
                </span>
              </span>
              <span class="metric-track"><span class="metric-bar damage-bar" :style="getMetricBarStyle(getDamageRatio(player))"></span></span>
            </div>

            <div class="metric-cell secondary">
              <span class="metric-value-with-icon">
                {{ formatNumber(readStatNumber(player, 'totalDamageTaken')) }}
                <span
                  class="top-metric-icon top-taken-icon"
                  v-if="isTopTakenPlayer(player)"
                  title="全场最高承伤"
                  aria-label="全场最高承伤"
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                    <path d="M8 1.2 13 3v4.1c0 3.3-2 6.2-5 7.7-3-1.5-5-4.4-5-7.7V3l5-1.8Zm0 2.1L4.8 4.5v2.7c0 2.1 1.2 4.1 3.2 5.3 2-1.2 3.2-3.2 3.2-5.3V4.5L8 3.3Z" />
                  </svg>
                </span>
              </span>
              <span class="metric-track"><span class="metric-bar taken-bar" :style="getMetricBarStyle(getTakenRatio(player))"></span></span>
            </div>

            <span class="number-cell">{{ formatNumber(getCreepScore(player.stats)) }}</span>
            <span class="number-cell gold-cell">
              <span class="metric-value-with-icon">
                {{ formatNumber(player.stats?.goldEarned) }}
                <span
                  class="top-metric-icon top-gold-icon"
                  v-if="isTopGoldPlayer(player)"
                  title="全场最高金币"
                  aria-label="全场最高金币"
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                    <circle cx="8" cy="8" r="6.4" />
                    <path d="M5.1 6.1h5.8M5.1 9.9h5.8" fill="none" stroke="rgba(42, 30, 0, 0.45)" stroke-width="1.2" stroke-linecap="round" />
                  </svg>
                </span>
              </span>
            </span>

            <span v-if="showVisionScoreColumn" class="number-cell vision-score-cell">{{ getVisionScoreText(player) }}</span>

            <div class="item-row compact" aria-label="items">
              <span
                v-for="slot in getPlayerItemSlots(player)"
                :key="`${player.participantId}-overview-item-${slot.index}`"
                class="item-slot"
                :class="{ empty: slot.empty }"
                :aria-label="getItemSlotLabel(slot)"
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
          </div>
        </article>
      </div>

      <div v-else-if="activeTabValue === 'rp'" class="rp-tab">
        <div v-if="timelineLoadStatus === 'loading' || timelineLoadStatus === 'idle'" class="timeline-empty">
          <strong>{{ t('matchDetail.timelineLoading') }}</strong>
        </div>
        <div v-else-if="hasRpIndexData" class="rp-index-shell">
          <section class="rp-chart-panel">
            <header class="rp-chart-heading">
              <div class="rp-chart-title-row">
                <div class="rp-chart-title">
                  <strong>{{ t('matchDetail.rpTitle') }}</strong>
                  <button
                    class="rp-info-button"
                    type="button"
                    :title="t('matchDetail.rpInputSummary')"
                    :aria-label="t('matchDetail.rpInputSummary')"
                  >
                    i
                  </button>
                </div>
                <div v-if="rpTrendBadges.length" class="rp-trend-badges" aria-label="RP trend labels">
                  <span
                    v-for="badge in rpTrendBadges"
                    :key="badge.key"
                    class="rp-trend-badge"
                  >
                    {{ badge.label }}
                  </span>
                </div>
              </div>
            </header>

            <div class="rp-score-groups">
              <section
                v-for="group in rpScoreGroups"
                :key="group.key"
                class="rp-score-group"
              >
                <span class="rp-score-group-label">{{ group.label }}</span>
                <div class="rp-score-card-row">
                  <button
                    v-for="card in group.players"
                    :key="`rp-card-${card.participantId}`"
                    type="button"
                    class="rp-score-card"
                    :class="{ selected: card.selected }"
                    :style="getRpScoreCardStyle(card)"
                    :aria-pressed="card.selected"
                    @click="toggleRpParticipant(card.participantId)"
                  >
                    <img
                      v-if="card.championId !== null"
                      class="rp-score-card-avatar"
                      :src="getChampionIconUrl(card.championId)"
                      :alt="card.playerLabel"
                      @error="markAssetLoadFailed"
                    >
                    <span class="rp-score-card-value">{{ formatRpScore(card.finalScore) }}</span>
                    <span v-if="card.selected" class="rp-score-card-check" aria-hidden="true">✓</span>
                  </button>
                </div>
              </section>
            </div>

            <div v-if="rpSelectedSeries.length" class="rp-chart-stage">
              <svg
                class="rp-chart-svg"
                :viewBox="`0 0 ${RP_CHART_WIDTH} ${RP_CHART_HEIGHT}`"
                role="img"
                :aria-label="t('matchDetail.rpTitle')"
              >
                <g class="rp-chart-grid">
                  <line
                    v-for="line in rpChartGridLines"
                    :key="line.key"
                    :class="{ zero: line.zero }"
                    :x1="RP_CHART_PADDING.left"
                    :x2="RP_CHART_WIDTH - RP_CHART_PADDING.right"
                    :y1="line.y"
                    :y2="line.y"
                  />
                  <text
                    v-for="line in rpChartGridLines"
                    :key="`${line.key}-label`"
                    :x="RP_CHART_PADDING.left - 10"
                    :y="line.y + 4"
                    text-anchor="end"
                  >
                    {{ line.label }}
                  </text>
                </g>
                <g class="rp-chart-time-axis">
                  <line
                    v-for="tick in rpChartTimeTicks"
                    :key="tick.key"
                    :x1="tick.x"
                    :x2="tick.x"
                    :y1="RP_CHART_PADDING.top"
                    :y2="RP_CHART_HEIGHT - RP_CHART_PADDING.bottom"
                  />
                  <text
                    v-for="tick in rpChartTimeTicks"
                    :key="`${tick.key}-label`"
                    :x="tick.x"
                    :y="RP_CHART_HEIGHT - 10"
                    text-anchor="middle"
                  >
                    {{ tick.label }}
                  </text>
                </g>
                <line
                  v-if="hoveredRpPoint"
                  class="rp-chart-hover-line"
                  :x1="getRpHoverX()"
                  :x2="getRpHoverX()"
                  :y1="RP_CHART_PADDING.top"
                  :y2="RP_CHART_HEIGHT - RP_CHART_PADDING.bottom"
                />
                <path
                  v-for="series in rpSelectedSeries"
                  :key="series.key"
                  class="rp-score-line"
                  :style="getRpSeriesStyle(series)"
                  :d="createRpLinePath(series.points)"
                />
                <circle
                  v-for="row in rpTooltipRows"
                  :key="`rp-hover-${row.key}`"
                  class="rp-chart-hover-point"
                  :style="{ '--rp-player-color': row.color }"
                  :cx="getRpHoverX()"
                  :cy="row.y"
                  r="4.2"
                />
                <g
                  v-for="series in rpSelectedSeries"
                  :key="`${series.key}-hits`"
                >
                  <circle
                    v-for="point in series.points"
                    :key="getRpPointKey(series, point)"
                    class="rp-chart-hit-area"
                    :cx="getRpChartX(point.timestamp)"
                    :cy="getRpChartY(point.score)"
                    r="9"
                    fill="transparent"
                    opacity="0"
                    @pointerenter="showRpTooltip($event, series, point)"
                    @pointermove="moveRpTooltip($event, series, point)"
                    @pointerleave="hideRpTooltip"
                  />
                </g>
              </svg>

              <div
                v-if="hoveredRpPoint"
                class="rp-chart-tooltip"
                :style="getRpTooltipStyle()"
              >
                <strong>{{ formatTimelineTime(hoveredRpPoint.point.timestamp) }}</strong>
                <span
                  v-for="row in rpTooltipRows"
                  :key="`rp-tooltip-${row.key}`"
                  class="rp-tooltip-row"
                >
                  <span class="rp-tooltip-dot" :style="{ '--rp-player-color': row.color }" aria-hidden="true"></span>
                  <span>{{ formatRpScore(row.score) }}</span>
                </span>
              </div>
            </div>

            <div v-else class="rp-empty-selection">
              {{ t('matchDetail.rpEmptySelection') }}
            </div>
          </section>
        </div>
        <div v-else class="timeline-empty">
          <strong>{{ t('matchDetail.rpUnavailable') }}</strong>
          <small>{{ t('matchDetail.rpDataRequirement') }}</small>
        </div>
      </div>

      <div v-else-if="activeTabValue === 'runes'" class="runes-tab">
        <section
          v-for="(team, teamIndex) in runeTeamSections"
          :key="`rune-team-${team.key}`"
          :data-team-index="teamIndex"
          class="rune-team-card"
          :class="team.key"
        >
          <header class="rune-team-header">
            <strong>{{ team.label }}</strong>
          </header>

          <div class="rune-team-players">
            <div
              v-for="(player, playerIndex) in team.players"
              :key="`runes-${player.participantId}`"
              :data-player-index="playerIndex"
              class="rune-player-row"
              :class="{
                me: player.isCurrentPlayer,
                expanded: isRuneParticipantExpanded(player),
                clickable: true
              }"
              data-card-click-ignore
              role="button"
              tabindex="0"
              @click="toggleRuneParticipant(player)"
              @keydown.enter.prevent="toggleRuneParticipant(player)"
              @keydown.space.prevent="toggleRuneParticipant(player)"
            >
              <div class="player-cell">
                <span class="champion-wrap">
                  <img
                    v-if="getChampionIconUrl(player.championId)"
                    :src="getChampionIconUrl(player.championId)"
                    alt=""
                    @error="markAssetLoadFailed"
                  />
                </span>
                <span class="spell-stack">
                  <span
                    v-for="slot in getPlayerSpellSlots(player)"
                    :key="`runes-${slot.key}`"
                    class="mini-slot spell-slot"
                    :class="{ empty: slot.empty }"
                  >
                    <AssetHoverTooltip
                      v-if="slot.url && !slot.empty && getSummonerSpellTooltipDetails(slot.id)"
                      :details="getSummonerSpellTooltipDetails(slot.id)!"
                    >
                      <img v-if="slot.url" :src="slot.url" alt="" @error="markAssetLoadFailed" />
                    </AssetHoverTooltip>
                    <img v-else-if="slot.url" :src="slot.url" alt="" @error="markAssetLoadFailed" />
                  </span>
                </span>
                <span class="player-copy">
                  <strong>{{ getPlayerName(player) }}</strong>
                  <span v-if="getDisplayPosition(player)">{{ getDisplayPosition(player) }}</span>
                </span>
              </div>

              <div class="trait-list">
                <span
                  v-for="slot in getPlayerTraitSlots(player)"
                  :key="`runes-${slot.key}`"
                  class="trait-detail-slot"
                  :class="[`trait-${slot.kind}`, slot.rarityClass, { empty: slot.empty }]"
                  :aria-label="slot.label"
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

              <div
                v-if="isRuneParticipantExpanded(player)"
                class="rune-detail-panel"
                @click.stop
              >
                <div
                  v-if="!hasValidAugment(player)"
                  class="rune-columns"
                >
                  <section
                    v-for="column in getPlayerRuneColumns(player)"
                    :key="column.key"
                    class="rune-column"
                  >
                    <header class="rune-column-header">
                      <span
                        v-if="column.styleSlot"
                        class="rune-style-icon trait-detail-slot"
                        :class="[`trait-${column.styleSlot.kind}`, column.styleSlot.rarityClass, { empty: column.styleSlot.empty }]"
                        :aria-label="column.styleSlot.label"
                      >
                        <AssetHoverTooltip
                          v-if="column.styleSlot.url && !column.styleSlot.empty && getTraitTooltipDetails(column.styleSlot)"
                          :details="getTraitTooltipDetails(column.styleSlot)!"
                        >
                          <img
                            v-if="column.styleSlot.url"
                            :src="column.styleSlot.url"
                            alt=""
                            @error="markAssetLoadFailed"
                          >
                        </AssetHoverTooltip>
                        <img
                          v-else-if="column.styleSlot.url"
                          :src="column.styleSlot.url"
                          alt=""
                          @error="markAssetLoadFailed"
                        >
                      </span>
                      <strong>{{ column.title }}</strong>
                    </header>

                    <div class="rune-column-list">
                      <article
                        v-for="slot in column.slots"
                        :key="`detail-${column.key}-${slot.key}`"
                        class="rune-detail-item"
                      >
                        <AssetHoverTooltip
                          v-if="slot.url && !slot.empty && getTraitTooltipDetails(slot)"
                          :details="getTraitTooltipDetails(slot)!"
                        >
                          <div class="rune-detail-content">
                            <span
                              class="rune-detail-icon-wrap trait-detail-slot"
                              :class="[`trait-${slot.kind}`, slot.rarityClass]"
                              :aria-label="slot.label"
                            >
                              <img
                                v-if="slot.url"
                                class="rune-detail-icon"
                                :src="slot.url"
                                alt=""
                                @error="markAssetLoadFailed"
                              >
                            </span>
                            <div class="rune-detail-text">
                              <strong class="rune-detail-name">{{ getRuneDisplayName(slot) }}</strong>
                              <div
                                v-if="getRuneStatDisplayRows(player, slot).length"
                                class="rune-stat-list"
                              >
                                <span
                                  v-for="row in getRuneStatDisplayRows(player, slot)"
                                  :key="row.key"
                                  class="rune-stat-line"
                                >
                                  {{ row.text }}
                                </span>
                              </div>
                            </div>
                          </div>
                        </AssetHoverTooltip>
                        <div
                          v-else
                          class="rune-detail-content"
                        >
                          <span
                            class="rune-detail-icon-wrap trait-detail-slot"
                            :class="[`trait-${slot.kind}`, slot.rarityClass]"
                            :aria-label="slot.label"
                          >
                            <img
                              v-if="slot.url"
                              class="rune-detail-icon"
                              :src="slot.url"
                              alt=""
                              @error="markAssetLoadFailed"
                            >
                          </span>
                          <div class="rune-detail-text">
                            <strong class="rune-detail-name">{{ getRuneDisplayName(slot) }}</strong>
                            <div
                              v-if="getRuneStatDisplayRows(player, slot).length"
                              class="rune-stat-list"
                            >
                              <span
                                v-for="row in getRuneStatDisplayRows(player, slot)"
                                :key="row.key"
                                class="rune-stat-line"
                              >
                                {{ row.text }}
                              </span>
                            </div>
                          </div>
                        </div>
                      </article>
                    </div>
                  </section>
                </div>

                <div
                  v-else
                  class="rune-augment-list"
                >
                  <article
                    v-for="slot in getRuneDetailSlots(player)"
                    :key="`detail-${slot.key}`"
                    class="rune-detail-item"
                  >
                    <AssetHoverTooltip
                      v-if="slot.url && !slot.empty && getTraitTooltipDetails(slot)"
                      :details="getTraitTooltipDetails(slot)!"
                    >
                      <div class="rune-detail-content">
                        <span
                          class="rune-detail-icon-wrap trait-detail-slot"
                          :class="[`trait-${slot.kind}`, slot.rarityClass]"
                          :aria-label="slot.label"
                        >
                          <img
                            v-if="slot.url"
                            class="rune-detail-icon"
                            :src="slot.url"
                            alt=""
                            @error="markAssetLoadFailed"
                          >
                        </span>
                        <div class="rune-detail-text">
                          <strong class="rune-detail-name">{{ getRuneDisplayName(slot) }}</strong>
                        </div>
                      </div>
                    </AssetHoverTooltip>
                    <div
                      v-else
                      class="rune-detail-content"
                    >
                      <span
                        class="rune-detail-icon-wrap trait-detail-slot"
                        :class="[`trait-${slot.kind}`, slot.rarityClass]"
                        :aria-label="slot.label"
                      >
                        <img
                          v-if="slot.url"
                          class="rune-detail-icon"
                          :src="slot.url"
                          alt=""
                          @error="markAssetLoadFailed"
                        >
                      </span>
                      <div class="rune-detail-text">
                        <strong class="rune-detail-name">{{ getRuneDisplayName(slot) }}</strong>
                      </div>
                    </div>
                  </article>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div v-else-if="activeTabValue === 'chart'" class="chart-tab">
        <div v-if="!isChartRankedMode" class="timeline-empty">
          <strong>{{ t('matchDetail.timelineRankedOnly') }}</strong>
        </div>
        <div v-else-if="timelineLoadStatus === 'loading' || timelineLoadStatus === 'idle'" class="timeline-empty">
          <strong>{{ t('matchDetail.timelineLoading') }}</strong>
        </div>
        <div v-else-if="hasTimelineData" class="timeline-chart-shell">
          <div class="timeline-chart-panel">
            <header class="timeline-chart-heading">
              <div class="timeline-chart-title">
                <span class="timeline-chart-title-chevron" aria-hidden="true"></span>
                <strong>{{ selectedGoldDiffMetricLabel }}</strong>
              </div>
              <div class="timeline-chart-toolbar" role="tablist" aria-label="gold diff filters">
                <button
                  v-for="option in goldDiffMetricOptions"
                  :key="option.key"
                  type="button"
                  class="timeline-chart-filter"
                  :class="{ active: selectedGoldDiffMetric === option.key }"
                  @click="selectGoldDiffMetric(option.key)"
                >
                  {{ t(option.labelKey) }}
                </button>
              </div>
            </header>

            <div v-if="selectedGoldDiffSeries.points.length" class="timeline-chart-stage">
              <svg
                class="timeline-chart-svg"
                :viewBox="`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`"
                role="img"
                :aria-label="selectedGoldDiffMetricLabel"
              >
                <defs>
                  <linearGradient id="timeline-positive-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="#4aa8ff" stop-opacity="0.16" />
                    <stop offset="100%" stop-color="#4aa8ff" stop-opacity="0.02" />
                  </linearGradient>
                  <linearGradient id="timeline-negative-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="#f05f72" stop-opacity="0.02" />
                    <stop offset="100%" stop-color="#f05f72" stop-opacity="0.16" />
                  </linearGradient>
                </defs>
                <rect
                  class="timeline-chart-fill positive"
                  :x="CHART_PADDING.left"
                  :y="CHART_PADDING.top"
                  :width="CHART_PLOT_WIDTH"
                  :height="positiveDiffFillHeight"
                  fill="url(#timeline-positive-fill)"
                />
                <rect
                  class="timeline-chart-fill negative"
                  :x="CHART_PADDING.left"
                  :y="zeroAxisY"
                  :width="CHART_PLOT_WIDTH"
                  :height="negativeDiffFillHeight"
                  fill="url(#timeline-negative-fill)"
                />
                <g
                  v-if="selectedGoldDiffMetric === 'teamAverage' && teamAverageWatermarkGroups.length"
                  class="team-average-watermarks"
                  pointer-events="none"
                >
                  <g
                    v-for="group in teamAverageWatermarkGroups"
                    :key="group.key"
                    class="team-watermark"
                    :class="[
                      `watermark-${group.tone}`,
                      group.tone === 'blue'
                        ? 'team-average-watermark-row--blue'
                        : 'team-average-watermark-row--red'
                    ]"
                    pointer-events="none"
                  >
                    <g
                      v-for="watermark in group.watermarks"
                      :key="watermark.key"
                      class="team-champion-watermark"
                      :class="`watermark-${watermark.tone}`"
                      :transform="getLaneMatchupWatermarkTransform(watermark)"
                      pointer-events="none"
                    >
                      <rect
                        class="team-champion-watermark-frame"
                        x="0"
                        y="0"
                        :width="watermark.size"
                        :height="watermark.size"
                        :rx="WATERMARK_CORNER_RADIUS"
                        :ry="WATERMARK_CORNER_RADIUS"
                      />
                      <image
                        class="team-champion-watermark-image"
                        :href="watermark.iconUrl"
                        :x="-WATERMARK_IMAGE_CROP_OUTSET"
                        :y="-WATERMARK_IMAGE_CROP_OUTSET"
                        :width="watermark.size + WATERMARK_IMAGE_CROP_OUTSET * 2"
                        :height="watermark.size + WATERMARK_IMAGE_CROP_OUTSET * 2"
                        preserveAspectRatio="xMidYMid slice"
                        pointer-events="none"
                      />
                    </g>
                  </g>
                </g>
                <g
                  v-if="selectedGoldDiffMetric !== 'teamAverage' && laneMatchupWatermarks.length"
                  class="lane-matchup-watermarks lane-matchup-watermark--vertical"
                  pointer-events="none"
                >
                  <g
                    v-for="watermark in laneMatchupWatermarks"
                    :key="watermark.key"
                    class="lane-matchup-watermark"
                    :class="[
                      `watermark-${watermark.tone}`,
                      watermark.tone === 'blue'
                        ? 'lane-matchup-watermark-avatar--blue'
                        : 'lane-matchup-watermark-avatar--red'
                    ]"
                    :transform="getLaneMatchupWatermarkTransform(watermark)"
                    pointer-events="none"
                  >
                    <rect
                      class="lane-matchup-watermark-frame"
                      x="0"
                      y="0"
                      :width="watermark.size"
                      :height="watermark.size"
                      :rx="WATERMARK_CORNER_RADIUS"
                      :ry="WATERMARK_CORNER_RADIUS"
                    />
                    <image
                      class="lane-matchup-watermark-image"
                      :href="getChampionIconUrl(watermark.championId)"
                      :x="-WATERMARK_IMAGE_CROP_OUTSET"
                      :y="-WATERMARK_IMAGE_CROP_OUTSET"
                      :width="watermark.size + WATERMARK_IMAGE_CROP_OUTSET * 2"
                      :height="watermark.size + WATERMARK_IMAGE_CROP_OUTSET * 2"
                      preserveAspectRatio="xMidYMid slice"
                      pointer-events="none"
                    />
                  </g>
                </g>
                <g class="timeline-chart-grid">
                  <line
                    v-for="line in chartGridLines"
                    :key="line.key"
                    :class="{ zero: line.zero }"
                    :x1="CHART_PADDING.left"
                    :x2="CHART_WIDTH - CHART_PADDING.right"
                    :y1="line.y"
                    :y2="line.y"
                  />
                  <text
                    v-for="line in chartGridLines"
                    :key="`${line.key}-label`"
                    :x="CHART_PADDING.left - 10"
                    :y="line.y + 4"
                    text-anchor="end"
                  >
                    {{ line.label }}
                  </text>
                </g>
                <line
                  class="timeline-zero-axis"
                  :x1="CHART_PADDING.left"
                  :x2="CHART_WIDTH - CHART_PADDING.right"
                  :y1="zeroAxisY"
                  :y2="zeroAxisY"
                />
                <g class="timeline-chart-time-axis">
                  <line
                    v-for="tick in chartTimeTicks"
                    :key="tick.key"
                    :x1="tick.x"
                    :x2="tick.x"
                    :y1="CHART_PADDING.top"
                    :y2="CHART_HEIGHT - CHART_PADDING.bottom"
                  />
                  <text
                    v-for="tick in chartTimeTicks"
                    :key="`${tick.key}-label`"
                    :x="tick.x"
                    :y="CHART_HEIGHT - 10"
                    text-anchor="middle"
                  >
                    {{ tick.label }}
                  </text>
                </g>
                <path
                  v-for="segment in selectedGoldDiffSegments"
                  :key="segment.key"
                  class="timeline-gold-line"
                  :class="`segment-${segment.tone}`"
                  :d="segment.d"
                />
                <line
                  v-if="activeChartCrosshairTimestamp !== null"
                  class="timeline-chart-crosshair"
                  :x1="getChartX(activeChartCrosshairTimestamp)"
                  :x2="getChartX(activeChartCrosshairTimestamp)"
                  :y1="CHART_PADDING.top"
                  :y2="CHART_HEIGHT - CHART_PADDING.bottom"
                />
                <circle
                  v-for="(point, index) in selectedGoldDiffSeries.points"
                  :key="getChartPointKey(point, index)"
                  class="timeline-chart-hit-area"
                  :cx="getChartX(point.timestamp)"
                  :cy="getChartY(point.diff)"
                  r="9"
                  fill="transparent"
                  opacity="0"
                  @pointerenter="showGoldDiffTooltip($event, point)"
                  @pointermove="moveGoldDiffTooltip($event, point)"
                  @pointerleave="hideGoldDiffTooltip"
                />
              </svg>

              <div class="timeline-chart-axis-layer timeline-axis-panel">
                <div
                  v-for="track in timelineEventTracks"
                  :key="track.key"
                  class="timeline-event-track"
                  :class="`track-${track.key}`"
                >
                  <div class="timeline-axis-track" aria-hidden="true"></div>
                  <button
                    v-for="cluster in track.clusters"
                    :key="cluster.key"
                    type="button"
                    class="timeline-axis-marker"
                    :class="[
                      track.key === 'blue' ? 'timeline-axis-marker--blue' : 'timeline-axis-marker--red',
                      cluster.count > 1 ? 'timeline-axis-marker--cluster' : 'timeline-axis-marker--single',
                      getTimelineClusterRelevanceClass(cluster)
                    ]"
                    :style="getTimelineClusterStyle(cluster)"
                    :aria-label="`${formatTimelineTime(cluster.timestamp)} ${getTimelineClusterLabel(cluster)}`"
                    @pointerenter="showTimelineEventTooltip($event, cluster)"
                    @pointermove="moveTimelineEventTooltip($event)"
                    @pointerleave="hideTimelineEventTooltip"
                  ></button>
                </div>
              </div>

              <div
                v-if="chartHoverSource === 'chart' && hoveredGoldDiffPoint"
                class="timeline-chart-tooltip timeline-chart-tooltip--bubble"
                :style="getChartTooltipStyle(hoveredGoldDiffPoint)"
              >
                <span class="timeline-chart-tooltip-arrow" aria-hidden="true"></span>
                <strong>{{ formatTimelineTime(hoveredGoldDiffPoint.timestamp) }}</strong>
                <span>{{ formatChartTooltipMetricLine(selectedGoldDiffMetricLabel, hoveredGoldDiffPoint) }}</span>
              </div>

              <div
                v-if="hoveredEventCluster"
                class="timeline-event-tooltip timeline-axis-tooltip--bubble"
                :style="getTimelineEventTooltipStyle(hoveredEventCluster)"
              >
                <span class="timeline-axis-tooltip-arrow" aria-hidden="true"></span>
                <strong>{{ formatTimelineTime(hoveredEventCluster.timestamp) }}</strong>
                <div class="timeline-event-tooltip-list">
                  <div
                    v-for="row in getTimelineClusterTooltipRows(hoveredEventCluster)"
                    :key="row.key"
                    class="timeline-event-tooltip-row"
                  >
                    <span class="timeline-event-tooltip-actor">
                      <img
                        v-if="row.actorChampionId !== null"
                        class="timeline-event-tooltip-avatar"
                        :src="getChampionIconUrl(row.actorChampionId)"
                        :alt="row.actorText"
                        @error="markAssetLoadFailed"
                      />
                      <span v-else>{{ row.actorText }}</span>
                    </span>
                    <span class="timeline-event-tooltip-action">{{ row.actionText }}</span>
                    <span class="timeline-event-tooltip-target">
                      <img
                        v-if="row.targetChampionId !== null"
                        class="timeline-event-tooltip-avatar"
                        :src="getChampionIconUrl(row.targetChampionId)"
                        :alt="row.targetText"
                        @error="markAssetLoadFailed"
                      />
                      <span v-else>{{ row.targetText }}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="timeline-chart-metric-empty">
              {{ t('matchDetail.timelineMetricEmpty') }}
            </div>
          </div>
        </div>
        <div v-else class="timeline-empty">
          <strong>{{ t('matchDetail.timelineUnavailable') }}</strong>
          <small>{{ t('matchDetail.staticGoldDiff') }} {{ formatSignedNumber(staticTeamGoldDiff) }}</small>
        </div>
      </div>
    </section>

    <PostgameAiAnalysisModal
      :open="postgameAiModalOpen"
      :mode="postgameAiModalMode"
      :stream-state="postgameAiStreamState"
      :stream-text="postgameAiStreamText"
      :stream-error="postgameAiStreamError"
      :roster-players="postgameAiReviewRosterPlayers"
      @start-analysis="startPostgameAiAnalysis"
      @cancel-analysis="cancelPostgameAiAnalysis"
      @close="closePostgameAiModal"
    />
  </section>
</template>

<style scoped>
.inline-match-detail {
  --metric-bar-width: 74%;
  --overview-augment-slot-size: 16px;
  --overview-augment-strip-width: 106px;
  --rp-trend-badge-border: rgba(124, 156, 255, 0.32);
  --rp-trend-badge-bg: rgba(42, 59, 108, 0.38);
  --rp-info-button-border: rgba(143, 162, 216, 0.42);
  --rp-info-button-bg: rgba(14, 19, 34, 0.72);
  --rp-score-card-border: rgba(143, 162, 216, 0.2);
  --rp-score-card-bg: rgba(15, 20, 34, 0.84);
  --rp-score-card-shadow: none;
  --rp-score-card-selected-shadow: inset 0 0 0 4px color-mix(in srgb, var(--rp-player-color) 64%, transparent);
  --rp-chart-grid-line: rgba(143, 162, 216, 0.14);
  --rp-chart-zero-line: rgba(210, 220, 255, 0.28);
  --rp-chart-hover-line: rgba(225, 232, 255, 0.58);
  --rp-chart-hover-point-stroke: #f8fbff;
  --rp-chart-tooltip-border: rgba(143, 162, 216, 0.22);
  --rp-chart-tooltip-bg: rgba(7, 10, 18, 0.96);
  --rp-chart-tooltip-shadow: 0 12px 28px rgba(0, 0, 0, 0.34);
  --rp-empty-border: rgba(143, 162, 216, 0.24);
  width: 100%;
  min-width: 0;
  margin-top: 8px;
  padding: 10px;
  border: 1px solid rgba(124, 139, 164, 0.14);
  border-radius: 8px;
  background: rgba(12, 18, 28, 0.68);
  color: var(--text-primary);
  box-sizing: border-box;
  overflow: hidden;
}

:global([data-theme="light"] .inline-match-detail) {
  --rp-trend-badge-border: rgba(62, 107, 188, 0.24);
  --rp-trend-badge-bg: rgba(232, 240, 255, 0.92);
  --rp-info-button-border: rgba(45, 76, 120, 0.22);
  --rp-info-button-bg: rgba(255, 255, 255, 0.86);
  --rp-score-card-border: rgba(24, 35, 54, 0.12);
  --rp-score-card-bg: rgba(255, 255, 255, 0.92);
  --rp-score-card-shadow: 0 1px 2px rgba(17, 31, 52, 0.08);
  --rp-score-card-selected-shadow: inset 0 0 0 3px color-mix(in srgb, var(--rp-player-color) 48%, transparent), 0 0 0 1px rgba(255, 255, 255, 0.86);
  --rp-chart-grid-line: rgba(75, 92, 122, 0.16);
  --rp-chart-zero-line: rgba(47, 65, 93, 0.24);
  --rp-chart-hover-line: rgba(42, 79, 128, 0.38);
  --rp-chart-hover-point-stroke: #ffffff;
  --rp-chart-tooltip-border: rgba(45, 76, 120, 0.16);
  --rp-chart-tooltip-bg: rgba(255, 255, 255, 0.98);
  --rp-chart-tooltip-shadow: 0 12px 28px rgba(17, 31, 52, 0.18);
  --rp-empty-border: rgba(24, 35, 54, 0.16);
  background: rgba(246, 249, 253, 0.94);
  border-color: rgba(24, 35, 54, 0.12);
}

.detail-load-state {
  margin-bottom: 8px;
  padding: 7px 9px;
  border: 1px solid rgba(240, 196, 79, 0.22);
  border-radius: 6px;
  background: rgba(240, 196, 79, 0.08);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.inline-detail-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.inline-detail-tabs,
.postgame-ai-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.inline-detail-tab {
  height: 28px;
  padding: 0 12px;
  border: 1px solid rgba(124, 139, 164, 0.16);
  border-radius: 6px;
  background: rgba(124, 139, 164, 0.08);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.inline-detail-tab.active {
  border-color: rgba(var(--accent-rgb), 0.38);
  background: rgba(var(--accent-rgb), 0.14);
  color: var(--accent-color);
}

.postgame-ai-actions {
  justify-content: flex-end;
  margin-left: auto;
}

.postgame-ai-action {
  height: 28px;
  padding: 0 11px;
  border: 1px solid rgba(var(--accent-rgb), 0.24);
  border-radius: 6px;
  background: rgba(var(--accent-rgb), 0.095);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.postgame-ai-action:hover,
.postgame-ai-action:focus-visible {
  border-color: rgba(var(--accent-rgb), 0.42);
  background: rgba(var(--accent-rgb), 0.16);
  color: var(--accent-color);
  outline: none;
}

.inline-detail-body,
.overview-tab,
.runes-tab,
.chart-tab {
  min-width: 0;
}

.overview-tab {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.team-detail-table {
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgba(124, 139, 164, 0.14);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.035);
}

:global([data-theme="light"] .team-detail-table) {
  background: rgba(255, 255, 255, 0.74);
}

.team-detail-header {
  display: flex;
  min-width: 0;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(124, 139, 164, 0.12);
  color: var(--text-secondary);
  font-size: 12px;
}

.team-detail-header strong {
  min-width: 0;
  color: var(--text-primary);
}

.team-header-main {
  display: flex;
  min-width: 0;
  width: 100%;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  flex-wrap: wrap;
}

.team-header-summary {
  display: inline-flex;
  flex: 1 1 auto;
  min-width: 0;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  flex-wrap: wrap;
}

.team-header-resources {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-start;
}

.team-kda-summary {
  color: var(--text-primary);
  font-weight: 800;
  white-space: nowrap;
}

.team-draft-row,
.team-draft-objective-row {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  flex-wrap: wrap;
}

.draft-objective-label {
  color: var(--text-tertiary);
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
}

.team-ban-icons,
.team-objective-icons {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  min-width: 0;
  flex-wrap: wrap;
}

.ban-champion-icon {
  position: relative;
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
  overflow: hidden;
  border: 1px solid rgba(124, 139, 164, 0.35);
  border-radius: 4px;
  background: rgba(124, 139, 164, 0.12);
}

.ban-champion-icon::after {
  content: '';
  position: absolute;
  left: -4px;
  top: 9px;
  width: 28px;
  height: 2px;
  transform: rotate(-45deg);
  background: rgba(230, 230, 230, 0.85);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.45);
}

.objective-pill {
  position: relative;
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 3px;
  height: 20px;
  padding: 0 5px;
  border: 1px solid rgba(124, 139, 164, 0.18);
  border-radius: 999px;
  background: rgba(124, 139, 164, 0.08);
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
  outline: none;
}

.objective-count {
  color: var(--text-primary);
  font-size: 10px;
  font-weight: 900;
  line-height: 1;
}

.objective-icon {
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
}

.objective-icon-img,
.objective-fallback-icon svg {
  display: block;
  width: 100%;
  height: 100%;
}

.objective-fallback-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
}

.objective-fallback-icon svg {
  fill: currentColor;
}

.objective-pill:focus {
  border-color: rgba(var(--accent-rgb), 0.42);
  box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.14);
}

.objective-tooltip {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  display: none;
  min-width: max-content;
  max-width: 220px;
  flex-direction: column;
  gap: 6px;
  padding: 7px;
  border: 1px solid rgba(124, 139, 164, 0.24);
  border-radius: 6px;
  background: rgba(12, 18, 28, 0.96);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.28);
  color: var(--text-primary);
  pointer-events: none;
}

:global([data-theme="light"] .objective-tooltip) {
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 10px 24px rgba(24, 35, 54, 0.16);
}

.objective-pill:hover .objective-tooltip,
.objective-pill:focus .objective-tooltip,
.objective-pill:focus-within .objective-tooltip {
  display: flex;
}

.objective-tooltip-title {
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 800;
  line-height: 1.1;
}

.objective-tooltip-actors {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
}

.objective-tooltip-actor {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.objective-tooltip-avatar {
  display: block;
  width: 24px;
  height: 24px;
  border: 1px solid rgba(124, 139, 164, 0.28);
  border-radius: 5px;
  object-fit: cover;
}

.objective-tooltip-count {
  color: var(--text-primary);
  font-size: 10px;
  font-weight: 900;
}

.objective-soul-infernal {
  border-color: rgba(239, 111, 122, 0.42);
  color: #ef6f7a;
}

.objective-soul-mountain {
  border-color: rgba(214, 171, 86, 0.42);
  color: #d6ab56;
}

.objective-soul-ocean {
  border-color: rgba(82, 190, 166, 0.42);
  color: #52bea6;
}

.objective-soul-cloud {
  border-color: rgba(148, 202, 255, 0.42);
  color: #94caff;
}

.objective-soul-hextech {
  border-color: rgba(180, 139, 255, 0.42);
  color: #b48bff;
}

.objective-soul-chemtech {
  border-color: rgba(125, 214, 92, 0.42);
  color: #7dd65c;
}

.team-detail-table.blue.win .team-detail-header strong,
.team-detail-table.red.win .team-detail-header strong {
  color: var(--win-color);
}

.team-detail-table.blue.loss .team-detail-header strong,
.team-detail-table.red.loss .team-detail-header strong {
  color: var(--loss-color);
}

.team-row-labels,
.participant-row {
  display: grid;
  grid-template-columns:
    minmax(190px, 1.55fr)
    minmax(70px, 0.62fr)
    minmax(78px, 0.7fr)
    minmax(78px, 0.7fr)
    minmax(40px, 0.32fr)
    minmax(52px, 0.38fr)
    minmax(154px, 0.9fr);
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.team-detail-table.with-vision-score .team-row-labels,
.team-detail-table.with-vision-score .participant-row {
  grid-template-columns:
    minmax(190px, 1.55fr)
    minmax(70px, 0.62fr)
    minmax(78px, 0.7fr)
    minmax(78px, 0.7fr)
    minmax(40px, 0.32fr)
    minmax(52px, 0.38fr)
    minmax(58px, 0.38fr)
    minmax(154px, 0.9fr);
}

.team-row-labels {
  padding: 5px 10px;
  border-bottom: 1px solid rgba(124, 139, 164, 0.08);
  color: var(--text-tertiary);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}

.items-head,
.vision-score-head {
  text-transform: none;
}

.participant-row,
.rune-player-row {
  padding: 6px 10px;
  border-bottom: 1px solid rgba(124, 139, 164, 0.08);
  color: var(--text-secondary);
  font-size: 11px;
}

.participant-row:last-child,
.rune-player-row:last-child {
  border-bottom: 0;
}

.participant-row.clickable,
.rune-player-row.clickable {
  cursor: pointer;
}

.participant-row.clickable:hover,
.rune-player-row.clickable:hover {
  background: rgba(var(--accent-rgb), 0.08);
}

.participant-row.me,
.rune-player-row.me {
  background: rgba(var(--accent-rgb), 0.11);
  box-shadow: inset 2px 0 0 var(--accent-color);
}

.player-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.champion-wrap {
  position: relative;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  border-radius: 6px;
  background: rgba(124, 139, 164, 0.12);
  overflow: hidden;
}

.champion-wrap img,
.mini-slot img,
.overview-augment-slot img,
.trait-detail-slot img,
.ban-champion-icon img,
.item-slot img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.champion-wrap img[data-asset-failed='true'],
.mini-slot img[data-asset-failed='true'],
.overview-augment-slot img[data-asset-failed='true'],
.trait-detail-slot img[data-asset-failed='true'],
.ban-champion-icon img[data-asset-failed='true'],
.objective-tooltip-avatar[data-asset-failed='true'],
.item-slot img[data-asset-failed='true'] {
  display: none;
}

.champion-level {
  position: absolute;
  right: 0;
  bottom: 0;
  min-width: 14px;
  padding: 1px 3px;
  border-radius: 4px 0 0 0;
  background: rgba(0, 0, 0, 0.72);
  color: #fff;
  font-size: 9px;
  line-height: 1.1;
  text-align: center;
}

.spell-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 0 0 auto;
}

.trait-pair {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 0 0 auto;
}

.player-identity-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  gap: 4px;
  flex: 1 1 0;
  min-width: 0;
}

.player-identity-main.with-augments {
  grid-template-columns: minmax(0, 1fr) var(--overview-augment-strip-width);
}

.overview-augment-strip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  width: var(--overview-augment-strip-width);
  min-width: var(--overview-augment-strip-width);
  flex: 0 0 var(--overview-augment-strip-width);
  overflow: hidden;
  position: relative;
  z-index: 2;
  white-space: nowrap;
}

.mini-slot,
.overview-augment-slot,
.trait-detail-slot,
.item-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--augment-rarity-border, rgba(124, 139, 164, 0.14));
  border-radius: 4px;
  background: var(--augment-rarity-bg, rgba(124, 139, 164, 0.1));
  box-shadow: inset 0 0 0 1px var(--augment-rarity-inner, transparent);
}

.mini-slot {
  width: 15px;
  height: 15px;
  flex: 0 0 15px;
}

.overview-augment-slot {
  width: var(--overview-augment-slot-size);
  height: var(--overview-augment-slot-size);
  flex: 0 0 var(--overview-augment-slot-size);
}

.overview-augment-slot :deep(.asset-tooltip-trigger) {
  width: 100%;
  height: 100%;
}

.trait-detail-slot {
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
}

.item-slot {
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
}

.mini-slot.empty,
.trait-detail-slot.empty,
.item-slot.empty {
  opacity: 0.62;
}

.player-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.player-name-wrap {
  overflow: hidden;
  position: relative;
  z-index: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-copy strong,
.player-copy span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-copy strong {
  color: var(--text-primary);
  font-size: 12px;
}

.kda-cell,
.metric-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.player-kda-score {
  display: inline-flex;
  align-items: baseline;
  gap: 1px;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 800;
}

.kda-separator {
  color: var(--text-secondary);
  opacity: 0.75;
}

.top-kills {
  color: #ef6f7a;
  text-shadow: 0 0 8px rgba(239, 111, 122, 0.22);
}

.top-deaths {
  color: #f0c05a;
  text-shadow: 0 0 8px rgba(240, 192, 90, 0.22);
}

.top-assists {
  color: #62d49e;
  text-shadow: 0 0 8px rgba(98, 212, 158, 0.22);
}

.metric-value-with-icon {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.top-metric-icon {
  display: inline-flex;
  width: 12px;
  height: 12px;
  flex: 0 0 12px;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.top-metric-icon svg {
  display: block;
  width: 100%;
  height: 100%;
  fill: currentColor;
}

.top-damage-icon {
  color: #ff7a45;
  filter: drop-shadow(0 0 4px rgba(255, 122, 69, 0.28));
}

.top-taken-icon {
  color: #7bb7ff;
  filter: drop-shadow(0 0 4px rgba(123, 183, 255, 0.24));
}

.top-gold-icon {
  color: #f0c05a;
  filter: drop-shadow(0 0 4px rgba(240, 192, 90, 0.28));
}

.metric-track {
  width: var(--metric-bar-width);
  max-width: 100%;
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(124, 139, 164, 0.12);
}

.metric-bar {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.damage-bar {
  background: rgba(210, 87, 99, 0.78);
}

.taken-bar {
  background: rgba(92, 163, 234, 0.72);
}

.number-cell {
  min-width: 0;
  color: var(--text-secondary);
  font-weight: 700;
}

.gold-cell {
  color: #d7a64b;
}

.vision-score-cell {
  color: var(--text-secondary);
}

.item-row.compact {
  display: flex;
  gap: 3px;
  min-width: 0;
}

.runes-tab {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.rune-team-card {
  min-width: 0;
  border: 1px solid rgba(124, 139, 164, 0.14);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.035);
  overflow: hidden;
}

.rune-team-card.blue {
  border-color: rgba(92, 163, 234, 0.18);
}

.rune-team-card.red {
  border-color: rgba(222, 111, 111, 0.18);
}

:global([data-theme="light"] .rune-team-card) {
  background: rgba(255, 255, 255, 0.74);
}

.rune-team-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(124, 139, 164, 0.1);
  background: rgba(124, 139, 164, 0.055);
}

.rune-team-header strong {
  min-width: 0;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 850;
  line-height: 1.2;
}

.rune-team-card.blue .rune-team-header {
  background: rgba(92, 163, 234, 0.07);
}

.rune-team-card.red .rune-team-header {
  background: rgba(222, 111, 111, 0.07);
}

.rune-team-players {
  min-width: 0;
}

.rune-player-row {
  display: grid;
  grid-template-columns: minmax(180px, 0.9fr) minmax(0, 1.4fr);
  gap: 10px;
  align-items: center;
  min-width: 0;
  outline: none;
}

.rune-player-row.expanded {
  background: rgba(var(--accent-rgb), 0.1);
}

.rune-player-row:focus-visible {
  box-shadow:
    inset 2px 0 0 var(--accent-color),
    0 0 0 2px rgba(var(--accent-rgb), 0.16);
}

.trait-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
}

.rune-detail-panel {
  grid-column: 1 / -1;
  min-width: 0;
  padding-top: 6px;
}

.rune-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  min-width: 0;
}

.rune-column {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border: 1px solid rgba(124, 139, 164, 0.12);
  border-radius: 7px;
  background: rgba(124, 139, 164, 0.055);
}

.rune-column-header {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 800;
}

.rune-style-icon {
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
}

.rune-column-list,
.rune-augment-list {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.rune-augment-list {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.rune-detail-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid rgba(124, 139, 164, 0.12);
  border-radius: 6px;
  background: rgba(124, 139, 164, 0.07);
}

.rune-detail-item :deep(.asset-tooltip-trigger) {
  display: block;
  width: 100%;
  min-width: 0;
}

.rune-detail-content {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: flex-start;
  gap: 8px;
}

.rune-detail-icon-wrap {
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
}

.rune-detail-icon {
  display: block;
  width: 28px;
  height: 28px;
  border-radius: 5px;
}

.rune-detail-text {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
}

.rune-detail-name {
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 12px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rune-stat-list {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.rune-stat-line {
  display: flex;
  min-width: 0;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.25;
}

.chart-tab {
  min-height: 136px;
}

.rp-tab {
  min-width: 0;
}

.rp-index-shell,
.rp-chart-panel {
  display: grid;
  gap: 12px;
}

.rp-trend-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.rp-trend-badge {
  border: 1px solid var(--rp-trend-badge-border);
  border-radius: 999px;
  padding: 4px 10px;
  color: var(--text-primary);
  background: var(--rp-trend-badge-bg);
  font-size: 12px;
  font-weight: 700;
}

.rp-chart-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.rp-chart-title-row,
.rp-chart-title {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 10px;
}

.rp-chart-title-row {
  flex-wrap: wrap;
}

.rp-chart-title strong {
  font-size: 14px;
}

.rp-info-button {
  width: 22px;
  height: 22px;
  border: 1px solid var(--rp-info-button-border);
  border-radius: 50%;
  color: var(--text-secondary);
  background: var(--rp-info-button-bg);
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
}

.rp-score-groups {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.rp-score-group {
  display: grid;
  gap: 8px;
}

.rp-score-group-label {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.rp-score-card-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(44px, 1fr));
  gap: 8px;
}

.rp-score-card {
  position: relative;
  display: grid;
  min-width: 0;
  min-height: 72px;
  place-items: center;
  border: 1px solid var(--rp-score-card-border);
  border-radius: 8px;
  padding: 7px 5px 6px;
  color: var(--text-primary);
  background: var(--rp-score-card-bg);
  box-shadow: var(--rp-score-card-shadow);
}

.rp-score-card.selected {
  border-color: var(--rp-player-color);
  box-shadow: var(--rp-score-card-selected-shadow);
}

.rp-score-card-avatar {
  width: 32px;
  height: 32px;
  border-radius: 7px;
  object-fit: cover;
}

.rp-score-card-value {
  margin-top: 5px;
  color: var(--rp-player-color);
  font-size: 12px;
  font-weight: 800;
}

.rp-score-card-check {
  position: absolute;
  top: 6px;
  right: 6px;
  display: grid;
  width: 16px;
  height: 16px;
  place-items: center;
  border-radius: 50%;
  color: #08101d;
  background: var(--rp-player-color);
  font-size: 11px;
  font-weight: 900;
}

.rp-chart-stage {
  position: relative;
  min-height: 220px;
}

.rp-chart-svg {
  display: block;
  width: 100%;
  height: auto;
}

.rp-chart-grid line,
.rp-chart-time-axis line {
  stroke: var(--rp-chart-grid-line);
  stroke-width: 1;
}

.rp-chart-grid line.zero {
  stroke: var(--rp-chart-zero-line);
}

.rp-chart-grid text,
.rp-chart-time-axis text {
  fill: var(--text-tertiary);
  font-size: 11px;
}

.rp-score-line {
  fill: none;
  stroke: var(--rp-player-color);
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.rp-chart-hover-line {
  stroke: var(--rp-chart-hover-line);
  stroke-width: 1.2;
}

.rp-chart-hover-point {
  fill: var(--rp-player-color);
  stroke: var(--rp-chart-hover-point-stroke);
  stroke-width: 1.5;
}

.rp-chart-tooltip {
  position: absolute;
  z-index: 8;
  display: grid;
  min-width: 70px;
  gap: 6px;
  transform: translate(-50%, -100%);
  border: 1px solid var(--rp-chart-tooltip-border);
  border-radius: 8px;
  padding: 9px 12px;
  color: var(--text-primary);
  background: var(--rp-chart-tooltip-bg);
  box-shadow: var(--rp-chart-tooltip-shadow);
  pointer-events: none;
}

.rp-chart-tooltip strong {
  font-size: 12px;
}

.rp-tooltip-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
}

.rp-tooltip-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--rp-player-color);
}

.rp-empty-selection {
  display: grid;
  min-height: 220px;
  place-items: center;
  border: 1px dashed var(--rp-empty-border);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 13px;
}

.timeline-chart-shell {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 9px;
  overflow: visible;
}

.timeline-chart-panel {
  position: relative;
  min-width: 0;
  overflow: visible;
  border: 1px solid rgba(111, 147, 170, 0.22);
  border-radius: 7px;
  background:
    linear-gradient(180deg, rgba(9, 34, 48, 0.86), rgba(6, 14, 27, 0.9)),
    rgba(7, 18, 31, 0.88);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 14px 32px rgba(0, 0, 0, 0.18);
}

.timeline-chart-heading {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 12px 8px;
  border-bottom: 1px solid rgba(188, 150, 82, 0.2);
  background: linear-gradient(90deg, rgba(14, 45, 61, 0.72), rgba(10, 25, 38, 0.42));
}

.timeline-chart-title {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
  color: #cda765;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0;
  text-shadow: 0 0 12px rgba(205, 167, 101, 0.2);
}

.timeline-chart-title strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-chart-title-chevron {
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  transform: rotate(45deg);
  border-top: 1px solid currentColor;
  border-right: 1px solid currentColor;
  opacity: 0.9;
}

.timeline-chart-toolbar {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
}

.timeline-chart-filter {
  height: 24px;
  padding: 0 8px;
  border: 1px solid rgba(111, 147, 170, 0.22);
  border-radius: 4px;
  background: rgba(5, 16, 27, 0.44);
  color: rgba(208, 222, 234, 0.72);
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.timeline-chart-filter.active {
  border-color: rgba(205, 167, 101, 0.55);
  background: rgba(34, 54, 55, 0.72);
  box-shadow: inset 0 0 0 1px rgba(205, 167, 101, 0.08);
  color: #e4c178;
}

.timeline-chart-stage {
  --timeline-chart-event-axis-height: 52px;
  --timeline-chart-event-axis-blue-bottom: 28px;
  --timeline-chart-event-axis-red-bottom: 10px;
  position: relative;
  min-width: 0;
  padding-bottom: var(--timeline-chart-event-axis-height);
  background:
    linear-gradient(180deg, rgba(14, 58, 72, 0.38), rgba(6, 15, 28, 0.28)),
    rgba(6, 17, 29, 0.66);
  overflow: visible;
}

.timeline-chart-svg {
  display: block;
  width: 100%;
  min-height: 224px;
}

.timeline-chart-fill {
  pointer-events: none;
}

.timeline-chart-grid line,
.timeline-chart-time-axis line {
  stroke: rgba(140, 178, 188, 0.13);
  stroke-width: 1;
}

.timeline-chart-grid line.zero {
  stroke: rgba(229, 219, 184, 0.48);
  stroke-width: 1.4;
}

.timeline-chart-grid text,
.timeline-chart-time-axis text {
  fill: rgba(198, 214, 224, 0.58);
  font-size: 11px;
  font-weight: 700;
}

.timeline-zero-axis {
  stroke: rgba(229, 219, 184, 0.7);
  stroke-width: 2.2;
  filter: drop-shadow(0 0 5px rgba(229, 219, 184, 0.12));
}

.lane-matchup-watermarks,
.lane-matchup-watermark,
.lane-matchup-watermark-frame,
.lane-matchup-watermark-image,
.team-average-watermarks,
.team-watermark,
.team-champion-watermark,
.team-champion-watermark-frame,
.team-champion-watermark-image {
  pointer-events: none;
}

.lane-matchup-watermark,
.team-champion-watermark {
  opacity: 0.24;
}

.lane-matchup-watermark-frame,
.team-champion-watermark-frame {
  fill: transparent;
  stroke: rgba(255, 255, 255, 0.1);
  stroke-width: 0.5;
  border-radius: 14px;
}

.lane-matchup-watermark.watermark-blue .lane-matchup-watermark-frame,
.team-champion-watermark.watermark-blue .team-champion-watermark-frame {
  stroke: rgba(189, 224, 255, 0.12);
}

.lane-matchup-watermark.watermark-red .lane-matchup-watermark-frame,
.team-champion-watermark.watermark-red .team-champion-watermark-frame {
  stroke: rgba(255, 207, 214, 0.12);
}

.lane-matchup-watermark-image,
.team-champion-watermark-image {
  border-radius: 14px;
  clip-path: inset(3px round 14px);
  object-fit: cover;
}

.timeline-gold-line {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.4;
}

.timeline-gold-line.segment-blue {
  stroke: #4aa8ff;
}

.timeline-gold-line.segment-red {
  stroke: #f05f72;
}

.timeline-chart-crosshair {
  stroke: rgba(230, 222, 190, 0.46);
  stroke-dasharray: 4 4;
  stroke-width: 1;
  pointer-events: none;
}

.timeline-chart-hit-area {
  cursor: crosshair;
  pointer-events: all;
}

.timeline-chart-tooltip {
  position: absolute;
  z-index: 100;
  display: grid;
  gap: 3px;
  --timeline-chart-tooltip-bg: rgba(5, 12, 22, 0.94);
  --timeline-chart-tooltip-gap: 10px;
  min-width: 150px;
  max-width: min(236px, calc(100% - 22px));
  padding: 8px 10px;
  border: 1px solid rgba(205, 167, 101, 0.28);
  border-radius: 8px;
  background: var(--timeline-chart-tooltip-bg);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);
  color: rgba(213, 226, 236, 0.78);
  font-size: 11px;
  line-height: 1.35;
  pointer-events: none;
}

.timeline-chart-tooltip--bubble {
  border-radius: 9px;
  transform: translate(-50%, calc(-100% - var(--timeline-chart-tooltip-gap)));
  overflow: visible;
}

.timeline-chart-tooltip-arrow {
  position: absolute;
  left: var(--timeline-chart-tooltip-arrow-left, 50%);
  bottom: -5px;
  width: 10px;
  height: 10px;
  transform: translateX(-50%) rotate(45deg);
  border-right: 1px solid rgba(205, 167, 101, 0.28);
  border-bottom: 1px solid rgba(205, 167, 101, 0.28);
  border-radius: 2px;
  background: var(--timeline-chart-tooltip-bg);
  pointer-events: none;
}

.timeline-chart-tooltip strong,
.timeline-event-tooltip strong {
  color: #f0d390;
  font-size: 12px;
}

.timeline-chart-metric-empty {
  display: flex;
  min-height: 210px;
  align-items: center;
  justify-content: center;
  border: 1px dashed rgba(124, 139, 164, 0.2);
  border-radius: 7px;
  color: var(--text-secondary);
  font-size: 12px;
}

.timeline-chart-axis-layer,
.timeline-axis-panel {
  position: relative;
  z-index: 8;
  overflow: visible;
}

.timeline-chart-axis-layer {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: var(--timeline-chart-event-axis-height);
  pointer-events: none;
}

.timeline-axis-ruler {
  position: relative;
  height: 17px;
  margin-left: 0;
  margin-right: 4px;
}

.timeline-axis-track {
  position: absolute;
  right: 3.529%;
  left: 8.529%;
  top: 50%;
  height: 1px;
  border-top: 1px solid rgba(140, 178, 188, 0.2);
  pointer-events: none;
}

.timeline-axis-tick {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  color: rgba(198, 214, 224, 0.48);
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}

.timeline-event-track {
  position: absolute;
  right: 0;
  left: 0;
  min-width: 0;
  height: 18px;
  pointer-events: none;
}

.timeline-event-track.track-blue {
  bottom: var(--timeline-chart-event-axis-blue-bottom);
}

.timeline-event-track.track-red {
  bottom: var(--timeline-chart-event-axis-red-bottom);
}

.timeline-axis-marker {
  position: absolute;
  top: 50%;
  width: var(--timeline-axis-marker-size, 11px);
  height: var(--timeline-axis-marker-size, 11px);
  padding: 0;
  transform: translate(-50%, -50%);
  border: 1px solid rgba(237, 246, 255, 0.32);
  border-radius: 999px;
  background: currentColor;
  box-shadow: 0 0 0 2px rgba(7, 14, 24, 0.38);
  cursor: pointer;
  font-size: 0;
  line-height: 1;
  opacity: 0.92;
  pointer-events: auto;
}

.timeline-axis-marker--blue {
  color: #55aaff;
}

.timeline-axis-marker--red {
  color: #ff6577;
}

.timeline-axis-marker--cluster.timeline-axis-marker--blue {
  box-shadow:
    0 0 0 2px rgba(7, 14, 24, 0.38),
    0 0 12px rgba(85, 170, 255, 0.26);
}

.timeline-axis-marker--cluster.timeline-axis-marker--red {
  box-shadow:
    0 0 0 2px rgba(7, 14, 24, 0.38),
    0 0 12px rgba(255, 101, 119, 0.24);
}

.timeline-axis-marker--related {
  z-index: 14;
  border-color: rgba(247, 252, 255, 0.72);
  opacity: 1;
}

.timeline-axis-marker--related.timeline-axis-marker--blue {
  box-shadow:
    0 0 0 2px rgba(7, 14, 24, 0.42),
    0 0 14px rgba(85, 170, 255, 0.36);
}

.timeline-axis-marker--related.timeline-axis-marker--red {
  box-shadow:
    0 0 0 2px rgba(7, 14, 24, 0.42),
    0 0 14px rgba(255, 101, 119, 0.34);
}

.timeline-axis-marker--dimmed {
  border-color: rgba(237, 246, 255, 0.12);
  opacity: 0.28;
}

.timeline-axis-marker:hover,
.timeline-axis-marker:focus-visible {
  z-index: 20;
  border-color: rgba(247, 252, 255, 0.78);
  opacity: 1;
  outline: none;
}

.timeline-axis-marker--blue:hover,
.timeline-axis-marker--blue:focus-visible {
  box-shadow:
    0 0 0 2px rgba(7, 14, 24, 0.42),
    0 0 14px rgba(85, 170, 255, 0.34);
}

.timeline-axis-marker--red:hover,
.timeline-axis-marker--red:focus-visible {
  box-shadow:
    0 0 0 2px rgba(7, 14, 24, 0.42),
    0 0 14px rgba(255, 101, 119, 0.32);
}

.timeline-event-tooltip {
  position: absolute;
  right: auto;
  z-index: 999;
  display: grid;
  gap: 4px;
  --timeline-axis-tooltip-bg: rgba(5, 12, 22, 0.94);
  --timeline-axis-tooltip-gap: 10px;
  min-width: 154px;
  max-width: min(260px, calc(100% - 20px));
  padding: 8px 10px;
  border: 1px solid rgba(205, 167, 101, 0.28);
  border-radius: 8px;
  background: var(--timeline-axis-tooltip-bg);
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.3);
  color: rgba(213, 226, 236, 0.78);
  font-size: 11px;
  line-height: 1.35;
  pointer-events: none;
}

.timeline-axis-tooltip--bubble {
  border-radius: 9px;
  transform: translate(-50%, calc(-100% - var(--timeline-axis-tooltip-gap)));
  overflow: visible;
}

.timeline-axis-tooltip-arrow {
  position: absolute;
  left: var(--timeline-axis-tooltip-arrow-left, 50%);
  bottom: -5px;
  width: 10px;
  height: 10px;
  transform: translateX(-50%) rotate(45deg);
  border-right: 1px solid rgba(205, 167, 101, 0.28);
  border-bottom: 1px solid rgba(205, 167, 101, 0.28);
  border-radius: 2px;
  background: var(--timeline-axis-tooltip-bg);
  pointer-events: none;
}

.timeline-event-tooltip-list {
  display: grid;
  gap: 6px;
}

.timeline-event-tooltip-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  color: rgba(225, 235, 242, 0.86);
  white-space: nowrap;
}

.timeline-event-tooltip-actor,
.timeline-event-tooltip-target {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
}

.timeline-event-tooltip-action {
  color: #f0d390;
  font-weight: 800;
}

.timeline-event-tooltip-avatar {
  display: block;
  width: 24px;
  height: 24px;
  border: 1px solid rgba(205, 167, 101, 0.28);
  border-radius: 50%;
  object-fit: cover;
}

.timeline-event-tooltip-avatar[data-asset-failed='true'] {
  display: none;
}

.timeline-empty {
  display: flex;
  min-height: 136px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 18px;
  border: 1px dashed rgba(124, 139, 164, 0.24);
  border-radius: 7px;
  background: rgba(124, 139, 164, 0.07);
  color: var(--text-secondary);
  text-align: center;
}

.timeline-empty strong {
  color: var(--text-primary);
  font-size: 14px;
}

.timeline-empty small {
  color: #d7a64b;
  font-weight: 700;
}

.timeline-host {
  min-height: 136px;
}

@media (max-width: 1080px) {
  .team-row-labels,
  .participant-row {
    grid-template-columns:
      minmax(170px, 1.4fr)
      minmax(70px, 0.6fr)
      minmax(78px, 0.7fr)
      minmax(40px, 0.32fr)
      minmax(150px, 0.9fr);
  }

  .team-row-labels span:nth-child(4),
  .participant-row .metric-cell.secondary,
  .team-row-labels span:nth-child(6),
  .participant-row .gold-cell,
  .team-row-labels .vision-score-head,
  .participant-row .vision-score-cell {
    display: none;
  }
}

@media (max-width: 760px) {
  .inline-match-detail {
    padding: 8px;
  }

  .inline-detail-toolbar {
    align-items: flex-start;
  }

  .postgame-ai-actions {
    width: 100%;
    justify-content: flex-start;
    margin-left: 0;
  }

  .team-detail-header {
    gap: 3px;
  }

  .team-header-main {
    align-items: flex-start;
  }

  .team-header-summary {
    margin-left: 0;
    justify-content: flex-start;
  }

  .team-row-labels {
    display: none;
  }

  .participant-row,
  .rune-player-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 7px;
  }

  .metric-cell,
  .number-cell {
    display: none;
  }

  .item-row.compact {
    flex-wrap: wrap;
  }
}

@media (max-width: 720px) {
  .rune-columns {
    grid-template-columns: 1fr;
  }
}
</style>
