<script setup lang="ts">
import { computed, ref } from 'vue'
import CoachSummaryChartBlock from '@/components/CoachSummaryChartBlock.vue'
import { getChampionIconUrl, markAssetLoadFailed } from '@/utils/gameAssetUrls'
import type {
  CoachSummaryKeyFinding,
  CoachSummaryHeroStat,
  CoachSummaryRpTrendPoint,
  CoachSummaryReportV1
} from '@/types/coachSummaryReport'

const MAX_REPORT_CHARTS = 3
const RP_CHART_WIDTH = 760
const RP_CHART_HEIGHT = 280
const RP_CHART_LEFT = 46
const RP_CHART_RIGHT = 24
const RP_CHART_TOP = 24
const RP_CHART_BOTTOM = 42
const RP_CHART_POINT_SIZE = 18
const RP_CHART_POINT_RADIUS = RP_CHART_POINT_SIZE / 2
const RP_CHART_POINT_HIT_RADIUS = 15
const RP_CHART_GRID_VALUES = [10, 7.5, 5, 2.5, 0] as const
const COACH_SUMMARY_HERO_ICON_FALLBACK_IDS = buildHeroIconFallbackIds([
  [43, ['Karma', '卡尔玛']],
  [59, ['Jarvan IV', '嘉文四世']],
  [76, ['Nidalee', '奈德丽']],
  [89, ['Leona', '蕾欧娜']],
  [102, ['Shyvana', '希瓦娜']],
  [103, ['Ahri', '阿狸']],
  [117, ['Lulu', '璐璐']],
  [133, ['Quinn', '奎因']],
  [141, ['Kayn', '凯隐']],
  [200, ["Bel'Veth", '卑尔维斯']],
  [233, ['Briar', '贝蕾亚']],
  [234, ['Viego', '佛耶戈']],
  [350, ['Yuumi', '悠米']],
  [517, ['Sylas', '塞拉斯']],
  [888, ['Renata Glasc', '烈娜塔·戈拉斯克']],
  [897, ["K'Sante", '奎桑提']],
  [950, ['Naafiri', '纳亚菲利']]
])

type ReportLoadState = 'loading' | 'ready' | 'missing' | 'unsupported' | 'invalid' | 'error'
type OverviewChartKey = 'winRate' | 'rpIndex'
type VisibleOverviewChartKey = OverviewChartKey | 'none'

interface RpChartPoint extends CoachSummaryRpTrendPoint {
  x: number
  y: number
  label: number
}

const props = withDefaults(defineProps<{
  report: CoachSummaryReportV1 | null
  reportLoadState?: ReportLoadState
  errorMessage?: string
  createdAt?: string | null
  mode?: 'modal' | 'page'
}>(), {
  reportLoadState: 'ready',
  errorMessage: '',
  createdAt: null,
  mode: 'page'
})

