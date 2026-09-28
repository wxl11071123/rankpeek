import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('match-history API methods accept forceRefresh options and send explicit booleans', () => {
  const source = readFileSync(new URL('./httpClient.ts', import.meta.url), 'utf8')

  assert.match(
    source,
    /async getMatchHistory\(\s*puuid: string,\s*begIndex = 0,\s*endIndex = 9,\s*options: \{ forceRefresh\?: boolean \} = \{\}/
  )
  assert.match(source, /forceRefresh: options\.forceRefresh === true/)
  assert.match(source, /forceRefresh\?: boolean/)
  assert.match(source, /async getFilteredMatchHistory\(/)
})

test('cache diagnostics API methods use status and scoped clear endpoints', () => {
  const source = readFileSync(new URL('./httpClient.ts', import.meta.url), 'utf8')
  const types = readFileSync(new URL('../types/api.ts', import.meta.url), 'utf8')

  assert.match(types, /export interface CacheStatus \{[\s\S]*enabled: boolean/)
  assert.match(types, /health\?: 'OK' \| 'DISABLED' \| 'RECOVERED' \| 'CORRUPT' \| 'LOCKED' \| 'ERROR'/)
  assert.match(types, /lastError\?: string \| null/)
  assert.match(types, /lastRecoveryDirectory\?: string \| null/)
  assert.match(types, /databaseExists\?: boolean/)
  assert.match(types, /lockFileExists\?: boolean/)
  assert.match(types, /databaseSizeBytes: number/)
  assert.match(types, /summonerCount: number/)
  assert.match(types, /rankCount: number/)
  assert.match(types, /matchCount: number/)
  assert.match(types, /gameDetailCount: number/)
  assert.match(types, /participantCount: number/)
  assert.match(types, /trackedPlayerCount: number/)
  assert.match(types, /latestMatchCreation: number \| null/)
  assert.match(types, /orphanMatchCount\?: number/)
  assert.match(types, /quarantineCount\?: number/)
  assert.match(types, /export interface CacheClearResult \{[\s\S]*success: boolean/)
  assert.match(types, /export interface CacheClearFailure \{[\s\S]*name: string/)
  assert.match(types, /scope: CacheClearScope/)
  assert.match(types, /mode\?: CacheClearMode/)
  assert.match(types, /cleared: string\[]/)
  assert.match(types, /failed: CacheClearFailure\[]/)
  assert.match(types, /deletedRows: number/)
  assert.match(types, /databaseSizeBeforeBytes\?: number/)
  assert.match(types, /retentionDeletedRows\?: number/)
  assert.match(types, /export type CacheClearScope = 'all' \| 'memory' \| 'localDb'/)
  assert.match(types, /export type CacheClearMode = 'normal' \| 'deep'/)
  assert.match(types, /export interface CacheRepairResult \{[\s\S]*repaired: boolean/)
  assert.match(types, /quarantineDirectory\?: string \| null/)
  assert.match(types, /movedFiles: string\[]/)

  assert.match(source, /CacheClearResult/)
  assert.match(source, /CacheClearScope/)
  assert.match(source, /CacheRepairResult/)
  assert.match(source, /CacheStatus/)
  assert.match(source, /async getCacheStatus\(\): Promise<CacheStatus>/)
  assert.match(source, /return this\.get<CacheStatus>\('\/cache\/status'\)/)
  assert.match(
    source,
    /async clearCache\(scope: CacheClearScope, confirm = true, mode: CacheClearMode = 'normal'\): Promise<CacheClearResult>/
  )
  assert.match(source, /return this\.post<CacheClearResult>\('\/cache\/clear', undefined, \{ scope, confirm, mode \}\)/)
  assert.match(source, /async repairCache\(confirm = true\): Promise<CacheRepairResult>/)
  assert.match(source, /return this\.post<CacheRepairResult>\('\/cache\/repair', undefined, \{ confirm \}\)/)
})

test('user store status API method uses the dedicated user-store endpoint', () => {
  const source = readFileSync(new URL('./httpClient.ts', import.meta.url), 'utf8')
  const types = readFileSync(new URL('../types/api.ts', import.meta.url), 'utf8')

  assert.match(types, /export interface UserStoreStatus \{[\s\S]*enabled: boolean/)
  assert.match(types, /path: string/)
  assert.match(types, /sizeBytes: number/)
  assert.match(types, /updatedAt: number \| null/)
  assert.match(types, /tagConfigCount: number/)

  assert.match(source, /UserStoreStatus/)
  assert.match(source, /async getUserStoreStatus\(\): Promise<UserStoreStatus>/)
  assert.match(source, /return this\.get<UserStoreStatus>\('\/user-store\/status'\)/)
})

test('connection API exposes checkConnection as the only LCU connection probe', () => {
  const source = readFileSync(new URL('./httpClient.ts', import.meta.url), 'utf8')

  assert.match(source, /async checkConnection\(\): Promise<boolean>/)
  assert.match(source, /return await this\.get<boolean>\('\/session\/connected'\)/)
  assert.doesNotMatch(source, /async isConnected\(/)
})

test('session data API accepts forceRefresh and sends an explicit query flag', () => {
  const source = readFileSync(new URL('./httpClient.ts', import.meta.url), 'utf8')
  const types = readFileSync(new URL('../types/api.ts', import.meta.url), 'utf8')

  assert.match(types, /export interface SessionData \{[\s\S]*sessionKey\?: string/)
  assert.match(types, /gameId\?: number \| null/)
  assert.match(types, /empty\?: boolean/)
  assert.match(types, /stale\?: boolean/)
  assert.match(
    source,
    /async getSessionData\(mode\?: number, options: \{ forceRefresh\?: boolean \} = \{\}\): Promise<SessionData>/
  )
  assert.match(source, /forceRefresh: options\.forceRefresh === true/)
  assert.match(source, /mode != null \? \{ mode, forceRefresh: options\.forceRefresh === true \} : \{ forceRefresh: options\.forceRefresh === true \}/)
})

test('user tag summary can be calculated from prefetched match history', () => {
  const source = readFileSync(new URL('./httpClient.ts', import.meta.url), 'utf8')

  assert.match(
    source,
    /async getUserTagSummaryFromMatches\(\s*puuid: string,\s*matches: MatchHistory\[],\s*mode = 0,/
  )
  assert.match(
    source,
    /return this\.post<UserTagSummary>\('\/user-tag\/summary-from-matches', \{ puuid, mode, matches \}, undefined, options\)/
  )
})

test('coach summary detail and timeline calls can request SGP-only backend behavior', () => {
  const source = readFileSync(new URL('./httpClient.ts', import.meta.url), 'utf8')

  assert.match(source, /async getGameDetail\(\s*gameId: number,\s*options: \{ source\?: 'auto' \| 'sgp' \| 'lcu'; sgpOnly\?: boolean; sgpServerId\?: string \} = \{\}/)
  assert.match(source, /\/summoner\/game-detail\/\$\{gameId\}/)
  assert.match(source, /sgpOnly: options\.sgpOnly === true/)
  assert.match(source, /sgpServerId: options\.sgpServerId/)
  assert.match(source, /async getGameTimeline\(\s*gameId: number,\s*options: \{ source\?: 'auto' \| 'sgp' \| 'lcu' \| 'cache'; sgpOnly\?: boolean; sgpServerId\?: string \} = \{\}/)
  assert.match(source, /\/summoner\/game-timeline\/\$\{gameId\}/)
})
