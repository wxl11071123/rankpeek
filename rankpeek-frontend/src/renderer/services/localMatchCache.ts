import type { GameDetail, MatchHistory, Participant, ParticipantIdentity, Summoner } from '../types/api'
import {
  hasCompleteMatchRecordStats,
  hasCompleteMatchRecordSummary,
  isRenderableMatchForPuuid
} from '../../shared/matchQuality.ts'
import type {
  LocalDatabaseAPI,
  MatchDetail,
  MatchDetailInput,
  MatchRecord,
  MatchRecordInput,
  MatchRecordListOptions
} from '../types/localDatabase'

type MatchCacheDatabase = Pick<
  LocalDatabaseAPI,
  'getMatchDetail' | 'listMatchRecordsByAccount' | 'upsertAccount' | 'upsertMatchDetail' | 'upsertMatchRecords'
>

type SummonerWithPlatform = Summoner & {
  platformId?: string | null
}

export interface MatchRecordInputOptions {
  accountPuuid: string
  fallbackRegion?: string | null
}

export interface ReadMatchHistoryCacheOptions {
  accountPuuid: string
  options?: MatchRecordListOptions
  database?: Pick<LocalDatabaseAPI, 'listMatchRecordsByAccount'> | null
}

export interface WriteMatchHistoryCacheOptions {
  summoner: SummonerWithPlatform
  matches: MatchHistory[]
  database?: Pick<LocalDatabaseAPI, 'upsertAccount' | 'upsertMatchRecords'> | null
}

export interface MatchDetailCacheKeyOptions {
  fallbackRegion?: string | null
}

export interface MatchDetailCacheKey {
  region: string
  matchId: string
}

export interface ReadMatchDetailCacheOptions extends MatchDetailCacheKey {
  database?: Pick<LocalDatabaseAPI, 'getMatchDetail'> | null
}

export interface WriteMatchDetailCacheOptions extends MatchDetailCacheKeyOptions {
  match: MatchHistory
  gameDetail: GameDetail
  database?: Pick<LocalDatabaseAPI, 'upsertMatchDetail'> | null
}

export async function readMatchHistoryFromLocalCache({
  accountPuuid,
  options,
  database = getRendererDatabase()
}: ReadMatchHistoryCacheOptions): Promise<MatchHistory[]> {
  if (!database) {
    return []
  }

  try {
    const result = await database.listMatchRecordsByAccount(accountPuuid, options)
    if (!result.success) {
      console.warn('Failed to read local match cache:', result.error)
      return []
    }

    return result.data
      .map(matchRecordToMatchHistory)
      .filter((match): match is MatchHistory => Boolean(match))
  } catch (error) {
    console.warn('Failed to read local match cache:', error)
    return []
  }
}

export async function writeMatchHistoryToLocalCache({
  summoner,
  matches,
  database = getRendererDatabase()
}: WriteMatchHistoryCacheOptions): Promise<boolean> {
  if (!database || !summoner.puuid) {
    return false
  }

  const region = resolveMatchHistoryRegion(summoner, matches)

  try {
    const accountResult = await database.upsertAccount({
      region,
      puuid: summoner.puuid,
      gameName: safeString(summoner.gameName),
      tagLine: safeString(summoner.tagLine),
      summonerName: safeString(summoner.gameName),
      displayName: formatDisplayName(summoner),
      profileIconId: safeNumber(summoner.profileIconId),
      summonerLevel: safeNumber(summoner.summonerLevel)
    })

    if (!accountResult.success) {
      console.warn('Failed to write local summoner account cache:', accountResult.error)
    }

    const renderableMatches = matches.filter(match => isRenderableMatchForPuuid(match, summoner.puuid))
    if (!renderableMatches.length) {
      return accountResult.success
    }

    const records = renderableMatches.map(match => toMatchRecordInput(match, {
      accountPuuid: summoner.puuid,
      fallbackRegion: region
    }))
    const recordsResult = await database.upsertMatchRecords(records)
    if (!recordsResult.success) {
      console.warn('Failed to write local match cache:', recordsResult.error)
      return false
    }

    return accountResult.success
  } catch (error) {
    console.warn('Failed to write local match cache:', error)
    return false
  }
}

export async function loadMatchDetailFromLocalCache({
  region,
  matchId,
  database = getRendererDatabase()
}: ReadMatchDetailCacheOptions): Promise<GameDetail | null> {
  if (!database) {
    return null
  }

  try {
    const result = await database.getMatchDetail(region, matchId)
    if (!result.success) {
      console.warn('Failed to read local match detail cache:', result.error)
      return null
    }

    if (!result.data) {
      return null
    }

    return matchDetailRecordToGameDetail(result.data)
  } catch (error) {
    console.warn('Failed to read local match detail cache:', error)
    return null
  }
}

