import type { ChampionOption, MatchHistory, Participant } from '@/types/api'

export interface LoadedChampionOption extends ChampionOption {
  games: number
  latestGameCreation: number
}

interface ChampionUsage {
  championId: number
  games: number
  latestGameCreation: number
}

export function buildLoadedChampionOptions(
  matches: MatchHistory[],
  puuid: string,
  championOptions: ChampionOption[],
  queueId?: number
): LoadedChampionOption[] {
  if (!puuid || !Array.isArray(matches) || matches.length === 0) {
    return []
  }

  const championMeta = new Map(championOptions.map(option => [option.value, option]))
  const usagesByChampionId = new Map<number, ChampionUsage>()

  for (const match of matches) {
    if (queueId && queueId > 0 && match.queueId !== queueId) {
      continue
    }

    const participant = getParticipantByPuuid(match, puuid)
    const championId = participant?.championId
    if (!championId || championId <= 0) {
      continue
    }

    const current = usagesByChampionId.get(championId)
    const gameCreation = Number.isFinite(match.gameCreation) ? match.gameCreation : 0
    if (current) {
      current.games += 1
      current.latestGameCreation = Math.max(current.latestGameCreation, gameCreation)
      continue
    }

    usagesByChampionId.set(championId, {
      championId,
      games: 1,
      latestGameCreation: gameCreation
    })
  }

  return [...usagesByChampionId.values()]
    .sort((left, right) => {
      if (right.latestGameCreation !== left.latestGameCreation) {
        return right.latestGameCreation - left.latestGameCreation
      }
      if (right.games !== left.games) {
        return right.games - left.games
      }
      const leftLabel = championMeta.get(left.championId)?.label ?? formatUnknownChampionLabel(left.championId)
      const rightLabel = championMeta.get(right.championId)?.label ?? formatUnknownChampionLabel(right.championId)
      return leftLabel.localeCompare(rightLabel)
    })
    .map(usage => {
      const option = championMeta.get(usage.championId)
      const baseLabel = option?.label ?? formatUnknownChampionLabel(usage.championId)
      return {
        value: usage.championId,
        label: baseLabel,
        realName: option?.realName ?? baseLabel,
        nickname: option?.nickname ?? '',
        games: usage.games,
        latestGameCreation: usage.latestGameCreation
      }
  })
}

function formatUnknownChampionLabel(championId: number): string {
  return `未知英雄 ${championId}`
}

export function appendUniqueMatches(existing: MatchHistory[], incoming: MatchHistory[]): MatchHistory[] {
  if (!existing.length) {
    return [...incoming]
  }
  if (!incoming.length) {
    return [...existing]
  }

  const seenGameIds = new Set(existing.map(match => String(match.gameId)))
  const uniqueIncoming = incoming.filter(match => {
    const gameId = String(match.gameId)
    if (seenGameIds.has(gameId)) {
      return false
    }
    seenGameIds.add(gameId)
    return true
  })

  return uniqueIncoming.length ? [...existing, ...uniqueIncoming] : [...existing]
}

function getParticipantByPuuid(match: MatchHistory, puuid: string): Participant | null {
  const identity = (match.participantIdentities || []).find(item => item.player?.puuid === puuid)
  if (!identity) {
    return null
  }

  return (match.participants || []).find(
    participant => participant.participantId === identity.participantId
  ) || null
}
