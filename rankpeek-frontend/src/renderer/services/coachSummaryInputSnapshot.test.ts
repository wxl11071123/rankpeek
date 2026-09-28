import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type {
  AiAnalysisResult,
  LocalDatabaseAPI,
  MatchDetail,
  MatchDetailInput,
  MatchRecord
} from '../types/localDatabase.ts'
import {
  COACH_SUMMARY_SGP_HYDRATION_DELAY_MS,
  COACH_SUMMARY_REQUIRED_RANKED_MATCHES,
  auditCoachSummarySnapshot,
  buildCoachSummaryReportCardTitle,
  buildCoachSummaryReportOverview,
  buildCoachSummaryInputHash,
  validateCoachSummarySnapshotIntegrity,
  type CoachSummarySgpHydrationClient,
  prepareCoachSummaryGeneration
} from './coachSummaryInputSnapshot.ts'

type CoachSummaryTestDatabase = Pick<
  LocalDatabaseAPI,
  'listMatchRecordsByAccount' | 'getMatchDetail' | 'listAnalysisResultsByAccount' | 'upsertMatchDetail'
>

const ACCOUNT_PUUID = 'account-puuid'
const ENEMY_PUUID = 'enemy-puuid'
const BASE_TIME = 1_800_000_000_000

function makeRecord(index: number, overrides: Partial<MatchRecord> = {}): MatchRecord {
  const matchId = overrides.matchId ?? `match-${index}`
  const queueId = overrides.queueId ?? 420
  const gameCreation = overrides.gameCreation ?? BASE_TIME - index * 3_600_000

  return {
    id: index,
    region: 'HN1',
    matchId,
    accountPuuid: ACCOUNT_PUUID,
    queueId,
    queueName: queueId === 440 ? 'Ranked Flex' : queueId === 420 ? 'Ranked Solo' : 'ARAM',
    gameMode: queueId === 450 ? 'ARAM' : 'CLASSIC',
    gameVersion: '15.8',
    gameCreation,
    gameDuration: 1800,
    championId: 103,
    spell1Id: 4,
    spell2Id: 14,
    win: index % 2 === 0,
    kills: 6,
    deaths: 3,
    assists: 8,
    goldEarned: 12_000,
    totalDamageDealtToChampions: 24_000,
    doubleKills: 1,
    tripleKills: 0,
    quadraKills: 0,
    pentaKills: 0,
    largestKillingSpree: 3,
    legendaryCount: 0,
    perk0: 8010,
    playerAugment1: null,
    playerAugment2: null,
    playerAugment3: null,
    playerAugment4: null,
    lane: 'MIDDLE',
    role: 'SOLO',
    rawSummaryJson: JSON.stringify({
      gameId: matchId,
      platformId: 'HN1',
      queueId,
      gameCreation,
      gameStartTimestamp: gameCreation + 120_000,
      gameEndTimestamp: gameCreation + 1_920_000,
      gameDuration: 1800,
      participants: baseParticipants(),
      participantIdentities: baseIdentities()
    }),
    fetchedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

function makeDetail(
  matchId: string,
  options: {
    includeTimeline?: boolean
    includeOpponent?: boolean
    opponentPosition?: string
    stripSelfRunesAndItems?: boolean
    source?: string
  } = {}
): MatchDetail {
  const includeTimeline = options.includeTimeline ?? true
  const includeOpponent = options.includeOpponent ?? true
  const participants = (includeOpponent
    ? baseParticipants(options.opponentPosition ?? 'MIDDLE')
    : baseParticipants().filter(participant => participant.participantId !== 6))
    .map(participant => options.stripSelfRunesAndItems && participant.participantId === 1
      ? stripSelfRunesAndItems(participant)
      : participant)

  return {
    id: 1,
    region: 'HN1',
    matchId,
    rawDetailJson: JSON.stringify({
      gameId: matchId,
      gameMode: 'CLASSIC',
      gameType: 'MATCHED_GAME',
      mapId: 11,
      queueId: 420,
      gameDuration: 1800,
      gameCreation: BASE_TIME,
      participantIdentities: baseIdentities(),
      participants,
      ...(includeTimeline ? { timeline: makeTimeline() } : {})
    }),
    normalizedDetailJson: null,
    source: options.source ?? 'sgp',
    schemaVersion: 1,
    fetchedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

function makeDetailWithSelfDeathTimestamp(matchId: string, deathTimestamp: number): MatchDetail {
  const detail = makeDetail(matchId)
  const raw = JSON.parse(detail.rawDetailJson)
  raw.timeline.frames[0].events[1].timestamp = deathTimestamp
  return {
    ...detail,
    rawDetailJson: JSON.stringify(raw)
  }
}

function makeDetailWithSelfWin(matchId: string, win: boolean): MatchDetail {
  const detail = makeDetail(matchId)
  const raw = JSON.parse(detail.rawDetailJson)
  raw.participants = raw.participants.map((participant: { teamId?: number; stats?: { win?: boolean } }) => ({
    ...participant,
    stats: {
      ...participant.stats,
      win: participant.teamId === 100 ? win : !win
    }
  }))
  return {
    ...detail,
    rawDetailJson: JSON.stringify(raw)
  }
}

function makeRecordWithSelfWin(index: number, win: boolean): MatchRecord {
  const record = makeRecord(index, { win })
  const raw = JSON.parse(record.rawSummaryJson)
  raw.participants = raw.participants.map((participant: { teamId?: number; stats?: { win?: boolean } }) => ({
    ...participant,
    stats: {
      ...participant.stats,
      win: participant.teamId === 100 ? win : !win
    }
  }))
  return {
    ...record,
    rawSummaryJson: JSON.stringify(raw)
  }
}

function makeRiotV5Detail(matchId: string): MatchDetail {
  return {
    id: 1,
    region: 'HN1',
    matchId,
    rawDetailJson: JSON.stringify({
      metadata: {
        matchId
      },
      info: {
        gameId: matchId,
        gameMode: 'CLASSIC',
        gameType: 'MATCHED_GAME',
        mapId: 11,
        queueId: 420,
        gameCreation: BASE_TIME,
        gameStartTimestamp: BASE_TIME + 120_000,
        gameEndTimestamp: BASE_TIME + 1_920_000,
        gameDuration: 1800,
        participants: [
          {
            puuid: ACCOUNT_PUUID,
            participantId: 1,
            teamId: 100,
            championId: 103,
            championName: 'Ahri',
            summoner1Id: 4,
            summoner2Id: 14,
            teamPosition: 'MIDDLE',
            individualPosition: 'MIDDLE',
            win: true,
            kills: 8,
            deaths: 2,
            assists: 9,
            goldEarned: 13_200,
            totalMinionsKilled: 220,
            neutralMinionsKilled: 8,
            totalDamageDealtToChampions: 28_000,
            visionScore: 31,
            item0: 6655,
            item1: 3020,
            item2: 3089,
            item3: 3157,
            item4: 4645,
            item5: 3135,
            item6: 3364,
            perks: {
              styles: [
                {
                  style: 8200,
                  selections: [
                    { perk: 8214 },
                    { perk: 8226 },
                    { perk: 8210 },
                    { perk: 8237 }
                  ]
                },
                {
                  style: 8000,
                  selections: [
                    { perk: 8009 },
                    { perk: 8014 }
                  ]
                }
              ]
            }
          },
          {
            puuid: 'ally-puuid',
            participantId: 2,
            teamId: 100,
            championId: 64,
            championName: 'LeeSin',
            summoner1Id: 4,
            summoner2Id: 11,
            teamPosition: 'JUNGLE',
            win: true,
            kills: 2,
            deaths: 2,
            assists: 7,
            goldEarned: 10_000,
            totalDamageDealtToChampions: 12_000
          },
          {
            puuid: ENEMY_PUUID,
            participantId: 6,
            teamId: 200,
            championId: 134,
            championName: 'Syndra',
            summoner1Id: 4,
            summoner2Id: 12,
            teamPosition: 'MIDDLE',
            individualPosition: 'MIDDLE',
            win: false,
            kills: 4,
            deaths: 4,
            assists: 5,
            goldEarned: 10_500,
            totalMinionsKilled: 190,
            neutralMinionsKilled: 4,
            totalDamageDealtToChampions: 22_000
          },
          {
            puuid: 'enemy-jungle-puuid',
            participantId: 7,
            teamId: 200,
            championId: 76,
            championName: 'Nidalee',
            summoner1Id: 4,
            summoner2Id: 11,
            teamPosition: 'JUNGLE',
            win: false,
            kills: 3,
            deaths: 5,
            assists: 6,
            goldEarned: 9_000,
            totalDamageDealtToChampions: 11_000
          }
        ]
      },
      timeline: makeTimeline()
    }),
    normalizedDetailJson: null,
    source: 'sgp',
    schemaVersion: 1,
    fetchedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

function stripSelfRunesAndItems(participant: ReturnType<typeof baseParticipants>[number]) {
  const stats = { ...participant.stats }
  for (const key of ['item0', 'item1', 'item2', 'item3', 'item4', 'item5', 'item6', 'perk0', 'perk1', 'perk2', 'perk3', 'perk4', 'perk5', 'perkPrimaryStyle', 'perkSubStyle'] as const) {
    delete stats[key]
  }
  return {
    ...participant,
    stats
  }
}

function baseIdentities() {
  return [
    {
      participantId: 1,
      player: {
        puuid: ACCOUNT_PUUID,
        gameName: 'Self',
        tagLine: 'CN1',
        summonerName: 'Self',
        platformId: 'HN1'
      }
    },
    {
      participantId: 6,
      player: {
        puuid: ENEMY_PUUID,
        gameName: 'Enemy',
        tagLine: 'CN1',
        summonerName: 'Enemy',
        platformId: 'HN1'
      }
    }
  ]
}

function baseParticipants(opponentPosition = 'MIDDLE') {
  return [
    {
      participantId: 1,
      teamId: 100,
      championId: 103,
      championName: 'Ahri',
      spell1Id: 4,
      spell2Id: 14,
      teamPosition: 'MIDDLE',
      individualPosition: 'MIDDLE',
      stats: {
        win: true,
        kills: 6,
        deaths: 3,
        assists: 8,
        goldEarned: 12_000,
        totalMinionsKilled: 210,
        neutralMinionsKilled: 12,
        totalDamageDealtToChampions: 24_000,
        visionScore: 25,
        item0: 6655,
        item1: 3020,
        item2: 0,
        item3: 3089,
        item4: 3157,
        item5: 4645,
        item6: 3364,
        perk0: 8214,
        perk1: 8226,
        perk2: 8210,
        perk3: 8237,
        perk4: 8009,
        perk5: 8014,
        perkPrimaryStyle: 8200,
        perkSubStyle: 8000
      },
      timeline: {
        lane: 'MIDDLE',
        role: 'SOLO',
        teamPosition: 'MIDDLE'
      }
    },
    {
      participantId: 3,
      teamId: 100,
      championId: 59,
      championName: 'JarvanIV',
      spell1Id: 4,
      spell2Id: 12,
      teamPosition: 'TOP',
      individualPosition: 'TOP',
      stats: {
        win: true,
        kills: 3,
        deaths: 3,
        assists: 6,
        goldEarned: 10_800,
        totalMinionsKilled: 185,
        neutralMinionsKilled: 4,
        totalDamageDealtToChampions: 16_000
      },
      timeline: {
        lane: 'TOP',
        role: 'SOLO',
        teamPosition: 'TOP'
      }
    },
    {
      participantId: 2,
      teamId: 100,
      championId: 64,
      championName: 'LeeSin',
      spell1Id: 4,
      spell2Id: 11,
      teamPosition: 'JUNGLE',
      stats: {
        win: true,
        kills: 2,
        deaths: 2,
        assists: 7,
        goldEarned: 10_000,
        totalDamageDealtToChampions: 12_000
      },
      timeline: {
        lane: 'JUNGLE',
        role: 'NONE',
        teamPosition: 'JUNGLE'
      }
    },
    {
      participantId: 4,
      teamId: 100,
      championId: 22,
      championName: 'Ashe',
      spell1Id: 4,
      spell2Id: 7,
      teamPosition: 'BOTTOM',
      individualPosition: 'BOTTOM',
      stats: {
        win: true,
        kills: 5,
        deaths: 2,
        assists: 9,
        goldEarned: 11_600,
        totalMinionsKilled: 205,
        neutralMinionsKilled: 0,
        totalDamageDealtToChampions: 21_000
      },
      timeline: {
        lane: 'BOTTOM',
        role: 'CARRY',
        teamPosition: 'BOTTOM'
      }
    },
    {
      participantId: 5,
      teamId: 100,
      championId: 89,
      championName: 'Leona',
      spell1Id: 4,
      spell2Id: 14,
      teamPosition: 'UTILITY',
      individualPosition: 'UTILITY',
      stats: {
        win: true,
        kills: 1,
        deaths: 4,
        assists: 12,
        goldEarned: 7_600,
        totalMinionsKilled: 34,
        neutralMinionsKilled: 0,
        totalDamageDealtToChampions: 7_500,
        visionScore: 48
      },
      timeline: {
        lane: 'BOTTOM',
        role: 'SUPPORT',
        teamPosition: 'UTILITY'
      }
    },
    {
      participantId: 6,
      teamId: 200,
      championId: 134,
      championName: 'Syndra',
      spell1Id: 4,
      spell2Id: 12,
      teamPosition: opponentPosition,
      individualPosition: opponentPosition,
      stats: {
        win: false,
        kills: 4,
        deaths: 4,
        assists: 5,
        goldEarned: 10_500,
        totalMinionsKilled: 190,
        neutralMinionsKilled: 4,
        totalDamageDealtToChampions: 22_000
      },
      timeline: {
        lane: opponentPosition,
        role: 'SOLO',
        teamPosition: opponentPosition
      }
    },
    {
      participantId: 8,
      teamId: 200,
      championId: 122,
      championName: 'Darius',
      spell1Id: 4,
      spell2Id: 6,
      teamPosition: 'TOP',
      individualPosition: 'TOP',
      stats: {
        win: false,
        kills: 2,
        deaths: 4,
        assists: 3,
        goldEarned: 9_600,
        totalMinionsKilled: 168,
        neutralMinionsKilled: 2,
        totalDamageDealtToChampions: 14_000
      },
      timeline: {
        lane: 'TOP',
        role: 'SOLO',
        teamPosition: 'TOP'
      }
    },
    {
      participantId: 9,
      teamId: 200,
      championId: 51,
      championName: 'Caitlyn',
      spell1Id: 4,
      spell2Id: 7,
      teamPosition: 'BOTTOM',
      individualPosition: 'BOTTOM',
      stats: {
        win: false,
        kills: 3,
        deaths: 3,
        assists: 5,
        goldEarned: 10_400,
        totalMinionsKilled: 198,
        neutralMinionsKilled: 0,
        totalDamageDealtToChampions: 18_000
      },
      timeline: {
        lane: 'BOTTOM',
        role: 'CARRY',
        teamPosition: 'BOTTOM'
      }
    },
    {
      participantId: 10,
      teamId: 200,
      championId: 117,
      championName: 'Lulu',
      spell1Id: 4,
      spell2Id: 3,
      teamPosition: 'UTILITY',
      individualPosition: 'UTILITY',
      stats: {
        win: false,
        kills: 0,
        deaths: 5,
        assists: 9,
        goldEarned: 7_000,
        totalMinionsKilled: 25,
        neutralMinionsKilled: 0,
        totalDamageDealtToChampions: 6_000,
        visionScore: 42
      },
      timeline: {
        lane: 'BOTTOM',
        role: 'SUPPORT',
        teamPosition: 'UTILITY'
      }
    },
    {
      participantId: 7,
      teamId: 200,
      championId: 76,
      championName: 'Nidalee',
      spell1Id: 4,
      spell2Id: 11,
      teamPosition: 'JUNGLE',
      stats: {
        win: false,
        kills: 3,
        deaths: 5,
        assists: 6,
        goldEarned: 9_000,
        totalDamageDealtToChampions: 11_000
      },
      timeline: {
        lane: 'JUNGLE',
        role: 'NONE',
        teamPosition: 'JUNGLE'
      }
    }
  ]
}

function makeTimeline() {
  return {
    frames: [10, 15, 20].map(minute => ({
      timestamp: minute * 60_000,
      participantFrames: {
        1: {
          participantId: 1,
          totalGold: 3000 + minute * 120,
          minionsKilled: 60 + minute * 5,
          jungleMinionsKilled: 2,
          xp: 4000 + minute * 220
        },
        2: {
          participantId: 2,
          totalGold: 2800 + minute * 100,
          minionsKilled: 10,
          jungleMinionsKilled: 48,
          xp: 3800 + minute * 180
        },
        3: {
          participantId: 3,
          totalGold: 2850 + minute * 105,
          minionsKilled: 50 + minute * 4,
          jungleMinionsKilled: 2,
          xp: 3700 + minute * 190
        },
        4: {
          participantId: 4,
          totalGold: 2950 + minute * 112,
          minionsKilled: 58 + minute * 5,
          jungleMinionsKilled: 0,
          xp: 3600 + minute * 185
        },
        5: {
          participantId: 5,
          totalGold: 2000 + minute * 72,
          minionsKilled: 8 + minute,
          jungleMinionsKilled: 0,
          xp: 3000 + minute * 165
        },
        6: {
          participantId: 6,
          totalGold: 2800 + minute * 110,
          minionsKilled: 55 + minute * 5,
          jungleMinionsKilled: 0,
          xp: 3900 + minute * 210
        },
        7: {
          participantId: 7,
          totalGold: 2700 + minute * 95,
          minionsKilled: 12,
          jungleMinionsKilled: 46,
          xp: 3600 + minute * 175
        },
        8: {
          participantId: 8,
          totalGold: 2700 + minute * 98,
          minionsKilled: 48 + minute * 4,
          jungleMinionsKilled: 1,
          xp: 3600 + minute * 180
        },
        9: {
          participantId: 9,
          totalGold: 2850 + minute * 100,
          minionsKilled: 56 + minute * 5,
          jungleMinionsKilled: 0,
          xp: 3500 + minute * 178
        },
        10: {
          participantId: 10,
          totalGold: 1900 + minute * 68,
          minionsKilled: 7 + minute,
          jungleMinionsKilled: 0,
          xp: 2900 + minute * 160
        }
      },
      events: minute === 10
        ? [
            {
              eventType: 'CHAMPION_KILL',
              timestamp: 630_000,
              killerId: 1,
              victimId: 6,
              assistingParticipantIds: [2],
              position: { x: 7500, y: 7300 }
            },
            {
              eventType: 'CHAMPION_KILL',
              timestamp: 660_000,
              killerId: 7,
              victimId: 1,
              assistingParticipantIds: [6],
              position: { x: 7600, y: 7400 }
            },
            {
              eventType: 'ELITE_MONSTER_KILL',
              timestamp: 720_000,
              killerId: 2,
              monsterType: 'DRAGON'
            },
            {
              eventType: 'BUILDING_KILL',
              timestamp: 780_000,
              killerId: 1,
              buildingType: 'TOWER_BUILDING',
              laneType: 'MID_LANE'
            }
          ]
        : []
    }))
  }
}

function makeAnalysisResult(overrides: Partial<AiAnalysisResult> = {}): AiAnalysisResult {
  return {
    id: 1,
    accountPuuid: ACCOUNT_PUUID,
    matchId: null,
    analysisType: 'coach_summary',
    subjectKey: null,
    gameVersion: null,
    modelName: null,
    promptVersion: null,
    inputHash: 'previous-hash',
    outputJson: JSON.stringify({
      metadata: {
        generatedInputAt: '2026-01-01T00:00:00.000Z',
        anchorMatchIds: Array.from({ length: 20 }, (_item, index) => `match-${index + 6}`),
        latestMatchTimestamp: BASE_TIME - 6 * 3_600_000 + 1_920_000
      }
    }),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

function makeDatabase(
  records: MatchRecord[],
  details: MatchDetail[] = records.map(record => makeDetail(record.matchId)),
  analyses: AiAnalysisResult[] = []
): CoachSummaryTestDatabase {
  return makeMutableDatabase(records, details, analyses).database
}

function makeMutableDatabase(
  records: MatchRecord[],
  details: MatchDetail[] = records.map(record => makeDetail(record.matchId)),
  analyses: AiAnalysisResult[] = []
): {
  database: CoachSummaryTestDatabase
  details: MatchDetail[]
  upsertedDetails: MatchDetailInput[]
} {
  const storedDetails = [...details]
  const upsertedDetails: MatchDetailInput[] = []

  return {
    database: {
      listMatchRecordsByAccount: async (_accountPuuid, options) => ({
        success: true,
        data: records
          .filter(record => options?.queueId == null || record.queueId === options.queueId)
          .sort((left, right) => (right.gameCreation ?? 0) - (left.gameCreation ?? 0))
          .slice(options?.offset ?? 0, (options?.offset ?? 0) + (options?.limit ?? records.length))
      }),
      getMatchDetail: async (region, matchId) => ({
        success: true,
        data: storedDetails.find(detail => detail.region === region && detail.matchId === matchId) ?? null
      }),
      upsertMatchDetail: async (input) => {
        upsertedDetails.push(input)
        const existingIndex = storedDetails.findIndex(detail => detail.region === input.region && detail.matchId === input.matchId)
        const stored: MatchDetail = {
          id: existingIndex >= 0 ? storedDetails[existingIndex].id : storedDetails.length + 1,
          region: input.region,
          matchId: input.matchId,
          rawDetailJson: toStoredJson(input.rawDetailJson),
          normalizedDetailJson: input.normalizedDetailJson === undefined || input.normalizedDetailJson === null
            ? null
            : toStoredJson(input.normalizedDetailJson),
          source: input.source ?? null,
          schemaVersion: input.schemaVersion ?? 1,
          fetchedAt: input.fetchedAt ?? '2026-01-01T00:00:00.000Z',
          updatedAt: input.updatedAt ?? '2026-01-01T00:00:00.000Z'
        }
        if (existingIndex >= 0) {
          storedDetails[existingIndex] = stored
        } else {
          storedDetails.push(stored)
        }
        return {
          success: true,
          data: stored
        }
      },
      listAnalysisResultsByAccount: async (_accountPuuid, options) => ({
        success: true,
        data: analyses
          .filter(result => options?.analysisType == null || result.analysisType === options.analysisType)
          .slice(options?.offset ?? 0, (options?.offset ?? 0) + (options?.limit ?? analyses.length))
      })
    },
    details: storedDetails,
    upsertedDetails
  }
}

function toStoredJson(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function makeNumericRecords(count = 20): MatchRecord[] {
  return Array.from({ length: count }, (_item, index) => (
    makeRecord(index + 1, { matchId: String(10_000 + index + 1) })
  ))
}

function makeSgpClient(
  options: {
    detail?: (gameId: number) => Promise<unknown> | unknown
    timeline?: (gameId: number) => Promise<unknown> | unknown
  } = {}
): CoachSummarySgpHydrationClient & {
  detailCalls: number[]
  timelineCalls: number[]
  maxConcurrentCalls: () => number
} {
  const detailCalls: number[] = []
  const timelineCalls: number[] = []
  let activeCalls = 0
  let maxConcurrent = 0
  const track = async <T>(operation: () => Promise<T> | T): Promise<T> => {
    activeCalls += 1
    maxConcurrent = Math.max(maxConcurrent, activeCalls)
    try {
      return await operation()
    } finally {
      activeCalls -= 1
    }
  }

  return {
    detailCalls,
    timelineCalls,
    maxConcurrentCalls: () => maxConcurrent,
    fetchGameDetailFromSgpOnly: async (gameId: number) => {
      detailCalls.push(gameId)
      return track(async () => (
        options.detail
          ? await options.detail(gameId)
          : makeFetchedGameDetail(gameId)
      ))
    },
    fetchGameTimelineFromSgpOnly: async (gameId: number) => {
      timelineCalls.push(gameId)
      return track(async () => (
        options.timeline
          ? await options.timeline(gameId)
          : makeFetchedTimeline(gameId)
      ))
    }
  }
}

function makeFetchedGameDetail(gameId: number): unknown {
  const parsed = JSON.parse(makeDetail(String(gameId), { includeTimeline: false }).rawDetailJson) as Record<string, unknown>
  return {
    ...parsed,
    gameId
  }
}

function makeFetchedTimeline(gameId: number): unknown {
  return {
    gameId,
    status: 'FETCHED',
    timeline: makeTimeline(),
    rawTimelineJson: JSON.stringify(makeTimeline())
  }
}

test('returns insufficient_ranked_matches when fewer than 20 ranked matches are cached', async () => {
  const records = Array.from({ length: 19 }, (_item, index) => makeRecord(index + 1))
  const sgpClient = makeSgpClient()

  const result = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: makeDatabase(records),
    sgpHydrationClient: sgpClient
  })

  assert.equal(result.status, 'insufficient_ranked_matches')
  assert.equal(result.message, '最近排位不足 20 局，暂时无法生成电子教练报告。')
  assert.equal(result.currentRankedMatchCount, 19)
  assert.equal(result.requiredRankedMatchCount, COACH_SUMMARY_REQUIRED_RANKED_MATCHES)
  assert.equal(sgpClient.detailCalls.length, 0)
  assert.equal(sgpClient.timelineCalls.length, 0)
})

test('returns ready when exactly 20 ranked solo or flex matches are cached', async () => {
  const records = Array.from({ length: 20 }, (_item, index) =>
    makeRecord(index + 1, { queueId: index % 2 === 0 ? 420 : 440 })
  )

  const result = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: makeDatabase(records, records.map(record => makeDetailWithSelfWin(record.matchId, record.win)))
  })

  assert.equal(result.status, 'ready')
  assert.equal(result.snapshot.eligibility.rankedMatchCount, 20)
  assert.equal(result.snapshot.sample.matchCount, 20)
  assert.deepEqual(result.snapshot.sample.queues, [
    { queueId: 420, count: 10 },
    { queueId: 440, count: 10 }
  ])
  assert.equal(result.snapshot.matches.length, 20)
  assert.equal(result.snapshot.metadata.matchRefs.length, 20)
  assert.equal(result.snapshot.metadata.anchorMatchRefs.length, 20)
  assert.equal(result.snapshot.matches[0]?.laneDiff?.goldDiffAt10, 300)
  assert.equal(result.snapshot.matches[0]?.laneDiff?.csDiffAt10, 7)
  assert.equal(result.snapshot.matches[0]?.laneDiff?.xpDiffAt10, 200)
  assert.equal(typeof result.snapshot.matches[0]?.self.rpIndex?.finalScore, 'number')
  assert.match(result.snapshot.inputHash, /^[a-f0-9]{8,}$/)

  const brief = (result.snapshot as typeof result.snapshot & {
    analysisBrief?: {
      schemaVersion: string
      language: string
      text: string
      overviewFacts: string[]
      trendFacts: string[]
      championFacts: string[]
      roleFacts: string[]
      matchFacts: string[]
      dataQualityFacts: string[]
    }
  }).analysisBrief
  assert.equal(brief?.schemaVersion, 'coach_summary_analysis_brief.v1')
  assert.equal(brief?.language, 'zh-CN')
  assert.match(brief?.text ?? '', /20局总览/)
  assert.doesNotMatch(brief?.text ?? '', /^整体状态：/m)
  assert.match(brief?.overviewFacts.join('\n') ?? '', /20局总览：20局\d+胜\d+负/)
  assert.match(brief?.overviewFacts.join('\n') ?? '', /平均RP\d+\.\d/)
  assert.match(brief?.overviewFacts.join('\n') ?? '', /15分钟对位经济平均/)
  assert.match(brief?.overviewFacts.join('\n') ?? '', /参团率/)
  assert.match(brief?.trendFacts.join('\n') ?? '', /RP终局序列：m01/)
  assert.doesNotMatch(brief?.text ?? '', /最近5局|平均KDA|10分钟对位经济|15分钟团队经济|资源前|参与样本资源事件|数据质量/)
  assert.equal(brief?.matchFacts.length, 20)
  assert.match(brief?.matchFacts[0] ?? '', /^m01 /)
  assert.match(brief?.matchFacts[0] ?? '', /K\/D\/A 6\/3\/8/)
  assert.match(brief?.matchFacts[0] ?? '', /RP标签/)
  assert.match(brief?.matchFacts[0] ?? '', /RP终局\d+\.\d/)
  assert.match(brief?.matchFacts[0] ?? '', /参团率/)
  assert.match(brief?.matchFacts[0] ?? '', /伤害占比/)
  assert.match(brief?.matchFacts[0] ?? '', /视野25/)
  assert.match(brief?.matchFacts[0] ?? '', /补刀\d+\.\d\/分/)
  assert.match(brief?.matchFacts[0] ?? '', /伤转率\d+\.\d%/)
  assert.match(brief?.matchFacts[0] ?? '', /15分钟对位经济\+/)
  assert.match(brief?.championFacts.join('\n') ?? '', /英雄池：/)
  assert.match(brief?.championFacts.join('\n') ?? '', /平均RP/)
  assert.match(brief?.championFacts.join('\n') ?? '', /伤转率/)
  assert.match(brief?.roleFacts.join('\n') ?? '', /位置：/)
  assert.match(brief?.roleFacts.join('\n') ?? '', /平均RP/)
  assert.match(brief?.roleFacts.join('\n') ?? '', /伤转率/)
  assert.deepEqual(brief?.dataQualityFacts, [])
})

test('coach_summary keeps resource death signals out of the DS analysis brief', async () => {
  const records = Array.from({ length: 20 }, (_item, index) => makeRecord(index + 1))
  const details = records.map((record, index) =>
    index === 0
      ? makeDetailWithSelfDeathTimestamp(record.matchId, 650_000)
      : makeDetail(record.matchId)
  )

  const result = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: makeDatabase(records, details)
  })

  assert.equal(result.status, 'ready')
  assert.equal(result.snapshot.matches[0]?.events.deaths[0]?.nearestUpcomingObjective, undefined)
  assert.doesNotMatch(result.snapshot.analysisBrief.text, /资源前|资源事件|60秒|120秒/)
})

test('coach_summary deterministic overview marks 12 wins in 20 games as a good recent state', async () => {
  const records = Array.from({ length: 20 }, (_item, index) =>
    makeRecordWithSelfWin(index + 1, index < 12)
  )

  const result = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: makeDatabase(records, records.map(record => makeDetailWithSelfWin(record.matchId, record.win)))
  })

  assert.equal(result.status, 'ready')
  assert.equal('overallState' in result.snapshot.analysisBrief, false)

  const overview = buildCoachSummaryReportOverview(result.snapshot)
  assert.equal(overview.totalMatches, 20)
  assert.equal(overview.wins, 12)
  assert.equal(overview.losses, 8)
  assert.equal(overview.winRate, 60)
  assert.equal(overview.rpTrend?.length, 20)
  assert.equal(overview.rpTrend?.[0]?.matchRef, 'm20')
  assert.equal(overview.rpTrend?.[19]?.matchRef, 'm01')
  assert.equal(typeof overview.rpTrend?.[19]?.score, 'number')
  assert.equal(typeof overview.rpTrend?.[19]?.championId, 'number')
  assert.match(overview.rpTrend?.[19]?.kdaText ?? '', /^\d+\/\d+\/\d+/)
  assert.equal(overview.summary, '')
  assert.equal('overallState' in overview, false)
  assert.equal('overallStateLabel' in overview, false)
  assert.doesNotMatch(overview.summary, /整体状态|良好|稳定|波动|低迷|很好/)
  assert.equal(overview.heroStats?.[0]?.championId, 103)
  assert.equal(overview.heroStats?.[0]?.championCanonicalName, 'Ahri')
  assert.equal(buildCoachSummaryReportCardTitle(result.snapshot), '近20局排位数据分析')
})

test('does not count non-ranked queues toward the 20 match requirement', async () => {
  const ranked = Array.from({ length: 18 }, (_item, index) => makeRecord(index + 1))
  const aram = Array.from({ length: 10 }, (_item, index) =>
    makeRecord(index + 100, { queueId: 450, matchId: `aram-${index + 1}` })
  )

  const result = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: makeDatabase([...ranked, ...aram])
  })

  assert.equal(result.status, 'insufficient_ranked_matches')
  assert.equal(result.currentRankedMatchCount, 18)
})

