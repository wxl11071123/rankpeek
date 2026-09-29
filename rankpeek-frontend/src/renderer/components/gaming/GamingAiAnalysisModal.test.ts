import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const modalUrl = new URL('./GamingAiAnalysisModal.vue', import.meta.url)

test('gaming AI analysis modal exposes accessible dialog structure and close controls', () => {
  assert.equal(existsSync(modalUrl), true)
  const source = readFileSync(modalUrl, 'utf8')

  assert.match(source, /role="dialog"/)
  assert.match(source, /aria-modal="true"/)
  assert.match(source, /aria-labelledby="gaming-ai-analysis-title"/)
  assert.match(source, /emit\('close'\)/)
  assert.match(source, /@click\.self="emitClose"/)
  assert.match(source, /event\.key === 'Escape'/)
  assert.match(source, /document\.addEventListener\('keydown', handleKeydown\)/)
  assert.match(source, /document\.removeEventListener\('keydown', handleKeydown\)/)
})

test('gaming AI analysis modal removes local rule preview copy and conclusions', () => {
  const source = readFileSync(modalUrl, 'utf8')

  assert.doesNotMatch(source, /AI 占位|本地规则预览/)
  assert.doesNotMatch(source, /RankPeek 分析/)
  assert.doesNotMatch(source, /点击开始分析后，将基于当前对战信息生成临时分析。/)
  assert.doesNotMatch(source, /本地规则预览，点击开始分析后才会发送临时 snapshot/)
  assert.doesNotMatch(source, /队友逐个分析/)
  assert.doesNotMatch(source, /本局队友风险摘要/)
  assert.doesNotMatch(source, /preview\.opening/)
  assert.doesNotMatch(source, /preview\.bullets/)
  assert.doesNotMatch(source, /preview\.laneAdvice/)
  assert.doesNotMatch(source, /player\.verdict/)
  assert.doesNotMatch(source, /player\.reason/)
})

test('gaming AI analysis modal keeps title, queue label, and manual start controls', () => {
  const source = readFileSync(modalUrl, 'utf8')

  assert.match(source, /queueLabel\?: string/)
  assert.match(source, /analysisEnabled\?: boolean/)
  assert.match(source, /\{\{ preview\?\.title \|\| fallbackTitle \}\}/)
  assert.match(source, /\{\{ queueLabel \|\| preview\?\.subtitle \|\| fallbackSubtitle \}\}/)
  assert.match(source, /开始分析/)
  assert.match(source, /分析中\.\.\./)
  assert.match(source, /@click="emitStartAnalysis"/)
  assert.match(source, /:disabled="analysisButtonDisabled"/)
  assert.match(source, /队友成分\/赛前分析只支持排位模式/)
  assert.doesNotMatch(source, /当前仅支持单双排位和灵活排位分析/)
})

test('gaming AI analysis modal renders current player basics before server verdicts', () => {
  const source = readFileSync(modalUrl, 'utf8')

  assert.match(source, /v-if="preview && preview\.players\.length"/)
  assert.match(source, /v-for="player in preview\.players"/)
  assert.match(source, /:key="player\.key"/)
  assert.match(source, /playerAvatarUrl\(player\)/)
  assert.match(source, /player\.name/)
  assert.match(source, /player\.rankText/)
  assert.match(source, /player\.kdaText/)
  assert.match(source, /player\.winRateText/)
  assert.match(source, /player\.damageRateText/)
  assert.match(source, /player\.sampleText/)
  assert.match(source, /当前队友|当前对手/)
  assert.doesNotMatch(source, /player\.verdict/)
  assert.doesNotMatch(source, /player\.reason/)
})

test('gaming AI analysis modal mounts structured player insights on the original player cards only', () => {
  const source = readFileSync(modalUrl, 'utf8')

  assert.match(source, /playerInsights\?: Record<string, GamingAiPlayerInsightEvent>/)
  assert.match(source, /playerVerdicts\?: Record<string, GamingAiPlayerStreamVerdict>/)
  assert.match(source, /const playerInsightByKey = computed/)
  assert.match(source, /playerInsightByKey\.value\[player\.key\]/)
  assert.match(source, /gaming-ai-analysis-insight/)
  assert.match(source, /gaming-ai-analysis-insight-label/)
  assert.match(source, /gaming-ai-analysis-insight-text/)
  assert.match(source, /gaming-ai-analysis-insight-loading/)
  assert.doesNotMatch(source, /const playerVerdictList = computed/)
  assert.doesNotMatch(source, /v-for="verdict in playerVerdictList"/)
  assert.doesNotMatch(source, /玩家判断/)
  assert.doesNotMatch(source, /服务器分析/)
  assert.doesNotMatch(source, /<pre v-if="streamText\.trim\(\)"/)
  assert.doesNotMatch(source, /稳定队友/)
})

test('gaming AI analysis modal uses server unavailable failure copy without local preview fallback', () => {
  const source = readFileSync(modalUrl, 'utf8')

  assert.match(source, /服务器暂不可用，请稍后再试。/)
  assert.doesNotMatch(source, /当前展示本地规则预览/)
})

test('gaming AI analysis modal has lightweight scrollable report styling', () => {
  const source = readFileSync(modalUrl, 'utf8')

  assert.match(source, /\.gaming-ai-analysis-overlay[\s\S]*position:\s*fixed/)
  // 全屏遮罩不再做背景模糊：低配机器上每帧都要重新采样背景
  assert.doesNotMatch(source, /backdrop-filter/)
  assert.match(source, /width:\s*min\(920px, calc\(100vw - 64px\)\)/)
  assert.match(source, /max-height:\s*calc\(100vh - 64px\)/)
  assert.match(source, /\.gaming-ai-analysis-body[\s\S]*overflow-y:\s*auto/)
  assert.match(source, /--bg-secondary/)
  assert.match(source, /--bg-tertiary/)
  assert.match(source, /--border-color/)
  assert.match(source, /--text-primary/)
  assert.match(source, /--text-secondary/)
  assert.match(source, /--accent-rgb/)
})

test('gaming AI analysis modal stays local-only without provider calls', () => {
  const source = readFileSync(modalUrl, 'utf8')

  assert.doesNotMatch(source, /DeepSeek|deepseek|OpenAI|真实 AI|fetch\(|axios|apiClient|serverAi/i)
  assert.doesNotMatch(source, /chart\.js|echarts/i)
})