export async function persistMatchDetailToLocalCache({
  match,
  gameDetail,
  fallbackRegion,
  database = getRendererDatabase()
}: WriteMatchDetailCacheOptions): Promise<boolean> {
  if (!database) {
    return false
  }

  try {
    const result = await database.upsertMatchDetail(toMatchDetailInput(match, gameDetail, {
      fallbackRegion
    }))
    if (!result.success) {
      console.warn('Failed to write local match detail cache:', result.error)
      return false
    }

    return true
  } catch (error) {
    console.warn('Failed to write local match detail cache:', error)
    return false
  }
}

export function toMatchRecordInput(match: MatchHistory, options: MatchRecordInputOptions): MatchRecordInput {
  const participant = getParticipantByPuuid(match, options.accountPuuid)
  const stats = participant?.stats

  return {
    region: nonEmptyString(match.platformId) ?? nonEmptyString(options.fallbackRegion) ?? 'UNKNOWN',
    matchId: String(match.gameId),
    accountPuuid: options.accountPuuid,
    queueId: safeNumber(match.queueId),
    queueName: safeString(match.queueName),
    gameMode: safeString(match.gameMode),
    gameVersion: null,
    gameCreation: safeNumber(match.gameCreation),
    gameDuration: safeNumber(match.gameDuration),
    championId: safeNumber(participant?.championId),
    spell1Id: safeNumber(participant?.spell1Id),
    spell2Id: safeNumber(participant?.spell2Id),
    win: typeof stats?.win === 'boolean' ? stats.win : null,
    kills: safeNumber(stats?.kills),
    deaths: safeNumber(stats?.deaths),
    assists: safeNumber(stats?.assists),
    goldEarned: safeNumber(stats?.goldEarned),
    totalDamageDealtToChampions: safeNumber(stats?.totalDamageDealtToChampions),
    doubleKills: safeNumber(stats?.doubleKills),
    tripleKills: safeNumber(stats?.tripleKills),
    quadraKills: safeNumber(stats?.quadraKills),
    pentaKills: safeNumber(stats?.pentaKills),
    largestKillingSpree: safeNumber(stats?.largestKillingSpree),
    legendaryCount: safeNumber(stats?.legendaryCount),
    perk0: safeNumber(stats?.perk0),
    playerAugment1: safeNumber(stats?.playerAugment1),
    playerAugment2: safeNumber(stats?.playerAugment2),
    playerAugment3: safeNumber(stats?.playerAugment3),
    playerAugment4: safeNumber(stats?.playerAugment4),
    lane: safeString(participant?.teamPosition) ?? safeString(participant?.lane) ?? safeString(participant?.individualPosition),
    role: safeString(participant?.role),
    rawSummaryJson: match
  }
}

export function toMatchDetailInput(
  match: MatchHistory,
  gameDetail: GameDetail,
  options: MatchDetailCacheKeyOptions = {}
): MatchDetailInput {
  const { region, matchId } = toMatchDetailCacheKey(match, options)

  return {
    region,
    matchId,
    rawDetailJson: gameDetail,
    normalizedDetailJson: null,
    source: 'rankpeek-backend',
    schemaVersion: 1
  }
}

export function matchRecordToMatchHistory(record: MatchRecord): MatchHistory | null {
  try {
    const parsed = JSON.parse(record.rawSummaryJson) as unknown
    if (!isRecord(parsed)) {
      return null
    }

    const restored = restoreCachedMatchHistory(parsed as unknown as MatchHistory, record)
    return isRenderableMatchForPuuid(restored, record.accountPuuid) ? restored : null
  } catch (error) {
    console.warn(`Skipping malformed local match cache record ${record.matchId}:`, error)
    return null
  }
}

export function matchDetailRecordToGameDetail(record: MatchDetail): GameDetail | null {
  try {
    const parsed = JSON.parse(record.rawDetailJson) as unknown
    if (!isRecord(parsed)) {
      return null
    }

    return parsed as unknown as GameDetail
  } catch (error) {
    console.warn(`Skipping malformed local match detail cache record ${record.matchId}:`, error)
    return null
  }
}

export function resolveMatchHistoryRegion(summoner: SummonerWithPlatform, matches: MatchHistory[]): string {
  const matchRegion = matches
    .map(match => nonEmptyString(match.platformId))
    .find((region): region is string => Boolean(region))

  return matchRegion ?? nonEmptyString(summoner.platformId) ?? 'UNKNOWN'
}

