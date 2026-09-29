import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const viewUrl = new URL('./AiAnalysisView.vue', import.meta.url)
const oldAccountClientPattern = new RegExp(['rankpeek', '(Auth|Credits)Client'].join(''))
const oldPointCopyPattern = new RegExp([
  ['points', 'Balance'].join(''),
  ['points', 'Action'].join(''),
  ['billing', 'PointsDelta'].join('')
].join('|'))

function readRendererFile(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

function readViewSource() {
  assert.equal(existsSync(viewUrl), true)
  return readFileSync(viewUrl, 'utf8')
}

test('AI report center uses local provider and cost clients', () => {
  const source = readViewSource()

  assert.match(source, /getLocalAiSettings/)
  assert.match(source, /getLocalCostSummary/)
  assert.match(source, /getLocalAiCostUsageSummary/)
  assert.match(source, /localAiSettings/)
  assert.match(source, /localCostSummary/)
  assert.match(source, /aiCostUsageSummary/)
  assert.match(source, /displayedAiCostUsageSummary/)
  assert.match(source, /refreshLocalAiOverview/)
  assert.match(source, /aiAnalysis\.providerEnabled/)
  assert.match(source, /aiAnalysis\.costSummaryTitle/)
  assert.match(source, /aiAnalysis\.costUsageTitle/)
  assert.match(source, /aiAnalysis\.costUsageCoach/)
  assert.match(source, /aiAnalysis\.costUsagePregame/)
  assert.match(source, /aiAnalysis\.costUsagePostgame/)
  assert.match(source, /class="ai-cost-usage-grid"/)
  assert.doesNotMatch(source, /providerStatusTitle|provider:\s*localAiSettings\.value\.providerId/)
  assert.match(source, /\.league-account-showcase\s*\{[\s\S]*border-top:/)
  assert.doesNotMatch(source, /\.league-account-showcase\s*\{[\s\S]*border-bottom:/)
  assert.doesNotMatch(source, /manualCostShortcut|openManualCostShortcut|costManual|manualCostCny/)
  assert.doesNotMatch(source, /cost-mini-row|aiAnalysis\.costAi|aiAnalysis\.costTotal|aiCostCny/)

  assert.doesNotMatch(source, oldAccountClientPattern)
  assert.doesNotMatch(source, /RankPeekAuthSession|RankPeekCreditLedgerEntry/)
  assert.doesNotMatch(source, /getRankPeekCreditBalance|getRankPeekCreditLedger/)
  assert.doesNotMatch(source, oldPointCopyPattern)
})

test('AI report center keeps data notice inside hero copy and uses natural month costs', () => {
  const source = readViewSource()

  assert.match(
    source,
    /<div class="hero-copy">[\s\S]*<p>\{\{ t\('aiAnalysis\.subtitle'\) \}\}<\/p>\s*<p\s+v-if="placeholderNotice"\s+class="hero-notice"/
  )
  assert.doesNotMatch(source, /<\/section>\s*<p v-if="placeholderNotice" class="notice-line"/)
  assert.match(source, /const now = new Date\(\)/)
  assert.match(source, /const today = formatDateKey\(now\)/)
  assert.match(source, /const monthStart = formatDateKey\(new Date\(now\.getFullYear\(\), now\.getMonth\(\), 1\)\)/)
  assert.match(source, /const lastMonthStart = formatDateKey\(new Date\(now\.getFullYear\(\), now\.getMonth\(\) - 1, 1\)\)/)
  assert.match(source, /const lastMonthEnd = formatDateKey\(new Date\(now\.getFullYear\(\), now\.getMonth\(\), 0\)\)/)
  assert.match(source, /getLocalCostSummary\(\{ from: monthStart, to: today \}\)/)
  assert.match(source, /getLocalCostSummary\(\{ from: lastMonthStart, to: lastMonthEnd \}\)/)
  assert.match(source, /lastMonthLocalCostSummary/)
  assert.match(source, /lastMonthCostTotalLabel/)
  assert.match(source, /class="provider-status-row provider-info-line"/)
  assert.match(source, /class="account-showcase-item league-account-showcase provider-info-line"/)
  assert.match(source, /\.local-provider-card\s*\{[\s\S]*gap: 10px/)
})

test('AI report center notice and cost headings keep stable spacing', () => {
  const source = readViewSource()
  const heroNoticeStyles = source.match(/\.hero-notice\s*\{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(source, /\.hero-copy\s*\{[\s\S]*position: relative/)
  assert.match(source, /\.hero-notice\s*\{[\s\S]*position: absolute/)
  assert.match(source, /\.hero-notice\s*\{[\s\S]*top: 82px/)
  assert.match(source, /\.hero-notice\s*\{[\s\S]*margin: 0/)
  assert.match(heroNoticeStyles, /width:\s*fit-content/)
  assert.doesNotMatch(heroNoticeStyles, /right:\s*0/)
  assert.match(heroNoticeStyles, /padding:\s*0/)
  assert.match(heroNoticeStyles, /border:\s*0/)
  assert.match(heroNoticeStyles, /background:\s*transparent/)
  assert.match(source, /\.hero-notice::before\s*\{[\s\S]*border-radius:\s*999px/)
  assert.match(source, /\.local-cost-section\s*\{[\s\S]*margin-top: 24px/)
  assert.match(source, /\.recent-runs-heading\s*\{[\s\S]*margin: 16px 0/)
  assert.match(source, /\.billing-summary-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/)
})

test('AI report center keeps account-scoped local history and read-only postgame detail', () => {
  const source = readViewSource()
  const localAiAnalysis = readRendererFile('services/localAiAnalysis.ts')

  assert.match(source, /loadLocalAiAnalysisResults/)
  assert.match(source, /buildAccountAnalysisInputSnapshot/)
  assert.match(source, /gameStore\.currentSummoner/)
  assert.match(source, /accountPuuid/)
  assert.match(source, /reportTypeTabs = computed/)
  assert.match(source, /filteredAnalysisResults = computed/)
  assert.match(source, /PostgameAiAnalysisModal/)
  assert.match(source, /selectedPostgameReplayText/)
  assert.match(source, /startSavedPostgameReplay/)
  assert.match(source, /show-start-button="false"/)
  assert.match(localAiAnalysis, /postgameRun\?: PostgameAiRunOutputV1/)
})

test('AI report center opens coach reports from history cards', () => {
  const source = readViewSource()

  assert.match(source, /import CoachSummaryReportModal from '@\/components\/CoachSummaryReportModal\.vue'/)
  assert.match(source, /parseCoachSummaryReportOutput/)
  assert.match(source, /selectedCoachSummaryResult/)
  assert.match(source, /selectedCoachSummaryReport/)
  assert.match(source, /function openCoachReportDetail\(result: LocalAiAnalysisDisplayResult\)/)
  assert.match(source, /function canOpenReportDetail\(result: LocalAiAnalysisDisplayResult\)/)
  assert.match(source, /clickable: canOpenReportDetail\(result\)/)
  assert.match(source, /:tabindex="canOpenReportDetail\(result\) \? 0 : undefined"/)
  assert.match(source, /<CoachSummaryReportModal[\s\S]*:open="Boolean\(selectedCoachSummaryReport\)"[\s\S]*@close="closeCoachReportDetail"/)
})

test('AI report center replays saved postgame reports faster', () => {
  const source = readViewSource()

  assert.match(source, /const SAVED_POSTGAME_REPLAY_INITIAL_DELAY_MS = 80/)
  assert.match(source, /const SAVED_POSTGAME_REPLAY_TARGET_DURATION_MS = 3200/)
  assert.match(source, /const SAVED_POSTGAME_REPLAY_SENTENCE_DELAY_MS = 90/)
  assert.match(source, /const SAVED_POSTGAME_REPLAY_COMMA_DELAY_MS = 40/)
  assert.match(source, /const SAVED_POSTGAME_REPLAY_MIN_STEPS = 44/)
  assert.match(source, /const SAVED_POSTGAME_REPLAY_MAX_STEPS = 96/)
})

test('AI report center provides typed destructive deletion for local reports', () => {
  const source = readViewSource()
  const preload = readRendererFile('../preload/preload.ts')
  const rendererTypes = readRendererFile('types/localDatabase.ts')

  assert.match(source, /deleteFallbackAiAnalysisResultsByAccount/)
  assert.match(source, /deleteAnalysisResultsByAccount/)
  assert.match(source, /deleteReportDialogOpen/)
  assert.match(source, /selectedDeleteReportTypes/)
  assert.match(source, /toggleAllDeleteReportTypes/)
  assert.match(source, /deleteSelectedAnalysisReports/)
  assert.match(source, /aiAnalysis\.deleteReportsAction/)
  assert.match(source, /aiAnalysis\.deleteReportsPrompt/)
  assert.match(source, /aiAnalysis\.deleteReportsCoach/)
  assert.match(source, /aiAnalysis\.deleteReportsPostgame/)
  assert.match(source, /aiAnalysis\.deleteReportsPraise/)
  assert.match(source, /aiAnalysis\.deleteReportsSelectAll/)
  assert.match(source, /class="delete-report-dialog"/)
  assert.match(source, /class="delete-reports-button"/)
  assert.match(preload, /db:ai:deleteByAccount/)
  assert.match(rendererTypes, /deleteAnalysisResultsByAccount/)
})

test('AI report center local cost copy exists in both locales', () => {
  const zhCN = readRendererFile('i18n/locales/zh-CN.ts')
  const enUS = readRendererFile('i18n/locales/en-US.ts')

  for (const key of [
    'aiAnalysis.providerEnabled',
    'aiAnalysis.providerDisabled',
    'aiAnalysis.providerConfigureAction',
    'aiAnalysis.costSummaryTitle',
    'aiAnalysis.costToday',
    'aiAnalysis.costMonth',
    'aiAnalysis.costLastMonth',
    'aiAnalysis.costUsageTitle',
    'aiAnalysis.costUsageCoach',
    'aiAnalysis.costUsagePregame',
    'aiAnalysis.costUsagePostgame',
    'aiAnalysis.costUsageCount',
    'aiAnalysis.localCostUnavailable',
    'aiAnalysis.deleteReportsAction',
    'aiAnalysis.deleteReportsPrompt',
    'aiAnalysis.deleteReportsCoach',
    'aiAnalysis.deleteReportsPostgame',
    'aiAnalysis.deleteReportsPraise',
    'aiAnalysis.deleteReportsSelectAll',
    'aiAnalysis.deleteReportsConfirm',
    'aiAnalysis.deleteReportsCancel'
  ]) {
    assert.ok(zhCN.includes(`'${key}'`), `zh-CN should include ${key}`)
    assert.ok(enUS.includes(`'${key}'`), `en-US should include ${key}`)
  }
  for (const removedKey of [
    'aiAnalysis.providerStatusTitle',
    'aiAnalysis.costManual',
    'aiAnalysis.manualCostShortcut',
    'aiAnalysis.costAi',
    'aiAnalysis.costTotal'
  ]) {
    assert.equal(zhCN.includes(`'${removedKey}'`), false, `zh-CN should not include ${removedKey}`)
    assert.equal(enUS.includes(`'${removedKey}'`), false, `en-US should not include ${removedKey}`)
  }
  assert.match(zhCN, /'aiAnalysis\.providerEnabled': '模型：\{model\}'/)
  assert.match(enUS, /'aiAnalysis\.providerEnabled': 'Model: \{model\}'/)
  assert.match(zhCN, /'aiAnalysis\.costUsageTitle': 'AI 总消费'/)
  assert.match(enUS, /'aiAnalysis\.costUsageTitle': 'AI Total Spend'/)
  assert.equal(zhCN.includes('手动成本'), false, 'zh-CN should not mention manual costs')
  assert.equal(enUS.includes('Manual Cost'), false, 'en-US should not mention manual costs')
})
