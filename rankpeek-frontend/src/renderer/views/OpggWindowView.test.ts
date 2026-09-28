import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('OP.GG window view provides manual filters and loads champion options', () => {
  const source = readFileSync(new URL('./OpggWindowView.vue', import.meta.url), 'utf8')

  assert.match(source, /<h1>[\s\S]*OP\.GG[\s\S]*<\/h1>/)
  assert.match(source, /import OpggChampionPanel from '@\/components\/gaming\/OpggChampionPanel\.vue'/)
  assert.match(source, /import OpggChampionTierTable from '@\/components\/gaming\/OpggChampionTierTable\.vue'/)
  assert.match(source, /apiClient\.getChampionOptions\(\)/)
  assert.match(source, /class="opgg-filter-row"/)
  assert.doesNotMatch(source, /class="opgg-filter-grid"/)
  assert.doesNotMatch(source, /<span>英雄<\/span>|<span>模式<\/span>|<span>段位<\/span>|<span>分路<\/span>/u)
  assert.match(source, /v-model\.number="filter\.championId"/)
  assert.match(source, /v-model="filter\.mode"/)
  assert.match(source, /v-model="filter\.tier"/)
  assert.match(source, /v-model="filter\.position"/)
  assert.match(source, /@change="handleModeFilterChange"/)
  assert.match(source, /@change="handleRankFilterChange"/)
  assert.match(source, /@click="restoreFollowCurrentGame"/)
  assert.match(source, /@click="refreshActiveOpggPanel"/)
})

