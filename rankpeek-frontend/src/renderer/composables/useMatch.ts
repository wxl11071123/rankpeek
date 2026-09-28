import { computed, type Ref } from 'vue'
import type { MatchHistory, Stats } from '@/types/api'
import { isAram, isRanked } from '@/utils/constants'

/**
 * 对局相关 composable
 */
export function useMatch(match: Ref<MatchHistory | null>) {
  const isWin = computed(() => {
    // 需要根据当前玩家判断
    return false
  })

  const duration = computed(() => {
    const seconds = match.value?.gameDuration || 0
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  })

  const durationMinutes = computed(() => {
    const seconds = match.value?.gameDuration || 0
    return Math.floor(seconds / 60)
  })

  const gameDate = computed(() => {
    const creation = match.value?.gameCreation
    if (!creation) return ''
    return new Date(creation).toLocaleDateString('zh-CN')
  })

  const gameTime = computed(() => {
    const creation = match.value?.gameCreation
    if (!creation) return ''
    return new Date(creation).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })
  })

  const queueName = computed(() => {
    return match.value?.queueName || '未知模式'
  })

  const isAramMatch = computed(() => isAram(match.value?.queueId))
  const isRankedMatch = computed(() => isRanked(match.value?.queueId))

  return {
    isWin,
    duration,
    durationMinutes,
    gameDate,
    gameTime,
    queueName,
    isAramMatch,
    isRankedMatch
  }
}

/**
 * 计算玩家 KDA
 */
export function calculateKda(stats: Stats | undefined): number {
  if (!stats) return 0
  const deaths = stats.deaths || 0
  if (deaths === 0) return (stats.kills || 0) + (stats.assists || 0)
  return ((stats.kills || 0) + (stats.assists || 0)) / deaths
}

/**
 * 格式化 KDA 显示
 */
export function formatKda(stats: Stats | undefined): string {
  const kda = calculateKda(stats)
  return kda.toFixed(1)
}

/**
 * 计算伤害占比
 */
export function calculateDamageRate(stats: Stats | undefined): number {
  if (!stats || !stats.damageDealtToChampionsRate) return 0
  return Math.round(stats.damageDealtToChampionsRate)
}

/**
 * 格式化伤害数值
 */
export function formatDamage(damage: number | undefined): string {
  if (!damage) return '0'
  if (damage >= 10000) {
    return (damage / 10000).toFixed(1) + 'w'
  }
  return damage.toLocaleString()
}

/**
 * 判断是否是 MVP
 */
export function isMvp(stats: Stats | undefined): boolean {
  return stats?.mvp === 'MVP' || stats?.mvp === 'mvp'
}

/**
 * 判断是否是 SVP
 */
export function isSvp(stats: Stats | undefined): boolean {
  return stats?.mvp === 'SVP' || stats?.mvp === 'svp'
}
