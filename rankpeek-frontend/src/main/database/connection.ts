import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname } from 'path'
import type { LocalDatabaseLogger, SqliteDatabase } from './types.ts'

export function createDatabaseConnection(databasePath: string, logger: LocalDatabaseLogger): SqliteDatabase {
  mkdirSync(dirname(databasePath), { recursive: true })
  logger.info(`Local database file: ${databasePath}`)

  const connection = new Database(databasePath)
  connection.pragma('journal_mode = WAL')
  connection.pragma('foreign_keys = ON')
  connection.pragma('busy_timeout = 5000')

  return connection
}