export function toMatchDetailCacheKey(
  match: Pick<MatchHistory, 'gameId' | 'platformId'>,
  options: MatchDetailCacheKeyOptions = {}
): MatchDetailCacheKey {
  return {
    region: nonEmptyString(match.platformId) ?? nonEmptyString(options.fallbackRegion) ?? 'UNKNOWN',
    matchId: String(match.gameId)
  }
}

function getRendererDatabase(): MatchCacheDatabase | null {
  if (typeof window === 'undefined') {
    return null
  }

  return window.electronAPI?.database ?? null
}

function getParticipantByPuuid(match: MatchHistory, puuid: string): Participant | null {
  const identity = (match.participantIdentities || []).find(item => item.player?.puuid === puuid)
  if (!identity) {
    return null
  }

  return (match.participants || []).find(
    participant => participant.participantId === identity.participantId
  ) || null
}

function restoreCachedMatchHistory(match: MatchHistory, record: MatchRecord): MatchHistory {
  restoreCachedMatchMetadata(match, record)

  match.participants = Array.isArray(match.participants) ? match.participants : []
  match.participantIdentities = Array.isArray(match.participantIdentities)
    ? match.participantIdentities
    : []

  const accountPuuid = nonEmptyString(record.accountPuuid)
  if (!accountPuuid) {
    return match
  }

  let participant = getParticipantByPuuid(match, accountPuuid)
  if (!participant) {
    const cachedStats = hasCompleteMatchRecordSummary(record) ? matchRecordStatsToMatchStats(record) : null
    participant = findCachedCurrentParticipant(match, record, accountPuuid)
      ?? (cachedStats ? appendCachedCurrentParticipant(match, record, cachedStats) : null)
  }
  if (!participant) {
    return match
  }

  const cachedChampionId = safeNumber(record.championId)
  if (cachedChampionId !== null && cachedChampionId > 0) {
    participant.championId = cachedChampionId
  }
  const cachedSpell1Id = safeNumber(record.spell1Id)
  if (cachedSpell1Id !== null && cachedSpell1Id > 0) {
    participant.spell1Id = cachedSpell1Id
  }
  const cachedSpell2Id = safeNumber(record.spell2Id)
  if (cachedSpell2Id !== null && cachedSpell2Id > 0) {
    participant.spell2Id = cachedSpell2Id
  }
  const mergedStats = mergeCachedCurrentStats(participant.stats, record)
  if (mergedStats) {
    participant.stats = mergedStats
  }
  participant.lane = participant.lane ?? record.lane ?? undefined
  participant.role = participant.role ?? record.role ?? undefined
  participant.teamPosition = participant.teamPosition ?? record.lane ?? undefined

  const identity = match.participantIdentities.find(item => item.participantId === participant.participantId)
  const player = createCachedCurrentPlayer(record, match.platformId, identity?.player)
  if (identity && !hasDifferentPlayerPuuid(identity, accountPuuid)) {
    identity.player = player
  } else {
    match.participantIdentities.push({
      participantId: participant.participantId,
      player
    })
  }

  return match
}

function restoreCachedMatchMetadata(match: MatchHistory, record: MatchRecord): void {
  match.gameId = safeNumber(match.gameId) ?? safeNumberFromString(record.matchId) ?? 0
  match.gameMode = nonEmptyString(match.gameMode) ?? record.gameMode ?? ''
  match.gameType = safeString(match.gameType) ?? ''
  match.queueId = safeNumber(match.queueId) ?? record.queueId ?? 0
  match.queueName = nonEmptyString(match.queueName) ?? record.queueName ?? undefined
  match.gameDuration = safeNumber(match.gameDuration) ?? record.gameDuration ?? 0
  match.gameCreation = safeNumber(match.gameCreation) ?? record.gameCreation ?? 0
  match.platformId = nonEmptyString(match.platformId) ?? nonEmptyString(record.region) ?? 'UNKNOWN'
}

function findCachedCurrentParticipant(
  match: MatchHistory,
  record: MatchRecord,
  accountPuuid: string
): Participant | null {
  const championId = safeNumber(record.championId)
  if (championId === null) {
    return null
  }

  return match.participants.find(participant => {
    if (participant.championId !== championId) {
      return false
    }

    const identity = match.participantIdentities.find(item => item.participantId === participant.participantId)
    return !identity || !hasDifferentPlayerPuuid(identity, accountPuuid)
  }) ?? null
}

