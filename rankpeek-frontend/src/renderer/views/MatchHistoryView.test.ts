import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('match history uses fixed twenty-game infinite loading instead of selectable list limits', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')

  assert.match(source, /const MATCH_HISTORY_PAGE_SIZE = 20/)
  assert.match(source, /const currentPage = ref\(0\)/)
  assert.match(source, /const hasNext = ref\(false\)/)
  assert.match(source, /const loadingMore = ref\(false\)/)
  assert.match(source, /const loadedPages = ref<number\[\]>\(\[\]\)/)
  assert.match(source, /const loadMoreSentinelRef = ref<HTMLElement \| null>\(null\)/)
  assert.match(source, /function loadMoreMatchHistory\(/)
  assert.match(source, /new IntersectionObserver/)
  assert.doesNotMatch(source, /const matchHistoryLimits = \[20, 50, 100, 200\] as const/)
  assert.doesNotMatch(source, /type MatchHistoryLimit = typeof matchHistoryLimits\[number\]/)
  assert.doesNotMatch(source, /const selectedLimit/)
  assert.doesNotMatch(source, /v-model\.number="selectedLimit"/)
  assert.doesNotMatch(source, /@change="handleLimitChange"/)
  assert.match(source, /class="filters"/)
  assert.doesNotMatch(source, /class="pagination"/)
  assert.doesNotMatch(source, /async function nextPage/)
  assert.doesNotMatch(source, /async function prevPage/)
})

test('match history page header owns the visible matches title without debug metadata', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')
  const zh = readFileSync(new URL('../i18n/locales/zh-CN.ts', import.meta.url), 'utf8')
  const en = readFileSync(new URL('../i18n/locales/en-US.ts', import.meta.url), 'utf8')

  assert.equal(/'matchHistory\.title': '我的战绩'/.test(zh), true)
  assert.equal(/'matchHistory\.title': 'My Matches'/.test(en), true)
  assert.match(source, /<h1>\{\{ panelTitle \}\}<\/h1>/)
  assert.match(source, /const panelTitle = computed\(\(\) =>/)
  assert.match(source, /isLookup\.value[\s\S]*t\('matchHistory\.lookupTitle'\)[\s\S]*t\('matchHistory\.title'\)/)
  assert.doesNotMatch(source, /<h1>\{\{ t\('matchHistory\.recentTitle'\) \}\}<\/h1>/)
  assert.doesNotMatch(source, /<h2>\{\{ t\('matchHistory\.recentTitle'\) \}\}<\/h2>/)
  assert.match(source, /<div\b[^>]*v-if="currentSummoner"[^>]*class="page-controls"[^>]*>[\s\S]*<div class="filters">[\s\S]*<RefreshIconButton/)
  assert.doesNotMatch(source, /class="history-toolbar"/)
  assert.doesNotMatch(source, /class="history-toolbar-copy"/)
  assert.doesNotMatch(source, /class="ghost-btn"/)
  assert.doesNotMatch(source, /t\('common\.reset'\)|resetFilter/)
  assert.equal(/来源|状态|上限|可切换/.test(source), false)
  assert.equal(/matchHistorySourceLabel|matchRecordStatusLabel|moreLimitHint/.test(source), false)
})

