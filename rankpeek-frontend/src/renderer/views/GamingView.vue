<template>
  <div
    ref="gamingViewRef"
    class="gaming-view"
  >
    <div
      class="gaming-content"
      :class="{ 'is-idle': !hasActiveSession }"
    >
      <div
        v-if="isRefreshPaused"
        class="connection-bar"
      >
        <span
          class="error-icon"
          aria-hidden="true"
        />
        <span>{{ t('gaming.connectionPaused') }}</span>
        <button
          class="resume-btn-small control-glow"
          @click="resumeRefresh"
        >
          {{ t('common.reconnect') }}
        </button>
      </div>
      <div class="gaming-header surface-glow">
        <div class="phase-info">
          <span
            class="phase-badge"
            :class="phaseClass"
          >{{ phaseCn }}</span>
          <span
            class="queue-name"
            :class="{ unknown: queueUnknown }"
          >{{ queueName }}</span>
        </div>
        <div class="header-actions">
          <button
            class="opgg-action-btn control-glow"
            type="button"
            :title="opggButtonTitle"
            @click="openOpggWindow"
          >
            OP.GG
          </button>
          <RefreshIconButton
            :aria-label="refreshButtonLabel"
            :title="refreshButtonLabel"
            :loading="loading"
            :disabled="loading"
            @click="() => fetchSessionData()"
          />
        </div>
      </div>

      <div class="teams-container">
        <section class="team-panel team-blue surface-glow">
          <div class="team-header team-header-blue">
            <div class="team-title">
              <div>
                <h2>{{ t('gaming.blueTeam') }} {{ blueTeamCount }}/5</h2>
              </div>
            </div>
            <button
              class="pregame-auto-analysis-toggle control-glow"
              type="button"
              :class="{ active: isPregameAutoAnalysisEnabled('teammate') }"
              :title="PREGAME_AUTO_ANALYSIS_TOOLTIP"
              :aria-pressed="isPregameAutoAnalysisEnabled('teammate')"
              aria-label="自动赛前分析"
              @click="togglePregameAutoAnalysis('teammate')"
            >
              <span
                class="pregame-auto-analysis-toggle-track"
                aria-hidden="true"
              >
                <span class="pregame-auto-analysis-toggle-knob" />
              </span>
              <span class="pregame-auto-analysis-toggle-text">自动分析</span>
            </button>
            <button
              class="team-analysis-btn team-analysis-btn-blue control-glow"
              type="button"
              :title="getGamingAiButtonTitle('teammate')"
              :disabled="!canStartGamingAiInlineAnalysis('teammate')"
              @click="startGamingAiInlineAnalysis('teammate')"
            >
              {{ getGamingAiButtonText('teammate') }}
            </button>
          </div>
          <div class="team-players">
            <template
              v-for="(player, idx) in blueTeamPlayers"
              :key="getParticipantKey(player) || `blue-${idx}`"
            >
              <PlayerCard
                class="gaming-player-card surface-glow"
                :session-summoner="player"
                :selected="isParticipantExpanded(player)"
                :ai-insight="getGamingAiInlinePlayerInsight('teammate', player)"
                :ai-loading="isGamingAiInlinePlayerLoading('teammate', player)"
                :ai-error="getGamingAiInlinePlayerError('teammate', player)"
                team="blue"
                @select-player="toggleParticipantRecentMatches(player)"
              />
              <ParticipantRecentMatchesPanel
                v-if="isParticipantExpanded(player)"
                class="participant-recent-inline-panel surface-glow"
                :player="player"
              />
            </template>
            <span
              v-for="slot in blueEmptySlots"
              :key="`blue-empty-${slot}`"
              class="idle-player-slot idle-player-slot-blue"
              aria-hidden="true"
            >
              <span class="idle-slot-avatar" />
              <span class="idle-slot-copy">
                <span class="idle-slot-title" />
                <span class="idle-slot-subtitle" />
              </span>
            </span>
          </div>
        </section>

        <section class="team-panel team-red surface-glow">
          <div class="team-header team-header-red">
            <div class="team-title">
              <div>
                <h2>{{ t('gaming.redTeam') }} {{ redTeamCount }}/5</h2>
              </div>
            </div>
            <button
              class="pregame-auto-analysis-toggle control-glow"
              type="button"
              :class="{ active: isPregameAutoAnalysisEnabled('opponent') }"
              :title="PREGAME_AUTO_ANALYSIS_TOOLTIP"
              :aria-pressed="isPregameAutoAnalysisEnabled('opponent')"
              aria-label="自动赛前分析"
              @click="togglePregameAutoAnalysis('opponent')"
            >
              <span
                class="pregame-auto-analysis-toggle-track"
                aria-hidden="true"
              >
                <span class="pregame-auto-analysis-toggle-knob" />
              </span>
              <span class="pregame-auto-analysis-toggle-text">自动分析</span>
            </button>
            <button
              class="team-analysis-btn team-analysis-btn-red control-glow"
              type="button"
              :title="getGamingAiButtonTitle('opponent')"
              :disabled="!canStartGamingAiInlineAnalysis('opponent')"
              @click="startGamingAiInlineAnalysis('opponent')"
            >
              {{ getGamingAiButtonText('opponent') }}
            </button>
          </div>
          <div class="team-players">
            <template
              v-for="(player, idx) in redTeamPlayers"
              :key="getParticipantKey(player) || `red-${idx}`"
            >
              <PlayerCard
                class="gaming-player-card surface-glow"
                :session-summoner="player"
                :selected="isParticipantExpanded(player)"
                :ai-insight="getGamingAiInlinePlayerInsight('opponent', player)"
                :ai-loading="isGamingAiInlinePlayerLoading('opponent', player)"
                :ai-error="getGamingAiInlinePlayerError('opponent', player)"
                team="red"
                @select-player="toggleParticipantRecentMatches(player)"
              />
              <ParticipantRecentMatchesPanel
                v-if="isParticipantExpanded(player)"
                class="participant-recent-inline-panel surface-glow"
                :player="player"
              />
            </template>
            <span
              v-for="slot in redEmptySlots"
              :key="`red-empty-${slot}`"
              class="idle-player-slot idle-player-slot-red"
              aria-hidden="true"
            >
              <span class="idle-slot-avatar" />
              <span class="idle-slot-copy">
                <span class="idle-slot-title" />
                <span class="idle-slot-subtitle" />
              </span>
            </span>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { getGamingSessionData } from '@/api/sessionDataAdapter'
