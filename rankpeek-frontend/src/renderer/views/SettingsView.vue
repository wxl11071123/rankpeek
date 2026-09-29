<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { apiClient } from '@/api/httpClient'
import { useThemeStore } from '@/stores/theme'
import { useI18n } from '@/i18n'
import type { GameModeOption } from '@/types/api'
import type { CacheClearMode } from '@/types/api'
import {
  buildCacheClearAlertMessage,
  extractCacheClearErrorMessage
} from '@/services/cacheClearFeedback'
import {
  getOrCreateCloudInstallationId,
  submitRankPeekFeedback
} from '@/services/rankpeekCloudClient'
import {
  LOCAL_AI_PROVIDER_PRESETS,
  deleteLocalAiProviderApiKey,
  formatLocalAiProviderApiKeyLabel,
  getLocalAiProviderApiKeys,
  getLocalAiProviders,
  getLocalAiSettings,
  refreshLocalAiProviderModels,
  saveLocalAiProviderApiKey,
  saveLocalAiSettings,
  testLocalAiProviderSettings,
  type LocalAiProviderApiKey,
  type LocalAiPricing,
  type LocalAiProviderProfile,
  type LocalAiSettings,
  type SaveLocalAiSettingsRequest
} from '@/services/localAiProviderClient'
import { checkRankPeekDataDiagnostics } from '@/services/rankpeekDataClient'
import { useAppUpdateInstaller } from '@/composables/useAppUpdateInstaller'
import { clearFrontendTransientCache } from '@/utils/frontendCache'
import { getDefaultMatchQueueMode, setCachedDefaultMatchQueueMode } from '@/utils/matchPreferences'
import brandSymbolBlack from '@/assets/branding/rankpeek-symbol-black.png'
import brandSymbolWhite from '@/assets/branding/rankpeek-symbol-white.png'
import brandEyeBlack from '@/assets/branding/rankpeek-eye-black.png'
import brandEyeWhite from '@/assets/branding/rankpeek-eye-white.png'
import sponsorAlipayQr from '@/assets/support/rankpeek-alipay-qr.png'
import sponsorWechatQr from '@/assets/support/rankpeek-wechat-qr.png'

interface AiPricingFormState {
  currency: string
  inputCacheHitCnyPerMillionTokens: string
  inputCacheMissCnyPerMillionTokens: string
  outputCnyPerMillionTokens: string
}

interface AiProviderFormState extends Omit<SaveLocalAiSettingsRequest, 'pricing'> {
  pricing: AiPricingFormState
}

interface SponsorOption {
  id: 'alipay' | 'wechat'
  labelKey: 'settings.supportAlipay' | 'settings.supportWechat'
  image: string
}

const themeStore = useThemeStore()
const { locale, t } = useI18n()

// 只作占位：真版本由 app:getVersion 提供（这里曾写死 1.1.0，发了两个版本都没动）
const appVersion = ref('')
const updateCheckResult = ref('')
// 检查 → 下载 → 安装并重启，全应用共用一份实现（公告中心用的是同一个）
const {
  updateInfo: updateAvailable,
  checking: checkingUpdate,
  downloadState: updateDownloadState,
  downloadPercent: updateDownloadPercent,
  checkUpdate: checkForAppUpdate,
  download: downloadAppUpdate,
  install: installAppUpdate
} = useAppUpdateInstaller()
const defaultMatchQueueMode = ref(0)
const matchModeOptions = ref<GameModeOption[]>([])
const savingMatchSettings = ref(false)
const clearingUserCacheMode = ref<CacheClearMode | null>(null)
const checkingLocalServer = ref(false)
const localAiProviderProfiles = ref<LocalAiProviderProfile[]>(
  LOCAL_AI_PROVIDER_PRESETS.map(provider => ({ ...provider, models: [...provider.models] }))
)
const localAiSettings = ref<LocalAiSettings | null>(null)
const loadingAiSettings = ref(false)
const savingAiSettings = ref(false)
const testingAiConnection = ref(false)
const loadingAiModels = ref(false)
const loadingAiApiKeys = ref(false)
const savingApiKey = ref(false)
const deletingApiKey = ref(false)
const aiProviderModelOptions = ref<string[]>([])
const localAiApiKeys = ref<LocalAiProviderApiKey[]>([])
const selectedApiKeyId = ref('')
const aiProviderStatusMessage = ref('')
const apiKeyDialogOpen = ref(false)
const activeSponsorId = ref<SponsorOption['id'] | ''>('')
const newApiKeyInput = ref('')
const newApiKeyNameInput = ref('')
const feedbackDialogOpen = ref(false)
const sendingFeedback = ref(false)
const feedbackStatusMessage = ref('')
let aiModelRefreshTimer: number | null = null
let lastAutoModelRefreshKey = ''
let aiKeyListTimer: number | null = null

const emptyAiPricing = (): AiPricingFormState => ({
  currency: 'CNY',
  inputCacheHitCnyPerMillionTokens: '',
  inputCacheMissCnyPerMillionTokens: '',
  outputCnyPerMillionTokens: ''
})

const aiProviderForm = reactive<AiProviderFormState>({
  enabled: true,
  providerId: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  apiKey: '',
  apiKeyId: null,
  webSearchEnabled: false,
  deepThinkingEnabled: false,
  pricing: emptyAiPricing()
})

const feedbackForm = reactive({
  contact: '',
  message: ''
})

const sponsorOptions: SponsorOption[] = [
  {
    id: 'alipay',
    labelKey: 'settings.supportAlipay',
    image: sponsorAlipayQr
  },
  {
    id: 'wechat',
    labelKey: 'settings.supportWechat',
    image: sponsorWechatQr
  }
]

const showcaseBackgroundLines = computed(() => [
  t('settings.showcaseLine1'),
  t('settings.showcaseLine2'),
  t('settings.showcaseLine3')
])

const aboutLogoSrc = computed(() =>
  themeStore.theme === 'dark' ? brandSymbolBlack : brandSymbolWhite
)

const aboutShowcaseSrc = computed(() =>
  themeStore.theme === 'dark' ? brandEyeBlack : brandEyeWhite
)

const selectedProviderProfile = computed(() =>
  localAiProviderProfiles.value.find(provider => provider.id === aiProviderForm.providerId) ?? null
)

const selectedProviderApiKeyUrl = computed(() => selectedProviderProfile.value?.apiKeyUrl?.trim() || '')

const selectedProviderSupportsWebSearch = computed(() =>
  selectedProviderProfile.value?.supportsWebSearch ?? true
)

const selectedProviderSupportsDeepThinking = computed(() =>
  selectedProviderProfile.value?.supportsDeepThinking ?? true
)

const isCustomAiProvider = computed(() =>
  aiProviderForm.providerId === 'custom-openai-compatible'
)

const shouldShowAiFeatureUsageNotice = computed(() =>
  aiProviderForm.webSearchEnabled || aiProviderForm.deepThinkingEnabled
)

const modelSelectOptions = computed(() => {
  const options = [...aiProviderModelOptions.value]
  const currentModel = aiProviderForm.model.trim()
  if (currentModel && options.length > 0 && !options.includes(currentModel)) {
    return [currentModel, ...options]
  }
  return options
})

