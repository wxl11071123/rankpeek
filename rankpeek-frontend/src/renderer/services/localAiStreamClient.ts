import { RANKPEEK_LOCAL_SERVICE_BASE_URL } from './rankpeekLocalServiceClient.ts'

export const RANKPEEK_LOCAL_PREGAME_STREAM_ENDPOINT = '/api/v1/ai/pregame/stream'
export const RANKPEEK_LOCAL_POSTGAME_STREAM_ENDPOINT = '/api/v1/ai/postgame/stream'
export const LOCAL_AI_CONFIGURATION_REQUIRED_MESSAGE = '请先在设置里配置 AI 服务商和 API Key。'
const LOCAL_AI_UNAVAILABLE_MESSAGE = 'AI 服务暂时不可用，请稍后再试。'
const LOCAL_AI_BAD_REQUEST_MESSAGE = '请求无法完成，请稍后再试。'
const LOCAL_AI_CANCELLED_MESSAGE = 'request cancelled'

export type LocalPregameStreamEvent =
  | { type: 'start'; title?: string }
  | { type: 'delta'; text: string }
  | { type: 'section'; title: string }
  | ({ type: 'player_verdict' } & LocalPregamePlayerStreamVerdict)
  | ({ type: 'player_insight' } & LocalPregamePlayerInsightEvent)
  | { type: 'done' }
  | { type: 'error'; message: string }

export interface LocalPregamePlayerStreamVerdict {
  playerKey: string
  label: string
  tone?: 'carry' | 'stable' | 'risk' | 'weak' | 'unknown'
  reason?: string
}

export interface LocalPregamePlayerInsightEvent {
  playerKey: string
  label: string
  tone?: 'carry' | 'stable' | 'risk' | 'weak' | 'unknown'
  text: string
}

export interface LocalPregameStreamHandlers {
  onEvent?: (event: LocalPregameStreamEvent) => void
  onDelta?: (text: string) => void
  onError?: (message: string) => void
  onDone?: () => void
}

export interface LocalPostgameTokenCostEstimate {
  currency: 'CNY'
  inputCacheHitCny: number
  inputCacheMissCny: number
  outputCny: number
  totalCny: number
  pricing: {
    inputCacheHitCnyPerMillionTokens: number
    inputCacheMissCnyPerMillionTokens: number
    outputCnyPerMillionTokens: number
  }
}

export interface LocalPostgameTokenUsage {
  provider: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  promptCacheHitTokens: number
  promptCacheMissTokens: number
  cost: LocalPostgameTokenCostEstimate | null
}

export type LocalPostgameStreamEvent =
  | { type: 'start'; title?: string }
  | { type: 'section'; title: string }
  | { type: 'delta'; text: string }
  | { type: 'usage'; usage: LocalPostgameTokenUsage }
  | { type: 'done' }
  | { type: 'error'; message: string }

export interface LocalPostgameStreamHandlers {
  onEvent?: (event: LocalPostgameStreamEvent) => void
  onSection?: (title: string) => void
  onDelta?: (text: string) => void
  onUsage?: (usage: LocalPostgameTokenUsage) => void
  onError?: (message: string) => void
  onDone?: () => void
}

const DEEPSEEK_MAINLAND_PRICING_CNY_PER_MILLION: Record<string, LocalPostgameTokenCostEstimate['pricing']> = {
  'deepseek-v4-flash': {
    inputCacheHitCnyPerMillionTokens: 0.02,
    inputCacheMissCnyPerMillionTokens: 1,
    outputCnyPerMillionTokens: 2
  },
  'deepseek-chat': {
    inputCacheHitCnyPerMillionTokens: 0.02,
    inputCacheMissCnyPerMillionTokens: 1,
    outputCnyPerMillionTokens: 2
  },
  'deepseek-reasoner': {
    inputCacheHitCnyPerMillionTokens: 1,
    inputCacheMissCnyPerMillionTokens: 4,
    outputCnyPerMillionTokens: 16
  },
  'deepseek-v4-pro': {
    inputCacheHitCnyPerMillionTokens: 0.025,
    inputCacheMissCnyPerMillionTokens: 3,
    outputCnyPerMillionTokens: 6
  }
}

