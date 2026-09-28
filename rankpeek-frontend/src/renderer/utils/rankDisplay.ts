import type { QueueInfo, Rank } from '@/types/api'

export type RankedQueueKey = 'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR'
export type RankLoadStatus = 'loading' | 'loaded' | 'error'
export type RankDisplayState = 'loading' | 'error' | 'unranked' | 'ranked'

export interface RankDisplayText {
  loading: string
  error: string
  unranked: string
  noData: string
  wins: (count: number) => string
}

export interface RankDisplay {
  state: RankDisplayState
  tierText: string
  recordText: string
  iconTier: string
}

export const defaultRankDisplayText: RankDisplayText = {
  loading: '段位加载中',
  error: '段位获取失败',
  unranked: '未定级',
  noData: '暂无排位数据',
  wins: count => `${count}胜`
}

const TIER_LABELS: Record<string, string> = {
  IRON: '黑铁',
  BRONZE: '青铜',
  SILVER: '白银',
  GOLD: '黄金',
  PLATINUM: '铂金',
  EMERALD: '翡翠',
  DIAMOND: '钻石',
  MASTER: '超凡大师',
  GRANDMASTER: '傲世宗师',
  CHALLENGER: '最强王者'
}

const DIVISION_LABELS: Record<string, string> = {
  I: 'Ⅰ',
  II: 'Ⅱ',
  III: 'Ⅲ',
  IV: 'Ⅳ',
  'Ⅰ': 'Ⅰ',
  'Ⅱ': 'Ⅱ',
  'Ⅲ': 'Ⅲ',
  'Ⅳ': 'Ⅳ',
  '一': 'Ⅰ',
  '二': 'Ⅱ',
  '三': 'Ⅲ',
  '四': 'Ⅳ'
}

const UNRANKED_TIER_VALUES = new Set(['', 'UNRANKED', 'NONE', 'NULL', 'UNDEFINED'])
const APEX_TIERS = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER'])

export function getRankQueueInfo(rank: Rank | null | undefined, queueKey: RankedQueueKey): QueueInfo | null {
  return rank?.queueMap?.[queueKey] ?? null
}

export function buildRankDisplay(
  queueInfo: QueueInfo | null | undefined,
  status: RankLoadStatus = 'loaded',
  text: RankDisplayText = defaultRankDisplayText
): RankDisplay {
  if (status === 'loading') {
    return {
      state: 'loading',
      tierText: text.loading,
      recordText: '',
      iconTier: 'unranked'
    }
  }

  if (status === 'error') {
    return {
      state: 'error',
      tierText: text.error,
      recordText: '',
      iconTier: 'unranked'
    }
  }

  if (!isRankedQueueInfo(queueInfo)) {
    return {
      state: 'unranked',
      tierText: text.unranked,
      recordText: text.noData,
      iconTier: 'unranked'
    }
  }

  return {
    state: 'ranked',
    tierText: formatRankTier(queueInfo),
    recordText: formatRankRecord(queueInfo, text),
    iconTier: normalizeTier(queueInfo.tier).toLowerCase()
  }
}

export function isRankedQueueInfo(queueInfo: QueueInfo | null | undefined): queueInfo is QueueInfo {
  const tier = normalizeTier(queueInfo?.tier)
  return Boolean(queueInfo) && !UNRANKED_TIER_VALUES.has(tier)
}

export function formatRankDivisionLabel(division?: string): string {
  const raw = (division ?? '').trim()
  const key = raw.toUpperCase()
  if (!key || key === 'NA') {
    return ''
  }
  return DIVISION_LABELS[key] ?? DIVISION_LABELS[raw] ?? raw
}

export function normalizeRankDivisionText(value: string): string {
  const text = value.trim()
  if (!text) {
    return ''
  }

  return text.replace(
    /(一|二|三|四|Ⅰ|Ⅱ|Ⅲ|Ⅳ|IV|III|II|I)(?=(?:\s*\d+\s*LP)?\s*$)/i,
    match => formatRankDivisionLabel(match)
  )
}

function formatRankTier(queueInfo: QueueInfo): string {
  const tier = normalizeTier(queueInfo.tier)
  const tierLabel = TIER_LABELS[tier] ?? queueInfo.tier
  const points = readFiniteNumber(queueInfo.leaguePoints)

  if (APEX_TIERS.has(tier)) {
    return `${tierLabel} ${points}LP`
  }

  const division = normalizeDivision(queueInfo.division)
  return division ? `${tierLabel} ${division} ${points}LP` : `${tierLabel} ${points}LP`
}

function formatRankRecord(queueInfo: QueueInfo, text: RankDisplayText): string {
  const wins = Math.floor(readFiniteNumber(queueInfo.wins))
  if (wins <= 0) {
    return ''
  }

  return text.wins(wins)
}

function normalizeTier(tier?: string): string {
  return (tier ?? '').trim().toUpperCase()
}

function normalizeDivision(division?: string): string {
  return formatRankDivisionLabel(division)
}

function readFiniteNumber(value?: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