import { apiClient } from '@/api/httpClient'
import { wsClient } from '@/api/websocketClient'
import { listenGameflowPhase } from '@/services/gameflowPhaseListener'
import RefreshIconButton from '@/components/common/RefreshIconButton.vue'
import type { CacheUpdateEvent, Lobby, SessionData, SessionSummoner, Summoner } from '@/types/api'
import PlayerCard from '@/components/gaming/PlayerCard.vue'
import ParticipantRecentMatchesPanel from '@/components/gaming/ParticipantRecentMatchesPanel.vue'
import type { GamingAiAnalysisMode } from '@/services/gamingAiAnalysisPreview'
import { buildGamingAiInputSnapshot, getGamingPlayerKey } from '@/services/gamingAiInputSnapshot'
import {
  createGamingAiStreamRequest,
  streamGamingAiAnalysis,
  type GamingAiPlayerInsightEvent
} from '@/services/gamingAiServerStream'
import { isGamingAiAnalysisReady } from '@/services/gamingAiAnalysisReadiness'
import { isGamingAiAnalysisEnabledQueue, normalizeGamingQueueLabel } from '@/services/gamingAiQueue'
import {
  gamingAiInlineState,
  beginGamingAiInlineRun,
  clearGamingAiInlineMode,
  completeGamingAiInlineRun,
  hasCompletedGamingAiInlineRun,
  isGamingAiInlineRunCurrent,
  restoreCompletedGamingAiInlineRun,
  setGamingAiInlineError,
  setGamingAiInlineStreamState,
  upsertGamingAiInlineInsight,
  upsertGamingAiInlineVerdict
} from '@/services/gamingAiInlineState'
import { buildOpggChampionQuery } from '@/services/opggChampionQuery'
import {
  buildLobbyDisplaySessionSummoners,
  createGameflowPhaseTransitionTracker,
  createGamingSessionDataState,
  formatLobbyQueueName,
  isGameflowLobbyDisplayPhase,
  isGameflowSessionClearPhase,
  isGameflowSessionRefreshPhase,
  isPostgameNavigationLogPhase
} from '@/services/gamingSessionFlow'
import { useI18n, type MessageKey } from '@/i18n'

const { t } = useI18n()

const PREGAME_AUTO_ANALYSIS_TOOLTIP = '每局排位自动分析对局'
const PREGAME_AUTO_ANALYSIS_STORAGE_PREFIX = 'rankpeek.gaming.pregameAutoAnalysis'
const PREGAME_AUTO_ANALYSIS_MODES: GamingAiAnalysisMode[] = ['teammate', 'opponent']

const gamingViewRef = ref<HTMLElement | null>(null)

const sessionState = createGamingSessionDataState()
const gameflowPhaseTransitions = createGameflowPhaseTransitionTracker()
const sessionData = ref<SessionData>(sessionState.sessionData)
const currentGameflowPhase = ref('')
const lobbyData = ref<Lobby | null>(null)
const currentSummoner = ref<Summoner | null>(null)
const lobbyLoading = ref(false)
const lobbyError = ref('')

const initialLoading = ref(false)
const refreshing = ref(false)
const lastError = ref('')
const loading = computed(() => initialLoading.value || refreshing.value)
let refreshInterval: ReturnType<typeof setInterval> | null = null
let unsubscribeGameflowPhase: (() => void) | null = null
let unsubscribeCacheUpdate: (() => void) | null = null
let unsubscribeLobby: (() => void) | null = null
let cacheUpdateRefreshTimer: ReturnType<typeof setTimeout> | null = null
let lastCacheUpdateRefreshAt = 0
let sessionFetchInFlight = false
let lobbyFetchInFlight = false
let lobbyRequestId = 0
let hasCompletedInitialSessionFetch = false
const cacheUpdateRefreshDelay = 800
const minCacheUpdateRefreshInterval = 2500

let retryCount = 0
const maxRetries = 3

const failCount = ref(0)
const maxFailCount = 10
const isRefreshPaused = ref(false)
const pregameAutoAnalysisEnabled = ref<Record<GamingAiAnalysisMode, boolean>>({
  teammate: false,
  opponent: false
})
let autoResumeTimer: ReturnType<typeof setTimeout> | null = null
const lastPregameAutoAnalysisAttemptKeys: Record<GamingAiAnalysisMode, string> = {
  teammate: '',
  opponent: ''
}
const pregameAutoAnalysisInFlight: Record<GamingAiAnalysisMode, boolean> = {
  teammate: false,
  opponent: false
}

const hasActiveSession = computed(() => {
  const phase = sessionData.value.phase
  return Boolean(phase && !sessionData.value.stale && !sessionData.value.empty && !isGameflowSessionClearPhase(phase))
})
const displayedGameflowPhase = computed(() => currentGameflowPhase.value || sessionData.value.phase)
const hasLobbyPhase = computed(() => isGameflowLobbyDisplayPhase(displayedGameflowPhase.value))
const lobbyQueueLabel = computed(() => formatLobbyQueueName(lobbyData.value))
const lobbyTeamPlayers = computed<SessionSummoner[]>(() =>
  hasLobbyPhase.value ? buildLobbyDisplaySessionSummoners(lobbyData.value, currentSummoner.value, sessionData.value) : []
)

const blueTeamPlayers = computed(() => hasActiveSession.value ? (sessionData.value.teamOne || []) : lobbyTeamPlayers.value)
const redTeamPlayers = computed(() => hasActiveSession.value ? (sessionData.value.teamTwo || []) : [])
const blueTeamCount = computed(() => blueTeamPlayers.value.length)
const redTeamCount = computed(() => redTeamPlayers.value.length)
const blueEmptySlots = computed(() => Math.max(0, 5 - blueTeamCount.value))
const redEmptySlots = computed(() => Math.max(0, 5 - redTeamCount.value))

const allSessionPlayers = computed<SessionSummoner[]>(() => [
  ...blueTeamPlayers.value,
  ...redTeamPlayers.value
])
const expandedParticipantKeys = ref<Set<string>>(new Set())

function getParticipantKey(player: SessionSummoner | null | undefined): string {
  return getGamingPlayerKey(player)
}

function normalizeKeyPart(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return String(value)
  return ''
}

function isParticipantExpanded(player: SessionSummoner): boolean {
  const key = getParticipantKey(player)
  return Boolean(key && expandedParticipantKeys.value.has(key))
}

function toggleParticipantRecentMatches(player: SessionSummoner) {
  const key = getParticipantKey(player)
  if (!key) return
  const nextKeys = new Set(expandedParticipantKeys.value)
  if (nextKeys.has(key)) { nextKeys.delete(key) }
  else { nextKeys.add(key) }
  expandedParticipantKeys.value = nextKeys
}

const phaseCn = computed(() => {
  const phaseMap: Record<string, MessageKey> = {
    ChampSelect: 'gaming.phase.ChampSelect',
    GameStart: 'gaming.phase.GameStart',
    InProgress: 'gaming.phase.InProgress',
    PreEndOfGame: 'gaming.phase.PreEndOfGame',
    EndOfGame: 'gaming.phase.EndOfGame',
    PostGame: 'gaming.phase.EndOfGame',
    POST_GAME: 'gaming.phase.EndOfGame',
    Lobby: 'gaming.phase.Lobby',
    Matchmaking: 'gaming.phase.Matchmaking',
    ReadyCheck: 'gaming.phase.ReadyCheck',
    Reconnect: 'gaming.phase.Reconnect'
  }
  const phase = sessionData.value.phase
  if (!phase || phase === 'None') {
    return '等待对局'
  }
  const key = phaseMap[sessionData.value.phase]
  return key ? t(key) : '未进入对局'
})

const phaseClass = computed(() => {
  const phase = sessionData.value.phase
  if (!phase || phase === 'None') return 'phase-idle'
  if (phase === 'InProgress' || phase === 'GameStart') return 'phase-playing'
  if (phase === 'ChampSelect') return 'phase-select'
  if (phase === 'EndOfGame' || phase === 'PreEndOfGame' || phase === 'PostGame' || phase === 'POST_GAME') return 'phase-ended'
  return ''
})

