export type MatchPerformanceTagTone = 'accent' | 'danger' | 'warning' | 'neutral' | 'success'

export interface MatchPerformanceTag {
  key: string
  label: string
  tone?: MatchPerformanceTagTone
}

export interface MatchPerformanceParticipant {
  stats?: unknown
}

interface MultiKillDefinition {
  key: string
  field: string
  label: string
}

interface TopMetricDefinition {
  key: string
  field: string
  label: string
  tone: MatchPerformanceTagTone
}

const COMPLETE_MATCH_PARTICIPANT_COUNT = 10

const MULTI_KILL_TAGS: MultiKillDefinition[] = [
  { key: 'penta-kill', field: 'pentaKills', label: '五杀' },
  { key: 'quadra-kill', field: 'quadraKills', label: '四杀' },
  { key: 'triple-kill', field: 'tripleKills', label: '三杀' },
  { key: 'double-kill', field: 'doubleKills', label: '双杀' }
]

const TOP_METRIC_TAGS: TopMetricDefinition[] = [
  { key: 'top-damage', field: 'totalDamageDealtToChampions', label: '伤害第一', tone: 'accent' },
  { key: 'top-deaths', field: 'deaths', label: '死亡第一', tone: 'danger' },
  { key: 'top-assists', field: 'assists', label: '助攻第一', tone: 'success' },
  { key: 'top-gold', field: 'goldEarned', label: '打钱第一', tone: 'warning' }
]

export function getMatchPerformanceTags(
  participant: MatchPerformanceParticipant | null | undefined,
  participants: ReadonlyArray<MatchPerformanceParticipant | null | undefined> | null | undefined
): MatchPerformanceTag[] {
  const stats = getStatsRecord(participant)
  if (!stats) {
    return []
  }

  const tags: MatchPerformanceTag[] = []
  const multiKillTag = getHighestMultiKillTag(stats)
  if (multiKillTag) {
    tags.push(multiKillTag)
  }

  if (isLegendary(stats)) {
    tags.push({ key: 'legendary', label: '超神', tone: 'success' })
  }

  for (const definition of TOP_METRIC_TAGS) {
    if (isTiedForTopMetric(stats, participants, definition.field)) {
      tags.push({
        key: definition.key,
        label: definition.label,
        tone: definition.tone
      })
    }
  }

  return tags
}

function getHighestMultiKillTag(stats: Record<string, unknown>): MatchPerformanceTag | null {
  const definition = MULTI_KILL_TAGS.find(item => readNumber(stats[item.field]) > 0)
  return definition
    ? { key: definition.key, label: definition.label, tone: 'accent' }
    : null
}

function isLegendary(stats: Record<string, unknown>): boolean {
  return readNumber(stats.largestKillingSpree) >= 8 || readNumber(stats.legendaryCount) > 0
}

function isTiedForTopMetric(
  targetStats: Record<string, unknown>,
  participants: ReadonlyArray<MatchPerformanceParticipant | null | undefined> | null | undefined,
  field: string
): boolean {
  const targetValue = readNullableNumber(targetStats[field])
  if (targetValue === null || targetValue <= 0 || !participants?.length) {
    return false
  }

  const values = participants
    .map(participant => readNullableNumber(getStatsRecord(participant)?.[field]))
    .filter((value): value is number => value !== null)

  if (values.length < COMPLETE_MATCH_PARTICIPANT_COUNT) {
    return false
  }

  return targetValue >= Math.max(...values)
}

function getStatsRecord(
  participant: MatchPerformanceParticipant | null | undefined
): Record<string, unknown> | null {
  return isRecord(participant?.stats) ? participant.stats : null
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
