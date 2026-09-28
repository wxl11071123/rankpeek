import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const removedScoutLabels = ['\u66b4\u6bd9', '\u6446\u70c2', '\u5f00\u9ed1\u4ed4']

test('player card is clickable to toggle recent matches while preserving tag hover popovers', () => {
  const source = readFileSync(new URL('./PlayerCard.vue', import.meta.url), 'utf8')

  assert.match(source, /selected\?: boolean/)
  assert.match(source, /'select-player'/)
  assert.match(source, /role="button"/)
  assert.match(source, /tabindex="0"/)
  assert.match(source, /:aria-pressed="selected"/)
  assert.match(source, /@click="onCardClick"/)
  assert.match(source, /@keydown\.enter\.prevent="onCardClick"/)
  assert.match(source, /@keydown\.space\.prevent="onCardClick"/)
  assert.match(source, /function onCardClick\(\)/)
  assert.match(source, /class="player-id"[\s\S]{0,180}@click\.stop="navigateToSummonerLookup"/)
  assert.match(source, /class="more-chip" type="button"[\s\S]*@click\.stop/)
  assert.match(source, /\.tag-overflow:hover \.hidden-tags-popover,/)
  assert.match(source, /\.player-card\.selected/)
})

test('player card renders inline gaming AI insight only when content exists', () => {
  const source = readFileSync(new URL('./PlayerCard.vue', import.meta.url), 'utf8')

  assert.match(source, /import type \{ GamingAiPlayerInsightEvent \} from '@\/services\/gamingAiServerStream'/)
  assert.match(source, /aiInsight\?: GamingAiPlayerInsightEvent \| null/)
  assert.match(source, /aiLoading\?: boolean/)
  assert.match(source, /aiError\?: string/)
  assert.match(source, /const hasAiInlineContent = computed\(\(\) => Boolean\(props\.aiInsight \|\| props\.aiLoading \|\| props\.aiError\)\)/)
  assert.match(source, /const aiInlineToneClass = computed\(\(\) => `tone-\$\{props\.aiInsight\?\.tone \|\| 'unknown'\}`\)/)
  assert.match(source, /v-if="hasAiInlineContent"/)
  assert.match(source, /class="player-ai-insight"/)
  assert.match(source, /:class="aiInlineToneClass"/)
  assert.match(source, /v-if="props\.aiInsight"/)
  assert.match(source, /{{ props\.aiInsight\.label }}/)
  assert.match(source, /{{ props\.aiInsight\.text }}/)
  assert.match(source, /v-else-if="props\.aiLoading"/)
  assert.match(source, /AI 分析中/)
  assert.match(source, /v-else-if="props\.aiError"/)
  assert.match(source, /\.player-ai-insight\s*\{/)
  assert.match(source, /\.player-ai-label\s*\{/)
})

test('player id navigates to match lookup without toggling the recent panel', () => {
  const source = readFileSync(new URL('./PlayerCard.vue', import.meta.url), 'utf8')

  assert.match(source, /import \{ useRouter \} from 'vue-router'/)
  assert.match(source, /import \{ buildSummonerLookupName, createSummonerLookupRoute \} from '@\/utils\/summonerLookupRoute'/)
  assert.match(source, /const router = useRouter\(\)/)
  assert.match(source, /const summonerLookupName = computed\(\(\) => buildSummonerLookupName\(props\.sessionSummoner\.summoner\)\)/)
  assert.match(source, /const canNavigateToSummonerLookup = computed\(\(\) => Boolean\(summonerLookupName\.value\)\)/)
  assert.match(source, /class="player-id"[\s\S]*@click\.stop="navigateToSummonerLookup"/)
  assert.match(source, /class="player-id"[\s\S]*@keydown\.enter\.stop/)
  assert.match(source, /class="player-id"[\s\S]*@keydown\.space\.stop/)
  assert.match(source, /\.player-id\s*{[\s\S]*align-self:\s*flex-start;[\s\S]*width:\s*fit-content;/)
  assert.match(source, /function navigateToSummonerLookup\(\)[\s\S]*createSummonerLookupRoute\(summonerLookupName\.value\)[\s\S]*router\.push\(route\)/)
  assert.doesNotMatch(source, /function navigateToSummonerLookup\(\)[\s\S]*emit\('selectPlayer'\)/)
})

test('shows the Riot ID on one line and packs tags beside the rank before folding extras', () => {
  const source = readFileSync(new URL('./PlayerCard.vue', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /const INLINE_TAG_LIMIT = 2/)
  assert.match(source, /ref="tagContainerRef"/)
  assert.match(source, /ref="tagMeasureRef"/)
  assert.match(source, /function updateVisibleTagCount/)
  assert.match(source, /new ResizeObserver/)
  assert.match(source, /data-tag-measure/)
  assert.match(source, /data-overflow-measure/)
  assert.match(source, /visibleUserTags/)
  assert.match(source, /hiddenUserTags/)
  assert.match(source, /hiddenUserTagCount/)
  assert.match(source, /class="more-chip"/)
  assert.match(source, /\.name-tags\s*{[\s\S]*flex-wrap:\s*nowrap;/)
  assert.match(source, /class="meta-row"[\s\S]*class="tier-row"[\s\S]*class="name-tags"/)
  assert.match(source, /const summonerLookupName = computed\(\(\) => buildSummonerLookupName\(props\.sessionSummoner\.summoner\)\)/)
  assert.match(source, /const playerIdText = computed\(\(\) => summonerLookupName\.value \|\|/)
  assert.match(source, /{{ playerIdText }}/)
})

test('renders scout tags from sessionSummoner defensively without old label names', () => {
  const source = readFileSync(new URL('./PlayerCard.vue', import.meta.url), 'utf8')

  assert.match(source, /import type \{ QueueInfo, RankTag, RecordStatus, SessionSummoner \}/)
  assert.match(source, /props\.sessionSummoner\.userTag\?\.tag \|\| \[\]/)
  assert.match(source, /filter\([\s\S]*Boolean\(tag\?\.tagName\?\.trim\(\)\)[\s\S]*tag\.tagName !== '开黑'[\s\S]*\)/)
  assert.match(source, /:title="tag\.tagDesc \|\| tag\.tagName"/)
  assert.match(source, /tag\.good === true \? 'good' : tag\.good === false \? 'bad' : 'neutral'/)
  assert.doesNotMatch(source, new RegExp(removedScoutLabels.join('|')))
})

test('keeps long and many scout tags inside the player card', () => {
  const source = readFileSync(new URL('./PlayerCard.vue', import.meta.url), 'utf8')

  assert.match(source, /\.name-tags\s*{[\s\S]*max-width:\s*100%;[\s\S]*min-width:\s*0;/)
  assert.match(source, /\.visible-tags\s*{[\s\S]*min-width:\s*0;[\s\S]*overflow:\s*hidden;/)
  assert.match(source, /\.hidden-tags-popover\s*{[\s\S]*max-width:\s*min\(260px, 70vw\);[\s\S]*flex-wrap:\s*wrap;/)
  assert.match(source, /\.tag-chip\s*{[\s\S]*box-sizing:\s*border-box;[\s\S]*min-width:\s*0;[\s\S]*max-width:\s*min\(132px, 100%\);[\s\S]*text-overflow:\s*ellipsis;/)
})

test('keeps the damage conversion metric visible in compact gaming cards', () => {
  const source = readFileSync(new URL('./PlayerCard.vue', import.meta.url), 'utf8')

  assert.match(source, /<span>伤转率<\/span>/)
  assert.match(source, /\.scout-metrics\s*{[\s\S]*flex-wrap:\s*wrap;[\s\S]*overflow:\s*visible;/)
  assert.match(source, /\.metric-item\s*{[\s\S]*flex:\s*1 1 76px;[\s\S]*min-width:\s*max-content;/)
  assert.match(source, /\.metric-separator\s*{[\s\S]*display:\s*none;/)
})

test('player card prioritizes current champion scout metrics when available', () => {
  const source = readFileSync(new URL('./PlayerCard.vue', import.meta.url), 'utf8')
  const types = readFileSync(new URL('../../types/api.ts', import.meta.url), 'utf8')

  assert.match(types, /championRecentData\?: RecentData \| null/)
  assert.match(source, /const championRecentData = computed\(\(\) => props\.sessionSummoner\.userTag\?\.championRecentData \|\| null\)/)
  assert.match(source, /const activeRecentData = computed\(\(\) => hasChampionRecentData\.value[\s\S]*championRecentData\.value[\s\S]*props\.sessionSummoner\.userTag\?\.recentData/)
  assert.match(source, /v-if="hasChampionRecentData"[\s\S]*class="metric-scope"[\s\S]*title="当前英雄数据"[\s\S]*aria-label="当前英雄数据"/)
  assert.match(source, />当前英雄</)
  assert.match(source, /activeRecentData\.value\?\.selectWins/)
  assert.match(source, /activeRecentData\.value\?\.kda/)
  assert.match(source, /activeRecentData\.value\?\.averageDamageDealtToChampions/)
})

test('moves pre-group marker to the id row and filters the premade scout tag', () => {
  const source = readFileSync(new URL('./PlayerCard.vue', import.meta.url), 'utf8')

  assert.match(source, /tag\.tagName !== '开黑'/)
  assert.doesNotMatch(source, /<div class="avatar-wrap">[\s\S]*preGroupMarkers\?\.name[\s\S]*<\/div>\s*<div class="player-copy">/)
  assert.match(source, /class="player-id-row"[\s\S]*class="pregroup-badge"[\s\S]*sessionSummoner\.preGroupMarkers\.name/)
  assert.match(source, /\.player-id-row\s*{[\s\S]*display:\s*flex;[\s\S]*justify-content:\s*space-between;/)
  const badgeBlock = source.match(/\.pregroup-badge\s*{[\s\S]*?}/)?.[0] || ''
  assert.doesNotMatch(badgeBlock, /position:\s*absolute;/)
})

test('player card fetches cached exact-tier 101 meta only for current champion samples', () => {
  const source = readFileSync(new URL('./PlayerCard.vue', import.meta.url), 'utf8')
  const dataClient = readFileSync(new URL('../../services/rankpeekDataClient.ts', import.meta.url), 'utf8')

  assert.match(dataClient, /export interface CnChampionMeta/)
  assert.match(dataClient, /const championMetaCache = new Map<string, Promise<CnChampionMeta \| null>>\(\)/)
  assert.match(dataClient, /getLatestChampionMeta\(championId: number, tierScope: string\)/)
  assert.match(dataClient, /\/api\/v1\/cn-meta\/champions\/\$\{encodeURIComponent\(String\(championId\)\)\}\/latest\?tierScope=/)
  assert.match(dataClient, /championMetaCache\.has\(cacheKey\)/)

  assert.match(source, /import \{ getLatestChampionMeta, type CnChampionMeta \} from '@\/services\/rankpeekDataClient'/)
  assert.match(source, /const cnMeta = ref<CnChampionMeta \| null>\(null\)/)
  assert.match(source, /const exactTierScope = computed\(\(\) =>/)
  assert.match(source, /const shouldFetchCnMeta = computed\(\(\) =>/)
  assert.match(source, /hasChampionRecentData\.value/)
  assert.match(source, /props\.sessionSummoner\.championId > 0/)
  assert.match(source, /void loadCnMeta\(\)/)
  assert.match(source, /getLatestChampionMeta\(championId, tierScope\)/)
})

test('player card colors KDA and damage conversion from 101 baseline with a five percent band', () => {
  const source = readFileSync(new URL('./PlayerCard.vue', import.meta.url), 'utf8')

  assert.match(source, /function getBaselineMetricTone\(value: number \| null, baseline: number \| null\): MetricTone/)
  assert.match(source, /const high = baseline \* 1\.05/)
  assert.match(source, /const low = baseline \* 0\.95/)
  assert.match(source, /const cnMetaKdaValue = computed/)
  assert.match(source, /cnMeta\.value\?\.avgKda/)
  assert.match(source, /const cnMetaDamageConversionRate = computed/)
  assert.match(source, /cnMeta\.value\?\.avgDamage/)
  assert.match(source, /cnMeta\.value\?\.avgGold/)
  assert.match(source, /const kdaTone = computed\(\(\) => getBaselineMetricTone\(kdaValue\.value, cnMetaKdaValue\.value\)\)/)
  assert.match(source, /const damageRateTone = computed\(\(\) => getBaselineMetricTone\(damageConversionRate\.value, cnMetaDamageConversionRate\.value\)\)/)
  assert.match(source, /const winRateTone = computed\(\(\) => getMetricTone\(winRateValue\.value, 45, 55\)\)/)
})

test('session tag API types accept nullable or omitted scout fields', () => {
  const source = readFileSync(new URL('../../types/api.ts', import.meta.url), 'utf8')

  assert.match(source, /good\?: boolean \| null/)
  assert.match(source, /tagDesc\?: string/)
  assert.match(source, /userTag\?: UserTag \| null/)
})

test('formats gaming rank labels with shared unicode roman division labels', () => {
  const source = readFileSync(new URL('./PlayerCard.vue', import.meta.url), 'utf8')

  assert.match(source, /import \{ formatRankDivisionLabel \} from '@\/utils\/rankDisplay'/)
  assert.match(source, /PLATINUM:\s*'铂金'/)
  assert.match(source, /DIAMOND:\s*'钻石'/)
  assert.match(source, /MASTER:\s*'超凡大师'/)
  assert.match(source, /GRANDMASTER:\s*'傲世宗师'/)
  assert.match(source, /CHALLENGER:\s*'最强王者'/)
  assert.doesNotMatch(source, /const divisionLabelMap/)
  assert.match(source, /const divisionLabel = formatRankDivisionLabel\(queueInfo\.division\)/)
  assert.match(source, /return `\$\{tierLabel\} \$\{divisionLabel\} \$\{queueInfo\.leaguePoints\} LP`/)
})
