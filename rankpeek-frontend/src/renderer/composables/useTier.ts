import { computed, type ComputedRef, type Ref } from 'vue'
import type { QueueInfo } from '@/types/api'
import { getTierCn } from '@/utils/constants'

/**
 * 段位相关 composable
 */
export function useTier(rank: Ref<QueueInfo | null> | ComputedRef<QueueInfo | null>) {
  const tierName = computed(() => getTierCn(rank.value?.tier))

  const tierDisplay = computed(() => {
    const r = rank.value
    if (!r) return '无'

    const tier = getTierCn(r.tier)
    const division = r.division || ''

    if (r.tier?.toLowerCase() === 'unranked' || !r.tier) {
      return '未定级'
    }

    // 大师及以上没有段位
    if (['master', 'grandmaster', 'challenger'].includes(r.tier?.toLowerCase() || '')) {
      return tier
    }

    return `${tier} ${division}`
  })

  const lpDisplay = computed(() => {
    const lp = rank.value?.leaguePoints
    if (lp === undefined || lp === null) return ''
    return `${lp} LP`
  })

  const wins = computed(() => rank.value?.wins || 0)
  const losses = computed(() => rank.value?.losses || 0)
  const winRate = computed(() => {
    const w = wins.value
    const l = losses.value
    if (w + l === 0) return 0
    return Math.round((w / (w + l)) * 100)
  })

  const winRateDisplay = computed(() => {
    const rate = winRate.value
    return `${rate}%`
  })

  const isRanked = computed(() => {
    const tier = rank.value?.tier
    return tier && tier.toLowerCase() !== 'unranked'
  })

  return {
    tierName,
    tierDisplay,
    lpDisplay,
    wins,
    losses,
    winRate,
    winRateDisplay,
    isRanked
  }
}
