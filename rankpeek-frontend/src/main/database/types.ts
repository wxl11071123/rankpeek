import type Database from 'better-sqlite3'

export type SqliteDatabase = Database.Database

export interface LocalDatabaseLogger {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

export interface CreateLocalDatabaseOptions {
  databasePath: string
  logger: LocalDatabaseLogger
}

export interface InitLocalDatabaseOptions {
  userDataPath: string
  logger: LocalDatabaseLogger
  runSmokeTest?: boolean
}

export interface SummonerAccountInput {
  region: string
  puuid: string
  gameName?: string | null
  tagLine?: string | null
  summonerName?: string | null
  displayName?: string | null
  profileIconId?: number | null
  summonerLevel?: number | null
  lastSelected?: boolean | number | null
}

export interface SummonerAccount {
  id: number
  region: string
  puuid: string
  gameName: string | null
  tagLine: string | null
  summonerName: string | null
  displayName: string | null
  profileIconId: number | null
  summonerLevel: number | null
  lastSelected: boolean
  createdAt: string
  updatedAt: string
}

export interface AccountRepository {
  upsertAccount(account: SummonerAccountInput): SummonerAccount
  getAccountByPuuid(region: string, puuid: string): SummonerAccount | null
  listAccounts(): SummonerAccount[]
  setLastSelectedAccount(region: string, puuid: string): SummonerAccount
  getLastSelectedAccount(): SummonerAccount | null
}

export interface MatchRecordInput {
  region: string
  matchId: string
  accountPuuid: string
  queueId?: number | null
  queueName?: string | null
  gameMode?: string | null
  gameVersion?: string | null
  gameCreation?: number | null
  gameDuration?: number | null
  championId?: number | null
  spell1Id?: number | null
  spell2Id?: number | null
  win?: boolean | number | null
  kills?: number | null
  deaths?: number | null
  assists?: number | null
  goldEarned?: number | null
  totalDamageDealtToChampions?: number | null
  doubleKills?: number | null
  tripleKills?: number | null
  quadraKills?: number | null
  pentaKills?: number | null
  largestKillingSpree?: number | null
  legendaryCount?: number | null
  perk0?: number | null
  playerAugment1?: number | null
  playerAugment2?: number | null
  playerAugment3?: number | null
  playerAugment4?: number | null
  lane?: string | null
  role?: string | null
  rawSummaryJson: unknown
  fetchedAt?: string | null
  updatedAt?: string | null
}

export interface MatchRecord {
  id: number
  region: string
  matchId: string
  accountPuuid: string
  queueId: number | null
  queueName: string | null
  gameMode: string | null
  gameVersion: string | null
  gameCreation: number | null
  gameDuration: number | null
  championId: number | null
  spell1Id?: number | null
  spell2Id?: number | null
  win: boolean | null
  kills: number | null
  deaths: number | null
  assists: number | null
  goldEarned?: number | null
  totalDamageDealtToChampions?: number | null
  doubleKills?: number | null
  tripleKills?: number | null
  quadraKills?: number | null
  pentaKills?: number | null
  largestKillingSpree?: number | null
  legendaryCount?: number | null
  perk0?: number | null
  playerAugment1?: number | null
  playerAugment2?: number | null
  playerAugment3?: number | null
  playerAugment4?: number | null
  lane: string | null
  role: string | null
  rawSummaryJson: string
  fetchedAt: string
  updatedAt: string
}

export interface MatchRecordListOptions {
  limit?: number
  offset?: number
  queueId?: number
  championId?: number
}

export interface MatchDetailInput {
  region: string
  matchId: string
  rawDetailJson: unknown
  normalizedDetailJson?: unknown
  source?: string | null
  schemaVersion?: number | null
  fetchedAt?: string | null
  updatedAt?: string | null
}

export interface MatchDetail {
  id: number
  region: string
  matchId: string
  rawDetailJson: string
  normalizedDetailJson: string | null
  source: string | null
  schemaVersion: number
  fetchedAt: string
  updatedAt: string
}

export interface MatchRepository {
  upsertMatchRecord(record: MatchRecordInput): MatchRecord
  upsertMatchRecords(records: MatchRecordInput[]): MatchRecord[]
  listMatchRecordsByAccount(accountPuuid: string, options?: MatchRecordListOptions): MatchRecord[]
  getMatchDetail(region: string, matchId: string): MatchDetail | null
  upsertMatchDetail(detail: MatchDetailInput): MatchDetail
}

export interface AiAnalysisResultInput {
  accountPuuid: string
  matchId?: string | null
  analysisType: string
  subjectKey?: string | null
  gameVersion?: string | null
  modelName?: string | null
  promptVersion?: string | null
  inputHash?: string | null
  outputJson: unknown
}

export interface AiAnalysisResult {
  id: number
  accountPuuid: string
  matchId: string | null
  analysisType: string
  subjectKey: string | null
  gameVersion: string | null
  modelName: string | null
  promptVersion: string | null
  inputHash: string | null
  outputJson: string
  createdAt: string
  updatedAt: string
}

export interface AiAnalysisListOptions {
  limit?: number
  offset?: number
  analysisType?: string
  analysisTypes?: string[]
  matchId?: string
  matchIds?: string[]
}

export interface AiAnalysisDeleteOptions {
  analysisTypes?: string[]
}

export interface AiAnalysisDeleteResult {
  deletedCount: number
}

export interface AiMemoryTypeCount {
  analysisType: string
  count: number
}

export interface AiMemoryStats {
  accountPuuid: string
  totalCount: number
  linkedMatchCount: number
  earliestCreatedAt: string | null
  latestCreatedAt: string | null
  analysisTypeCounts: AiMemoryTypeCount[]
}

export interface AiMemoryExportPayload {
  accountPuuid: string
  exportedAt: string
  stats: AiMemoryStats
  records: AiAnalysisResult[]
}

export interface AiMemoryExportResult {
  filePath: string | null
  exportedCount: number
  canceled?: boolean
}

export interface AiAnalysisRepository {
  saveAnalysisResult(result: AiAnalysisResultInput): AiAnalysisResult
  listAnalysisResultsByAccount(accountPuuid: string, options?: AiAnalysisListOptions): AiAnalysisResult[]
  getAnalysisResultById(id: number): AiAnalysisResult | null
  findAnalysisByInputHash(inputHash: string): AiAnalysisResult | null
  deleteAnalysisResultsByAccount(accountPuuid: string, options?: AiAnalysisDeleteOptions): AiAnalysisDeleteResult
  getMemoryStats(accountPuuid: string): AiMemoryStats
  exportMemory(accountPuuid: string): AiMemoryExportPayload
}

export interface AccountMatchCount {
  accountPuuid: string
  matchCount: number
}

export interface LocalStorageHealthStats {
  databasePath: string
  fileBytes: number
  pageCount: number
  pageSize: number
  freelistCount: number
  accountCount: number
  matchRecordCount: number
  matchDetailCount: number
  aiAnalysisCount: number
  orphanSingleMatchAiCount: number
  maxMatchesPerAccount: AccountMatchCount[]
  matchSummaryJsonAvgBytes: number | null
  matchSummaryJsonMaxBytes: number | null
  matchDetailJsonAvgBytes: number | null
  matchDetailJsonMaxBytes: number | null
  aiOutputJsonAvgBytes: number | null
  aiOutputJsonMaxBytes: number | null
}

export interface LocalStorageRetentionResult {
  matchRecordsDeleted: number
  matchDetailsDeleted: number
  aiAnalysisDeleted: number
  matchRecordsRetained: number
}

export interface LocalDatabase {
  databasePath: string
  connection: SqliteDatabase
  accounts: AccountRepository
  matches: MatchRepository
  aiAnalyses: AiAnalysisRepository
  runStorageRetention(): LocalStorageRetentionResult
  getStorageHealthStats(): LocalStorageHealthStats
  close(): void
}

export type DatabaseIpcResult<T> = {
  success: true
  data: T
} | {
  success: false
  error: string
}