const overview = computed(() => props.report?.overview ?? null)
const overviewSummary = computed(() => normalizeOverviewSummaryText(overview.value?.summary || props.report?.summary || ''))
const heroStats = computed(() => (overview.value?.heroStats || []).slice(0, 5))
const heroWinRateStats = computed(() => (
  heroStats.value
    .filter(hero => typeof hero.winRate === 'number')
    .slice(0, 5)
))
const rpTrendPoints = computed(() => (
  (overview.value?.rpTrend || [])
    .filter(point => typeof point.score === 'number')
    .slice(0, 20)
))
const activeOverviewChart = ref<'winRate' | 'rpIndex'>('winRate')
const activeRpChartPoint = ref<RpChartPoint | null>(null)
const canShowHeroWinRateChart = computed(() => heroWinRateStats.value.length > 0)
const canShowRpTrendChart = computed(() => rpTrendPoints.value.length > 0)
const showOverviewChartTabs = computed(() => canShowHeroWinRateChart.value && canShowRpTrendChart.value)
const visibleOverviewChart = computed<VisibleOverviewChartKey>(() => {
  if (activeOverviewChart.value === 'rpIndex' && canShowRpTrendChart.value) {
    return 'rpIndex'
  }
  if (activeOverviewChart.value === 'winRate' && canShowHeroWinRateChart.value) {
    return 'winRate'
  }
  if (canShowHeroWinRateChart.value) {
    return 'winRate'
  }
  return canShowRpTrendChart.value ? 'rpIndex' : 'none'
})
const rpChartGridLines = computed(() => (
  RP_CHART_GRID_VALUES.map(value => ({
    value,
    label: formatRpAxisValue(value),
    y: rpScoreToY(value)
  }))
))
const rpChartPoints = computed<RpChartPoint[]>(() => {
  const points = rpTrendPoints.value
  const denominator = Math.max(1, points.length - 1)
  return points.map((point, index) => {
    const x = points.length === 1
      ? RP_CHART_LEFT + (RP_CHART_WIDTH - RP_CHART_LEFT - RP_CHART_RIGHT) / 2
      : RP_CHART_LEFT + (index / denominator) * (RP_CHART_WIDTH - RP_CHART_LEFT - RP_CHART_RIGHT)
    const score = clampRpScore(point.score)
    return {
      ...point,
      score,
      x,
      y: rpScoreToY(score),
      label: index + 1
    }
  })
})
const rpChartPolyline = computed(() => rpChartPoints.value.map(point => `${point.x},${point.y}`).join(' '))
const winLossLabel = computed(() => {
  const wins = overview.value?.wins
  const losses = overview.value?.losses
  if (wins !== undefined && losses !== undefined) {
    return `${wins}W / ${losses}L`
  }
  const totalMatches = overview.value?.totalMatches
  return totalMatches ? `${totalMatches} 场` : '暂无样本'
})
const roleSummary = computed(() => {
  const roleStats = overview.value?.roleStats || []
  const primaryRoles = overview.value?.primaryRoles || []
  const roles = roleStats.length
    ? roleStats.map(role => ({ role: role.role, count: role.games }))
    : primaryRoles.map(role => ({ role: role.role, count: role.count }))
  return roles.length
    ? roles.map(role => `${formatRoleLabel(role.role)} ${role.count}`).join(' / ')
    : '暂无'
})
const chartBlocks = computed(() => props.report?.chartBlocks || [])
const overviewCharts = computed(() => (
  heroWinRateStats.value.length
    ? []
    : chartBlocks.value
      .filter(chart => chart.placement === 'overview')
      .slice(0, Math.min(2, MAX_REPORT_CHARTS))
))
const findings = computed(() => props.report?.keyFindings || [])
const closingSummary = computed(() =>
  props.report?.finalSummary ||
  props.report?.verdict.summary ||
  props.report?.summary ||
  ''
)
const createdAtLabel = computed(() =>
  props.createdAt ? new Date(props.createdAt).toLocaleDateString('zh-CN') : ''
)

function formatPercent(value?: number): string {
  if (value === undefined) {
    return '-'
  }
  return `${Number.isInteger(value) ? value : Number(value.toFixed(1))}%`
}

function normalizeOverviewSummaryText(value: string): string {
  const text = removeLocalOverallStateText(value.trim())
  if (!text) {
    return ''
  }
  const metrics = extractOverviewSummaryMetrics(text)
  if (!metrics.length) {
    return text
  }
  const sentences = text.split(/。+/).map(sentence => sentence.trim()).filter(Boolean)
  const normalized = sentences
    .map((sentence, index) => index === 0 ? sentence : removeRepeatedOverviewMetrics(sentence, metrics))
    .filter(Boolean)
  if (!normalized.length) {
    return text
  }
  return `${normalized.join('。')}${text.endsWith('。') ? '。' : ''}`
}

function extractOverviewSummaryMetrics(text: string): string[] {
  const firstSentence = text.split(/。+/)[0] || ''
  return [
    firstSentence.match(/\d+局\d+胜\d+负/)?.[0] || '',
    firstSentence.match(/胜率\d+(?:\.\d+)?%/)?.[0] || '',
    firstSentence.match(/平均RP\d+(?:\.\d+)?/)?.[0] || ''
  ].filter(Boolean)
}

function removeRepeatedOverviewMetrics(sentence: string, metrics: string[]): string {
  let result = sentence.trim()
  let changed = true
  while (changed) {
    changed = false
    for (const metric of metrics) {
      const escaped = escapeRegExp(metric)
      const next = result
        .replace(new RegExp(`^${escaped}[，；、\\s]*`), '')
        .replace(new RegExp(`([，；、])${escaped}(?=[，；、]|$)`, 'g'), '$1')
        .replace(/^[，；、\s]+/, '')
        .replace(/[，；、\s]+$/, '')
      if (next !== result) {
        result = next
        changed = true
      }
    }
  }
  return result
}

