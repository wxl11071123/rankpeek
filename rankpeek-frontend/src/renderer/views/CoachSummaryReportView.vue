<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import CoachSummaryReportContent from '@/components/CoachSummaryReportContent.vue'
import {
  getCoachReportHeadline,
  parseCoachSummaryReportOutput
} from '@/services/localAiAnalysis'
import { DEV_COACH_SUMMARY_REPORT_PREVIEW } from '@/services/coachSummaryReportPreview'
import type { AiAnalysisResult } from '@/types/localDatabase'
import type { CoachSummaryReportV1 } from '@/types/coachSummaryReport'

const COACH_SUMMARY_DEV_PREVIEW_ID = 'dev-preview'

type ReportLoadState = 'loading' | 'ready' | 'missing' | 'unsupported' | 'invalid' | 'error'

const route = useRoute()
const reportLoadState = ref<ReportLoadState>('loading')
const report = ref<CoachSummaryReportV1 | null>(null)
const analysisResult = ref<AiAnalysisResult | null>(null)
const errorMessage = ref('')
let requestSerial = 0

const reportHeadline = computed(() => getCoachReportHeadline({ report: report.value }))

onMounted(() => {
  void loadReport()
})

watch(
  () => route.params.id,
  () => {
    void loadReport()
  }
)

async function loadReport() {
  const requestId = ++requestSerial
  const rawId = String(route.params.id ?? '')
  const id = Number(rawId)
  reportLoadState.value = 'loading'
  report.value = null
  analysisResult.value = null
  errorMessage.value = ''

  if (rawId === COACH_SUMMARY_DEV_PREVIEW_ID && import.meta.env.DEV) {
    report.value = DEV_COACH_SUMMARY_REPORT_PREVIEW
    reportLoadState.value = 'ready'
    return
  }

  if (!Number.isInteger(id) || id <= 0) {
    reportLoadState.value = 'invalid'
    errorMessage.value = '报告编号无效'
    return
  }

  const database = window.electronAPI?.database
  if (!database) {
    reportLoadState.value = 'error'
    errorMessage.value = '本地报告库暂不可用'
    return
  }

  try {
    const result = await database.getAnalysisResultById(id)
    if (requestId !== requestSerial) {
      return
    }
    if (!result.success) {
      reportLoadState.value = 'error'
      errorMessage.value = result.error
      return
    }
    if (!result.data) {
      reportLoadState.value = 'missing'
      errorMessage.value = '没有找到这份报告'
      return
    }

    analysisResult.value = result.data
    const parsed = parseCoachSummaryReportOutput(result.data.outputJson)
    if (parsed.status === 'parsed' && parsed.report) {
      report.value = parsed.report
      reportLoadState.value = 'ready'
      return
    }

    reportLoadState.value = parsed.status === 'unsupported' ? 'unsupported' : 'invalid'
    errorMessage.value = parsed.status === 'unsupported' ? '暂不支持该报告类型' : '报告内容暂时无法解析'
  } catch (error) {
    if (requestId !== requestSerial) {
      return
    }
    reportLoadState.value = 'error'
    errorMessage.value = error instanceof Error ? error.message : String(error)
  }
}
</script>

<template>
  <div class="coach-report-view">
    <header class="report-header">
      <p class="report-kicker">AI 复盘报告</p>
      <h1>{{ reportLoadState === 'ready' ? reportHeadline : '复盘报告' }}</h1>
      <p v-if="report" class="report-subtitle">{{ report.summary }}</p>
      <p v-else class="report-subtitle">{{ errorMessage || '正在读取本地报告...' }}</p>
    </header>

    <CoachSummaryReportContent
      :report="report"
      :report-load-state="reportLoadState"
      :error-message="errorMessage"
      :created-at="analysisResult?.createdAt ?? null"
      mode="page"
    />
  </div>
</template>

<style scoped>
.coach-report-view {
  max-width: 1120px;
  margin: 0 auto;
  padding-bottom: 36px;
}

.report-header {
  margin-bottom: 18px;
}

.report-kicker {
  margin: 0 0 4px;
  color: var(--accent-color);
  font-size: 12px;
  font-weight: 750;
}

.report-header h1 {
  margin: 0;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: 0;
}

.report-subtitle {
  max-width: 760px;
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.55;
}
</style>