test('OP.GG window logo opens the official OP.GG page and turns blue on hover', () => {
  const source = readFileSync(new URL('./OpggWindowView.vue', import.meta.url), 'utf8')

  assert.match(source, /class="opgg-brand-link"/)
  assert.match(source, /@click="openOfficialOpggPage"/)
  assert.match(source, /const OFFICIAL_OPGG_CHAMPIONS_URL = 'https:\/\/op\.gg\/lol\/champions'/)
  assert.match(source, /window\.electronAPI\?\.openExternal\?\.\(OFFICIAL_OPGG_CHAMPIONS_URL\)/)
  assert.match(source, /\.opgg-brand-link:hover,[\s\S]*\.opgg-brand-link:focus-visible\s*\{[\s\S]*color:\s*#1ea7ff/)
})

test('OP.GG window auto applies only on page entry and own champion selection', () => {
  const source = readFileSync(new URL('./OpggWindowView.vue', import.meta.url), 'utf8')

  assert.match(source, /const followCurrentGame = ref\(true\)/)
  assert.match(source, /type OpggAutoApplyTrigger = 'initial' \| 'champion-change'/)
  assert.match(source, /let hasAppliedInitialAutoQuery = false/)
  assert.match(source, /let lastSeenAutoChampionId: number \| null = null/)
  assert.doesNotMatch(source, /let lastAppliedAutoQueryKey = ''/)
  assert.match(source, /function applyCurrentGameQueryForTrigger\(query: OpggChampionQuery, trigger\?: OpggAutoApplyTrigger\)/)
  assert.match(source, /function readAutoChampionId\(query: OpggChampionQuery\)/)
  assert.match(source, /function handleRankFilterChange/)
  assert.match(source, /followCurrentGame\.value = false/)
  assert.match(source, /function restoreFollowCurrentGame/)
  assert.match(source, /followCurrentGame\.value = true/)
  assert.match(source, /getGamingSessionData\(\{ forceRefresh: false \}\)/)
  assert.match(source, /buildOpggChampionQuery\(sessionData\)/)
  assert.match(source, /refreshCurrentGameQuery\(\{ apply: 'initial' \}\)/)
  assert.match(source, /refreshCurrentGameQuery\(\{ apply: 'champion-change' \}\)/)
  assert.match(source, /applyCurrentGameQueryForTrigger\(query, options\.apply\)/)
  assert.match(source, /window\.electronAPI\?\.onOpggInitialQuery/)
})

test('OP.GG window does not expose aram mayhem in manual filters', () => {
  const source = readFileSync(new URL('./OpggWindowView.vue', import.meta.url), 'utf8')

  assert.match(source, /type OpggMode = 'ranked' \| 'aram' \| 'arena' \| 'urf' \| 'nexus_blitz'/)
  assert.doesNotMatch(source, /aram_mayhem/)
})

test('OP.GG champion search includes common Chinese nicknames beyond the official title', () => {
  const source = readFileSync(new URL('./OpggWindowView.vue', import.meta.url), 'utf8')

  assert.match(source, /placeholder="搜索英雄（支持外号、昵称）"/)
  assert.match(source, /championOptionMatchesSearch/)
  assert.match(source, /from '@\/utils\/championSearchAliases'/)
})

test('OP.GG polling ignores rank position and other player changes after the initial auto jump', () => {
  const source = readFileSync(new URL('./OpggWindowView.vue', import.meta.url), 'utf8')
  const autoApply = source.match(/function applyCurrentGameQueryForTrigger\(query: OpggChampionQuery, trigger\?: OpggAutoApplyTrigger\) \{[\s\S]*?function applyCurrentGameQuery\(query: OpggChampionQuery\)/)?.[0] || ''
  const pollBlock = source.match(/pollTimer = setInterval\(\(\) => \{[\s\S]*?\}, 4000\)/)?.[0] || ''

  assert.match(autoApply, /if \(!followCurrentGame\.value \|\| !trigger\)/)
  assert.match(autoApply, /if \(trigger === 'initial'\)/)
  assert.match(autoApply, /if \(hasAppliedInitialAutoQuery\)/)
  assert.match(autoApply, /hasAppliedInitialAutoQuery = true/)
  assert.match(autoApply, /const championId = readAutoChampionId\(query\)/)
  assert.match(autoApply, /if \(!championId \|\| championId === lastSeenAutoChampionId\)/)
  assert.match(autoApply, /lastSeenAutoChampionId = championId/)
  assert.match(autoApply, /applyCurrentGameQuery\(query\)/)
  assert.doesNotMatch(autoApply, /buildAutoQueryKey/)
  assert.doesNotMatch(autoApply, /resolveRankedTier\(query\.tier\)[\s\S]*resolveRankedPosition\(query\.position\)/)
  assert.match(pollBlock, /refreshCurrentGameQuery\(\{ apply: 'champion-change' \}\)/)
})

test('OP.GG default filter refresh keeps the last tier during transient rank reloads', () => {
  const source = readFileSync(new URL('./OpggWindowView.vue', import.meta.url), 'utf8')
  const refreshDefaults = source.match(/async function refreshDefaultRankedFilters[\s\S]*?async function refreshCurrentGameQuery/)?.[0] || ''

  assert.match(refreshDefaults, /const hasKnownAccount = Boolean/)
  assert.doesNotMatch(refreshDefaults, /defaultRankedTier\.value === 'all' && filter\.tier !== 'all'/)
})

test('OP.GG default rank and lane are applied once and do not overwrite manual list filters', () => {
  const source = readFileSync(new URL('./OpggWindowView.vue', import.meta.url), 'utf8')
  const refreshDefaults = source.match(/async function refreshDefaultRankedFilters[\s\S]*?async function refreshCurrentGameQuery/)?.[0] || ''

  assert.match(source, /let hasAppliedInitialDefaultTier = false/)
  assert.match(source, /let hasAppliedInitialDefaultPosition = false/)
  assert.match(refreshDefaults, /followCurrentGame\.value && !hasAppliedInitialDefaultTier/)
  assert.match(refreshDefaults, /hasAppliedInitialDefaultTier = true/)
  assert.match(refreshDefaults, /followCurrentGame\.value &&\s*!hasAppliedInitialDefaultPosition/)
  assert.match(refreshDefaults, /hasAppliedInitialDefaultPosition = true/)
})

test('OP.GG window loads tier list without champion and opens detail after champion selection', () => {
  const source = readFileSync(new URL('./OpggWindowView.vue', import.meta.url), 'utf8')

  assert.match(source, /getOpggChampionList/)
  assert.match(source, /resolveDefaultOpggTier/)
  assert.match(source, /resolveDefaultOpggPosition/)
  assert.match(source, /const defaultRankedTier = ref\('all'\)/)
  assert.match(source, /const defaultRankedPosition = ref/)
  assert.match(source, /const defaultPositionLoading = ref\(false\)/)
  assert.match(source, /function canLoadList\(filterState: OpggManualFilterState\)/)
  assert.match(source, /function canLoadList\(filterState: OpggManualFilterState\) \{[\s\S]*return Boolean\(filterState\.mode && filterState\.region\)[\s\S]*\}/)
  assert.match(source, /function showChampionDetail\(championId: number\)/)
  assert.match(source, /applyRankedDefaultsForDetail\(\)/)
  assert.match(source, /activePanel\.value = 'detail'/)
  assert.match(source, /<OpggChampionTierTable[\s\S]*:list="opggList"[\s\S]*@select-champion="showChampionDetail"/)
  assert.doesNotMatch(source, /:filter-label="listFilterLabel"/)
  assert.doesNotMatch(source, /const listFilterLabel = computed/)
  assert.match(source, /getOpggChampionDetail\(\{[\s\S]*championId: filter\.championId,[\s\S]*mode: filter\.mode,[\s\S]*region: filter\.region,[\s\S]*tier: filter\.mode === 'ranked' \? filter\.tier : 'all',[\s\S]*position: filter\.mode === 'ranked' \? filter\.position : 'none'/)
  assert.match(source, /<OpggChampionPanel[\s\S]*:query="panelQuery"[\s\S]*:detail="opggDetail"[\s\S]*:loading="opggLoading"[\s\S]*:error="opggError"/)
})

test('OP.GG window passes selected list counters into the champion detail panel', () => {
  const source = readFileSync(new URL('./OpggWindowView.vue', import.meta.url), 'utf8')

  assert.match(source, /:counters="activeDetailCounters"/)
  assert.match(source, /const selectedDetailPositionStats = computed/)
  assert.match(source, /opggList\.value\?\.items\.find/)
  assert.match(source, /position\.position === filter\.position/)
  assert.match(source, /const activeDetailCounters = computed/)
  assert.match(source, /return \(selectedDetailPositionStats\.value\?\.counters \|\| \[\]\)\.slice\(0, 3\)/)
})

test('OP.GG window places the back action in the top toolbar beside the OP.GG title', () => {
  const source = readFileSync(new URL('./OpggWindowView.vue', import.meta.url), 'utf8')

  assert.match(source, /class="opgg-toolbar-back-btn"/)
  assert.match(source, /v-if="activePanel === 'detail'"/)
  assert.match(source, /@click="showListPanel"/)
  assert.match(source, /\.opgg-heading \{[\s\S]*display: flex[\s\S]*align-items: center[\s\S]*gap: 6px/)
  assert.doesNotMatch(source, /:show-back-button="true"/)
  assert.doesNotMatch(source, /@back="showListPanel"/)
  assert.doesNotMatch(source, /opgg-detail-actions/)
})

test('OP.GG window keeps the filter toolbar compact on a single minimum-width row', () => {
  const source = readFileSync(new URL('./OpggWindowView.vue', import.meta.url), 'utf8')

  assert.match(source, /\.opgg-window-view \{[\s\S]*min-width:\s*720px/)
  assert.match(source, /\.opgg-toolbar \{[\s\S]*grid-template-columns:\s*auto minmax\(396px,\s*1fr\) auto/)
  assert.match(source, /\.opgg-filter-row \{[\s\S]*grid-template-columns:\s*minmax\(96px,\s*210px\) 64px 86px 82px 68px/)
  assert.match(source, /\.opgg-toolbar-actions \{[\s\S]*flex-wrap:\s*nowrap/)
  assert.match(source, /\.opgg-filter-input,[\s\S]*\.opgg-filter-select \{[\s\S]*height:\s*30px/)
  assert.match(source, /\.opgg-follow-btn,[\s\S]*\.opgg-refresh-btn,[\s\S]*\.opgg-toolbar-back-btn \{[\s\S]*min-height:\s*30px[\s\S]*padding:\s*0 8px/)
  assert.doesNotMatch(source, /@media \(max-width: 920px\)[\s\S]*\.opgg-toolbar \{[\s\S]*grid-template-columns:\s*1fr/)
})

test('OP.GG window keeps the toolbar clean and passes the selected champion title to detail', () => {
  const source = readFileSync(new URL('./OpggWindowView.vue', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /<p>{{ statusText }}<\/p>/)
  assert.doesNotMatch(source, /const statusText = computed/)
  assert.match(source, /const activeChampionTitle = computed/)
  assert.match(source, /championOptions\.value\.find/)
  assert.match(source, /opggDetail\.value\?\.championName/)
  assert.match(source, /:title="activeChampionTitle"/)
})

test('OP.GG rank filter changes keep the selected champion in detail view', () => {
  const source = readFileSync(new URL('./OpggWindowView.vue', import.meta.url), 'utf8')
  const rankHandler = source.match(/function handleRankFilterChange\(\) \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(rankHandler, /if \(filter\.championId\)/)
  assert.match(rankHandler, /activePanel\.value = 'detail'/)
  assert.match(rankHandler, /loadOpggDetail/)
  assert.doesNotMatch(rankHandler, /filter\.championId = 0/)
})