function removeLocalOverallStateText(value: string): string {
  return value.replace(/，整体状态(?:很好|良好|稳定|波动|低迷)(?=。|；|，|$)/g, '')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function formatRoleLabel(role: string): string {
  const normalized = role.trim().toUpperCase()
  const labels: Record<string, string> = {
    TOP: '上路',
    JUNGLE: '打野',
    MID: '中路',
    MIDDLE: '中路',
    ADC: '下路',
    BOTTOM: '下路',
    SUPPORT: '辅助',
    UTILITY: '辅助',
    UNKNOWN: '未知'
  }
  return labels[normalized] || role || '未知'
}

function clampPercent(value?: number): number {
  if (value === undefined) {
    return 0
  }
  return Math.max(0, Math.min(100, value))
}

function clampRpScore(value: number): number {
  return Math.max(0, Math.min(10, value))
}

function rpScoreToY(value: number): number {
  const clamped = clampRpScore(value)
  return RP_CHART_TOP + (1 - clamped / 10) * (RP_CHART_HEIGHT - RP_CHART_TOP - RP_CHART_BOTTOM)
}

function formatRpScore(value: number): string {
  return value.toFixed(1)
}

function formatRpAxisValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function formatRpResult(result?: CoachSummaryRpTrendPoint['result']): string {
  if (result === 'win') {
    return '胜利'
  }
  if (result === 'loss') {
    return '失败'
  }
  return '未知结果'
}

function rpPointResultClass(point: CoachSummaryRpTrendPoint): string {
  if (point.result === 'win') {
    return 'result-win'
  }
  if (point.result === 'loss') {
    return 'result-loss'
  }
  return 'result-unknown'
}

function formatRpHoverSummary(point: CoachSummaryRpTrendPoint): string {
  const trendLabel = point.trendLabel ? `（${point.trendLabel}）` : ''
  return `RP${formatRpScore(point.score)}${trendLabel} ${point.championDisplayName || '未知英雄'} · ${formatRpResult(point.result)} · ${formatRpKdaText(point)}`
}

function formatRpKdaText(point: CoachSummaryRpTrendPoint): string {
  const raw = point.kdaText?.trim()
  if (!raw) {
    return 'K/D/A'
  }
  const match = raw.match(/^(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)/)
  if (match) {
    return match[1].replace(/\D/g, '') + '/' + match[2].replace(/\D/g, '') + '/' + match[3].replace(/\D/g, '')
  }
  return raw.replace(/\s*\(\s*\d+(?:\.\d+)?\s*\)\s*$/, '')
}

function formatRpChartPointLabel(point: CoachSummaryRpTrendPoint): string {
  return [
    point.matchRef,
    point.championDisplayName || '未知英雄',
    `RP ${formatRpScore(point.score)}`,
    formatRpResult(point.result),
    formatRpKdaText(point),
    point.trendLabel || ''
  ]
    .filter(Boolean)
    .join('，')
}

function rpPointClipId(point: RpChartPoint): string {
  return `coach-rp-point-${point.matchRef.replace(/[^a-zA-Z0-9_-]/g, '-')}-${point.label}`
}

function shouldShowRpXAxisLabel(point: RpChartPoint): boolean {
  return point.label === 1 || point.label % 5 === 0 || point.label === rpChartPoints.value.length
}

function heroIcon(hero: CoachSummaryHeroStat): string {
  return getChampionIconUrl(heroIconChampionId(hero))
}

function heroIconChampionId(hero: CoachSummaryHeroStat): number | null {
  return hero.championId ?? readHeroIconFallbackId(hero)
}

function formatHeroChartLabel(hero: CoachSummaryHeroStat): string {
  return `${hero.championDisplayName}，${hero.games} 场，胜率 ${formatPercent(hero.winRate)}`
}

function heroDetailLine(hero: CoachSummaryHeroStat): string {
  return [
    formatRoleLabel(hero.role),
    `${hero.games} 场`,
    heroRecordText(hero),
    heroAverageKdaText(hero)
  ]
    .filter(Boolean)
    .join(' · ')
}

function heroRecordText(hero: CoachSummaryHeroStat): string {
  if (hero.wins !== undefined && hero.losses !== undefined) {
    return `${hero.wins}胜${hero.losses}负`
  }
  return ''
}

function heroAverageKdaText(hero: CoachSummaryHeroStat): string {
  if (hero.averageKda !== undefined) {
    return `KDA ${formatCompactNumber(hero.averageKda)}`
  }
  return hero.kda ? `KDA ${hero.kda}` : ''
}

function formatCompactNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function findingText(finding: CoachSummaryKeyFinding): string {
  return [
    finding.claim,
    finding.evidence,
    finding.reasoning,
    finding.advice
  ]
    .filter(Boolean)
    .join(' ')
}

function readHeroIconFallbackId(hero: CoachSummaryHeroStat): number | null {
  for (const name of [hero.championCanonicalName, hero.championDisplayName]) {
    const fallbackId = COACH_SUMMARY_HERO_ICON_FALLBACK_IDS.get(normalizeHeroIconLookupKey(name))
    if (fallbackId !== undefined) {
      return fallbackId
    }
  }
  return null
}

function buildHeroIconFallbackIds(entries: Array<[number, string[]]>): Map<string, number> {
  const map = new Map<string, number>()
  for (const [championId, names] of entries) {
    for (const name of names) {
      map.set(normalizeHeroIconLookupKey(name), championId)
    }
  }
  return map
}

function normalizeHeroIconLookupKey(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}
</script>

<template>
  <div class="coach-report-content" :class="`content-mode-${mode}`">
    <div v-if="reportLoadState === 'loading'" class="state-card">正在读取报告...</div>

    <div v-else-if="reportLoadState !== 'ready'" class="state-card warning">
      <h2>{{ reportLoadState === 'unsupported' ? '暂不支持该报告类型' : '报告内容暂时无法解析' }}</h2>
      <p>{{ errorMessage || '这份记录不是 coach_summary_report.v1，或报告 JSON 不完整。' }}</p>
    </div>

    <template v-else-if="report">
      <section class="report-section overview-section">
        <div class="section-heading">
          <h2>近 20 局概览</h2>
          <span>{{ createdAtLabel }}</span>
        </div>

        <p class="section-summary ai-report-prose">{{ overviewSummary }}</p>

        <div class="overview-layout" :class="{ 'rp-index-layout': visibleOverviewChart === 'rpIndex' }">
          <div v-if="visibleOverviewChart !== 'rpIndex'" class="overview-text-column">
            <div class="overview-facts" aria-label="概览关键数据">
              <div class="overview-fact-row overview-fact-row-split" aria-label="胜率">
                <strong class="fact-main">{{ formatPercent(overview?.winRate) }}</strong>
                <span class="fact-sub">{{ winLossLabel }}</span>
              </div>

              <div class="overview-fact-row" aria-label="游玩位置">
                <strong class="fact-main">{{ roleSummary }}</strong>
              </div>
            </div>

            <div v-if="heroStats.length" class="overview-hero-list" aria-label="最近游玩英雄">
              <ul class="hero-chip-list">
                <li v-for="hero in heroStats" :key="`${hero.championDisplayName}-${hero.role}`" class="hero-chip">
                  <div class="hero-avatar">
                    <img
                      v-if="heroIcon(hero)"
                      :src="heroIcon(hero)"
                      :alt="hero.championDisplayName"
                      @error="markAssetLoadFailed"
                    />
                    <span v-else>{{ hero.championDisplayName.slice(0, 1) }}</span>
                  </div>
                  <div class="hero-main">
                    <h3>{{ hero.championDisplayName }}</h3>
                    <p>{{ heroDetailLine(hero) }}</p>
                  </div>
                  <div class="hero-metrics">
                    <span>{{ formatPercent(hero.winRate) }}</span>
                  </div>
                </li>
              </ul>
            </div>
          </div>

          <figure
            v-if="visibleOverviewChart !== 'none'"
            class="hero-win-rate-figure"
            :class="{ 'rp-index-wide': visibleOverviewChart === 'rpIndex' }"
            :aria-label="visibleOverviewChart === 'rpIndex' ? '近 20 局 RP指数曲线' : '主玩英雄胜率'"
          >
            <div
              v-if="showOverviewChartTabs || visibleOverviewChart === 'rpIndex'"
              class="overview-chart-control-row"
            >
              <div v-if="visibleOverviewChart === 'rpIndex'" class="rp-index-hover-zone" aria-live="polite">
                <div v-if="activeRpChartPoint" class="rp-index-hover-panel">
                  <span>{{ formatRpHoverSummary(activeRpChartPoint) }}</span>
                </div>
              </div>
              <div v-if="showOverviewChartTabs" class="overview-chart-tabs" aria-label="切换概览图表">
                <button
                  type="button"
                  :class="{ active: visibleOverviewChart === 'winRate' }"
                  @click="activeOverviewChart = 'winRate'"
                >英雄胜率</button>
                <button
                  type="button"
                  :class="{ active: visibleOverviewChart === 'rpIndex' }"
                  @click="activeOverviewChart = 'rpIndex'"
                >RP指数曲线</button>
              </div>
            </div>

            <div v-if="visibleOverviewChart === 'winRate'" class="hero-win-rate-chart" role="img" aria-label="主玩英雄胜率柱状图">
              <div class="hero-win-rate-y-axis" aria-hidden="true">
                <span>100%</span>
                <span>75%</span>
                <span>50%</span>
                <span>25%</span>
                <span>0%</span>
              </div>
              <div class="hero-win-rate-plot">
                <div class="hero-win-rate-grid" aria-hidden="true">
                  <span></span>
                  <span></span>
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <div class="hero-win-rate-bars">
                  <div
                    v-for="hero in heroWinRateStats"
                    :key="`chart-${hero.championDisplayName}-${hero.role}`"
                    class="hero-win-rate-column"
                    :style="{ '--hero-win-rate': `${clampPercent(hero.winRate)}%` }"
                    tabindex="0"
                    :aria-label="formatHeroChartLabel(hero)"
                    :title="formatHeroChartLabel(hero)"
                  >
                    <div class="hero-win-bar-plot">
                      <div class="hero-win-bar-fill"></div>
                      <span class="hero-win-tooltip">
                        <strong>{{ formatPercent(hero.winRate) }}</strong>
                        <em>{{ hero.games }} 场</em>
                      </span>
                    </div>
                    <div class="hero-win-rate-x-axis">
                      <div class="hero-win-rate-avatar" :title="hero.championDisplayName">
                        <img
                          v-if="heroIcon(hero)"
                          :src="heroIcon(hero)"
                          :alt="hero.championDisplayName"
                          @error="markAssetLoadFailed"
                        />
                        <span v-else>{{ hero.championDisplayName.slice(0, 1) }}</span>
                      </div>
                      <span class="hero-win-rate-games">{{ hero.games }} 场</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-else-if="visibleOverviewChart === 'rpIndex'" class="rp-index-figure">
              <div class="rp-index-chart" role="img" aria-label="近 20 局 RP指数曲线">
                <svg viewBox="0 0 760 280" aria-hidden="true">
                  <defs>
                    <clipPath
                      v-for="point in rpChartPoints"
                      :id="rpPointClipId(point)"
                      :key="`rp-clip-${point.matchRef}`"
                      clipPathUnits="userSpaceOnUse"
                    >
                      <circle :cx="point.x" :cy="point.y" :r="RP_CHART_POINT_RADIUS" />
                    </clipPath>
                  </defs>
                  <g v-for="line in rpChartGridLines" :key="`rp-grid-${line.label}`">
                    <line
                      :x1="RP_CHART_LEFT"
                      :y1="line.y"
                      :x2="RP_CHART_WIDTH - RP_CHART_RIGHT"
                      :y2="line.y"
                      class="rp-index-guide"
                    />
                    <text class="rp-index-y-label" x="8" :y="line.y + 4">{{ line.label }}</text>
                  </g>
                  <line
                    :x1="RP_CHART_LEFT"
                    :y1="RP_CHART_TOP"
                    :x2="RP_CHART_LEFT"
                    :y2="RP_CHART_HEIGHT - RP_CHART_BOTTOM"
                    class="rp-index-axis"
                  />
                  <line
                    :x1="RP_CHART_LEFT"
                    :y1="RP_CHART_HEIGHT - RP_CHART_BOTTOM"
                    :x2="RP_CHART_WIDTH - RP_CHART_RIGHT"
                    :y2="RP_CHART_HEIGHT - RP_CHART_BOTTOM"
                    class="rp-index-axis"
                  />
                  <polyline v-if="rpChartPoints.length > 1" class="rp-index-polyline" :points="rpChartPolyline" />
                  <g
                    v-for="point in rpChartPoints"
                    :key="point.matchRef"
                    class="rp-index-point"
                    tabindex="0"
                    :aria-label="formatRpChartPointLabel(point)"
                    @mouseenter="activeRpChartPoint = point"
                    @mouseleave="activeRpChartPoint = null"
                    @focus="activeRpChartPoint = point"
                    @blur="activeRpChartPoint = null"
                  >
                    <circle
                      v-if="activeRpChartPoint?.matchRef === point.matchRef"
                      class="rp-index-active-ring"
                      :cx="point.x"
                      :cy="point.y"
                      :r="RP_CHART_POINT_RADIUS + 5"
                    />
                    <circle
                      :class="['rp-index-point-ring', rpPointResultClass(point)]"
                      :cx="point.x"
                      :cy="point.y"
                      :r="RP_CHART_POINT_RADIUS + 1"
                    />
                    <image
                      v-if="point.championId"
                      class="rp-index-avatar"
                      :href="getChampionIconUrl(point.championId)"
                      :x="point.x - RP_CHART_POINT_RADIUS"
                      :y="point.y - RP_CHART_POINT_RADIUS"
                      :width="RP_CHART_POINT_SIZE"
                      :height="RP_CHART_POINT_SIZE"
                      :clip-path="`url(#${rpPointClipId(point)})`"
                      preserveAspectRatio="xMidYMid slice"
                    />
                    <circle
                      v-else
                      class="rp-index-dot"
                      :cx="point.x"
                      :cy="point.y"
                      :r="RP_CHART_POINT_RADIUS - 2"
                    />
                    <circle class="rp-index-hit" :cx="point.x" :cy="point.y" :r="RP_CHART_POINT_HIT_RADIUS" />
                  </g>
                  <text
                    v-for="point in rpChartPoints"
                    v-show="shouldShowRpXAxisLabel(point)"
                    :key="`rp-label-${point.matchRef}`"
                    class="rp-index-x-label"
                    :x="point.x"
                    y="260"
                  >
                    {{ point.label }}
                  </text>
                </svg>
              </div>
            </div>
          </figure>
        </div>

        <div v-if="overviewCharts.length" class="chart-grid">
          <CoachSummaryChartBlock
            v-for="chart in overviewCharts"
            :key="chart.id"
            :chart="chart"
          />
        </div>
      </section>

      <div class="paper-divider" aria-hidden="true"></div>

      <section class="report-section analysis-section">
        <div class="section-heading">
          <h2>数据分析</h2>
        </div>

        <ol class="finding-list report-list">
          <li v-for="finding in findings" :key="finding.id" class="finding-item">
            <p class="finding-copy ai-report-prose">{{ findingText(finding) }}</p>
          </li>
        </ol>
      </section>

      <div class="paper-divider" aria-hidden="true"></div>

      <section class="report-section summary-section">
        <div class="section-heading">
          <h2>数据总结</h2>
        </div>

        <p class="final-summary ai-report-prose">{{ closingSummary }}</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.coach-report-content {
  min-width: 0;
}

.state-card {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at 10% 0%, rgba(var(--accent-rgb), 0.065), transparent 34%),
    var(--bg-secondary);
  box-shadow:
    0 14px 32px rgba(0, 0, 0, 0.16),
    0 0 0 1px rgba(var(--accent-rgb), 0.025);
  padding: 22px;
  color: var(--text-secondary);
}

