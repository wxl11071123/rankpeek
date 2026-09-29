import type { GameDetail, MatchHistory, Participant } from '@/types/api'
import { isRanked } from './constants.ts'

export const MIN_ANALYSIS_MATCHES = 10
export const MAX_ANALYSIS_MATCHES = 20
export const AUTO_ANALYSIS_INTERVALS = [10, 20] as const

const ANALYSIS_STORAGE_PREFIX = 'rankpeek.home.analysis'
const AUTO_ANALYSIS_STORAGE_PREFIX = 'rankpeek.home.autoAnalysis'
const FORTUNE_STORAGE_PREFIX = 'rankpeek.home.fortune'

export type GrowthRole = 'all' | 'top' | 'jungle' | 'mid' | 'bottom' | 'support' | 'unknown'
export type GrowthMetric = 'score' | 'kda' | 'winRate' | 'damage' | 'gold'
export type FortuneTone = 'good' | 'neutral' | 'bad'

export interface GrowthPoint {
  gameId: number
  matchIndex: number
  gameCreation: number
  role: GrowthRole
  queueId: number
  win: boolean
  kills: number
  deaths: number
  assists: number
  kda: number
  kdaText: string
  score: number
  winRate: number
  damage: number
  gold: number
}

export interface AnalysisSnapshot {
  id: string
  puuid: string
  analyzedAt: number
  matchStartAt: number
  matchEndAt: number
  matchCount: number
  summary: string
  detail: string
  points: GrowthPoint[]
}

export interface AutoAnalysisSettings {
  enabled: boolean
  interval: (typeof AUTO_ANALYSIS_INTERVALS)[number]
}

export interface Fortune {
  id: string
  label: string
  tone: FortuneTone
  text: string
}

export interface FortuneHistoryEntry {
  date: string
  fortuneId: string
}

export interface FortuneRecord {
  history: FortuneHistoryEntry[]
}