const queueName = computed(() => {
  if (hasActiveSession.value) {
    return sessionData.value.typeCn || t('common.unknownMode')
  }
  if (hasLobbyPhase.value) {
    if (lobbyQueueLabel.value) {
      return lobbyQueueLabel.value
    }
    if (isGameflowLobbyDisplayPhase(sessionData.value.phase) && sessionData.value.typeCn) {
      return sessionData.value.typeCn
    }
    if (lobbyLoading.value) {
      return '正在读取大厅'
    }
    if (lobbyError.value) {
      return lobbyError.value
    }
    return '大厅'
  }
  if (lastError.value) {
    return lastError.value
  }
  return '未进入房间'
})
const queueUnknown = computed(() => {
  if (hasActiveSession.value) {
    return !sessionData.value.typeCn
  }
  if (hasLobbyPhase.value) {
    return !(lobbyQueueLabel.value || sessionData.value.typeCn)
  }
  return true
})
const gamingAiQueueLabel = computed(() => normalizeGamingQueueLabel(sessionData.value))
const opggQuery = computed(() => buildOpggChampionQuery(sessionData.value))
const opggButtonTitle = computed(() => opggQuery.value.reason || 'OP.GG')
const refreshButtonLabel = computed(() => {
  if (loading.value) return t('common.refreshing')
  return hasActiveSession.value ? t('common.refresh') : t('common.refreshStatus')
})

function getGamingAiModeState(mode: GamingAiAnalysisMode) {
  return gamingAiInlineState[mode]
}

function isGamingAiInlineModeBusy(mode: GamingAiAnalysisMode): boolean {
  const streamState = getGamingAiModeState(mode).streamState
  return streamState === 'preparing' || streamState === 'streaming'
}

function canStartGamingAiInlineAnalysis(mode: GamingAiAnalysisMode): boolean {
  return !isGamingAiInlineModeBusy(mode) && !hasCompletedGamingAiInlineAnalysis(mode) && isGamingAiAnalysisReady({
    mode,
    sessionData: sessionData.value
  })
}

function buildPregameAutoAnalysisAccountKey(): string {
  const summoner = sessionData.value.currentSummoner || currentSummoner.value
  const puuid = summoner?.puuid?.trim()
  if (puuid) {
    return puuid
  }

  const gameName = summoner?.gameName?.trim()
  const tagLine = summoner?.tagLine?.trim()
  if (gameName) {
    return `${gameName}#${tagLine || ''}`
  }

  return 'default'
}

function buildPregameAutoAnalysisStorageKey(mode: GamingAiAnalysisMode): string {
  return `${PREGAME_AUTO_ANALYSIS_STORAGE_PREFIX}.${buildPregameAutoAnalysisAccountKey()}.${mode}`
}

function isPregameAutoAnalysisEnabled(mode: GamingAiAnalysisMode): boolean {
  return pregameAutoAnalysisEnabled.value[mode] === true
}

function loadPregameAutoAnalysisSetting() {
  try {
    pregameAutoAnalysisEnabled.value = {
      teammate: window.localStorage.getItem(buildPregameAutoAnalysisStorageKey('teammate')) === '1',
      opponent: window.localStorage.getItem(buildPregameAutoAnalysisStorageKey('opponent')) === '1'
    }
  } catch {
    pregameAutoAnalysisEnabled.value = {
      teammate: false,
      opponent: false
    }
  }
}

function savePregameAutoAnalysisSetting(mode: GamingAiAnalysisMode) {
  try {
    window.localStorage.setItem(buildPregameAutoAnalysisStorageKey(mode), isPregameAutoAnalysisEnabled(mode) ? '1' : '0')
  } catch (error) {
    console.warn('Failed to save pregame auto analysis setting', error)
  }
}

function togglePregameAutoAnalysis(mode: GamingAiAnalysisMode) {
  pregameAutoAnalysisEnabled.value = {
    ...pregameAutoAnalysisEnabled.value,
    [mode]: !isPregameAutoAnalysisEnabled(mode)
  }
  lastPregameAutoAnalysisAttemptKeys[mode] = ''
  savePregameAutoAnalysisSetting(mode)
  if (isPregameAutoAnalysisEnabled(mode)) {
    void maybeStartPregameAutoAnalysis(mode)
  }
}

function getGamingAiButtonText(mode: GamingAiAnalysisMode): string {
  if (isGamingAiInlineModeBusy(mode)) {
    return '分析中...'
  }
  if (hasCompletedGamingAiInlineAnalysis(mode)) {
    return '已分析'
  }
  return mode === 'teammate' ? '队友成分' : '赛前分析'
}

function getGamingAiButtonTitle(mode: GamingAiAnalysisMode): string {
  if (hasCompletedGamingAiInlineAnalysis(mode)) {
    return '本局赛前分析已完成'
  }
  if (canStartGamingAiInlineAnalysis(mode)) {
    return mode === 'teammate' ? '分析当前队友成分' : '分析当前对手阵容'
  }
  if (isGamingAiInlineModeBusy(mode)) {
    return '分析正在进行'
  }
  return '排位阵容齐全并读取完成后可分析'
}

function getGamingAiModePlayers(mode: GamingAiAnalysisMode): SessionSummoner[] {
  return mode === 'teammate' ? blueTeamPlayers.value : redTeamPlayers.value
}

function buildGamingAiInlineRequestKey(mode: GamingAiAnalysisMode): string {
  const playerKeys = getGamingAiModePlayers(mode).map(getGamingAiPlayerCacheKey).sort().join('|')
  const requestKey = [
    mode,
    buildGamingAiInlineSessionKey(),
    gamingAiQueueLabel.value,
    String(sessionData.value.queueId || 0),
    playerKeys
  ].join('::')
  return requestKey
}

function buildGamingAiInlineSessionKey(): string {
  return normalizeKeyPart(sessionData.value.matchId) ||
    normalizeKeyPart(sessionData.value.gameId) ||
    normalizeKeyPart(sessionData.value.sessionKey) ||
    'pending-session'
}

function buildPregameAutoAnalysisAttemptKey(mode: GamingAiAnalysisMode): string {
  return [
    buildPregameAutoAnalysisStorageKey(mode),
    sessionData.value.sessionKey || sessionData.value.matchId || String(sessionData.value.gameId || ''),
    gamingAiQueueLabel.value,
    buildGamingAiInlineRequestKey(mode)
  ].join('::')
}

function getGamingAiPlayerCacheKey(player: SessionSummoner): string {
  return getGamingPlayerKey(player)
}

function hasGamingAiInlineResultForRequest(mode: GamingAiAnalysisMode, requestKey: string): boolean {
  const state = getGamingAiModeState(mode)
  return state.requestKey === requestKey &&
    (Object.keys(state.playerInsights).length > 0 || Object.keys(state.playerVerdicts).length > 0)
}

function hasCompletedGamingAiInlineResultForRequest(mode: GamingAiAnalysisMode, requestKey: string): boolean {
  return getGamingAiModeState(mode).streamState === 'completed' && hasGamingAiInlineResultForRequest(mode, requestKey)
}