.state-card.warning {
  border-color: rgba(255, 159, 10, 0.22);
}

.state-card h2 {
  margin: 0 0 6px;
  color: var(--text-primary);
  font-size: 17px;
}

.state-card p {
  margin: 0;
  color: var(--text-secondary);
}

.report-section {
  padding: 8px 2px 4px;
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.section-heading h2 {
  margin: 0;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 800;
  line-height: 1.25;
  letter-spacing: 0;
}

.section-heading span {
  color: var(--text-tertiary);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.5;
}

.section-summary,
.final-summary {
  margin: 0;
  color: var(--text-secondary);
  font-size: 24px;
  line-height: 1.65;
}

.paper-divider {
  position: relative;
  height: 18px;
  margin: 28px 0 24px;
}

.paper-divider::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(148, 163, 184, 0.08) 16%,
    rgba(148, 163, 184, 0.22) 38%,
    rgba(148, 163, 184, 0.34) 50%,
    rgba(148, 163, 184, 0.22) 62%,
    rgba(148, 163, 184, 0.08) 84%,
    transparent 100%
  );
}

.paper-divider::after {
  content: '';
  position: absolute;
  left: 50%;
  top: calc(50% - 1px);
  width: min(220px, 28%);
  height: 2px;
  transform: translateX(-50%);
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(var(--accent-rgb), 0.12) 18%,
    rgba(var(--accent-rgb), 0.42) 50%,
    rgba(var(--accent-rgb), 0.12) 82%,
    transparent 100%
  );
}

