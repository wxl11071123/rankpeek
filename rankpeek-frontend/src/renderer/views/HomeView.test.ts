import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function extractRule(source: string, selector: string) {
  const normalizedSource = source.replace(/\r\n/g, '\n')
  const start = normalizedSource.indexOf(selector)
  assert.notEqual(start, -1, `${selector} should exist`)

  const open = normalizedSource.indexOf('{', start)
  assert.notEqual(open, -1, `${selector} should have a body`)

  let depth = 0
  for (let index = open; index < normalizedSource.length; index += 1) {
    if (normalizedSource[index] === '{') {
      depth += 1
    }

    if (normalizedSource[index] === '}') {
      depth -= 1
      if (depth === 0) {
        return normalizedSource.slice(open + 1, index)
      }
    }
  }

  assert.fail(`${selector} should close`)
}

function extractLastRule(source: string, selector: string) {
  const normalizedSource = source.replace(/\r\n/g, '\n')
  const start = normalizedSource.lastIndexOf(selector)
  assert.notEqual(start, -1, `${selector} should exist`)

  const open = normalizedSource.indexOf('{', start)
  assert.notEqual(open, -1, `${selector} should have a body`)

  let depth = 0
  for (let index = open; index < normalizedSource.length; index += 1) {
    if (normalizedSource[index] === '{') {
      depth += 1
    }

    if (normalizedSource[index] === '}') {
      depth -= 1
      if (depth === 0) {
        return normalizedSource.slice(open + 1, index)
      }
    }
  }

  assert.fail(`${selector} should close`)
}

