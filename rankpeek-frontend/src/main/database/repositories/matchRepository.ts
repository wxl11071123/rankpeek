import type {
  MatchDetail,
  MatchDetailInput,
  MatchRecord,
  MatchRecordInput,
  MatchRecordListOptions,
  MatchRepository,
  SqliteDatabase
} from '../types.ts'
import { hasCompleteMatchRecordSummary } from '../../../shared/matchQuality.ts'
import {
  booleanToInteger,
  integerToBoolean,
  jsonText,
  normalizedLimit,
  normalizedOffset,
  nullableNumber,
  nullableString,
  nowIso,
  optionalJsonText
} from './helpers.ts'

interface MatchRecordRow {
  id: number
  region: string
  match_id: string
  account_puuid: string
  queue_id: number | null
  queue_name: string | null
  game_mode: string | null
  game_version: string | null
  game_creation: number | null
  game_duration: number | null
  champion_id: number | null
  spell1_id: number | null
  spell2_id: number | null
  win: number | null
  kills: number | null
  deaths: number | null
  assists: number | null
  gold_earned: number | null
  total_damage_dealt_to_champions: number | null
  double_kills: number | null
  triple_kills: number | null
  quadra_kills: number | null
  penta_kills: number | null
  largest_killing_spree: number | null
  legendary_count: number | null
  perk0: number | null
  player_augment1: number | null
  player_augment2: number | null
  player_augment3: number | null
  player_augment4: number | null
  lane: string | null
  role: string | null
  raw_summary_json: string
  fetched_at: string
  updated_at: string
}

interface MatchDetailRow {
  id: number
  region: string
  match_id: string
  raw_detail_json: string
  normalized_detail_json: string | null
  source: string | null
  schema_version: number
  fetched_at: string
  updated_at: string
}

interface MatchRecordParameters {
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
  spell1Id: number | null
  spell2Id: number | null
  win: number | null
  kills: number | null
  deaths: number | null
  assists: number | null
  goldEarned: number | null
  totalDamageDealtToChampions: number | null
  doubleKills: number | null
  tripleKills: number | null
  quadraKills: number | null
  pentaKills: number | null
  largestKillingSpree: number | null
  legendaryCount: number | null
  perk0: number | null
  playerAugment1: number | null
  playerAugment2: number | null
  playerAugment3: number | null
  playerAugment4: number | null
  lane: string | null
  role: string | null
  rawSummaryJson: string
  fetchedAt: string
  updatedAt: string
}

