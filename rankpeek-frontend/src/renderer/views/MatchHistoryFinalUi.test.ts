import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(url: URL) {
  return readFileSync(url, 'utf8').replace(/\r\n/g, '\n')
}

function extractRule(source: string, selector: string) {
  const styleStart = source.indexOf('<style')
  const start = source.indexOf(selector, styleStart === -1 ? 0 : styleStart)
  assert.notEqual(start, -1, `${selector} should exist`)

  const open = source.indexOf('{', start)
  assert.notEqual(open, -1, `${selector} should have a body`)

  let depth = 0
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1
    }

    if (source[index] === '}') {
      depth -= 1
      if (depth === 0) {
        return source.slice(open + 1, index)
      }
    }
  }

  assert.fail(`${selector} should close`)
}

test('match history floating top bar owns the title, filters, and refresh action', () => {
  const source = readSource(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url))

  assert.match(source, /<h1>\{\{ panelTitle \}\}<\/h1>/)
  assert.match(source, /const panelTitle = computed\(\(\) =>/)
  assert.doesNotMatch(source, /<h1>\{\{ t\('matchHistory\.recentTitle'\) \}\}<\/h1>/)
  assert.doesNotMatch(source, /<h2>\{\{ t\('matchHistory\.recentTitle'\) \}\}<\/h2>/)
  assert.doesNotMatch(source, /class="history-toolbar"/)
  assert.doesNotMatch(source, /class="history-toolbar-copy"/)
  assert.doesNotMatch(source, /class="ghost-btn"/)
  assert.doesNotMatch(source, /t\('common\.reset'\)/)
  assert.doesNotMatch(source, /function resetFilter|async function resetFilter/)
  assert.match(source, /<div class="page-title-row">[\s\S]*<h1>\{\{ panelTitle \}\}<\/h1>[\s\S]*<\/div>[\s\S]*<div\b[^>]*v-if="currentSummoner"[^>]*class="page-controls"[^>]*>/)
  assert.match(source, /<div\b[^>]*v-if="currentSummoner"[^>]*class="page-controls"[^>]*>[\s\S]*<div class="filters">[\s\S]*<div class="page-actions">[\s\S]*<RefreshIconButton/)
  assert.match(source, /<RefreshIconButton[\s\S]*:aria-label="refreshing \? t\('common\.refreshing'\) : t\('common\.refresh'\)"[\s\S]*:loading="refreshing"[\s\S]*@click="handleRefresh"/)
  assert.doesNotMatch(source, /<RefreshIconButton[\s\S]*class="control-glow"/)
  assert.doesNotMatch(source, /:deep\(\.refresh-icon-btn/)
})

test('match history top bar uses fixed performant styling', () => {
  const source = readSource(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url))
  const cardSource = readSource(new URL('../components/match-history/MatchHistoryCard.vue', import.meta.url))
  const pageShellRule = extractRule(source, '.page-shell {')
  const pageControlsRule = extractRule(source, '.page-controls')
  const filtersRule = extractRule(source, '.filters')
  const liquidLayerRule = extractRule(source, '.page-shell::after')
  const historyShellHoverRule = extractRule(source, '.history-shell:hover,')
  const matchCardRule = extractRule(cardSource, '.match-history-card')
  const lightRule = extractRule(source, ':global([data-theme="light"] .match-history-view .page-shell)')

  assert.doesNotMatch(source, /ref="pageShellRef"/)
  assert.doesNotMatch(source, /pageShellCompact|bindPageShellScrollTarget|scrollTop > 28/)
  assert.doesNotMatch(source, /\.page-shell\.compact/)
  assert.doesNotMatch(source, /page-shell-liquid/)
  assert.match(source, /<div\b[^>]*ref="matchHistoryViewRef"[^>]*class="match-history-view"[^>]*>/)
  assert.match(source, /const matchHistoryViewRef = ref<HTMLElement \| null>\(null\)/)
  // 跟随鼠标的窗口级泛光已移除，顶栏只保留静态样式契约
  assert.doesNotMatch(source, /WINDOW_PROXIMITY_GLOW_SELECTOR/)
  assert.doesNotMatch(source, /handleWindowPointerMove/)
  assert.doesNotMatch(source, /applyGlowElement/)
  assert.match(extractRule(source, '.match-history-view'), /gap:\s*22px/)
  assert.doesNotMatch(pageShellRule, /position:\s*(?:sticky|fixed)/)
  assert.doesNotMatch(pageShellRule, /top:\s*[^;]+;/)
  assert.match(pageShellRule, /position:\s*relative/)
  assert.match(pageShellRule, /z-index:\s*20/)
  assert.match(pageShellRule, /box-sizing:\s*border-box/)
  assert.match(pageShellRule, /width:\s*100%/)
  assert.match(pageShellRule, /max-width:\s*100%/)
  assert.match(matchCardRule, /min-height:\s*98px/)
  assert.match(pageShellRule, /min-height:\s*86px/)
  assert.match(pageShellRule, /height:\s*auto/)
  assert.match(pageShellRule, /margin-inline:\s*0/)
  assert.match(pageShellRule, /margin-bottom:\s*4px/)
  assert.match(pageShellRule, /border-radius:\s*20px/)
  assert.match(pageShellRule, /padding:\s*14px 24px/)
  assert.match(pageShellRule, /flex-direction:\s*row/)
  assert.match(pageShellRule, /align-items:\s*center/)
  assert.match(pageShellRule, /justify-content:\s*space-between/)
  assert.match(source, /\.page-title-row\s*\{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;/)
  assert.match(pageShellRule, /background:[\s\S]*linear-gradient[\s\S]*rgba\(10, 13, 20, 0\.62\)/)
  assert.doesNotMatch(pageShellRule, /backdrop-filter/)
  assert.match(pageShellRule, /box-shadow:[\s\S]*0 10px 26px rgba\(0, 0, 0, 0\.24\)[\s\S]*inset 10px 0 18px var\(--match-page-shell-side-shadow\)[\s\S]*inset -10px 0 18px var\(--match-page-shell-side-shadow\)[\s\S]*inset 0 1px 0/)
  assert.match(source, /\.page-shell\.surface-glow::before \{[\s\S]*z-index:\s*2/)
  assert.match(source, /\.page-shell:hover,\n\.page-shell\.surface-glow\[data-near-glow='true'\] \{[\s\S]*border-color:\s*rgba\(148, 211, 255, 0\.38\)/)
  assert.match(historyShellHoverRule, /border-color:\s*rgba\(148, 211, 255, 0\.28\)/)
  assert.doesNotMatch(liquidLayerRule, /animation:/)
  assert.doesNotMatch(liquidLayerRule, /mix-blend-mode/)
  assert.match(pageShellRule, /flex-wrap:\s*nowrap/)
  assert.match(pageControlsRule, /width:\s*auto/)
  assert.match(pageControlsRule, /flex-wrap:\s*wrap/)
  assert.match(pageControlsRule, /min-width:\s*0/)
  assert.match(filtersRule, /flex-wrap:\s*wrap/)
  assert.match(lightRule, /var\(--match-page-shell-side-highlight\)/)
  assert.match(lightRule, /rgba\(255, 255, 255, 0\.56\)/)
  assert.match(lightRule, /0 10px 26px rgba\(92, 163, 234, 0\.13\)/)
})

test('match history select filters have an activated hover glow state', () => {
  const source = readSource(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url))
  const filterControlRule = extractRule(source, '.filter-control {')
  const filterControlHoverRule = extractRule(source, '.filter-control:hover,\n.filter-control:focus-within')
  const filterControlActiveRule = extractRule(source, '.filter-control:focus-within,\n.filter-control:active')
  const filterControlNearGlowRule = extractRule(source, ".filter-control.control-glow[data-near-glow='true']:not(:hover):not(:focus-within)")
  const selectRule = extractRule(source, '.filter-select {')

  assert.match(filterControlRule, /min-height:\s*38px/)
  assert.match(filterControlRule, /border:\s*1px solid var\(--match-control-border\)/)
  assert.match(filterControlRule, /background:[\s\S]*var\(--match-control-bg\)/)
  assert.match(filterControlRule, /cursor:\s*pointer/)
  assert.match(filterControlHoverRule, /border-color:\s*var\(--match-control-border-hover\)/)
  assert.match(filterControlHoverRule, /background:\s*var\(--match-control-bg-hover-local\)/)
  assert.match(filterControlHoverRule, /box-shadow:[\s\S]*var\(--match-control-hover-shadow\)[\s\S]*var\(--match-control-edge-shadow\)[\s\S]*inset 0 1px 0/)
  assert.match(filterControlActiveRule, /background:\s*var\(--match-control-bg-active-local\)/)
  assert.match(filterControlActiveRule, /color:\s*var\(--match-control-active-text\)/)
  assert.match(filterControlNearGlowRule, /border-color:\s*var\(--match-control-border\)/)
  assert.match(filterControlNearGlowRule, /box-shadow:[\s\S]*var\(--match-control-edge-shadow\)/)
  assert.match(selectRule, /border:\s*0/)
  assert.match(selectRule, /background:\s*transparent/)
  assert.match(selectRule, /padding:\s*0 11px/)
  assert.match(selectRule, /color-scheme:\s*dark/)
  assert.match(source, /class="filter-control champion-select-control champion-filter-dropdown control-glow"/)
  assert.match(source, /\.filter-control \{[\s\S]*width:\s*108px;[\s\S]*min-width:\s*108px;[\s\S]*max-width:\s*108px;/)
  assert.match(source, /\.champion-select-control \{[\s\S]*width:\s*148px;[\s\S]*min-width:\s*148px;[\s\S]*max-width:\s*148px;/)
  assert.match(source, /\.champion-option-count \{[\s\S]*color:\s*#4aa3ff;/)
  assert.doesNotMatch(source, /\.limit-select-control \{/)
  assert.doesNotMatch(selectRule, /text-overflow:\s*ellipsis/)
})

test('match history overview gives stats priority while compacting rank information', () => {
  const source = readSource(new URL('../components/summoner/SummonerOverviewPanel.vue', import.meta.url))
  const overviewRule = extractRule(source, '.overview-panel')
  const rankRule = extractRule(source, '.rank-section {')
  const rankItemRule = extractRule(source, '.rank-item')
  const statsRule = extractRule(source, '.stats-section {')
  const statBlockRule = extractRule(source, '.stat-block')
  const statValueRule = extractRule(source, '.stat-value')

  assert.match(overviewRule, /grid-template-columns:\s*minmax\(210px,\s*0\.95fr\) minmax\(170px,\s*230px\) minmax\(330px,\s*1\.35fr\)/)
  assert.match(overviewRule, /max-width:\s*100%/)
  assert.match(rankRule, /max-width:\s*230px/)
  assert.match(rankRule, /grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  assert.match(rankItemRule, /grid-template-columns:\s*42px minmax\(0,\s*1fr\)/)
  assert.match(rankItemRule, /min-width:\s*0/)
  assert.match(source, /<span class="stat-label">\{\{ stat\.label \}\}<\/span>\s*<strong class="stat-value">\{\{ stat\.value \}\}<\/strong>/)
  assert.match(statsRule, /grid-template-columns:\s*repeat\(5,\s*minmax\(50px,\s*1fr\)\)/)
  assert.match(statsRule, /gap:\s*clamp\(6px,\s*0\.8vw,\s*10px\)/)
  assert.match(statBlockRule, /flex-direction:\s*column/)
  assert.match(statValueRule, /font-size:\s*clamp\(19px,\s*1\.8vw,\s*24px\)/)
  assert.doesNotMatch(statValueRule, /overflow:\s*hidden/)
  assert.match(source, /@media \(max-width: 980px\) \{[\s\S]*\.overview-panel \{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) minmax\(150px,\s*210px\)/)
  assert.match(source, /@media \(max-width: 980px\) \{[\s\S]*\.stats-section \{[\s\S]*grid-column:\s*1 \/ -1/)
  assert.match(source, /@media \(max-width: 980px\) \{[\s\S]*\.stats-section \{[\s\S]*grid-template-columns:\s*repeat\(5,\s*minmax\(50px,\s*1fr\)\)/)
  assert.doesNotMatch(source, /\.stats-section\s*\{[\s\S]*grid-template-columns:\s*repeat\(3/)
  assert.doesNotMatch(source, /\.stats-section\s*\{[\s\S]*grid-template-columns:\s*repeat\(2/)
})
