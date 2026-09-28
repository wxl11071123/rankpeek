import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('keeps relationship rows compact, wrapping, and text-safe', () => {
  const source = readFileSync(new URL('./SummonerOverviewPanel.vue', import.meta.url), 'utf8')

  assert.match(source, /<section\s+v-if="hasRelationships"\s+class="relationship-section"/)
  assert.match(source, /\.relationship-section\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*wrap;[\s\S]*gap:\s*10px 18px;/)
  assert.match(source, /\.relationship-list\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*wrap;/)
  assert.match(source, /\.relationship-item\s*\{[\s\S]*display:\s*inline-grid;[\s\S]*grid-template-columns:\s*20px minmax\(54px,\s*auto\) auto;/)
  assert.match(source, /\.relationship-name\s*\{[\s\S]*max-width:\s*96px;[\s\S]*text-overflow:\s*ellipsis;/)
})

test('keeps embedded overview as a modifier hook without stale card wrappers', () => {
  const source = readFileSync(new URL('./SummonerOverviewPanel.vue', import.meta.url), 'utf8')

  assert.match(source, /<div\s+class="overview-panel"\s+:class="\{ embedded: props\.embedded \}"/)
  assert.doesNotMatch(source, /\.overview-panel\.embedded\s*>\s*\.user-card/)
  assert.doesNotMatch(source, /class="user-card"/)
  assert.doesNotMatch(source, /class="rank-card"/)
})

test('renders rank summary as compact rows beside recent stats', () => {
  const source = readFileSync(new URL('./SummonerOverviewPanel.vue', import.meta.url), 'utf8')

  assert.match(source, /const rankItems = computed\(\(\) => \[/)
  assert.match(source, /label:\s*t\('overview\.soloQueue'\)/)
  assert.match(source, /label:\s*t\('overview\.flexQueue'\)/)
  assert.match(source, /display:\s*buildRankDisplay\(props\.soloRank,\s*props\.rankStatus,\s*rankDisplayText\.value\)/)
  assert.match(source, /display:\s*buildRankDisplay\(props\.flexRank,\s*props\.rankStatus,\s*rankDisplayText\.value\)/)
  assert.match(source, /<article[\s\S]*v-for="rank in rankItems"[\s\S]*class="rank-item"/)
  assert.match(source, /<img\s+class="rank-img"\s+:src="getTierIcon\(rank\.display\.iconTier\)"\s+alt=""\s*\/?>/)
  assert.match(source, /\.rank-section\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)[\s\S]*max-width:\s*230px/)
  assert.match(source, /\.rank-item\s*\{[\s\S]*grid-template-columns:\s*42px minmax\(0,\s*1fr\)[\s\S]*min-width:\s*0/)
  assert.match(source, /\.rank-img\s*\{[\s\S]*width:\s*42px;[\s\S]*height:\s*42px;/)
})

test('does not merge SGP ranked records into rank row copy', () => {
  const source = readFileSync(new URL('./SummonerOverviewPanel.vue', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /rankedRecords\?: Partial<Record<RankedQueueKey,\s*WinRate>>/)
  assert.doesNotMatch(source, /function withSgpRankedRecord/)
  assert.doesNotMatch(source, /props\.rankedRecords/)
  assert.doesNotMatch(source, /games:\s*wins \+ losses/)
  assert.doesNotMatch(source, /totalGames:\s*wins \+ losses/)
})

test('formats tier labels through the shared rank display helper', () => {
  const source = readFileSync(new URL('./SummonerOverviewPanel.vue', import.meta.url), 'utf8')
  const helper = readFileSync(new URL('../../utils/rankDisplay.ts', import.meta.url), 'utf8')
  const zh = readFileSync(new URL('../../i18n/locales/zh-CN.ts', import.meta.url), 'utf8')

  assert.match(source, /import \{ buildRankDisplay,\s*type RankLoadStatus,\s*type RankDisplayText \} from '@\/utils\/rankDisplay'/)
  assert.match(helper, /PLATINUM:\s*'铂金'/)
  assert.match(helper, /EMERALD:\s*'翡翠'/)
  assert.match(helper, /MASTER:\s*'超凡大师'/)
  assert.match(helper, /CHALLENGER:\s*'最强王者'/)
  assert.match(zh, /'overview\.rankLoading':\s*'段位加载中'/)
  assert.match(zh, /'overview\.rankFailed':\s*'段位获取失败'/)
  assert.match(zh, /'overview\.rankNoData':\s*'暂无排位数据'/)
})

test('stacks rank row copy in a compact vertical order', () => {
  const source = readFileSync(new URL('./SummonerOverviewPanel.vue', import.meta.url), 'utf8')

  assert.match(source, /<div class="rank-copy">\s*<strong class="rank-tier">\{\{ rank\.display\.tierText \}\}<\/strong>\s*<span\s+v-if="rank\.display\.recordText"\s+class="rank-record"\s*>\{\{ rank\.display\.recordText \}\}<\/span>\s*<\/div>/)
  assert.match(source, /\.rank-copy\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;/)
  assert.match(source, /\.rank-tier\s*\{[\s\S]*font-size:\s*13px;[\s\S]*text-overflow:\s*ellipsis;/)
  assert.match(source, /\.rank-record\s*\{[\s\S]*font-size:\s*11px;[\s\S]*text-overflow:\s*ellipsis;/)
  assert.doesNotMatch(source, /class="win-rate-badge"/)
})

test('does not turn missing rank requests into fake zero-win unranked rows', () => {
  const source = readFileSync(new URL('./SummonerOverviewPanel.vue', import.meta.url), 'utf8')

  assert.match(source, /rankStatus\?: RankLoadStatus/)
  assert.match(source, /rankStatus:\s*'loaded'/)
  assert.doesNotMatch(source, /rankedWinRates/)
  assert.doesNotMatch(source, /rankedWinRates\?\.RANKED_SOLO_5x5\?\.wins \|\| 0/)
  assert.doesNotMatch(source, /rankedWinRates\?\.RANKED_FLEX_SR\?\.losses \|\| 0/)
  assert.doesNotMatch(source, /getRankLine\(rank\.wins,\s*rank\.losses\)/)
})

test('keeps recent performance stats dense and sample-count aware', () => {
  const source = readFileSync(new URL('./SummonerOverviewPanel.vue', import.meta.url), 'utf8')

  assert.match(source, /<section\s+v-if="statBlocks\.length"\s+class="stats-section"/)
  assert.match(source, /<span class="sample-count">\{\{ t\('overview\.recentStatsSample', \{ count: recentStatsSampleCount \}\) \}\}<\/span>/)
  assert.match(source, /\.stats-section\s*\{[\s\S]*grid-template-columns:\s*repeat\(5,\s*minmax\(50px,\s*1fr\)\)/)
  assert.match(source, /\.stat-block\s*\{[\s\S]*flex-direction:\s*column;[\s\S]*align-items:\s*flex-start;/)
  assert.match(source, /\.stat-value\s*\{[\s\S]*font-size:\s*clamp\(19px,\s*1\.8vw,\s*24px\)/)
})

test('recent performance stats always use visible-match fallback so tag loading cannot replace them', () => {
  const source = readFileSync(new URL('./SummonerOverviewPanel.vue', import.meta.url), 'utf8')

  assert.match(source, /fallbackStats\?: RecentPerformanceStats \| null/)
  assert.match(source, /fallbackStats:\s*null/)
  assert.match(source, /const recentPerformanceStats = computed<RecentPerformanceStats \| null>\(\(\) => props\.fallbackStats \?\? null\)/)
  assert.doesNotMatch(source, /const recent = props\.userTag\?\.recentData/)
  assert.doesNotMatch(source, /wins \/ sampleCount/)
  assert.match(source, /const recentStatsSampleCount = computed\(\(\) => recentPerformanceStats\.value\?\.sampleCount \?\? 0\)/)
  assert.match(source, /function formatOptionalCompactNumber\(value\?: number \| null\): string \{[\s\S]*return '--'/)
  assert.match(source, /function formatOptionalDecimal\(value\?: number \| null\): string \{[\s\S]*return '--'/)
  assert.match(source, /function formatOptionalPercent\(value\?: number \| null\): string \{[\s\S]*return '--'/)
})

test('tag area shows a status fallback instead of staying blank', () => {
  const source = readFileSync(new URL('./SummonerOverviewPanel.vue', import.meta.url), 'utf8')

  assert.match(source, /type UserTagLoadStatus = 'idle' \| 'loading' \| 'loaded' \| 'error'/)
  assert.match(source, /userTagStatus\?: UserTagLoadStatus/)
  assert.match(source, /userTagStatus:\s*'idle'/)
  assert.match(source, /const hasFallbackStats = computed\(\(\) => recentStatsSampleCount\.value > 0\)/)
  assert.match(source, /case 'ERROR':[\s\S]*if \(!hasFallbackStats\.value\) \{[\s\S]*label:\s*t\('badge\.error'\)[\s\S]*className:\s*'error'/)
  assert.match(source, /props\.userTagStatus === 'error' && !hasFallbackStats\.value[\s\S]*label:\s*t\('badge\.error'\)[\s\S]*className:\s*'error'/)
  assert.match(source, /props\.userTagStatus === 'loaded' && !props\.userTag\?\.tag\?\.length[\s\S]*label:\s*t\('badge\.noTags'\)[\s\S]*className:\s*'empty'/)
  assert.match(source, /<span\s+v-if="statusMeta\(\)"\s+class="status-chip"/)
})

test('keeps summoner riot id parts on one inline row', () => {
  const source = readFileSync(new URL('./SummonerOverviewPanel.vue', import.meta.url), 'utf8')

  assert.match(source, /<div class="riot-id-line">\s*<span class="user-name">\{\{ privacyMode \? fullName\(\) : summoner\.gameName \}\}<\/span>\s*<button\s+v-if="!privacyMode"\s+class="riot-id"/)
  assert.match(source, /\.riot-id-line\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*nowrap;[\s\S]*min-width:\s*0;/)
  assert.match(source, /\.user-name\s*\{[\s\S]*min-width:\s*0;[\s\S]*white-space:\s*nowrap;/)
  assert.match(source, /\.riot-id\s*\{[\s\S]*flex:\s*0 1 auto;[\s\S]*white-space:\s*nowrap;/)
})

test('uses compact relationship visuals that fit the overview row', () => {
  const source = readFileSync(new URL('./SummonerOverviewPanel.vue', import.meta.url), 'utf8')

  assert.match(source, /\.relationship-title\s*\{[\s\S]*font-size:\s*11px;/)
  assert.match(source, /\.relationship-avatar\s*\{[\s\S]*width:\s*20px;[\s\S]*height:\s*20px;/)
  assert.match(source, /\.relationship-item\s*\{[\s\S]*font-size:\s*11px;/)
  assert.match(source, /\.relationship-rate\s*\{[\s\S]*font-weight:\s*700;/)
  assert.doesNotMatch(source, /\.section-header\s*\{/)
})
