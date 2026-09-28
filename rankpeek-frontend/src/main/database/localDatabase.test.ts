import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalDatabase } from './index.ts'
import type { LocalDatabase, MatchRecordInput } from './types.ts'

const silentLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
}

function createTempLocalDatabase(): { database: LocalDatabase; databasePath: string; cleanup: () => void } {
  const directory = mkdtempSync(join(tmpdir(), 'rankpeek-db-'))
  const databasePath = join(directory, 'rankpeek.db')
  const database = createLocalDatabase({ databasePath, logger: silentLogger })

  return {
    database,
    databasePath,
    cleanup: () => {
      database.close()
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

function makeMatchRecord(matchNumber: number, accountPuuid = 'test-puuid'): MatchRecordInput {
  return {
    region: 'HN1',
    matchId: `HN1_${accountPuuid}_${matchNumber}`,
    accountPuuid,
    queueId: 420,
    queueName: 'Ranked Solo',
    gameMode: 'CLASSIC',
    gameCreation: matchNumber,
    gameDuration: 1800,
    championId: 100 + (matchNumber % 20),
    win: matchNumber % 2 === 0,
    kills: matchNumber % 15,
    deaths: matchNumber % 7,
    assists: matchNumber % 22,
    rawSummaryJson: { matchNumber, accountPuuid }
  }
}

function countMatchRecords(database: LocalDatabase, accountPuuid: string) {
  return (database.connection
    .prepare('SELECT COUNT(*) AS count FROM match_records WHERE account_puuid = ?')
    .get(accountPuuid) as { count: number }).count
}

function matchIdAtEdge(database: LocalDatabase, accountPuuid: string, direction: 'newest' | 'oldest') {
  const order = direction === 'newest' ? 'DESC' : 'ASC'
  const row = database.connection
    .prepare(`
      SELECT match_id AS matchId
      FROM match_records
      WHERE account_puuid = ?
      ORDER BY game_creation ${order}, id ${order}
      LIMIT 1
    `)
    .get(accountPuuid) as { matchId: string } | undefined

  return row?.matchId ?? null
}

function countAiAnalysisResults(database: LocalDatabase, accountPuuid: string) {
  return (database.connection
    .prepare('SELECT COUNT(*) AS count FROM ai_analysis_results WHERE account_puuid = ?')
    .get(accountPuuid) as { count: number }).count
}

function countAllAiAnalysisResults(database: LocalDatabase) {
  return (database.connection
    .prepare('SELECT COUNT(*) AS count FROM ai_analysis_results')
    .get() as { count: number }).count
}

test('initializes database file and records migration version 1 once', () => {
  const { database, databasePath, cleanup } = createTempLocalDatabase()

  try {
    const migration = database.connection
      .prepare('SELECT version, name FROM schema_migrations WHERE version = 1')
      .get() as { version: number; name: string } | undefined

    assert.deepEqual(migration, {
      version: 1,
      name: '1_init_user_database'
    })

    database.close()
    const reopened = createLocalDatabase({ databasePath, logger: silentLogger })
    const migrationCount = reopened.connection
      .prepare('SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 1')
      .get() as { count: number }

    assert.equal(migrationCount.count, 1)
    reopened.close()
  } finally {
    cleanup()
  }
})

test('account repository upserts accounts and tracks a single last selected account', () => {
  const { database, cleanup } = createTempLocalDatabase()

  try {
    const first = database.accounts.upsertAccount({
      region: 'HN1',
      puuid: 'test-puuid',
      gameName: 'RankPeekTest',
      tagLine: '0001',
      displayName: 'RankPeekTest#0001'
    })

    assert.equal(first.region, 'HN1')
    assert.equal(first.puuid, 'test-puuid')
    assert.equal(first.displayName, 'RankPeekTest#0001')

    const updated = database.accounts.upsertAccount({
      region: 'HN1',
      puuid: 'test-puuid',
      summonerName: 'RankPeekLegacy',
      summonerLevel: 88
    })

    assert.equal(updated.id, first.id)
    assert.equal(updated.summonerName, 'RankPeekLegacy')
    assert.equal(updated.summonerLevel, 88)

    database.accounts.upsertAccount({
      region: 'HN1',
      puuid: 'second-puuid',
      displayName: 'Second#0002'
    })

    database.accounts.setLastSelectedAccount('HN1', 'test-puuid')
    let selected = database.accounts.getLastSelectedAccount()
    assert.equal(selected?.puuid, 'test-puuid')

    database.accounts.setLastSelectedAccount('HN1', 'second-puuid')
    selected = database.accounts.getLastSelectedAccount()
    assert.equal(selected?.puuid, 'second-puuid')

    const accounts = database.accounts.listAccounts()
    assert.equal(accounts.length, 2)
    assert.equal(accounts.filter((account) => account.lastSelected).length, 1)
  } finally {
    cleanup()
  }
})

test('match repository upserts records, supports filters, and caches detail payloads', () => {
  const { database, cleanup } = createTempLocalDatabase()

  try {
    database.matches.upsertMatchRecords([
      {
        region: 'HN1',
        matchId: 'HN1_1',
        accountPuuid: 'test-puuid',
        queueId: 420,
        queueName: 'Ranked Solo',
        gameMode: 'CLASSIC',
        gameVersion: '16.8.1',
        gameCreation: 200,
        gameDuration: 1800,
        championId: 103,
        win: true,
        kills: 10,
        deaths: 2,
        assists: 8,
        lane: 'MIDDLE',
        role: 'SOLO',
        rawSummaryJson: { matchId: 'HN1_1' }
      },
      {
        region: 'HN1',
        matchId: 'HN1_2',
        accountPuuid: 'test-puuid',
        queueId: 430,
        gameCreation: 100,
        championId: 99,
        rawSummaryJson: { matchId: 'HN1_2' }
      }
    ])

    const allRecords = database.matches.listMatchRecordsByAccount('test-puuid', { limit: 10 })
    assert.deepEqual(
      allRecords.map((record) => record.matchId),
      ['HN1_1', 'HN1_2']
    )

    const rankedRecords = database.matches.listMatchRecordsByAccount('test-puuid', { queueId: 420 })
    assert.equal(rankedRecords.length, 1)
    assert.equal(rankedRecords[0]?.championId, 103)

    const championRecords = database.matches.listMatchRecordsByAccount('test-puuid', { championId: 99 })
    assert.equal(championRecords.length, 1)
    assert.equal(championRecords[0]?.matchId, 'HN1_2')

    const detail = database.matches.upsertMatchDetail({
      region: 'HN1',
      matchId: 'HN1_1',
      rawDetailJson: { metadata: { matchId: 'HN1_1' } },
      normalizedDetailJson: { participants: [] },
      source: 'smoke-test'
    })

    assert.equal(detail.matchId, 'HN1_1')
    assert.match(detail.rawDetailJson, /HN1_1/)

    const cachedDetail = database.matches.getMatchDetail('HN1', 'HN1_1')
    assert.equal(cachedDetail?.source, 'smoke-test')
  } finally {
    cleanup()
  }
})

test('match repository keeps complete records when an incomplete upsert arrives and allows complete repair', () => {
  const { database, cleanup } = createTempLocalDatabase()

  try {
    const completeRecord = {
      region: 'HN1',
      matchId: 'HN1_quality',
      accountPuuid: 'test-puuid',
      queueId: 420,
      queueName: 'Ranked Solo',
      gameMode: 'CLASSIC',
      gameCreation: 300,
      gameDuration: 1800,
      championId: 103,
      win: true,
      kills: 10,
      deaths: 2,
      assists: 8,
      rawSummaryJson: { matchId: 'HN1_quality', quality: 'complete' }
    }

    database.matches.upsertMatchRecord(completeRecord)
    database.matches.upsertMatchRecord({
      ...completeRecord,
      championId: null,
      win: null,
      kills: null,
      deaths: null,
      assists: null,
      rawSummaryJson: { matchId: 'HN1_quality', quality: 'incomplete' }
    })

    const protectedRecords = database.matches.listMatchRecordsByAccount('test-puuid', { limit: 10 })
    const protectedRecord = protectedRecords.find((record) => record.matchId === 'HN1_quality')
    assert.equal(protectedRecord?.championId, 103)
    assert.equal(protectedRecord?.win, true)
    assert.equal(protectedRecord?.kills, 10)
    assert.equal(protectedRecord?.deaths, 2)
    assert.equal(protectedRecord?.assists, 8)
    assert.match(protectedRecord?.rawSummaryJson ?? '', /complete/)

    database.matches.upsertMatchRecord({
      region: 'HN1',
      matchId: 'HN1_repair',
      accountPuuid: 'test-puuid',
      queueId: 420,
      gameCreation: 200,
      championId: null,
      win: null,
      kills: null,
      deaths: null,
      assists: null,
      rawSummaryJson: { matchId: 'HN1_repair', quality: 'incomplete' }
    })
    database.matches.upsertMatchRecord({
      region: 'HN1',
      matchId: 'HN1_repair',
      accountPuuid: 'test-puuid',
      queueId: 420,
      gameCreation: 200,
      championId: 99,
      win: false,
      kills: 3,
      deaths: 4,
      assists: 5,
      rawSummaryJson: { matchId: 'HN1_repair', quality: 'complete' }
    })

    const repairedRecords = database.matches.listMatchRecordsByAccount('test-puuid', { limit: 10 })
    const repairedRecord = repairedRecords.find((record) => record.matchId === 'HN1_repair')
    assert.equal(repairedRecord?.championId, 99)
    assert.equal(repairedRecord?.win, false)
    assert.equal(repairedRecord?.kills, 3)
    assert.equal(repairedRecord?.deaths, 4)
    assert.equal(repairedRecord?.assists, 5)
    assert.match(repairedRecord?.rawSummaryJson ?? '', /complete/)
  } finally {
    cleanup()
  }
})

test('match repository round-trips loadout and performance summary columns', () => {
  const { database, cleanup } = createTempLocalDatabase()

  try {
    database.matches.upsertMatchRecord({
      region: 'HN1',
      matchId: 'HN1_enhanced',
      accountPuuid: 'test-puuid',
      queueId: 420,
      gameCreation: 400,
      gameDuration: 1800,
      championId: 103,
      win: true,
      kills: 10,
      deaths: 2,
      assists: 8,
      goldEarned: 12345,
      totalDamageDealtToChampions: 30123,
      doubleKills: 2,
      tripleKills: 1,
      quadraKills: 0,
      pentaKills: 0,
      largestKillingSpree: 9,
      legendaryCount: 1,
      spell1Id: 4,
      spell2Id: 14,
      perk0: 8010,
      playerAugment1: 10001,
      playerAugment2: 10002,
      playerAugment3: 10003,
      playerAugment4: 10004,
      rawSummaryJson: { matchId: 'HN1_enhanced' }
    } as unknown as Parameters<typeof database.matches.upsertMatchRecord>[0])

    const records = database.matches.listMatchRecordsByAccount('test-puuid', { limit: 10 })
    const enhanced = records.find((record) => record.matchId === 'HN1_enhanced') as any

    assert.deepEqual({
      goldEarned: enhanced?.goldEarned,
      totalDamageDealtToChampions: enhanced?.totalDamageDealtToChampions,
      doubleKills: enhanced?.doubleKills,
      tripleKills: enhanced?.tripleKills,
      quadraKills: enhanced?.quadraKills,
      pentaKills: enhanced?.pentaKills,
      largestKillingSpree: enhanced?.largestKillingSpree,
      legendaryCount: enhanced?.legendaryCount,
      spell1Id: enhanced?.spell1Id,
      spell2Id: enhanced?.spell2Id,
      perk0: enhanced?.perk0,
      playerAugment1: enhanced?.playerAugment1,
      playerAugment2: enhanced?.playerAugment2,
      playerAugment3: enhanced?.playerAugment3,
      playerAugment4: enhanced?.playerAugment4
    }, {
      goldEarned: 12345,
      totalDamageDealtToChampions: 30123,
      doubleKills: 2,
      tripleKills: 1,
      quadraKills: 0,
      pentaKills: 0,
      largestKillingSpree: 9,
      legendaryCount: 1,
      spell1Id: 4,
      spell2Id: 14,
      perk0: 8010,
      playerAugment1: 10001,
      playerAugment2: 10002,
      playerAugment3: 10003,
      playerAugment4: 10004
    })
  } finally {
    cleanup()
  }
})

test('AI analysis repository saves results and queries by account, id, and input hash', () => {
  const { database, cleanup } = createTempLocalDatabase()

  try {
    const saved = database.aiAnalyses.saveAnalysisResult({
      accountPuuid: 'test-puuid',
      matchId: 'HN1_1',
      analysisType: 'match_summary',
      subjectKey: 'HN1_1:test-puuid',
      gameVersion: '16.8.1',
      modelName: 'rankpeek-test-model',
      promptVersion: 'v1',
      inputHash: 'hash-1',
      outputJson: { summary: 'Keep farming.' }
    })

    assert.equal(saved.accountPuuid, 'test-puuid')
    assert.equal(saved.analysisType, 'match_summary')
    assert.match(saved.outputJson, /Keep farming/)

    const byAccount = database.aiAnalyses.listAnalysisResultsByAccount('test-puuid', { limit: 10 })
    assert.equal(byAccount.length, 1)
    assert.equal(byAccount[0]?.id, saved.id)

    assert.equal(database.aiAnalyses.getAnalysisResultById(saved.id)?.inputHash, 'hash-1')
    assert.equal(database.aiAnalyses.findAnalysisByInputHash('hash-1')?.id, saved.id)
  } finally {
    cleanup()
  }
})

test('AI analysis repository stores postgame review and praise records with the same snapshot hash', () => {
  const { database, cleanup } = createTempLocalDatabase()

  try {
    const base = {
      accountPuuid: 'test-puuid',
      matchId: 'HN1_998877',
      gameVersion: null,
      modelName: 'deepseek-v4-flash',
      inputHash: 'postgame-snapshot-hash',
      outputJson: {
        schemaVersion: 'postgame_ai_run_output.v1',
        analysisType: 'postgame',
        rawOutputText: 'raw',
        completedAt: '2026-05-20T12:00:00.000Z',
        usage: null,
        costCny: null,
        streamState: 'completed',
        match: {
          matchId: 'HN1_998877',
          queueId: 420,
          championId: 64,
          championName: '盲僧',
          win: true,
          gameCreation: 1779278400000,
          gameDuration: 1888
        }
      }
    }

    database.aiAnalyses.saveAnalysisResult({
      ...base,
      analysisType: 'postgame_review',
      subjectKey: 'postgame:review',
      promptVersion: 'postgame_review_result.v1',
      outputJson: {
        ...base.outputJson,
        mode: 'review'
      }
    })
    database.aiAnalyses.saveAnalysisResult({
      ...base,
      analysisType: 'postgame_praise',
      subjectKey: 'postgame:praise',
      promptVersion: 'postgame_praise_result.v1',
      outputJson: {
        ...base.outputJson,
        mode: 'praise'
      }
    })

    const byAccount = database.aiAnalyses.listAnalysisResultsByAccount('test-puuid', { limit: 10 })
    assert.deepEqual(
      byAccount.map(result => result.analysisType).sort(),
      ['postgame_praise', 'postgame_review']
    )
    assert.equal(byAccount.filter(result => result.inputHash === 'postgame-snapshot-hash').length, 2)
  } finally {
    cleanup()
  }
})

test('AI analysis repository upserts repeated single-match analysis by account, match, and type', () => {
  const { database, cleanup } = createTempLocalDatabase()

  try {
    database.matches.upsertMatchRecord(makeMatchRecord(1, 'test-puuid'))
    const first = database.aiAnalyses.saveAnalysisResult({
      accountPuuid: 'test-puuid',
      matchId: 'HN1_test-puuid_1',
      analysisType: 'postgame_review',
      inputHash: 'hash-1',
      outputJson: { summary: 'First version.' }
    })
    const second = database.aiAnalyses.saveAnalysisResult({
      accountPuuid: 'test-puuid',
      matchId: 'HN1_test-puuid_1',
      analysisType: 'postgame_review',
      inputHash: 'hash-2',
      modelName: 'new-model',
      outputJson: { summary: 'Updated version.' }
    })

    assert.equal(second.id, first.id)
    assert.equal(countAiAnalysisResults(database, 'test-puuid'), 1)
    assert.equal(database.aiAnalyses.findAnalysisByInputHash('hash-1'), null)
    assert.equal(database.aiAnalyses.findAnalysisByInputHash('hash-2')?.id, first.id)
    assert.match(database.aiAnalyses.getAnalysisResultById(first.id)?.outputJson || '', /Updated version/)
    assert.equal(database.aiAnalyses.getAnalysisResultById(first.id)?.modelName, 'new-model')
  } finally {
    cleanup()
  }
})

test('AI analysis repository filters by batched match ids and analysis types', () => {
  const { database, cleanup } = createTempLocalDatabase()

  try {
    for (let index = 1; index <= 205; index += 1) {
      const matchId = `HN1_test-puuid_${index}`
      database.aiAnalyses.saveAnalysisResult({
        accountPuuid: 'test-puuid',
        matchId,
        analysisType: index % 2 === 0 ? 'postgame_review' : 'postgame_praise',
        inputHash: `hash-${index}`,
        outputJson: { summary: `Analysis ${index}` }
      })
    }

    const results = database.aiAnalyses.listAnalysisResultsByAccount('test-puuid', {
      limit: 250,
      matchIds: Array.from({ length: 205 }, (_item, index) => `HN1_test-puuid_${index + 1}`),
      analysisTypes: ['postgame_review']
    })

    assert.equal(results.length, 102)
    assert.ok(results.every(result => result.analysisType === 'postgame_review'))
  } finally {
    cleanup()
  }
})

test('AI analysis repository deletes account records by analysis types', () => {
  const { database, cleanup } = createTempLocalDatabase()

  try {
    database.aiAnalyses.saveAnalysisResult({
      accountPuuid: 'test-puuid',
      matchId: 'HN1_1',
      analysisType: 'postgame_review',
      inputHash: 'review-hash',
      outputJson: { summary: 'Review.' }
    })
    database.aiAnalyses.saveAnalysisResult({
      accountPuuid: 'test-puuid',
      matchId: 'HN1_2',
      analysisType: 'postgame_praise',
      inputHash: 'praise-hash',
      outputJson: { summary: 'Praise.' }
    })
    database.aiAnalyses.saveAnalysisResult({
      accountPuuid: 'test-puuid',
      analysisType: 'coach_summary',
      inputHash: 'coach-hash',
      outputJson: { summary: 'Coach.' }
    })
    database.aiAnalyses.saveAnalysisResult({
      accountPuuid: 'test-puuid',
      analysisType: 'match_summary',
      inputHash: 'match-hash',
      outputJson: { summary: 'Keep.' }
    })
    database.aiAnalyses.saveAnalysisResult({
      accountPuuid: 'other-puuid',
      analysisType: 'postgame_review',
      inputHash: 'other-hash',
      outputJson: { summary: 'Other account.' }
    })

    const typedDelete = database.aiAnalyses.deleteAnalysisResultsByAccount('test-puuid', {
      analysisTypes: ['postgame_review', 'postgame_praise', 'coach_summary']
    })
    assert.equal(typedDelete.deletedCount, 3)
    assert.deepEqual(
      database.aiAnalyses.listAnalysisResultsByAccount('test-puuid', { limit: 10 }).map(result => result.analysisType),
      ['match_summary']
    )
    assert.equal(database.aiAnalyses.listAnalysisResultsByAccount('other-puuid', { limit: 10 }).length, 1)

    const accountDelete = database.aiAnalyses.deleteAnalysisResultsByAccount('test-puuid')
    assert.equal(accountDelete.deletedCount, 1)
    assert.equal(database.aiAnalyses.getMemoryStats('test-puuid').totalCount, 0)
    assert.equal(database.aiAnalyses.getMemoryStats('other-puuid').totalCount, 1)
  } finally {
    cleanup()
  }
})

test('storage retention keeps the newest 200 match records per account', () => {
  const { database, cleanup } = createTempLocalDatabase()

  try {
    database.matches.upsertMatchRecords(
      Array.from({ length: 220 }, (_, index) => makeMatchRecord(index + 1, 'test-puuid'))
    )

    const result = database.runStorageRetention()

    assert.equal(result.matchRecordsDeleted, 20)
    assert.equal(result.matchRecordsRetained, 200)
    assert.equal(countMatchRecords(database, 'test-puuid'), 200)
    assert.equal(matchIdAtEdge(database, 'test-puuid', 'newest'), 'HN1_test-puuid_220')
    assert.equal(matchIdAtEdge(database, 'test-puuid', 'oldest'), 'HN1_test-puuid_21')
  } finally {
    cleanup()
  }
})

test('storage retention keeps 200 match records per account without global cross-account pruning', () => {
  const { database, cleanup } = createTempLocalDatabase()

  try {
    database.matches.upsertMatchRecords([
      ...Array.from({ length: 210 }, (_, index) => makeMatchRecord(index + 1, 'first-puuid')),
      ...Array.from({ length: 205 }, (_, index) => makeMatchRecord(index + 1, 'second-puuid'))
    ])

    const result = database.runStorageRetention()

    assert.equal(result.matchRecordsDeleted, 15)
    assert.equal(countMatchRecords(database, 'first-puuid'), 200)
    assert.equal(countMatchRecords(database, 'second-puuid'), 200)
  } finally {
    cleanup()
  }
})

test('storage retention deletes single-match AI and details when the parent match is pruned', () => {
  const { database, cleanup } = createTempLocalDatabase()

  try {
    database.matches.upsertMatchRecords(
      Array.from({ length: 201 }, (_, index) => makeMatchRecord(index + 1, 'test-puuid'))
    )
    database.matches.upsertMatchDetail({
      region: 'HN1',
      matchId: 'HN1_test-puuid_1',
      rawDetailJson: { matchId: 'HN1_test-puuid_1', prunedParent: true },
      normalizedDetailJson: { participants: [] }
    })
    database.matches.upsertMatchDetail({
      region: 'HN1',
      matchId: 'HN1_orphan_detail',
      rawDetailJson: { matchId: 'HN1_orphan_detail', orphan: true },
      normalizedDetailJson: { participants: [] }
    })
    database.aiAnalyses.saveAnalysisResult({
      accountPuuid: 'test-puuid',
      matchId: 'HN1_test-puuid_1',
      analysisType: 'postgame_review',
      inputHash: 'ai-memory-1',
      outputJson: { summary: 'Pruned with match.' }
    })

    const result = database.runStorageRetention()

    assert.equal(result.matchRecordsDeleted, 1)
    assert.equal(result.aiAnalysisDeleted, 1)
    assert.equal(result.matchDetailsDeleted, 2)
    assert.equal(database.matches.getMatchDetail('HN1', 'HN1_test-puuid_1'), null)
    assert.equal(database.matches.getMatchDetail('HN1', 'HN1_orphan_detail'), null)
    assert.equal(database.aiAnalyses.getMemoryStats('test-puuid').totalCount, 0)
  } finally {
    cleanup()
  }
})

test('storage retention deletes single-match AI records without a parent match and does not use a time cutoff', () => {
  const { database, cleanup } = createTempLocalDatabase()

  try {
    database.matches.upsertMatchRecord(makeMatchRecord(1, 'test-puuid'))
    database.aiAnalyses.saveAnalysisResult({
      accountPuuid: 'test-puuid',
      matchId: 'HN1_missing',
      analysisType: 'postgame_review',
      inputHash: 'orphan-hash',
      outputJson: { summary: 'Orphan AI report.' }
    })
    database.aiAnalyses.saveAnalysisResult({
      accountPuuid: 'test-puuid',
      matchId: 'HN1_test-puuid_1',
      analysisType: 'postgame_review',
      inputHash: 'recent-hash',
      outputJson: { summary: 'Old but still linked AI report.' }
    })

    const oldCreatedAt = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
    database.connection
      .prepare('UPDATE ai_analysis_results SET created_at = @createdAt, updated_at = @createdAt WHERE input_hash = @inputHash')
      .run({ createdAt: oldCreatedAt, inputHash: 'recent-hash' })

    const result = database.runStorageRetention()

    assert.equal(result.aiAnalysisDeleted, 1)
    assert.equal(countAiAnalysisResults(database, 'test-puuid'), 1)
    assert.equal(database.aiAnalyses.findAnalysisByInputHash('orphan-hash'), null)
    assert.equal(database.aiAnalyses.findAnalysisByInputHash('recent-hash')?.inputHash, 'recent-hash')
  } finally {
    cleanup()
  }
})

test('storage health stats report database size and record distribution', () => {
  const { database, databasePath, cleanup } = createTempLocalDatabase()

  try {
    database.accounts.upsertAccount({
      region: 'HN1',
      puuid: 'test-puuid',
      displayName: 'RankPeek#0001'
    })
    database.matches.upsertMatchRecord(makeMatchRecord(1, 'test-puuid'))
    database.matches.upsertMatchDetail({
      region: 'HN1',
      matchId: 'HN1_test-puuid_1',
      rawDetailJson: { detail: 'x'.repeat(100) },
      normalizedDetailJson: { normalized: true }
    })
    database.aiAnalyses.saveAnalysisResult({
      accountPuuid: 'test-puuid',
      matchId: 'HN1_test-puuid_1',
      analysisType: 'postgame_review',
      inputHash: 'health-hash',
      outputJson: { summary: 'Health check.' }
    })

    const stats = database.getStorageHealthStats()

    assert.equal(stats.databasePath, databasePath)
    assert.equal(stats.fileBytes, statSync(databasePath).size)
    assert.equal(stats.accountCount, 1)
    assert.equal(stats.matchRecordCount, 1)
    assert.equal(stats.matchDetailCount, 1)
    assert.equal(stats.aiAnalysisCount, 1)
    assert.equal(stats.orphanSingleMatchAiCount, 0)
    assert.equal(stats.maxMatchesPerAccount[0]?.matchCount, 1)
    assert.ok((stats.matchSummaryJsonAvgBytes ?? 0) > 0)
    assert.ok((stats.matchDetailJsonMaxBytes ?? 0) > 0)
  } finally {
    cleanup()
  }
})

test('AI memory stats and export payload include all account analysis records', () => {
  const { database, cleanup } = createTempLocalDatabase()

  try {
    database.aiAnalyses.saveAnalysisResult({
      accountPuuid: 'test-puuid',
      matchId: 'HN1_1',
      analysisType: 'match_summary',
      inputHash: 'hash-1',
      outputJson: { summary: 'First.' }
    })
    database.aiAnalyses.saveAnalysisResult({
      accountPuuid: 'test-puuid',
      matchId: 'HN1_2',
      analysisType: 'match_summary',
      inputHash: 'hash-2',
      outputJson: { summary: 'Second.' }
    })
    database.aiAnalyses.saveAnalysisResult({
      accountPuuid: 'test-puuid',
      analysisType: 'coach_summary',
      inputHash: 'hash-3',
      outputJson: { summary: 'Long-term trend.' }
    })
    database.aiAnalyses.saveAnalysisResult({
      accountPuuid: 'other-puuid',
      analysisType: 'match_summary',
      outputJson: { summary: 'Other account.' }
    })

    const stats = database.aiAnalyses.getMemoryStats('test-puuid')
    const exportPayload = database.aiAnalyses.exportMemory('test-puuid')

    assert.equal(stats.totalCount, 3)
    assert.equal(stats.linkedMatchCount, 2)
    assert.deepEqual(stats.analysisTypeCounts, [
      { analysisType: 'match_summary', count: 2 },
      { analysisType: 'coach_summary', count: 1 }
    ])
    assert.equal(exportPayload.accountPuuid, 'test-puuid')
    assert.equal(exportPayload.stats.totalCount, 3)
    assert.deepEqual(
      exportPayload.records.map((record) => record.inputHash),
      ['hash-3', 'hash-2', 'hash-1']
    )
  } finally {
    cleanup()
  }
})