test('match history overview compacts rank information so recent stats do not overflow', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerOverviewPanel.vue', import.meta.url), 'utf8')

  assert.match(source, /\.overview-panel\s*\{[\s\S]*grid-template-columns:\s*minmax\(210px,\s*0\.95fr\) minmax\(170px,\s*230px\) minmax\(330px,\s*1\.35fr\)/)
  assert.match(source, /\.rank-section\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)[\s\S]*max-width:\s*230px/)
  assert.match(source, /\.rank-item\s*\{[\s\S]*grid-template-columns:\s*42px minmax\(0,\s*1fr\)[\s\S]*min-width:\s*0/)
  assert.match(source, /<span class="stat-label">\{\{ stat\.label \}\}<\/span>\s*<strong class="stat-value">\{\{ stat\.value \}\}<\/strong>/)
  assert.match(source, /\.stats-section\s*\{[\s\S]*grid-template-columns:\s*repeat\(5,\s*minmax\(50px,\s*1fr\)\)/)
  assert.match(source, /\.stat-block\s*\{[\s\S]*flex-direction:\s*column/)
  assert.match(source, /\.stat-value\s*\{[\s\S]*font-size:\s*clamp\(19px,\s*1\.8vw,\s*24px\)/)
  assert.match(source, /@media \(max-width: 980px\) \{[\s\S]*\.overview-panel \{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) minmax\(150px,\s*210px\)/)
  assert.match(source, /@media \(max-width: 980px\) \{[\s\S]*\.stats-section \{[\s\S]*grid-column:\s*1 \/ -1/)
  assert.match(source, /@media \(max-width: 980px\) \{[\s\S]*\.stats-section \{[\s\S]*grid-template-columns:\s*repeat\(5,\s*minmax\(50px,\s*1fr\)\)/)
  assert.doesNotMatch(source, /\.stats-section\s*\{[\s\S]*grid-template-columns:\s*repeat\(3/)
  assert.doesNotMatch(source, /\.stats-section\s*\{[\s\S]*grid-template-columns:\s*repeat\(2/)
  assert.match(source, /t\('overview\.recentStatsSample'/)
  assert.equal(/class="stat-sub"/.test(source), false)
  assert.match(source, /\.relationship-name\s*\{[\s\S]*text-overflow:\s*ellipsis;/)
  assert.match(source, /\.rank-tier\s*\{[\s\S]*text-overflow:\s*ellipsis;/)
})

test('match history view delegates each card to MatchHistoryCard', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')

  assert.match(source, /import MatchHistoryCard from '@\/components\/match-history\/MatchHistoryCard.vue'/)
  assert.match(source, /<MatchHistoryCard[\s\S]*:match="match"[\s\S]*:expanded="expandedGameId === match\.gameId"[\s\S]*@open-detail="toggleInlineDetail"/)
  assert.match(source, /<MatchHistoryInlineDetail[\s\S]*v-if="expandedGameId === match\.gameId"/)
  assert.doesNotMatch(source, /import MatchRosterCompact/)
  assert.doesNotMatch(source, /function getTeamPlayers/)
  assert.doesNotMatch(source, /function getCurrentPlayer/)
  assert.doesNotMatch(source, /class="match-card"/)
})

test('match history card layout avoids fixed-width overflow traps', () => {
  const card = readFileSync(new URL('../components/match-history/MatchHistoryCard.vue', import.meta.url), 'utf8')
  const roster = readFileSync(new URL('../components/summoner/MatchRosterCompact.vue', import.meta.url), 'utf8')

  assert.equal(/minmax\(280px|minmax\(420px|minmax\(220px/.test(card), false)
  assert.match(card, /\.match-history-card \{[\s\S]*min-width: 0/)
  assert.match(card, /\.item-row \{[\s\S]*max-width:\s*100%/)
  assert.equal(/minmax\(260px/.test(roster), false)
  assert.match(roster, /\.roster-panel \{[\s\S]*min-width: 0/)
})

test('loadMatchHistory requests fixed twenty-game pages and appends later pages', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')
  const loadFunction = source.match(/async function loadMatchHistory\(options: MatchHistoryLoadOptions = \{\}\)(?:: Promise<MatchHistoryLoadResult \| undefined>)? \{[\s\S]*?(?=async function loadSelectedMatchUserTagSummaries)/)?.[0] || ''

  assert.match(loadFunction, /const puuid = currentSummoner\.value\?\.puuid/)
  assert.match(loadFunction, /const requestedSource = options\.source \?\? 'auto'[\s\S]*const page = options\.page \?\? 1[\s\S]*const append = options\.append === true && page > 1/)
  assert.match(loadFunction, /const pageSize = MATCH_HISTORY_PAGE_SIZE/)
  assert.match(loadFunction, /getMatchHistoryPage\(puuid, \{[\s\S]*page,[\s\S]*pageSize,[\s\S]*source: requestedSource[\s\S]*forceRefresh: options\.forceRefresh === true/)
  assert.match(loadFunction, /matchRecordStatus\.value = response\.recordStatus/)
  assert.match(loadFunction, /hasNext\.value = response\.hasNext === true/)
  assert.match(loadFunction, /applyMatchHistoryPage\(renderableMatches, page, append\)/)
  assert.match(source, /function applyMatchHistoryPage\(matches: MatchHistory\[\], page: number, append: boolean\)/)
  assert.match(source, /appendUniqueMatches\(matchHistory\.value, matches\)/)
})

test('filter changes reset pagination and hydrate local matches before background remote refresh', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')
  const applyDefaultFiltersFunction = source.match(/function applyDefaultFilters\(\) \{[\s\S]*?\n\}/)?.[0] || ''
  const filterFunction = source.match(/async function handleFilterChange\(\) \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(filterFunction, /const requestId = beginMatchHistoryRequest\(\)/)
  assert.match(filterFunction, /collapseInlineDetail\(\)/)
  assert.match(filterFunction, /await hydrateMatchHistoryFromLocalCache\(requestId\)/)
  assert.match(filterFunction, /void refreshRemoteMatchHistory\(\{ forceRefresh: true, requestId \}\)/)
  assert.match(source, /function resetMatchHistoryPagination\(\) \{[\s\S]*currentPage\.value = 0[\s\S]*hasNext\.value = false[\s\S]*loadingMore\.value = false[\s\S]*loadedPages\.value = \[\]/)
  assert.match(source, /function beginMatchHistoryRequest\(\): number \{[\s\S]*resetMatchHistoryPagination\(\)/)
  assert.doesNotMatch(applyDefaultFiltersFunction, /selectedLimit/)
  assert.doesNotMatch(source, /async function handleLimitChange/)
  assert.doesNotMatch(source, /normalizeMatchHistoryLimit/)
})

test('champion filter options use loaded player history while ignoring the active champion filter', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')
  const optionsComputed = source.match(/const loadedChampionOptions = computed\(\(\) =>[\s\S]*?\n\)/)?.[0] || ''
  const applyPageFunction = source.match(/function applyMatchHistoryPage\(matches: MatchHistory\[\], page: number, append: boolean\) \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(source, /const championCandidateMatches = ref<MatchHistory\[\]>\(\[\]\)/)
  assert.match(optionsComputed, /buildLoadedChampionOptions\([\s\S]*championCandidateMatches\.value\.length > 0 \? championCandidateMatches\.value : matchHistory\.value[\s\S]*filterQueueId\.value > 0 \? filterQueueId\.value : undefined/)
  assert.match(applyPageFunction, /if \(filterChampionId\.value <= 0\) \{[\s\S]*championCandidateMatches\.value = append[\s\S]*appendUniqueMatches\(championCandidateMatches\.value, matches\)[\s\S]*: \[\.\.\.matches\]/)
  assert.match(source, /resetPanelState\(\) \{[\s\S]*championCandidateMatches\.value = \[\]/)
})

test('overview stats use independent fifty-game ranked sample while user tags only provide badges', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')
  const overview = readFileSync(new URL('../components/summoner/SummonerOverviewPanel.vue', import.meta.url), 'utf8')

  assert.match(source, /:user-tag="overviewUserTag"/)
  assert.match(source, /:fallback-stats="visibleMatchStats"/)
  assert.match(source, /const overviewLookbackMatches = ref<MatchHistory\[\]>\(\[\]\)/)
  assert.match(source, /const overviewSampleMatches = computed<MatchHistory\[\]>\(\(\) =>\s*selectRecentRankedSample\(getQualityOverviewLookbackMatches\(\), RANKED_OVERVIEW_SAMPLE_LIMIT\)\s*\)/)
  assert.match(source, /function getQualityOverviewLookbackMatches\(\): MatchHistory\[\] \{[\s\S]*return matches\.filter\(match => isRenderableMatchForPuuid\(match, puuid\)\)/)
  assert.match(source, /const visibleMatchStats = computed<RecentPerformanceStats>\(\(\) =>\s*calculateVisibleMatchStats\(overviewSampleMatches\.value, currentSummoner\.value\?\.puuid \|\| ''\)\s*\)/)
  assert.match(source, /function calculateVisibleMatchStats\(matches: MatchHistory\[], puuid: string\): RecentPerformanceStats/)
  assert.match(source, /function getParticipantByPuuid\(match: MatchHistory, puuid: string\): Participant \| null/)
  assert.match(source, /function getTeamKills\(participants: Participant\[], teamId: number\): number/)
  assert.match(source, /function readStatNumber\(value: Stats\[keyof Stats\] \| undefined\): number/)
  assert.match(overview, /const recentPerformanceStats = computed<RecentPerformanceStats \| null>\(\(\) => props\.fallbackStats \?\? null\)/)
  assert.doesNotMatch(overview, /const recent = props\.userTag\?\.recentData/)
})

test('overview stats prefer lightweight summary data while visible matches remain only a fallback', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')

  assert.match(source, /import \{[\s\S]*RANKED_OVERVIEW_SAMPLE_LIMIT,[\s\S]*selectRecentMatchLookback,[\s\S]*selectRecentRankedSample[\s\S]*\} from '@\/utils\/matchHistorySampling'/)
  assert.match(source, /const overviewLookbackMatches = ref<MatchHistory\[\]>\(\[\]\)/)
  assert.match(source, /function applyOverviewLookbackMatches\(matches: MatchHistory\[\]\) \{[\s\S]*matches\.filter\(match => isRenderableMatchForPuuid\(match, puuid\)\)[\s\S]*TAG_OVERVIEW_LOOKBACK_LIMIT/)
  assert.match(source, /calculateVisibleMatchStats\(overviewSampleMatches\.value, currentSummoner\.value\?\.puuid \|\| ''\)/)
  assert.match(source, /const overviewUserTag = ref<UserTag \| null>\(null\)/)
  assert.match(source, /async function loadOverviewUserTagSummary\(puuid: string, requestId = matchHistoryRequestId\)/)
})

test('my match history overview loads lightweight summary tags from prefetched local matches first', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')
  const refreshFunction = source.match(/async function refreshRemoteMatchHistory\(options: MatchHistoryLoadOptions = \{\}\) \{[\s\S]*?async function loadRankSummary/)?.[0] || ''

  assert.doesNotMatch(refreshFunction, /loadUserTagForPanel/)
  assert.doesNotMatch(source, /apiClient\.getUserTagByPuuid\(puuid, TAG_ANALYSIS_MODE\)/)
  assert.match(source, /const overviewUserTag = ref<UserTag \| null>\(null\)/)
  assert.match(refreshFunction, /void loadOverviewUserTagSummary\(puuid, requestId\)/)
  assert.match(source, /const TAG_OVERVIEW_LOOKBACK_LIMIT = 50/)
  assert.match(source, /async function loadOverviewUserTagSummary\(puuid: string, requestId = matchHistoryRequestId\)/)
  assert.match(source, /async function loadOverviewUserTagSummaryFromMatches\(/)
  assert.match(source, /apiClient\.getUserTagSummaryFromMatches\(puuid, matches, TAG_ANALYSIS_MODE/)
  assert.match(source, /apiClient\.getUserTagSummaryBatch\(\[puuid\], TAG_ANALYSIS_MODE/)
})

test('summary tag loading is tracked separately from match history loading', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')
  const loadFunction = source.match(/async function loadMatchHistory\(options: MatchHistoryLoadOptions = \{\}\)(?:: Promise<MatchHistoryLoadResult \| undefined>)? \{[\s\S]*?(?=async function loadSelectedMatchUserTagSummaries)/)?.[0] || ''
  const summaryFunction = source.match(/async function loadSelectedMatchUserTagSummaries\(match: MatchHistory, requestId = matchDetailRequestId\) \{[\s\S]*?function chunkUserTagSummaryPuuids/)?.[0] || ''

  assert.match(source, /const summariesLoading = ref\(false\)/)
  assert.doesNotMatch(loadFunction, /loadVisibleUserTagSummaries|loadSelectedMatchUserTagSummaries/)
  assert.match(source, /void loadSelectedMatchUserTagSummaries\(match, requestId\)/)
  assert.doesNotMatch(source, /await loadSelectedMatchUserTagSummaries/)
  assert.match(summaryFunction, /summariesLoading\.value = true/)
  assert.match(summaryFunction, /summariesLoading\.value = false/)
})

test('refresh button uses remote refresh state instead of shared list loading', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')
  const resetFunction = source.match(/function resetPanelState\(\) \{[\s\S]*?\n\}/)?.[0] || ''
  const beginFunction = source.match(/function beginMatchHistoryRequest\(\): number \{[\s\S]*?\n\}/)?.[0] || ''
  const refreshFunction = source.match(/async function refreshRemoteMatchHistory\(options: MatchHistoryLoadOptions = \{\}\) \{[\s\S]*?async function handleRemoteMatchHistoryFailure/)?.[0] || ''
  const loadFunction = source.match(/async function loadMatchHistory\(options: MatchHistoryLoadOptions = \{\}\)(?:: Promise<MatchHistoryLoadResult \| undefined>)? \{[\s\S]*?(?=async function loadSelectedMatchUserTagSummaries)/)?.[0] || ''

  assert.match(source, /const loading = ref\(false\)/)
  assert.match(source, /const refreshing = ref\(false\)/)
  assert.match(source, /const REFRESHING_INDICATOR_MAX_MS = 30000/)
  assert.match(source, /let activeListLoadingRequestId: number \| null = null/)
  assert.match(source, /let activeRefreshRunId: number \| null = null/)
  assert.match(source, /let refreshIndicatorStopTimer: number \| null = null/)
  assert.match(source, /:aria-label="refreshing \? t\('common\.refreshing'\) : t\('common\.refresh'\)"/)
  assert.match(source, /:loading="refreshing"/)
  assert.doesNotMatch(source, /<RefreshIconButton[\s\S]*:loading="loading"/)
  assert.match(source, /function startListLoading\(requestId: number\)/)
  assert.match(source, /function stopListLoading\(requestId: number\)/)
  assert.match(source, /function clearRefreshIndicatorStopTimer\(\)/)
  assert.match(source, /function startRefreshing\(requestId: number\): number/)
  assert.match(source, /window\.setTimeout\(\(\) => stopRefreshing\(refreshRunId\), REFRESHING_INDICATOR_MAX_MS\)/)
  assert.match(source, /function stopRefreshing\(refreshRunId: number\)/)
  assert.match(source, /function clearMatchHistoryLoadingState\(\)/)
  assert.match(resetFunction, /clearMatchHistoryLoadingState\(\)/)
  assert.match(beginFunction, /clearMatchHistoryLoadingState\(\)/)
  assert.match(refreshFunction, /const refreshRunId = startRefreshing\(requestId\)/)
  assert.match(refreshFunction, /stopRefreshing\(refreshRunId\)/)
  assert.doesNotMatch(refreshFunction, /loading\.value = true/)
  assert.doesNotMatch(refreshFunction, /loading\.value = false/)
  assert.match(loadFunction, /startListLoading\(requestId\)/)
  assert.match(loadFunction, /stopListLoading\(requestId\)/)
})

test('overview summary ignores empty or stale tag payloads before mutating current tag', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')
  const fromMatchesFunction = source.match(/async function loadOverviewUserTagSummaryFromMatches\([\s\S]*?async function loadOverviewUserTagSummary/)?.[0] || ''
  const overviewSummaryFunction = source.match(/async function loadOverviewUserTagSummary\(puuid: string, requestId = matchHistoryRequestId\) \{[\s\S]*?async function loadMatchHistory/)?.[0] || ''

  assert.match(source, /function getUserTagSummarySampleCount\(summary: Pick<UserTagSummary, 'recentData'> \| null \| undefined\): number/)
  assert.match(source, /function hasUsefulUserTagSummary\(summary: UserTagSummary \| null \| undefined\): summary is UserTagSummary/)
  assert.match(source, /function hasUsefulOverviewUserTag\(userTag: UserTag \| null \| undefined\): boolean/)
  assert.match(source, /function shouldKeepExistingOverviewUserTag\(summary: UserTagSummary \| null\): boolean/)
  assert.match(source, /function applyOverviewUserTagSummary\(summary: UserTagSummary \| null\) \{[\s\S]*if \(!hasUsefulUserTagSummary\(summary\)\)[\s\S]*shouldKeepExistingOverviewUserTag\(summary\)[\s\S]*visibleMatchStats\.value\.sampleCount > 0[\s\S]*overviewUserTag\.value = userTagSummaryToUserTag\(summary\)/)
  assert.match(fromMatchesFunction, /if \(abortController\.signal\.aborted \|\| !isActiveOverviewUserTagRequest\(requestId, puuid\) \|\| matches\.length === 0\)/)
  assert.match(overviewSummaryFunction, /if \(abortController\.signal\.aborted \|\| !isActiveOverviewUserTagRequest\(requestId, puuid\)\) \{[\s\S]*return[\s\S]*\}[\s\S]*if \(prefetchedSummary\)/)
  assert.match(overviewSummaryFunction, /if \(abortController\.signal\.aborted \|\| !isActiveOverviewUserTagRequest\(requestId, puuid\)\) \{[\s\S]*return[\s\S]*\}[\s\S]*applyOverviewUserTagSummary\(summaries\[puuid\] \?\? null\)/)
  assert.doesNotMatch(overviewSummaryFunction, /overviewUserTag\.value = null/)
})

test('overview tags come from the summary API without blocking match history loading', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')
  const refreshFunction = source.match(/async function refreshRemoteMatchHistory\(options: MatchHistoryLoadOptions = \{\}\) \{[\s\S]*?async function loadMatchHistory/)?.[0] || ''
  const overviewSummaryFunction = source.match(/async function loadOverviewUserTagSummary\(puuid: string, requestId = matchHistoryRequestId\) \{[\s\S]*?async function loadMatchHistory/)?.[0] || ''

  assert.match(source, /type UserTagLoadStatus = 'idle' \| 'loading' \| 'loaded' \| 'error'/)
  assert.match(source, /const userTagLoadStatus = ref<UserTagLoadStatus>\('idle'\)/)
  assert.match(source, /:user-tag-status="userTagLoadStatus"/)
  assert.match(refreshFunction, /void loadRankSummary\(puuid, requestId\)/)
  assert.match(refreshFunction, /void loadOverviewUserTagSummary\(puuid, requestId\)/)
  assert.match(refreshFunction, /await loadMatchHistoryFromSource\('sgp', options, requestId\)/)
  assert.doesNotMatch(refreshFunction, /loadUserTagForPanel|getUserTagByPuuid/)
  assert.doesNotMatch(refreshFunction, /Promise\.allSettled|throw tagResult\.reason|throw winRatesResult\.reason/)
  assert.match(overviewSummaryFunction, /userTagLoadStatus\.value = 'loading'/)
  assert.match(overviewSummaryFunction, /const prefetchedSummary = await loadOverviewUserTagSummaryFromMatches\(puuid, requestId, abortController\)/)
  assert.match(overviewSummaryFunction, /if \(prefetchedSummary\) \{[\s\S]*applyOverviewUserTagSummary\(prefetchedSummary\)[\s\S]*return/)
  assert.match(overviewSummaryFunction, /const summaries = await apiClient\.getUserTagSummaryBatch\(\[puuid\], TAG_ANALYSIS_MODE/)
  assert.match(overviewSummaryFunction, /applyOverviewUserTagSummary\(summaries\[puuid\] \?\? null\)/)
  assert.match(overviewSummaryFunction, /userTagLoadStatus\.value = 'error'/)
  assert.match(source, /function applyOverviewUserTagSummary\(summary: UserTagSummary \| null\)/)
  assert.match(source, /function userTagSummaryToUserTag\(summary: UserTagSummary\): UserTag/)
  assert.doesNotMatch(source, /async function loadUserTagForPanel|apiClient\.getUserTagByPuuid/)
  assert.doesNotMatch(source, /function buildOverviewUserTagFromMatches|function createRecentDataFromMatches/)
  assert.doesNotMatch(source, /loadRankedWinRatesForPanel|rankedWinRates|getRankedWinRates/)
  assert.doesNotMatch(source, /sgpRankedRecords|loadSgpRankedRecords|calculateSgpRankedRecords/)
  assert.doesNotMatch(source, /:ranked-records=/)
  assert.doesNotMatch(source, /apiClient\.getMatchHistoryPage\(puuid, \{[\s\S]*pageSize:\s*200[\s\S]*source:\s*'sgp'/)
})

test('overview tag summary uses unfiltered local fifty-game cache regardless of visible limit', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')
  const localFunction = source.match(/async function readOverviewLookbackFromLocalCache\(puuid: string\): Promise<MatchHistory\[\]> \{[\s\S]*?(?=async function readOverviewLookbackFromBackend)/)?.[0] || ''
  const backendFunction = source.match(/async function readOverviewLookbackFromBackend\([\s\S]*?(?=async function hydrateOverviewLookbackMatches)/)?.[0] || ''
  const hydrateFunction = source.match(/async function hydrateOverviewLookbackMatches\([\s\S]*?(?=async function refreshRemoteMatchHistory)/)?.[0] || ''
  const resolveFunction = source.match(/async function resolveOverviewUserTagMatches\(puuid: string, requestId: number\): Promise<MatchHistory\[\]> \{[\s\S]*?async function loadOverviewUserTagSummaryFromMatches/)?.[0] || ''

  assert.match(source, /const TAG_OVERVIEW_LOOKBACK_LIMIT = 50/)
  assert.match(localFunction, /readMatchHistoryFromLocalCache\(\{[\s\S]*accountPuuid: puuid,[\s\S]*limit: TAG_OVERVIEW_LOOKBACK_LIMIT,[\s\S]*offset: 0/)
  assert.match(backendFunction, /pageSize: TAG_OVERVIEW_LOOKBACK_LIMIT/)
  assert.doesNotMatch(localFunction + backendFunction + hydrateFunction, /queueId: filterQueueId|championId: filterChampionId|selectedLimit\.value/)
  assert.match(resolveFunction, /await hydrateOverviewLookbackMatches\(requestId\)/)
  assert.match(resolveFunction, /return overviewLookbackMatches\.value/)
  assert.match(resolveFunction, /return selectRecentMatchLookback\(matchHistory\.value, TAG_OVERVIEW_LOOKBACK_LIMIT\)/)
})

test('overview tag summary posts fifty-game lookback instead of current visible matches', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')
  const summaryFunction = source.match(/async function loadOverviewUserTagSummaryFromMatches\([\s\S]*?async function loadOverviewUserTagSummary/)?.[0] || ''

  assert.match(summaryFunction, /const matches = await resolveOverviewUserTagMatches\(puuid, requestId\)/)
  assert.match(summaryFunction, /apiClient\.getUserTagSummaryFromMatches\(puuid, matches, TAG_ANALYSIS_MODE/)
  assert.doesNotMatch(summaryFunction, /matchHistory\.value/)
  assert.doesNotMatch(summaryFunction, /selectedLimit\.value/)
  assert.doesNotMatch(summaryFunction, /filterQueueId|filterChampionId/)
})

test('my match history gates local and remote loading behind LCU connection', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')
  const refreshFunction = source.match(/async function refreshRemoteMatchHistory\(options: MatchHistoryLoadOptions = \{\}\) \{[\s\S]*?async function loadRankSummary/)?.[0] || ''
  const watcher = source.match(/watch\(\s*\(\) => currentSummoner\.value\?\.puuid,[\s\S]*?\{ immediate: true \}/)?.[0] || ''

  assert.match(source, /const lcuConnected = ref\(false\)/)
  assert.match(source, /const lcuConnectionChecked = ref\(false\)/)
  assert.match(source, /async function refreshLcuConnectionStatus\(\): Promise<boolean> \{[\s\S]*apiClient\.checkConnection\(\)/)
  assert.doesNotMatch(source, /apiClient\.isConnected\(\)/)
  assert.match(watcher, /const connected = await refreshLcuConnectionStatus\(\)[\s\S]*if \(!connected \|\| requestId !== matchHistoryRequestId\) \{[\s\S]*return[\s\S]*\}/)
  assert.match(refreshFunction, /connected = await refreshLcuConnectionStatus\(\)[\s\S]*if \(!connected\) \{[\s\S]*return[\s\S]*\}/)
  assert.match(source, /v-if="lcuConnectionChecked && !lcuConnected"/)
})

test('my match history uses the same connection state as the home page before probing LCU', () => {
  const view = readFileSync(new URL('./MatchHistoryView.vue', import.meta.url), 'utf8')
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')
  const refreshConnectionFunction = source.match(/async function refreshLcuConnectionStatus\(\): Promise<boolean> \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(view, /<SummonerMatchHistoryPanel[\s\S]*:connected="gameStore\.connected"/)
  assert.match(source, /connected\?: boolean/)
  assert.match(refreshConnectionFunction, /if \(props\.connected === true && currentSummoner\.value\?\.puuid\) \{[\s\S]*lcuConnected\.value = true[\s\S]*return true/)
  assert.match(refreshConnectionFunction, /apiClient\.checkConnection\(\)/)
  assert.doesNotMatch(refreshConnectionFunction, /apiClient\.isConnected\(\)/)
})

test('my match history disconnected state is title-only without helper copy', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')
  const disconnectedBlock = source.match(/v-if="lcuConnectionChecked && !lcuConnected"[\s\S]*?<\/div>/)?.[0] || ''

  assert.match(disconnectedBlock, /class="state-card inner lcu-disconnected-state surface-glow"/)
  assert.match(disconnectedBlock, /<strong class="lcu-disconnected-title">\{\{ t\('matchHistory\.lcuDisconnectedTitle'\) \}\}<\/strong>/)
  assert.doesNotMatch(disconnectedBlock, /lcuDisconnectedBody|<span>/)
  assert.match(source, /\.lcu-disconnected-title\s*\{[\s\S]*font-size:\s*clamp\(22px,\s*2vw,\s*30px\)/)
})

test('my match history reads local permanent matches before page settings and remote refresh', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')
  const watcher = source.match(/watch\(\s*\(\) => currentSummoner\.value\?\.puuid,[\s\S]*?\{ immediate: true \}/)?.[0] || ''

  assert.match(watcher, /const requestId = matchHistoryRequestId/)
  assert.match(watcher, /await hydrateMatchHistoryFromLocalCache\(requestId\)[\s\S]*void refreshRemoteMatchHistory\(\{ forceRefresh: true, requestId \}\)/)
  assert.doesNotMatch(watcher, /await loadData\(\)/)
  assert.match(source, /async function refreshRemoteMatchHistory\(options: MatchHistoryLoadOptions = \{\}\)/)
})

test('remote match refresh tries SGP, falls back to LCU, then retries SGP once', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')
  const refreshFunction = source.match(/async function refreshRemoteMatchHistory\(options: MatchHistoryLoadOptions = \{\}\) \{[\s\S]*?async function loadRankSummary/)?.[0] || ''

  assert.match(refreshFunction, /await loadMatchHistoryFromSource\('sgp', options, requestId\)/)
  assert.match(refreshFunction, /catch \(sgpErr\)[\s\S]*await loadMatchHistoryFromSource\('lcu', options, requestId\)/)
  assert.match(refreshFunction, /catch \(lcuErr\)[\s\S]*await loadMatchHistoryFromSource\('sgp', options, requestId\)/)
  assert.match(source, /async function loadMatchHistoryFromSource\(\s*source: 'sgp' \| 'lcu',\s*options: MatchHistoryLoadOptions,\s*requestId: number\s*\): Promise<MatchHistoryLoadResult \| undefined>/)
})

test('summary tag loading processes the selected match puuids in transport batches', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')
  const hydrateFunction = source.match(/async function hydrateMatchHistoryFromLocalCache\(requestId = matchHistoryRequestId\): Promise<boolean> \{[\s\S]*?async function persistMatchHistoryToLocalCache/)?.[0] || ''
  const loadHistoryStart = source.indexOf('async function loadMatchHistory')
  const summaryStart = source.indexOf('async function loadSelectedMatchUserTagSummaries')
  const loadHistoryFunction = loadHistoryStart >= 0 && summaryStart > loadHistoryStart
    ? source.slice(loadHistoryStart, summaryStart)
    : ''
  const showDetailFunction = source.match(/async function toggleInlineDetail\(match: MatchHistory\) \{[\s\S]*?function collapseInlineDetail/)?.[0] || ''
  const collectFunction = source.match(/function collectMatchPuuids\(match: MatchHistory\): string\[\] \{[\s\S]*?\n\}/)?.[0] || ''
  const summaryFunction = source.match(/async function loadSelectedMatchUserTagSummaries\(match: MatchHistory, requestId = matchDetailRequestId\) \{[\s\S]*?function chunkUserTagSummaryPuuids/)?.[0] || ''

  assert.match(source, /const USER_TAG_SUMMARY_BATCH_SIZE = \d+/)
  assert.match(source, /function chunkUserTagSummaryPuuids\(puuids: string\[\]\): string\[\]\[\]/)
  assert.match(showDetailFunction, /userTagSummaries\.value = \{\}/)
  assert.match(showDetailFunction, /void loadSelectedMatchUserTagSummaries\(match, requestId\)/)
  assert.doesNotMatch(hydrateFunction, /loadVisibleUserTagSummaries|loadSelectedMatchUserTagSummaries/)
  assert.doesNotMatch(loadHistoryFunction, /loadVisibleUserTagSummaries|loadSelectedMatchUserTagSummaries/)
  assert.match(summaryFunction, /const puuids = collectMatchPuuids\(match\)/)
  assert.match(summaryFunction, /for \(const puuidBatch of chunkUserTagSummaryPuuids\(puuids\)\)/)
  assert.match(summaryFunction, /apiClient\.getUserTagSummaryBatch\(puuidBatch, TAG_ANALYSIS_MODE/)
  assert.match(summaryFunction, /Object\.assign\(mergedSummaries, summaries\)/)
  assert.doesNotMatch(collectFunction, /\.slice\(0,|limit|USER_TAG_SUMMARY_BATCH_SIZE/)
})

test('my match history hides live-match-only tags from overview and detail summaries', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')

  assert.match(source, /const LIVE_MATCH_ONLY_TAG_NAMES = new Set<string>\(\['\\u5f00\\u9ed1'\]\)/)
  assert.match(source, /function filterLiveMatchOnlyTags\(tags: RankTag\[\]\): RankTag\[\]/)
  assert.match(source, /function userTagSummaryToUserTag\(summary: UserTagSummary\): UserTag \{[\s\S]*tag: filterLiveMatchOnlyTags\(summary\.tag\)/)
  assert.match(source, /const visibleUserTagSummaries = computed<Record<string, UserTagSummary>>\(\(\) =>/)
  assert.match(source, /filterUserTagSummaryLiveMatchOnlyTags\(summary\)/)
  assert.match(source, /:user-tag="overviewUserTag"/)
  assert.match(source, /:user-tag-summaries="visibleUserTagSummaries"/)
})

test('summoner match history panel is prop-driven and variant-aware', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')
  const zh = readFileSync(new URL('../i18n/locales/zh-CN.ts', import.meta.url), 'utf8')
  const en = readFileSync(new URL('../i18n/locales/en-US.ts', import.meta.url), 'utf8')

  assert.match(source, /const props = withDefaults\(defineProps<\{[\s\S]*summoner: Summoner \| null[\s\S]*variant\?: 'mine' \| 'lookup'[\s\S]*\}>\(\), \{[\s\S]*variant: 'mine'[\s\S]*\}\)/)
  assert.doesNotMatch(source, /useGameStore|gameStore\./)
  assert.match(source, /const rank = ref<Rank \| null>\(null\)/)
  assert.match(source, /const rankLoadStatus = ref<RankLoadStatus>\('loading'\)/)
  assert.match(source, /const currentSummonerName = computed\(\(\) => maskedFormatSummonerName\(currentSummoner\.value\)\)/)
  assert.match(source, /const soloRank = computed<QueueInfo \| null>\(\(\) => rank\.value\?\.queueMap\?\.RANKED_SOLO_5x5 \|\| null\)/)
  assert.match(source, /const flexRank = computed<QueueInfo \| null>\(\(\) => rank\.value\?\.queueMap\?\.RANKED_FLEX_SR \|\| null\)/)
  assert.match(source, /apiClient\.getRank\(puuid\)/)
  assert.match(source, /:rank-status="rankLoadStatus"/)
  assert.match(zh, /'matchHistory\.lookupTitle':/)
  assert.match(en, /'matchHistory\.lookupTitle':/)
})

test('summoner match history panel resets stale player state and ignores old requests', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')
  const resetFunction = source.match(/function resetPanelState\(\) \{[\s\S]*?\n\}/)?.[0] || ''
  const refreshFunction = source.match(/async function refreshRemoteMatchHistory\(options: MatchHistoryLoadOptions = \{\}\) \{[\s\S]*?\n\}/)?.[0] || ''
  const detailFunction = source.match(/async function toggleInlineDetail\(match: MatchHistory\) \{[\s\S]*?function collapseInlineDetail/)?.[0] || ''

  assert.match(resetFunction, /matchHistoryRequestId \+= 1/)
  assert.match(resetFunction, /matchDetailRequestId \+= 1/)
  assert.match(resetFunction, /rank\.value = null/)
  assert.match(resetFunction, /rankLoadStatus\.value = 'loading'/)
  assert.match(resetFunction, /userTagLoadStatus\.value = 'idle'/)
  assert.match(resetFunction, /matchHistory\.value = \[\]/)
  assert.match(resetFunction, /userTagSummaries\.value = \{\}/)
  assert.match(resetFunction, /expandedGameId\.value = null/)
  assert.match(refreshFunction, /const requestId = options\.requestId \?\? matchHistoryRequestId/)
  assert.doesNotMatch(refreshFunction, /\+\+matchHistoryRequestId/)
  assert.match(refreshFunction, /const puuid = currentSummoner\.value\?\.puuid/)
  assert.match(refreshFunction, /void loadRankSummary\(puuid, requestId\)/)
  assert.match(source, /async function loadRankSummary\(puuid: string, requestId: number\) \{[\s\S]*apiClient\.getRank\(puuid\)[\s\S]*rankLoadStatus\.value = 'loaded'[\s\S]*rankLoadStatus\.value = 'error'/)
  assert.match(refreshFunction, /if \(requestId !== matchHistoryRequestId\) \{[\s\S]*return[\s\S]*\}/)
  assert.match(source, /watch\(\s*\(\) => currentSummoner\.value\?\.puuid,[\s\S]*resetPanelState\(\)[\s\S]*const requestId = matchHistoryRequestId[\s\S]*await hydrateMatchHistoryFromLocalCache\(requestId\)[\s\S]*void refreshRemoteMatchHistory\(\{ forceRefresh: true, requestId \}\)/)
  assert.match(source, /let matchDetailRequestId = 0/)
  assert.match(source, /type DetailLoadStatus = 'idle' \| 'loading' \| 'loaded' \| 'error'/)
  assert.match(source, /const selectedGameDetailStatus = ref<DetailLoadStatus>\('idle'\)/)
  assert.match(source, /:detail-status="selectedGameDetailStatus"/)
  assert.match(detailFunction, /const requestId = \+\+matchDetailRequestId/)
  assert.match(detailFunction, /selectedGameDetailStatus\.value = 'loading'/)
  assert.match(detailFunction, /loadMatchDetailFromLocalCache/)
  assert.match(detailFunction, /persistMatchDetailToLocalCache/)
  assert.match(detailFunction, /selectedGameDetailStatus\.value = 'error'/)
  assert.match(detailFunction, /isActiveMatchDetailRequest\(requestId, matchId\)/)
  assert.match(source, /function isActiveMatchDetailRequest\(requestId: number, matchId: string\): boolean \{[\s\S]*requestId === matchDetailRequestId[\s\S]*String\(expandedGameId\.value\) === matchId[\s\S]*String\(selectedMatchHistory\.value\?\.gameId\) === matchId[\s\S]*\}/)
})

test('match history and summary requests ignore stale responses', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')
  const loadFunction = source.match(/async function loadMatchHistory\(options: MatchHistoryLoadOptions = \{\}\)(?:: Promise<MatchHistoryLoadResult \| undefined>)? \{[\s\S]*?(?=async function loadSelectedMatchUserTagSummaries)/)?.[0] || ''
  const summaryFunction = source.match(/async function loadSelectedMatchUserTagSummaries\(match: MatchHistory, requestId = matchDetailRequestId\) \{[\s\S]*?function chunkUserTagSummaryPuuids/)?.[0] || ''

  assert.match(source, /let matchHistoryRequestId = 0/)
  assert.match(source, /let summariesAbortController: AbortController \| null = null/)
  assert.match(loadFunction, /const requestId = options\.requestId \?\? matchHistoryRequestId/)
  assert.match(loadFunction, /if \(requestId !== matchHistoryRequestId\) \{[\s\S]*return[\s\S]*\}/)
  assert.match(source, /function stopListLoading\(requestId: number\) \{[\s\S]*if \(activeListLoadingRequestId !== requestId\)[\s\S]*loading\.value = false[\s\S]*\}/)
  assert.match(source, /function stopRefreshing\(refreshRunId: number\) \{[\s\S]*if \(activeRefreshRunId !== refreshRunId\)[\s\S]*refreshing\.value = false[\s\S]*\}/)
  assert.match(summaryFunction, /summariesAbortController\?\.abort\(\)/)
  assert.match(summaryFunction, /if \(abortController\.signal\.aborted \|\| !isActiveUserTagSummaryRequest\(requestId, matchId\)\) \{[\s\S]*return[\s\S]*\}/)
  assert.match(summaryFunction, /if \(isActiveUserTagSummaryRequest\(requestId, matchId\)\) \{[\s\S]*userTagSummaries\.value = \{ \.\.\.mergedSummaries \}[\s\S]*\}/)
})

test('my match history hydrates from local cache and persists remote matches before display refresh', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')
  const loadFunction = source.match(/async function loadMatchHistory\(options: MatchHistoryLoadOptions = \{\}\)(?:: Promise<MatchHistoryLoadResult \| undefined>)? \{[\s\S]*?(?=async function loadSelectedMatchUserTagSummaries)/)?.[0] || ''
  const failureFunction = source.match(/async function handleRemoteMatchHistoryFailure\(requestId: number, err: unknown\) \{[\s\S]*?\n\}/)?.[0] || ''
  const watcher = source.match(/watch\(\s*\(\) => currentSummoner\.value\?\.puuid,[\s\S]*?\{ immediate: true \}/)?.[0] || ''

  assert.match(source, /import \{[\s\S]*readMatchHistoryFromLocalCache,[\s\S]*writeMatchHistoryToLocalCache[\s\S]*\} from '@\/services\/localMatchCache'/)
  assert.match(source, /localCacheEnabled\?: boolean/)
  assert.match(source, /localCacheEnabled: false/)
  assert.match(source, /function shouldUseLocalMatchCache\(\) \{[\s\S]*\(props\.variant === 'mine' \|\| props\.localCacheEnabled === true\)[\s\S]*window\.electronAPI\?\.database/)
  assert.match(source, /async function hydrateMatchHistoryFromLocalCache\(\s*requestId = matchHistoryRequestId,\s*options: MatchHistoryHydrateOptions = \{\}\s*\): Promise<boolean> \{/)
  assert.match(source, /limit: MATCH_HISTORY_PAGE_SIZE/)
  assert.match(source, /offset: getMatchHistoryPageOffset\(page\)/)
  assert.match(watcher, /const requestId = matchHistoryRequestId[\s\S]*await hydrateMatchHistoryFromLocalCache\(requestId\)[\s\S]*void refreshRemoteMatchHistory\(\{ forceRefresh: true, requestId \}\)/)
  assert.doesNotMatch(watcher, /await ensurePageSettingsLoaded\(\)[\s\S]*void refreshRemoteMatchHistory/)
  assert.match(loadFunction, /await persistMatchHistoryToLocalCache\(renderableMatches\)[\s\S]*await hydrateMatchHistoryFromLocalCache\(requestId, \{ page, append \}\)/)
  assert.match(loadFunction, /void loadOverviewUserTagSummary\(puuid, requestId\)/)
  assert.doesNotMatch(loadFunction, /void persistMatchHistoryToLocalCache\(matches\)/)
  assert.match(failureFunction, /const hasCachedMatches = await hydrateMatchHistoryFromLocalCache\(requestId\)/)
  assert.match(failureFunction, /if \(!hadVisibleMatches && !hasCachedMatches\) \{[\s\S]*matchHistory\.value = \[\]/)
})

test('remote match results are persisted then local cache is rehydrated for display', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')
  const loadFunction = source.match(/async function loadMatchHistory\(options: MatchHistoryLoadOptions = \{\}\)(?:: Promise<MatchHistoryLoadResult \| undefined>)? \{[\s\S]*?(?=async function loadSelectedMatchUserTagSummaries)/)?.[0] || ''

  assert.match(loadFunction, /await persistMatchHistoryToLocalCache\(renderableMatches\)/)
  assert.match(loadFunction, /await hydrateMatchHistoryFromLocalCache\(requestId, \{ page, append \}\)/)
  assert.doesNotMatch(loadFunction, /matchHistory\.value = matches/)
})

test('remote match results must include the current player before persistence', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')

  assert.match(source, /async function assertRenderableMatchHistory\(\s*matches: MatchHistory\[\],\s*puuid: string,\s*requestId = matchHistoryRequestId\s*\): Promise<MatchHistory\[\]>/)
  assert.match(source, /console\.warn\(`Match history response is missing current player stats for game/)
  assert.doesNotMatch(source, /throw new Error\(`Match history response is missing current player stats for game/)
  assert.match(source, /const renderableMatches = await assertRenderableMatchHistory\(matches, puuid, requestId\)[\s\S]*matchRecordStatus\.value = response\.recordStatus[\s\S]*await persistMatchHistoryToLocalCache\(renderableMatches\)/)
})

test('my match history rehydrates local data when backend reports match-history cache updates', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')

  assert.match(source, /import \{ wsClient \} from '@\/api\/websocketClient'/)
  assert.match(source, /let unsubscribeCacheUpdate: \(\(\) => void\) \| null = null/)
  assert.match(source, /function isMatchHistoryCacheUpdateRelevant\(event: CacheUpdateEvent\): boolean/)
  assert.match(source, /updatedScopes\?\.includes\('matchHistory'\)/)
  assert.match(source, /unsubscribeCacheUpdate = wsClient\.onCacheUpdate\(async \(event: CacheUpdateEvent\) => \{[\s\S]*await hydrateMatchHistoryFromLocalCache\(\)/)
})

test('match history refresh button uses the shared refresh icon button', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')

  assert.match(source, /import RefreshIconButton from '@\/components\/common\/RefreshIconButton\.vue'/)
  assert.match(source, /<RefreshIconButton[\s\S]*:aria-label="refreshing \? t\('common\.refreshing'\) : t\('common\.refresh'\)"[\s\S]*:loading="refreshing"[\s\S]*:disabled="!currentSummoner"[\s\S]*@click="handleRefresh"/)
  assert.doesNotMatch(source, /<RefreshIconButton[\s\S]*class="control-glow"/)
  assert.doesNotMatch(source, /:deep\(\.refresh-icon-btn/)
  assert.match(source, /async function handleRefresh\(\) \{[\s\S]*const requestId = beginMatchHistoryRequest\(\)[\s\S]*await hydrateMatchHistoryFromLocalCache\(requestId\)[\s\S]*void refreshRemoteMatchHistory\(\{ forceRefresh: true, requestId \}\)/)
  assert.doesNotMatch(source, /<button[\s\S]*class="refresh-icon-btn"[\s\S]*@click="loadData"[\s\S]*<\/button>/)
})

test('remote refresh failures keep already displayed local matches and show cache notice', () => {
  const source = readFileSync(new URL('../components/summoner/SummonerMatchHistoryPanel.vue', import.meta.url), 'utf8')
  const failureFunction = source.match(/async function handleRemoteMatchHistoryFailure\(requestId: number, err: unknown\) \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(source, /v-if="matchHistory\.length && matchRecordStatus === 'ERROR'"/)
  assert.match(source, /t\('matchHistory\.refreshFailedUsingCache'\)/)
  assert.match(failureFunction, /const hadVisibleMatches = matchHistory\.value\.length > 0/)
  assert.match(failureFunction, /const hasCachedMatches = await hydrateMatchHistoryFromLocalCache\(requestId\)/)
  assert.match(failureFunction, /if \(!hadVisibleMatches && !hasCachedMatches\) \{[\s\S]*matchHistory\.value = \[\]/)
  assert.doesNotMatch(failureFunction, /userTagSummaries\.value = \{\}/)
  assert.doesNotMatch(failureFunction, /overviewUserTag\.value = null/)
})

test('match history view delegates logged-in body to summoner match history panel', () => {
  const source = readFileSync(new URL('./MatchHistoryView.vue', import.meta.url), 'utf8')

  assert.match(source, /import SummonerMatchHistoryPanel from '@\/components\/summoner\/SummonerMatchHistoryPanel\.vue'/)
  assert.match(source, /<SummonerMatchHistoryPanel[\s\S]*:summoner="currentSummoner"[\s\S]*variant="mine"[\s\S]*\/>/)
  assert.match(source, /const currentSummoner = computed\(\(\) => gameStore\.currentSummoner\)/)
  assert.doesNotMatch(source, /import SummonerOverviewPanel/)
  assert.doesNotMatch(source, /import MatchHistoryCard/)
  assert.doesNotMatch(source, /import MatchDetailModal/)
  assert.doesNotMatch(source, /async function loadMatchHistory/)
  assert.doesNotMatch(source, /async function loadVisibleUserTagSummaries/)
})

test('match history view forwards postgame auto-open token to the panel', () => {
  const source = readFileSync(new URL('./MatchHistoryView.vue', import.meta.url), 'utf8')

  assert.match(source, /import \{ postgameAutoOpenLatestMatchToken \} from '@\/services\/gameflowAutoNavigation'/)
  assert.match(source, /:auto-open-latest-match-token="postgameAutoOpenLatestMatchToken"/)
  assert.match(source, /variant="mine"/)
})
