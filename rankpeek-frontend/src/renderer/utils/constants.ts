/**
 * 游戏相关常量
 */

/**
 * 段位中文映射
 */
export const TIER_CN_MAP: Record<string, string> = {
  unranked: '无',
  iron: '坚韧黑铁',
  bronze: '英勇黄铜',
  silver: '不屈白银',
  gold: '荣耀黄金',
  platinum: '华贵铂金',
  emerald: '流光翡翠',
  diamond: '璀璨钻石',
  master: '超凡大师',
  grandmaster: '傲世宗师',
  challenger: '最强王者'
}

/**
 * 获取段位中文名
 */
export function getTierCn(tier: string | undefined): string {
  const tierLower = tier?.toLowerCase() || 'unranked'
  return TIER_CN_MAP[tierLower] || '无'
}

/**
 * 游戏模式选项
 */
export const GAME_MODE_OPTIONS = [
  { value: 0, label: '全部模式' },
  { value: 420, label: '单排/双排' },
  { value: 440, label: '灵活组排' },
  { value: 430, label: '匹配模式' },
  { value: 450, label: '极地大乱斗' },
  { value: 2400, label: '海克斯大乱斗' }
]

/**
 * 队列 ID 常量
 */
export const QUEUE_ID = {
  SOLO_5X5: 420,
  FLEX_SR: 440,
  NORMAL: 430,
  ARAM: 450,
  HEXTECH_ARAM: 2400
} as const

/**
 * 判断是否是大乱斗
 */
export function isAram(queueId: number | undefined): boolean {
  if (!queueId) return false
  return queueId === QUEUE_ID.ARAM || queueId === 900 || queueId === QUEUE_ID.HEXTECH_ARAM
}

/**
 * 判断是否是排位赛
 */
export function isRanked(queueId: number | undefined): boolean {
  if (!queueId) return false
  return queueId === QUEUE_ID.SOLO_5X5 || queueId === QUEUE_ID.FLEX_SR
}