function hasCompletedGamingAiInlineAnalysis(mode: GamingAiAnalysisMode): boolean {
  const requestKey = buildGamingAiInlineRequestKey(mode)
  return hasCompletedGamingAiInlineResultForRequest(mode, requestKey) || hasCompletedGamingAiInlineRun(mode, requestKey)
}

function restoreCompletedGamingAiInlineAnalysis(mode: GamingAiAnalysisMode, requestKey: string): boolean {
  if (hasCompletedGamingAiInlineResultForRequest(mode, requestKey)) {
    return true
  }
  return restoreCompletedGamingAiInlineRun(mode, requestKey)
}

function isGamingAiInlineCacheAvailable(mode: GamingAiAnalysisMode): boolean {
  if (!hasActiveSession.value || !isGamingAiAnalysisEnabledQueue(sessionData.value)) {
    return false
  }

  const players = getGamingAiModePlayers(mode)
  return players.length >= 5 && players.every(player => {
    const recordStatus = player.userTag?.recordStatus
    return !player.isLoading && Boolean(player.summoner || recordStatus === 'PRIVATE' || recordStatus === 'EMPTY' || recordStatus === 'ERROR')
  })
}

function syncGamingAiInlineCacheWithSession() {
  if (!hasCompletedInitialSessionFetch && !sessionData.value.phase) {
    return
  }

  const teammateRequestKey = buildGamingAiInlineRequestKey('teammate')
  const opponentRequestKey = buildGamingAiInlineRequestKey('opponent')

  syncGamingAiInlineModeCache('teammate', teammateRequestKey)
  syncGamingAiInlineModeCache('opponent', opponentRequestKey)
}

function syncGamingAiInlineModeCache(mode: GamingAiAnalysisMode, requestKey: string) {
  if (!isGamingAiInlineCacheAvailable(mode)) {
    clearGamingAiInlineMode(mode)
    return
  }

  if (gamingAiInlineState[mode].requestKey === requestKey) {
    return
  }

  if (!restoreCompletedGamingAiInlineAnalysis(mode, requestKey)) {
    clearGamingAiInlineMode(mode)
  }
}

async function startGamingAiInlineAnalysis(mode: GamingAiAnalysisMode) {
  if (isGamingAiInlineModeBusy(mode)) {
    return
  }
  const requestKey = buildGamingAiInlineRequestKey(mode)
  if (restoreCompletedGamingAiInlineAnalysis(mode, requestKey)) {
    return
  }
  if (!isGamingAiAnalysisReady({
    mode,
    sessionData: sessionData.value
  })) {
    return
  }

  const { controller, requestId } = beginGamingAiInlineRun(mode, requestKey)
  const players = mode === 'teammate' ? blueTeamPlayers.value : redTeamPlayers.value
  const snapshot = buildGamingAiInputSnapshot({
    mode,
    sessionData: sessionData.value,
    selectedPlayers: players,
    currentSummonerPuuid: sessionData.value.currentSummoner?.puuid
  })
  const request = createGamingAiStreamRequest(snapshot)

  const result = await streamGamingAiAnalysis(request, {
    onEvent: (event) => {
      if (!isGamingAiInlineRunCurrent(mode, requestId, controller)) {
        return
      }
      if (event.type === 'player_insight') {
        upsertGamingAiInlineInsight(mode, requestId, event)
        return
      }
      if (event.type === 'player_verdict') {
        upsertGamingAiInlineVerdict(mode, requestId, event)
        return
      }
      if (event.type === 'start' || event.type === 'section') {
        setGamingAiInlineStreamState(mode, requestId, 'streaming')
      }
    },
    onDelta: () => {
      if (isGamingAiInlineRunCurrent(mode, requestId, controller)) {
        setGamingAiInlineStreamState(mode, requestId, 'streaming')
      }
    },
    onError: (message) => {
      if (isGamingAiInlineRunCurrent(mode, requestId, controller)) {
        setGamingAiInlineError(mode, requestId, message)
      }
    },
    onDone: () => {
      completeGamingAiInlineRun(mode, requestId, controller)
    }
  }, { signal: controller.signal })

  if (!isGamingAiInlineRunCurrent(mode, requestId, controller)) {
    return
  }

  if (!result.ok) {
    if (!controller.signal.aborted) {
      setGamingAiInlineError(mode, requestId, result.message)
    }
    return
  }

  completeGamingAiInlineRun(mode, requestId, controller)
}

async function maybeStartPregameAutoAnalysis(mode: GamingAiAnalysisMode) {
  if (!isPregameAutoAnalysisEnabled(mode) || pregameAutoAnalysisInFlight[mode]) {
    return
  }
  if (!canStartGamingAiInlineAnalysis(mode)) {
    return
  }

  const attemptKey = buildPregameAutoAnalysisAttemptKey(mode)
  if (lastPregameAutoAnalysisAttemptKeys[mode] === attemptKey) {
    return
  }

  lastPregameAutoAnalysisAttemptKeys[mode] = attemptKey
  pregameAutoAnalysisInFlight[mode] = true
  try {
    await startGamingAiInlineAnalysis(mode)
  } finally {
    pregameAutoAnalysisInFlight[mode] = false
  }
}

function getGamingAiInlinePlayerInsight(
  mode: GamingAiAnalysisMode,
  player: SessionSummoner
): GamingAiPlayerInsightEvent | null {
  const state = getGamingAiModeState(mode)
  for (const key of getGamingAiInlinePlayerKeys(player)) {
    const insight = state.playerInsights[key]
    if (insight) {
      return insight
    }
  }

  for (const key of getGamingAiInlinePlayerKeys(player)) {
    const verdict = state.playerVerdicts[key]
    if (verdict?.reason) {
      return {
        playerKey: verdict.playerKey,
        label: verdict.label,
        text: verdict.reason,
        ...(verdict.tone ? { tone: verdict.tone } : {})
      }
    }
  }

  return null
}

function isGamingAiInlinePlayerLoading(mode: GamingAiAnalysisMode, player: SessionSummoner): boolean {
  return isGamingAiInlineModeBusy(mode) && !getGamingAiInlinePlayerInsight(mode, player)
}

function getGamingAiInlinePlayerError(mode: GamingAiAnalysisMode, player: SessionSummoner): string {
  if (getGamingAiInlinePlayerInsight(mode, player)) {
    return ''
  }
  const state = getGamingAiModeState(mode)
  return state.streamState === 'failed' ? state.streamError : ''
}

function getGamingAiInlinePlayerKeys(player: SessionSummoner): string[] {
  const keys = [
    getGamingAiInputPlayerKey(player),
    getParticipantKey(player)
  ].filter(Boolean)
  return Array.from(new Set(keys))
}

function getGamingAiInputPlayerKey(player: SessionSummoner): string {
  return getGamingPlayerKey(player)
}

async function openOpggWindow() {
  await window.electronAPI?.openOpggWindow?.(opggQuery.value)
}

function syncSessionDataFromState() {
  sessionData.value = sessionState.sessionData
}

function applyLobbyData(lobby: Lobby | null | undefined) {
  lobbyData.value = lobby || null
  lobbyError.value = ''
}