test('blocks regenerating a coach summary until 20 newer ranked games exist after the latest report', async () => {
  const records = Array.from({ length: 25 }, (_item, index) => makeRecord(index + 1))
  const sgpClient = makeSgpClient()

  const result = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: makeDatabase(records, records.map(record => makeDetail(record.matchId)), [makeAnalysisResult()]),
    sgpHydrationClient: sgpClient
  })

  assert.equal(result.status, 'not_enough_new_ranked_matches')
  assert.equal(result.status === 'not_enough_new_ranked_matches' ? result.newRankedMatchCountSinceLastReport : -1, 5)
  assert.equal(result.status === 'not_enough_new_ranked_matches' ? result.requiredNewRankedMatchCount : -1, COACH_SUMMARY_REQUIRED_RANKED_MATCHES)
  assert.equal(result.status === 'not_enough_new_ranked_matches' ? result.lastGeneratedAt : '', '2026-01-01T00:00:00.000Z')
  assert.equal(sgpClient.detailCalls.length, 0)
  assert.equal(sgpClient.timelineCalls.length, 0)
})

test('allows regenerating a coach summary after 20 newer ranked games exist after the latest report', async () => {
  const records = Array.from({ length: 40 }, (_item, index) => makeRecord(index + 1))
  const sgpClient = makeSgpClient()
  const priorReport = makeAnalysisResult({
    outputJson: JSON.stringify({
      metadata: {
        generatedInputAt: '2026-01-01T00:00:00.000Z',
        latestMatchTimestamp: BASE_TIME - 21 * 3_600_000 + 1_920_000
      }
    })
  })

  const result = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: makeDatabase(records, records.map(record => makeDetail(record.matchId)), [priorReport]),
    sgpHydrationClient: sgpClient
  })

  assert.equal(result.status, 'ready')
  assert.equal(result.status === 'ready' ? result.snapshot.matches.length : 0, COACH_SUMMARY_REQUIRED_RANKED_MATCHES)
  assert.equal(sgpClient.detailCalls.length, 0)
  assert.equal(sgpClient.timelineCalls.length, 0)
})