test('light-mode AI report keeps coach card internals while inheriting the home outer glow', () => {
  const source = readFileSync(new URL('./HomeView.vue', import.meta.url), 'utf8')
  const coachCards = readFileSync(new URL('../components/AICoachCards.vue', import.meta.url), 'utf8')
  const homeCoachRule = extractRule(source, ':global([data-theme="light"] .home-view .coach-report-panel .ai-coach-cards)')
  const coachLightRule = extractRule(coachCards, ':global([data-theme="light"] .ai-coach-cards)')
  const coachBaseRule = extractRule(coachCards, '.ai-coach-cards')

  assert.match(coachCards, /\.ai-coach-cards:hover \.record-main-card:not\(\.record-main-card-leaving\)/)
  assert.match(coachCards, /\.ai-coach-cards:hover \.record-stack-card/)
  assert.match(coachBaseRule, /--record-panel-border-hover:\s*var\(--home-module-hover-border, rgba\(96, 176, 255, 0\.48\)\)/)
  assert.match(coachBaseRule, /--record-panel-hover-shadow:\s*var\(\s*--home-module-hover-shadow,/)
  assert.match(homeCoachRule, /--record-panel-border-hover:\s*var\(--home-module-hover-border\)/)
  assert.match(homeCoachRule, /--record-panel-hover-shadow:\s*var\(--coach-report-hover-shadow\)/)
  assert.match(homeCoachRule, /--record-card-border-hover:\s*rgba\(41, 151, 255, 0\.42\)/)
  assert.match(coachLightRule, /--record-card-hover-shadow:/)
  assert.doesNotMatch(source, /coach-stack-card|coach-expanded-card/)
  assert.doesNotMatch(homeCoachRule, /--record-panel-border-hover:\s*rgba\(41, 151, 255/)
})

test('home modules have no static outer glow and share hover/focus glow variables', () => {
  const source = readFileSync(new URL('./HomeView.vue', import.meta.url), 'utf8')
  const rootRule = extractRule(source, '.home-view')
  const lightRootRule = extractRule(source, ':global([data-theme="light"] .home-view)')
  const baseRule = extractRule(source, '.account-panel,\n.ai-analysis-card,\n.fortune-card,\n.coach-report-panel')
  const hoverRule = extractRule(
    source,
    '.account-panel:hover,\n.account-panel:focus-within,\n.ai-analysis-card:hover,\n.ai-analysis-card:focus-within,\n.fortune-card:hover,\n.fortune-card:focus-within,\n.coach-report-panel:hover,\n.coach-report-panel:focus-within',
  )

  assert.match(rootRule, /--home-module-hover-rgb:\s*96, 176, 255/)
  assert.match(lightRootRule, /--home-module-hover-rgb:\s*86, 109, 134/)
  assert.match(baseRule, /background:\s*var\(--bg-secondary\)/)
  assert.match(baseRule, /border:\s*1px solid var\(--border-color\)/)
  assert.match(baseRule, /box-shadow:\s*none/)
  assert.match(baseRule, /border-radius:\s*12px/)
  assert.match(baseRule, /transition:\s*background 0\.3s ease, border-color 0\.3s ease, box-shadow 0\.3s ease/)
  assert.match(hoverRule, /border-color:\s*var\(--home-module-hover-border\)/)
  assert.match(hoverRule, /box-shadow:\s*var\(--home-module-hover-shadow\)/)
  assert.doesNotMatch(hoverRule, /home-ai-breathe/)
})

test('coach report panel keeps proximity glow above a reduced outer border shadow', () => {
  const source = readFileSync(new URL('./HomeView.vue', import.meta.url), 'utf8')
  const coachHoverRule = extractLastRule(source, '.coach-report-panel:hover,\n.coach-report-panel:focus-within')
  const coachNearRule = extractRule(source, ".coach-report-panel.surface-glow[data-near-glow='true']")
  const glowOverlayRule = extractRule(source, '.coach-report-panel.surface-glow::before')
  const coachCardsRule = extractRule(source, '.coach-report-panel :deep(.ai-coach-cards)')

  assert.match(source, /--coach-report-hover-shadow:/)
  assert.match(source, /--coach-report-near-shadow:/)
  assert.match(source, /--control-edge-width:\s*2px/)
  assert.match(source, /--control-edge-offset:\s*-2px/)
  assert.match(coachHoverRule, /box-shadow:\s*var\(--coach-report-hover-shadow\)/)
  assert.doesNotMatch(coachHoverRule, /--home-module-hover-shadow/)
  assert.match(coachNearRule, /box-shadow:\s*var\(--coach-report-near-shadow\)/)
  assert.match(glowOverlayRule, /z-index:\s*3/)
  assert.match(coachCardsRule, /position:\s*relative/)
  assert.match(coachCardsRule, /z-index:\s*1/)
  assert.match(coachCardsRule, /--record-panel-hover-shadow:\s*var\(--coach-report-hover-shadow\)/)
})

test('light home hover backgrounds do not tint account or coach interiors', () => {
  const source = readFileSync(new URL('./HomeView.vue', import.meta.url), 'utf8')
  const lightRootRule = extractRule(source, ':global([data-theme="light"] .home-view)')
  const accountBackgroundRule = extractRule(source, '.account-panel:hover,\n.account-panel:focus-within')
  const coachBackgroundRule = extractRule(
    source,
    '.ai-analysis-card:hover,\n.ai-analysis-card:focus-within,\n.fortune-card:hover,\n.fortune-card:focus-within,\n.coach-report-panel:hover,\n.coach-report-panel:focus-within',
  )
  const outerGlowRule = extractRule(
    source,
    '.account-panel:hover,\n.account-panel:focus-within,\n.ai-analysis-card:hover,\n.ai-analysis-card:focus-within,\n.fortune-card:hover,\n.fortune-card:focus-within,\n.coach-report-panel:hover,\n.coach-report-panel:focus-within',
  )

  assert.match(lightRootRule, /--home-panel-hover-bg:\s*var\(--bg-secondary\)/)
  assert.match(lightRootRule, /--home-ai-hover-bg:\s*var\(--bg-secondary\)/)
  assert.match(accountBackgroundRule, /background:\s*var\(--home-panel-hover-bg\)/)
  assert.match(coachBackgroundRule, /background:\s*var\(--home-ai-hover-bg\)/)
  assert.match(outerGlowRule, /box-shadow:\s*var\(--home-module-hover-shadow\)/)
  assert.doesNotMatch(outerGlowRule, /inset|radial-gradient|linear-gradient/)
})

test('light fortune card keeps neutral fills with the shared blue edge highlight', () => {
  const source = readFileSync(new URL('./HomeView.vue', import.meta.url), 'utf8')
  const fortuneRule = extractRule(source, ':global([data-theme="light"] .home-view .fortune-card)')
  const disabledRule = extractRule(source, '.primary-btn:disabled,\n.secondary-btn:disabled,\n.fortune-button:disabled')

  assert.match(fortuneRule, /--home-control-bg-hover:\s*rgba\(245, 246, 248, 0\.98\)/)
  assert.match(fortuneRule, /--home-control-bg-active:\s*rgba\(229, 231, 235, 0\.94\)/)
  assert.match(fortuneRule, /--home-ai-hover-bg:\s*var\(--bg-secondary\)/)
  assert.match(fortuneRule, /--slot-window-bg:\s*linear-gradient\(180deg, rgba\(255, 255, 255, 0\.98\), rgba\(246, 247, 249, 0\.94\)\)/)
  assert.match(fortuneRule, /--slot-window-bottom-fade:\s*linear-gradient\(0deg, rgba\(229, 231, 235, 0\.34\), transparent\)/)
  assert.match(fortuneRule, /--home-control-edge-rgb:\s*78, 215, 255/)
  assert.match(fortuneRule, /--slot-edge-rgb:\s*78, 215, 255/)
  assert.match(fortuneRule, /--slot-reel-shadow:\s*none/)
  assert.doesNotMatch(fortuneRule, /232,\s*248,\s*255|203,\s*238,\s*255|#147fbf/i)
  assert.doesNotMatch(disabledRule, /background|linear-gradient|33,\s*196,\s*255|41,\s*151,\s*255/)
})

test('home refresh account button keeps its busy-state guard', () => {
  const source = readFileSync(new URL('./HomeView.vue', import.meta.url), 'utf8')
  const refreshFunction = source.match(/async function handleRefreshAccount\(\) \{[\s\S]*?\n\}/)?.[0] || ''

  // The shared RefreshIconButton was replaced by a labelled primary button in fb98eea; the
  // busy-state contract below is what this test actually guards.
  assert.match(source, /<button[\s\S]{0,200}class="primary-btn control-glow"[\s\S]{0,200}:disabled="accountRefreshBusy"[\s\S]{0,200}@click="handleRefreshAccount"/)
  assert.match(source, /accountRefreshBusy \? t\('common\.refreshing'\) : t\('common\.refreshConnection'\)/)
  assert.match(source, /const accountRefreshBusy = ref\(false\)/)
  assert.doesNotMatch(source, /@click="gameStore\.refreshSummoner"/)
  assert.match(refreshFunction, /if \(accountRefreshBusy\.value\) \{[\s\S]*return[\s\S]*\}/)
  assert.match(refreshFunction, /accountRefreshBusy\.value = true[\s\S]*await gameStore\.refreshSummoner\(\)[\s\S]*finally[\s\S]*accountRefreshBusy\.value = false/)
})

test('home analyze button generates and saves a real coach summary report', () => {
  const source = readFileSync(new URL('./HomeView.vue', import.meta.url), 'utf8')
  const runAnalysisFunction = source.match(/async function runAnalysis\(\) \{[\s\S]*?\n\}/)?.[0] || ''

  assert.doesNotMatch(source, /AI 分析功能即将接入|敬请期待|AI_COACH_NOTICE/)
  assert.match(source, /import \{[\s\S]*prepareCoachSummaryGeneration[\s\S]*\} from '@\/services\/coachSummaryInputSnapshot'/)
  assert.doesNotMatch(source, /buildCoachSummaryReportCardTitle/)
  assert.match(source, /import \{ buildCoachSummaryPromptPayload \} from '@\/services\/coachSummaryPrompt'/)
  assert.match(source, /import \{[\s\S]*generateCoachSummaryReport[\s\S]*\} from '@\/services\/coachSummaryAiClient'/)
  assert.match(source, /import \{ estimatePostgameAiTokenCostCny \} from '@\/services\/postgameAiServerStream'/)
  assert.match(source, /buildCoachSummaryReportOverview/)
  assert.match(source, /import \{ coachAnalysisBusy, nextRunAnalysisSerial, getRunAnalysisSerial \} from '\.\/coachAnalysisState'/)
  assert.match(source, /async function runAnalysis\(\)/)
  assert.match(source, /prepareCoachSummaryGeneration\(\{[\s\S]*accountPuuid: puuid[\s\S]*\}\)/)
  assert.doesNotMatch(source, /ignorePriorCoachSummary|event\?\.shiftKey/)
  assert.match(source, /buildCoachSummaryPromptPayload\(\{[\s\S]*snapshot: result\.snapshot[\s\S]*\}\)/)
  assert.doesNotMatch(source, /historicalCoachContext|buildCoachSummaryHistoricalContext/)
  assert.match(source, /console\.info\('RankPeek coach_summary prompt payload ready:', promptPayload\)/)
  assert.match(source, /generateCoachSummaryReport\(\{[\s\S]*inputHash: result\.snapshot\.inputHash[\s\S]*snapshotSchemaVersion: result\.snapshot\.schemaVersion[\s\S]*dataQualityConfidence: result\.snapshot\.dataQuality\.confidence[\s\S]*promptPayload[\s\S]*\}\)/)
  assert.match(source, /parseCoachSummaryReportOutput\(JSON\.stringify\(reportWithLocalOverview\)\)/)
  assert.match(source, /const localOverview = buildCoachSummaryReportOverview\(result\.snapshot\)/)
  assert.match(source, /const aiOverview = aiResult\.report\.overview/)
  assert.match(source, /summary:\s*aiOverview\?\.summary \|\| aiResult\.report\.summary/)
  assert.doesNotMatch(source, /overview:\s*buildCoachSummaryReportOverview\(result\.snapshot\)/)
  assert.doesNotMatch(source, /cardTitle:\s*aiResult\.report\.cardTitle \|\| buildCoachSummaryReportCardTitle\(result\.snapshot\)/)
  assert.match(source, /metadata:\s*\{[\s\S]*\.\.\.aiResult\.report\.metadata[\s\S]*generatedInputAt:\s*result\.snapshot\.metadata\.generatedInputAt[\s\S]*latestMatchTimestamp:\s*result\.snapshot\.metadata\.latestMatchTimestamp[\s\S]*latestMatchRef:\s*result\.snapshot\.metadata\.latestMatchRef[\s\S]*\}/)
  assert.match(source, /addCoachSummaryUsageMetadata\(parsed\.report, aiResult\.usage\)/)
  assert.match(source, /console\.info\('RankPeek coach_summary token usage:'/)
  assert.match(source, /database\.saveAnalysisResult\(\{[\s\S]*accountPuuid: puuid[\s\S]*analysisType: 'coach_summary'[\s\S]*subjectKey: `coach_summary:\$\{result\.snapshot\.inputHash\}`[\s\S]*outputJson: report[\s\S]*\}\)/)
  assert.match(source, /await refreshLocalCoachReports\(\)/)
  assert.match(source, /openCoachReportModal\(report, \{[\s\S]*createdAt: saved\.data\.createdAt[\s\S]*\}\)/)
  assert.match(source, /AI_COACH_PREPARING_NOTICE/)
  assert.match(source, /AI_COACH_GENERATING_NOTICE/)
  assert.match(source, /AI_COACH_GENERATED_NOTICE/)
  assert.match(source, /AI_COACH_SERVER_ERROR_NOTICE/)
  assert.match(source, /AI_COACH_PARTIAL_TIMELINE_NOTICE/)
  assert.match(source, /AI_COACH_SNAPSHOT_INTEGRITY_FAILED_NOTICE/)
  assert.match(source, /result\.status === 'snapshot_integrity_failed'/)
  assert.match(source, /onHydrationProgress: \(progress\) =>/)
  assert.match(source, /setCoachProgressNotice\(`正在补全第 \$\{progress\.current\}\/\$\{progress\.total\} 局对局详情\.\.\.`\)/)
  assert.match(source, /console\.info\('RankPeek coach_summary input snapshot ready:', result\.snapshot\)/)
  assert.match(source, /showCoachNotice\(result\.message\)/)
  assert.match(source, /AI_COACH_ACCOUNT_MISSING_NOTICE/)
  assert.match(source, /:disabled="coachAnalysisBusy"/)
  assert.doesNotMatch(runAnalysisFunction, /saveServerAiFinalResultToLocal|router\.push|name: 'ai-analysis'/)
})

test('home auto analysis switch schedules real coach summary generation', () => {
  const source = readFileSync(new URL('./HomeView.vue', import.meta.url), 'utf8')

  assert.match(source, /let lastAutoAnalysisAttemptKey = ''/)
  assert.match(source, /onMounted\(\(\) => \{[\s\S]*void loadLocalHomeState\(\)/)
  assert.match(source, /watch\(accountKey, \(\) => \{[\s\S]*void loadLocalHomeState\(\)/)
  assert.match(source, /watch\(accountConnected, \(connected\) => \{[\s\S]*void maybeRunAutoAnalysis\('load'\)/)
  assert.match(source, /async function loadLocalHomeState\(\)[\s\S]*await refreshLocalCoachReports\(\)[\s\S]*void maybeRunAutoAnalysis\('load'\)/)
  assert.match(source, /function toggleAutoAnalysis\(\) \{[\s\S]*saveAutoAnalysisSettings\(accountKey\.value, autoAnalysis\.value\)[\s\S]*lastAutoAnalysisAttemptKey = ''[\s\S]*void maybeRunAutoAnalysis\('toggle', \{ force: true \}\)/)
  assert.match(source, /async function maybeRunAutoAnalysis\([\s\S]*autoAnalysis\.value\.enabled[\s\S]*accountConnected\.value[\s\S]*coachAnalysisBusy\.value[\s\S]*buildAutoAnalysisAttemptKey\(\)[\s\S]*lastAutoAnalysisAttemptKey = attemptKey[\s\S]*await runAnalysis\(\)/)
})

test('home coach report cards load local coach summaries and open report modal by id', () => {
  const source = readFileSync(new URL('./HomeView.vue', import.meta.url), 'utf8')
  const openFunction = source.match(/async function openCoachReport\([\s\S]*?\n\}/)?.[0] || ''

  assert.match(source, /import CoachSummaryReportModal from '@\/components\/CoachSummaryReportModal\.vue'/)
  assert.match(source, /loadLocalAiAnalysisResults/)
  assert.match(source, /analysisType:\s*'coach_summary'/)
  assert.match(source, /limit:\s*6/)
  assert.match(source, /onMounted\(\(\) => \{[\s\S]*loadLocalHomeState\(\)/)
  assert.match(source, /<AICoachCards[\s\S]*:reports="coachReports"[\s\S]*@open-report="openCoachReport"/)
  assert.match(source, /const coachReportModalOpen = ref\(false\)/)
  assert.match(source, /const activeCoachReport = ref<CoachSummaryReportV1 \| null>\(null\)/)
  assert.match(source, /async function openCoachReport\(/)
  assert.match(source, /getAnalysisResultById\(Number\(report\.id\)\)/)
  assert.match(source, /parseCoachSummaryReportOutput\(result\.data\.outputJson\)/)
  assert.match(source, /<CoachSummaryReportModal[\s\S]*:open="coachReportModalOpen"[\s\S]*:report="activeCoachReport"[\s\S]*@close="closeCoachReportModal"/)
  assert.doesNotMatch(openFunction, /router\.push|name:\s*'CoachSummaryReport'|\/reports/)
  assert.doesNotMatch(source, /listMatchRecordsByAccount|getMatchDetail|getGameDetail|getGameTimeline|findAnalysisByInputHash/)
})

test('home wires coach report modal navigation to the current local reports list', () => {
  const source = readFileSync(new URL('./HomeView.vue', import.meta.url), 'utf8')

  assert.match(source, /const activeCoachReportIndex = ref\(-1\)/)
  assert.match(source, /async function openCoachReport\(report: HomeCoachReport \| null, index: number\)/)
  assert.match(source, /activeCoachReportIndex\.value = index/)
  assert.match(source, /async function openCoachReportAtIndex\(index: number\)/)
  assert.match(source, /function navigateCoachReport\(delta: number\)/)
  assert.match(source, /coachReports\.value\.length/)
  assert.match(source, /openCoachReportAtIndex\(nextIndex\)/)
  assert.match(source, /:can-navigate="coachReports\.length > 1 && !coachReportPreview"/)
  assert.match(source, /:active-index="activeCoachReportIndex"/)
  assert.match(source, /:report-count="coachReports\.length"/)
  assert.match(source, /@previous="navigateCoachReport\(-1\)"/)
  assert.match(source, /@next="navigateCoachReport\(1\)"/)
})

test('home dev placeholder opens the dev report preview without saving a fake report', () => {
  const source = readFileSync(new URL('./HomeView.vue', import.meta.url), 'utf8')
  const openFunction = source.match(/async function openCoachReport\([\s\S]*?\n\}/)?.[0] || ''

  assert.match(source, /import \{ DEV_COACH_SUMMARY_REPORT_PREVIEW \} from '@\/services\/coachSummaryReportPreview'/)
  assert.match(openFunction, /if \(!report\?\.id\) \{[\s\S]*if \(import\.meta\.env\.DEV\) \{[\s\S]*openCoachReportModal\(DEV_COACH_SUMMARY_REPORT_PREVIEW, \{ preview: true \}\)/)
  assert.doesNotMatch(source, /showCoachNotice\(\)/)
  assert.match(source, /function closeCoachReportModal\(\)/)
  assert.match(source, /coachReportModalOpen\.value = false/)
  assert.doesNotMatch(openFunction, /saveAnalysisResult|saveServerAiFinalResultToLocal|router\.push/)
})

test('home rank badges show loading or failure instead of immediate unranked fallback', () => {
  const source = readFileSync(new URL('./HomeView.vue', import.meta.url), 'utf8')

  assert.match(source, /const accountRankStatus = computed<RankLoadStatus>/)
  assert.match(source, /gameStore\.rankLoading[\s\S]*return 'loading'/)
  assert.match(source, /gameStore\.rankError \? 'error' : 'loaded'/)
  assert.match(source, /formatRankTierPart\(soloRank, accountRankStatus\)/)
  assert.match(source, /formatRankTierPart\(flexRank, accountRankStatus\)/)
  assert.match(source, /status === 'loading'[\s\S]*t\('overview\.rankLoading'\)/)
  assert.match(source, /status === 'error'[\s\S]*t\('overview\.rankFailed'\)/)
})

test('home fortune draw uses the stable local-date daily fortune key', () => {
  const source = readFileSync(new URL('./HomeView.vue', import.meta.url), 'utf8')
  const drawFunction = source.match(/function drawFortune\(\) \{[\s\S]*?\n\}/)?.[0] || ''

  assert.doesNotMatch(drawFunction, /TEMP: disable daily fortune limit/)
  assert.doesNotMatch(drawFunction, /iterationKey/)
  assert.doesNotMatch(drawFunction, /new Date\(\)\.toISOString\(\)/)
  assert.match(drawFunction, /drawDailyFortune\(fortuneRecord\.value\)/)
  assert.match(source, /:disabled="fortuneRolling \|\| fortuneAlreadyDrawn"/)
  assert.match(source, /t\('home\.fortuneOnceDaily'\)[\s\S]*t\('home\.fortuneDisclaimer'\)/)
})
