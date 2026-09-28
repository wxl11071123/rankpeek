export interface OpggRuneGroups {
  primaryPageId: number | null
  secondaryPageId: number | null
  primaryRuneIds: number[]
  secondaryRuneIds: number[]
  statModIds: number[]
}

const STAT_MOD_IDS = new Set([5001, 5002, 5003, 5005, 5007, 5008, 5010, 5011, 5012])
const SECONDARY_RUNE_COUNT = 2

export function splitOpggRuneIds(ids: number[]): OpggRuneGroups {
  const cleanIds = ids.filter(id => Number.isFinite(id) && id > 0)
  const statModIds = takeTrailingStatMods(cleanIds)
  const withoutStats = cleanIds.slice(0, cleanIds.length - statModIds.length)
  const primaryPageId = withoutStats[0] ?? null
  const secondaryPageId = withoutStats[1] ?? null
  const runeIds = withoutStats.slice(2)
  const secondaryCount = secondaryPageId ? Math.min(SECONDARY_RUNE_COUNT, runeIds.length) : 0
  const primaryRuneIds = secondaryCount > 0 ? runeIds.slice(0, -secondaryCount) : runeIds
  const secondaryRuneIds = secondaryCount > 0 ? runeIds.slice(-secondaryCount) : []

  return {
    primaryPageId,
    secondaryPageId,
    primaryRuneIds,
    secondaryRuneIds,
    statModIds
  }
}

function takeTrailingStatMods(ids: number[]): number[] {
  const statModIds: number[] = []
  for (let index = ids.length - 1; index >= 0 && statModIds.length < 3; index -= 1) {
    const id = ids[index]
    if (!STAT_MOD_IDS.has(id)) {
      break
    }
    statModIds.unshift(id)
  }
  return statModIds
}
