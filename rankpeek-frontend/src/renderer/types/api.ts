// ========== 统一响应格式 ==========

/**
 * 统一 API 响应格式
 */
export interface ApiResponse<T> {
  /** 响应码，200 表示成功 */
  code: number
  /** 响应消息 */
  message: string
  /** 响应数据 */
  data: T
  /** 时间戳 */
  timestamp: number
}

// ========== 数据类型定义 ==========

// 召唤师信息
export interface Summoner {
  gameName: string
  tagLine: string
  summonerLevel: number
  profileIconId: number
  puuid: string
  summonerId: number
}

// 胜率统计
export interface WinRate {
  wins: number
  losses: number
  winRate: number
}

// 英雄选项
export interface ChampionOption {
  value: number
  label: string
  realName: string
  nickname: string
}

// 游戏模式选项
export interface GameModeOption {
  id: number
  name: string
}

// 段位信息
export interface Rank {
  queueMap: QueueMap
}

export interface QueueMap {
  RANKED_SOLO_5x5: QueueInfo
  RANKED_FLEX_SR: QueueInfo
}

export interface QueueInfo {
  queueType: string
  tier: string
  displayRank?: string
  totalGames?: number | null
  games?: number | null
  tierCn?: string
  division: string
  leaguePoints: number
  wins: number
  losses?: number | null
  highestTier: string
  highestDivision: string
  isProvisional: boolean
}

// 对局记录
export interface MatchHistory {
  gameId: number
  gameMode: string
  gameType: string
  queueId: number
  queueName?: string // 中文游戏模式名称
  gameDuration: number
  gameCreation: number
  platformId: string
  remake?: boolean
  participants: Participant[]
  participantIdentities: ParticipantIdentity[]
  teamObjectives?: TeamObjectiveSummary[]
  teamBans?: TeamBanSummary[]
}

export interface MatchHistoryPageResponse {
  matches: MatchHistory[]
  page: number
  pageSize: number
  hasNext: boolean
  source: string
  recordStatus: RecordStatus
  sgpServerId?: string
  warnings?: string[]
}

export interface Participant {
  participantId: number
  teamId: number
  championId: number
  spell1Id: number
  spell2Id: number
  teamPosition?: string
  individualPosition?: string
  selectedPosition?: string
  lane?: string
  role?: string
  stats: Stats
}

export interface Stats {
  win: boolean
  kills: number
  deaths: number
  assists: number
  goldEarned: number
  totalMinionsKilled: number
  neutralMinionsKilled: number
  totalDamageDealtToChampions: number
  totalDamageTaken: number
  totalHeal: number
  visionScore?: number
  // 装备
  item0: number
  item1: number
  item2: number
  item3: number
  item4: number
  item5: number
  item6: number
  // 伤害占比
  damageDealtToChampionsRate?: number
  damageTakenRate?: number
  healRate?: number
  // MVP/SVP
  mvp?: string
  doubleKills?: number
  tripleKills?: number
  quadraKills?: number
  pentaKills?: number
  largestKillingSpree?: number
  legendaryCount?: number
  // 符文
  perk0?: number
  perk1?: number
  perk2?: number
  perk3?: number
  perk4?: number
  perk5?: number
  perkPrimaryStyle?: number
  perkSubStyle?: number
  perks?: Record<string, unknown>
  // 补兵（别名）
  minionsKilled?: number
  // 对塔伤害
  damageDealtToTurrets?: number
  turretKills?: number
  inhibitorKills?: number
  turretPlatesTaken?: number
  turretTakedowns?: number
  inhibitorTakedowns?: number
  // 海克斯强化
  playerAugment1?: number
  playerAugment2?: number
  playerAugment3?: number
  playerAugment4?: number
  playerAugment5?: number
  playerAugment6?: number
  challenges?: Record<string, unknown>
  extraFields?: Record<string, unknown>
}

export interface ParticipantIdentity {
  participantId: number
  player: Player
}