test('coach_summary hydration skips SGP fetch when local SGP detail and timeline are complete', async () => {
  const records = makeNumericRecords()
  const sgpClient = makeSgpClient()

  const result = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: makeDatabase(records),
    sgpHydrationClient: sgpClient,
    hydrationDelay: async () => undefined
  })

  assert.equal(result.status, 'ready')
  assert.equal(sgpClient.detailCalls.length, 0)
  assert.equal(sgpClient.timelineCalls.length, 0)
  assert.equal(result.snapshot.dataQuality.sgpHydration?.attempted, true)
  assert.equal(result.snapshot.dataQuality.sgpHydration?.skippedBecauseAlreadyCompleteCount, 20)
})

test('coach_summary hydration fetches missing timeline from SGP only and persists it before building digest', async () => {
  const records = makeNumericRecords()
  const details = records.map((record, index) =>
    makeDetail(record.matchId, { includeTimeline: index !== 0 })
  )
  const state = makeMutableDatabase(records, details)
  const sgpClient = makeSgpClient()
  const delays: number[] = []

  const result = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: state.database,
    sgpHydrationClient: sgpClient,
    hydrationDelay: async (ms) => { delays.push(ms) }
  })

  assert.equal(result.status, 'ready')
  assert.deepEqual(sgpClient.detailCalls, [])
  assert.deepEqual(sgpClient.timelineCalls, [10_001])
  assert.equal(state.upsertedDetails.length, 1)
  assert.equal(state.upsertedDetails[0]?.source, 'sgp')
  assert.equal(result.snapshot.dataQuality.missingTimelineMatchRefs.length, 0)
  assert.equal(result.snapshot.dataQuality.sgpHydration?.timelineFetchedCount, 1)
  assert.equal(result.snapshot.matches[0]?.events.kills.length, 2)
  assert.equal(result.snapshot.matches[0]?.events.deaths.length, 1)
  assert.equal(result.snapshot.matches[0]?.events.objectives.length, 1)
  assert.equal(result.snapshot.matches[0]?.events.buildings.length, 1)
  assert.equal(result.snapshot.matches[0]?.laneDiff?.goldDiffAt10, 300)
  assert(delays.every(delay => delay === COACH_SUMMARY_SGP_HYDRATION_DELAY_MS))
})

