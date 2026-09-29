import type { QueueInfo, SessionData, SessionSummoner } from '@/types/api'

export interface OpggChampionQuery {
  enabled: boolean
  reason: string
  championId: number | null
  mode: string
  region: 'kr'
  tier: string
  position: string
  filterLabel: string
}

const REGION = 'kr'

const POSITION_MAP: Record<string, { value: string; label: string }> = {
  TOP: { value: 'top', label: '上路' },
  TOPLANE: { value: 'top', label: '上路' },
  JUNGLE: { value: 'jungle', label: '打野' },
  MIDDLE: { value: 'mid', label: '中路' },
  MID: { value: 'mid', label: '中路' },
  BOTTOM: { value: 'adc', label: '下路' },
  ADC: { value: 'adc', label: '下路' },
  UTILITY: { value: 'support', label: '辅助' },
  SUPPORT: { value: 'support', label: '辅助' }
}

const TIER_MAP: Record<string, { value: string; label: string }> = {
  IRON: { value: 'ibsg', label: '低段位' },
  BRONZE: { value: 'ibsg', label: '低段位' },
  SILVER: { value: 'ibsg', label: '低段位' },
  GOLD: { value: 'gold_plus', label: '黄金+' },
  PLATINUM: { value: 'platinum_plus', label: '铂金+' },
  EMERALD: { value: 'emerald_plus', label: '翡翠+' },
  DIAMOND: { value: 'diamond_plus', label: '钻石+' },
  MASTER: { value: 'master_plus', label: '大师+' },
  GRANDMASTER: { value: 'grandmaster', label: '宗师' },
  CHALLENGER: { value: 'challenger', label: '王者' }
}

export function buildOpggChampionQuery(sessionData: SessionData): OpggChampionQuery {
  const mode = resolveMode(sessionData)
  if (!mode) {
    return disabled('当前模式暂不支持 OP.GG')
  }

  const currentPlayer = findCurrentPlayer(sessionData)
  const championId = readChampionId(currentPlayer)

  if (mode !== 'ranked') {
    return {
      enabled: true,
      reason: '',
      championId,
      mode,
      region: REGION,
      tier: 'all',
      position: 'none',
      filterLabel: `KR · ${modeLabel(mode)}`
    }
  }

  const position = resolvePosition(currentPlayer)
  const tier = resolveTier(currentPlayer, sessionData)
  const missingParts = [
    championId ? '' : '英雄',
    position ? '' : '位置',
    tier ? '' : '段位'
  ].filter(Boolean)

  return {
    enabled: true,
    reason: missingParts.length ? `OP.GG 将在读取到${missingParts.join('、')}后自动跳转详情` : '',
    championId,
    mode,
    region: REGION,
    tier: tier?.value || 'all',
    position: position?.value || 'none',
    filterLabel: tier && position ? `KR · 排位 · ${tier.label} · ${position.label}` : 'KR · 排位'
  }
}

function disabled(reason: string): OpggChampionQuery {
  return {
    enabled: false,
    reason,
    championId: null,
    mode: '',
    region: REGION,
    tier: '',
    position: '',
    filterLabel: ''
  }
}

function resolveMode(sessionData: SessionData): string {
  const queueId = Number(sessionData.queueId)
  const text = `${sessionData.queueType || ''} ${sessionData.typeCn || ''}`.toUpperCase()
  if (queueId === 420 || queueId === 440 || text.includes('RANKED_SOLO') || text.includes('RANKED_FLEX')) {
    return 'ranked'
  }
  if (
    text.includes('ARAM_MAYHEM') ||
    text.includes('MAYHEM') ||
    text.includes('海克斯大乱斗') ||
    text.includes('大乱斗：混战') ||
    text.includes('大亂鬥：混戰')
  ) {
    return ''
  }
  if (queueId === 450 || text.includes('ARAM') || text.includes('大乱斗')) {
    return 'aram'
  }
  if (queueId === 1700 || queueId === 1710 || text.includes('ARENA') || text.includes('CHERRY') || text.includes('斗魂')) {
    return 'arena'
  }
  if (queueId === 900 || queueId === 1010 || queueId === 1900 || text.includes('URF') || text.includes('无限火力')) {
    return 'urf'
  }
  if (queueId === 1300 || text.includes('NEXUS')) {
    return 'nexus_blitz'
  }
  return ''
}

function findCurrentPlayer(sessionData: SessionData): SessionSummoner | null {
  const players = [...(sessionData.teamOne || []), ...(sessionData.teamTwo || [])]
  const currentPuuid = normalizeKey(sessionData.currentSummoner?.puuid)
  if (currentPuuid) {
    const byPuuid = players.find(player => normalizeKey(player.summoner?.puuid) === currentPuuid)
    if (byPuuid) return byPuuid
  }

  const currentSummonerId = normalizeKey(sessionData.currentSummoner?.summonerId)
  if (currentSummonerId) {
    const bySummonerId = players.find(player => normalizeKey(player.summoner?.summonerId) === currentSummonerId)
    if (bySummonerId) return bySummonerId
  }

  const currentGameName = normalizeKey(sessionData.currentSummoner?.gameName).toLowerCase()
  const currentTagLine = normalizeKey(sessionData.currentSummoner?.tagLine).toLowerCase()
  if (currentGameName) {
    const byName = players.find(player => {
      const playerGameName = normalizeKey(player.summoner?.gameName).toLowerCase()
      const playerTagLine = normalizeKey(player.summoner?.tagLine).toLowerCase()
      return playerGameName === currentGameName && (!currentTagLine || playerTagLine === currentTagLine)
    })
    if (byName) return byName
  }

  return null
}

function readChampionId(player: SessionSummoner | null): number | null {
  const championId = Number(player?.championId)
  return Number.isFinite(championId) && championId > 0 ? championId : null
}

function resolvePosition(player: SessionSummoner | null): { value: string; label: string } | null {
  const rawValues = [
    player?.selectedPosition,
    player?.assignedPosition,
    player?.teamPosition,
    player?.individualPosition,
    player?.position
  ]
  for (const value of rawValues) {
    const normalized = normalizeKey(value).toUpperCase()
    if (POSITION_MAP[normalized]) {
      return POSITION_MAP[normalized]
    }
  }
  return null
}

function resolveTier(player: SessionSummoner | null, sessionData: SessionData): { value: string; label: string } | null {
  const queueInfo = resolveQueueInfo(player, sessionData)
  const tier = normalizeKey(queueInfo?.tier).toUpperCase()
  if (!tier || tier === 'UNRANKED') {
    return null
  }
  return TIER_MAP[tier] || null
}

function resolveQueueInfo(player: SessionSummoner | null, sessionData: SessionData): QueueInfo | null {
  const queueMap = player?.rank?.queueMap as Partial<Record<'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR', QueueInfo | null>> | undefined
  if (!queueMap) {
    return null
  }
  if (sessionData.queueId === 440 || sessionData.queueType === 'RANKED_FLEX_SR') {
    return queueMap.RANKED_FLEX_SR || queueMap.RANKED_SOLO_5x5 || null
  }
  return queueMap.RANKED_SOLO_5x5 || queueMap.RANKED_FLEX_SR || null
}

function modeLabel(mode: string): string {
  const labels: Record<string, string> = {
    aram: '大乱斗',
    arena: '斗魂竞技场',
    urf: '无限火力',
    nexus_blitz: '极限闪击',
    normal: '匹配'
  }
  return labels[mode] || mode
}

function normalizeKey(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  return typeof value === 'string' ? value.trim() : ''
}
