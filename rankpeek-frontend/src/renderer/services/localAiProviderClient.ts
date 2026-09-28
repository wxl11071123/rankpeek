import {
  parseLocalJson,
  RANKPEEK_LOCAL_SERVICE_BASE_URL
} from './rankpeekLocalServiceClient.ts'

export interface LocalAiPricing {
  currency: string
  inputCacheHitCnyPerMillionTokens?: number | null
  inputCacheMissCnyPerMillionTokens?: number | null
  outputCnyPerMillionTokens?: number | null
}

export interface LocalAiSettings {
  enabled: boolean
  providerId: string
  baseUrl: string
  model: string
  apiKeyId?: string | null
  apiKeySaved: boolean
  apiKeyMasked?: string | null
  webSearchEnabled: boolean
  deepThinkingEnabled: boolean
  pricing?: LocalAiPricing | null
}

export interface SaveLocalAiSettingsRequest extends Omit<LocalAiSettings, 'apiKeySaved' | 'apiKeyMasked'> {
  apiKey?: string
  saveApiKey?: boolean
}

export interface LocalAiProviderApiKey {
  id: string
  providerId: string
  baseUrl: string
  name: string
  apiKeyMasked: string
  createdAt: number
  updatedAt: number
}

export interface SaveLocalAiProviderApiKeyRequest {
  providerId: string
  baseUrl: string
  name: string
  apiKey: string
}

export function normalizeLocalAiProviderApiKeyMask(apiKeyMasked?: string | null): string {
  return (apiKeyMasked || '').replace('...', '****')
}

export function formatLocalAiProviderApiKeyLabel(key: LocalAiProviderApiKey): string {
  const maskedKey = normalizeLocalAiProviderApiKeyMask(key.apiKeyMasked)
  const name = (key.name || '').trim()
  if (!name) {
    return maskedKey
  }

  if (key.apiKeyMasked && name.includes(key.apiKeyMasked)) {
    return name.replace(key.apiKeyMasked, maskedKey)
  }
  if (maskedKey && name.includes(maskedKey)) {
    return name
  }
  return maskedKey ? `${name} · ${maskedKey}` : name
}

export interface LocalAiProviderProfile {
  id: string
  label: string
  dialect: string
  defaultBaseUrl: string
  models: string[]
  apiKeyUrl?: string | null
  supportsWebSearch: boolean
  supportsDeepThinking: boolean
}

export const LOCAL_AI_PROVIDER_PRESETS: LocalAiProviderProfile[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    dialect: 'openai-compatible',
    defaultBaseUrl: 'https://api.deepseek.com',
    models: [],
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    supportsWebSearch: false,
    supportsDeepThinking: true
  },
  {
    id: 'qwen',
    label: 'Qwen / 通义千问',
    dialect: 'openai-compatible',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [],
    apiKeyUrl: 'https://bailian.console.aliyun.com/?apiKey=1#/api-key',
    supportsWebSearch: true,
    supportsDeepThinking: true
  },
  {
    id: 'mimo',
    label: 'MiMo / 小米',
    dialect: 'openai-compatible',
    defaultBaseUrl: 'https://api.xiaomimimo.com/v1',
    models: [],
    apiKeyUrl: 'https://platform.xiaomimimo.com/#/console/api-keys',
    supportsWebSearch: false,
    supportsDeepThinking: true
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    dialect: 'openai-compatible',
    defaultBaseUrl: 'https://api.minimaxi.com/v1',
    models: [],
    apiKeyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    supportsWebSearch: false,
    supportsDeepThinking: true
  },
  {
    id: 'glm',
    label: 'GLM / 智谱',
    dialect: 'openai-compatible',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [],
    apiKeyUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',
    supportsWebSearch: true,
    supportsDeepThinking: true
  },
  {
    id: 'custom-openai-compatible',
    label: '自定义厂商（OpenAI Key 兼容）',
    dialect: 'openai-compatible',
    defaultBaseUrl: '',
    models: [],
    apiKeyUrl: null,
    supportsWebSearch: true,
    supportsDeepThinking: true
  }
]

const LOCAL_AI_PROVIDER_PRESET_IDS = new Set(LOCAL_AI_PROVIDER_PRESETS.map(provider => provider.id))
const LEGACY_PROVIDER_IDS = new Set<string>()

export interface TestLocalAiProviderSettingsRequest {
  providerId: string
  baseUrl: string
  model: string
  apiKey?: string
  apiKeyId?: string | null
}

export interface LocalAiProviderTestResponse {
  configured: boolean
  providerId: string
  model: string
  message: string
}

export interface RefreshLocalAiProviderModelsRequest {
  providerId: string
  baseUrl: string
  apiKey?: string
  apiKeyId?: string | null
}

export interface LocalAiProviderModelsResponse {
  models: string[]
}

export interface LocalAiProviderApiKeysResponse {
  keys: LocalAiProviderApiKey[]
}

export async function getLocalAiProviders(): Promise<LocalAiProviderProfile[]> {
  try {
    const response = await fetch(`${RANKPEEK_LOCAL_SERVICE_BASE_URL}/api/v1/ai/providers`)
    const payload = await parseLocalJson<{ providers?: LocalAiProviderProfile[] }>(response)
    if (!response.ok || payload.success === false) {
      throw new Error(readLocalApiErrorMessage(payload.error?.message ?? payload.message))
    }
    return mergeLocalAiProviderProfiles(payload.data?.providers ?? [])
  } catch {
    return LOCAL_AI_PROVIDER_PRESETS.map(provider => ({ ...provider, models: [...provider.models] }))
  }
}