function clearLobbyStatus() {
  lobbyRequestId += 1
  lobbyData.value = null
  currentSummoner.value = null
  lobbyLoading.value = false
  lobbyError.value = ''
  lobbyFetchInFlight = false
}

async function fetchLobbyData(options: { force?: boolean } = {}) {
  if (lobbyFetchInFlight || (!options.force && lobbyData.value)) return

  const requestId = ++lobbyRequestId
  lobbyFetchInFlight = true
  lobbyLoading.value = true
  lobbyError.value = ''

  try {
    const lobby = await apiClient.getLobby()
    const state = await apiClient.getGameState().catch(() => null)
    if (requestId !== lobbyRequestId) return
    currentSummoner.value = state?.summoner || currentSummoner.value
    applyLobbyData(lobby)
  } catch (error) {
    if (requestId !== lobbyRequestId) return
    lobbyData.value = null
    lobbyError.value = extractFetchErrorMessage(error)
    console.warn('Failed to fetch lobby status', error)
  } finally {
    if (requestId === lobbyRequestId) {
      lobbyLoading.value = false
      lobbyFetchInFlight = false
    }
  }
}

function clearSessionDataForPhase(phase: string) {
  sessionState.clearForPhase(phase)
  syncSessionDataFromState()
  sessionFetchInFlight = false
  initialLoading.value = false
  refreshing.value = false
  lastError.value = ''
  retryCount = 0
}

function handleGameflowPhaseChange(phase: string) {
  currentGameflowPhase.value = phase
  console.debug(`[gameflow] phase=${phase}`)
  if (!gameflowPhaseTransitions.shouldHandlePhase(phase)) {
    return
  }

  if (isGameflowSessionRefreshPhase(phase)) {
    clearLobbyStatus()
    console.debug('未来这里可跳转到对战信息')
    retryCount = 0
    void fetchSessionData({ force: true })
    return
  }

  if (isGameflowSessionClearPhase(phase)) {
    clearSessionDataForPhase(phase)
    if (isGameflowLobbyDisplayPhase(phase)) {
      void fetchLobbyData({ force: true })
      void fetchSessionData({ showLoading: false, force: true })
    } else {
      clearLobbyStatus()
    }
    if (isPostgameNavigationLogPhase(phase)) {
      console.debug('未来这里可跳转到我的战绩')
    }
  }
}

async function fetchSessionData(options: { showLoading?: boolean; force?: boolean } = {}) {
  if (isRefreshPaused.value || (sessionFetchInFlight && !options.force)) return

  const shouldShowFetchState = options.showLoading !== false
  const showInitialLoading = shouldShowFetchState && !hasCompletedInitialSessionFetch
  const requestId = sessionState.beginFetch()
  sessionFetchInFlight = true
  lastError.value = ''
  if (showInitialLoading) {
    initialLoading.value = true
  } else if (shouldShowFetchState) {
    refreshing.value = true
  }
  try {
    const data = await getGamingSessionData({ forceRefresh: options.force === true })
    if (sessionState.applyFetchedData(requestId, data)) {
      syncSessionDataFromState()
      if (isGameflowLobbyDisplayPhase(sessionData.value.phase)) {
        void fetchLobbyData()
      } else {
        clearLobbyStatus()
      }
      failCount.value = 0
    }
  } catch (e) {
    if (sessionState.applyFetchFailure(requestId, currentGameflowPhase.value || sessionData.value.phase)) {
      syncSessionDataFromState()
      lastError.value = extractFetchErrorMessage(e)
      console.error('Failed to fetch session data', e)
      failCount.value++
      if (failCount.value >= maxFailCount) {
        pauseRefresh()
      }
    }
  } finally {
    if (sessionState.isCurrentRequest(requestId)) {
      hasCompletedInitialSessionFetch = true
      initialLoading.value = false
      refreshing.value = false
      sessionFetchInFlight = false
    }
  }
}

function extractFetchErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }
  return '对战信息刷新失败'
}

function collectCurrentSessionPuuids(): Set<string> {
  const puuids = new Set<string>()

  for (const player of sessionData.value.teamOne || []) {
    const puuid = player?.summoner?.puuid
    if (puuid) puuids.add(puuid)
  }

  for (const player of sessionData.value.teamTwo || []) {
    const puuid = player?.summoner?.puuid
    if (puuid) puuids.add(puuid)
  }

  return puuids
}

function isCacheUpdateRelevant(event: CacheUpdateEvent): boolean {
  if (!event || event.type !== 'PLAYER_CACHE_UPDATED' || !event.puuid) {
    return false
  }

  const currentPuuids = collectCurrentSessionPuuids()
  return currentPuuids.has(event.puuid)
}

function scheduleCacheUpdateRefresh() {
  if (isRefreshPaused.value) return

  const now = Date.now()
  const elapsed = now - lastCacheUpdateRefreshAt

  if (elapsed >= minCacheUpdateRefreshInterval) {
    lastCacheUpdateRefreshAt = now
    fetchSessionData({ showLoading: false })
    return
  }

  if (cacheUpdateRefreshTimer) return

  cacheUpdateRefreshTimer = setTimeout(() => {
    cacheUpdateRefreshTimer = null
    lastCacheUpdateRefreshAt = Date.now()
    fetchSessionData({ showLoading: false })
  }, cacheUpdateRefreshDelay)
}

function pauseRefresh() {
  isRefreshPaused.value = true
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
  if (autoResumeTimer) clearTimeout(autoResumeTimer)
  autoResumeTimer = setTimeout(() => {
    console.log('Auto-resuming session refresh')
    resumeRefresh()
  }, 15000)
}

function resumeRefresh() {
  isRefreshPaused.value = false
  failCount.value = 0
  lastError.value = ''
  if (autoResumeTimer) {
    clearTimeout(autoResumeTimer)
    autoResumeTimer = null
  }
  fetchSessionData({ showLoading: false })
  if (!refreshInterval) {
    refreshInterval = setInterval(() => fetchSessionData({ showLoading: false }), 5000)
  }
}

onMounted(() => {
  fetchSessionData()
  refreshInterval = setInterval(() => fetchSessionData({ showLoading: false }), 5000)
  unsubscribeGameflowPhase = listenGameflowPhase(handleGameflowPhaseChange)
  unsubscribeCacheUpdate = wsClient.onCacheUpdate((event: CacheUpdateEvent) => {
    if (isCacheUpdateRelevant(event)) {
      scheduleCacheUpdateRefresh()
    }
  })
  unsubscribeLobby = wsClient.onLobby((lobby) => {
    if (hasLobbyPhase.value) {
      applyLobbyData(lobby as Lobby)
    }
  })
})

watch(
  () => allSessionPlayers.value.map(getParticipantKey).join('|'),
  () => {
    const currentKeys = new Set(allSessionPlayers.value.map(getParticipantKey).filter(Boolean))
    const nextKeys = new Set([...expandedParticipantKeys.value].filter(key => currentKeys.has(key)))
    if (nextKeys.size !== expandedParticipantKeys.value.size) {
      expandedParticipantKeys.value = nextKeys
    }
  }
)

