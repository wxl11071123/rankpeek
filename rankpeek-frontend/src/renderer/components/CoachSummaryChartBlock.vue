<script setup lang="ts">
import { computed } from 'vue'
import type { CoachSummaryChartDatum, NormalizedCoachSummaryChartBlock } from '@/types/coachSummaryReport'

const props = defineProps<{
  chart: NormalizedCoachSummaryChartBlock
}>()

interface BarRow {
  label: string
  value: number
  secondary?: string
}

interface LineSeries {
  key: string
  points: string
}

const supportedVisualKinds = new Set(['bar', 'line', 'table'])
const chartKindClassMap: Record<NormalizedCoachSummaryChartBlock['kind'], string> = {
  bar: 'chart-kind-bar',
  line: 'chart-kind-line',
  scatter: 'chart-kind-scatter',
  timeline: 'chart-kind-timeline',
  table: 'chart-kind-table'
}
const unsupportedChart = computed(() => !supportedVisualKinds.has(props.chart.kind))
const chartRows = computed(() => props.chart.data || [])
const hasData = computed(() => chartRows.value.length > 0)
const hasPendingDataRef = computed(() => !hasData.value && Boolean(props.chart.dataRef))
const chartNote = computed(() =>
  props.chart.interpretation ||
  props.chart.highlight ||
  props.chart.description ||
  props.chart.intent ||
  ''
)
const tableColumns = computed(() => {
  const keys = new Set<string>()
  chartRows.value.slice(0, 6).forEach(row => {
    Object.keys(row).forEach(key => keys.add(key))
  })
  return Array.from(keys).slice(0, 5)
})
const shouldShowTable = computed(() =>
  props.chart.kind === 'table' || unsupportedChart.value || (hasData.value && !canRenderVisual.value)
)
const canRenderVisual = computed(() => {
  if (!hasData.value) {
    return false
  }
  if (props.chart.kind === 'bar') {
    return barRows.value.length > 0
  }
  if (props.chart.kind === 'line') {
    return lineSeries.value.length > 0
  }
  return props.chart.kind === 'table'
})
const barRows = computed<BarRow[]>(() => {
  if (!hasData.value) {
    return []
  }

  const labelKey = props.chart.labelKey || props.chart.xKey || firstStringKey(chartRows.value)
  const valueKey = props.chart.valueKey || props.chart.yKeys?.[0] || firstNumberKey(chartRows.value)
  if (!labelKey || !valueKey) {
    return []
  }

  return chartRows.value.flatMap((row) => {
    const label = row[labelKey]
    const value = row[valueKey]
    if (typeof value !== 'number') {
      return []
    }
    return [{
      label: String(label ?? ''),
      value,
      secondary: valueKey === 'winRate' ? `${formatNumber(value)}%` : formatNumber(value)
    }]
  })
})
const barMax = computed(() => Math.max(...barRows.value.map(row => Math.abs(row.value)), 1))
const lineSeries = computed<LineSeries[]>(() => {
  if (!hasData.value) {
    return []
  }

  const yKeys = (props.chart.yKeys?.length ? props.chart.yKeys : [firstNumberKey(chartRows.value)])
    .filter((key): key is string => Boolean(key))
    .slice(0, 2)
  if (!yKeys.length) {
    return []
  }

  const rows = chartRows.value.slice(0, 20)
  return yKeys.flatMap((key) => {
    const values = rows.map(row => row[key]).filter((value): value is number => typeof value === 'number')
    if (!values.length) {
      return []
    }
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1
    const points = rows
      .map((row, index) => {
        const value = row[key]
        if (typeof value !== 'number') {
          return null
        }
        const x = rows.length === 1 ? 160 : 18 + (index / (rows.length - 1)) * 284
        const y = 102 - ((value - min) / range) * 76
        return `${round(x)},${round(y)}`
      })
      .filter((point): point is string => Boolean(point))
      .join(' ')
    return points ? [{ key, points }] : []
  })
})

function firstStringKey(rows: CoachSummaryChartDatum[]): string {
  return firstKeyOfType(rows, 'string')
}

function firstNumberKey(rows: CoachSummaryChartDatum[]): string {
  return firstKeyOfType(rows, 'number')
}

function firstKeyOfType(rows: CoachSummaryChartDatum[], type: 'string' | 'number'): string {
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === type) {
        return key
      }
    }
  }
  return ''
}

function formatCell(value: CoachSummaryChartDatum[string]): string {
  if (value === null || value === undefined) {
    return '-'
  }
  if (typeof value === 'number') {
    return formatNumber(value)
  }
  return String(value)
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
}

function round(value: number): number {
  return Number(value.toFixed(2))
}
</script>