export function createMatchRepository(connection: SqliteDatabase): MatchRepository {
  const upsertRecord = connection.prepare(`
    INSERT INTO match_records (
      region,
      match_id,
      account_puuid,
      queue_id,
      queue_name,
      game_mode,
      game_version,
      game_creation,
      game_duration,
      champion_id,
      spell1_id,
      spell2_id,
      win,
      kills,
      deaths,
      assists,
      gold_earned,
      total_damage_dealt_to_champions,
      double_kills,
      triple_kills,
      quadra_kills,
      penta_kills,
      largest_killing_spree,
      legendary_count,
      perk0,
      player_augment1,
      player_augment2,
      player_augment3,
      player_augment4,
      lane,
      role,
      raw_summary_json,
      fetched_at,
      updated_at
    ) VALUES (
      @region,
      @matchId,
      @accountPuuid,
      @queueId,
      @queueName,
      @gameMode,
      @gameVersion,
      @gameCreation,
      @gameDuration,
      @championId,
      @spell1Id,
      @spell2Id,
      @win,
      @kills,
      @deaths,
      @assists,
      @goldEarned,
      @totalDamageDealtToChampions,
      @doubleKills,
      @tripleKills,
      @quadraKills,
      @pentaKills,
      @largestKillingSpree,
      @legendaryCount,
      @perk0,
      @playerAugment1,
      @playerAugment2,
      @playerAugment3,
      @playerAugment4,
      @lane,
      @role,
      @rawSummaryJson,
      @fetchedAt,
      @updatedAt
    )
    ON CONFLICT(region, match_id, account_puuid) DO UPDATE SET
      queue_id = excluded.queue_id,
      queue_name = excluded.queue_name,
      game_mode = excluded.game_mode,
      game_version = excluded.game_version,
      game_creation = excluded.game_creation,
      game_duration = excluded.game_duration,
      champion_id = excluded.champion_id,
      spell1_id = COALESCE(excluded.spell1_id, spell1_id),
      spell2_id = COALESCE(excluded.spell2_id, spell2_id),
      win = excluded.win,
      kills = excluded.kills,
      deaths = excluded.deaths,
      assists = excluded.assists,
      gold_earned = COALESCE(excluded.gold_earned, gold_earned),
      total_damage_dealt_to_champions = COALESCE(excluded.total_damage_dealt_to_champions, total_damage_dealt_to_champions),
      double_kills = COALESCE(excluded.double_kills, double_kills),
      triple_kills = COALESCE(excluded.triple_kills, triple_kills),
      quadra_kills = COALESCE(excluded.quadra_kills, quadra_kills),
      penta_kills = COALESCE(excluded.penta_kills, penta_kills),
      largest_killing_spree = COALESCE(excluded.largest_killing_spree, largest_killing_spree),
      legendary_count = COALESCE(excluded.legendary_count, legendary_count),
      perk0 = COALESCE(excluded.perk0, perk0),
      player_augment1 = COALESCE(excluded.player_augment1, player_augment1),
      player_augment2 = COALESCE(excluded.player_augment2, player_augment2),
      player_augment3 = COALESCE(excluded.player_augment3, player_augment3),
      player_augment4 = COALESCE(excluded.player_augment4, player_augment4),
      lane = excluded.lane,
      role = excluded.role,
      raw_summary_json = excluded.raw_summary_json,
      fetched_at = excluded.fetched_at,
      updated_at = excluded.updated_at
    RETURNING *
  `)

  const getExistingRecord = connection.prepare(`
    SELECT *
    FROM match_records
    WHERE region = ? AND match_id = ? AND account_puuid = ?
  `)

  const upsertDetail = connection.prepare(`
    INSERT INTO match_details (
      region,
      match_id,
      raw_detail_json,
      normalized_detail_json,
      source,
      schema_version,
      fetched_at,
      updated_at
    ) VALUES (
      @region,
      @matchId,
      @rawDetailJson,
      @normalizedDetailJson,
      @source,
      @schemaVersion,
      @fetchedAt,
      @updatedAt
    )
    ON CONFLICT(region, match_id) DO UPDATE SET
      raw_detail_json = excluded.raw_detail_json,
      normalized_detail_json = excluded.normalized_detail_json,
      source = excluded.source,
      schema_version = excluded.schema_version,
      fetched_at = excluded.fetched_at,
      updated_at = excluded.updated_at
    RETURNING *
  `)

  const upsertRecordSafely = (record: MatchRecordInput): MatchRecord => {
    const parameters = toMatchRecordParameters(record)
    const existing = getExistingRecord
      .get(parameters.region, parameters.matchId, parameters.accountPuuid) as MatchRecordRow | undefined

    if (existing && isCompleteMatchRecordRow(existing) && !isCompleteMatchRecordParameters(parameters)) {
      return mapMatchRecordRow(existing)
    }

    return mapMatchRecordRow(upsertRecord.get(parameters) as MatchRecordRow)
  }

  const upsertRecordsTransaction = connection.transaction((records: MatchRecordInput[]) => (
    records.map(upsertRecordSafely)
  ))

  return {
    upsertMatchRecord(record) {
      return upsertRecordSafely(record)
    },

    upsertMatchRecords(records) {
      return upsertRecordsTransaction(records)
    },

    listMatchRecordsByAccount(accountPuuid, options) {
      return listMatchRecords(connection, accountPuuid, options)
    },

    getMatchDetail(region, matchId) {
      const row = connection
        .prepare('SELECT * FROM match_details WHERE region = ? AND match_id = ?')
        .get(region, matchId) as MatchDetailRow | undefined

      return row ? mapMatchDetailRow(row) : null
    },

    upsertMatchDetail(detail) {
      return mapMatchDetailRow(upsertDetail.get(toMatchDetailParameters(detail)) as MatchDetailRow)
    }
  }
}

function listMatchRecords(
  connection: SqliteDatabase,
  accountPuuid: string,
  options: MatchRecordListOptions | undefined
): MatchRecord[] {
  const conditions = ['account_puuid = @accountPuuid']
  const parameters: Record<string, string | number> = {
    accountPuuid,
    limit: normalizedLimit(options?.limit),
    offset: normalizedOffset(options?.offset)
  }

  if (typeof options?.queueId === 'number') {
    conditions.push('queue_id = @queueId')
    parameters.queueId = options.queueId
  }

  if (typeof options?.championId === 'number') {
    conditions.push('champion_id = @championId')
    parameters.championId = options.championId
  }

  const rows = connection
    .prepare(`
      SELECT *
      FROM match_records
      WHERE ${conditions.join(' AND ')}
      ORDER BY game_creation DESC, id DESC
      LIMIT @limit OFFSET @offset
    `)
    .all(parameters) as MatchRecordRow[]

  return rows.map(mapMatchRecordRow)
}