export interface Player {
  accountId: number
  summonerId: number
  summonerName: string
  gameName: string
  tagLine: string
  puuid: string
  platformId: string
}

// 游戏状态
export interface GameState {
  connected: boolean
  phase: string
  summoner: Summoner | null
  timestamp: number
}

export interface CacheUpdateEvent {
  type: 'PLAYER_CACHE_UPDATED'
  puuid: string
  reason?: string
  updatedScopes?: string[]
  timestamp?: number
}

export interface CacheStatus {
  enabled: boolean
  health?: 'OK' | 'DISABLED' | 'RECOVERED' | 'CORRUPT' | 'LOCKED' | 'ERROR'
  databasePath: string
  databaseSizeBytes: number
  lastError?: string | null
  lastRecoveryDirectory?: string | null
  databaseExists?: boolean
  lockFileExists?: boolean
  summonerCount: number
  rankCount: number
  matchCount: number
  gameDetailCount: number
  participantCount: number
  playerMatchIndexCount: number
  trackedPlayerCount: number
  latestMatchCreation: number | null
  orphanMatchCount?: number
  orphanGameDetailCount?: number
  orphanParticipantCount?: number
  orphanDataScopeCount?: number
  quarantineCount?: number
  traceFileCount?: number
  corruptFileCount?: number
}

export interface UserStoreStatus {
  enabled: boolean
  path: string
  sizeBytes: number
  updatedAt: number | null
  tagConfigCount: number
}

export type CacheClearScope = 'all' | 'memory' | 'localDb'
export type CacheClearMode = 'normal' | 'deep'

export interface CacheClearFailure {
  name: string
  message: string
}

export interface CacheClearResult {
  success: boolean
  scope: CacheClearScope
  mode?: CacheClearMode
  message: string
  cleared: string[]
  failed: CacheClearFailure[]
  deletedRows: number
  databaseSizeBeforeBytes?: number
  databaseSizeAfterBytes?: number
  compacted?: boolean
  retentionDeletedRows?: number
  timestamp: number
}

export interface CacheRepairResult {
  success: boolean
  repaired: boolean
  health: CacheStatus['health']
  message: string
  quarantineDirectory?: string | null
  movedFiles: string[]
  lastError?: string | null
  timestamp: number
}

// 大厅信息
export interface Lobby {
  lobbyId: string
  queueId: number
  gameConfig: GameConfig
  members: LobbyMember[]
}

export interface GameConfig {
  queueId: number
  gameMode: string
  isCustom: boolean
}

export interface LobbyMember {
  puuid: string
  summonerName: string
  summonerId: number
  isLeader: boolean
  ready: boolean
  teamId: number
}

// 配置
export interface AppConfig {
  settings: {
    match: {
      defaultQueueMode: number
    }
  }
}

// 用户标签
export type RecordStatus = 'NORMAL' | 'PRIVATE' | 'EMPTY' | 'ERROR'

export interface UserTag {
  recordStatus: RecordStatus
  recentData: RecentData
  championRecentData?: RecentData | null
  tag: RankTag[]
}

export interface UserTagSummary {
  recordStatus: RecordStatus
  recentData: RecentData
  tag: RankTag[]
}

export interface RecentData {
  kda: number
  kills: number
  deaths: number
  assists: number
  selectMode: number
  selectModeCn: string
  selectWins: number
  selectLosses: number
  groupRate: number
  averageGold: number
  goldRate: number
  averageDamageDealtToChampions: number
  damageDealtToChampionsRate: number
  friendAndDispute: FriendAndDispute
  oneGamePlayersMap?: Record<string, OneGamePlayer[]>
}

export interface RankTag {
  good?: boolean | null
  tagName: string
  tagDesc?: string
}

export interface FriendAndDispute {
  friendsRate: number
  disputeRate: number
  friendsSummoner: OneGamePlayerSummoner[]
  disputeSummoner: OneGamePlayerSummoner[]
}