watch(
  () => [
    hasActiveSession.value ? 'active' : 'inactive',
    String(sessionData.value.queueId || 0),
    gamingAiQueueLabel.value,
    buildGamingAiInlineRequestKey('teammate'),
    buildGamingAiInlineRequestKey('opponent'),
    gamingAiInlineState.teammate.streamState,
    gamingAiInlineState.opponent.streamState,
    isGamingAiInlineCacheAvailable('teammate') ? 'teammate-ready' : 'teammate-unavailable',
    isGamingAiInlineCacheAvailable('opponent') ? 'opponent-ready' : 'opponent-unavailable'
  ].join('||'),
  () => {
    syncGamingAiInlineCacheWithSession()
    void maybeStartPregameAutoAnalysis('teammate')
    void maybeStartPregameAutoAnalysis('opponent')
  },
  { immediate: true }
)

watch(
  buildPregameAutoAnalysisAccountKey,
  () => {
    loadPregameAutoAnalysisSetting()
    for (const mode of PREGAME_AUTO_ANALYSIS_MODES) {
      lastPregameAutoAnalysisAttemptKeys[mode] = ''
      void maybeStartPregameAutoAnalysis(mode)
    }
  },
  { immediate: true }
)

watch(() => sessionData.value.phase, (newVal, oldVal) => {
  if (!hasActiveSession.value) {
    return
  }
  if (newVal === 'ChampSelect' && oldVal !== 'ChampSelect') {
    retryCount = 0
    setTimeout(() => fetchSessionData({ showLoading: false }), 1000)
  }
  if (newVal === 'InProgress' && oldVal !== 'InProgress') {
    retryCount = 0
    setTimeout(() => checkAndRetryFetch(), 2000)
  }
  if (newVal === 'GameStart' && oldVal !== 'GameStart') {
    setTimeout(() => fetchSessionData({ showLoading: false }), 1500)
  }
})

function checkAndRetryFetch() {
  if (!hasActiveSession.value) return
  const phase = sessionData.value.phase
  if (phase === 'InProgress' || phase === 'GameStart' || phase === 'ChampSelect') {
    const enemyMissing =
      !sessionData.value.teamTwo ||
      sessionData.value.teamTwo.length === 0 ||
      sessionData.value.teamTwo.every((p: any) => !p.summoner?.gameName)

    if (enemyMissing && retryCount < maxRetries) {
      retryCount++
      console.log(`Enemy data missing, retry ${retryCount}/${maxRetries} in 3 seconds`)
      setTimeout(() => {
        fetchSessionData({ showLoading: false })
        setTimeout(checkAndRetryFetch, 4000)
      }, 3000)
    }
  }
}

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
  if (autoResumeTimer) {
    clearTimeout(autoResumeTimer)
  }
  if (unsubscribeCacheUpdate) {
    unsubscribeCacheUpdate()
    unsubscribeCacheUpdate = null
  }
  if (unsubscribeGameflowPhase) {
    unsubscribeGameflowPhase()
    unsubscribeGameflowPhase = null
  }
  if (unsubscribeLobby) {
    unsubscribeLobby()
    unsubscribeLobby = null
  }
  if (cacheUpdateRefreshTimer) {
    clearTimeout(cacheUpdateRefreshTimer)
    cacheUpdateRefreshTimer = null
  }
})
</script>

<style scoped>
.gaming-view {
  --gaming-module-hover-rgb: 96, 176, 255;
  --gaming-module-hover-border: rgba(var(--gaming-module-hover-rgb), 0.48);
  --gaming-module-hover-shadow:
    0 0 0 1px rgba(var(--gaming-module-hover-rgb), 0.16),
    0 0 18px rgba(var(--gaming-module-hover-rgb), 0.18),
    0 12px 28px rgba(var(--gaming-module-hover-rgb), 0.08);
  --module-edge-color: var(--gaming-module-hover-border);
  --module-edge-glow: var(--gaming-module-hover-shadow);
  --control-glow-x: 50%;
  --control-glow-y: 50%;
  --control-edge-width: 1px;
  --control-edge-offset: -1px;
  --edge-glow-size: 82px;
  --gaming-control-border-local-glow: rgba(78, 215, 255, 0.98);
  --gaming-control-border-local-glow-fade: rgba(41, 151, 255, 0.48);
  --gaming-control-edge-rgb: 78, 215, 255;
  --gaming-control-edge-shadow:
    inset 0 1px 0 rgba(var(--gaming-control-edge-rgb), calc(var(--edge-top-alpha) * 0.82)),
    inset -1px 0 0 rgba(var(--gaming-control-edge-rgb), calc(var(--edge-right-alpha) * 0.82)),
    inset 0 -1px 0 rgba(var(--gaming-control-edge-rgb), calc(var(--edge-bottom-alpha) * 0.82)),
    inset 1px 0 0 rgba(var(--gaming-control-edge-rgb), calc(var(--edge-left-alpha) * 0.82)),
    0 -3px 11px -6px rgba(var(--gaming-control-edge-rgb), calc(var(--edge-top-alpha) * 0.48)),
    3px 0 11px -6px rgba(var(--gaming-control-edge-rgb), calc(var(--edge-right-alpha) * 0.48)),
    0 3px 11px -6px rgba(var(--gaming-control-edge-rgb), calc(var(--edge-bottom-alpha) * 0.48)),
    -3px 0 11px -6px rgba(var(--gaming-control-edge-rgb), calc(var(--edge-left-alpha) * 0.48));
  --gaming-control-bg-hover: rgba(28, 36, 48, 0.96);
  --gaming-control-border: var(--border-color);
  --gaming-control-border-hover: rgba(96, 176, 255, 0.58);
  --gaming-control-bg-hover-local: linear-gradient(var(--gaming-control-bg-hover), var(--gaming-control-bg-hover)) padding-box,
    radial-gradient(
      circle at var(--control-glow-x) var(--control-glow-y),
      var(--gaming-control-border-local-glow) 0%,
      var(--gaming-control-border-local-glow-fade) 36%,
      var(--gaming-control-border-hover) 72%
    ) border-box;
  --gaming-control-hover-shadow: 0 0 0 1px rgba(41, 151, 255, 0.16), 0 0 16px rgba(41, 151, 255, 0.22);
  --gaming-hover-border: var(--gaming-module-hover-border);
  --gaming-hover-shadow: var(--gaming-module-hover-shadow);
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

:global([data-theme="light"] .gaming-view) {
  --gaming-module-hover-rgb: 86, 109, 134;
  --gaming-module-hover-border: rgba(var(--gaming-module-hover-rgb), 0.42);
  --gaming-module-hover-shadow:
    0 0 0 1px rgba(var(--gaming-module-hover-rgb), 0.14),
    0 0 18px rgba(var(--gaming-module-hover-rgb), 0.14),
    0 12px 28px rgba(var(--gaming-module-hover-rgb), 0.07);
  --module-edge-color: var(--gaming-module-hover-border);
  --module-edge-glow: var(--gaming-module-hover-shadow);
  --gaming-control-border-local-glow: rgba(78, 215, 255, 0.98);
  --gaming-control-border-local-glow-fade: rgba(41, 151, 255, 0.48);
  --gaming-control-edge-rgb: 78, 215, 255;
  --gaming-control-bg-hover: rgba(244, 249, 255, 0.98);
  --gaming-control-border: var(--border-color);
  --gaming-control-border-hover: rgba(86, 109, 134, 0.42);
  --gaming-control-hover-shadow: 0 0 0 1px rgba(41, 151, 255, 0.12), 0 0 12px rgba(41, 151, 255, 0.2);
  --gaming-hover-border: var(--gaming-module-hover-border);
  --gaming-hover-shadow: var(--gaming-module-hover-shadow);
}

.gaming-content {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 16px;
}

.gaming-header {
  position: relative;
  overflow: hidden;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 9px 10px 9px 12px;
  background: var(--bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  box-shadow: none;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast);
}

.gaming-header:hover,
.gaming-header:focus-within {
  border-color: var(--gaming-module-hover-border);
  box-shadow: var(--gaming-module-hover-shadow);
}

.phase-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.phase-badge {
  flex: 0 0 auto;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
}

.phase-badge.phase-idle {
  color: var(--text-secondary);
}

.phase-badge.phase-playing {
  background: rgba(61, 155, 122, 0.2);
  color: #3d9b7a;
}

.phase-badge.phase-select {
  background: rgba(92, 163, 234, 0.2);
  color: #5ca3ea;
}

.phase-badge.phase-ended {
  background: rgba(128, 128, 128, 0.2);
  color: var(--text-secondary);
}

.queue-name {
  min-width: 0;
  max-width: 180px;
  padding: 6px 10px;
  border: 1px solid rgba(var(--accent-rgb), 0.18);
  border-radius: 999px;
  background: rgba(var(--accent-rgb), 0.055);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-name.unknown {
  border-color: var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  opacity: 0.68;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  justify-content: flex-end;
  margin-left: auto;
}

.opgg-action-btn {
  min-width: 68px;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid rgba(126, 198, 255, 0.44);
  border-radius: 9px;
  background: rgba(var(--accent-rgb), 0.065);
  color: #c7e6ff;
  font-size: 12px;
  line-height: 1;
  font-weight: 900;
  letter-spacing: 0;
  cursor: pointer;
  transition:
    border-color var(--transition-fast),
    background var(--transition-fast),
    box-shadow var(--transition-fast),
    color var(--transition-fast),
    opacity var(--transition-fast);
}

.opgg-action-btn:hover:not(:disabled),
.opgg-action-btn:focus-visible:not(:disabled) {
  border-color: transparent;
  background: var(--gaming-control-bg-hover-local);
  color: #e6f5ff;
  box-shadow: var(--gaming-control-hover-shadow), var(--gaming-control-edge-shadow);
  outline: none;
}

.opgg-action-btn:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

:global([data-theme="light"] .gaming-view .opgg-action-btn) {
  border-color: rgba(86, 109, 134, 0.24);
  background: rgba(255, 255, 255, 0.72);
  color: #2f4d6a;
}

:global([data-theme="light"] .gaming-view .opgg-action-btn:hover:not(:disabled)),
:global([data-theme="light"] .gaming-view .opgg-action-btn:focus-visible:not(:disabled)) {
  border-color: transparent;
  background: var(--gaming-control-bg-hover-local);
  color: #24384d;
  box-shadow: var(--gaming-control-hover-shadow), var(--gaming-control-edge-shadow);
}

/* 交互反馈只保留边框和底色变化：跟随鼠标的边缘泛光需要每次鼠标移动都重绘几十个元素，
   在低配机器上代价太高，也属于装饰性效果，包豪斯风格里直接去掉。 */
.control-glow,
.surface-glow {
  position: relative;
}

/* Teams */
.teams-container {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  align-content: start;
  align-items: stretch;
}

.team-panel {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-secondary);
  box-shadow: none;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast);
}

