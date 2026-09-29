import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiClient } from '@/api/httpClient'
import { wsClient } from '@/api/websocketClient'
import { loadLcuGameAssetMetadataOverlay } from '@/utils/gameAssetUrls'
import { maskSummonerName } from '@/utils/privacyMode'
import type { GameState, Summoner, Rank, QueueInfo, MatchHistory } from '@/types/api'

export const useGameStore = defineStore('game', () => {
  // 状态
  const connected = ref(false)
  const gamePhase = ref<string>('')
  const currentSummoner = ref<Summoner | null>(null)
  const currentRank = ref<Rank | null>(null)
  const rankLoading = ref(false)
  const rankError = ref<string | null>(null)
  const matchHistory = ref<MatchHistory[]>([])
  let rankRequestId = 0
  let lastAssetMetadataOverlayRefreshAt = 0
  let assetMetadataOverlayRefreshPromise: Promise<void> | null = null
  const assetMetadataOverlayRefreshIntervalMs = 60_000

  // 计算属性
  const isConnected = computed(() => connected.value)
  const isInGame = computed(() =>
    ['InProgress', 'ChampSelect', 'ReadyCheck'].includes(gamePhase.value)
  )
  const summonerName = computed(() => {
    if (!currentSummoner.value) return ''
    const s = currentSummoner.value
    const name = s.tagLine ? `${s.gameName}#${s.tagLine}` : s.gameName
    return maskSummonerName(name, s.puuid)
  })

  // 排位信息
  const soloRank = computed((): QueueInfo | null =>
    currentRank.value?.queueMap?.RANKED_SOLO_5x5 || null
  )
  const flexRank = computed((): QueueInfo | null =>
    currentRank.value?.queueMap?.RANKED_FLEX_SR || null
  )

  async function applyGameState(state: GameState, options: { confirmDisconnect?: boolean } = {}) {
    if (!state.connected && options.confirmDisconnect !== false) {
      const stillConnected = await apiClient.checkConnection()
      if (stillConnected) {
        connected.value = true
        refreshLcuGameAssetMetadataOverlay()
        if (state.phase) {
          gamePhase.value = state.phase
        }
        if (state.summoner?.puuid) {
          currentSummoner.value = state.summoner
          void fetchRank(state.summoner.puuid)
        } else if (!currentSummoner.value) {
          void refreshSummoner()
        }
        return
      }
    }

    connected.value = state.connected
    gamePhase.value = state.phase || ''

    if (!state.connected) {
      clearConnectedSessionState()
      return
    }

    refreshLcuGameAssetMetadataOverlay()
    currentSummoner.value = state.summoner ?? currentSummoner.value

    if (state.summoner?.puuid) {
      void fetchRank(state.summoner.puuid)
      return
    }

    clearRankState()
    void refreshSummoner()
  }

  /**
   * 初始化连接
   */
  async function initConnection() {
    // 连接 WebSocket
    wsClient.connect()

    // 订阅游戏状态
    wsClient.onGameState((state: GameState) => {
      void applyGameState(state)
    })

    // 初始检查
    await checkConnection()
  }

  /**
   * 检查连接状态
   */
  async function checkConnection() {
    try {
      const connectedNow = await apiClient.checkConnection()
      connected.value = connectedNow
      if (!connectedNow) {
        clearConnectedSessionState()
        return
      }

      refreshLcuGameAssetMetadataOverlay()
      const state = await apiClient.getGameState()
      await applyGameState(state, { confirmDisconnect: false })
    } catch {
      const connectedNow = await apiClient.checkConnection()
      connected.value = connectedNow
      if (!connectedNow) {
        clearConnectedSessionState()
      } else if (!currentSummoner.value) {
        refreshLcuGameAssetMetadataOverlay()
        void refreshSummoner()
      }
    }
  }

  /**
   * 刷新召唤师信息
   */
  async function refreshSummoner() {
    try {
      const summoner = await apiClient.getMySummoner()
      connected.value = true
      refreshLcuGameAssetMetadataOverlay()
      currentSummoner.value = summoner
      await fetchRank(summoner.puuid)
    } catch (error) {
      console.error('Failed to refresh summoner:', error)
    }
  }

  /**
   * 获取段位信息
   */
  async function fetchRank(puuid: string): Promise<Rank | null> {
    const requestId = ++rankRequestId
    rankLoading.value = true
    rankError.value = null
    currentRank.value = null
    try {
      const rank = await apiClient.getRank(puuid)
      if (requestId === rankRequestId) {
        currentRank.value = rank
      }
      return rank
    } catch (error) {
      console.error('Failed to fetch rank:', error)
      if (requestId === rankRequestId) {
        currentRank.value = null
        rankError.value = 'failed'
      }
      return null
    } finally {
      if (requestId === rankRequestId) {
        rankLoading.value = false
      }
    }
  }

  function clearRankState() {
    rankRequestId += 1
    currentRank.value = null
    rankLoading.value = false
    rankError.value = null
  }

  function clearConnectedSessionState() {
    gamePhase.value = ''
    currentSummoner.value = null
    lastAssetMetadataOverlayRefreshAt = 0
    clearRankState()
  }

  function refreshLcuGameAssetMetadataOverlay() {
    const now = Date.now()
    if (assetMetadataOverlayRefreshPromise) return
    if (now - lastAssetMetadataOverlayRefreshAt < assetMetadataOverlayRefreshIntervalMs) return

    lastAssetMetadataOverlayRefreshAt = now
    assetMetadataOverlayRefreshPromise = loadLcuGameAssetMetadataOverlay()
      .finally(() => {
        assetMetadataOverlayRefreshPromise = null
      })
  }

  /**
   * 获取战绩
   */
  async function fetchMatchHistory(puuid: string, count = 20) {
    try {
      matchHistory.value = await apiClient.getMatchHistory(puuid, 0, count)
    } catch (error) {
      console.error('Failed to fetch match history:', error)
    }
  }

  /**
   * 根据名称查询召唤师
   */
  async function fetchSummonerByName(name: string): Promise<Summoner | null> {
    try {
      return await apiClient.getSummonerByName(name)
    } catch (error) {
      console.error('Failed to fetch summoner by name:', error)
      return null
    }
  }

  return {
    // 状态
    connected,
    gamePhase,
    currentSummoner,
    currentRank,
    rankLoading,
    rankError,
    matchHistory,

    // 计算属性
    isConnected,
    isInGame,
    summonerName,
    soloRank,
    flexRank,

    // 方法
    initConnection,
    checkConnection,
    refreshSummoner,
    fetchRank,
    fetchMatchHistory,
    fetchSummonerByName
  }
})