const selectedApiKey = computed(() =>
  localAiApiKeys.value.find(key => key.id === selectedApiKeyId.value) ?? null
)

const activeSponsorOption = computed(() =>
  sponsorOptions.find(option => option.id === activeSponsorId.value) ?? null
)

function toggleAiProviderEnabled() {
  if (loadingAiSettings.value) {
    return
  }
  aiProviderForm.enabled = !aiProviderForm.enabled
}

function toggleAiProviderWebSearch() {
  if (!selectedProviderSupportsWebSearch.value) {
    return
  }
  aiProviderForm.webSearchEnabled = !aiProviderForm.webSearchEnabled
}

function toggleAiProviderDeepThinking() {
  if (!selectedProviderSupportsDeepThinking.value) {
    return
  }
  aiProviderForm.deepThinkingEnabled = !aiProviderForm.deepThinkingEnabled
}

if (window.electronAPI) {
  window.electronAPI
    .getVersion()
    .then(version => {
      appVersion.value = version ?? ''
    })
    .catch(() => {
      appVersion.value = ''
    })
}

async function handleCheckUpdate(): Promise<void> {
  updateCheckResult.value = ''
  const outcome = await checkForAppUpdate()
  if (outcome === 'available') {
    updateCheckResult.value = `发现新版本 v${updateAvailable.value?.version ?? ''}`
  } else if (outcome === 'latest') {
    updateCheckResult.value = '已是最新版本'
  } else {
    updateCheckResult.value = '检查失败，请稍后再试'
  }
}

onMounted(() => {
  void loadUserSettings()
  void loadLocalAiProviderSettings()
})

watch(
  () => [aiProviderForm.providerId, aiProviderForm.baseUrl, selectedApiKeyId.value] as const,
  () => scheduleAutoRefreshAiProviderModels()
)

watch(
  () => [aiProviderForm.providerId, aiProviderForm.baseUrl] as const,
  () => scheduleLoadAiApiKeys()
)

async function loadUserSettings() {
  try {
    const [config, modes, savedDefaultQueueMode] = await Promise.all([
      apiClient.getConfig(),
      apiClient.getGameModes(),
      getDefaultMatchQueueMode(true)
    ])

    matchModeOptions.value = modes
    defaultMatchQueueMode.value = config?.settings?.match?.defaultQueueMode ?? savedDefaultQueueMode
  } catch (error) {
    console.error('Failed to load settings', error)
  }
}

async function loadLocalAiProviderSettings() {
  loadingAiSettings.value = true
  aiProviderStatusMessage.value = ''

  try {
    const [providers, settings] = await Promise.all([
      getLocalAiProviders(),
      getLocalAiSettings()
    ])
    localAiProviderProfiles.value = providers
    applyLocalAiSettings(settings)
    await loadAiApiKeys(settings.apiKeyId ?? '')
  } catch (error) {
    console.error('Failed to load local AI settings', error)
    aiProviderStatusMessage.value = t('settings.aiSettingsUnavailable')
  } finally {
    loadingAiSettings.value = false
  }
}

function applyLocalAiSettings(settings: LocalAiSettings) {
  localAiSettings.value = settings
  aiProviderForm.enabled = settings.enabled
  aiProviderForm.providerId = settings.providerId
  aiProviderForm.baseUrl = settings.baseUrl
  aiProviderForm.model = settings.model
  aiProviderForm.apiKeyId = settings.apiKeyId ?? null
  selectedApiKeyId.value = settings.apiKeyId ?? ''
  aiProviderForm.webSearchEnabled = settings.webSearchEnabled
  aiProviderForm.deepThinkingEnabled = settings.deepThinkingEnabled
  aiProviderForm.pricing = pricingToForm(settings.pricing)
  resetNewApiKeyForm()
}

function applyProviderDefaults() {
  const provider = selectedProviderProfile.value
  if (!provider) {
    return
  }
  aiProviderForm.baseUrl = provider.defaultBaseUrl || aiProviderForm.baseUrl
  aiProviderForm.model = ''
  aiProviderForm.apiKeyId = null
  selectedApiKeyId.value = ''
  resetNewApiKeyForm()
  setAiProviderModelOptions([])
  aiProviderForm.webSearchEnabled = aiProviderForm.webSearchEnabled && provider.supportsWebSearch
  aiProviderForm.deepThinkingEnabled = aiProviderForm.deepThinkingEnabled && provider.supportsDeepThinking
  aiProviderForm.pricing = emptyAiPricing()
  scheduleLoadAiApiKeys()
  scheduleAutoRefreshAiProviderModels()
}

async function saveAiProviderSettings(showAlert = true): Promise<boolean> {
  savingAiSettings.value = true
  aiProviderStatusMessage.value = ''

  try {
    const settings = await saveLocalAiSettings(buildAiProviderRequest())
    applyLocalAiSettings(settings)
    aiProviderStatusMessage.value = t('settings.aiSettingsSaved')
    if (showAlert) {
      window.alert(t('settings.aiSettingsSaved'))
    }
    return true
  } catch (error) {
    console.error('Failed to save local AI settings', error)
    aiProviderStatusMessage.value = t('settings.aiSettingsUnavailable')
    if (showAlert) {
      window.alert(t('settings.aiSettingsUnavailable'))
    }
    return false
  } finally {
    savingAiSettings.value = false
  }
}

async function testLocalAiProviderConnection() {
  testingAiConnection.value = true
  aiProviderStatusMessage.value = ''
  try {
    const result = await testLocalAiProviderSettings(buildAiProviderTestRequest())
    aiProviderStatusMessage.value = result.configured
      ? t('settings.aiConnectionReady')
      : result.message || t('settings.aiSettingsUnavailable')
    window.alert(aiProviderStatusMessage.value)
  } catch (error) {
    console.error('Failed to test local AI provider', error)
    aiProviderStatusMessage.value = error instanceof Error && error.message
      ? error.message
      : t('settings.aiSettingsUnavailable')
    window.alert(aiProviderStatusMessage.value)
  } finally {
    testingAiConnection.value = false
  }
}

async function loadAiApiKeys(preferredKeyId = selectedApiKeyId.value) {
  const baseUrl = aiProviderForm.baseUrl.trim()
  if (!baseUrl) {
    localAiApiKeys.value = []
    selectedApiKeyId.value = ''
    aiProviderForm.apiKeyId = null
    return
  }

  loadingAiApiKeys.value = true
  try {
    const keys = await getLocalAiProviderApiKeys(aiProviderForm.providerId, baseUrl)
    localAiApiKeys.value = keys
    const preferred = preferredKeyId && keys.some(key => key.id === preferredKeyId)
      ? preferredKeyId
      : ''
    selectedApiKeyId.value = preferred
    aiProviderForm.apiKeyId = preferred || null
  } catch (error) {
    console.error('Failed to load local AI provider keys', error)
    localAiApiKeys.value = []
    selectedApiKeyId.value = ''
    aiProviderForm.apiKeyId = null
  } finally {
    loadingAiApiKeys.value = false
  }
}

function scheduleLoadAiApiKeys() {
  if (loadingAiSettings.value) {
    return
  }
  if (aiKeyListTimer !== null) {
    window.clearTimeout(aiKeyListTimer)
  }
  aiKeyListTimer = window.setTimeout(() => {
    void loadAiApiKeys()
  }, 400)
}