test('coach_summary hydration reuses rankpeek backend detail and only fills missing timeline for economy diff', async () => {
  const records = makeNumericRecords()
  const details = records.map((record, index) =>
    makeDetail(record.matchId, {
      includeTimeline: index !== 0,
      source: index === 0 ? 'rankpeek-backend' : 'sgp'
    })
  )
  const state = makeMutableDatabase(records, details)
  const sgpClient = makeSgpClient()

  const result = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: state.database,
    sgpHydrationClient: sgpClient,
    hydrationDelay: async () => undefined
  })

  assert.equal(result.status, 'ready')
  assert.deepEqual(sgpClient.detailCalls, [])
  assert.deepEqual(sgpClient.timelineCalls, [10_001])
  assert.equal(state.upsertedDetails.length, 1)
  assert.equal(state.upsertedDetails[0]?.source, 'sgp')
  assert.deepEqual(result.snapshot.dataQuality.missingParticipantDetailMatchRefs, [])
  assert.deepEqual(result.snapshot.dataQuality.missingTimelineMatchRefs, [])
  assert.deepEqual(result.snapshot.dataQuality.missingEconomyDiffMatchRefs, [])
  assert.equal(result.snapshot.matches[0]?.laneDiff?.goldDiffAt10, 300)
  assert.equal(result.snapshot.matches[0]?.laneDiff?.goldDiffAt15, 350)
})