.team-panel:hover,
.team-panel:focus-within {
  border-color: var(--gaming-module-hover-border);
  box-shadow: var(--gaming-module-hover-shadow);
}

.team-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
}

.team-title {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}

.team-title::before {
  content: '';
  flex: 0 0 auto;
  width: 3px;
  height: 30px;
  border-radius: 999px;
  background: rgba(var(--team-accent-rgb), 0.74);
  box-shadow: 0 0 12px rgba(var(--team-accent-rgb), 0.18);
}

.team-title > div {
  min-width: 0;
}

.team-title h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 21px;
  line-height: 1.1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pregame-auto-analysis-toggle {
  flex: 0 0 auto;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  width: 108px;
  min-height: 32px;
  padding: 4px 10px 4px 5px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.36);
  box-shadow: none;
  cursor: pointer;
  transition:
    border-color var(--transition-fast),
    background var(--transition-fast),
    box-shadow var(--transition-fast);
}

.pregame-auto-analysis-toggle::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), transparent 58%);
  pointer-events: none;
}

.pregame-auto-analysis-toggle-track {
  position: relative;
  z-index: 1;
  display: block;
  width: 36px;
  height: 20px;
  border-radius: 999px;
  background: rgba(2, 6, 23, 0.42);
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.16);
  transition: background var(--transition-fast), box-shadow var(--transition-fast);
}

.pregame-auto-analysis-toggle:hover,
.pregame-auto-analysis-toggle:focus-visible {
  border-color: transparent;
  background: var(--gaming-control-bg-hover-local);
  box-shadow: var(--gaming-control-hover-shadow), var(--gaming-control-edge-shadow);
  outline: none;
}

.pregame-auto-analysis-toggle.active {
  border-color: rgba(56, 189, 248, 0.62);
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.86), rgba(34, 211, 238, 0.72));
}

.pregame-auto-analysis-toggle.active .pregame-auto-analysis-toggle-track {
  background: rgba(14, 116, 144, 0.48);
  box-shadow: inset 0 0 0 1px rgba(224, 247, 255, 0.26);
}

.pregame-auto-analysis-toggle.active:hover,
.pregame-auto-analysis-toggle.active:focus-visible {
  border-color: transparent;
  background: var(--gaming-control-bg-hover-local);
}

.pregame-auto-analysis-toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: #94a3b8;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.36);
  transform: translateX(0);
  transition:
    background var(--transition-fast),
    transform var(--transition-fast),
    box-shadow var(--transition-fast);
}

.pregame-auto-analysis-toggle.active .pregame-auto-analysis-toggle-knob {
  background: #e0f7ff;
  box-shadow: 0 2px 10px rgba(8, 47, 73, 0.38);
  transform: translateX(16px);
}

.pregame-auto-analysis-toggle-text {
  position: relative;
  z-index: 1;
  color: rgba(226, 232, 240, 0.82);
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
  transition: color var(--transition-fast);
}

.pregame-auto-analysis-toggle.active .pregame-auto-analysis-toggle-text,
.pregame-auto-analysis-toggle:hover .pregame-auto-analysis-toggle-text,
.pregame-auto-analysis-toggle:focus-visible .pregame-auto-analysis-toggle-text {
  color: #e6f5ff;
}

:global([data-theme="light"] .gaming-view .pregame-auto-analysis-toggle) {
  border-color: rgba(86, 109, 134, 0.2);
  background: rgba(226, 232, 240, 0.72);
}

:global([data-theme="light"] .gaming-view .pregame-auto-analysis-toggle-track) {
  background: rgba(148, 163, 184, 0.34);
}