function handleSavedApiKeyChange() {
  aiProviderForm.apiKeyId = selectedApiKeyId.value || null
  scheduleAutoRefreshAiProviderModels()
}

function openAddApiKeyDialog() {
  resetNewApiKeyForm()
  apiKeyDialogOpen.value = true
}

function closeAddApiKeyDialog() {
  if (savingApiKey.value) {
    return
  }
  apiKeyDialogOpen.value = false
  resetNewApiKeyForm()
}

function resetNewApiKeyForm() {
  newApiKeyInput.value = ''
  newApiKeyNameInput.value = ''
}

function openFeedbackDialog() {
  feedbackStatusMessage.value = ''
  feedbackDialogOpen.value = true
}

function closeFeedbackDialog() {
  if (sendingFeedback.value) {
    return
  }
  feedbackDialogOpen.value = false
}

async function sendRankPeekFeedback() {
  const message = feedbackForm.message.trim()
  if (message.length < 3) {
    feedbackStatusMessage.value = '请至少输入 3 个字'
    return
  }

  sendingFeedback.value = true
  feedbackStatusMessage.value = ''

  try {
    let logs: Record<string, string> | undefined
    try {
      logs = await window.electronAPI?.getLogs()
    } catch {
      // log collection is optional
    }

    await submitRankPeekFeedback({
      category: 'other',
      contact: feedbackForm.contact,
      message
    }, {
      appVersion: appVersion.value,
      platform: window.electronAPI?.platform ?? navigator.platform,
      locale: locale.value,
      installationId: getOrCreateCloudInstallationId()
    }, logs)
    feedbackForm.contact = ''
    feedbackForm.message = ''
    feedbackStatusMessage.value = t('settings.feedbackSent')
  } catch (error) {
    console.error('Failed to submit RankPeek feedback', error)
    feedbackStatusMessage.value = t('settings.feedbackFailed')
  } finally {
    sendingFeedback.value = false
  }
}

async function saveAiProviderApiKey() {
  const rawKey = newApiKeyInput.value.trim()
  if (!rawKey) {
    aiProviderStatusMessage.value = t('settings.aiApiKeyRequired')
    return
  }
  savingApiKey.value = true
  aiProviderStatusMessage.value = ''
  try {
    const key = await saveLocalAiProviderApiKey({
      providerId: aiProviderForm.providerId,
      baseUrl: aiProviderForm.baseUrl,
      name: newApiKeyNameInput.value,
      apiKey: rawKey
    })
    await loadAiApiKeys(key.id)
    selectedApiKeyId.value = key.id
    aiProviderForm.apiKeyId = key.id
    apiKeyDialogOpen.value = false
    resetNewApiKeyForm()
    aiProviderStatusMessage.value = t('settings.aiApiKeySaved')
    scheduleAutoRefreshAiProviderModels()
  } catch (error) {
    console.error('Failed to save local AI provider key', error)
    aiProviderStatusMessage.value = error instanceof Error && error.message
      ? error.message
      : t('settings.aiSettingsUnavailable')
  } finally {
    savingApiKey.value = false
  }
}

async function deleteAiProviderApiKey() {
  const keyId = selectedApiKeyId.value
  if (!keyId) {
    return
  }
  const keyLabel = selectedApiKey.value
    ? formatLocalAiProviderApiKeyLabel(selectedApiKey.value)
    : keyId
  if (!window.confirm(t('settings.aiDeleteApiKeyConfirm', { name: keyLabel }))) {
    return
  }

  deletingApiKey.value = true
  aiProviderStatusMessage.value = ''
  try {
    await deleteLocalAiProviderApiKey(keyId)
    selectedApiKeyId.value = ''
    aiProviderForm.apiKeyId = null
    localAiApiKeys.value = localAiApiKeys.value.filter(key => key.id !== keyId)
    await loadAiApiKeys('')
    aiProviderStatusMessage.value = t('settings.aiApiKeyDeleted')
  } catch (error) {
    console.error('Failed to delete local AI provider key', error)
    aiProviderStatusMessage.value = error instanceof Error && error.message
      ? error.message
      : t('settings.aiSettingsUnavailable')
  } finally {
    deletingApiKey.value = false
  }
}

async function refreshAiProviderModels(options: { silent?: boolean } = {}) {
  if (!aiProviderForm.baseUrl.trim()) {
    if (!options.silent) {
      aiProviderStatusMessage.value = t('settings.aiModelsUnavailable')
    }
    return
  }

  loadingAiModels.value = true
  if (!options.silent) {
    aiProviderStatusMessage.value = ''
  }

  try {
    const models = await refreshLocalAiProviderModels(buildAiProviderModelsRequest())
    setAiProviderModelOptions(models)
    if (!aiProviderForm.model && models[0]) {
      aiProviderForm.model = models[0]
    }
    if (!options.silent) {
      aiProviderStatusMessage.value = t('settings.aiModelsLoaded')
    }
  } catch (error) {
    console.error('Failed to refresh local AI provider models', error)
    if (!options.silent) {
      aiProviderStatusMessage.value = t('settings.aiModelsUnavailable')
    }
  } finally {
    loadingAiModels.value = false
  }
}

function scheduleAutoRefreshAiProviderModels() {
  if (loadingAiSettings.value) {
    return
  }
  const baseUrl = aiProviderForm.baseUrl.trim()
  if (!baseUrl || !selectedApiKeyId.value) {
    return
  }

  const refreshKey = `${aiProviderForm.providerId}|${baseUrl}|${selectedApiKeyId.value}`
  if (refreshKey === lastAutoModelRefreshKey) {
    return
  }
  if (aiModelRefreshTimer !== null) {
    window.clearTimeout(aiModelRefreshTimer)
  }
  aiModelRefreshTimer = window.setTimeout(() => {
    lastAutoModelRefreshKey = refreshKey
    void refreshAiProviderModels({ silent: true })
  }, 600)
}

function buildAiProviderModelsRequest() {
  return {
    providerId: aiProviderForm.providerId,
    baseUrl: aiProviderForm.baseUrl,
    apiKey: '',
    apiKeyId: selectedApiKeyId.value || null
  }
}

function setAiProviderModelOptions(models: string[]) {
  const unique = new Set<string>()
  for (const model of models) {
    const normalized = model.trim()
    if (normalized) {
      unique.add(normalized)
    }
  }
  aiProviderModelOptions.value = Array.from(unique)
}

function buildAiProviderRequest(): SaveLocalAiSettingsRequest {
  return {
    enabled: aiProviderForm.enabled,
    providerId: aiProviderForm.providerId,
    baseUrl: aiProviderForm.baseUrl,
    model: aiProviderForm.model,
    apiKey: '',
    apiKeyId: selectedApiKeyId.value || null,
    webSearchEnabled: aiProviderForm.webSearchEnabled && selectedProviderSupportsWebSearch.value,
    deepThinkingEnabled: aiProviderForm.deepThinkingEnabled && selectedProviderSupportsDeepThinking.value,
    pricing: buildAiPricingPayload()
  }
}