<template>
  <article
    class="coach-chart-card"
    :class="[chartKindClassMap[chart.kind], { 'chart-unsupported': unsupportedChart }]"
  >
    <header class="chart-header">
      <div>
        <h4>{{ chart.title }}</h4>
        <p v-if="chart.intent">{{ chart.intent }}</p>
      </div>
      <span v-if="unsupportedChart" class="chart-chip">表格</span>
    </header>

    <div v-if="hasPendingDataRef" class="chart-empty">
      <strong>图表数据待接入</strong>
      <span>{{ chart.dataRef }}</span>
    </div>

    <div v-else-if="chart.kind === 'bar' && barRows.length" class="bar-chart">
      <div v-for="row in barRows" :key="row.label" class="bar-row">
        <span class="bar-label">{{ row.label }}</span>
        <span class="bar-track">
          <span class="bar-fill" :style="{ width: `${Math.min(Math.abs(row.value) / barMax, 1) * 100}%` }"></span>
        </span>
        <span class="bar-value">{{ row.secondary || row.value }}</span>
      </div>
    </div>

    <div v-else-if="chart.kind === 'line' && lineSeries.length" class="line-chart" aria-hidden="true">
      <svg viewBox="0 0 320 120" role="img">
        <path class="line-grid" d="M18 26H302M18 64H302M18 102H302" />
        <polyline
          v-for="series in lineSeries"
          :key="series.key"
          class="line-path"
          :points="series.points"
        />
      </svg>
      <div class="line-legend">
        <span v-for="series in lineSeries" :key="series.key">{{ series.key }}</span>
      </div>
    </div>

    <div v-else-if="shouldShowTable && tableColumns.length" class="table-chart">
      <table>
        <thead>
          <tr>
            <th v-for="column in tableColumns" :key="column">{{ column }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in chartRows.slice(0, 6)" :key="index">
            <td v-for="column in tableColumns" :key="column">{{ formatCell(row[column]) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="chart-empty compact">
      <strong>图表暂不可用</strong>
      <span>{{ chart.dataRef || chart.description || chart.intent || '暂无可渲染数据' }}</span>
    </div>

    <p v-if="chartNote" class="chart-note">{{ chartNote }}</p>
  </article>
</template>

<style scoped>
.coach-chart-card {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background:
    radial-gradient(circle at 18% 0%, rgba(var(--accent-rgb), 0.08), transparent 38%),
    var(--bg-tertiary);
}

.chart-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.chart-header h4 {
  margin: 0;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 750;
  line-height: 1.35;
}

.chart-header p,
.chart-note,
.chart-empty span {
  margin: 4px 0 0;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.45;
}

.chart-chip {
  flex: 0 0 auto;
  padding: 3px 7px;
  border-radius: var(--radius-sm);
  background: rgba(var(--accent-rgb), 0.12);
  color: var(--accent-color);
  font-size: 11px;
  font-weight: 700;
}

.bar-chart {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.bar-row {
  display: grid;
  grid-template-columns: minmax(58px, 0.9fr) minmax(90px, 2fr) minmax(42px, auto);
  align-items: center;
  gap: 9px;
}

.bar-label,
.bar-value {
  min-width: 0;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar-value {
  text-align: right;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.bar-track {
  height: 8px;
  overflow: hidden;
  border-radius: var(--radius-full);
  background: rgba(var(--accent-rgb), 0.12);
}

.bar-fill {
  display: block;
  height: 100%;
  min-width: 3px;
  border-radius: inherit;
  background: linear-gradient(90deg, rgba(var(--accent-rgb), 0.72), rgba(212, 167, 44, 0.78));
}

.line-chart svg {
  width: 100%;
  height: 120px;
  display: block;
}

.line-grid {
  fill: none;
  stroke: var(--border-subtle);
  stroke-width: 1;
}

.line-path {
  fill: none;
  stroke: var(--accent-color);
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.line-path:nth-of-type(3) {
  stroke: var(--gold-color);
}

.line-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.line-legend span {
  color: var(--text-tertiary);
  font-size: 11px;
  font-weight: 650;
}

.table-chart {
  overflow-x: auto;
}

.table-chart table {
  width: 100%;
  border-collapse: collapse;
}

.table-chart th,
.table-chart td {
  padding: 7px 8px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 12px;
  text-align: left;
  white-space: nowrap;
}

.table-chart th {
  color: var(--text-tertiary);
  font-weight: 700;
}

.chart-empty {
  min-height: 74px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  padding: 12px;
  border: 1px dashed var(--border-light);
  border-radius: var(--radius-md);
  background: rgba(var(--accent-rgb), 0.045);
}

.chart-empty strong {
  color: var(--text-secondary);
  font-size: 13px;
}

.chart-empty.compact {
  min-height: 62px;
}

.chart-note {
  margin-top: 12px;
  color: var(--text-secondary);
}
</style>
