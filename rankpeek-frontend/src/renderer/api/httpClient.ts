import type {
  ApiResponse,
  AppConfig,
  AramBalanceData,
  AssetDetails,
  CacheClearResult,
  CacheClearMode,
  CacheClearScope,
  CacheRepairResult,
  CacheStatus,
  ChampionOption,
  GameDetail,
  GameModeOption,
  GameState,
  HextechAugmentBoardRow,
  HextechAugmentDefinition,
  HextechChampionDetail,
  HextechChampionRank,
  HextechContributionPreview,
  HextechContributionStatus,
  HextechOverlayData,
  HextechSelfDataSummary,
  HextechDataPackageStatus,
  HextechStatus,
  Lobby,
  MatchHistory,
  MatchHistoryPageResponse,
  MatchTimelineFetchResult,
  Rank,
  SessionData,
  Summoner,
  UserStoreStatus,
  UserTag,
  UserTagSummary,
  WinRate
} from '@/types/api'
import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios'

declare module 'axios' {
  interface AxiosRequestConfig {
    suppressErrorLog?: boolean
  }
}

export const API_BASE_URL = 'http://127.0.0.1:8080/api/v1'

class ApiError extends Error {
  code: number
  timestamp: number

  constructor(message: string, code: number, timestamp: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.timestamp = timestamp
  }
}