test('coach_summary hydration can use SGP match-history summary as participant detail', async () => {
  const records = makeNumericRecords()
  const details = records.map((record, index) =>
    makeDetail(record.matchId, {
      includeTimeline: index !== 0,
      source: index === 0 ? 'lcu' : 'sgp'
    })
  )
  const state = makeMutableDatabase(records, details)
  const sgpClient = makeSgpClient()
  sgpClient.fetchRecentMatchSummariesFromSgpOnly = async () => [makeFetchedGameDetail(10_001)]

  const result = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: state.database,
    sgpHydrationClient: sgpClient,
    hydrationDelay: async () => undefined
  })

  assert.equal(result.status, 'ready')
  assert.deepEqual(sgpClient.detailCalls, [])
  assert.deepEqual(sgpClient.timelineCalls, [10_001])
  assert.equal(result.snapshot.dataQuality.sgpHydration?.detailFetchedCount, 1)
  assert.deepEqual(result.snapshot.dataQuality.missingParticipantDetailMatchRefs, [])
})

test('coach_summary hydration fetches recent ranked matches sequentially with delay between games', async () => {
  const records = makeNumericRecords()
  const details = records.map(record => makeDetail(record.matchId, { includeTimeline: false }))
  const state = makeMutableDatabase(records, details)
  const sgpClient = makeSgpClient()
  const delays: number[] = []

  const result = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: state.database,
    sgpHydrationClient: sgpClient,
    hydrationDelay: async (ms) => { delays.push(ms) }
  })

  assert.equal(result.status, 'ready')
  assert.equal(sgpClient.maxConcurrentCalls(), 1)
  assert.equal(sgpClient.timelineCalls.length, 20)
  assert.deepEqual(sgpClient.timelineCalls, records.map(record => Number(record.matchId)))
  assert.equal(delays.length, 19)
  assert(delays.every(delay => delay === COACH_SUMMARY_SGP_HYDRATION_DELAY_MS))
})

