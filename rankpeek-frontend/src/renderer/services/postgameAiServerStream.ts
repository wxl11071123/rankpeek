import type { PostgameAiInputSnapshot, PostgameAiMode } from './postgameAiInputSnapshot.ts'
import {
  estimateLocalPostgameAiTokenCostCny,
  RANKPEEK_LOCAL_POSTGAME_STREAM_ENDPOINT,
  streamLocalPostgameAi,
  type LocalPostgameStreamHandlers,
  type LocalPostgameTokenCostEstimate,
  type LocalPostgameTokenUsage
} from './localAiStreamClient.ts'

export const RANKPEEK_SERVER_POSTGAME_STREAM_ENDPOINT = RANKPEEK_LOCAL_POSTGAME_STREAM_ENDPOINT

export type PostgameAiStreamState =
  | 'idle'
  | 'preparing'
  | 'streaming'
  | 'completed'
  | 'failed'

export interface PostgameAiStreamRequest {
  mode: PostgameAiMode
  snapshotSchemaVersion: string
  snapshot: PostgameAiInputSnapshot
}

export type PostgameAiTokenCostEstimate = LocalPostgameTokenCostEstimate
export type PostgameAiTokenUsage = LocalPostgameTokenUsage

export type PostgameAiStreamEvent =
  | { type: 'start'; title?: string }
  | { type: 'section'; title: string }
  | { type: 'delta'; text: string }
  | { type: 'usage'; usage: PostgameAiTokenUsage }
  | { type: 'done' }
  | { type: 'error'; message: string }

export interface PostgameAiStreamHandlers {
  onEvent?: (event: PostgameAiStreamEvent) => void
  onSection?: (title: string) => void
  onDelta?: (text: string) => void
  onUsage?: (usage: PostgameAiTokenUsage) => void
  onError?: (message: string) => void
  onDone?: () => void
}

export function createPostgameAiStreamRequest(
  snapshot: PostgameAiInputSnapshot,
  mode: PostgameAiMode
): PostgameAiStreamRequest {
  return {
    mode,
    snapshotSchemaVersion: snapshot.schemaVersion,
    snapshot
  }
}

export function estimatePostgameAiTokenCostCny(
  usage: Pick<PostgameAiTokenUsage, 'model' | 'promptCacheHitTokens' | 'promptCacheMissTokens' | 'completionTokens'>
): PostgameAiTokenCostEstimate {
  return estimateLocalPostgameAiTokenCostCny(usage)
}

export async function streamPostgameAiAnalysis(
  request: PostgameAiStreamRequest,
  handlers: PostgameAiStreamHandlers,
  options: { signal?: AbortSignal } = {}
): Promise<{ ok: true } | { ok: false; message: string }> {
  return streamLocalPostgameAi(request, handlers as LocalPostgameStreamHandlers, options)
}