class ApiClient {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    })

    this.client.interceptors.request.use((config) => {
      config.headers['X-Request-ID'] = crypto.randomUUID()
      config.headers['X-Request-Time'] = Date.now().toString()
      return config
    })

    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        const suppressErrorLog = error.config?.suppressErrorLog === true || axios.isCancel(error) || error.code === 'ERR_CANCELED'
        if (error.response?.status === 503 && !suppressErrorLog) {
          console.warn('LCU 服务不可用')
        }
        if (!suppressErrorLog) {
          console.error('API Error:', error.message)
        }
        return Promise.reject(error)
      }
    )
  }

  /**
   * 发送 GET 请求并解包响应数据
   */
  private async get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    const { data: response } = await this.client.get<ApiResponse<T>>(url, { params })
    if (response.code !== 200) {
      throw new ApiError(response.message, response.code, response.timestamp)
    }
    return response.data
  }

  /**
   * 发送 POST 请求（无返回数据）
   */
  private async postVoid(url: string, data?: unknown): Promise<void> {
    const { data: response } = await this.client.post<ApiResponse<void>>(url, data)
    if (response.code !== 200) {
      throw new ApiError(response.message, response.code, response.timestamp)
    }
  }

  /**
   * 发送 POST 请求并解包响应数据
   */
  private async post<T>(
    url: string,
    data?: unknown,
    params?: Record<string, unknown>,
    config?: Pick<AxiosRequestConfig, 'signal' | 'suppressErrorLog'>
  ): Promise<T> {
    const { data: response } = await this.client.post<ApiResponse<T>>(url, data, {
      params,
      signal: config?.signal,
      suppressErrorLog: config?.suppressErrorLog
    })
    if (response.code !== 200) {
      throw new ApiError(response.message, response.code, response.timestamp)
    }
    return response.data
  }

  /**
   * 发送 PUT 请求（无返回数据）
   */
  private async putVoid(url: string, data?: unknown): Promise<void> {
    const { data: response } = await this.client.put<ApiResponse<void>>(url, data)
    if (response.code !== 200) {
      throw new ApiError(response.message, response.code, response.timestamp)
    }
  }

  // ========== 召唤师 API ==========

  /**
   * 获取当前召唤师信息
   */
  async getMySummoner(): Promise<Summoner> {
    return this.get<Summoner>('/summoner/me')
  }

  /**
   * 根据 PUUID 获取召唤师
   */
  async getSummonerByPuuid(puuid: string): Promise<Summoner> {
    return this.get<Summoner>(`/summoner/puuid/${puuid}`)
  }

  /**
   * 根据名称获取召唤师
   */
  async getSummonerByName(name: string): Promise<Summoner> {
    return this.get<Summoner>(`/summoner/name/${encodeURIComponent(name)}`)
  }

  /**
   * 获取段位信息
   */
  async getRank(puuid: string): Promise<Rank> {
    return this.get<Rank>(`/summoner/rank/${puuid}`)
  }

  /**
   * 获取战绩
   * @param puuid 玩家 PUUID
   * @param begIndex 起始索引（inclusive）
   * @param endIndex 结束索引（inclusive）
   */
  async getMatchHistory(
    puuid: string,
    begIndex = 0,
    endIndex = 9,
    options: { forceRefresh?: boolean } = {}
  ): Promise<MatchHistory[]> {
    return this.get<MatchHistory[]>(`/summoner/matches/${puuid}`, {
      begIndex,
      endIndex,
      forceRefresh: options.forceRefresh === true
    })
  }

  /**
   * 获取筛选后的战绩
   */
  async getFilteredMatchHistory(
    puuid: string,
    options: {
      begIndex?: number
      endIndex?: number
      queueId?: number
      championId?: number
      maxResults?: number
      forceRefresh?: boolean
    } = {}
  ): Promise<MatchHistory[]> {
    return this.get<MatchHistory[]>(`/summoner/matches-filtered/${puuid}`, {
      begIndex: options.begIndex,
      endIndex: options.endIndex,
      queueId: options.queueId,
      championId: options.championId,
      maxResults: options.maxResults,
      forceRefresh: options.forceRefresh === true
    })
  }

  /**
   * 获取分页战绩
   */
  async getMatchHistoryPage(
    puuid: string,
    options: {
      page?: number
      pageSize?: number
      source?: 'auto' | 'sgp' | 'lcu' | 'cache'
      queueId?: number
      championId?: number
      forceRefresh?: boolean
    } = {}
  ): Promise<MatchHistoryPageResponse> {
    return this.get<MatchHistoryPageResponse>(`/summoner/matches-page/${puuid}`, {
      page: options.page,
      pageSize: options.pageSize,
      source: options.source ?? 'auto',
      queueId: options.queueId,
      championId: options.championId,
      forceRefresh: options.forceRefresh === true
    })
  }

  /**
   * 获取服务器名称
   */
  async getPlatformName(name: string): Promise<string> {
    return this.get<string>(`/summoner/platform/${encodeURIComponent(name)}`)
  }

  /**
   * 获取胜率统计
   */
  async getWinRate(puuid: string, mode?: number): Promise<WinRate> {
    return this.get<WinRate>(`/summoner/win-rate/${puuid}`, { mode })
  }

  /**
   * 获取排位胜率统计（从战绩计算真实胜率）
   */
  async getRankedWinRates(puuid: string): Promise<Record<string, WinRate>> {
    return this.get<Record<string, WinRate>>(`/summoner/ranked-win-rates/${puuid}`)
  }

  // ========== 会话 API ==========

  /**
   * 获取游戏状态
   */
  async getGameState(): Promise<GameState> {
    return this.get<GameState>('/session/game-state')
  }

  /**
   * 获取游戏阶段
   */
  async getGamePhase(): Promise<string> {
    return this.get<string>('/session/phase')
  }

  /**
   * 获取大厅信息
   */
  async getLobby(): Promise<Lobby> {
    return this.get<Lobby>('/session/lobby')
  }

  /**
   * 开始匹配
   */
  async startMatchmaking(): Promise<void> {
    return this.postVoid('/session/matchmaking/start')
  }

  /**
   * 取消匹配
   */
  async cancelMatchmaking(): Promise<void> {
    return this.postVoid('/session/matchmaking/cancel')
  }

  /**
   * 接受对局
   */
  async acceptMatch(): Promise<void> {
    return this.postVoid('/session/accept')
  }

  /**
   * 检查连接状态
   */
  async checkConnection(): Promise<boolean> {
    try {
      return await this.get<boolean>('/session/connected')
    } catch {
      return false
    }
  }

  // ========== 配置 API ==========

  /**
   * 获取所有配置
   */
  async getConfig(): Promise<AppConfig> {
    return this.get<AppConfig>('/config')
  }

  /**
   * 获取指定配置
   */
  async getConfigValue(key: string): Promise<unknown> {
    return this.get<unknown>(`/config/${key}`)
  }

  /**
   * 更新配置
   */
  async setConfig(key: string, value: unknown): Promise<void> {
    return this.putVoid(`/config/${key}`, { value })
  }

  /**
   * 获取英雄选项列表
   */
  async getChampionOptions(): Promise<ChampionOption[]> {
    return this.get<ChampionOption[]>('/config/champions')
  }

  /**
   * 海斗数据状态（数据日期 / 来源 / 条数）
   */
  async getHextechStatus(): Promise<HextechStatus> {
    return this.get<HextechStatus>('/hextech/status')
  }

  /**
   * 海斗强化榜（含名称 / 稀有度 / 胜率 / 选取率 / 最适配英雄）
   */
  async getHextechAugments(): Promise<HextechAugmentBoardRow[]> {
    return this.get<HextechAugmentBoardRow[]>('/hextech/augments')
  }

  /**
   * 海斗英雄榜（含排名变化与最佳拍档）
   */
  async getHextechChampions(): Promise<HextechChampionRank[]> {
    return this.get<HextechChampionRank[]>('/hextech/champions')
  }

  /**
   * 单英雄海斗详情（101 排名 + aramgg 强化矩阵）
   */
  async getHextechChampionDetail(championId: number): Promise<HextechChampionDetail> {
    return this.get<HextechChampionDetail>(`/hextech/champion/${championId}`)
  }

  /** 全部强化定义（OCR 匹配候选集；比 101 榜单全，能认出没进榜单的强化） */
  async getHextechAugmentDefinitions(): Promise<HextechAugmentDefinition[]> {
    return this.get<HextechAugmentDefinition[]>('/hextech/augment-definitions')
  }

  /** 悬浮窗数据：自动识别当前英雄（选人/局内）并返回该英雄的强化排行 */
  async getHextechOverlay(championId?: number | null): Promise<HextechOverlayData> {
    return this.get<HextechOverlayData>(
      '/hextech/overlay',
      championId && championId > 0 ? { championId } : undefined
    )
  }

  /** 海斗匿名数据贡献状态（是否已同意 / 待上传局数 / 上次结果） */
  async getHextechContribution(): Promise<HextechContributionStatus> {
    return this.get<HextechContributionStatus>('/hextech/contribution')
  }

  /** 同意或撤回同意贡献海斗匿名数据 */
  async setHextechContributionEnabled(enabled: boolean): Promise<HextechContributionStatus> {
    return this.post<HextechContributionStatus>('/hextech/contribution/enabled', undefined, { enabled })
  }

  /** 上传前给玩家看的字段说明与示例 */
  async getHextechContributionPreview(): Promise<HextechContributionPreview> {
    return this.get<HextechContributionPreview>('/hextech/contribution/preview')
  }

  /** 立即上传待贡献的对局 */
  async uploadHextechContribution(): Promise<HextechContributionStatus> {
    return this.post<HextechContributionStatus>('/hextech/contribution/upload')
  }

  /** 自建层（玩家贡献）数据状态 */
  async getHextechSelfData(): Promise<HextechSelfDataSummary> {
    return this.get<HextechSelfDataSummary>('/hextech/self-data')
  }

  /** 数据包下载状态（数据版本 / 更新时间 / 下次自动检查时间） */
  async getHextechDataPackage(): Promise<HextechDataPackageStatus> {
    return this.get<HextechDataPackageStatus>('/hextech/data-package')
  }

  /** 手动检查更新：无视下载 CD，返回检查后的最新状态 */
  async checkHextechDataPackage(): Promise<HextechDataPackageStatus> {
    return this.post<HextechDataPackageStatus>('/hextech/data-package/check')
  }

  /**
   * 获取游戏模式列表
   */
  async getGameModes(): Promise<GameModeOption[]> {
    return this.get<GameModeOption[]>('/config/game-modes')
  }

  // ========== 用户标签 API ==========

  /**
   * 根据名称获取用户标签
   */
  async getUserTagByName(name: string, mode = 0): Promise<UserTag> {
    return this.get<UserTag>(`/user-tag/name/${encodeURIComponent(name)}`, { mode })
  }

  /**
   * 根据 PUUID 获取用户标签
   */
  async getUserTagByPuuid(puuid: string, mode = 0): Promise<UserTag> {
    return this.get<UserTag>(`/user-tag/puuid/${puuid}`, { mode })
  }

  /**
   * 批量获取用户标签摘要
   */
  async getUserTagSummaryBatch(
    puuids: string[],
    mode = 0,
    options?: Pick<AxiosRequestConfig, 'signal' | 'suppressErrorLog'>
  ): Promise<Record<string, UserTagSummary>> {
    if (puuids.length === 0) {
      return {}
    }
    return this.post<Record<string, UserTagSummary>>('/user-tag/batch-summary', { puuids, mode }, undefined, options)
  }

  async getUserTagSummaryFromMatches(
    puuid: string,
    matches: MatchHistory[],
    mode = 0,
    options?: Pick<AxiosRequestConfig, 'signal' | 'suppressErrorLog'>
  ): Promise<UserTagSummary> {
    return this.post<UserTagSummary>('/user-tag/summary-from-matches', { puuid, mode, matches }, undefined, options)
  }

  // ========== Fandom API ==========

  /**
   * 更新 Fandom 数据
   */
  async updateFandomData(): Promise<string> {
    return this.post<string>('/fandom/update')
  }

  /**
   * 获取英雄 ARAM 平衡数据
   */
  async getAramBalance(championId: number): Promise<AramBalanceData> {
    return this.get<AramBalanceData>(`/fandom/aram/${championId}`)
  }

  /**
   * 获取所有 ARAM 平衡数据
   */
  async getAllAramBalance(): Promise<Record<number, AramBalanceData>> {
    return this.get<Record<number, AramBalanceData>>('/fandom/aram')
  }

  /**
   * 检查 Fandom 数据状态
   */
  async getFandomStatus(): Promise<{ hasData: boolean; message: string }> {
    return this.get<{ hasData: boolean; message: string }>('/fandom/status')
  }

  // ========== Cache API ==========

  async getCacheStatus(): Promise<CacheStatus> {
    return this.get<CacheStatus>('/cache/status')
  }

  async clearCache(scope: CacheClearScope, confirm = true, mode: CacheClearMode = 'normal'): Promise<CacheClearResult> {
    return this.post<CacheClearResult>('/cache/clear', undefined, { scope, confirm, mode })
  }

  async repairCache(confirm = true): Promise<CacheRepairResult> {
    return this.post<CacheRepairResult>('/cache/repair', undefined, { confirm })
  }

  async getUserStoreStatus(): Promise<UserStoreStatus> {
    return this.get<UserStoreStatus>('/user-store/status')
  }

  // ========== 资源 API ==========

  /**
   * 获取资源详情
   */
  async getAssetDetails(type: string, ids: number[]): Promise<AssetDetails[]> {
    return this.get<AssetDetails[]>('/asset/details', { type, ids: ids.join(',') })
  }

  /**
   * 获取单个资源详情
   */
  async getAssetDetail(type: string, id: number): Promise<AssetDetails> {
    return this.get<AssetDetails>(`/asset/detail/${type}/${id}`)
  }

  // ========== 对局详情 API ==========

  /**
   * 获取单局详情
   */
  async getGameDetail(
    gameId: number,
    options: { source?: 'auto' | 'sgp' | 'lcu'; sgpOnly?: boolean; sgpServerId?: string } = {}
  ): Promise<GameDetail> {
    return this.get<GameDetail>(`/summoner/game-detail/${gameId}`, {
      source: options.source ?? 'auto',
      sgpOnly: options.sgpOnly === true,
      sgpServerId: options.sgpServerId
    })
  }

  // ========== 会话数据 API ==========

  /**
   * 获取完整会话数据（包含双方队伍所有玩家信息）
   */
  /**
   * 鑾峰彇鍗曞眬鏃堕棿绾?
   */
  async getGameTimeline(
    gameId: number,
    options: { source?: 'auto' | 'sgp' | 'lcu' | 'cache'; sgpOnly?: boolean; sgpServerId?: string } = {}
  ): Promise<MatchTimelineFetchResult> {
    return this.get<MatchTimelineFetchResult>(`/summoner/game-timeline/${gameId}`, {
      source: options.source ?? 'auto',
      sgpOnly: options.sgpOnly === true,
      sgpServerId: options.sgpServerId
    })
  }

  async getSessionData(mode?: number, options: { forceRefresh?: boolean } = {}): Promise<SessionData> {
    return this.get<SessionData>(
      '/session/data',
      mode != null ? { mode, forceRefresh: options.forceRefresh === true } : { forceRefresh: options.forceRefresh === true }
    )
  }
}

export const apiClient = new ApiClient()