test('SGP single-match timeline failure does not block snapshot and records hydration error', async () => {
  const records = makeNumericRecords()
  const details = records.map(record => makeDetail(record.matchId, { includeTimeline: false }))
  const state = makeMutableDatabase(records, details)
  const sgpClient = makeSgpClient({
    timeline: (gameId) => {
      if (gameId === 10_001) {
        throw new Error('429 too many requests')
      }
      return makeFetchedTimeline(gameId)
    }
  })

  const result = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: state.database,
    sgpHydrationClient: sgpClient,
    hydrationDelay: async () => undefined,
    hydrationRetryCount: 1
  })

  assert.equal(result.status, 'ready')
  assert.deepEqual(result.snapshot.dataQuality.missingTimelineMatchRefs, ['m01'])
  assert.deepEqual(result.snapshot.dataQuality.sgpHydration?.timelineFailedMatchRefs, ['m01'])
  assert.equal(result.snapshot.dataQuality.sgpHydration?.errors.length, 1)
  assert.equal(result.snapshot.dataQuality.sgpHydration?.errors[0]?.stage, 'timeline')
  assert.match(result.snapshot.dataQuality.sgpHydration?.errors[0]?.message ?? '', /429/)
})

test('SGP timeline is persisted even when SGP participant detail fails', async () => {
  const records = makeNumericRecords()
  const details = records.map((record, index) =>
    makeDetail(record.matchId, {
      includeTimeline: index !== 0,
      source: index === 0 ? 'lcu' : 'sgp'
    })
  )
  const state = makeMutableDatabase(records, details)
  const sgpClient = makeSgpClient({
    detail: (gameId) => {
      if (gameId === 10_001) {
        throw new Error('SGP detail unavailable')
      }
      return makeFetchedGameDetail(gameId)
    }
  })

  const result = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: state.database,
    sgpHydrationClient: sgpClient,
    hydrationDelay: async () => undefined,
    hydrationRetryCount: 0
  })

  assert.equal(result.status, 'ready')
  assert.deepEqual(result.snapshot.dataQuality.missingParticipantDetailMatchRefs, ['m01'])
  assert.deepEqual(result.snapshot.dataQuality.missingTimelineMatchRefs, [])
  assert.equal(state.upsertedDetails[0]?.source, 'sgp')
  assert.match(JSON.stringify(state.upsertedDetails[0]?.rawDetailJson), /"timeline"/)
})

test('LCU half detail is not treated as coach_summary usable detail or timeline', async () => {
  const records = makeNumericRecords()
  const details = records.map((record, index) =>
    makeDetail(record.matchId, {
      includeTimeline: index !== 0,
      source: index === 0 ? 'lcu' : 'sgp'
    })
  )
  const sgpClient = makeSgpClient({
    detail: (gameId) => {
      if (gameId === 10_001) {
        throw new Error('SGP detail unavailable')
      }
      return makeFetchedGameDetail(gameId)
    },
    timeline: (gameId) => {
      if (gameId === 10_001) {
        throw new Error('SGP timeline unavailable')
      }
      return makeFetchedTimeline(gameId)
    }
  })

  const result = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: makeDatabase(records, details),
    sgpHydrationClient: sgpClient,
    hydrationDelay: async () => undefined,
    hydrationRetryCount: 0
  })

  assert.equal(result.status, 'ready')
  assert.deepEqual(result.snapshot.dataQuality.missingParticipantDetailMatchRefs, ['m01'])
  assert.deepEqual(result.snapshot.dataQuality.missingTimelineMatchRefs, ['m01'])
  assert.deepEqual(sgpClient.detailCalls, [10_001])
  assert.deepEqual(sgpClient.timelineCalls, [10_001])
})

test('dataQuality confidence follows timeline and detail missing thresholds', async () => {
  const twoMissingRecords = makeNumericRecords()
  const twoMissingDetails = twoMissingRecords.map((record, index) =>
    makeDetail(record.matchId, { includeTimeline: index >= 2 })
  )
  const threeMissingRecords = makeNumericRecords()
  const threeMissingDetails = threeMissingRecords.map((record, index) =>
    makeDetail(record.matchId, { includeTimeline: index >= 3 })
  )
  const nineMissingRecords = makeNumericRecords()
  const nineMissingDetails = nineMissingRecords.map((record, index) =>
    makeDetail(record.matchId, { includeTimeline: index >= 9 })
  )

  const high = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: makeDatabase(twoMissingRecords, twoMissingDetails),
    sgpHydrationClient: null
  })
  const medium = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: makeDatabase(threeMissingRecords, threeMissingDetails),
    sgpHydrationClient: null
  })
  const low = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: makeDatabase(nineMissingRecords, nineMissingDetails),
    sgpHydrationClient: null
  })

  assert.equal(high.status, 'ready')
  assert.equal(medium.status, 'ready')
  assert.equal(low.status, 'ready')
  assert.equal(high.snapshot.dataQuality.confidence, 'high')
  assert.equal(medium.snapshot.dataQuality.confidence, 'medium')
  assert.equal(low.snapshot.dataQuality.confidence, 'low')
})

test('input hash is stable for the same account schema and 20 match id list', async () => {
  const matchIds = Array.from({ length: 20 }, (_item, index) => `match-${index + 1}`)
  const first = buildCoachSummaryInputHash({
    analysisType: 'coach_summary',
    schemaVersion: 'coach_summary.v1',
    accountPuuid: ACCOUNT_PUUID,
    matchIdList: matchIds
  })
  const second = buildCoachSummaryInputHash({
    schemaVersion: 'coach_summary.v1',
    analysisType: 'coach_summary',
    matchIdList: [...matchIds],
    accountPuuid: ACCOUNT_PUUID
  })

  assert.equal(first, second)
})

test('ready snapshot records missing timeline data without blocking generation', async () => {
  const records = Array.from({ length: 20 }, (_item, index) => makeRecord(index + 1))
  const details = records.map((record, index) =>
    makeDetail(record.matchId, { includeTimeline: index !== 0 })
  )

  const result = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: makeDatabase(records, details),
    sgpHydrationClient: null
  })

  assert.equal(result.status, 'ready')
  assert.equal(result.snapshot.dataQuality.hasAllTimelines, false)
  assert.deepEqual(result.snapshot.dataQuality.missingTimelineMatchRefs, ['m01'])
  assert.deepEqual(result.snapshot.dataQuality.missingDataReasons[0], {
    matchRef: 'm01',
    reasons: ['timeline_missing', 'economy_diff_unavailable']
  })
  assert.equal(result.snapshot.matches[0]?.economyTimeline, undefined)
  assert.match(result.snapshot.analysisBrief.matchFacts[0] ?? '', /RP不可用，RP标签不可用/)
  assert.match(result.snapshot.analysisBrief.dataQualityFacts.join('\n'), /数据缺口/)
  assert.match(result.snapshot.analysisBrief.dataQualityFacts.join('\n'), /缺timeline：m01/)
})

test('lane opponent matching failure does not throw and is recorded in dataQuality', async () => {
  const records = Array.from({ length: 20 }, (_item, index) => makeRecord(index + 1))
  const details = records.map((record, index) =>
    makeDetail(record.matchId, { opponentPosition: index === 0 ? 'TOP' : 'MIDDLE' })
  )

  const result = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: makeDatabase(records, details)
  })

  assert.equal(result.status, 'ready')
  assert.equal(result.snapshot.matches[0]?.laneOpponent, undefined)
  assert.deepEqual(result.snapshot.dataQuality.missingLaneOpponentMatchRefs, ['m01'])
  assert.deepEqual(result.snapshot.dataQuality.missingEconomyDiffMatchRefs, ['m01'])
  assert.deepEqual(result.snapshot.dataQuality.missingDataReasons[0], {
    matchRef: 'm01',
    reasons: ['lane_opponent_unmatched', 'economy_diff_unavailable']
  })
})

