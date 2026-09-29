import test from 'node:test'
import assert from 'node:assert/strict'
import {
  deleteLocalAiProviderApiKey,
  formatLocalAiProviderApiKeyLabel,
  getLocalAiSettings,
  getLocalAiProviderApiKeys,
  getLocalAiProviders,
  refreshLocalAiProviderModels,
  saveLocalAiProviderApiKey,
  saveLocalAiSettings,
  testLocalAiProviderSettings
} from './localAiProviderClient.ts'
import { RANKPEEK_LOCAL_SERVICE_BASE_URL } from './rankpeekLocalServiceClient.ts'

const savedKey = (overrides: Partial<{
  id: string
  providerId: string
  baseUrl: string
  name: string
  apiKeyMasked: string
  createdAt: number
  updatedAt: number
}> = {}) => ({
  id: 'key-1',
  providerId: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  name: 'DeepSeek-sk-****ceab',
  apiKeyMasked: 'sk-****ceab',
  createdAt: 100,
  updatedAt: 100,
  ...overrides
})

test('getLocalAiSettings calls local AI settings endpoint', async () => {
  const originalFetch = globalThis.fetch
  const calls: string[] = []

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(String(url))
    assert.equal(init, undefined)
    return new Response(JSON.stringify({
      success: true,
      data: {
        enabled: true,
        providerId: 'deepseek',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash',
        apiKeyId: 'key-1',
        apiKeySaved: true,
        apiKeyMasked: 'sk-...test',
        webSearchEnabled: false,
        deepThinkingEnabled: true,
        pricing: null
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }) as typeof fetch

  try {
    const settings = await getLocalAiSettings()

    assert.equal(calls[0], `${RANKPEEK_LOCAL_SERVICE_BASE_URL}/api/v1/ai/settings`)
    assert.equal(settings.providerId, 'deepseek')
    assert.equal(settings.apiKeyId, 'key-1')
    assert.equal(settings.apiKeySaved, true)
    assert.equal(settings.deepThinkingEnabled, true)
    assert.equal(settings.pricing, null)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('getLocalAiProviders exposes domestic presets with API key links', async () => {
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async () => new Response(JSON.stringify({
    success: true,
    data: {
      providers: [
        {
          id: 'deepseek',
          label: 'DeepSeek',
          dialect: 'openai-compatible',
          defaultBaseUrl: 'https://api.deepseek.com',
          models: ['deepseek-v4-flash'],
          apiKeyUrl: 'https://platform.deepseek.com/api_keys',
          supportsWebSearch: false,
          supportsDeepThinking: true
        },
        {
          id: 'custom-openai-compatible',
          label: 'Custom',
          dialect: 'openai-compatible',
          defaultBaseUrl: '',
          models: [],
          supportsWebSearch: true,
          supportsDeepThinking: true
        }
      ]
    }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })) as typeof fetch

  try {
    const providers = await getLocalAiProviders()

    assert.equal(providers[0]?.id, 'deepseek')
    assert.equal(providers[0]?.apiKeyUrl, 'https://platform.deepseek.com/api_keys')
    assert.equal(providers[0]?.supportsDeepThinking, true)
    assert.deepEqual(providers[0]?.models, [])
    assert.equal(providers[1]?.id, 'qwen')
    assert.equal(providers[2]?.id, 'mimo')
    assert.equal(providers[2]?.label, 'MiMo / 小米')
    assert.equal(providers[2]?.defaultBaseUrl, 'https://api.xiaomimimo.com/v1')
    assert.deepEqual(providers[2]?.models, [])
    assert.equal(providers[2]?.apiKeyUrl, 'https://platform.xiaomimimo.com/#/console/api-keys')
    assert.equal(providers[3]?.id, 'minimax')
    assert.equal(providers[3]?.label, 'MiniMax')
    assert.equal(providers[3]?.defaultBaseUrl, 'https://api.minimaxi.com/v1')
    assert.equal(providers[4]?.id, 'glm')
    assert.equal(providers.at(-1)?.id, 'custom-openai-compatible')
    assert.equal(providers.at(-1)?.label, '自定义厂商（OpenAI Key 兼容）')
    assert.equal(providers.at(-1)?.apiKeyUrl, null)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('getLocalAiProviders fills presets when local backend returns an older provider list', async () => {
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async () => new Response(JSON.stringify({
    success: true,
    data: {
      providers: [
        {
          id: 'deepseek',
          label: 'DeepSeek',
          dialect: 'openai-compatible',
          defaultBaseUrl: 'https://api.deepseek.com',
          models: ['deepseek-v4-flash'],
          apiKeyUrl: 'https://platform.deepseek.com/api_keys',
          supportsWebSearch: false,
          supportsDeepThinking: true
        },
        {
          id: 'custom-openai-compatible',
          label: 'Custom OpenAI-compatible',
          dialect: 'openai-compatible',
          defaultBaseUrl: '',
          models: [],
          supportsWebSearch: true,
          supportsDeepThinking: true
        }
      ]
    }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })) as typeof fetch

  try {
    const providers = await getLocalAiProviders()

    assert.deepEqual(providers.map(provider => provider.id), [
      'deepseek',
      'qwen',
      'mimo',
      'minimax',
      'glm',
      'custom-openai-compatible'
    ])
    assert.equal(providers.at(-1)?.label, '自定义厂商（OpenAI Key 兼容）')
    assert.deepEqual(providers.flatMap(provider => provider.models), [])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('refreshLocalAiProviderModels posts current provider credentials to local models endpoint', async () => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; init?: RequestInit }> = []

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify({
      success: true,
      data: {
        models: ['free-model-a', 'free-model-b']
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }) as typeof fetch

  try {
    const models = await refreshLocalAiProviderModels({
      providerId: 'custom-openai-compatible',
      baseUrl: 'https://provider.example/v1',
      apiKey: 'sk-unsaved-test',
      apiKeyId: 'key-1'
    })

    assert.equal(calls[0]?.url, `${RANKPEEK_LOCAL_SERVICE_BASE_URL}/api/v1/ai/models`)
    assert.equal(calls[0]?.init?.method, 'POST')
    assert.deepEqual(calls[0]?.init?.headers, { 'Content-Type': 'application/json' })
    assert.equal(JSON.parse(String(calls[0]?.init?.body)).apiKey, 'sk-unsaved-test')
    assert.equal(JSON.parse(String(calls[0]?.init?.body)).apiKeyId, 'key-1')
    assert.deepEqual(models, ['free-model-a', 'free-model-b'])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('saveLocalAiSettings uses PUT on local AI settings endpoint', async () => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; init?: RequestInit }> = []

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify({
      success: true,
      data: {
        enabled: true,
        providerId: 'custom-openai-compatible',
        baseUrl: 'https://provider.example/v1',
        model: 'free-model',
        apiKeyId: 'key-1',
        apiKeySaved: false,
        apiKeyMasked: null,
        webSearchEnabled: true,
        deepThinkingEnabled: false,
        pricing: null
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }) as typeof fetch

  try {
    const settings = await saveLocalAiSettings({
      enabled: true,
      providerId: 'custom-openai-compatible',
      baseUrl: 'https://provider.example/v1',
      model: 'free-model',
      apiKey: '',
      apiKeyId: 'key-1',
      webSearchEnabled: true,
      deepThinkingEnabled: false,
      pricing: null
    })

    assert.equal(calls[0]?.url, `${RANKPEEK_LOCAL_SERVICE_BASE_URL}/api/v1/ai/settings`)
    assert.equal(calls[0]?.init?.method, 'PUT')
    assert.deepEqual(calls[0]?.init?.headers, { 'Content-Type': 'application/json' })
    const request = JSON.parse(String(calls[0]?.init?.body))
    assert.equal(request.providerId, 'custom-openai-compatible')
    assert.equal(request.apiKeyId, 'key-1')
    assert.equal('saveApiKey' in request, false)
    assert.equal(request.webSearchEnabled, true)
    assert.equal(request.deepThinkingEnabled, false)
    assert.equal('temperature' in request, false)
    assert.equal('maxTokens' in request, false)
    assert.equal(settings.model, 'free-model')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('testLocalAiProviderSettings posts unsaved provider values to local test endpoint', async () => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; init?: RequestInit }> = []

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify({
      code: 200,
      message: 'success',
      data: {
        configured: true,
        providerId: 'custom-openai-compatible',
        model: 'free-model',
        message: 'AI provider connection succeeded.'
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }) as typeof fetch

  try {
    const result = await testLocalAiProviderSettings({
      providerId: 'custom-openai-compatible',
      baseUrl: 'https://provider.example/v1',
      model: 'free-model',
      apiKey: 'sk-unsaved-test',
      apiKeyId: 'key-1'
    })

    assert.equal(calls[0]?.url, `${RANKPEEK_LOCAL_SERVICE_BASE_URL}/api/v1/ai/test`)
    assert.equal(calls[0]?.init?.method, 'POST')
    assert.deepEqual(calls[0]?.init?.headers, { 'Content-Type': 'application/json' })
    assert.equal(JSON.parse(String(calls[0]?.init?.body)).apiKey, 'sk-unsaved-test')
    assert.equal(JSON.parse(String(calls[0]?.init?.body)).apiKeyId, 'key-1')
    assert.equal(result.configured, true)
    assert.equal(result.providerId, 'custom-openai-compatible')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('formatLocalAiProviderApiKeyLabel avoids duplicate masks and normalizes legacy ellipsis masks', () => {
  assert.equal(
    formatLocalAiProviderApiKeyLabel(savedKey({
      name: 'DeepSeek-sk-...ceab',
      apiKeyMasked: 'sk-...ceab'
    })),
    'DeepSeek-sk-****ceab'
  )
  assert.equal(
    formatLocalAiProviderApiKeyLabel(savedKey({
      name: 'DeepSeek-sk-****ceab',
      apiKeyMasked: 'sk-****ceab'
    })),
    'DeepSeek-sk-****ceab'
  )
  assert.equal(
    formatLocalAiProviderApiKeyLabel(savedKey({
      name: '主用 Key',
      apiKeyMasked: 'sk-****ceab'
    })),
    '主用 Key · sk-****ceab'
  )
})

test('getLocalAiProviderApiKeys filters keys by provider and base URL', async () => {
  const originalFetch = globalThis.fetch
  const calls: string[] = []

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(String(url))
    assert.equal(init, undefined)
    return new Response(JSON.stringify({
      success: true,
      data: {
        keys: [
          {
            id: 'key-1',
            providerId: 'deepseek',
            baseUrl: 'https://api.deepseek.com',
            name: 'DeepSeek-sk-...ceab',
            apiKeyMasked: 'sk-...ceab',
            createdAt: 100,
            updatedAt: 200
          }
        ]
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }) as typeof fetch

  try {
    const keys = await getLocalAiProviderApiKeys('deepseek', 'https://api.deepseek.com')

    assert.equal(
      calls[0],
      `${RANKPEEK_LOCAL_SERVICE_BASE_URL}/api/v1/ai/keys?providerId=deepseek&baseUrl=https%3A%2F%2Fapi.deepseek.com`
    )
    assert.equal(keys[0]?.id, 'key-1')
    assert.equal(keys[0]?.name, 'DeepSeek-sk-...ceab')
    assert.equal(keys[0]?.apiKeyMasked, 'sk-...ceab')
    assert.equal('apiKey' in keys[0], false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('saveLocalAiProviderApiKey posts key text and returns masked key metadata', async () => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; init?: RequestInit }> = []

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify({
      success: true,
      data: {
        id: 'key-1',
        providerId: 'deepseek',
        baseUrl: 'https://api.deepseek.com',
        name: 'DeepSeek-sk-...ceab',
        apiKeyMasked: 'sk-...ceab',
        createdAt: 100,
        updatedAt: 100
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }) as typeof fetch

  try {
    const key = await saveLocalAiProviderApiKey({
      providerId: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      name: '',
      apiKey: 'sk-raw-ceab'
    })

    assert.equal(calls[0]?.url, `${RANKPEEK_LOCAL_SERVICE_BASE_URL}/api/v1/ai/keys`)
    assert.equal(calls[0]?.init?.method, 'POST')
    assert.deepEqual(calls[0]?.init?.headers, { 'Content-Type': 'application/json' })
    const request = JSON.parse(String(calls[0]?.init?.body))
    assert.equal(request.name, '')
    assert.equal(request.apiKey, 'sk-raw-ceab')
    assert.equal(key.name, 'DeepSeek-sk-...ceab')
    assert.equal(key.apiKeyMasked, 'sk-...ceab')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('deleteLocalAiProviderApiKey uses DELETE on a saved local AI key', async () => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; init?: RequestInit }> = []

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify({
      success: true,
      data: { deleted: true }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }) as typeof fetch

  try {
    await deleteLocalAiProviderApiKey('key-1')

    assert.equal(calls[0]?.url, `${RANKPEEK_LOCAL_SERVICE_BASE_URL}/api/v1/ai/keys/key-1`)
    assert.equal(calls[0]?.init?.method, 'DELETE')
    assert.equal(calls[0]?.init?.body, undefined)
  } finally {
    globalThis.fetch = originalFetch
  }
})