export interface OneGamePlayer {
  index: number
  gameId: number
  puuid: string
  gameCreatedAt: string
  isMyTeam: boolean
  gameName: string
  tagLine?: string
  championId: number
  kills: number
  deaths: number
  assists: number
  win: boolean
  queueIdCn: string
}

export interface OneGamePlayerSummoner {
  winRate: number
  wins: number
  losses: number
  summoner: Summoner
  oneGamePlayer: OneGamePlayer[]
}

// ARAM 平衡数据
export interface AramBalanceData {
  championId: number
  championName?: string
  dmg_dealt?: number
  dmg_taken?: number
  healing?: number
  shielding?: number
  ability_haste?: number
  mana_regen?: number
  energy_regen?: number
  attack_speed?: number
  movement_speed?: number
  tenacity?: number
}

// 游戏资源详情
export interface AssetDetails {
  id: number
  name: string
  description?: string
  type: string
  iconUrl?: string
  extra?: unknown
}

// ========== 对局详情 ==========

export type DragonType = 'infernal' | 'mountain' | 'ocean' | 'cloud' | 'hextech' | 'chemtech' | 'unknown'
export type ObjectiveEventKind =
  | 'turret'
  | 'turretPlate'
  | 'inhibitor'
  | 'baron'
  | 'dragon'
  | 'elderDragon'
  | 'herald'
  | 'voidGrub'

export interface TeamBanSummary {
  teamId: number
  bans: number[]
}

export interface TeamObjectiveEvent {
  kind: ObjectiveEventKind
  subType?: DragonType | string | null
  teamId?: number | null
  participantId?: number | null
  championId?: number | null
  timestamp?: number | null
}

export interface TeamObjectiveSummary {
  teamId: number
  bans?: number[]
  turretKills?: number
  turretPlateKills?: number
  turretPlatesTaken?: number
  inhibitorKills?: number
  baronKills?: number
  dragonKills?: number
  elderDragonKills?: number
  dragonKillsByType?: Partial<Record<DragonType, number>>
  heraldKills?: number
  voidGrubKills?: number
  dragonSoulType?: DragonType | null
  objectiveEvents?: TeamObjectiveEvent[]
}

// ========== 瀵瑰眬鏃堕棿绾? ==========

export type MatchTimelineFetchStatus = 'FETCHED' | 'EMPTY' | 'UNAVAILABLE' | 'FAILED' | string

export interface MatchTimeline {
  gameId?: number | null
  events?: TimelineEvent[]
  frames?: TimelineFrame[]
}

export interface TimelineFrame {
  timestamp?: number | null
  participantFrames?: Record<string, ParticipantFrame>
  events?: TimelineEvent[]
  rawFrameJson?: string
}

export interface ParticipantFrame {
  participantId?: number | null
  currentGold?: number | null
  totalGold?: number | null
  level?: number | null
  xp?: number | null
  minionsKilled?: number | null
  jungleMinionsKilled?: number | null
  position?: TimelinePosition | null
  rawParticipantFrameJson?: string
}

export interface TimelineEvent {
  eventType?: string | null
  timestamp?: number | null
  participantId?: number | null
  killerId?: number | null
  victimId?: number | null
  assistingParticipantIds?: number[]
  position?: TimelinePosition | null
  itemId?: number | null
  buildingType?: string | null
  towerType?: string | null
  monsterType?: string | null
  teamId?: number | null
  rawEventJson?: string
}

export interface TimelinePosition {
  x?: number | null
  y?: number | null
}

export interface MatchTimelineFetchResult {
  gameId?: number | null
  timeline?: MatchTimeline | null
  rawDetailJson?: string | null
  rawTimelineJson?: string | null
  status?: MatchTimelineFetchStatus | null
  lastError?: string | null
}

// 对局详情
export interface GameDetail {
  gameId: number
  gameMode: string
  gameType: string
  mapId: number
  queueId: number
  gameDuration: number
  gameCreation: number
  participantIdentities: GameParticipantIdentity[]
  participants: GameParticipant[]
  teamObjectives?: TeamObjectiveSummary[]
  teamBans?: TeamBanSummary[]
}

