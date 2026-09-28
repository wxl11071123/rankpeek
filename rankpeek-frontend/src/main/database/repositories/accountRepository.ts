import type {
  AccountRepository,
  SqliteDatabase,
  SummonerAccount,
  SummonerAccountInput
} from '../types.ts'
import { booleanToInteger, nullableNumber, nullableString, nowIso } from './helpers.ts'

interface SummonerAccountRow {
  id: number
  region: string
  puuid: string
  game_name: string | null
  tag_line: string | null
  summoner_name: string | null
  display_name: string | null
  profile_icon_id: number | null
  summoner_level: number | null
  last_selected: number
  created_at: string
  updated_at: string
}

export function createAccountRepository(connection: SqliteDatabase): AccountRepository {
  const selectByPuuid = connection.prepare(`
    SELECT *
    FROM summoner_accounts
    WHERE region = ? AND puuid = ?
  `)

  const upsert = connection.prepare(`
    INSERT INTO summoner_accounts (
      region,
      puuid,
      game_name,
      tag_line,
      summoner_name,
      display_name,
      profile_icon_id,
      summoner_level,
      last_selected,
      created_at,
      updated_at
    ) VALUES (
      @region,
      @puuid,
      @gameName,
      @tagLine,
      @summonerName,
      @displayName,
      @profileIconId,
      @summonerLevel,
      @lastSelected,
      @createdAt,
      @updatedAt
    )
    ON CONFLICT(region, puuid) DO UPDATE SET
      game_name = COALESCE(excluded.game_name, summoner_accounts.game_name),
      tag_line = COALESCE(excluded.tag_line, summoner_accounts.tag_line),
      summoner_name = COALESCE(excluded.summoner_name, summoner_accounts.summoner_name),
      display_name = COALESCE(excluded.display_name, summoner_accounts.display_name),
      profile_icon_id = COALESCE(excluded.profile_icon_id, summoner_accounts.profile_icon_id),
      summoner_level = COALESCE(excluded.summoner_level, summoner_accounts.summoner_level),
      last_selected = CASE
        WHEN @lastSelectedProvided = 1 THEN excluded.last_selected
        ELSE summoner_accounts.last_selected
      END,
      updated_at = excluded.updated_at
    RETURNING *
  `)

  const list = connection.prepare(`
    SELECT *
    FROM summoner_accounts
    ORDER BY last_selected DESC, updated_at DESC, id DESC
  `)

  const clearLastSelected = connection.prepare('UPDATE summoner_accounts SET last_selected = 0')
  const markLastSelected = connection.prepare(`
    UPDATE summoner_accounts
    SET last_selected = 1, updated_at = ?
    WHERE region = ? AND puuid = ?
  `)

  const setSelectedTransaction = connection.transaction((region: string, puuid: string) => {
    clearLastSelected.run()
    const result = markLastSelected.run(nowIso(), region, puuid)
    if (result.changes === 0) {
      throw new Error('Account not found')
    }

    return mapAccountRow(selectByPuuid.get(region, puuid) as SummonerAccountRow)
  })

  return {
    upsertAccount(account) {
      const timestamp = nowIso()
      const row = upsert.get(toAccountParameters(account, timestamp)) as SummonerAccountRow
      return mapAccountRow(row)
    },

    getAccountByPuuid(region, puuid) {
      const row = selectByPuuid.get(region, puuid) as SummonerAccountRow | undefined
      return row ? mapAccountRow(row) : null
    },

    listAccounts() {
      return (list.all() as SummonerAccountRow[]).map(mapAccountRow)
    },

    setLastSelectedAccount(region, puuid) {
      return setSelectedTransaction(region, puuid)
    },

    getLastSelectedAccount() {
      const row = connection
        .prepare(`
          SELECT *
          FROM summoner_accounts
          WHERE last_selected = 1
          ORDER BY updated_at DESC, id DESC
          LIMIT 1
        `)
        .get() as SummonerAccountRow | undefined

      return row ? mapAccountRow(row) : null
    }
  }
}

function toAccountParameters(account: SummonerAccountInput, timestamp: string) {
  const lastSelected = booleanToInteger(account.lastSelected)

  return {
    region: account.region,
    puuid: account.puuid,
    gameName: nullableString(account.gameName),
    tagLine: nullableString(account.tagLine),
    summonerName: nullableString(account.summonerName),
    displayName: nullableString(account.displayName),
    profileIconId: nullableNumber(account.profileIconId),
    summonerLevel: nullableNumber(account.summonerLevel),
    lastSelected: lastSelected ?? 0,
    lastSelectedProvided: account.lastSelected === undefined || account.lastSelected === null ? 0 : 1,
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function mapAccountRow(row: SummonerAccountRow): SummonerAccount {
  return {
    id: row.id,
    region: row.region,
    puuid: row.puuid,
    gameName: row.game_name,
    tagLine: row.tag_line,
    summonerName: row.summoner_name,
    displayName: row.display_name,
    profileIconId: row.profile_icon_id,
    summonerLevel: row.summoner_level,
    lastSelected: row.last_selected === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