function appendCachedCurrentParticipant(
  match: MatchHistory,
  record: MatchRecord,
  stats: Participant['stats']
): Participant {
  const participant = {
    participantId: nextParticipantId(match.participants),
    teamId: 100,
    championId: safeNumber(record.championId) ?? 0,
    spell1Id: safeNumber(record.spell1Id) ?? 0,
    spell2Id: safeNumber(record.spell2Id) ?? 0,
    lane: record.lane ?? undefined,
    role: record.role ?? undefined,
    teamPosition: record.lane ?? undefined,
    stats
  } satisfies Participant

  match.participants.push(participant)
  return participant
}

function nextParticipantId(participants: Participant[]): number {
  return participants.reduce((max, participant) => {
    const participantId = safeNumber(participant.participantId)
    return participantId === null ? max : Math.max(max, participantId)
  }, 0) + 1
}

function hasDifferentPlayerPuuid(identity: ParticipantIdentity, accountPuuid: string): boolean {
  const identityPuuid = nonEmptyString(identity.player?.puuid)
  return Boolean(identityPuuid && identityPuuid !== accountPuuid)
}

function createCachedCurrentPlayer(
  record: MatchRecord,
  platformId: string,
  player?: ParticipantIdentity['player']
): ParticipantIdentity['player'] {
  return {
    accountId: safeNumber(player?.accountId) ?? 0,
    summonerId: safeNumber(player?.summonerId) ?? 0,
    summonerName: safeString(player?.summonerName) ?? '',
    gameName: safeString(player?.gameName) ?? '',
    tagLine: safeString(player?.tagLine) ?? '',
    puuid: record.accountPuuid,
    platformId: nonEmptyString(player?.platformId) ?? nonEmptyString(platformId) ?? nonEmptyString(record.region) ?? 'UNKNOWN'
  }
}

function mergeCachedCurrentStats(
  stats: Participant['stats'] | undefined,
  record: MatchRecord
): Participant['stats'] | undefined {
  const cachedStats = matchRecordStatsOverride(record)
  if (!cachedStats) {
    return isRecord(stats) ? stats : undefined
  }

  return {
    ...defaultStats(),
    ...(stats || {}),
    ...cachedStats
  }
}

function matchRecordStatsToMatchStats(record: MatchRecord): Participant['stats'] | null {
  const cachedStats = matchRecordStatsOverride(record)
  return cachedStats ? { ...defaultStats(), ...cachedStats } : null
}

function matchRecordStatsOverride(record: MatchRecord): Partial<Participant['stats']> | null {
  if (!hasCompleteMatchRecordStats(record)) {
    return null
  }

  const win = safeBoolean(record.win)
  const kills = safeNumber(record.kills)
  const deaths = safeNumber(record.deaths)
  const assists = safeNumber(record.assists)
  if (win === null || kills === null || deaths === null || assists === null) {
    return null
  }

  return {
    win,
    kills,
    deaths,
    assists,
    ...optionalNumberStats(record, [
      'goldEarned',
      'totalDamageDealtToChampions',
      'doubleKills',
      'tripleKills',
      'quadraKills',
      'pentaKills',
      'largestKillingSpree',
      'legendaryCount',
      'perk0',
      'playerAugment1',
      'playerAugment2',
      'playerAugment3',
      'playerAugment4'
    ])
  }
}

function optionalNumberStats(
  record: MatchRecord,
  keys: Array<keyof Participant['stats']>
): Partial<Participant['stats']> {
  const source = record as unknown as Record<string, unknown>
  return keys.reduce<Partial<Participant['stats']>>((stats, key) => {
    const value = safeNumber(source[key])
    if (value !== null) {
      stats[key] = value as never
    }
    return stats
  }, {})
}

function defaultStats(): Participant['stats'] {
  return {
    win: false,
    kills: 0,
    deaths: 0,
    assists: 0,
    goldEarned: 0,
    totalMinionsKilled: 0,
    neutralMinionsKilled: 0,
    totalDamageDealtToChampions: 0,
    totalDamageTaken: 0,
    totalHeal: 0,
    item0: 0,
    item1: 0,
    item2: 0,
    item3: 0,
    item4: 0,
    item5: 0,
    item6: 0
  }
}

function formatDisplayName(summoner: Summoner): string | null {
  const gameName = nonEmptyString(summoner.gameName)
  if (!gameName) {
    return null
  }

  const tagLine = nonEmptyString(summoner.tagLine)
  return tagLine ? `${gameName}#${tagLine}` : gameName
}

function safeString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function safeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function safeNumberFromString(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function safeBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value
  }

  if (value === 1) {
    return true
  }

  if (value === 0) {
    return false
  }

  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