test('reads Riot v5 info metadata and participant top-level stats from cached detail', async () => {
  const records = Array.from({ length: 20 }, (_item, index) =>
    makeRecord(index + 1, index === 0 ? { gameDuration: null } : {})
  )
  const details = records.map((record, index) =>
    index === 0 ? makeRiotV5Detail(record.matchId) : makeDetail(record.matchId)
  )

  const result = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: makeDatabase(records, details)
  })

  assert.equal(result.status, 'ready')
  assert.equal(result.snapshot.matches[0]?.gameStartTimestamp, BASE_TIME + 120_000)
  assert.equal(result.snapshot.matches[0]?.gameEndTimestamp, BASE_TIME + 1_920_000)
  assert.equal(result.snapshot.matches[0]?.durationSeconds, 1800)
  assert.equal(result.snapshot.matches[0]?.self.kills, 8)
  assert.equal(result.snapshot.matches[0]?.self.items[0]?.itemId, 6655)
  assert.deepEqual(result.snapshot.matches[0]?.self.summonerSpells, [{ spellId: 4 }, { spellId: 14 }])
  assert.equal(result.snapshot.matches[0]?.self.runes?.keystoneId, 8214)
  assert.equal(result.snapshot.matches[0]?.laneDiff?.goldDiffAt10, 300)
})

test('dataQuality records missing rune and item data separately', async () => {
  const records = Array.from({ length: 20 }, (_item, index) => makeRecord(index + 1))
  const details = records.map((record, index) =>
    makeDetail(record.matchId, { stripSelfRunesAndItems: index === 0 })
  )

  const result = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: makeDatabase(records, details)
  })

  assert.equal(result.status, 'ready')
  assert.equal(result.snapshot.dataQuality.hasAllRuneData, false)
  assert.equal(result.snapshot.dataQuality.hasAllItemData, false)
  assert.deepEqual(result.snapshot.dataQuality.missingRuneMatchRefs, ['m01'])
  assert.deepEqual(result.snapshot.dataQuality.missingItemMatchRefs, ['m01'])
  assert.deepEqual(result.snapshot.dataQuality.missingRuneOrItemMatchRefs, ['m01'])
})

test('champion metadata maps stable coach-summary champion ids', async () => {
  const cases = [
    { championId: 43, rawName: 'Karma', canonicalName: 'Karma' },
    { championId: 89, rawName: 'Leona', canonicalName: 'Leona' },
    { championId: 117, rawName: 'Lulu', canonicalName: 'Lulu' },
    { championId: 133, rawName: 'Quinn', canonicalName: 'Quinn' },
    { championId: 141, rawName: 'Kayn', canonicalName: 'Kayn' },
    { championId: 200, rawName: "Bel'Veth", canonicalName: "Bel'Veth" },
    { championId: 233, rawName: 'Nidalee', canonicalName: 'Briar' },
    { championId: 234, rawName: 'Viego', canonicalName: 'Viego' },
    { championId: 950, rawName: 'Naafiri', canonicalName: 'Naafiri' },
    { championId: 76, rawName: 'Nidalee', canonicalName: 'Nidalee' },
    { championId: 59, rawName: 'JarvanIV', canonicalName: 'Jarvan IV' },
    { championId: 102, rawName: 'Jarvan IV', canonicalName: 'Shyvana' },
    { championId: 350, rawName: 'Nidalee', canonicalName: 'Yuumi' },
    { championId: 517, rawName: 'Sylas', canonicalName: 'Sylas' },
    { championId: 888, rawName: 'RenataGlasc', canonicalName: 'Renata Glasc' }
  ]

  for (const item of cases) {
    const records = makeChampionRecords(item.championId, item.rawName)
    const details = records.map(record => withSelfChampionDetail(makeDetail(record.matchId), item.championId, item.rawName))
    const result = await prepareCoachSummaryGeneration({
      accountPuuid: ACCOUNT_PUUID,
      database: makeDatabase(records, details),
      sgpHydrationClient: null
    })

    assert.equal(result.status, 'ready')
    assert.equal(result.snapshot.matches[0]?.self.championId, item.championId)
    assert.equal(result.snapshot.matches[0]?.self.championCanonicalName, item.canonicalName)
    assert.equal(result.snapshot.matches[0]?.self.championNameSource, 'local_metadata')
  }
})

test('integrity validation rejects impossible champion id/name pairs', async () => {
  const briarResult = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: makeDatabase(
      makeChampionRecords(233, 'Briar'),
      makeChampionRecords(233, 'Briar').map(record => withSelfChampionDetail(makeDetail(record.matchId), 233, 'Briar'))
    ),
    sgpHydrationClient: null
  })
  assert.equal(briarResult.status, 'ready')

  const nidaleeAsBriar = cloneForMutation(briarResult.snapshot)
  nidaleeAsBriar.matches[0].self.championCanonicalName = 'Nidalee'
  assert.equal(validateCoachSummarySnapshotIntegrity(nidaleeAsBriar).valid, false)

  const shyvanaResult = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: makeDatabase(
      makeChampionRecords(102, 'Shyvana'),
      makeChampionRecords(102, 'Shyvana').map(record => withSelfChampionDetail(makeDetail(record.matchId), 102, 'Shyvana'))
    ),
    sgpHydrationClient: null
  })
  assert.equal(shyvanaResult.status, 'ready')

  const jarvanAsShyvana = cloneForMutation(shyvanaResult.snapshot)
  jarvanAsShyvana.matches[0].self.championCanonicalName = 'Jarvan IV'
  assert.equal(validateCoachSummarySnapshotIntegrity(jarvanAsShyvana).valid, false)
})

test('integrity validation rejects Yuumi without a canonical champion name', async () => {
  const result = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: makeDatabase(
      makeChampionRecords(350, 'Yuumi'),
      makeChampionRecords(350, 'Yuumi').map(record => withSelfChampionDetail(makeDetail(record.matchId), 350, 'Yuumi'))
    ),
    sgpHydrationClient: null
  })
  assert.equal(result.status, 'ready')

  const missingCanonical = cloneForMutation(result.snapshot)
  delete missingCanonical.matches[0].self.championCanonicalName
  assert.equal(validateCoachSummarySnapshotIntegrity(missingCanonical).valid, false)
})

test('integrity validation accepts champion ids missing from stable metadata when canonicalName is present', async () => {
  const result = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: makeDatabase(
      makeChampionRecords(777, 'Yone'),
      makeChampionRecords(777, 'Yone').map(record => withSelfChampionDetail(makeDetail(record.matchId), 777, 'Yone'))
    ),
    sgpHydrationClient: null
  })

  assert.equal(result.status, 'ready')
  assert.equal(result.snapshot.matches[0]?.self.championId, 777)
  assert.equal(result.snapshot.matches[0]?.self.championCanonicalName, 'Yone')
})

test('integrity validation still requires exactly 20 matches', async () => {
  const result = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: makeDatabase(
      makeChampionRecords(233, 'Briar'),
      makeChampionRecords(233, 'Briar').map(record => withSelfChampionDetail(makeDetail(record.matchId), 233, 'Briar'))
    ),
    sgpHydrationClient: null
  })
  assert.equal(result.status, 'ready')

  const truncated = cloneForMutation(result.snapshot)
  truncated.matches = truncated.matches.slice(0, 19)
  assert.equal(validateCoachSummarySnapshotIntegrity(truncated).valid, false)
})