.overview-layout {
  --overview-bottom-gap: 8px;
  display: grid;
  grid-template-columns: minmax(260px, 0.85fr) minmax(340px, 1.15fr);
  gap: 18px;
  align-items: stretch;
  margin-top: 16px;
  padding-bottom: var(--overview-bottom-gap);
}

.overview-layout.rp-index-layout {
  grid-template-columns: minmax(0, 1fr);
}

.overview-text-column {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-bottom: var(--overview-bottom-gap);
}

.overview-facts {
  display: grid;
  gap: 10px;
  margin: 0;
}

.overview-fact-row {
  min-width: 0;
  min-height: 54px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  padding: 8px 0 8px 12px;
  border-left: 1px solid var(--border-subtle);
}

.overview-fact-row-split {
  justify-content: space-between;
}

.fact-main {
  display: block;
  color: var(--text-primary);
  font-size: 23px;
  font-weight: 800;
  line-height: 1.25;
}

.fact-sub,
.hero-main p,
.hero-metrics span {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.fact-sub {
  color: var(--text-tertiary);
  font-size: 13px;
  font-weight: 700;
  text-align: right;
  white-space: nowrap;
}

.overview-hero-list {
  min-width: 0;
  margin-top: auto;
}

.hero-chip-list,
.finding-list,
.chart-grid {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.hero-chip-list {
  grid-template-columns: 1fr;
  padding: 0;
  list-style: none;
}

.hero-chip {
  min-width: 0;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 8px 9px;
  border-radius: 8px;
  background: rgba(var(--accent-rgb), 0.045);
}

.hero-avatar {
  width: 40px;
  height: 40px;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(var(--accent-rgb), 0.2);
  border-radius: 10px;
  background: rgba(var(--accent-rgb), 0.1);
  color: var(--text-primary);
  font-weight: 800;
}

.hero-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hero-main {
  min-width: 0;
}

.hero-main h3 {
  display: block;
  margin: 0;
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 750;
  line-height: 1.35;
}

.hero-main p {
  margin: 3px 0 0;
  font-size: 13px;
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hero-metrics {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
}

.hero-metrics span {
  font-size: 13px;
  line-height: 1.2;
}

.hero-metrics span:first-child {
  color: var(--accent-color);
  font-weight: 800;
}

.hero-win-rate-figure {
  position: relative;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding-left: 18px;
  padding-bottom: var(--overview-bottom-gap);
  border-left: 1px solid var(--border-subtle);
}

.hero-win-rate-figure.rp-index-wide {
  min-height: 390px;
  padding-left: 0;
  border-left: 0;
}

.overview-chart-control-row {
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.overview-chart-tabs {
  width: fit-content;
  display: inline-flex;
  flex: 0 0 auto;
  gap: 6px;
  padding: 4px;
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.035);
}

.overview-chart-tabs button {
  min-height: 36px;
  padding: 0 17px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 13px;
  font-weight: 850;
  white-space: nowrap;
  transition: background 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
}

.overview-chart-tabs button:hover,
.overview-chart-tabs button:focus-visible {
  color: var(--text-primary);
  outline: none;
}

.overview-chart-tabs button.active {
  background: rgba(var(--accent-rgb), 0.72);
  color: #f5faff;
  box-shadow: 0 0 0 1px rgba(var(--accent-rgb), 0.16);
}

.hero-win-rate-chart {
  flex: 1;
  height: 100%;
  min-height: 240px;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 10px;
}

.hero-win-rate-y-axis {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 0 0 52px;
  color: var(--text-tertiary);
  font-size: 11px;
  font-weight: 750;
  text-align: right;
}

.hero-win-rate-plot {
  position: relative;
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: grid;
}

.hero-win-rate-grid {
  position: absolute;
  inset: 0 0 52px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  pointer-events: none;
}

.hero-win-rate-grid span {
  height: 1px;
  background: var(--border-subtle);
}

.hero-win-rate-bars {
  position: relative;
  z-index: 1;
  min-width: 0;
  height: 100%;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(52px, 1fr);
  gap: 10px;
  align-items: end;
}

.hero-win-rate-column {
  min-width: 0;
  height: 100%;
  display: grid;
  grid-template-rows: minmax(0, 1fr) 48px;
  align-items: end;
  justify-items: center;
  gap: 6px;
  outline: none;
}

.hero-win-rate-column:focus-visible .hero-win-rate-avatar {
  border-color: rgba(var(--accent-rgb), 0.62);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.16);
}

.hero-win-bar-plot {
  width: min(42px, 70%);
  height: 100%;
  position: relative;
  overflow: visible;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  border-radius: 0;
}

.hero-win-bar-fill {
  width: 100%;
  height: var(--hero-win-rate);
  min-height: 4px;
  border-radius: 0;
  background: #4d9dff;
}

.hero-win-tooltip {
  position: absolute;
  left: 50%;
  bottom: min(calc(var(--hero-win-rate) + 8px), calc(100% - 22px));
  transform: translateX(-50%);
  min-width: 58px;
  display: grid;
  gap: 3px;
  opacity: 0;
  visibility: hidden;
  color: var(--text-primary);
  text-align: center;
  pointer-events: none;
  transition: opacity 0.14s ease, visibility 0.14s ease;
}

.hero-win-tooltip strong {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 850;
  line-height: 1;
}

.hero-win-tooltip em {
  color: var(--text-tertiary);
  font-size: 11px;
  font-style: normal;
  font-weight: 750;
  line-height: 1;
}

.hero-win-rate-column:hover .hero-win-tooltip,
.hero-win-rate-column:focus .hero-win-tooltip,
.hero-win-rate-column:focus-within .hero-win-tooltip {
  opacity: 1;
  visibility: visible;
}

.hero-win-rate-x-axis {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.hero-win-rate-avatar {
  width: 34px;
  height: 34px;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(212, 175, 55, 0.32);
  border-radius: 50%;
  background: rgba(var(--accent-rgb), 0.12);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 850;
}

.hero-win-rate-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hero-win-rate-games {
  color: var(--text-tertiary);
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
}

.rp-index-figure,
.rp-index-chart {
  min-width: 0;
  min-height: 0;
  flex: 1;
}

.rp-index-figure {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rp-index-chart {
  position: relative;
  min-height: 240px;
}

.rp-index-chart svg {
  display: block;
  width: 100%;
  min-height: 240px;
}

.hero-win-rate-figure.rp-index-wide .rp-index-chart,
.hero-win-rate-figure.rp-index-wide .rp-index-chart svg {
  min-height: 340px;
}

.rp-index-axis {
  stroke: rgba(var(--accent-rgb), 0.82);
  stroke-width: 1.6;
}

.rp-index-guide {
  stroke: rgba(255, 255, 255, 0.1);
  stroke-width: 1;
}

.rp-index-polyline {
  fill: none;
  stroke: #4d9dff;
  stroke-width: 2.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.rp-index-point {
  outline: none;
}

.rp-index-point-ring {
  fill: rgba(15, 23, 42, 0.9);
  stroke: rgba(255, 255, 255, 0.28);
  stroke-width: 1.2;
  filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.24));
}

.rp-index-point-ring.result-win {
  stroke: #4d9dff;
  stroke-width: 1.8;
}

.rp-index-point-ring.result-loss {
  stroke: #ff5c7a;
  stroke-width: 1.8;
}

.rp-index-point-ring.result-unknown {
  stroke: rgba(255, 255, 255, 0.28);
}

.rp-index-active-ring {
  fill: none;
  stroke: rgba(232, 221, 186, 0.72);
  stroke-width: 2.2;
  filter: drop-shadow(0 0 8px rgba(77, 157, 255, 0.32));
}

.rp-index-avatar {
  pointer-events: none;
}

.rp-index-dot {
  fill: #4d9dff;
}

.rp-index-hit {
  fill: transparent;
  cursor: pointer;
}

.rp-index-y-label,
.rp-index-x-label {
  fill: rgba(var(--accent-rgb), 0.82);
  font-weight: 850;
}

.rp-index-y-label {
  font-size: 12px;
}

.rp-index-x-label {
  font-size: 12px;
  text-anchor: middle;
}

.rp-index-hover-zone {
  min-width: 0;
  height: 42px;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 0;
  pointer-events: none;
}

.rp-index-hover-panel {
  position: static;
  height: 42px;
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(14, 15, 19, 0.86);
  color: #ffffff;
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.24);
  pointer-events: none;
}

.rp-index-hover-panel span {
  overflow: hidden;
  color: rgba(255, 255, 255, 0.86);
  font-size: 15px;
  font-weight: 850;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chart-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.report-list {
  grid-template-columns: 1fr;
  padding: 0;
  list-style: none;
}

.finding-item {
  position: relative;
  min-width: 0;
  padding: 0 0 13px;
  border-bottom: 1px solid var(--border-subtle);
}

.finding-item p {
  margin: 0;
}

.finding-copy {
  color: var(--text-primary);
  font-size: 24px;
  font-weight: 650;
  line-height: 1.65;
}

.final-summary {
  margin-top: 0;
  color: var(--text-primary);
  font-weight: 650;
}

.ai-report-prose {
  font-family: "Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", serif;
  font-weight: 500;
  line-height: 1.65;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.finding-item strong.ai-report-prose,
.final-summary.ai-report-prose {
  font-weight: 600;
}

@media (max-width: 860px) {
  .overview-layout,
  .hero-chip-list,
  .chart-grid {
    grid-template-columns: 1fr;
  }

  .hero-win-rate-figure {
    padding-left: 0;
    border-left: 0;
  }
}

@media (max-width: 620px) {
  .report-section {
    padding: 6px 0;
  }

  .overview-fact-row {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .hero-chip {
    grid-template-columns: 40px minmax(0, 1fr);
  }

  .hero-metrics {
    grid-column: 2;
    align-items: flex-start;
    flex-direction: row;
  }
}
</style>