function toMatchRecordParameters(record: MatchRecordInput): MatchRecordParameters {
  const timestamp = nowIso()

  return {
    region: record.region,
    matchId: record.matchId,
    accountPuuid: record.accountPuuid,
    queueId: nullableNumber(record.queueId),
    queueName: nullableString(record.queueName),
    gameMode: nullableString(record.gameMode),
    gameVersion: nullableString(record.gameVersion),
    gameCreation: nullableNumber(record.gameCreation),
    gameDuration: nullableNumber(record.gameDuration),
    championId: nullableNumber(record.championId),
    spell1Id: nullableNumber(record.spell1Id),
    spell2Id: nullableNumber(record.spell2Id),
    win: booleanToInteger(record.win),
    kills: nullableNumber(record.kills),
    deaths: nullableNumber(record.deaths),
    assists: nullableNumber(record.assists),
    goldEarned: nullableNumber(record.goldEarned),
    totalDamageDealtToChampions: nullableNumber(record.totalDamageDealtToChampions),
    doubleKills: nullableNumber(record.doubleKills),
    tripleKills: nullableNumber(record.tripleKills),
    quadraKills: nullableNumber(record.quadraKills),
    pentaKills: nullableNumber(record.pentaKills),
    largestKillingSpree: nullableNumber(record.largestKillingSpree),
    legendaryCount: nullableNumber(record.legendaryCount),
    perk0: nullableNumber(record.perk0),
    playerAugment1: nullableNumber(record.playerAugment1),
    playerAugment2: nullableNumber(record.playerAugment2),
    playerAugment3: nullableNumber(record.playerAugment3),
    playerAugment4: nullableNumber(record.playerAugment4),
    lane: nullableString(record.lane),
    role: nullableString(record.role),
    rawSummaryJson: jsonText(record.rawSummaryJson),
    fetchedAt: record.fetchedAt ?? timestamp,
    updatedAt: record.updatedAt ?? timestamp
  }
}

function isCompleteMatchRecordRow(row: MatchRecordRow): boolean {
  return hasCompleteMatchRecordSummary({
    championId: row.champion_id,
    win: row.win,
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists
  })
}

function isCompleteMatchRecordParameters(parameters: MatchRecordParameters): boolean {
  return hasCompleteMatchRecordSummary(parameters)
}

function toMatchDetailParameters(detail: MatchDetailInput) {
  const timestamp = nowIso()

  return {
    region: detail.region,
    matchId: detail.matchId,
    rawDetailJson: jsonText(detail.rawDetailJson),
    normalizedDetailJson: optionalJsonText(detail.normalizedDetailJson),
    source: nullableString(detail.source),
    schemaVersion: nullableNumber(detail.schemaVersion) ?? 1,
    fetchedAt: detail.fetchedAt ?? timestamp,
    updatedAt: detail.updatedAt ?? timestamp
  }
}

function mapMatchRecordRow(row: MatchRecordRow): MatchRecord {
  return {
    id: row.id,
    region: row.region,
    matchId: row.match_id,
    accountPuuid: row.account_puuid,
    queueId: row.queue_id,
    queueName: row.queue_name,
    gameMode: row.game_mode,
    gameVersion: row.game_version,
    gameCreation: row.game_creation,
    gameDuration: row.game_duration,
    championId: row.champion_id,
    spell1Id: row.spell1_id,
    spell2Id: row.spell2_id,
    win: integerToBoolean(row.win),
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists,
    goldEarned: row.gold_earned,
    totalDamageDealtToChampions: row.total_damage_dealt_to_champions,
    doubleKills: row.double_kills,
    tripleKills: row.triple_kills,
    quadraKills: row.quadra_kills,
    pentaKills: row.penta_kills,
    largestKillingSpree: row.largest_killing_spree,
    legendaryCount: row.legendary_count,
    perk0: row.perk0,
    playerAugment1: row.player_augment1,
    playerAugment2: row.player_augment2,
    playerAugment3: row.player_augment3,
    playerAugment4: row.player_augment4,
    lane: row.lane,
    role: row.role,
    rawSummaryJson: row.raw_summary_json,
    fetchedAt: row.fetched_at,
    updatedAt: row.updated_at
  }
}

function mapMatchDetailRow(row: MatchDetailRow): MatchDetail {
  return {
    id: row.id,
    region: row.region,
    matchId: row.match_id,
    rawDetailJson: row.raw_detail_json,
    normalizedDetailJson: row.normalized_detail_json,
    source: row.source,
    schemaVersion: row.schema_version,
    fetchedAt: row.fetched_at,
    updatedAt: row.updated_at
  }
}