function pricingToForm(pricing?: LocalAiPricing | null): AiPricingFormState {
  if (!pricing) {
    return emptyAiPricing()
  }
  return {
    currency: pricing.currency || 'CNY',
    inputCacheHitCnyPerMillionTokens: formatOptionalPrice(pricing.inputCacheHitCnyPerMillionTokens),
    inputCacheMissCnyPerMillionTokens: formatOptionalPrice(pricing.inputCacheMissCnyPerMillionTokens),
    outputCnyPerMillionTokens: formatOptionalPrice(pricing.outputCnyPerMillionTokens)
  }
}

function buildAiPricingPayload(): LocalAiPricing | null {
  const inputCacheHit = parseOptionalPrice(aiProviderForm.pricing.inputCacheHitCnyPerMillionTokens)
  const inputCacheMiss = parseOptionalPrice(aiProviderForm.pricing.inputCacheMissCnyPerMillionTokens)
  const output = parseOptionalPrice(aiProviderForm.pricing.outputCnyPerMillionTokens)
  if (inputCacheHit === null && inputCacheMiss === null && output === null) {
    return null
  }
  return {
    currency: aiProviderForm.pricing.currency || 'CNY',
    inputCacheHitCnyPerMillionTokens: inputCacheHit,
    inputCacheMissCnyPerMillionTokens: inputCacheMiss,
    outputCnyPerMillionTokens: output
  }
}