export interface GameParticipantIdentity {
  participantId: number
  player: GamePlayer
}

export interface GamePlayer {
  accountId: number
  puuid: string
  platformId: string
  summonerName: string
  gameName: string
  tagLine: string
  summonerId: number
}

export interface GameParticipant {
  participantId: number
  teamId: number
  championId: number
  spell1Id: number
  spell2Id: number
  teamPosition?: string
  individualPosition?: string
  selectedPosition?: string
  stats: GameStats
  timeline: GameTimeline
}

export interface GameStats {
  win: boolean
  kills: number
  deaths: number
  assists: number
  totalMinionsKilled: number
  neutralMinionsKilled: number
  goldEarned: number
  goldSpent?: number
  totalDamageDealtToChampions: number
  magicDamageDealtToChampions?: number
  physicalDamageDealtToChampions?: number
  trueDamageDealtToChampions?: number
  totalDamageTaken: number
  totalHeal: number
  visionScore?: number
  detectorWardsPlaced?: number
  visionWardsBoughtInGame: number
  wardsPlaced: number
  wardsKilled: number
  largestMultiKill: number
  perks?: Record<string, unknown>
  challenges?: Record<string, unknown>
  extraFields?: Record<string, unknown>
  doubleKills: number
  tripleKills: number
  quadraKills: number
  pentaKills: number
  largestKillingSpree?: number
  legendaryCount?: number
  // 符文
  perk0?: number
  perk1?: number
  perk2?: number
  perk3?: number
  perk4?: number
  perk5?: number
  perkPrimaryStyle?: number
  perkSubStyle?: number
  // 海克斯强化 (竞技场模式)
  playerAugment1?: number
  playerAugment2?: number
  playerAugment3?: number
  playerAugment4?: number
  // 补兵（别名）
  minionsKilled?: number
  // 对塔伤害
  damageDealtToTurrets?: number
  turretKills?: number
  inhibitorKills?: number
  turretPlatesTaken?: number
  turretTakedowns?: number
  inhibitorTakedowns?: number
  // MVP/SVP
  mvp?: string
  // 伤害占比
  damageDealtToChampionsRate?: number
  damageTakenRate?: number
  healRate?: number
  item0?: number
  item1?: number
  item2?: number
  item3?: number
  item4?: number
  item5?: number
  item6?: number
}

export interface GameTimeline {
  lane: string
  role: string
  teamPosition?: string
  positionCn?: string
  rawLane?: string
  rawRole?: string
}

// ========== 会话数据 ==========

// 预组队标记
export interface PreGroupMarker {
  name: string
  type: string
}

// 会话中的召唤师
export interface SessionSummoner {
  championId: number
  championKey: string
  selectedPosition?: string
  assignedPosition?: string
  teamPosition?: string
  individualPosition?: string
  position?: string
  summoner: Summoner
  matchHistory: MatchHistory[]
  userTag?: UserTag | null
  rank: Rank
  meetGames: OneGamePlayer[]
  preGroupMarkers: PreGroupMarker
  isLoading: boolean
}

// 会话数据
export interface SessionData {
  phase: string
  sessionKey?: string
  gameId?: number | null
  empty?: boolean
  stale?: boolean
  queueType: string
  typeCn: string
  queueId: number
  teamOne: SessionSummoner[]
  teamTwo: SessionSummoner[]
  source?: string
  createdAt?: number
  updatedAt?: number
  simulatorPhase?: string
  roundIndex?: number
  matchId?: string
  step?: number
  currentSummoner?: Summoner
  lobby?: Lobby | null
  teammates?: SessionSummoner[]
  opponents?: SessionSummoner[]
  championSelect?: Record<string, unknown> | null
  loadingScreen?: Record<string, unknown> | null
  endOfGame?: Record<string, unknown> | null
  matchSummary?: Record<string, unknown> | null
}