:global([data-theme="light"] .gaming-view .pregame-auto-analysis-toggle.active) {
  border-color: rgba(14, 116, 144, 0.38);
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.78), rgba(34, 211, 238, 0.64));
}

:global([data-theme="light"] .gaming-view .pregame-auto-analysis-toggle-text) {
  color: #3c5871;
}

:global([data-theme="light"] .gaming-view .pregame-auto-analysis-toggle.active .pregame-auto-analysis-toggle-text),
:global([data-theme="light"] .gaming-view .pregame-auto-analysis-toggle:hover .pregame-auto-analysis-toggle-text),
:global([data-theme="light"] .gaming-view .pregame-auto-analysis-toggle:focus-visible .pregame-auto-analysis-toggle-text) {
  color: #17324a;
}

.team-analysis-btn {
  flex: 0 0 auto;
  min-width: 92px;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid rgba(126, 198, 255, 0.48);
  border-radius: 9px;
  background: rgba(var(--accent-rgb), 0.065);
  color: #c7e6ff;
  box-shadow: none;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  opacity: 1;
  transition:
    border-color var(--transition-fast),
    background var(--transition-fast),
    box-shadow var(--transition-fast),
    color var(--transition-fast);
}

.team-analysis-btn:hover:not(:disabled),
.team-analysis-btn:focus-visible:not(:disabled) {
  border-color: transparent;
  background: var(--gaming-control-bg-hover-local);
  color: #e6f5ff;
  box-shadow: var(--gaming-control-hover-shadow), var(--gaming-control-edge-shadow);
  outline: none;
}

.team-analysis-btn:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

:global([data-theme="light"] .gaming-view .team-analysis-btn) {
  border-color: rgba(86, 109, 134, 0.24);
  background: rgba(255, 255, 255, 0.72);
  color: #2f4d6a;
  box-shadow: none;
}

:global([data-theme="light"] .gaming-view .team-analysis-btn:hover:not(:disabled)),
:global([data-theme="light"] .gaming-view .team-analysis-btn:focus-visible:not(:disabled)) {
  border-color: transparent;
  background: var(--gaming-control-bg-hover-local);
  color: #24384d;
  box-shadow: var(--gaming-control-hover-shadow), var(--gaming-control-edge-shadow);
}

.team-header-blue {
  --team-accent-rgb: 96, 165, 250;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(59, 130, 246, 0.1));
  color: #93c5fd;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.team-header-red {
  --team-accent-rgb: 248, 113, 113;
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(239, 68, 68, 0.1));
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.team-players {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1 1 auto;
  min-height: 0;
}

.gaming-player-card.surface-glow {
  transition: background var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.gaming-player-card.surface-glow:hover,
.gaming-player-card.surface-glow:focus-within {
  border-color: var(--gaming-hover-border);
  box-shadow: var(--gaming-hover-shadow);
}

/* 悬停只提亮整圈边框，不再只亮左边一条 */
.gaming-player-card.surface-glow.team-blue:hover,
.gaming-player-card.surface-glow.team-blue:focus-within {
  border-color: rgba(92, 163, 234, 0.55);
}

.gaming-player-card.surface-glow.team-red:hover,
.gaming-player-card.surface-glow.team-red:focus-within {
  border-color: rgba(222, 111, 111, 0.55);
}

.participant-recent-inline-panel.surface-glow {
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast);
}

.participant-recent-inline-panel.surface-glow:hover,
.participant-recent-inline-panel.surface-glow:focus-within {
  border-color: var(--gaming-hover-border);
  box-shadow: var(--gaming-hover-shadow);
}

.idle-player-slot-blue {
  --slot-accent-rgb: 96, 165, 250;
  --slot-bar-color: rgba(92, 163, 234, 0.7);
  --slot-border-color: rgba(92, 163, 234, 0.2);
  --slot-border-hover: rgba(92, 163, 234, 0.28);
  --slot-avatar-bg: rgba(92, 163, 234, 0.14);
  --slot-line-bg: rgba(92, 163, 234, 0.2);
}

.idle-player-slot-red {
  --slot-accent-rgb: 248, 113, 113;
  --slot-bar-color: rgba(222, 111, 111, 0.7);
  --slot-border-color: rgba(222, 111, 111, 0.2);
  --slot-border-hover: rgba(222, 111, 111, 0.28);
  --slot-avatar-bg: rgba(222, 111, 111, 0.13);
  --slot-line-bg: rgba(222, 111, 111, 0.19);
}

.idle-player-slot {
  position: relative;
  min-width: 0;
  min-height: 48px;
  flex: 0 0 48px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid var(--slot-border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  opacity: 0.84;
  overflow: hidden;
  transition: border-color var(--transition-fast), opacity var(--transition-fast);
}

.idle-player-slot:hover {
  border-color: var(--slot-border-hover);
  opacity: 0.9;
}

.idle-slot-avatar {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--slot-avatar-bg);
}

.idle-slot-copy {
  width: 100%;
  height: 30px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.idle-slot-title,
.idle-slot-subtitle {
  display: block;
  border-radius: 4px;
  background: var(--slot-line-bg);
}

.idle-slot-title {
  width: min(108px, 54%);
  height: 13px;
}

.idle-slot-subtitle {
  width: min(66px, 34%);
  height: 11px;
  opacity: 0.72;
}

.connection-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 10px 16px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  color: #fca5a5;
  font-size: 13px;
  margin-bottom: 12px;
}

.error-icon {
  flex: 0 0 auto;
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #f87171;
  box-shadow: 0 0 0 4px rgba(248, 113, 113, 0.12), 0 0 12px rgba(248, 113, 113, 0.26);
}

.resume-btn-small {
  --gaming-control-border-local-glow: rgba(248, 113, 113, 0.9);
  --gaming-control-border-local-glow-fade: rgba(239, 68, 68, 0.42);
  --gaming-control-edge-rgb: 248, 113, 113;
  padding: 6px 14px;
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  font-weight: 600;
}

.resume-btn-small:hover,
.resume-btn-small:focus-visible {
  border-color: transparent;
  background: var(--gaming-control-bg-hover-local);
  box-shadow: var(--gaming-control-hover-shadow), var(--gaming-control-edge-shadow);
  outline: none;
}

@media (min-width: 1180px) {
  .teams-container {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .idle-player-slot {
    flex: 1 1 48px;
  }
}

@media (max-width: 720px) {
  .gaming-content {
    gap: 12px;
  }

  .team-header {
    align-items: stretch;
    flex-direction: column;
  }

  .team-analysis-btn {
    align-self: flex-start;
    min-width: 88px;
    min-height: 30px;
    padding: 0 10px;
    font-size: 12px;
  }

  .team-panel {
    padding: 8px;
  }

  .idle-player-slot {
    min-height: 44px;
    flex-basis: 44px;
    gap: 8px;
    padding: 9px 11px;
  }

  .idle-slot-avatar {
    width: 28px;
    height: 28px;
  }

  .idle-slot-copy {
    height: 26px;
  }

  .idle-slot-title {
    width: min(96px, 58%);
    height: 11px;
  }

  .idle-slot-subtitle {
    width: min(58px, 38%);
    height: 10px;
  }

  .team-title h2 {
    font-size: 20px;
  }
}
</style>