export async function getLocalAiSettings(): Promise<LocalAiSettings> {
  const response = await fetch(`${RANKPEEK_LOCAL_SERVICE_BASE_URL}/api/v1/ai/settings`)
  const payload = await parseLocalJson<LocalAiSettings>(response)
  if (!response.ok || payload.success === false || !payload.data) {
    throw new Error(readLocalApiErrorMessage(payload.error?.message ?? payload.message))
  }
  return payload.data
}

export async function getLocalAiProviderApiKeys(
  providerId: string,
  baseUrl: string
): Promise<LocalAiProviderApiKey[]> {
  const params = new URLSearchParams({
    providerId,
    baseUrl
  })
  const response = await fetch(`${RANKPEEK_LOCAL_SERVICE_BASE_URL}/api/v1/ai/keys?${params.toString()}`)
  const payload = await parseLocalJson<LocalAiProviderApiKeysResponse>(response)
  if (!response.ok || payload.success === false || !payload.data) {
    throw new Error(readLocalApiErrorMessage(payload.error?.message ?? payload.message))
  }
  return payload.data.keys ?? []
}

export async function saveLocalAiProviderApiKey(
  request: SaveLocalAiProviderApiKeyRequest
): Promise<LocalAiProviderApiKey> {
  const response = await fetch(`${RANKPEEK_LOCAL_SERVICE_BASE_URL}/api/v1/ai/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  })
  const payload = await parseLocalJson<LocalAiProviderApiKey>(response)
  if (!response.ok || payload.success === false || !payload.data) {
    throw new Error(readLocalApiErrorMessage(payload.error?.message ?? payload.message))
  }
  return payload.data
}

export async function deleteLocalAiProviderApiKey(id: string): Promise<void> {
  const response = await fetch(
    `${RANKPEEK_LOCAL_SERVICE_BASE_URL}/api/v1/ai/keys/${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  )
  const payload = await parseLocalJson<{ deleted?: boolean }>(response)
  if (!response.ok || payload.success === false) {
    throw new Error(readLocalApiErrorMessage(payload.error?.message ?? payload.message))
  }
}

export async function saveLocalAiSettings(request: SaveLocalAiSettingsRequest): Promise<LocalAiSettings> {
  const response = await fetch(`${RANKPEEK_LOCAL_SERVICE_BASE_URL}/api/v1/ai/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  })
  const payload = await parseLocalJson<LocalAiSettings>(response)
  if (!response.ok || payload.success === false || !payload.data) {
    throw new Error(readLocalApiErrorMessage(payload.error?.message ?? payload.message))
  }
  return payload.data
}

export async function testLocalAiProviderSettings(
  request: TestLocalAiProviderSettingsRequest
): Promise<LocalAiProviderTestResponse> {
  const response = await fetch(`${RANKPEEK_LOCAL_SERVICE_BASE_URL}/api/v1/ai/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  })
  const payload = await parseLocalJson<LocalAiProviderTestResponse>(response)
  if (!response.ok || payload.success === false || !payload.data) {
    throw new Error(readLocalApiErrorMessage(payload.error?.message ?? payload.message))
  }
  return payload.data
}

export async function refreshLocalAiProviderModels(
  request: RefreshLocalAiProviderModelsRequest
): Promise<string[]> {
  const response = await fetch(`${RANKPEEK_LOCAL_SERVICE_BASE_URL}/api/v1/ai/models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  })
  const payload = await parseLocalJson<LocalAiProviderModelsResponse>(response)
  if (!response.ok || payload.success === false || !payload.data) {
    throw new Error(readLocalApiErrorMessage(payload.error?.message ?? payload.message))
  }
  return normalizeModelList(payload.data.models)
}

function readLocalApiErrorMessage(message?: string | null): string {
  return message?.trim() || 'Local RankPeek AI settings are unavailable.'
}

function mergeLocalAiProviderProfiles(providers: LocalAiProviderProfile[]): LocalAiProviderProfile[] {
  const incomingById = new Map(providers.map(provider => [provider.id, provider]))
  const mergedPresets = LOCAL_AI_PROVIDER_PRESETS.map(preset =>
    mergeLocalAiProviderProfile(preset, incomingById.get(preset.id))
  )
  const custom = mergedPresets.at(-1)
  const extras = providers.filter(provider =>
    !LOCAL_AI_PROVIDER_PRESET_IDS.has(provider.id) && !LEGACY_PROVIDER_IDS.has(provider.id)
  ).map(provider => ({ ...provider, models: [] }))
  return custom ? [...mergedPresets.slice(0, -1), ...extras, custom] : [...mergedPresets, ...extras]
}

function mergeLocalAiProviderProfile(
  preset: LocalAiProviderProfile,
  provider?: LocalAiProviderProfile
): LocalAiProviderProfile {
  if (!provider) {
    return { ...preset, models: [...preset.models] }
  }
  return {
    ...preset,
    ...provider,
    label: preset.label,
    defaultBaseUrl: provider.defaultBaseUrl || preset.defaultBaseUrl,
    models: [],
    apiKeyUrl: provider.apiKeyUrl ?? preset.apiKeyUrl,
    supportsWebSearch: typeof provider.supportsWebSearch === 'boolean'
      ? provider.supportsWebSearch
      : preset.supportsWebSearch,
    supportsDeepThinking: typeof provider.supportsDeepThinking === 'boolean'
      ? provider.supportsDeepThinking
      : preset.supportsDeepThinking
  }
}

function normalizeModelList(models?: string[] | null): string[] {
  const unique = new Set<string>()
  for (const model of models ?? []) {
    const normalized = String(model ?? '').trim()
    if (normalized) {
      unique.add(normalized)
    }
  }
  return Array.from(unique)
}