function parseOptionalPrice(value: string): number | null {
  const normalized = value.trim()
  if (!normalized) {
    return null
  }
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function formatOptionalPrice(value?: number | null): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

function buildAiProviderTestRequest() {
  return {
    providerId: aiProviderForm.providerId,
    baseUrl: aiProviderForm.baseUrl,
    model: aiProviderForm.model,
    apiKey: '',
    apiKeyId: selectedApiKeyId.value || null
  }
}

async function checkLocalRankPeekBackend() {
  checkingLocalServer.value = true

  try {
    const result = await checkRankPeekDataDiagnostics()
    if (result.available) {
      window.alert(t('settings.localServerAvailable', {
        mode: result.mode,
        version: result.version
      }))
      return
    }

    window.alert(t('settings.localServerUnavailable', { message: result.message }))
  } finally {
    checkingLocalServer.value = false
  }
}

async function saveMatchSettings() {
  savingMatchSettings.value = true

  try {
    await apiClient.setConfig('settings.match.defaultQueueMode', defaultMatchQueueMode.value)
    setCachedDefaultMatchQueueMode(defaultMatchQueueMode.value)
    window.alert(t('settings.defaultModeSaved'))
  } catch (error) {
    console.error('Failed to save default match mode', error)
    window.alert(t('settings.saveFailed'))
  } finally {
    savingMatchSettings.value = false
  }
}

async function clearUserCache(mode: CacheClearMode) {
  if (!window.confirm(t('settings.confirmClearCache'))) {
    return
  }

  clearingUserCacheMode.value = mode

  try {
    clearFrontendTransientCache()
    const result = await apiClient.clearCache('all', true, mode)
    if (mode === 'deep') {
      const [electronCacheResult, storageRetentionResult] = await Promise.all([
        window.electronAPI?.clearChromiumCache?.(),
        window.electronAPI?.database?.runStorageRetention?.()
      ])
      if (electronCacheResult && !electronCacheResult.success) {
        throw new Error(electronCacheResult.error)
      }
      if (storageRetentionResult && !storageRetentionResult.success) {
        throw new Error(storageRetentionResult.error)
      }
    }
    window.alert(buildCacheClearAlertMessage(result, {
      cleared: t('settings.cacheCleared'),
      partial: t('settings.clearCachePartialFailed'),
      failed: t('settings.clearCacheFailed')
    }))
  } catch (error) {
    console.error('Failed to clear cache', error)
    const message = extractCacheClearErrorMessage(error)
    window.alert(message ? `${t('settings.clearCacheFailed')}: ${message}` : t('settings.clearCacheFailed'))
  } finally {
    clearingUserCacheMode.value = null
  }
}

function openSponsorModal(id: SponsorOption['id']) {
  activeSponsorId.value = id
}

function closeSponsorModal() {
  activeSponsorId.value = ''
}
</script>

<template>
  <div class="settings-view">
    <header class="page-header">
      <div>
        <h1>{{ t('settings.title') }}</h1>
        <p>{{ t('settings.subtitle') }}</p>
      </div>
      <!-- 全应用唯一的更新入口：检查 → 下载 → 安装并重启，一条路走完 -->
      <div class="page-header-update">
        <span v-if="updateCheckResult" class="update-result">{{ updateCheckResult }}</span>

        <template v-if="updateDownloadState === 'downloading'">
          <span class="update-progress-text">下载中 {{ updateDownloadPercent }}%</span>
          <progress class="update-progress" :value="updateDownloadPercent" max="100" />
        </template>

        <button
          v-else-if="updateDownloadState === 'downloaded'"
          class="page-header-update-button"
          type="button"
          @click="installAppUpdate"
        >
          安装并重启
        </button>

        <button
          v-else-if="updateDownloadState === 'error'"
          class="page-header-update-button"
          type="button"
          @click="downloadAppUpdate"
        >
          下载失败，重试
        </button>

        <button
          v-else-if="updateAvailable"
          class="page-header-update-button"
          type="button"
          @click="downloadAppUpdate"
        >
          下载更新 v{{ updateAvailable.version }}
        </button>

        <button
          v-else
          class="page-header-update-button"
          :disabled="checkingUpdate"
          type="button"
          @click="handleCheckUpdate"
        >
          {{ checkingUpdate ? '检查中…' : '检查更新' }}
        </button>
      </div>
    </header>

    <section class="settings-section essentials-section">
      <h2>{{ t('settings.commonSettings') }}</h2>

      <div class="settings-list">
        <article class="setting-row">
          <div class="setting-copy">
            <h3>{{ t('settings.defaultMatchModeUser') }}</h3>
            <p>{{ t('settings.defaultMatchModeUserDescription') }}</p>
          </div>
          <div class="setting-control match-mode-control">
            <select
              v-model.number="defaultMatchQueueMode"
              class="select-input"
            >
              <option
                v-for="mode in matchModeOptions"
                :key="mode.id"
                :value="mode.id"
              >
                {{ mode.name }}
              </option>
            </select>
            <button
              class="primary-btn compact"
              type="button"
              :disabled="savingMatchSettings"
              @click="saveMatchSettings"
            >
              {{ savingMatchSettings ? t('settings.saving') : t('settings.saveDefaultMode') }}
            </button>
          </div>
        </article>

        <article class="setting-row">
          <div class="setting-copy">
            <h3>{{ t('settings.clearCacheUser') }}</h3>
            <p>{{ t('settings.clearCacheUserDescription') }}</p>
          </div>
          <div
            class="setting-control cache-clear-control"
            role="group"
            :aria-label="t('settings.clearCacheUser')"
          >
            <button
              class="secondary-btn compact"
              type="button"
              :disabled="clearingUserCacheMode !== null"
              @click="clearUserCache('normal')"
            >
              {{ clearingUserCacheMode === 'normal' ? t('settings.clearingCache') : t('settings.normalClearCacheAction') }}
            </button>
            <button
              class="secondary-btn compact"
              type="button"
              :disabled="clearingUserCacheMode !== null"
              @click="clearUserCache('deep')"
            >
              {{ clearingUserCacheMode === 'deep' ? t('settings.clearingCache') : t('settings.deepClearCacheAction') }}
            </button>
          </div>
        </article>

        <article class="setting-row">
          <div class="setting-copy">
            <h3>{{ t('settings.appearanceTheme') }}</h3>
            <p>{{ t('settings.appearanceThemeDescription') }}</p>
          </div>
          <div
            class="theme-toggle"
            role="group"
            :aria-label="t('settings.appearanceTheme')"
          >
            <button
              class="theme-option"
              type="button"
              :class="{ active: themeStore.theme === 'light' }"
              @click="themeStore.setTheme('light')"
            >
              {{ t('settings.lightMode') }}
            </button>
            <button
              class="theme-option"
              type="button"
              :class="{ active: themeStore.theme === 'dark' }"
              @click="themeStore.setTheme('dark')"
            >
              {{ t('settings.darkMode') }}
            </button>
          </div>
        </article>
      </div>
    </section>

    <section class="ai-provider-card">
      <div class="ai-provider-header">
        <div>
          <h2>{{ t('settings.aiProviderTitle') }}</h2>
          <p>{{ t('settings.aiProviderDescription') }}</p>
        </div>
        <div class="ai-provider-header-actions">
          <button
            class="settings-switch"
            type="button"
            role="switch"
            :aria-checked="aiProviderForm.enabled"
            :class="{ active: aiProviderForm.enabled }"
            :disabled="loadingAiSettings"
            @click="toggleAiProviderEnabled"
          >
            <span class="switch-track">
              <span class="switch-thumb" />
            </span>
            <span class="switch-label">{{ t('settings.aiEnabled') }}</span>
          </button>
          <button
            class="secondary-btn compact"
            type="button"
            :disabled="checkingLocalServer"
            @click="checkLocalRankPeekBackend"
          >
            {{ checkingLocalServer ? t('settings.checkingLocalServer') : t('settings.checkLocalServer') }}
          </button>
        </div>
      </div>

      <form
        class="ai-provider-form"
        @submit.prevent="saveAiProviderSettings()"
      >
        <div class="form-grid">
          <label class="form-field">
            <span class="field-label-row">
              <span>{{ t('settings.aiProviderSelect') }}</span>
            </span>
            <select
              v-model="aiProviderForm.providerId"
              class="select-input"
              :disabled="loadingAiSettings"
              @change="applyProviderDefaults"
            >
              <option
                v-for="provider in localAiProviderProfiles"
                :key="provider.id"
                :value="provider.id"
              >
                {{ provider.label }}
              </option>
            </select>
          </label>

          <div class="form-field">
            <span class="field-label-row">
              <span>{{ t('settings.aiModel') }}</span>
              <button
                class="inline-action-btn"
                type="button"
                :disabled="loadingAiModels || loadingAiSettings || !aiProviderForm.baseUrl.trim()"
                @click="refreshAiProviderModels()"
              >
                {{ loadingAiModels ? t('settings.aiRefreshingModels') : t('settings.aiRefreshModels') }}
              </button>
            </span>
            <select
              v-if="modelSelectOptions.length"
              v-model="aiProviderForm.model"
              :aria-label="t('settings.aiModel')"
              class="select-input"
            >
              <option
                v-for="model in modelSelectOptions"
                :key="model"
                :value="model"
              >
                {{ model }}
              </option>
            </select>
            <input
              v-else
              v-model.trim="aiProviderForm.model"
              :aria-label="t('settings.aiModel')"
              class="text-input"
              type="text"
            >
          </div>

          <label class="form-field wide">
            <span>{{ t('settings.aiBaseUrl') }}</span>
            <input
              v-model.trim="aiProviderForm.baseUrl"
              class="text-input"
              type="url"
            >
          </label>

          <div class="form-field wide api-key-field">
            <span class="field-label-row api-key-label-row">
              <span>{{ t('settings.aiApiKey') }}</span>
              <button
                class="inline-action-btn"
                type="button"
                :disabled="loadingAiSettings || !aiProviderForm.baseUrl.trim()"
                @click="openAddApiKeyDialog"
              >
                {{ t('settings.aiAddApiKey') }}
              </button>
              <a
                v-if="selectedProviderApiKeyUrl"
                class="api-key-link"
                :href="selectedProviderApiKeyUrl"
                rel="noreferrer"
                target="_blank"
              >
                {{ t('settings.aiApiKeyOpenPage') }}
              </a>
            </span>
            <div class="saved-key-row">
              <select
                v-model="selectedApiKeyId"
                :aria-label="t('settings.aiSavedKeySelect')"
                class="select-input"
                :disabled="loadingAiApiKeys || !localAiApiKeys.length"
                @change="handleSavedApiKeyChange"
              >
                <option value="">
                  {{ localAiApiKeys.length ? t('settings.aiNoSavedKey') : t('settings.aiNoSavedKeyPrompt') }}
                </option>
                <option
                  v-for="key in localAiApiKeys"
                  :key="key.id"
                  :value="key.id"
                >
                  {{ formatLocalAiProviderApiKeyLabel(key) }}
                </option>
              </select>
              <button
                class="secondary-btn compact danger-btn"
                type="button"
                :disabled="deletingApiKey || !selectedApiKeyId"
                @click="deleteAiProviderApiKey"
              >
                {{ deletingApiKey ? t('settings.aiDeletingApiKey') : t('settings.aiDeleteApiKey') }}
              </button>
            </div>
          </div>

          <div class="switch-field">
            <button
              class="settings-switch"
              type="button"
              role="switch"
              :aria-checked="aiProviderForm.webSearchEnabled"
              :class="{ active: aiProviderForm.webSearchEnabled }"
              :disabled="!selectedProviderSupportsWebSearch"
              @click="toggleAiProviderWebSearch"
            >
              <span class="switch-track">
                <span class="switch-thumb" />
              </span>
              <span class="switch-label">{{ t('settings.aiWebSearchEnabled') }}</span>
            </button>
          </div>

          <div class="switch-field">
            <button
              class="settings-switch"
              type="button"
              role="switch"
              :aria-checked="aiProviderForm.deepThinkingEnabled"
              :class="{ active: aiProviderForm.deepThinkingEnabled }"
              :disabled="!selectedProviderSupportsDeepThinking"
              @click="toggleAiProviderDeepThinking"
            >
              <span class="switch-track">
                <span class="switch-thumb" />
              </span>
              <span class="switch-label">{{ t('settings.aiDeepThinkingEnabled') }}</span>
            </button>
          </div>
        </div>

        <div class="ai-provider-notices">
          <p
            v-if="isCustomAiProvider"
            class="ai-provider-notice"
          >
            {{ t('settings.aiJsonModeRequiredNotice') }}
          </p>
          <p
            v-if="shouldShowAiFeatureUsageNotice"
            class="ai-provider-notice warning"
          >
            {{ t('settings.aiFeatureUsageNotice') }}
          </p>
          <p class="ai-provider-notice">
            {{ t('settings.aiWebSearchStructuredOutputNotice') }}
          </p>
        </div>

        <div class="pricing-panel">
          <div class="pricing-header">
            <span>{{ t('settings.aiPricingTitle') }}</span>
          </div>

          <div class="form-grid compact-grid">
            <label class="form-field">
              <span>{{ t('settings.aiInputCacheHitPrice') }}</span>
              <input
                v-model.trim="aiProviderForm.pricing.inputCacheHitCnyPerMillionTokens"
                class="text-input"
                inputmode="decimal"
                type="text"
              >
            </label>
            <label class="form-field">
              <span>{{ t('settings.aiInputCacheMissPrice') }}</span>
              <input
                v-model.trim="aiProviderForm.pricing.inputCacheMissCnyPerMillionTokens"
                class="text-input"
                inputmode="decimal"
                type="text"
              >
            </label>
            <label class="form-field">
              <span>{{ t('settings.aiOutputPrice') }}</span>
              <input
                v-model.trim="aiProviderForm.pricing.outputCnyPerMillionTokens"
                class="text-input"
                inputmode="decimal"
                type="text"
              >
            </label>
          </div>
        </div>

        <p
          v-if="aiProviderStatusMessage"
          class="status-message"
        >
          {{ aiProviderStatusMessage }}
        </p>

        <div class="form-actions">
          <button
            class="primary-btn"
            type="submit"
            :disabled="savingAiSettings || loadingAiSettings"
          >
            {{ savingAiSettings ? t('settings.saving') : t('settings.aiSaveProvider') }}
          </button>
          <button
            class="secondary-btn"
            type="button"
            :disabled="testingAiConnection || savingAiSettings || loadingAiSettings"
            @click="testLocalAiProviderConnection"
          >
            {{ testingAiConnection ? t('settings.checkingLocalServer') : t('settings.aiTestConnection') }}
          </button>
        </div>
      </form>
    </section>

    <section class="settings-section about-section">
      <h2>{{ t('settings.aboutRankPeek') }}</h2>
      <div
        class="about-card"
        :class="`theme-${themeStore.theme}`"
      >
        <div class="app-logo">
          <img
            :src="aboutLogoSrc"
            alt="RankPeek app symbol"
          >
        </div>
        <div class="app-info">
          <h3>RankPeek</h3>
          <p>{{ t('settings.tagline') }}</p>
          <p class="version">
            {{ t('settings.version', { version: appVersion }) }}
          </p>
          <div class="about-links">
            <button
              class="about-link-button"
              type="button"
              @click="openFeedbackDialog"
            >
              {{ t('settings.feedbackAction') }}
            </button>
          </div>
        </div>
        <div class="app-showcase">
          <div
            class="showcase-backdrop"
            aria-hidden="true"
          >
            <div
              v-for="(line, index) in showcaseBackgroundLines"
              :key="`${line}-${index}`"
              class="showcase-track"
              :class="{ mirrored: index % 2 === 1 }"
            >
              <span
                v-for="copy in 2"
                :key="`${line}-${copy}`"
              >{{ line }}</span>
            </div>
          </div>

          <div class="showcase-center-mark">
            <img
              class="showcase-mark"
              :src="aboutShowcaseSrc"
              alt="RankPeek eye logo artwork"
            >
          </div>
        </div>
      </div>
    </section>

    <section class="settings-section support-section">
      <h2>{{ t('settings.supportRankPeek') }}</h2>
      <div class="support-card">
        <div class="support-copy">
          <h3>{{ t('settings.supportRankPeek') }}</h3>
          <p>{{ t('settings.supportDescription') }}</p>
        </div>
        <div
          class="support-options"
          role="list"
        >
          <button
            v-for="option in sponsorOptions"
            :key="option.id"
            class="support-code-button"
            type="button"
            role="listitem"
            :aria-label="t('settings.supportOpenQr', { name: t(option.labelKey) })"
            @click="openSponsorModal(option.id)"
          >
            <span class="support-code-thumb">
              <img
                :src="option.image"
                :alt="t(option.labelKey)"
              >
            </span>
            <span class="support-code-label">{{ t(option.labelKey) }}</span>
          </button>
        </div>
      </div>
    </section>

    <div
      v-if="apiKeyDialogOpen"
      class="settings-modal-overlay"
      @click.self="closeAddApiKeyDialog"
    >
      <section
        class="settings-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-api-key-title"
      >
        <header class="settings-modal-header">
          <h2 id="add-api-key-title">
            {{ t('settings.aiAddApiKeyTitle') }}
          </h2>
        </header>

        <div class="settings-modal-form">
          <label class="form-field">
            <span>{{ t('settings.aiApiKeyName') }}</span>
            <input
              v-model.trim="newApiKeyNameInput"
              class="text-input"
              :placeholder="t('settings.aiApiKeyNamePlaceholder')"
              type="text"
            >
          </label>

          <label class="form-field">
            <span>{{ t('settings.aiApiKey') }}</span>
            <input
              v-model="newApiKeyInput"
              autocomplete="off"
              class="text-input"
              :placeholder="t('settings.aiApiKeyPlaceholder')"
              type="password"
            >
          </label>
        </div>

        <footer class="settings-modal-actions">
          <button
            class="secondary-btn"
            type="button"
            :disabled="savingApiKey"
            @click="closeAddApiKeyDialog"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            class="primary-btn"
            type="button"
            :disabled="savingApiKey || !newApiKeyInput.trim() || !aiProviderForm.baseUrl.trim()"
            @click="saveAiProviderApiKey"
          >
            {{ savingApiKey ? t('settings.aiSavingApiKey') : t('settings.aiSaveApiKeyAction') }}
          </button>
        </footer>
      </section>
    </div>

    <div
      v-if="feedbackDialogOpen"
      class="settings-modal-overlay"
      @click.self="closeFeedbackDialog"
    >
      <section
        class="settings-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rankpeek-feedback-title"
      >
        <header class="settings-modal-header">
          <h2 id="rankpeek-feedback-title">
            {{ t('settings.feedbackTitle') }}
          </h2>
          <p>{{ t('settings.feedbackDescription') }}</p>
        </header>

        <form
          class="settings-modal-form"
          @submit.prevent="sendRankPeekFeedback"
        >
          <label class="form-field">
            <div class="form-field-header">
              <span>{{ t('settings.feedbackMessage') }}</span>
              <span
                class="char-hint"
                :class="{ enough: feedbackForm.message.trim().length >= 3 }"
              >
                {{ feedbackForm.message.trim().length ? `${feedbackForm.message.trim().length} / 3` : '至少输入3个字符' }}
              </span>
            </div>
            <textarea
              v-model.trim="feedbackForm.message"
              class="text-input textarea-input"
              :placeholder="t('settings.feedbackMessagePlaceholder')"
              rows="5"
            />
          </label>

          <label class="form-field">
            <span>{{ t('settings.feedbackContact') }}</span>
            <input
              v-model.trim="feedbackForm.contact"
              class="text-input"
              :placeholder="t('settings.feedbackContactPlaceholder')"
              type="text"
            >
          </label>

          <p class="feedback-privacy-note">
            {{ t('settings.feedbackPrivacyNote') }}
          </p>
          <p
            v-if="feedbackStatusMessage"
            class="status-message"
          >
            {{ feedbackStatusMessage }}
          </p>
        </form>

        <footer class="settings-modal-actions">
          <button
            class="secondary-btn"
            type="button"
            :disabled="sendingFeedback"
            @click="closeFeedbackDialog"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            class="primary-btn"
            type="button"
            :disabled="sendingFeedback || feedbackForm.message.trim().length < 3"
            @click="sendRankPeekFeedback"
          >
            {{ sendingFeedback ? t('settings.feedbackSubmitting') : t('settings.feedbackSubmit') }}
          </button>
        </footer>
      </section>
    </div>

    <div
      v-if="activeSponsorOption"
      class="settings-modal-overlay"
      @click.self="closeSponsorModal"
    >
      <section
        class="settings-modal-panel support-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-qr-title"
      >
        <header class="settings-modal-header support-modal-header">
          <h2 id="support-qr-title">
            {{ t(activeSponsorOption.labelKey) }}
          </h2>
          <button
            class="support-modal-close"
            type="button"
            :aria-label="t('settings.supportCloseQr')"
            @click="closeSponsorModal"
          >
            {{ t('settings.supportCloseQr') }}
          </button>
        </header>

        <div class="support-modal-body">
          <img
            class="support-modal-qr"
            :src="activeSponsorOption.image"
            :alt="t(activeSponsorOption.labelKey)"
          >
          <p>{{ t('settings.supportScanHint') }}</p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  --settings-switch-track-off: rgba(23, 23, 25, 0.98);
  --settings-switch-track-on: rgba(33, 196, 255, 0.78);
  --settings-switch-track-border: var(--border-color);
  --settings-switch-thumb-color: #9eabb8;
  --settings-switch-thumb-active: #dbeeff;
  --settings-switch-thumb-shadow: 0 1px 2px rgba(0, 0, 0, 0.28);
  max-width: 880px;
  margin: 0 auto;
}

