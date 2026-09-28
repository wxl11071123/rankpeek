import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const modalUrl = new URL('./PostgameAiAnalysisModal.vue', import.meta.url)

test('postgame AI analysis modal compiles partial review JSON instead of showing raw JSON while streaming', () => {
  assert.equal(existsSync(modalUrl), true)
  const source = readFileSync(modalUrl, 'utf8')

  assert.match(source, /parsePartialPostgameAiStructuredResult/)
  assert.match(source, /displayedPostgameReview/)
  assert.match(source, /partialPostgameReview/)
  assert.match(source, /v-if="displayedPostgameReview"/)
  assert.match(source, /v-if="structuredPostgameReview"[\s\S]*class="postgame-ai-analysis-share"/)
  assert.match(source, /v-else-if="hasStreamOutput && mode === 'review'"/)
  assert.match(source, /v-else-if="hasStreamOutput && streamText && mode !== 'review' && mode !== 'praise'"/)
})

test('postgame AI analysis modal exposes review and praise copy with clickable start button', () => {
  assert.equal(existsSync(modalUrl), true)
  const source = readFileSync(modalUrl, 'utf8')

  assert.match(source, /type PostgameAiAnalysisMode = 'review' \| 'praise'/)
  assert.match(source, /type PostgameAiStreamState = 'idle' \| 'preparing' \| 'streaming' \| 'completed' \| 'failed'/)
  assert.match(source, /open: boolean/)
  assert.match(source, /mode\?: PostgameAiAnalysisMode/)
  assert.match(source, /streamState\?: PostgameAiStreamState/)
  assert.match(source, /streamText\?: string/)
  assert.match(source, /streamError\?: string/)
  assert.doesNotMatch(source, /PostgameAiTokenUsage/)
  assert.doesNotMatch(source, /streamUsage\?:/)
  assert.match(source, /championIdByName\?: Record<string, number>/)
  assert.match(source, /mode: 'review'/)
  assert.match(source, /streamState: 'idle'/)
  assert.match(source, /const modalTitle = computed/)
  assert.match(source, /const modalDescription = computed/)
  assert.match(source, /从夯到拉排位表会按 5 档展示 10 个玩家，并把客观总结一起放进可分享图片。/)
  assert.match(source, /<p>\{\{ modalDescription \}\}<\/p>/)
  assert.match(source, /const primaryButtonText = computed/)
  assert.match(source, /emit\('start-analysis'\)/)
  assert.match(source, /class="postgame-ai-analysis-start"[\s\S]*:disabled="isBusy"[\s\S]*@click="emitStartAnalysis"[\s\S]*\{\{ primaryButtonText \}\}/)
  assert.doesNotMatch(source, /apiClient|fetch\(|axios|DeepSeek|deepseek|build.*Snapshot|streamGaming|sqlite|localMatchCache/i)
})

test('postgame AI analysis modal shows streaming text and failed errors', () => {
  assert.equal(existsSync(modalUrl), true)
  const source = readFileSync(modalUrl, 'utf8')

  assert.match(source, /props\.streamState === 'streaming' \|\| props\.streamState === 'completed'/)
  assert.match(source, /class="postgame-ai-analysis-stream-text"[\s\S]*streamText/)
  assert.doesNotMatch(source, /class="postgame-ai-token-usage"/)
  assert.doesNotMatch(source, /Token 用量/)
  assert.doesNotMatch(source, /缓存命中/)
  assert.doesNotMatch(source, /估算成本/)
  assert.doesNotMatch(source, /大陆 API 人民币价格/)
  assert.match(source, /props\.streamState === 'failed'/)
  assert.match(source, /class="postgame-ai-analysis-error"[\s\S]*streamError/)
  assert.doesNotMatch(source, /class="postgame-ai-analysis-status"/)
  assert.doesNotMatch(source, /正在展开分析内容/)
  assert.doesNotMatch(source, /mock stream/)
})

test('postgame AI analysis modal renders praise as a single friend note', () => {
  assert.equal(existsSync(modalUrl), true)
  const source = readFileSync(modalUrl, 'utf8')

  assert.match(source, /parsePostgameAiPraiseResult/)
  assert.match(source, /displayedPostgamePraise/)
  assert.match(source, /v-else-if="displayedPostgamePraise"/)
  assert.match(source, /class="postgame-ai-analysis-result postgame-praise-card"/)
  assert.match(source, /class="postgame-praise-headline"[\s\S]*displayedPostgamePraise\.headline/)
  assert.match(source, /v-for="\([^"]*paragraph[^"]*\) in displayedPostgamePraise\.paragraphs"/)
  assert.match(source, /class="postgame-praise-paragraph"[\s\S]*paragraph/)
  assert.doesNotMatch(source, /class="postgame-praise-body"[\s\S]*displayedPostgamePraise\.body/)
  assert.match(source, /v-else-if="hasStreamOutput && mode === 'praise'"/)
  assert.match(source, /正在组织夸夸内容，正文出来后会自动显示。/)
  assert.ok(source.indexOf('v-else-if="displayedPostgamePraise"') < source.indexOf('v-else-if="hasStreamOutput && mode === \'praise\'"'))
  assert.doesNotMatch(source, /DeepSeek 分析|下局一句话建议|证据条|小署名|语气条/)
})

test('postgame praise card uses theme-specific YouYuan styling without synthetic bold', () => {
  assert.equal(existsSync(modalUrl), true)
  const source = readFileSync(modalUrl, 'utf8')
  const panelRule = source.match(/\.postgame-ai-analysis-panel \{[\s\S]*?\n\}/)?.[0] ?? ''
  const lightRule = source.match(/:global\(\[data-theme="light"\] \.postgame-ai-analysis-panel\) \{[\s\S]*?\n\}/)?.[0] ?? ''
  const praiseCardRule = source.match(/\.postgame-praise-card \{[\s\S]*?\n\}/)?.[0] ?? ''
  const praiseHeadlineRule = source.match(/\.postgame-praise-headline \{[\s\S]*?\n\}/)?.[0] ?? ''
  const praiseParagraphRule = source.match(/\.postgame-praise-paragraph \{[\s\S]*?\n\}/)?.[0] ?? ''

  assert.match(panelRule, /--postgame-praise-reading-font:\s*YouYuan/)
  assert.match(panelRule, /--postgame-praise-card-bg:/)
  assert.match(panelRule, /--postgame-praise-title-color:/)
  assert.match(panelRule, /--postgame-praise-body-color:/)
  assert.match(lightRule, /--postgame-praise-card-bg:[\s\S]*#fffaf0/)
  assert.match(lightRule, /--postgame-praise-title-color:\s*#2b2110/)
  assert.match(lightRule, /--postgame-praise-body-color:\s*#3d3220/)
  assert.match(praiseCardRule, /font-synthesis-weight:\s*none/)
  assert.match(praiseCardRule, /background:\s*var\(--postgame-praise-card-bg\)/)
  assert.match(praiseCardRule, /border-color:\s*var\(--postgame-praise-card-border\)/)
  assert.match(praiseHeadlineRule, /color:\s*var\(--postgame-praise-title-color\)/)
  assert.match(praiseHeadlineRule, /font-weight:\s*400/)
  assert.match(praiseParagraphRule, /color:\s*var\(--postgame-praise-body-color\)/)
  assert.match(praiseParagraphRule, /font-weight:\s*400/)
  assert.doesNotMatch(praiseHeadlineRule, /font-weight:\s*(?:8|9)\d{2}/)
  assert.doesNotMatch(praiseParagraphRule, /font-weight:\s*(?:7|8|9)\d{2}/)
})

test('postgame AI analysis modal provides overlay, escape, close button, and cancel dismissal', () => {
  assert.equal(existsSync(modalUrl), true)
  const source = readFileSync(modalUrl, 'utf8')

  assert.match(source, /role="dialog"/)
  assert.match(source, /aria-modal="true"/)
  assert.match(source, /aria-labelledby="postgame-ai-analysis-title"/)
  assert.match(source, /emit\('close'\)/)
  assert.match(source, /emit\('cancel-analysis'\)/)
  assert.match(source, /@click\.self="requestClose"/)
  assert.match(source, /event\.key === 'Escape'/)
  assert.match(source, /requestClose\(\)/)
  assert.match(source, /document\.addEventListener\('keydown', handleKeydown\)/)
  assert.match(source, /document\.removeEventListener\('keydown', handleKeydown\)/)
  assert.match(source, /aria-label=/)
})

test('postgame AI analysis ladu chart keeps champion names and phrases visually compact', () => {
  assert.equal(existsSync(modalUrl), true)
  const source = readFileSync(modalUrl, 'utf8')

  const playerRule = source.match(/\.postgame-ladu-player \{[\s\S]*?\}/)?.[0] ?? ''
  const playersRule = source.match(/\.postgame-ladu-players \{[\s\S]*?\}/)?.[0] ?? ''
  const phraseRule = [...source.matchAll(/\.postgame-ladu-player span:last-child \{[\s\S]*?\}/g)]
    .map(match => match[0])
    .find(rule => rule.includes('line-height')) ?? ''

  assert.match(playersRule, /align-content:\s*center/)
  assert.match(playersRule, /align-items:\s*center/)
  assert.match(playerRule, /align-content:\s*center/)
  assert.match(playerRule, /align-items:\s*center/)
  assert.match(playerRule, /gap:\s*[01]px 7px/)
  assert.match(phraseRule, /line-height:\s*1\.5/)
  assert.match(phraseRule, /white-space:\s*normal/)
  assert.match(phraseRule, /overflow:\s*visible/)
  assert.doesNotMatch(phraseRule, /-webkit-line-clamp/)
})

test('postgame AI analysis modal renders structured ladu chart and image export', () => {
  assert.equal(existsSync(modalUrl), true)
  const source = readFileSync(modalUrl, 'utf8')

  assert.match(source, /parsePostgameAiStructuredResult/)
  assert.match(source, /downloadPostgameReviewImage/)
  assert.match(source, /resolvePostgameReviewPlayerIconUrl\(player, props\.rosterPlayers, getChampionIconUrl, props\.championIdByName\)/)
  assert.match(source, /championIdByName: props\.championIdByName/)
  assert.match(source, /structuredPostgameReview/)
  assert.match(source, /class="postgame-ladu-chart"/)
  assert.match(source, /class="postgame-ladu-label"/)
  assert.match(source, /class="postgame-ladu-summary"/)
  assert.match(source, /class="postgame-ai-analysis-share"/)
  assert.match(source, /postgameReviewRows/)
  assert.match(source, /row\.label/)
  assert.match(source, /生成图片/)
  assert.match(source, /从夯到拉/)
})