interface StreamParseState {
  terminalErrorMessage: string
}

export async function streamLocalPregameAi(
  request: unknown,
  handlers: LocalPregameStreamHandlers,
  options: { signal?: AbortSignal } = {}
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const response = await postLocalStreamRequest(RANKPEEK_LOCAL_PREGAME_STREAM_ENDPOINT, request, options.signal)
    if (!response.ok) {
      return emitFailedPregameStream(await readLocalHttpErrorMessage(response), handlers)
    }
    if (!response.body) {
      return emitFailedPregameStream(LOCAL_AI_UNAVAILABLE_MESSAGE, handlers)
    }

    const state = createStreamParseState()
    if (isSseResponse(response)) {
      await parseSseStream(response.body, (eventName, data) => emitParsedPregameEvent(eventName, data, handlers, state))
    } else {
      await parseNdjsonStream(response.body, line => parsePregameNdjsonLine(line, handlers, state))
    }
    if (state.terminalErrorMessage) {
      return { ok: false, message: state.terminalErrorMessage }
    }
    return { ok: true }
  } catch {
    if (options.signal?.aborted) {
      return { ok: false, message: LOCAL_AI_CANCELLED_MESSAGE }
    }
    return emitFailedPregameStream(LOCAL_AI_UNAVAILABLE_MESSAGE, handlers)
  }
}

export async function streamLocalPostgameAi(
  request: unknown,
  handlers: LocalPostgameStreamHandlers,
  options: { signal?: AbortSignal } = {}
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const response = await postLocalStreamRequest(RANKPEEK_LOCAL_POSTGAME_STREAM_ENDPOINT, request, options.signal)
    if (!response.ok) {
      return emitFailedPostgameStream(await readLocalHttpErrorMessage(response), handlers)
    }
    if (!response.body) {
      return emitFailedPostgameStream(LOCAL_AI_UNAVAILABLE_MESSAGE, handlers)
    }

    const state = createStreamParseState()
    if (isSseResponse(response)) {
      await parseSseStream(response.body, (eventName, data) => emitParsedPostgameEvent(eventName, data, handlers, state))
    } else {
      await parseNdjsonStream(response.body, line => parsePostgameNdjsonLine(line, handlers, state))
    }
    if (state.terminalErrorMessage) {
      return { ok: false, message: state.terminalErrorMessage }
    }
    return { ok: true }
  } catch {
    if (options.signal?.aborted) {
      return { ok: false, message: LOCAL_AI_CANCELLED_MESSAGE }
    }
    return emitFailedPostgameStream(LOCAL_AI_UNAVAILABLE_MESSAGE, handlers)
  }
}

export function estimateLocalPostgameAiTokenCostCny(
  usage: Pick<LocalPostgameTokenUsage, 'model' | 'promptCacheHitTokens' | 'promptCacheMissTokens' | 'completionTokens'>
): LocalPostgameTokenCostEstimate {
  const pricing = DEEPSEEK_MAINLAND_PRICING_CNY_PER_MILLION[normalizeDeepSeekModel(usage.model)]
    ?? DEEPSEEK_MAINLAND_PRICING_CNY_PER_MILLION['deepseek-v4-flash']
  const inputCacheHitCny = roundCurrency(usage.promptCacheHitTokens * pricing.inputCacheHitCnyPerMillionTokens / 1_000_000)
  const inputCacheMissCny = roundCurrency(usage.promptCacheMissTokens * pricing.inputCacheMissCnyPerMillionTokens / 1_000_000)
  const outputCny = roundCurrency(usage.completionTokens * pricing.outputCnyPerMillionTokens / 1_000_000)

  return {
    currency: 'CNY',
    inputCacheHitCny,
    inputCacheMissCny,
    outputCny,
    totalCny: roundCurrency(inputCacheHitCny + inputCacheMissCny + outputCny),
    pricing
  }
}

