import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const viewUrl = new URL('./CoachSummaryReportView.vue', import.meta.url)
const previewUrl = new URL('../services/coachSummaryReportPreview.ts', import.meta.url)

function readRendererFile(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('coach summary report route is wired to /reports/:id', () => {
  const router = readRendererFile('router/index.ts')

  assert.match(router, /path:\s*'\/reports\/:id'/)
  assert.match(router, /name:\s*'CoachSummaryReport'/)
  assert.match(router, /import\('@\/views\/CoachSummaryReportView\.vue'\)/)
  assert.match(router, /titleKey:\s*'nav\.aiAnalysis'/)
})

test('coach summary report view delegates report body to shared content component', () => {
  assert.equal(existsSync(viewUrl), true)
  const source = readFileSync(viewUrl, 'utf8')
  const content = readRendererFile('components/CoachSummaryReportContent.vue')

  assert.match(source, /import CoachSummaryReportContent from '@\/components\/CoachSummaryReportContent\.vue'/)
  assert.match(source, /<CoachSummaryReportContent/)
  assert.match(content, /近 20 局概览/)
  assert.match(content, /数据分析/)
  assert.match(content, /数据总结/)
  assert.doesNotMatch(content, /AI 分析内容|AI 总结|下一阶段训练重点/)
  assert.equal((content.match(/<section[\s\S]*?class="report-section/g) || []).length, 3)
  assert.doesNotMatch(source, /本地复盘档案|玩家复盘档案/)
})

test('coach summary report view only reads the selected local AI result by id', () => {
  const source = readFileSync(viewUrl, 'utf8')

  assert.match(source, /useRoute/)
  assert.match(source, /const rawId = String\(route\.params\.id \?\? ''\)/)
  assert.match(source, /const id = Number\(rawId\)/)
  assert.match(source, /getAnalysisResultById\(id\)/)
  assert.match(source, /parseCoachSummaryReportOutput\(result\.data\.outputJson\)/)
  assert.doesNotMatch(source, /listMatchRecordsByAccount|getMatchDetail|findAnalysisByInputHash|prepareCoachSummaryGeneration|ensureCoachSummarySgpHydration/)
  assert.doesNotMatch(source, /DeepSeek|Kimi|OpenAI|fetch\(|axios|\/api\/.*ai/i)
})

test('coach summary report view supports a DEV-only preview fixture', () => {
  assert.equal(existsSync(previewUrl), true)
  const source = readFileSync(viewUrl, 'utf8')
  const preview = readFileSync(previewUrl, 'utf8')

  assert.match(source, /import \{ DEV_COACH_SUMMARY_REPORT_PREVIEW \} from '@\/services\/coachSummaryReportPreview'/)
  assert.match(source, /const COACH_SUMMARY_DEV_PREVIEW_ID = 'dev-preview'/)
  assert.match(source, /rawId === COACH_SUMMARY_DEV_PREVIEW_ID && import\.meta\.env\.DEV/)
  assert.match(source, /report\.value = DEV_COACH_SUMMARY_REPORT_PREVIEW/)
  assert.match(preview, /schemaVersion:\s*'coach_summary_report\.v1'/)
  assert.match(preview, /analysisType:\s*'coach_summary'/)
  assert.match(preview, /totalMatches:\s*20/)
  assert.match(preview, /贝蕾亚/)
  assert.match(preview, /纳亚菲利/)
  assert.match(preview, /凯隐/)
  assert.match(preview, /希瓦娜/)
  assert.match(preview, /finalSummary:\s*'中期团战筑造优势。'/)
  assert.doesNotMatch(preview, /finalSummary:\s*'开发预览/)
  assert.equal((preview.match(/placement:\s*'(overview|analysis|summary)'/g) || []).length, 3)
})

test('coach summary report view no longer shows a return-home button', () => {
  const source = readFileSync(viewUrl, 'utf8')

  assert.doesNotMatch(source, /返回首页|back-button|goHome|router\.push\('/)
})

test('coach summary report content only keeps chart blocks in the overview section', () => {
  const source = readRendererFile('components/CoachSummaryReportContent.vue')

  assert.match(source, /overviewCharts/)
  assert.match(source, /MAX_REPORT_CHARTS\s*=\s*3/)
  assert.match(source, /placement === 'overview'/)
  assert.match(source, /CoachSummaryChartBlock/)
  assert.doesNotMatch(source, /analysisCharts|summaryCharts/)
  assert.doesNotMatch(source, /placement === 'analysis'|placement === 'summary'/)
  assert.doesNotMatch(source, /trainingPlan|training-list|training-item|item\.task|item\.target/)
})

test('coach summary chart component supports bar, line, table, dataRef fallback, and unsupported fallback', () => {
  const source = readRendererFile('components/CoachSummaryChartBlock.vue')

  assert.match(source, /chart-kind-bar/)
  assert.match(source, /chart-kind-line/)
  assert.match(source, /chart-kind-table/)
  assert.match(source, /图表数据待接入/)
  assert.match(source, /unsupportedChart/)
  assert.match(source, /svg/)
  assert.doesNotMatch(source, /echarts|chart\.js|highcharts|d3/i)
})

test('coach summary report content handles unsupported or malformed reports gracefully', () => {
  const source = readRendererFile('components/CoachSummaryReportContent.vue')

  assert.match(source, /暂不支持该报告类型/)
  assert.match(source, /报告内容暂时无法解析/)
  assert.match(source, /reportLoadState/)
})
