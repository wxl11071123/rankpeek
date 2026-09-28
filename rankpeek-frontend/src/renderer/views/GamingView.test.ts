import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  isGamingAiAnalysisEnabledQueue,
  normalizeGamingQueueLabel
} from '../services/gamingAiQueue.ts'

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

test('gaming refresh action uses the shared refresh icon button', () => {
  const source = readFileSync(new URL('./GamingView.vue', import.meta.url), 'utf8')

  assert.match(source, /import RefreshIconButton from '@\/components\/common\/RefreshIconButton\.vue'/)
  assert.match(source, /<RefreshIconButton[\s\S]*:aria-label="refreshButtonLabel"[\s\S]*:loading="loading"[\s\S]*:disabled="loading"[\s\S]*@click="\(\) => fetchSessionData\(\)"/)
  assert.doesNotMatch(source, /class="refresh-btn-small"/)
  assert.doesNotMatch(source, /\.refresh-btn-small/)
  assert.doesNotMatch(source, /class="refresh-icon"[\s\S]*spinning/)
})

test('gaming header exposes OP.GG action immediately before refresh and opens the independent window', () => {
  const source = readFileSync(new URL('./GamingView.vue', import.meta.url), 'utf8')
  const opggIndex = source.indexOf('class="opgg-action-btn control-glow"')
  const refreshIndex = source.indexOf('<RefreshIconButton')
  const opggButtonBlock = source.slice(opggIndex, source.indexOf('</button>', opggIndex))

  assert.match(source, /import \{ buildOpggChampionQuery \} from '@\/services\/opggChampionQuery'/)
  assert.equal(opggIndex > -1 && refreshIndex > -1 && opggIndex < refreshIndex, true)
  assert.match(source, /<button[\s\S]*class="opgg-action-btn control-glow"[\s\S]*:title="opggButtonTitle"[\s\S]*@click="openOpggWindow"[\s\S]*>[\s\S]*OP\.GG[\s\S]*<\/button>/)
  assert.doesNotMatch(opggButtonBlock, /:disabled=/)
  assert.match(source, /const opggQuery = computed\(\(\) => buildOpggChampionQuery\(sessionData\.value\)\)/)
  assert.match(source, /const opggButtonTitle = computed\(\(\) => opggQuery\.value\.reason \|\| 'OP\.GG'\)/)
  assert.match(source, /async function openOpggWindow\(\)/)
  assert.match(source, /window\.electronAPI\?\.openOpggWindow\?\.\(opggQuery\.value\)/)
  assert.doesNotMatch(source, /OpggChampionModal/)
  assert.doesNotMatch(source, /opggModalOpen|opggDetail|opggLoading|opggError|loadOpggDetail|canLoadOpggDetail/)
  assert.doesNotMatch(source, /getOpggChampionDetail/)
  assert.match(source, /\.opgg-action-btn\s*\{/)
})

test('gaming page uses flat hover feedback instead of a cursor-following glow', () => {
  const source = readFileSync(new URL('./GamingView.vue', import.meta.url), 'utf8')

  // 跟随鼠标的边缘泛光已移除：每次 pointermove 都要遍历并重绘几十个元素，低配机器代价太高
  assert.doesNotMatch(source, /pointermove/)
  assert.doesNotMatch(source, /PAGE_GLOW_SELECTOR/)
  assert.doesNotMatch(source, /data-near-glow/)
  assert.doesNotMatch(source, /\.control-glow::before,\s*\.surface-glow::before/)
  assert.match(source, /\.control-glow,\s*\.surface-glow \{\s*position: relative;\s*\}/)
  // 模板里的交互语义类名保留，但不再有泛光实现
  assert.match(source, /class="gaming-header surface-glow"/)
  assert.match(source, /class="team-panel team-blue surface-glow"/)
  assert.match(source, /class="team-panel team-red surface-glow"/)
  assert.match(source, /<PlayerCard[\s\S]*class="gaming-player-card surface-glow"/)
})

test('gaming page follows the shared home module and control glow contract', () => {
  const source = readFileSync(new URL('./GamingView.vue', import.meta.url), 'utf8')
  const playerCardSource = readFileSync(new URL('../components/gaming/PlayerCard.vue', import.meta.url), 'utf8')
  const baseRule = extractRule(source, '.gaming-view')
  const lightRule = extractRule(source, ':global([data-theme="light"] .gaming-view)')
  const headerRule = extractRule(source, '.gaming-header')
  const teamPanelRule = extractRule(source, '.team-panel')
  const headerHoverRule = extractRule(source, '.gaming-header:hover,\n.gaming-header:focus-within')
  const teamHoverRule = extractRule(source, '.team-panel:hover,\n.team-panel:focus-within')
  const buttonHoverRule = extractRule(source, '.team-analysis-btn:hover:not(:disabled),\n.team-analysis-btn:focus-visible:not(:disabled)')

  assert.match(baseRule, /--gaming-module-hover-rgb:\s*96, 176, 255/)
  assert.match(baseRule, /--gaming-module-hover-border:\s*rgba\(var\(--gaming-module-hover-rgb\), 0\.48\)/)
  assert.match(baseRule, /--gaming-module-hover-shadow:/)
  assert.match(baseRule, /--gaming-hover-border:\s*var\(--gaming-module-hover-border\)/)
  assert.match(baseRule, /--gaming-hover-shadow:\s*var\(--gaming-module-hover-shadow\)/)
  assert.match(baseRule, /--gaming-control-border-hover:\s*rgba\(96, 176, 255, 0\.58\)/)
  assert.match(baseRule, /--gaming-control-bg-hover-local:[\s\S]*var\(--gaming-control-border-hover\) 72%[\s\S]*\) border-box/)

  assert.match(lightRule, /--gaming-module-hover-rgb:\s*86, 109, 134/)
  assert.match(lightRule, /--gaming-module-hover-border:\s*rgba\(var\(--gaming-module-hover-rgb\), 0\.42\)/)
  assert.match(lightRule, /--gaming-control-border-local-glow:\s*rgba\(78, 215, 255, 0\.98\)/)
  assert.match(lightRule, /--gaming-control-border-local-glow-fade:\s*rgba\(41, 151, 255, 0\.48\)/)
  assert.match(lightRule, /--gaming-control-edge-rgb:\s*78, 215, 255/)
  assert.match(lightRule, /--gaming-control-border-hover:\s*rgba\(86, 109, 134, 0\.42\)/)
  assert.match(lightRule, /--gaming-control-bg-hover:\s*rgba\(244, 249, 255, 0\.98\)/)

  assert.match(headerRule, /border:\s*1px solid var\(--border-color\)/)
  assert.match(headerRule, /box-shadow:\s*none/)
  assert.match(teamPanelRule, /border:\s*1px solid var\(--border-color\)/)
  assert.match(teamPanelRule, /box-shadow:\s*none/)
  assert.doesNotMatch(source, /\.team-blue\s*\{[\s\S]*?border-color:/)
  assert.doesNotMatch(source, /\.team-red\s*\{[\s\S]*?border-color:/)

  assert.match(headerHoverRule, /border-color:\s*var\(--gaming-module-hover-border\)/)
  assert.match(headerHoverRule, /box-shadow:\s*var\(--gaming-module-hover-shadow\)/)
  assert.match(teamHoverRule, /border-color:\s*var\(--gaming-module-hover-border\)/)
  assert.match(teamHoverRule, /box-shadow:\s*var\(--gaming-module-hover-shadow\)/)
  assert.match(buttonHoverRule, /background:\s*var\(--gaming-control-bg-hover-local\)/)
  assert.match(buttonHoverRule, /box-shadow:\s*var\(--gaming-control-hover-shadow\), var\(--gaming-control-edge-shadow\)/)

  assert.match(playerCardSource, /\.player-card\.selected/)
})

test('uses compact team panels and reads session data through the gaming adapter', () => {
  const source = readFileSync(new URL('./GamingView.vue', import.meta.url), 'utf8')
  const headerIndex = source.indexOf('class="gaming-header surface-glow"')
  const teamsIndex = source.indexOf('class="teams-container"')

  assert.match(source, /import \{ getGamingSessionData \} from '@\/api\/sessionDataAdapter'/)
  assert.match(source, /class="gaming-header surface-glow"/)
  assert.match(source, /class="team-panel team-blue surface-glow"/)
  assert.match(source, /class="team-panel team-red surface-glow"/)
  assert.match(source, /class="team-analysis-btn team-analysis-btn-blue control-glow"/)
  assert.match(source, /class="team-analysis-btn team-analysis-btn-red control-glow"/)
  assert.match(source, /<PlayerCard[\s\S]*class="gaming-player-card surface-glow"[\s\S]*:session-summoner="player"[\s\S]*:ai-insight="getGamingAiInlinePlayerInsight\('teammate', player\)"[\s\S]*team="blue"/)
  assert.match(source, /@select-player="toggleParticipantRecentMatches\(player\)"/)
  assert.match(source, /const data = await getGamingSessionData\(\{ forceRefresh: options\.force === true \}\)/)
  assert.doesNotMatch(source, /apiClient\.getSessionData\(\)/)
  assert.doesNotMatch(source, /DEFAULT_ANALYSIS_QUEUE_MODE/)
  assert.doesNotMatch(source, /apiClient\.getSessionData\([^)]*mode/)
  assert.equal(headerIndex > -1 && teamsIndex > -1 && headerIndex < teamsIndex, true)
  assert.match(source, /\.teams-container\s*{\s*display:\s*grid;[\s\S]*grid-template-columns:\s*1fr;/)
  assert.match(source, /@media \(min-width:\s*1180px\)[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
})

test('subscribes to cache update events and refreshes only relevant current-session players', () => {
  const source = readFileSync(new URL('./GamingView.vue', import.meta.url), 'utf8')

  assert.match(source, /import \{ wsClient \} from '@\/api\/websocketClient'/)
  assert.match(source, /import type \{ CacheUpdateEvent, Lobby, SessionData, SessionSummoner, Summoner \} from '@\/types\/api'/)
  assert.match(source, /let unsubscribeCacheUpdate: \(\(\) => void\) \| null = null/)
  assert.match(source, /unsubscribeCacheUpdate = wsClient\.onCacheUpdate\(\(event: CacheUpdateEvent\) => \{/)
  assert.match(source, /if \(isCacheUpdateRelevant\(event\)\) \{\s*scheduleCacheUpdateRefresh\(\)/)
  assert.match(source, /function collectCurrentSessionPuuids\(\): Set<string>/)
  assert.match(source, /for \(const player of sessionData\.value\.teamOne \|\| \[\]\)/)
  assert.match(source, /for \(const player of sessionData\.value\.teamTwo \|\| \[\]\)/)
  assert.match(source, /const puuid = player\?\.summoner\?\.puuid/)
  assert.match(source, /return currentPuuids\.has\(event\.puuid\)/)
  assert.match(source, /getGamingSessionData\(\{ forceRefresh: options\.force === true \}\)/)
  assert.doesNotMatch(source, /apiClient\.getSessionData\(\)/)
  assert.doesNotMatch(source, /DEFAULT_ANALYSIS_QUEUE_MODE/)
})

test('subscribes to renderer gameflow phase changes and cleans up the listener', () => {
  const source = readFileSync(new URL('./GamingView.vue', import.meta.url), 'utf8')
  const mountBlock = source.match(/onMounted\(\(\) => \{[\s\S]*?\n\}\)/)?.[0] || ''
  const unmountBlock = source.match(/onUnmounted\(\(\) => \{[\s\S]*?\n\}\)/)?.[0] || ''

  assert.match(source, /import \{ listenGameflowPhase \} from '@\/services\/gameflowPhaseListener'/)
  assert.match(source, /let unsubscribeGameflowPhase: \(\(\) => void\) \| null = null/)
  assert.match(mountBlock, /unsubscribeGameflowPhase = listenGameflowPhase\(handleGameflowPhaseChange\)/)
  assert.match(unmountBlock, /if \(unsubscribeGameflowPhase\) \{/)
  assert.match(unmountBlock, /unsubscribeGameflowPhase\(\)/)
  assert.match(unmountBlock, /unsubscribeGameflowPhase = null/)
})

test('gameflow phase handler refreshes active scout phases and clears stale lobby or post-game data without navigation', () => {
  const source = readFileSync(new URL('./GamingView.vue', import.meta.url), 'utf8')
  const handler = source.match(/function handleGameflowPhaseChange\(phase: string\) \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(source, /createGameflowPhaseTransitionTracker/)
  assert.match(source, /const gameflowPhaseTransitions = createGameflowPhaseTransitionTracker\(\)/)
  assert.match(source, /isGameflowLobbyDisplayPhase/)
  assert.match(source, /isGameflowSessionRefreshPhase/)
  assert.match(source, /isGameflowSessionClearPhase/)
  assert.match(handler, /console\.debug\(`\[gameflow\] phase=\$\{phase\}`\)/)
  assert.match(handler, /if \(!gameflowPhaseTransitions\.shouldHandlePhase\(phase\)\) \{[\s\S]*return[\s\S]*\}/)
  assert.match(handler, /isGameflowSessionRefreshPhase\(phase\)[\s\S]*fetchSessionData\(\{ force: true \}\)/)
  assert.match(handler, /未来这里可跳转到对战信息/)
  assert.match(handler, /isGameflowSessionClearPhase\(phase\)[\s\S]*clearSessionDataForPhase\(phase\)/)
  assert.match(handler, /未来这里可跳转到我的战绩/)
  assert.doesNotMatch(handler, /router\.push|useRouter/)
})

test('lobby phase reads lobby status separately without restoring cleared scout teams', () => {
  const source = readFileSync(new URL('./GamingView.vue', import.meta.url), 'utf8')
  const handler = source.match(/function handleGameflowPhaseChange\(phase: string\) \{[\s\S]*?\n\}/)?.[0] || ''
  const queueName = source.match(/const queueName = computed\(\(\) => \{[\s\S]*?\n\}\)/)?.[0] || ''

  assert.match(source, /import \{ apiClient \} from '@\/api\/httpClient'/)
  assert.match(source, /import type \{ CacheUpdateEvent, Lobby, SessionData, SessionSummoner, Summoner \} from '@\/types\/api'/)
  assert.match(source, /formatLobbyQueueName/)
  assert.match(source, /isGameflowLobbyDisplayPhase/)
  assert.match(source, /buildLobbyDisplaySessionSummoners/)
  assert.match(source, /const lobbyData = ref<Lobby \| null>\(null\)/)
  assert.match(source, /const currentSummoner = ref<Summoner \| null>\(null\)/)
  assert.match(source, /const lobbyTeamPlayers = computed<SessionSummoner\[\]>/)
  assert.match(source, /buildLobbyDisplaySessionSummoners\(lobbyData\.value, currentSummoner\.value, sessionData\.value\)/)
  assert.match(source, /const blueTeamPlayers = computed\(\(\) => hasActiveSession\.value \? \(sessionData\.value\.teamOne \|\| \[\]\) : lobbyTeamPlayers\.value\)/)
  assert.match(source, /let unsubscribeLobby: \(\(\) => void\) \| null = null/)
  assert.match(source, /async function fetchLobbyData/)
  assert.match(source, /const lobby = await apiClient\.getLobby\(\)/)
  assert.match(source, /apiClient\.getGameState\(\)/)
  assert.match(handler, /isGameflowLobbyDisplayPhase\(phase\)[\s\S]*fetchLobbyData\(\{ force: true \}\)/)
  assert.match(handler, /isGameflowLobbyDisplayPhase\(phase\)[\s\S]*fetchSessionData\(\{ showLoading: false, force: true \}\)/)
  assert.match(handler, /clearLobbyStatus\(\)/)
  assert.match(source, /unsubscribeLobby = wsClient\.onLobby/)
  assert.match(queueName, /hasLobbyPhase\.value[\s\S]*lobbyQueueLabel\.value/)
  assert.match(queueName, /isGameflowLobbyDisplayPhase\(sessionData\.value\.phase\)[\s\S]*sessionData\.value\.typeCn/)
  assert.match(queueName, /return '大厅'/)
  assert.doesNotMatch(handler, /router\.push|useRouter/)
})

test('session fetches use request ids, support forced refresh, and clear teams on API failure', () => {
  const source = readFileSync(new URL('./GamingView.vue', import.meta.url), 'utf8')
  const fetchFunction = source.match(/async function fetchSessionData\([\s\S]*?\n\}/)?.[0] || ''

  assert.match(source, /createGamingSessionDataState/)
  assert.match(source, /const sessionState = createGamingSessionDataState\(\)/)
  assert.match(source, /const initialLoading = ref\(false\)/)
  assert.match(source, /const refreshing = ref\(false\)/)
  assert.match(source, /const lastError = ref\(''\)/)
  assert.match(source, /const loading = computed\(\(\) => initialLoading\.value \|\| refreshing\.value\)/)
  assert.match(fetchFunction, /options: \{ showLoading\?: boolean; force\?: boolean \} = \{\}/)
  assert.match(fetchFunction, /if \(isRefreshPaused\.value \|\| \(sessionFetchInFlight && !options\.force\)\) return/)
  assert.match(fetchFunction, /const shouldShowFetchState = options\.showLoading !== false/)
  assert.match(fetchFunction, /const showInitialLoading = shouldShowFetchState && !hasCompletedInitialSessionFetch/)
  assert.match(fetchFunction, /const requestId = sessionState\.beginFetch\(\)/)
  assert.match(fetchFunction, /const data = await getGamingSessionData\(\{ forceRefresh: options\.force === true \}\)/)
  assert.match(fetchFunction, /sessionState\.applyFetchedData\(requestId, data\)/)
  assert.match(fetchFunction, /sessionState\.applyFetchFailure\(requestId, currentGameflowPhase\.value \|\| sessionData\.value\.phase\)/)
  assert.match(fetchFunction, /lastError\.value = extractFetchErrorMessage\(e\)/)
  assert.match(fetchFunction, /syncSessionDataFromState\(\)/)
  assert.match(fetchFunction, /sessionState\.isCurrentRequest\(requestId\)/)
  assert.match(fetchFunction, /initialLoading\.value = false/)
  assert.match(fetchFunction, /refreshing\.value = false/)
})

test('background polling and retries stay quiet instead of showing global loading', () => {
  const source = readFileSync(new URL('./GamingView.vue', import.meta.url), 'utf8')
  const mountBlock = source.match(/onMounted\(\(\) => \{[\s\S]*?\n\}\)/)?.[0] || ''
  const watcherBlock = source.match(/watch\(\(\) => sessionData\.value\.phase,[\s\S]*?\n\}\)/)?.[0] || ''
  const retryFunction = source.match(/function checkAndRetryFetch\(\) \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(mountBlock, /refreshInterval = setInterval\(\(\) => fetchSessionData\(\{ showLoading: false \}\), 5000\)/)
  assert.match(watcherBlock, /if \(!hasActiveSession\.value\) \{[\s\S]*return[\s\S]*\}/)
  assert.match(watcherBlock, /fetchSessionData\(\{ showLoading: false \}\)/)
  assert.match(retryFunction, /if \(!hasActiveSession\.value\) return/)
  assert.match(retryFunction, /fetchSessionData\(\{ showLoading: false \}\)/)
})

test('active session visibility rejects stale or empty session payloads', () => {
  const source = readFileSync(new URL('./GamingView.vue', import.meta.url), 'utf8')
  const hasActiveSession = source.match(/const hasActiveSession = computed\(\(\) => \{[\s\S]*?\n\}\)/)?.[0] || ''

  assert.match(hasActiveSession, /!sessionData\.value\.stale/)
  assert.match(hasActiveSession, /!sessionData\.value\.empty/)
  assert.match(hasActiveSession, /!isGameflowSessionClearPhase\(phase\)/)
})

test('gaming phase labels include simulator post-game variants', () => {
  const source = readFileSync(new URL('./GamingView.vue', import.meta.url), 'utf8')
  const phaseMap = source.match(/const phaseMap: Record<string, MessageKey> = \{[\s\S]*?\n\s*\}/)?.[0] || ''
  const phaseClass = source.match(/const phaseClass = computed\(\(\) => \{[\s\S]*?\n\}\)/)?.[0] || ''

  assert.match(phaseMap, /PostGame:\s*'gaming\.phase\.EndOfGame'/)
  assert.match(phaseMap, /POST_GAME:\s*'gaming\.phase\.EndOfGame'/)
  assert.match(phaseClass, /phase === 'PostGame'/)
  assert.match(phaseClass, /phase === 'POST_GAME'/)
})

test('throttles cache update refreshes and respects paused refresh state', () => {
  const source = readFileSync(new URL('./GamingView.vue', import.meta.url), 'utf8')
  const scheduleFunction = source.match(/function scheduleCacheUpdateRefresh\(\) \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(source, /let cacheUpdateRefreshTimer: ReturnType<typeof setTimeout> \| null = null/)
  assert.match(source, /let lastCacheUpdateRefreshAt = 0/)
  assert.match(source, /const cacheUpdateRefreshDelay = 800/)
  assert.match(source, /const minCacheUpdateRefreshInterval = 2500/)
  assert.match(scheduleFunction, /if \(isRefreshPaused\.value\) return/)
  assert.match(scheduleFunction, /if \(elapsed >= minCacheUpdateRefreshInterval\)/)
  assert.match(scheduleFunction, /fetchSessionData\(\{ showLoading: false \}\)/)
  assert.match(scheduleFunction, /if \(cacheUpdateRefreshTimer\) return/)
  assert.match(scheduleFunction, /cacheUpdateRefreshTimer = setTimeout/)
  assert.match(scheduleFunction, /cacheUpdateRefreshDelay/)
})

test('cache update refreshes stay quiet and do not overlap polling requests', () => {
  const source = readFileSync(new URL('./GamingView.vue', import.meta.url), 'utf8')
  const fetchFunction = source.match(/async function fetchSessionData\([\s\S]*?\n\}/)?.[0] || ''
  const scheduleFunction = source.match(/function scheduleCacheUpdateRefresh\(\) \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(source, /let sessionFetchInFlight = false/)
  assert.match(fetchFunction, /options: \{ showLoading\?: boolean; force\?: boolean \} = \{\}/)
  assert.match(fetchFunction, /if \(isRefreshPaused\.value \|\| \(sessionFetchInFlight && !options\.force\)\) return/)
  assert.match(fetchFunction, /const shouldShowFetchState = options\.showLoading !== false/)
  assert.match(fetchFunction, /sessionFetchInFlight = true/)
  assert.match(fetchFunction, /if \(showInitialLoading\) \{[\s\S]*initialLoading\.value = true/)
  assert.match(fetchFunction, /else if \(shouldShowFetchState\) \{[\s\S]*refreshing\.value = true/)
  assert.match(fetchFunction, /initialLoading\.value = false/)
  assert.match(fetchFunction, /refreshing\.value = false/)
  assert.match(fetchFunction, /sessionFetchInFlight = false/)
  assert.match(scheduleFunction, /fetchSessionData\(\{ showLoading: false \}\)/)
})

test('cleans up cache update subscription and pending refresh timer on unmount', () => {
  const source = readFileSync(new URL('./GamingView.vue', import.meta.url), 'utf8')
  const unmountBlock = source.match(/onUnmounted\(\(\) => \{[\s\S]*?\n\}\)/)?.[0] || ''

  assert.match(unmountBlock, /if \(unsubscribeCacheUpdate\) \{/)
  assert.match(unmountBlock, /unsubscribeCacheUpdate\(\)/)
  assert.match(unmountBlock, /unsubscribeCacheUpdate = null/)
  assert.match(unmountBlock, /if \(cacheUpdateRefreshTimer\) \{/)
  assert.match(unmountBlock, /clearTimeout\(cacheUpdateRefreshTimer\)/)
  assert.match(unmountBlock, /cacheUpdateRefreshTimer = null/)
})

test('gaming player cards use whole-card clicks to expand participant recent matches', () => {
  const source = readFileSync(new URL('./GamingView.vue', import.meta.url), 'utf8')
  // Player identity keys are centralized in getGamingPlayerKey() (services/gamingAiInputSnapshot).
  const playerKeySource = readFileSync(new URL('../services/gamingAiInputSnapshot.ts', import.meta.url), 'utf8')
  const playerKeyFunction = playerKeySource.match(/export function getGamingPlayerKey\([\s\S]*?\n\}/)?.[0] || ''

  assert.match(source, /import type \{ CacheUpdateEvent, Lobby, SessionData, SessionSummoner, Summoner \} from '@\/types\/api'/)
  assert.match(source, /function getParticipantKey\(player: SessionSummoner \| null \| undefined\): string \{\s*return getGamingPlayerKey\(player\)\s*\}/)
  assert.match(playerKeyFunction, /return `puuid:\$\{puuid\}`/)
  assert.match(playerKeyFunction, /return `summoner:\$\{summonerId\}`/)
  assert.match(playerKeyFunction, /const gameName = readNonEmptyString\(player\.summoner\?\.gameName\)[\s\S]*return `name:/)
  assert.match(source, /:key="getParticipantKey\(player\) \|\| `blue-\$\{idx\}`"/)
  assert.match(source, /:key="getParticipantKey\(player\) \|\| `red-\$\{idx\}`"/)
  assert.match(source, /import ParticipantRecentMatchesPanel/)
  assert.match(source, /const expandedParticipantKeys/)
  assert.match(source, /:selected="isParticipantExpanded\(player\)"/)
  assert.match(source, /@select-player="toggleParticipantRecentMatches\(player\)"/)
  assert.match(source, /<ParticipantRecentMatchesPanel/)
  assert.match(source, /function isParticipantExpanded/)
  assert.match(source, /function toggleParticipantRecentMatches/)
  assert.doesNotMatch(source, /useRouter|router\.push/)
})

test('gaming AI analysis buttons run inline teammate and opponent analysis on the team panels', () => {
  const source = readFileSync(new URL('./GamingView.vue', import.meta.url), 'utf8')
  const blueButton = source.match(/<button[\s\S]*?@click="startGamingAiInlineAnalysis\('teammate'\)"[\s\S]*?<\/button>/)?.[0] || ''
  const redButton = source.match(/<button[\s\S]*?@click="startGamingAiInlineAnalysis\('opponent'\)"[\s\S]*?<\/button>/)?.[0] || ''

  assert.doesNotMatch(source, /import GamingAiAnalysisModal/)
  assert.doesNotMatch(source, /createGamingAiAnalysisPreview|GamingAiAnalysisPreview|gamingAiModalOpen|gamingAiModalMode|gamingAiPreview/)
  assert.doesNotMatch(source, /<GamingAiAnalysisModal/)
  assert.match(blueButton, /@click="startGamingAiInlineAnalysis\('teammate'\)"/)
  assert.match(redButton, /@click="startGamingAiInlineAnalysis\('opponent'\)"/)
  assert.match(blueButton, /:disabled="!canStartGamingAiInlineAnalysis\('teammate'\)"/)
  assert.match(redButton, /:disabled="!canStartGamingAiInlineAnalysis\('opponent'\)"/)
  assert.match(blueButton, /:title="getGamingAiButtonTitle\('teammate'\)"/)
  assert.match(redButton, /:title="getGamingAiButtonTitle\('opponent'\)"/)
  assert.match(blueButton, /{{ getGamingAiButtonText\('teammate'\) }}/)
  assert.match(redButton, /{{ getGamingAiButtonText\('opponent'\) }}/)
  assert.match(source, /<h2>\{\{ t\('gaming\.blueTeam'\) \}\} \{\{ blueTeamCount \}\}\/5<\/h2>/)
  assert.match(source, /<h2>\{\{ t\('gaming\.redTeam'\) \}\} \{\{ redTeamCount \}\}\/5<\/h2>/)
  assert.doesNotMatch(source, /\{\{ blueTeamCount \}\} \/ 5/)
  assert.doesNotMatch(source, /\{\{ redTeamCount \}\} \/ 5/)
  assert.match(source, /:ai-insight="getGamingAiInlinePlayerInsight\('teammate', player\)"/)
  assert.match(source, /:ai-loading="isGamingAiInlinePlayerLoading\('teammate', player\)"/)
  assert.match(source, /:ai-error="getGamingAiInlinePlayerError\('teammate', player\)"/)
  assert.match(source, /:ai-insight="getGamingAiInlinePlayerInsight\('opponent', player\)"/)
  assert.match(source, /:ai-loading="isGamingAiInlinePlayerLoading\('opponent', player\)"/)
  assert.match(source, /:ai-error="getGamingAiInlinePlayerError\('opponent', player\)"/)
})

test('pregame auto analysis toggles are labeled and trigger teammate or opponent independently once per lineup', () => {
  const source = readFileSync(new URL('./GamingView.vue', import.meta.url), 'utf8')
  const toggleMatches = source.match(/class="pregame-auto-analysis-toggle control-glow"/g) || []
  const autoBlock = source.slice(
    source.indexOf('function maybeStartPregameAutoAnalysis'),
    source.indexOf('function getGamingAiInlinePlayerInsight')
  )

  assert.equal(toggleMatches.length, 2)
  assert.match(source, /const PREGAME_AUTO_ANALYSIS_TOOLTIP = '每局排位自动分析对局'/)
  assert.match(source, /const PREGAME_AUTO_ANALYSIS_STORAGE_PREFIX = 'rankpeek\.gaming\.pregameAutoAnalysis'/)
  assert.match(source, /const PREGAME_AUTO_ANALYSIS_MODES: GamingAiAnalysisMode\[\] = \['teammate', 'opponent'\]/)
  assert.match(source, /:title="PREGAME_AUTO_ANALYSIS_TOOLTIP"/)
  assert.match(source, /aria-label="自动赛前分析"/)
  assert.match(source, /<span class="pregame-auto-analysis-toggle-text">自动分析<\/span>/)
  assert.match(source, /:aria-pressed="isPregameAutoAnalysisEnabled\('teammate'\)"/)
  assert.match(source, /:aria-pressed="isPregameAutoAnalysisEnabled\('opponent'\)"/)
  assert.match(source, /@click="togglePregameAutoAnalysis\('teammate'\)"/)
  assert.match(source, /@click="togglePregameAutoAnalysis\('opponent'\)"/)
  assert.match(source, /function buildPregameAutoAnalysisStorageKey\(mode: GamingAiAnalysisMode\): string/)
  assert.match(source, /window\.localStorage\.getItem\(buildPregameAutoAnalysisStorageKey\('teammate'\)\)/)
  assert.match(source, /window\.localStorage\.getItem\(buildPregameAutoAnalysisStorageKey\('opponent'\)\)/)
  assert.match(source, /window\.localStorage\.setItem\(buildPregameAutoAnalysisStorageKey\(mode\), isPregameAutoAnalysisEnabled\(mode\) \? '1' : '0'\)/)
  assert.match(source, /function buildPregameAutoAnalysisAttemptKey\(mode: GamingAiAnalysisMode\): string/)
  assert.match(autoBlock, /if \(!isPregameAutoAnalysisEnabled\(mode\) \|\| pregameAutoAnalysisInFlight\[mode\]\) \{/)
  assert.match(autoBlock, /canStartGamingAiInlineAnalysis\(mode\)/)
  assert.match(autoBlock, /lastPregameAutoAnalysisAttemptKeys\[mode\] = attemptKey/)
  assert.match(autoBlock, /await startGamingAiInlineAnalysis\(mode\)/)
  assert.doesNotMatch(autoBlock, /Promise\.all/)
  assert.match(source, /maybeStartPregameAutoAnalysis\('teammate'\)/)
  assert.match(source, /maybeStartPregameAutoAnalysis\('opponent'\)/)
  assert.match(source, /\.pregame-auto-analysis-toggle\s*\{/)
})

test('gaming AI analysis streams directly into persistent inline state', () => {
  const source = readFileSync(new URL('./GamingView.vue', import.meta.url), 'utf8')
  const fetchSessionBlock = source.slice(
    source.indexOf('async function fetchSessionData'),
    source.indexOf('function collectCurrentSessionPuuids')
  )
  const startAnalysisBlock = source.slice(
    source.indexOf('async function startGamingAiInlineAnalysis'),
    source.indexOf('async function openOpggWindow')
  )
  const unmountBlock = source.match(/onUnmounted\(\(\) => \{[\s\S]*?\n\}\)/)?.[0] || ''

  assert.match(source, /import \{ buildGamingAiInputSnapshot, getGamingPlayerKey \} from '@\/services\/gamingAiInputSnapshot'/)
  assert.match(source, /import \{[\s\S]*gamingAiInlineState[\s\S]*beginGamingAiInlineRun[\s\S]*clearGamingAiInlineMode[\s\S]*completeGamingAiInlineRun[\s\S]*isGamingAiInlineRunCurrent[\s\S]*setGamingAiInlineError[\s\S]*setGamingAiInlineStreamState[\s\S]*upsertGamingAiInlineInsight[\s\S]*upsertGamingAiInlineVerdict[\s\S]*\} from '@\/services\/gamingAiInlineState'/)
  assert.match(source, /isGamingAiAnalysisReady/)
  assert.match(source, /createGamingAiStreamRequest/)
  assert.match(source, /streamGamingAiAnalysis/)
  assert.doesNotMatch(source, /let gamingAiStreamAbortController: AbortController \| null = null/)
  assert.match(startAnalysisBlock, /if \(!isGamingAiAnalysisReady\(\{[\s\S]*mode,[\s\S]*sessionData: sessionData\.value[\s\S]*\}\)\) \{/)
  assert.match(startAnalysisBlock, /const requestKey = buildGamingAiInlineRequestKey\(mode\)/)
  assert.match(startAnalysisBlock, /const \{ controller, requestId \} = beginGamingAiInlineRun\(mode, requestKey\)/)
  assert.match(startAnalysisBlock, /const players = mode === 'teammate' \? blueTeamPlayers\.value : redTeamPlayers\.value/)
  assert.match(startAnalysisBlock, /buildGamingAiInputSnapshot\(\{/)
  assert.match(startAnalysisBlock, /selectedPlayers: players/)
  assert.match(startAnalysisBlock, /createGamingAiStreamRequest\(snapshot\)/)
  assert.match(startAnalysisBlock, /streamGamingAiAnalysis\(/)
  assert.match(startAnalysisBlock, /event\.type === 'player_insight'/)
  assert.match(startAnalysisBlock, /upsertGamingAiInlineInsight\(mode, requestId, event\)/)
  assert.match(startAnalysisBlock, /event\.type === 'player_verdict'/)
  assert.match(startAnalysisBlock, /upsertGamingAiInlineVerdict\(mode, requestId, event\)/)
  assert.match(startAnalysisBlock, /setGamingAiInlineStreamState\(mode, requestId, 'streaming'\)/)
  assert.match(startAnalysisBlock, /onError: \(message\) => \{/)
  assert.match(startAnalysisBlock, /setGamingAiInlineError\(mode, requestId, message\)/)
  assert.match(startAnalysisBlock, /onDone: \(\) => \{/)
  assert.match(startAnalysisBlock, /completeGamingAiInlineRun\(mode, requestId, controller\)/)
  assert.match(startAnalysisBlock, /isGamingAiInlineRunCurrent\(mode, requestId, controller\)/)
  assert.doesNotMatch(fetchSessionBlock, /buildGamingAiInputSnapshot/)
  assert.doesNotMatch(fetchSessionBlock, /streamGamingAiAnalysis/)
  assert.doesNotMatch(unmountBlock, /cancelGamingAi|clearGamingAiInline/)
})

test('gaming AI inline cache survives page returns and restores completed one-run results', () => {
  const source = readFileSync(new URL('./GamingView.vue', import.meta.url), 'utf8')
  const unmountBlock = source.match(/onUnmounted\(\(\) => \{[\s\S]*?\n\}\)/)?.[0] || ''

  assert.match(source, /hasCompletedGamingAiInlineRun/)
  assert.match(source, /restoreCompletedGamingAiInlineRun/)
  assert.match(source, /function buildGamingAiInlineRequestKey\(mode: GamingAiAnalysisMode\): string/)
  assert.match(source, /function buildGamingAiInlineSessionKey\(\): string/)
  assert.match(source, /function isGamingAiInlineCacheAvailable\(mode: GamingAiAnalysisMode\): boolean/)
  assert.match(source, /function syncGamingAiInlineCacheWithSession\(\)/)
  assert.match(source, /function syncGamingAiInlineModeCache\(mode: GamingAiAnalysisMode, requestKey: string\)/)
  assert.match(source, /function hasCompletedGamingAiInlineAnalysis\(mode: GamingAiAnalysisMode\): boolean/)
  assert.match(source, /function restoreCompletedGamingAiInlineAnalysis\(mode: GamingAiAnalysisMode, requestKey: string\): boolean/)
  assert.match(source, /const teammateRequestKey = buildGamingAiInlineRequestKey\('teammate'\)/)
  assert.match(source, /const opponentRequestKey = buildGamingAiInlineRequestKey\('opponent'\)/)
  assert.match(source, /syncGamingAiInlineModeCache\('teammate', teammateRequestKey\)/)
  assert.match(source, /syncGamingAiInlineModeCache\('opponent', opponentRequestKey\)/)
  assert.match(source, /if \(!restoreCompletedGamingAiInlineAnalysis\(mode, requestKey\)\) \{[\s\S]*clearGamingAiInlineMode\(mode\)/)
  assert.match(source, /!hasCompletedGamingAiInlineAnalysis\(mode\) && isGamingAiAnalysisReady/)
  assert.match(source, /if \(restoreCompletedGamingAiInlineAnalysis\(mode, requestKey\)\) \{[\s\S]*return/)
  assert.match(source, /return '已分析'/)
  assert.match(source, /watch\(\s*\(\) => \[[\s\S]*buildGamingAiInlineRequestKey\('teammate'\)[\s\S]*buildGamingAiInlineRequestKey\('opponent'\)[\s\S]*\]\.join\('\|\|'\),[\s\S]*syncGamingAiInlineCacheWithSession\(\)[\s\S]*maybeStartPregameAutoAnalysis\('teammate'\)[\s\S]*maybeStartPregameAutoAnalysis\('opponent'\)[\s\S]*\{ immediate: true \}/)
  assert.doesNotMatch(unmountBlock, /clearGamingAiInlineMode|cancelGamingAiInlineRun/)
})

test('gaming AI queue labels normalize ranked modes and exclude phase prefixes', () => {
  assert.equal(normalizeGamingQueueLabel({ queueId: 420, typeCn: '单排/双排' }), '单双排位')
  assert.equal(normalizeGamingQueueLabel({ queueId: 420, typeCn: '单双排' }), '单双排位')
  assert.equal(normalizeGamingQueueLabel({ queueId: 420, typeCn: '单双排位' }), '单双排位')
  assert.equal(normalizeGamingQueueLabel({ queueId: 440, typeCn: '灵活组排' }), '灵活排位')
  assert.equal(normalizeGamingQueueLabel({ queueId: 440, typeCn: '灵活排位' }), '灵活排位')
  assert.equal(normalizeGamingQueueLabel({ queueId: 450, typeCn: '极地大乱斗' }), '海克斯大乱斗')
  assert.equal(normalizeGamingQueueLabel({ queueId: 0, typeCn: '海克斯大乱斗' }), '海克斯大乱斗')
  assert.equal(normalizeGamingQueueLabel({ queueId: 0, typeCn: '匹配' }), '匹配')
  assert.equal(isGamingAiAnalysisEnabledQueue({ queueId: 420, typeCn: '单排/双排' }), true)
  assert.equal(isGamingAiAnalysisEnabledQueue({ queueId: 440, typeCn: '灵活组排' }), true)
  assert.equal(isGamingAiAnalysisEnabledQueue({ queueId: 450, typeCn: '极地大乱斗' }), false)
})

test('gaming AI inline request key uses stable per-game identity and queue label without phase prefixes', () => {
  const source = readFileSync(new URL('./GamingView.vue', import.meta.url), 'utf8')
  const cacheKeyFunction = source.match(/function getGamingAiPlayerCacheKey\(player: SessionSummoner\): string \{[\s\S]*?\n\}/)?.[0] || ''
  // The puuid-before-gameName identity preference lives in the shared getGamingPlayerKey().
  const playerKeySource = readFileSync(new URL('../services/gamingAiInputSnapshot.ts', import.meta.url), 'utf8')
  const playerKeyFunction = playerKeySource.match(/export function getGamingPlayerKey\([\s\S]*?\n\}/)?.[0] || ''
  const puuidIndex = playerKeyFunction.indexOf('const puuid')
  const gameNameIndex = playerKeyFunction.indexOf('const gameName')

  assert.match(source, /const gamingAiQueueLabel = computed\(\(\) => normalizeGamingQueueLabel\(sessionData\.value\)\)/)
  assert.match(source, /const playerKeys = getGamingAiModePlayers\(mode\)\.map\(getGamingAiPlayerCacheKey\)\.sort\(\)\.join\('\|'\)/)
  assert.match(source, /const requestKey = \[[\s\S]*mode,[\s\S]*buildGamingAiInlineSessionKey\(\),[\s\S]*gamingAiQueueLabel\.value/)
  assert.match(source, /normalizeKeyPart\(sessionData\.value\.matchId\)[\s\S]*normalizeKeyPart\(sessionData\.value\.gameId\)[\s\S]*normalizeKeyPart\(sessionData\.value\.sessionKey\)/)
  assert.doesNotMatch(source, /readNonEmptyString/)
  assert.match(cacheKeyFunction, /return getGamingPlayerKey\(player\)/)
  assert.equal(puuidIndex > -1 && gameNameIndex > -1 && puuidIndex < gameNameIndex, true)
  assert.doesNotMatch(source, /大厅 ·|英雄选择 ·|游戏中 ·/)
})