export const FORTUNE_POOL: Fortune[] = [
  { id: 'omen-1', label: '河道剑魔', tone: 'neutral', text: '' },
  { id: 'omen-2', label: '/mute all', tone: 'neutral', text: '' },
  { id: 'omen-3', label: '龙魂听牌', tone: 'neutral', text: '' },
  { id: 'omen-4', label: '这个贾克斯', tone: 'neutral', text: '' },
  { id: 'omen-5', label: '辅助给盾', tone: 'neutral', text: '' },
  { id: 'omen-6', label: '弹幕开庭', tone: 'neutral', text: '' },
  { id: 'omen-7', label: '飞雷神', tone: 'neutral', text: '' },
  { id: 'omen-8', label: '上单出山', tone: 'neutral', text: '' },
  { id: 'omen-9', label: '水晶没碎', tone: 'neutral', text: '' },
  { id: 'omen-10', label: '主播开麦', tone: 'neutral', text: '' },

  { id: 'omen-11', label: '一级设计', tone: 'neutral', text: '' },
  { id: 'omen-12', label: '若有怜花意', tone: 'neutral', text: '' },
  { id: 'omen-13', label: '问号慎点', tone: 'neutral', text: '' },
  { id: 'omen-14', label: '大龙不语', tone: 'neutral', text: '' },
  { id: 'omen-15', label: '补刀成神', tone: 'neutral', text: '' },
  { id: 'omen-16', label: '天雷地火', tone: 'neutral', text: '' },
  { id: 'omen-17', label: '对面也急', tone: 'neutral', text: '' },
  { id: 'omen-18', label: '视野藏刀', tone: 'neutral', text: '' },
  { id: 'omen-19', label: '回家洗澡', tone: 'neutral', text: '' },
  { id: 'omen-20', label: '中单游走', tone: 'neutral', text: '' },

  { id: 'omen-21', label: '切片预定', tone: 'neutral', text: '' },
  { id: 'omen-22', label: '野辅联动', tone: 'neutral', text: '' },
  { id: 'omen-23', label: '排位还债', tone: 'neutral', text: '' },
  { id: 'omen-24', label: '登峰造極境', tone: 'neutral', text: '' },
  { id: 'omen-25', label: 'AD等三件', tone: 'neutral', text: '' },
  { id: 'omen-26', label: '导播给慢放', tone: 'neutral', text: '' },
  { id: 'omen-27', label: '双日凌空', tone: 'neutral', text: '' },
  { id: 'omen-28', label: '打野读秒', tone: 'neutral', text: '' },
  { id: 'omen-29', label: '最后一把', tone: 'neutral', text: '' },
  { id: 'omen-30', label: '不破不立', tone: 'neutral', text: '' },

  { id: 'omen-31', label: '赛后比伤害', tone: 'neutral', text: '' },
  { id: 'omen-32', label: '解说席沉默', tone: 'neutral', text: '' },
  { id: 'omen-33', label: '下路四包二', tone: 'neutral', text: '' },
  { id: 'omen-34', label: '/remake', tone: 'neutral', text: '' },
  { id: 'omen-35', label: '三打一被反杀', tone: 'neutral', text: '' },
  { id: 'omen-36', label: '队友CBA', tone: 'neutral', text: '' },
  { id: 'omen-37', label: '素材局', tone: 'neutral', text: '' },
  { id: 'omen-38', label: '版本低语', tone: 'neutral', text: '' },
  { id: 'omen-39', label: '老龙点名', tone: 'neutral', text: '' },
  { id: 'omen-40', label: '慢刀割肉', tone: 'neutral', text: '' },

  { id: 'omen-41', label: '闪现向前', tone: 'neutral', text: '' },
  { id: 'omen-42', label: '妮蔻藏兵', tone: 'neutral', text: '' },
  { id: 'omen-43', label: '打他蛋', tone: 'neutral', text: '' },
  { id: 'omen-44', label: '弹幕别急', tone: 'neutral', text: '' },
  { id: 'omen-45', label: '天神下凡', tone: 'neutral', text: '' },
  { id: 'omen-46', label: '节目效果', tone: 'neutral', text: '' },
  { id: 'omen-47', label: '队友像人', tone: 'neutral', text: '' },
  { id: 'omen-48', label: '重铸荣光', tone: 'neutral', text: '' },
  { id: 'omen-49', label: '翻过这座山', tone: 'neutral', text: '' },
  { id: 'omen-50', label: '红眼镜', tone: 'neutral', text: '' }
]
export function getTodayKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getFortuneById(id: string): Fortune | null {
  return FORTUNE_POOL.find(fortune => fortune.id === id) ?? null
}

export function getCurrentFortune(record: FortuneRecord, todayKey = getTodayKey()): Fortune | null {
  const entry = record.history.find(item => item.date === todayKey)
  return entry ? getFortuneById(entry.fortuneId) : null
}

export function drawDailyFortune(
  record: FortuneRecord,
  todayKey = getTodayKey(),
  random = Math.random
): { fortune: Fortune; record: FortuneRecord; alreadyDrawn: boolean } {
  const current = getCurrentFortune(record, todayKey)
  if (current) {
    return { fortune: current, record, alreadyDrawn: true }
  }

  const recentIds = new Set(record.history.slice(-7).map(entry => entry.fortuneId))
  const candidates = FORTUNE_POOL.filter(fortune => !recentIds.has(fortune.id))
  const usablePool = candidates.length > 0 ? candidates : FORTUNE_POOL
  const index = Math.floor(random() * usablePool.length) % usablePool.length
  const fortune = usablePool[index]
  const history = [...record.history, { date: todayKey, fortuneId: fortune.id }].slice(-14)

  return {
    fortune,
    record: { history },
    alreadyDrawn: false
  }
}

export function loadFortuneRecord(accountKey: string): FortuneRecord {
  return safeReadJson<FortuneRecord>(`${FORTUNE_STORAGE_PREFIX}.${accountKey}`, { history: [] })
}