async function postLocalStreamRequest(
  endpoint: string,
  request: unknown,
  signal: AbortSignal | undefined
): Promise<Response> {
  return fetch(`${RANKPEEK_LOCAL_SERVICE_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal
  })
}

function createStreamParseState(): StreamParseState {
  return { terminalErrorMessage: '' }
}

function isSseResponse(response: Response): boolean {
  return (response.headers.get('Content-Type') || '').includes('text/event-stream')
}

async function parseSseStream(
  body: ReadableStream<Uint8Array>,
  onBlock: (eventName: string, data: string) => void
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { value, done } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split(/\r?\n\r?\n/)
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      parseSseBlock(part, onBlock)
    }
  }

  buffer += decoder.decode()
  if (buffer.trim()) {
    parseSseBlock(buffer, onBlock)
  }
}

async function parseNdjsonStream(
  body: ReadableStream<Uint8Array>,
  onLine: (line: string) => void
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { value, done } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      onLine(line)
    }
  }

  buffer += decoder.decode()
  if (buffer.trim()) {
    onLine(buffer)
  }
}

function parseSseBlock(block: string, onBlock: (eventName: string, data: string) => void): void {
  let eventName = 'message'
  const dataLines: string[] = []

  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trimEnd()
    if (!line || line.startsWith(':')) {
      continue
    }
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim()
      continue
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart())
    }
  }

  onBlock(eventName, dataLines.join('\n'))
}

function parsePregameNdjsonLine(
  line: string,
  handlers: LocalPregameStreamHandlers,
  state: StreamParseState
): void {
  const trimmed = line.trim()
  if (!trimmed) {
    return
  }

  try {
    const event = JSON.parse(trimmed) as Partial<LocalPregameStreamEvent>
    if (typeof event.type === 'string') {
      emitParsedPregameEvent(event.type, JSON.stringify(event), handlers, state)
      return
    }
  } catch {
    // Plain text lines are treated as streaming deltas.
  }

  emitPregameStreamEvent({ type: 'delta', text: trimmed }, handlers)
}

function parsePostgameNdjsonLine(
  line: string,
  handlers: LocalPostgameStreamHandlers,
  state: StreamParseState
): void {
  const trimmed = line.trim()
  if (!trimmed) {
    return
  }

  try {
    const event = JSON.parse(trimmed) as Partial<LocalPostgameStreamEvent>
    if (typeof event.type === 'string') {
      emitParsedPostgameEvent(event.type, JSON.stringify(event), handlers, state)
      return
    }
  } catch {
    // Plain text lines are treated as streaming deltas.
  }

  emitPostgameStreamEvent({ type: 'delta', text: trimmed }, handlers)
}

function emitParsedPregameEvent(
  eventName: string,
  data: string,
  handlers: LocalPregameStreamHandlers,
  state: StreamParseState
): void {
  const payload = parsePayload(data)
  const normalizedEventName = eventName === 'message' ? readString(payload, 'type') || 'delta' : eventName

  if (normalizedEventName === 'start') {
    emitPregameStreamEvent({ type: 'start', title: readString(payload, 'title') || readText(payload) || undefined }, handlers)
    return
  }
  if (normalizedEventName === 'section') {
    emitPregameStreamEvent({ type: 'section', title: readString(payload, 'title') || readText(payload) || data }, handlers)
    return
  }
  if (normalizedEventName === 'delta') {
    emitPregameStreamEvent({ type: 'delta', text: readString(payload, 'text') || readText(payload) || data }, handlers)
    return
  }
  if (normalizedEventName === 'player_verdict') {
    const playerKey = readString(payload, 'playerKey')
    const label = readString(payload, 'label')
    if (playerKey && label) {
      const tone = readVerdictTone(payload)
      const reason = readString(payload, 'reason')
      emitPregameStreamEvent(createPlayerVerdictEvent({
        playerKey,
        label,
        ...(tone ? { tone } : {}),
        ...(reason ? { reason } : {})
      }), handlers)
    }
    return
  }
  if (normalizedEventName === 'player_insight') {
    const playerKey = readString(payload, 'playerKey')
    const label = readString(payload, 'label')
    const text = readString(payload, 'text')
    if (playerKey && label && text) {
      const tone = readVerdictTone(payload)
      emitPregameStreamEvent(createPlayerInsightEvent({
        playerKey,
        label,
        text,
        ...(tone ? { tone } : {})
      }), handlers)
    }
    return
  }
  if (normalizedEventName === 'done') {
    emitPregameStreamEvent({ type: 'done' }, handlers)
    return
  }
  if (normalizedEventName === 'error') {
    const message = toLocalAiUserFacingErrorMessage(readString(payload, 'code'), readString(payload, 'message') || readText(payload) || data)
    if (readString(payload, 'code') === 'AI_PROVIDER_NOT_CONFIGURED') {
      state.terminalErrorMessage = message
    }
    emitPregameStreamEvent({ type: 'error', message }, handlers)
  }
}

function emitParsedPostgameEvent(
  eventName: string,
  data: string,
  handlers: LocalPostgameStreamHandlers,
  state: StreamParseState
): void {
  const payload = parsePayload(data)
  const normalizedEventName = eventName === 'message' ? readString(payload, 'type') || 'delta' : eventName

  if (normalizedEventName === 'start') {
    emitPostgameStreamEvent({ type: 'start', title: readString(payload, 'title') || readText(payload) || undefined }, handlers)
    return
  }
  if (normalizedEventName === 'section') {
    emitPostgameStreamEvent({ type: 'section', title: readString(payload, 'title') || readText(payload) || data }, handlers)
    return
  }
  if (normalizedEventName === 'delta') {
    emitPostgameStreamEvent({ type: 'delta', text: readString(payload, 'text') || readText(payload) || data }, handlers)
    return
  }
  if (normalizedEventName === 'usage') {
    const usage = readTokenUsage(payload)
    if (usage) {
      emitPostgameStreamEvent({ type: 'usage', usage }, handlers)
    }
    return
  }
  if (normalizedEventName === 'done') {
    emitPostgameStreamEvent({ type: 'done' }, handlers)
    return
  }
  if (normalizedEventName === 'error') {
    const message = toLocalAiUserFacingErrorMessage(readString(payload, 'code'), readString(payload, 'message') || readText(payload) || data)
    if (readString(payload, 'code') === 'AI_PROVIDER_NOT_CONFIGURED') {
      state.terminalErrorMessage = message
    }
    emitPostgameStreamEvent({ type: 'error', message }, handlers)
  }
}

function emitPregameStreamEvent(event: LocalPregameStreamEvent, handlers: LocalPregameStreamHandlers): void {
  handlers.onEvent?.(event)

  if (event.type === 'delta') {
    handlers.onDelta?.(event.text)
    return
  }
  if (event.type === 'error') {
    handlers.onError?.(event.message)
    return
  }
  if (event.type === 'done') {
    handlers.onDone?.()
  }
}

function emitPostgameStreamEvent(event: LocalPostgameStreamEvent, handlers: LocalPostgameStreamHandlers): void {
  handlers.onEvent?.(event)

  if (event.type === 'section') {
    handlers.onSection?.(event.title)
    return
  }
  if (event.type === 'delta') {
    handlers.onDelta?.(event.text)
    return
  }
  if (event.type === 'usage') {
    handlers.onUsage?.(event.usage)
    return
  }
  if (event.type === 'error') {
    handlers.onError?.(event.message)
    return
  }
  if (event.type === 'done') {
    handlers.onDone?.()
  }
}

function emitFailedPregameStream(
  message: string,
  handlers: LocalPregameStreamHandlers
): { ok: false; message: string } {
  emitPregameStreamEvent({ type: 'error', message }, handlers)
  return { ok: false, message }
}

function emitFailedPostgameStream(
  message: string,
  handlers: LocalPostgameStreamHandlers
): { ok: false; message: string } {
  emitPostgameStreamEvent({ type: 'error', message }, handlers)
  return { ok: false, message }
}

async function readLocalHttpErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json() as {
      error?: {
        code?: string
        message?: string
      } | null
    }
    return toLocalAiUserFacingErrorMessage(payload.error?.code, payload.error?.message || '')
  } catch {
    return response.status >= 500 ? LOCAL_AI_UNAVAILABLE_MESSAGE : LOCAL_AI_BAD_REQUEST_MESSAGE
  }
}

function toLocalAiUserFacingErrorMessage(code?: string, message?: string): string {
  if (code === 'AI_PROVIDER_NOT_CONFIGURED') {
    return LOCAL_AI_CONFIGURATION_REQUIRED_MESSAGE
  }
  return message?.trim() || LOCAL_AI_BAD_REQUEST_MESSAGE
}

function parsePayload(data: string): unknown {
  if (!data.trim()) {
    return ''
  }

  try {
    return JSON.parse(data)
  } catch {
    return data
  }
}

function readString(payload: unknown, key: string): string {
  if (!payload || typeof payload !== 'object') {
    return ''
  }
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : ''
}

function readText(payload: unknown): string {
  return typeof payload === 'string' ? payload : ''
}

function createPlayerVerdictEvent(verdict: LocalPregamePlayerStreamVerdict): LocalPregameStreamEvent {
  const event = { ...verdict } as LocalPregameStreamEvent
  Object.defineProperty(event, 'type', {
    value: 'player_verdict',
    enumerable: false
  })
  return event
}

function createPlayerInsightEvent(insight: LocalPregamePlayerInsightEvent): LocalPregameStreamEvent {
  const event = { ...insight } as LocalPregameStreamEvent
  Object.defineProperty(event, 'type', {
    value: 'player_insight',
    enumerable: false
  })
  return event
}

function readVerdictTone(payload: unknown): LocalPregamePlayerStreamVerdict['tone'] | undefined {
  const tone = readString(payload, 'tone')
  if (
    tone === 'carry' ||
    tone === 'stable' ||
    tone === 'risk' ||
    tone === 'weak' ||
    tone === 'unknown'
  ) {
    return tone
  }
  return undefined
}

function readTokenUsage(payload: unknown): LocalPostgameTokenUsage | null {
  const source = readObject(readObject(payload)?.usage) || readObject(payload)
  if (!source) {
    return null
  }

  const model = readString(source, 'model') || 'deepseek-v4-flash'
  const rawUsage = {
    provider: readString(source, 'provider') || 'deepseek',
    model,
    promptTokens: readUsageNumber(source, 'promptTokens', 'prompt_tokens'),
    completionTokens: readUsageNumber(source, 'completionTokens', 'completion_tokens'),
    totalTokens: readUsageNumber(source, 'totalTokens', 'total_tokens'),
    promptCacheHitTokens: readUsageNumber(source, 'promptCacheHitTokens', 'prompt_cache_hit_tokens'),
    promptCacheMissTokens: readUsageNumber(source, 'promptCacheMissTokens', 'prompt_cache_miss_tokens')
  }

  return {
    ...rawUsage,
    cost: rawUsage.provider.trim().toLowerCase() === 'deepseek'
      ? estimateLocalPostgameAiTokenCostCny(rawUsage)
      : null
  }
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function readUsageNumber(payload: Record<string, unknown>, camelKey: string, snakeKey: string): number {
  return readNonNegativeNumber(payload[camelKey]) || readNonNegativeNumber(payload[snakeKey])
}

function readNonNegativeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

function normalizeDeepSeekModel(model: string): string {
  return model.trim().toLowerCase()
}

function roundCurrency(value: number): number {
  return Number(value.toFixed(12))
}
