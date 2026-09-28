import type { LocalDatabaseLogger, SqliteDatabase } from './types.ts'

interface Migration {
  version: number
  name: string
  up(connection: SqliteDatabase): void
}

const migrations: Migration[] = [
  {
    version: 1,
    name: '1_init_user_database',
    up(connection) {
      connection.exec(`
        CREATE TABLE IF NOT EXISTS summoner_accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          region TEXT NOT NULL,
          puuid TEXT NOT NULL,
          game_name TEXT,
          tag_line TEXT,
          summoner_name TEXT,
          display_name TEXT,
          profile_icon_id INTEGER,
          summoner_level INTEGER,
          last_selected INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(region, puuid)
        );

        CREATE INDEX IF NOT EXISTS idx_summoner_accounts_puuid
          ON summoner_accounts(puuid);
        CREATE INDEX IF NOT EXISTS idx_summoner_accounts_last_selected
          ON summoner_accounts(last_selected);

        CREATE TABLE IF NOT EXISTS match_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          region TEXT NOT NULL,
          match_id TEXT NOT NULL,
          account_puuid TEXT NOT NULL,
          queue_id INTEGER,
          queue_name TEXT,
          game_mode TEXT,
          game_version TEXT,
          game_creation INTEGER,
          game_duration INTEGER,
          champion_id INTEGER,
          win INTEGER,
          kills INTEGER,
          deaths INTEGER,
          assists INTEGER,
          lane TEXT,
          role TEXT,
          raw_summary_json TEXT NOT NULL,
          fetched_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(region, match_id, account_puuid)
        );

        CREATE INDEX IF NOT EXISTS idx_match_records_account_time
          ON match_records(account_puuid, game_creation DESC);
        CREATE INDEX IF NOT EXISTS idx_match_records_match_id
          ON match_records(match_id);
        CREATE INDEX IF NOT EXISTS idx_match_records_game_version
          ON match_records(game_version);

        CREATE TABLE IF NOT EXISTS match_details (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          region TEXT NOT NULL,
          match_id TEXT NOT NULL,
          raw_detail_json TEXT NOT NULL,
          normalized_detail_json TEXT,
          source TEXT,
          schema_version INTEGER NOT NULL DEFAULT 1,
          fetched_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(region, match_id)
        );

        CREATE INDEX IF NOT EXISTS idx_match_details_match_id
          ON match_details(match_id);

        CREATE TABLE IF NOT EXISTS ai_analysis_results (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_puuid TEXT NOT NULL,
          match_id TEXT,
          analysis_type TEXT NOT NULL,
          subject_key TEXT,
          game_version TEXT,
          model_name TEXT,
          prompt_version TEXT,
          input_hash TEXT,
          output_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_ai_analysis_account
          ON ai_analysis_results(account_puuid, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_ai_analysis_match
          ON ai_analysis_results(match_id);
        CREATE INDEX IF NOT EXISTS idx_ai_analysis_type
          ON ai_analysis_results(analysis_type);
        CREATE INDEX IF NOT EXISTS idx_ai_analysis_input_hash
          ON ai_analysis_results(input_hash);
      `)
    }
  },
  {
    version: 2,
    name: '2_match_record_enhanced_summary_columns',
    up(connection) {
      addColumnIfMissing(connection, 'match_records', 'spell1_id', 'INTEGER')
      addColumnIfMissing(connection, 'match_records', 'spell2_id', 'INTEGER')
      addColumnIfMissing(connection, 'match_records', 'gold_earned', 'INTEGER')
      addColumnIfMissing(connection, 'match_records', 'total_damage_dealt_to_champions', 'INTEGER')
      addColumnIfMissing(connection, 'match_records', 'double_kills', 'INTEGER')
      addColumnIfMissing(connection, 'match_records', 'triple_kills', 'INTEGER')
      addColumnIfMissing(connection, 'match_records', 'quadra_kills', 'INTEGER')
      addColumnIfMissing(connection, 'match_records', 'penta_kills', 'INTEGER')
      addColumnIfMissing(connection, 'match_records', 'largest_killing_spree', 'INTEGER')
      addColumnIfMissing(connection, 'match_records', 'legendary_count', 'INTEGER')
      addColumnIfMissing(connection, 'match_records', 'perk0', 'INTEGER')
      addColumnIfMissing(connection, 'match_records', 'player_augment1', 'INTEGER')
      addColumnIfMissing(connection, 'match_records', 'player_augment2', 'INTEGER')
      addColumnIfMissing(connection, 'match_records', 'player_augment3', 'INTEGER')
      addColumnIfMissing(connection, 'match_records', 'player_augment4', 'INTEGER')
    }
  },
  {
    version: 3,
    name: '3_ai_analysis_match_bound_records',
    up(connection) {
      connection.exec(`
        DELETE FROM ai_analysis_results;

        CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_analysis_account_match_type
          ON ai_analysis_results(account_puuid, match_id, analysis_type);
      `)
    }
  },
  {
    version: 4,
    name: '4_remove_rankpeek_server_mock_ai_results',
    up(connection) {
      connection.exec(`
        DELETE FROM ai_analysis_results
        WHERE output_json LIKE '%rankpeek-server mock%'
           OR output_json LIKE '%RankPeek postgame mock stream started%'
           OR output_json LIKE '%RankPeek mock stream started%';
      `)
    }
  }
]

export function runMigrations(connection: SqliteDatabase, logger: LocalDatabaseLogger) {
  connection.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `)

  const appliedRows = connection
    .prepare('SELECT version FROM schema_migrations')
    .all() as Array<{ version: number }>
  const appliedVersions = new Set(appliedRows.map((row) => row.version))

  for (const migration of [...migrations].sort((left, right) => left.version - right.version)) {
    if (appliedVersions.has(migration.version)) {
      continue
    }

    logger.info(`Starting database migration ${migration.version}: ${migration.name}`)
    const applyMigration = connection.transaction(() => {
      migration.up(connection)
      connection
        .prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(migration.version, migration.name, new Date().toISOString())
    })

    try {
      applyMigration()
      logger.info(`Finished database migration ${migration.version}: ${migration.name}`)
    } catch (error) {
      logger.error(`Failed database migration ${migration.version}: ${String(error)}`)
      throw error
    }
  }
}

function addColumnIfMissing(
  connection: SqliteDatabase,
  tableName: string,
  columnName: string,
  columnDefinition: string
): void {
  const columns = connection
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as Array<{ name: string }>
  if (columns.some(column => column.name === columnName)) {
    return
  }
  connection.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`)
}
