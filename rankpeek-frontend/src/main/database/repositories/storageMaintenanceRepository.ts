import { statSync } from 'fs'
import type { LocalStorageHealthStats, LocalStorageRetentionResult, SqliteDatabase } from '../types.ts'

const MATCH_RECORDS_PER_ACCOUNT_LIMIT = 200

export function runStorageRetention(connection: SqliteDatabase): LocalStorageRetentionResult {
  const runRetention = connection.transaction(() => {
    const matchRecordsDeleted = connection.prepare(`
      DELETE FROM match_records
      WHERE id IN (
        SELECT id
        FROM (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY account_puuid
              ORDER BY COALESCE(game_creation, 0) DESC, id DESC
            ) AS row_number
          FROM match_records
        )
        WHERE row_number > @limit
      )
    `).run({ limit: MATCH_RECORDS_PER_ACCOUNT_LIMIT }).changes

    const aiAnalysisDeleted = connection.prepare(`
      DELETE FROM ai_analysis_results
      WHERE match_id IS NOT NULL
        AND match_id <> ''
        AND NOT EXISTS (
          SELECT 1
          FROM match_records
          WHERE match_records.account_puuid = ai_analysis_results.account_puuid
            AND match_records.match_id = ai_analysis_results.match_id
        )
    `).run().changes

    const matchDetailsDeleted = connection.prepare(`
      DELETE FROM match_details
      WHERE NOT EXISTS (
        SELECT 1
        FROM match_records
        WHERE match_records.region = match_details.region
          AND match_records.match_id = match_details.match_id
      )
    `).run().changes

    const retained = connection.prepare(`
      SELECT COUNT(*) AS count
      FROM match_records
    `).get() as { count: number }

    return {
      matchRecordsDeleted,
      matchDetailsDeleted,
      aiAnalysisDeleted,
      matchRecordsRetained: retained.count
    }
  })

  return runRetention()
}

export function getStorageHealthStats(connection: SqliteDatabase, databasePath: string): LocalStorageHealthStats {
  const pageCount = readPragmaNumber(connection, 'page_count')
  const pageSize = readPragmaNumber(connection, 'page_size')
  const freelistCount = readPragmaNumber(connection, 'freelist_count')
  const recordCounts = connection.prepare(`
    SELECT
      (SELECT COUNT(*) FROM summoner_accounts) AS accountCount,
      (SELECT COUNT(*) FROM match_records) AS matchRecordCount,
      (SELECT COUNT(*) FROM match_details) AS matchDetailCount,
      (SELECT COUNT(*) FROM ai_analysis_results) AS aiAnalysisCount,
      (
        SELECT COUNT(*)
        FROM ai_analysis_results
        WHERE match_id IS NOT NULL
          AND match_id <> ''
          AND NOT EXISTS (
            SELECT 1
            FROM match_records
            WHERE match_records.account_puuid = ai_analysis_results.account_puuid
              AND match_records.match_id = ai_analysis_results.match_id
          )
      ) AS orphanSingleMatchAiCount
  `).get() as {
    accountCount: number
    matchRecordCount: number
    matchDetailCount: number
    aiAnalysisCount: number
    orphanSingleMatchAiCount: number
  }
  const jsonStats = connection.prepare(`
    SELECT
      (SELECT AVG(LENGTH(raw_summary_json)) FROM match_records) AS matchSummaryJsonAvgBytes,
      (SELECT MAX(LENGTH(raw_summary_json)) FROM match_records) AS matchSummaryJsonMaxBytes,
      (SELECT AVG(LENGTH(raw_detail_json)) FROM match_details) AS matchDetailJsonAvgBytes,
      (SELECT MAX(LENGTH(raw_detail_json)) FROM match_details) AS matchDetailJsonMaxBytes,
      (SELECT AVG(LENGTH(output_json)) FROM ai_analysis_results) AS aiOutputJsonAvgBytes,
      (SELECT MAX(LENGTH(output_json)) FROM ai_analysis_results) AS aiOutputJsonMaxBytes
  `).get() as {
    matchSummaryJsonAvgBytes: number | null
    matchSummaryJsonMaxBytes: number | null
    matchDetailJsonAvgBytes: number | null
    matchDetailJsonMaxBytes: number | null
    aiOutputJsonAvgBytes: number | null
    aiOutputJsonMaxBytes: number | null
  }
  const maxMatchesPerAccount = connection.prepare(`
    SELECT account_puuid AS accountPuuid, COUNT(*) AS matchCount
    FROM match_records
    GROUP BY account_puuid
    ORDER BY matchCount DESC, account_puuid ASC
    LIMIT 10
  `).all() as Array<{ accountPuuid: string; matchCount: number }>

  return {
    databasePath,
    fileBytes: statSync(databasePath).size,
    pageCount,
    pageSize,
    freelistCount,
    ...recordCounts,
    maxMatchesPerAccount,
    ...jsonStats
  }
}

function readPragmaNumber(connection: SqliteDatabase, pragmaName: string): number {
  const row = connection.prepare(`PRAGMA ${pragmaName}`).get() as Record<string, number> | undefined
  const value = row ? Object.values(row)[0] : 0
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