export function saveFortuneRecord(accountKey: string, record: FortuneRecord) {
  safeWriteJson(`${FORTUNE_STORAGE_PREFIX}.${accountKey}`, record)
}

export function loadAnalysisSnapshot(puuid: string): AnalysisSnapshot | null {
  return safeReadJson<AnalysisSnapshot | null>(`${ANALYSIS_STORAGE_PREFIX}.${puuid}`, null)
}

export function saveAnalysisSnapshot(snapshot: AnalysisSnapshot) {
  safeWriteJson(`${ANALYSIS_STORAGE_PREFIX}.${snapshot.puuid}`, snapshot)
}

export function loadAutoAnalysisSettings(accountKey: string): AutoAnalysisSettings {
  return safeReadJson<AutoAnalysisSettings>(`${AUTO_ANALYSIS_STORAGE_PREFIX}.${accountKey}`, {
    enabled: false,
    interval: 10
  })
}

export function saveAutoAnalysisSettings(accountKey: string, settings: AutoAnalysisSettings) {
  safeWriteJson(`${AUTO_ANALYSIS_STORAGE_PREFIX}.${accountKey}`, settings)
}

export function createGrowthAnalysis(
  puuid: string,
  matches: MatchHistory[],
  detailsByGameId: Map<number, GameDetail>,
  analyzedAt = Date.now()
): AnalysisSnapshot {
  const rankedMatches = matches
    .filter(match => isRanked(match.queueId))
    .sort((a, b) => (b.gameCreation || 0) - (a.gameCreation || 0))
    .slice(0, MAX_ANALYSIS_MATCHES)

  if (rankedMatches.length < MIN_ANALYSIS_MATCHES) {
    throw new Error(`MIN_ANALYSIS_MATCHES:${MIN_ANALYSIS_MATCHES}`)
  }

  const chronologicalMatches = [...rankedMatches].reverse()
  const points = chronologicalMatches
    .map((match, index) => createGrowthPoint(puuid, match, detailsByGameId.get(match.gameId), index + 1))
    .filter((point): point is GrowthPoint => point !== null)

  if (points.length < MIN_ANALYSIS_MATCHES) {
    throw new Error(`MIN_ANALYSIS_MATCHES:${MIN_ANALYSIS_MATCHES}`)
  }

  const matchStartAt = Math.min(...points.map(point => point.gameCreation))
  const matchEndAt = Math.max(...points.map(point => point.gameCreation))
  const summary = buildSummary(points)

  return {
    id: `${puuid}-${analyzedAt}`,
    puuid,
    analyzedAt,
    matchStartAt,
    matchEndAt,
    matchCount: points.length,
    summary,
    detail: buildDetail(points),
    points
  }
}

export function getMetricValue(point: GrowthPoint, metric: GrowthMetric): number {
  switch (metric) {
    case 'kda':
      return point.kda
    case 'winRate':
      return point.winRate
    case 'damage':
      return point.damage
    case 'gold':
      return point.gold
    case 'score':
    default:
      return point.score
  }
}

export function filterGrowthPoints(points: GrowthPoint[], role: GrowthRole): GrowthPoint[] {
  if (role === 'all') {
    return points
  }
  return points.filter(point => point.role === role)
}

function createGrowthPoint(
  puuid: string,
  match: MatchHistory,
  detail: GameDetail | undefined,
  matchIndex: number
): GrowthPoint | null {
  const participant = findParticipant(match, puuid)
  if (!participant?.stats) {
    return null
  }

  const stats = participant.stats
  const kills = stats.kills || 0
  const deaths = stats.deaths || 0
  const assists = stats.assists || 0
  const kda = Number(((kills + assists) / Math.max(1, deaths)).toFixed(2))
  const damage = stats.totalDamageDealtToChampions || 0
  const gold = stats.goldEarned || 0
  const win = Boolean(stats.win)

  return {
    gameId: match.gameId,
    matchIndex,
    gameCreation: match.gameCreation || 0,
    role: resolveRole(detail, participant.participantId),
    queueId: match.queueId || 0,
    win,
    kills,
    deaths,
    assists,
    kda,
    kdaText: `${kills}/${deaths}/${assists}`,
    score: calculateScore(kda, damage, gold, win),
    winRate: 0,
    damage,
    gold
  }
}