/** 海斗（海克斯大乱斗）数据 —— 来源 101.qq.com 的国服公开统计快照。 */
export interface HextechAugmentBoardRow {
  augmentId: number
  name: string | null
  rarity: string | null
  description: string | null
  iconPath: string | null
  winRate: number
  winRank: number
  winRankChange: number
  pickRate: number
  pickRank: number
  pickRankChange: number
  bestChampionIds: number[]
}

/** 英雄榜里的顶级强化（arammgg 矩阵按 rank 取前 3）。 */
export interface HextechChampionTopAugment {
  augmentId: number
  name: string | null
  rarity: string | null
  iconPath: string | null
  rank: string | null
  pickRate: string | null
  winRate: string | null
}

export interface HextechChampionRank {
  championId: number
  winRank: number
  rankChangeText: string
  winRate: number
  pickRate: number
  topAugments: HextechChampionTopAugment[]
}

export interface HextechStatus {
  dataDate: string | null
  source: string | null
  fetchedAt: string | null
  augmentCount: number
  championCount: number
  lastError: string | null
  lastAttemptAt: string | null
}


export interface HextechChampionAugmentRow {
  augmentId: number
  name: string | null
  rarity: string | null
  iconPath: string | null
  tier: string | null
  rank: string | null
  total: string | null
  pickRate: string | null
  winRate: string | null
  numGames: string | null
  winRateRegion: string | null
  /** 自建层：国服该英雄该强化的胜率（玩家贡献；没有样本时为 null）。 */
  selfWinRate: string | null
  /** 自建层：样本局数。 */
  selfGames: string | null
}

/** OCR 匹配候选：强化定义（id + 名称 + 稀有度）。 */
export interface HextechAugmentDefinition {
  augmentId: number
  name: string | null
  rarity: string | null
}

/** 局内悬浮窗数据：当前阶段 + 自动识别的英雄 + 该英雄的强化明细。 */
export interface HextechOverlayData {
  phase: string | null
  championId: number | null
  championSource: 'champ-select' | 'in-game' | 'manual' | null
  detail: HextechChampionDetail | null
}

/** 海斗匿名数据贡献状态。 */
export interface HextechContributionStatus {
  enabled: boolean
  uploadConfigured: boolean
  ingestHost: string | null
  pendingGames: number
  uploadedGames: number
  /** 本期（当前游戏版本）里玩家贡献的局数。老记录没有 patch，不计入。 */
  contributedThisPatch: number
  lastUploadAt: string | null
  lastUploadMessage: string | null
  installIdHint: string | null
}

/** 上传前展示的字段说明（不含真实数据）。 */
export interface HextechContributionPreview {
  schemaVersion: number
  fields: string[]
  neverUploaded: string[]
  sampleJson: string
}

/** 自建层（玩家贡献）数据状态。 */
export interface HextechSelfDataSummary {
  available: boolean
  dataVersion: string | null
  generatedAt: string | null
  patch: string | null
  totalGames: number
  totalPlayers: number
  championCount: number
  fetchedAt: string | null
}

/**
 * 数据包下载状态（前端「数据状态」块：圆环 + 数据版本 + 更新时间 + 检查更新）。
 *
 * state: idle=空闲/已最新，checking=正在比对版本，downloading=正在下载，error=上次失败。
 */
export interface HextechDataPackageStatus {
  available: boolean
  state: 'idle' | 'checking' | 'downloading' | 'error'
  dataVersion: string | null
  remoteVersion: string | null
  updatedAt: string | null
  checkedAt: string | null
  nextCheckAt: string | null
  bytes: number
  definitions: number
  globalStats: number
  matrices: number
  minIntervalHours: number
  message: string | null
  error: string | null
}

export interface HextechChampionDetail {
  championId: number
  winRank: number | null
  rankChangeText: string | null
  winRate: number | null
  pickRate: number | null
  matrixSource: string | null
  matrixRegion: string | null
  augments: HextechChampionAugmentRow[]
}