:global([data-theme="light"] .settings-view) {
  --settings-switch-track-off: rgba(245, 245, 247, 0.98);
  --settings-switch-track-on: rgba(41, 151, 255, 0.46);
  --settings-switch-track-border: var(--border-color);
  --settings-switch-thumb-color: #fffaf0;
  --settings-switch-thumb-active: #ffffff;
  --settings-switch-thumb-shadow: 0 1px 2px rgba(90, 70, 20, 0.2);
}

.page-header {
  margin-bottom: 22px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

/* 页头右上角的「检查更新」入口：主按钮，要显眼 */
.page-header-update {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 4px;
}

.page-header-update-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 22px;
  border: none;
  border-radius: 8px;
  background: var(--accent-primary, var(--primary-color, #2f6fed));
  color: #fff;
  font-family: inherit;
  font-size: 14px;
  font-weight: 650;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: filter 0.15s ease, transform 0.05s ease;
}

.page-header-update-button:hover:not(:disabled) {
  filter: brightness(1.12);
}

.page-header-update-button:active:not(:disabled) {
  transform: translateY(1px);
}

.page-header-update-button:disabled {
  opacity: 0.6;
  cursor: default;
}

.update-progress-text {
  color: var(--text-secondary);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.update-progress {
  width: 160px;
  height: 8px;
  border: none;
  border-radius: 999px;
  overflow: hidden;
}

.page-header h1 {
  margin: 0 0 6px;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 0;
}

.page-header p,
.ai-provider-header p,
.setting-copy p,
.app-info p,
.support-copy p {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.ai-provider-card,
.settings-list,
.about-card,
.support-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}

.ai-provider-card {
  padding: 22px 24px;
  margin-bottom: 30px;
}

.ai-provider-header,
.form-actions,
.pricing-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.ai-provider-header {
  margin-bottom: 18px;
}

.ai-provider-header-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex: 0 0 auto;
}

.ai-provider-header h2,
.setting-copy h3,
.app-info h3,
.support-copy h3 {
  margin: 0;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-weight: 650;
  letter-spacing: 0;
}

.ai-provider-header h2 {
  font-size: 20px;
}

.ai-provider-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.compact-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.form-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 7px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 650;
}

.form-field-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.char-hint {
  font-weight: 450;
  color: var(--text-muted);
}

.char-hint.enough {
  color: var(--text-secondary);
}

.form-field.wide {
  grid-column: 1 / -1;
}

.field-label-row {
  min-height: 26px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.api-key-label-row {
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 10px;
}

.api-key-label-row > span,
.api-key-label-row .inline-action-btn,
.api-key-link {
  flex: 0 0 auto;
  white-space: nowrap;
}

.api-key-link {
  color: var(--accent-color);
  font-size: 12px;
  font-weight: 650;
  text-decoration: none;
}

.api-key-link:hover {
  text-decoration: underline;
}

.saved-key-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.inline-action-btn {
  min-height: 26px;
  padding: 0 10px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.inline-action-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.switch-field {
  display: inline-flex;
  align-items: center;
  min-width: 0;
}

.settings-switch {
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.24s ease, opacity 0.24s ease;
}

.switch-label {
  white-space: nowrap;
}

.settings-switch:hover:not(:disabled),
.settings-switch:focus-visible {
  border-color: rgba(var(--accent-rgb), 0.42);
  background: var(--bg-secondary);
  box-shadow: 0 0 0 1px rgba(var(--accent-rgb), 0.14), 0 0 16px rgba(var(--accent-rgb), 0.16);
  outline: none;
}

.settings-switch:active:not(:disabled) {
  background: var(--input-bg);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(var(--accent-rgb), 0.12);
}

.settings-switch.active {
  border-color: var(--border-subtle);
}

.settings-switch:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.switch-track {
  width: 54px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  padding: 2px;
  border: 1px solid var(--settings-switch-track-border);
  border-radius: 999px;
  background: var(--settings-switch-track-off);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
  transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.switch-thumb {
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  border-radius: 999px;
  background: var(--settings-switch-thumb-color);
  box-shadow: var(--settings-switch-thumb-shadow);
  transform: translateX(0);
  transition: transform 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}

.settings-switch:hover:not(:disabled) .switch-track,
.settings-switch:focus-visible .switch-track {
  border-color: rgba(var(--accent-rgb), 0.44);
  box-shadow:
    inset 0 1px 2px rgba(0, 0, 0, 0.2),
    0 0 0 1px rgba(var(--accent-rgb), 0.12);
}

.settings-switch.active .switch-track {
  background: var(--settings-switch-track-on);
  border-color: var(--settings-switch-track-border);
}

.settings-switch.active .switch-thumb {
  transform: translateX(24px);
  background: var(--settings-switch-thumb-active);
}

.pricing-panel {
  padding: 14px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-tertiary);
}

.ai-provider-notices {
  display: grid;
  gap: 4px;
  margin: -2px 0 0;
}

.ai-provider-notice {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.ai-provider-notice.warning {
  color: var(--accent-gold);
}

.pricing-header {
  margin-bottom: 12px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
}

.segmented-control,
.theme-toggle {
  display: flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-tertiary);
}

.segment-button,
.theme-option {
  min-height: 34px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  padding: 0 12px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0;
  cursor: pointer;
}

.segment-button.active,
.theme-option.active {
  background: var(--accent-color);
  color: #fff;
}

.status-message {
  margin: 0;
  color: var(--accent-color);
  font-size: 13px;
  font-weight: 650;
}

.settings-section {
  margin-bottom: 30px;
}

.settings-section h2 {
  margin: 0 0 12px;
  color: var(--text-secondary);
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.settings-list {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border-subtle);
}

.setting-row:last-child {
  border-bottom: 0;
}

.setting-copy {
  min-width: 0;
  flex: 1 1 auto;
}

.setting-copy h3 {
  font-size: 15px;
}

.setting-control {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex: 0 0 auto;
}

.match-mode-control {
  min-width: min(100%, 360px);
}

.select-input,
.text-input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--input-border);
  border-radius: var(--radius-md);
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  outline: none;
}

.select-input:focus,
.text-input:focus {
  border-color: var(--input-focus-border);
  box-shadow:
    0 0 0 1px rgba(var(--accent-rgb), 0.18),
    0 0 16px rgba(var(--accent-rgb), 0.18);
}

.primary-btn,
.secondary-btn {
  box-sizing: border-box;
  min-height: 40px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0;
  cursor: pointer;
}

.primary-btn {
  padding: 0 18px;
  background: var(--accent-color);
  color: #fff;
  box-shadow: 0 0 14px rgba(var(--accent-rgb), 0.22);
}

.secondary-btn {
  padding: 0 18px;
  border-color: var(--border-subtle);
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.danger-btn {
  border-color: rgba(239, 68, 68, 0.35);
  color: #f87171;
}

.compact {
  min-width: 88px;
  padding-inline: 16px;
}

.primary-btn:disabled,
.secondary-btn:disabled,
.text-input:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.about-section {
  margin-top: 8px;
}

.support-section {
  margin-bottom: 0;
}

.settings-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.56);
}