function findParticipant(match: MatchHistory, puuid: string): Participant | null {
  const identity = match.participantIdentities?.find(item => item.player?.puuid === puuid)
  if (!identity) {
    return null
  }

  return match.participants?.find(item => item.participantId === identity.participantId) ?? null
}

function resolveRole(detail: GameDetail | undefined, participantId: number): GrowthRole {
  const participant = detail?.participants?.find(item => item.participantId === participantId)
  const lane = participant?.timeline?.lane?.toUpperCase()
  const role = participant?.timeline?.role?.toUpperCase()

  if (lane === 'TOP') return 'top'
  if (lane === 'JUNGLE') return 'jungle'
  if (lane === 'MIDDLE' || lane === 'MID') return 'mid'
  if (lane === 'BOTTOM' && role === 'DUO_SUPPORT') return 'support'
  if (lane === 'BOTTOM' || role === 'DUO_CARRY') return 'bottom'
  if (role === 'SUPPORT' || role === 'DUO_SUPPORT') return 'support'

  return 'unknown'
}

function calculateScore(kda: number, damage: number, gold: number, win: boolean): number {
  const kdaScore = Math.min(kda, 8) * 7
  const damageScore = Math.min(damage / 1000, 35)
  const goldScore = Math.min(gold / 500, 25)
  return Math.round(Math.min(100, kdaScore + damageScore + goldScore + (win ? 8 : 0)))
}

function buildSummary(points: GrowthPoint[]): string {
  applyRollingWinRate(points)
  const midpoint = Math.floor(points.length / 2)
  const early = average(points.slice(0, midpoint).map(point => point.score))
  const late = average(points.slice(midpoint).map(point => point.score))
  const wins = points.filter(point => point.win).length
  const trend = late - early

  if (trend >= 8) {
    return `最近 ${points.length} 场排位成长曲线明显上升，后半段决策和输出更稳定，建议继续围绕当前节奏复盘。`
  }

  if (trend <= -8) {
    return `最近 ${points.length} 场排位状态有回落，尤其是中后段波动偏大，建议优先复盘失利局的资源团选择。`
  }

  if (wins / points.length >= 0.6) {
    return `最近 ${points.length} 场排位整体稳定，胜率保持在健康区间，建议把优势局的滚雪球方式固定下来。`
  }

  return `最近 ${points.length} 场排位起伏较大，单局表现不差，但连续性还可以提升，建议先控制前两波关键团。`
}

function buildDetail(points: GrowthPoint[]): string {
  const averageKda = average(points.map(point => point.kda)).toFixed(1)
  const averageDamage = Math.round(average(points.map(point => point.damage)))
  const wins = points.filter(point => point.win).length
  return `样本胜率 ${wins}/${points.length}，平均 KDA ${averageKda}，平均英雄伤害 ${averageDamage}。详情图表可按分路和指标切换，优先看最近低谷点对应的对局时间。`
}

function applyRollingWinRate(points: GrowthPoint[]) {
  let wins = 0
  points.forEach((point, index) => {
    if (point.win) {
      wins += 1
    }
    point.winRate = Math.round((wins / (index + 1)) * 100)
  })
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function safeReadJson<T>(key: string, fallback: T): T {
  try {
    if (typeof window === 'undefined') {
      return fallback
    }
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

function safeWriteJson(key: string, value: unknown) {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, JSON.stringify(value))
    }
  } catch {
    // Local persistence is helpful but should not block the UI.
  }
}