test('self participant identity is anchored by accountPuuid instead of participant order or names', async () => {
  const records = makeChampionRecords(233, 'Briar')
  const details = records.map(record => {
    const parsed = JSON.parse(makeDetail(record.matchId).rawDetailJson) as Record<string, unknown>
    const participants = parsed.participants as Array<Record<string, unknown>>
    const identities = parsed.participantIdentities as Array<Record<string, unknown>>
    participants[0] = { ...participants[0], participantId: 1, championId: 76, championName: 'Nidalee' }
    participants[1] = { ...participants[1], participantId: 2, championId: 233, championName: 'Briar' }
    identities[0] = { participantId: 2, player: { puuid: ACCOUNT_PUUID, gameName: 'Self', tagLine: 'CN1' } }
    identities[1] = { participantId: 1, player: { puuid: ENEMY_PUUID, gameName: 'Enemy', tagLine: 'CN1' } }
    return {
      ...makeDetail(record.matchId),
      rawDetailJson: JSON.stringify(parsed)
    }
  })

  const result = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: makeDatabase(records, details),
    sgpHydrationClient: null
  })

  assert.equal(result.status, 'ready')
  assert.equal(result.snapshot.matches[0]?.self.championId, 233)
  assert.equal(result.snapshot.matches[0]?.self.championCanonicalName, 'Briar')
  assert.equal(result.snapshot.matches[0]?.self.identityCheck?.matchedByAccountPuuid, true)
})

test('detail participants without puuid merge onto the summary self anchor without changing identity', async () => {
  const records = makeChampionRecords(233, 'Briar')
  const details = records.map(record => {
    const detail = withSelfChampionDetail(makeDetail(record.matchId), 76, 'Nidalee')
    const parsed = JSON.parse(detail.rawDetailJson) as Record<string, unknown>
    delete parsed.participantIdentities
    return {
      ...detail,
      rawDetailJson: JSON.stringify(parsed)
    }
  })

  const result = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: makeDatabase(records, details),
    sgpHydrationClient: null
  })

  assert.equal(result.status, 'ready')
  assert.equal(result.snapshot.matches[0]?.self.championId, 233)
  assert.equal(result.snapshot.matches[0]?.self.championCanonicalName, 'Briar')
  assert.equal(result.snapshot.matches[0]?.self.kdaText, '6/3/8 (4.667)')
})

test('unconfirmed self identity returns snapshot_integrity_failed instead of ready', async () => {
  const records = makeChampionRecords(233, 'Briar').map(stripSelfIdentityFromRecord)
  const details = records.map(record => stripSelfIdentityFromDetail(makeDetail(record.matchId)))

  const result = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: makeDatabase(records, details),
    sgpHydrationClient: null
  })

  assert.equal(result.status, 'snapshot_integrity_failed')
  assert.match(result.message, /电子教练数据校验失败/)
  assert.ok(result.errors.some(error => error.includes('self identity')))
})

test('ready snapshot is anonymized and exposes matchRef/eventRef references only', async () => {
  const records = makeChampionRecords(233, 'Nidalee')
  const details = records.map(record => withSelfChampionDetail(makeDetail(record.matchId), 233, 'Nidalee'))

  const result = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: makeDatabase(records, details),
    sgpHydrationClient: null
  })

  assert.equal(result.status, 'ready')
  assert.equal(result.snapshot.matches[0]?.matchRef, 'm01')
  assert.equal(result.snapshot.matches[0]?.events.deaths[0]?.eventRef, 'm01:d01')
  assert.equal(validateCoachSummarySnapshotIntegrity(result.snapshot).valid, true)

  const serialized = JSON.stringify(result.snapshot)
  for (const sensitive of [ACCOUNT_PUUID, ENEMY_PUUID, 'match-1', 'Enemy', 'CN1']) {
    assert.doesNotMatch(serialized, new RegExp(sensitive.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.doesNotMatch(serialized, /:"Self"/)
  assert.doesNotMatch(serialized, /"matchId"|"gameId"|"puuid"|"summonerName"|"gameName"|"tagLine"/)

  const audit = auditCoachSummarySnapshot(result.snapshot)
  assert.equal(audit.matchCount, 20)
  assert.equal(audit.matches[0]?.rawMatchIdPresent, false)
  assert.equal(audit.matches[0]?.self.championCanonicalName, 'Briar')
  assert.equal(audit.matches[0]?.championMappingCheck.isConsistent, true)
})

test('coach summary report fixture does not mention Nidalee when the snapshot does not contain Nidalee', async () => {
  const records = makeChampionRecords(233, 'Briar').map(replaceNidaleeWithNocturneInRecord)
  const details = records.map(record => replaceNidaleeWithNocturneInDetail(withSelfChampionDetail(makeDetail(record.matchId), 233, 'Briar')))
  const result = await prepareCoachSummaryGeneration({
    accountPuuid: ACCOUNT_PUUID,
    database: makeDatabase(records, details),
    sgpHydrationClient: null
  })

  assert.equal(result.status, 'ready')
  assert.doesNotMatch(JSON.stringify(result.snapshot), /Nidalee/)

  const reportFixture = readFileSync(new URL('./__fixtures__/coach-summary-report-v1.example.json', import.meta.url), 'utf8')
  assert.doesNotMatch(reportFixture, /Nidalee/)
})

function makeChampionRecords(championId: number, championName: string): MatchRecord[] {
  return Array.from({ length: 20 }, (_item, index) => {
    const record = makeRecord(index + 1, { championId })
    const summary = JSON.parse(record.rawSummaryJson) as Record<string, unknown>
    summary.participants = updateSelfChampion(summary.participants, championId, championName)
    return {
      ...record,
      rawSummaryJson: JSON.stringify(summary)
    }
  })
}

function withSelfChampionDetail(detail: MatchDetail, championId: number, championName: string): MatchDetail {
  const parsed = JSON.parse(detail.rawDetailJson) as Record<string, unknown>
  parsed.participants = updateSelfChampion(parsed.participants, championId, championName)
  return {
    ...detail,
    rawDetailJson: JSON.stringify(parsed)
  }
}

function updateSelfChampion(value: unknown, championId: number, championName: string): unknown {
  return Array.isArray(value)
    ? value.map(participant => {
        const record = participant as Record<string, unknown>
        return record.participantId === 1
          ? { ...record, championId, championName }
          : record
      })
    : value
}

function stripSelfIdentityFromRecord(record: MatchRecord): MatchRecord {
  const summary = JSON.parse(record.rawSummaryJson) as Record<string, unknown>
  delete summary.participantIdentities
  summary.participants = Array.isArray(summary.participants)
    ? summary.participants.map(participant => {
        const item = { ...(participant as Record<string, unknown>) }
        delete item.puuid
        delete item.player
        return item
      })
    : summary.participants
  return {
    ...record,
    rawSummaryJson: JSON.stringify(summary)
  }
}

function stripSelfIdentityFromDetail(detail: MatchDetail): MatchDetail {
  const parsed = JSON.parse(detail.rawDetailJson) as Record<string, unknown>
  delete parsed.participantIdentities
  parsed.participants = Array.isArray(parsed.participants)
    ? parsed.participants.map(participant => {
        const item = { ...(participant as Record<string, unknown>) }
        delete item.puuid
        delete item.player
        return item
      })
    : parsed.participants
  return {
    ...detail,
    rawDetailJson: JSON.stringify(parsed)
  }
}

function replaceNidaleeWithNocturneInRecord(record: MatchRecord): MatchRecord {
  const summary = JSON.parse(record.rawSummaryJson) as Record<string, unknown>
  summary.participants = replaceNidaleeWithNocturne(summary.participants)
  return {
    ...record,
    rawSummaryJson: JSON.stringify(summary)
  }
}

function replaceNidaleeWithNocturneInDetail(detail: MatchDetail): MatchDetail {
  const parsed = JSON.parse(detail.rawDetailJson) as Record<string, unknown>
  parsed.participants = replaceNidaleeWithNocturne(parsed.participants)
  return {
    ...detail,
    rawDetailJson: JSON.stringify(parsed)
  }
}

function replaceNidaleeWithNocturne(value: unknown): unknown {
  return Array.isArray(value)
    ? value.map(participant => {
        const item = participant as Record<string, unknown>
        return item.championId === 76
          ? { ...item, championId: 56, championName: 'Nocturne' }
          : item
      })
    : value
}

function cloneForMutation<T>(value: T): any {
  return JSON.parse(JSON.stringify(value))
}