.settings-modal-panel {
  width: min(100%, 460px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--bg-secondary);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.38);
}

.settings-modal-header {
  padding: 20px 22px 12px;
}

.settings-modal-header h2 {
  margin: 0;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 650;
  letter-spacing: 0;
}

.settings-modal-header p {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.55;
}

.settings-modal-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 0 22px 18px;
}

.settings-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 22px 20px;
  border-top: 1px solid var(--border-subtle);
}

.support-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 20px;
  padding: 20px;
}

.support-copy h3 {
  font-size: 16px;
}

.support-options {
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
  gap: 12px;
}

.support-code-button {
  width: 124px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  cursor: pointer;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast);
}

.support-code-button:hover,
.support-code-button:focus-visible {
  border-color: rgba(var(--accent-rgb), 0.42);
  background: var(--bg-secondary);
  box-shadow: 0 0 0 1px rgba(var(--accent-rgb), 0.12), 0 0 16px rgba(var(--accent-rgb), 0.14);
  outline: none;
}

.support-code-thumb {
  width: 92px;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border-radius: var(--radius-sm);
  background: #fff;
}

.support-code-thumb img,
.support-modal-qr {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.support-code-label {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.support-modal-panel {
  width: min(100%, 420px);
}

.support-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.support-modal-close {
  min-height: 30px;
  flex: 0 0 auto;
  padding: 0 10px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.support-modal-close:hover,
.support-modal-close:focus-visible {
  border-color: rgba(var(--accent-rgb), 0.4);
  outline: none;
}

.support-modal-body {
  display: grid;
  justify-items: center;
  gap: 12px;
  padding: 4px 22px 24px;
}

.support-modal-qr {
  width: min(72vw, 320px);
  height: min(72vw, 320px);
  padding: 12px;
  border-radius: var(--radius-md);
  background: #fff;
}

.support-modal-body p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
}

.textarea-input {
  min-height: 118px;
  padding-top: 10px;
  padding-bottom: 10px;
  line-height: 1.55;
  resize: vertical;
}

.feedback-privacy-note {
  margin: -2px 0 0;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.about-card {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr) 248px;
  align-items: center;
  gap: 24px;
  padding: 24px;
  opacity: 0.92;
}

.app-logo {
  width: 120px;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  border-radius: 28px;
  overflow: hidden;
}

.app-logo img {
  width: 96%;
  height: 96%;
  object-fit: contain;
}

.app-info h3 {
  font-size: 20px;
}

.app-info .version {
  margin-top: 8px;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  font-size: 12px;
}

.about-links {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.about-links a,
.about-link-button {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

.about-links a:hover,
.about-link-button:hover {
  color: var(--accent-color);
}

.app-showcase {
  height: 144px;
  padding: 18px 20px;
  position: relative;
  display: flex;
  align-items: stretch;
  justify-content: center;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 28px;
  overflow: hidden;
  isolation: isolate;
  pointer-events: none;
}

.showcase-backdrop {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
  padding: 18px 0;
  overflow: hidden;
  z-index: 0;
}

.showcase-backdrop::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.22),
    transparent 22%,
    transparent 78%,
    rgba(255, 255, 255, 0.22)
  );
  pointer-events: none;
}

.showcase-track {
  display: flex;
  width: max-content;
  gap: 22px;
  color: rgba(15, 23, 42, 0.15);
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  white-space: nowrap;
  animation: showcase-scroll-left 24s linear infinite;
}

.showcase-track.mirrored {
  animation-name: showcase-scroll-right;
}

.showcase-track span {
  display: flex;
  align-items: center;
  gap: 22px;
}

.showcase-center-mark {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.showcase-center-mark::before {
  content: "";
  position: absolute;
  width: 166px;
  height: 166px;
  border-radius: 999px;
  filter: blur(10px);
  opacity: 0.56;
  z-index: -1;
}

.showcase-mark {
  width: 154px;
  height: 154px;
  object-fit: contain;
}

.about-card.theme-dark .app-logo,
.about-card.theme-dark .app-showcase {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(245, 247, 250, 0.92));
  border-color: rgba(15, 23, 42, 0.08);
}

.about-card.theme-light .app-logo,
.about-card.theme-light .app-showcase {
  background: linear-gradient(180deg, #05070f, #0d1220);
  border-color: rgba(148, 163, 184, 0.18);
}

.about-card.theme-light .showcase-track {
  color: rgba(241, 245, 249, 0.13);
}

.about-card.theme-light .showcase-backdrop::after {
  background: linear-gradient(
    90deg,
    rgba(5, 7, 15, 0.44),
    transparent 22%,
    transparent 78%,
    rgba(5, 7, 15, 0.44)
  );
}

.about-card.theme-dark .showcase-center-mark::before {
  background: radial-gradient(circle, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0));
}

.about-card.theme-light .showcase-center-mark::before {
  background: radial-gradient(circle, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0));
}

@keyframes showcase-scroll-left {
  from {
    transform: translateX(0);
  }

  to {
    transform: translateX(-34%);
  }
}

@keyframes showcase-scroll-right {
  from {
    transform: translateX(-34%);
  }

  to {
    transform: translateX(0);
  }
}

@media (max-width: 760px) {
  .ai-provider-header,
  .setting-row,
  .form-actions,
  .support-card {
    align-items: stretch;
    flex-direction: column;
  }

  .form-grid,
  .compact-grid {
    grid-template-columns: 1fr;
  }

  .setting-control,
  .match-mode-control,
  .theme-toggle {
    width: 100%;
  }

  .setting-control {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .ai-provider-header-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .support-options {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .support-card {
    grid-template-columns: 1fr;
  }

  .support-code-button {
    flex: 1 1 124px;
  }

  .primary-btn,
  .secondary-btn {
    flex: 1 1 120px;
  }

  .about-card {
    grid-template-columns: 120px 1fr;
  }

  .app-showcase {
    grid-column: 1 / -1;
  }
}
</style>
