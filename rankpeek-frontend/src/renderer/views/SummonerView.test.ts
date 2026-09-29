import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function extractRule(source: string, selector: string) {
  const start = source.indexOf(selector)
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

test('summoner lookup delegates the match analysis body to the shared panel', () => {
  const source = readFileSync(new URL('./SummonerView.vue', import.meta.url), 'utf8')

  assert.match(source, /import SummonerMatchHistoryPanel from '@\/components\/summoner\/SummonerMatchHistoryPanel\.vue'/)
  assert.match(source, /<SummonerMatchHistoryPanel[\s\S]*:summoner="resolvedSearchResult"[\s\S]*variant="lookup"[\s\S]*:connected="gameStore\.connected"[\s\S]*:local-cache-enabled="lookupUsesLocalCache"[\s\S]*:lookup-query="searchName"[\s\S]*:lookup-loading="loading"[\s\S]*:lookup-error="error"[\s\S]*:recent-lookup-summoners="recentLookupSummoners"[\s\S]*:active-lookup-name="activeLookupName"[\s\S]*@update:lookup-query="searchName = \$event"[\s\S]*@lookup="searchSummoner\(\)"[\s\S]*@select-recent-lookup="searchSummoner\(\$event\)"[\s\S]*\/>/)
  assert.doesNotMatch(source, /class="search-shell"/)
  assert.doesNotMatch(source, /class="search-bar"/)
  assert.doesNotMatch(source, /class="search-input"/)
  assert.doesNotMatch(source, /class="search-btn"/)
  assert.doesNotMatch(source, /import MatchDetailModal/)
  assert.doesNotMatch(source, /import MatchRosterCompact/)
  assert.doesNotMatch(source, /import \{ apiClient \}/)
  assert.doesNotMatch(source, /class="lookup-account-strip"/)
  assert.doesNotMatch(source, /class="lookup-filter-bar"/)
  assert.doesNotMatch(source, /class="match-card-main"/)
  assert.doesNotMatch(source, /class="roster-grid"/)
})

test('summoner lookup persists only recent summoner identities for automatic restore', () => {
  const source = readFileSync(new URL('./SummonerView.vue', import.meta.url), 'utf8')

  assert.match(source, /const RECENT_LOOKUP_STORAGE_KEY = 'rankpeek:summoner:recent-lookups'/)
  assert.match(source, /const RECENT_LOOKUP_LIMIT = 7/)
  assert.match(source, /interface PersistedRecentLookupState \{[\s\S]*lastLookupName: string[\s\S]*summoners: Summoner\[\][\s\S]*\}/)
  assert.match(source, /const recentLookupSummoners = ref<Summoner\[\]>\(\[\]\)/)
  assert.match(source, /const lastLookupName = ref\(''\)/)
  assert.match(source, /function persistRecentLookupState\(\) \{[\s\S]*localStorage\.setItem\(RECENT_LOOKUP_STORAGE_KEY, JSON\.stringify\(\{[\s\S]*lastLookupName: lastLookupName\.value,[\s\S]*summoners: recentLookupSummoners\.value\.map\(toPersistedSummonerIdentity\)[\s\S]*\}\)\)/)
  assert.match(source, /function toPersistedSummonerIdentity\(summoner: Summoner\): Summoner \{[\s\S]*gameName: summoner\.gameName,[\s\S]*tagLine: summoner\.tagLine,[\s\S]*puuid: summoner\.puuid,[\s\S]*profileIconId: summoner\.profileIconId,[\s\S]*summonerLevel: summoner\.summonerLevel,[\s\S]*summonerId: summoner\.summonerId/)
  assert.doesNotMatch(source, /persistRecentLookupState[\s\S]*matchHistory/)
  assert.doesNotMatch(source, /RECENT_LOOKUP_STORAGE_KEY[\s\S]*rank(?:ed)?WinRates|userTag|filterChampionId|filterQueueId|expandedGameId/)
})

test('summoner lookup restores the last player only when the route has no explicit name', () => {
  const source = readFileSync(new URL('./SummonerView.vue', import.meta.url), 'utf8')

  assert.match(source, /function loadRecentLookupState\(\) \{[\s\S]*localStorage\.getItem\(RECENT_LOOKUP_STORAGE_KEY\)/)
  assert.match(source, /async function restoreLastLookupIfNeeded\(\) \{[\s\S]*if \(typeof route\.query\.name === 'string' && route\.query\.name\.trim\(\)\) \{[\s\S]*return[\s\S]*\}[\s\S]*if \(!lastLookupName\.value\) \{[\s\S]*return[\s\S]*\}[\s\S]*await searchSummoner\(lastLookupName\.value\)/)
  assert.match(source, /onMounted\(async \(\) => \{[\s\S]*loadRecentLookupState\(\)[\s\S]*if \(typeof route\.query\.name === 'string' && route\.query\.name\.trim\(\)\) \{[\s\S]*await applyRouteQueryName\(route\.query\.name\)[\s\S]*return[\s\S]*\}[\s\S]*await restoreLastLookupIfNeeded\(\)[\s\S]*\}\)/)
  assert.match(source, /function rememberLookupSummoner\(summoner: Summoner\) \{[\s\S]*lastLookupName\.value = formatSummonerName\(summoner\)[\s\S]*recentLookupSummoners\.value = \[summoner, \.\.\.next\]\.slice\(0, RECENT_LOOKUP_LIMIT\)[\s\S]*persistRecentLookupState\(\)/)
  assert.match(source, /searchResult\.value = summoner[\s\S]*rememberLookupSummoner\(summoner\)/)
  assert.match(source, /searchResult\.value = currentSummoner[\s\S]*rememberLookupSummoner\(currentSummoner\)/)
})

test('current-account lookup reuses the connected summoner context instead of refetching by name', () => {
  const source = readFileSync(new URL('./SummonerView.vue', import.meta.url), 'utf8')
  const searchFunction = source.match(/async function searchSummoner\(nameOverride\?: string\) \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(source, /import \{ computed, onMounted, ref, watch \} from 'vue'/)
  assert.match(source, /const resolvedSearchResult = computed\(\(\) => searchResult\.value\)/)
  assert.match(source, /const lookupUsesLocalCache = computed\(\(\) =>[\s\S]*gameStore\.currentSummoner\?\.puuid[\s\S]*searchResult\.value\?\.puuid/)
  assert.match(source, /function resolveCurrentSummonerLookup\(keyword: string\): Summoner \| null \{[\s\S]*gameStore\.currentSummoner[\s\S]*summonerMatchesLookup\(currentSummoner, keyword\)/)
  assert.match(searchFunction, /const currentSummoner = resolveCurrentSummonerLookup\(keyword\)/)
  assert.match(searchFunction, /if \(currentSummoner\) \{[\s\S]*searchResult\.value = currentSummoner[\s\S]*return[\s\S]*\}/)
  assert.match(searchFunction, /const summoner = await gameStore\.fetchSummonerByName\(keyword\)/)
})

test('summoner lookup search controls live in the shared history panel header', () => {
  const panel = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')
  const zh = readFileSync(new URL('../i18n/locales/zh-CN.ts', import.meta.url), 'utf8')
  const en = readFileSync(new URL('../i18n/locales/en-US.ts', import.meta.url), 'utf8')

  assert.match(panel, /v-if="isLookup \|\| currentSummoner"/)
  assert.match(panel, /<h1>\{\{ panelTitle \}\}<\/h1>[\s\S]*<div\s+v-if="isLookup"\s+class="lookup-search"/)
  assert.match(panel, /class="lookup-search-input-wrap control-glow"[\s\S]*:style="\{ width: lookupInputWidth \}"[\s\S]*<input[\s\S]*class="lookup-search-input"[\s\S]*:value="lookupQueryValue"[\s\S]*:aria-label="t\('summoner\.placeholder'\)"[\s\S]*@input="handleLookupQueryInput"[\s\S]*@keyup\.enter="handleLookupSubmit"/)
  assert.doesNotMatch(panel, /placeholder=/)
  assert.match(panel, /const lookupInputWidth = computed\(\(\) => \{[\s\S]*clamp\(180px, \$\{length \+ 4\}ch, 420px\)/)
  assert.match(panel, /class="lookup-search-icon-btn control-glow"[\s\S]*aria-label="[^"]+"[\s\S]*:disabled="lookupSearchDisabled"[\s\S]*@click="handleLookupSubmit"[\s\S]*<svg[\s\S]*class="lookup-search-icon"[\s\S]*viewBox="0 0 24 24"[\s\S]*<path d=/)
  assert.match(panel, /<RefreshIconButton[\s\S]*:aria-label="refreshing \? t\('common\.refreshing'\) : t\('common\.refresh'\)"[\s\S]*:loading="refreshing"[\s\S]*:disabled="!currentSummoner"/)
  assert.doesNotMatch(panel, /<RefreshIconButton[\s\S]*class="control-glow"/)
  assert.doesNotMatch(panel, /:deep\(\.refresh-icon-btn/)
  assert.doesNotMatch(panel, /class="filter-control limit-select-control control-glow"[\s\S]*<select[\s\S]*class="filter-select limit-select"/)
  assert.match(panel, /class="filter-control champion-select-control champion-filter-dropdown control-glow"[\s\S]*class="filter-select champion-filter-trigger"/)
  assert.match(panel, /class="champion-option-count"/)
  assert.doesNotMatch(panel, /<select[\s\S]*class="filter-select champion-select"/)
  assert.match(panel, /class="filter-control control-glow"[\s\S]*<select[\s\S]*class="filter-select"/)
  assert.match(panel, /\.lookup-search-input-wrap \{[\s\S]*border: 1px solid var\(--match-control-border\)[\s\S]*background:[\s\S]*var\(--match-control-bg\)/)
  assert.match(panel, /\.lookup-search-input \{[\s\S]*border: 0[\s\S]*background: transparent/)
  assert.match(panel, /\.lookup-search-input-wrap:hover,[\s\S]*\.lookup-search-input-wrap:focus-within \{[\s\S]*border-color: var\(--match-control-border-hover\)[\s\S]*var\(--match-control-bg-hover-local\)[\s\S]*var\(--match-control-edge-shadow\)/)
  assert.match(panel, /\.lookup-search-input-wrap\.control-glow\[data-near-glow='true'\]:not\(:hover\):not\(:focus-within\) \{[\s\S]*border-color: var\(--match-control-border\)[\s\S]*var\(--match-control-edge-shadow\)/)
  assert.match(panel, /:global\(\[data-theme="light"\] \.match-history-view \.lookup-search-input-wrap\) \{[\s\S]*background:[\s\S]*rgba\(255, 255, 255, 0\.92\)[\s\S]*color: #101722/)
  assert.match(panel, /:global\(\[data-theme="light"\] \.match-history-view \.lookup-search-icon-btn\) \{[\s\S]*color: #000/)
  assert.match(panel, /:global\(\[data-theme="light"\] \.match-history-view \.lookup-search-icon-btn:hover\),[\s\S]*color: #000/)
  assert.match(panel, /:global\(\[data-theme="light"\] \.match-history-view \.lookup-search-icon\),[\s\S]*:global\(\[data-theme="light"\] \.match-history-view \.lookup-search-icon path\) \{[\s\S]*stroke: #000/)
  assert.doesNotMatch(panel, /:global\(\[data-theme="light"\] \.match-history-view \.lookup-search-input:hover\)/)
  assert.match(panel, /\.lookup-search-icon-btn \{[\s\S]*width: var\(--lookup-control-height\)[\s\S]*height: var\(--lookup-control-height\)[\s\S]*border: 1px solid rgba\(92, 163, 234, 0\)[\s\S]*color: #fff/)
  assert.match(panel, /\.lookup-search-icon-btn:hover,[\s\S]*\.lookup-search-icon-btn:focus-visible \{[\s\S]*border-color: var\(--match-control-border-hover\)[\s\S]*var\(--match-control-edge-shadow\)/)
  assert.match(panel, /\.lookup-search-icon-btn\.control-glow\[data-near-glow='true'\]:not\(:hover\):not\(:focus\) \{[\s\S]*border-color: rgba\(92, 163, 234, 0\)[\s\S]*var\(--match-control-edge-shadow\)/)
  assert.match(panel, /\.control-glow:hover::before,[\s\S]*\.control-glow:focus-within::before,[\s\S]*\.control-glow:focus-visible::before/)
  assert.match(panel, /\.filter-control:hover,[\s\S]*\.filter-control:focus-within \{[\s\S]*border-color: var\(--match-control-border-hover\)[\s\S]*var\(--match-control-bg-hover-local\)[\s\S]*var\(--match-control-edge-shadow\)/)
  assert.match(panel, /\.filter-control\.control-glow\[data-near-glow='true'\]:not\(:hover\):not\(:focus-within\) \{[\s\S]*border-color: var\(--match-control-border\)[\s\S]*var\(--match-control-edge-shadow\)/)
  assert.match(panel, /\.lookup-search-icon-btn:disabled \{[\s\S]*opacity: 0\.45[\s\S]*cursor: not-allowed/)
  assert.doesNotMatch(panel.match(/\.lookup-search-icon-btn:disabled \{[\s\S]*?\}/)?.[0] || '', /pointer-events:\s*none/)
  assert.doesNotMatch(panel, /\.lookup-search-input:hover/)
  assert.doesNotMatch(panel, /\.match-history-view\[data-variant='lookup'\] \.filter-select:hover/)
  assert.doesNotMatch(panel, /\{\{ lookupLoading \? t\('summoner\.searching'\) : t\('summoner\.search'\) \}\}/)
  assert.match(panel, /<div class="page-title-row">[\s\S]*<div\s+v-if="currentSummoner"\s+class="page-controls"/)
  assert.match(panel, /<section\s+v-if="currentSummoner"\s+class="content-stack"/)
  assert.match(zh, /'matchHistory\.lookupTitle': '战绩查询'/)
  assert.match(en, /'matchHistory\.lookupTitle': 'Match Lookup'/)
})

test('summoner lookup follows the shared module and control glow contract', () => {
  const panel = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')
  const variablesRule = extractRule(panel, '.match-history-view')
  const lightVariablesRule = extractRule(panel, ':global([data-theme="light"] .match-history-view)')
  const lookupShellRule = extractRule(panel, ".match-history-view[data-variant='lookup'] .page-shell,")
  const lookupHoverRule = extractRule(panel, ".match-history-view[data-variant='lookup'] .page-shell:hover,")
  const lookupNearRule = extractRule(panel, ".match-history-view[data-variant='lookup'] .page-shell.surface-glow[data-near-glow='true']:not(:hover):not(:focus-within),")
  const lookupAfterRule = extractRule(panel, ".match-history-view[data-variant='lookup'] .page-shell::after")

  assert.match(variablesRule, /--match-module-hover-rgb:\s*96,\s*176,\s*255/)
  assert.match(variablesRule, /--match-module-hover-border:\s*rgba\(var\(--match-module-hover-rgb\),\s*0\.48\)/)
  assert.match(variablesRule, /--match-module-hover-shadow:/)
  assert.match(lightVariablesRule, /--match-module-hover-rgb:\s*86,\s*109,\s*134/)
  assert.match(lightVariablesRule, /--match-module-hover-border:\s*rgba\(var\(--match-module-hover-rgb\),\s*0\.42\)/)
  assert.match(lightVariablesRule, /--match-control-border-local-glow:\s*var\(--rp-light-gold-edge-core\)/)
  assert.match(lightVariablesRule, /--match-control-border-hover:\s*rgba\(86,\s*109,\s*134,\s*0\.42\)/)

  assert.match(lookupShellRule, /border:\s*1px solid var\(--border-color\)/)
  assert.match(lookupShellRule, /background:\s*var\(--bg-secondary\)/)
  assert.match(lookupShellRule, /box-shadow:\s*none/)
  assert.doesNotMatch(lookupShellRule, /linear-gradient|inset|rgba\(41,\s*151,\s*255/)

  assert.match(lookupHoverRule, /border-color:\s*var\(--match-module-hover-border\)/)
  assert.match(lookupHoverRule, /box-shadow:\s*var\(--match-module-hover-shadow\)/)
  assert.doesNotMatch(lookupHoverRule, /inset|rgba\(41,\s*151,\s*255|rgba\(92,\s*163,\s*234/)

  assert.match(lookupNearRule, /border-color:\s*var\(--border-color\)/)
  assert.match(lookupNearRule, /box-shadow:\s*none/)
  assert.match(lookupAfterRule, /display:\s*none/)
})

test('summoner lookup keeps only search state and leaves match state to the panel', () => {
  const source = readFileSync(new URL('./SummonerView.vue', import.meta.url), 'utf8')

  assert.match(source, /const searchName = ref\(''\)/)
  assert.match(source, /const searchResult = ref<Summoner \| null>\(null\)/)
  assert.match(source, /const loading = ref\(false\)/)
  assert.match(source, /const error = ref\(''\)/)
  assert.doesNotMatch(source, /searchRank|searchMatchHistory|searchUserTag|searchRankedWinRates/)
  assert.doesNotMatch(source, /userTagSummaries|championOptions|modeOptions|filterChampionId|filterQueueId/)
  assert.doesNotMatch(source, /currentPage|reachedEnd|showDetailModal|selectedGameDetail|selectedMatchHistory/)
  assert.doesNotMatch(source, /async function loadMatchHistory|async function loadVisibleUserTagSummaries/)
  assert.doesNotMatch(source, /async function refreshCurrentSummoner|async function handleFilterChange/)
})

test('searchSummoner only resolves the summoner and clears stale lookup panels on failure', () => {
  const source = readFileSync(new URL('./SummonerView.vue', import.meta.url), 'utf8')
  const searchFunction = source.match(/async function searchSummoner\(nameOverride\?: string\) \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(searchFunction, /const keyword = \(nameOverride \?\? searchName\.value\)\.trim\(\)/)
  assert.match(searchFunction, /error\.value = ''/)
  assert.match(searchFunction, /searchResult\.value = null/)
  assert.match(searchFunction, /loading\.value = true/)
  assert.match(searchFunction, /const summoner = await gameStore\.fetchSummonerByName\(keyword\)/)
  assert.match(searchFunction, /searchResult\.value = summoner/)
  assert.match(searchFunction, /error\.value = t\('summoner\.notFound'\)/)
  assert.match(searchFunction, /error\.value = t\('summoner\.searchFailed'\)/)
  assert.doesNotMatch(searchFunction, /apiClient\./)
  assert.doesNotMatch(searchFunction, /loadMatchHistory|ensurePageSettingsLoaded|applyDefaultFilters/)
})

test('searchSummoner ignores stale lookup responses from earlier searches', () => {
  const source = readFileSync(new URL('./SummonerView.vue', import.meta.url), 'utf8')
  const searchFunction = source.match(/async function searchSummoner\(nameOverride\?: string\) \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(source, /let searchRequestId = 0/)
  assert.match(searchFunction, /const requestId = \+\+searchRequestId/)
  assert.match(searchFunction, /if \(requestId !== searchRequestId\) \{[\s\S]*return[\s\S]*\}/)
  assert.match(searchFunction, /if \(requestId === searchRequestId\) \{[\s\S]*loading\.value = false[\s\S]*\}/)
})
