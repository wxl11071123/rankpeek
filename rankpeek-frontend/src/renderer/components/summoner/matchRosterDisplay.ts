import type { Stats } from '../../types/api'

export type MatchStatSource = Pick<
  Stats,
  'kills' | 'deaths' | 'assists' | 'goldEarned' | 'totalDamageDealtToChampions' | 'totalMinionsKilled' | 'neutralMinionsKilled'
>

export interface MatchDetailItem {
  label: string
  value: string
}

export interface TeamKdaLeaders {
  kills: number
  deaths: number
  assists: number
}

export function getTeamKdaLeaders(players: Array<{ stats?: MatchStatSource | null }>): TeamKdaLeaders {
  return players.reduce<TeamKdaLeaders>((leaders, player) => ({
    kills: Math.max(leaders.kills, player.stats?.kills || 0),
    deaths: Math.max(leaders.deaths, player.stats?.deaths || 0),
    assists: Math.max(leaders.assists, player.stats?.assists || 0)
  }), {
    kills: 0,
    deaths: 0,
    assists: 0
  })
}

export function buildMatchDetailItems(stats?: MatchStatSource | null): MatchDetailItem[] {
  if (!stats) {
    return []
  }

  return [
    { label: '💥', value: formatCompactNumber(stats.totalDamageDealtToChampions) },
    { label: '🪙', value: formatCompactNumber(stats.goldEarned) },
    { label: '🌾', value: String((stats.totalMinionsKilled || 0) + (stats.neutralMinionsKilled || 0)) }
  ]
}

function formatCompactNumber(value?: number): string {
  if (value == null) {
    return '0'
  }

  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}m`
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)}`.replace(/\.0$/, '') + 'k'
  }

  return String(value)
}
