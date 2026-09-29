import type { GamingAiInputPlayer, GamingAiInputSnapshot, GamingAiTeamSnapshot } from './gamingAiInputSnapshot.ts'
import {
  RANKPEEK_LOCAL_PREGAME_STREAM_ENDPOINT,
  streamLocalPregameAi,
  type LocalPregameStreamHandlers
} from './localAiStreamClient.ts'

export const RANKPEEK_SERVER_GAMING_STREAM_ENDPOINT = RANKPEEK_LOCAL_PREGAME_STREAM_ENDPOINT

export type GamingAiStreamState =
  | 'idle'
  | 'preparing'
  | 'streaming'
  | 'completed'
  | 'failed'

export interface GamingAiStreamRequest {
  mode: 'teammate' | 'opponent'
  snapshotSchemaVersion: string
  snapshot: GamingAiInputSnapshot
  allyTeamTags: string[]
  enemyTeamTags: string[]
}

export interface GamingAiPlayerStreamVerdict {
  playerKey: string
  label: string
  tone?: 'carry' | 'stable' | 'risk' | 'weak' | 'unknown'
  reason?: string
}

export interface GamingAiPlayerInsightEvent {
  playerKey: string
  label: string
  tone?: 'carry' | 'stable' | 'risk' | 'weak' | 'unknown'
  text: string
}

export type GamingAiStreamEvent =
  | { type: 'start'; title?: string }
  | { type: 'delta'; text: string }
  | { type: 'section'; title: string }
  | ({ type: 'player_verdict' } & GamingAiPlayerStreamVerdict)
  | ({ type: 'player_insight' } & GamingAiPlayerInsightEvent)
  | { type: 'done' }
  | { type: 'error'; message: string }

export function flattenGamingAiSnapshotTags(snapshot: GamingAiInputSnapshot): {
  allyTeamTags: string[]
  enemyTeamTags: string[]
} {
  if (snapshot.mode === 'opponent') {
    return {
      allyTeamTags: [],
      enemyTeamTags: [formatTeamSnapshotText(snapshot.opponentSnapshot)]
    }
  }

  return {
    allyTeamTags: [formatTeamSnapshotText(snapshot.teammateSnapshot)],
    enemyTeamTags: []
  }
}

export function createGamingAiStreamRequest(snapshot: GamingAiInputSnapshot): GamingAiStreamRequest {
  const flattened = flattenGamingAiSnapshotTags(snapshot)

  return {
    mode: snapshot.mode,
    snapshotSchemaVersion: snapshot.schemaVersion,
    snapshot,
    allyTeamTags: flattened.allyTeamTags,
    enemyTeamTags: flattened.enemyTeamTags
  }
}

export async function streamGamingAiAnalysis(
  request: GamingAiStreamRequest,
  handlers: {
    onEvent?: (event: GamingAiStreamEvent) => void
    onDelta?: (text: string) => void
    onError?: (message: string) => void
    onDone?: () => void
  },
  options: { signal?: AbortSignal } = {}
): Promise<{ ok: true } | { ok: false; message: string }> {
  return streamLocalPregameAi(request, handlers as LocalPregameStreamHandlers, options)
}

function formatPlayerTagLine(player: GamingAiInputPlayer): string {
  return player.summaryLine || player.key
}

function formatTeamSnapshotText(snapshot: GamingAiTeamSnapshot): string {
  return snapshot.text || snapshot.players.map(player => formatPlayerTagLine(player)).join('\n\n')
}
