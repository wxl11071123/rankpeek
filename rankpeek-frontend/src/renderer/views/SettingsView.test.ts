import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./SettingsView.vue', import.meta.url), 'utf8')
const zh = readFileSync(new URL('../i18n/locales/zh-CN.ts', import.meta.url), 'utf8')
const en = readFileSync(new URL('../i18n/locales/en-US.ts', import.meta.url), 'utf8')
const oldAuthClientPattern = new RegExp(['rankpeek', 'AuthClient'].join(''))

test('settings page uses local AI provider configuration', () => {
  assert.match(source, /getLocalAiProviders/)
  assert.match(source, /getLocalAiSettings/)
  assert.match(source, /getLocalAiProviderApiKeys/)
  assert.match(source, /saveLocalAiProviderApiKey/)
  assert.match(source, /deleteLocalAiProviderApiKey/)
  assert.match(source, /formatLocalAiProviderApiKeyLabel/)
  assert.match(source, /saveLocalAiSettings/)
  assert.match(source, /refreshLocalAiProviderModels/)
  assert.match(source, /testLocalAiProviderSettings/)
  assert.match(source, /localAiProviderProfiles/)
  assert.match(source, /LOCAL_AI_PROVIDER_PRESETS/)
  assert.match(source, /aiProviderModelOptions/)
  assert.match(source, /modelSelectOptions/)
  assert.match(source, /refreshAiProviderModels/)
  assert.match(source, /aiProviderForm/)
  assert.match(source, /newApiKeyInput/)
  assert.match(source, /newApiKeyNameInput/)
  assert.match(source, /apiKeyDialogOpen/)
  assert.match(source, /selectedApiKeyId/)
  assert.match(source, /localAiApiKeys/)
  assert.match(source, /saveAiProviderApiKey/)
  assert.match(source, /deleteAiProviderApiKey/)
  assert.match(source, /openAddApiKeyDialog/)
  assert.doesNotMatch(source, /saveApiKey/)
  assert.match(source, /testLocalAiProviderConnection/)
  assert.doesNotMatch(source, /const saved = await saveAiProviderSettings\(false\)/)
  assert.match(source, /settings\.aiProviderTitle/)
  assert.match(source, /settings\.aiProviderDescription/)
  assert.match(source, /settings\.aiProviderSelect/)
  assert.match(source, /settings\.aiBaseUrl/)
  assert.match(source, /settings\.aiModel/)
  assert.match(source, /settings\.aiRefreshModels/)
  assert.match(source, /settings\.aiRefreshingModels/)
  assert.match(source, /settings\.aiModelsLoaded/)
  assert.match(source, /settings\.aiModelsUnavailable/)
  assert.match(source, /settings\.aiApiKey/)
  assert.match(source, /settings\.aiApiKeyOpenPage/)
  assert.match(source, /settings\.aiAddApiKey/)
  assert.match(source, /settings\.aiAddApiKeyTitle/)
  assert.match(source, /settings\.aiApiKeyName/)
  assert.match(source, /settings\.aiSaveApiKeyAction/)
  assert.match(source, /settings\.aiSavingApiKey/)
  assert.match(source, /settings\.aiApiKeySaved/)
  assert.match(source, /settings\.aiApiKeyDeleted/)
  assert.match(source, /settings\.aiSavedKeySelect/)
  assert.match(source, /settings\.aiNoSavedKeyPrompt/)
  assert.match(source, /settings\.aiDeleteApiKey/)
  assert.match(source, /settings\.aiDeleteApiKeyConfirm/)
  assert.match(source, /settings\.aiWebSearchEnabled/)
  assert.match(source, /settings\.aiDeepThinkingEnabled/)
  assert.match(source, /settings\.aiPricingTitle/)
  assert.match(source, /settings\.aiJsonModeRequiredNotice/)
  assert.match(source, /settings\.aiFeatureUsageNotice/)
  assert.match(source, /settings\.aiWebSearchStructuredOutputNotice/)
  assert.match(source, /settings\.aiTestConnection/)
  assert.match(source, /settings\.aiSavedKey/)
  assert.match(source, /selectedProviderApiKeyUrl/)
  assert.match(source, /webSearchEnabled/)
  assert.match(source, /deepThinkingEnabled/)
  assert.match(source, /const isCustomAiProvider = computed/)
  assert.match(source, /aiProviderForm\.providerId === 'custom-openai-compatible'/)
  assert.match(source, /v-if="isCustomAiProvider"[\s\S]*settings\.aiJsonModeRequiredNotice/)
  assert.match(source, /const shouldShowAiFeatureUsageNotice = computed/)
  assert.match(source, /v-if="shouldShowAiFeatureUsageNotice"[\s\S]*settings\.aiFeatureUsageNotice/)
  assert.match(source, /<select[\s\S]*v-if="modelSelectOptions\.length"[\s\S]*v-model="aiProviderForm\.model"/)
  assert.match(source, /<input[\s\S]*v-else[\s\S]*v-model\.trim="aiProviderForm\.model"/)
  assert.match(source, /<select[\s\S]*v-model="selectedApiKeyId"[\s\S]*:disabled="loadingAiApiKeys \|\| !localAiApiKeys\.length"[\s\S]*v-for="key in localAiApiKeys"/)
  assert.match(source, /<button[\s\S]*@click="saveAiProviderApiKey"/)
  assert.match(source, /<button[\s\S]*@click="deleteAiProviderApiKey"/)
  assert.match(source, /formatLocalAiProviderApiKeyLabel\(selectedApiKey\.value\)/)
  assert.match(source, /{{ formatLocalAiProviderApiKeyLabel\(key\) }}/)
  assert.match(source, /role="dialog"/)
  assert.match(source, /v-model\.trim="newApiKeyNameInput"/)
  assert.match(source, /v-model="newApiKeyInput"/)
  assert.doesNotMatch(source, /v-model="apiKeyInput"/)
  assert.doesNotMatch(source, /v-model\.trim="apiKeyNameInput"/)
  assert.doesNotMatch(source, /input-action-row/)
  assert.doesNotMatch(source, /action-input/)
  assert.doesNotMatch(source, /list="ai-model-options"/)
  assert.doesNotMatch(source, /settings\.aiSaveApiKey['"]/)
  assert.doesNotMatch(source, /v-model="saveApiKey"/)
  assert.doesNotMatch(source, /setAiProviderModelOptions\(settings\.model \? \[settings\.model\] : \[\]\)/)
  assert.doesNotMatch(source, /settings\.aiTemperature/)
  assert.doesNotMatch(source, /settings\.aiMaxTokens/)
  assert.doesNotMatch(source, /settings\.aiPricingMode/)
  assert.doesNotMatch(source, /pricingMode/)
  assert.doesNotMatch(source, /v-model\.number="aiProviderForm\.temperature"/)
  assert.doesNotMatch(source, /v-model\.number="aiProviderForm\.maxTokens"/)

  assert.doesNotMatch(source, oldAuthClientPattern)
  assert.doesNotMatch(source, /loginRankPeekAccount|registerRankPeekAccount|requestRankPeekRegisterEmailCode|requestRankPeekPasswordReset/)
  assert.doesNotMatch(source, /authModalOpen|auth-form|authVerificationCode|handleLogout/)
  assert.doesNotMatch(source, /settings\.accountTitle|settings\.login|settings\.logout/)
})

test('settings local AI controls use compact switch and key action layout', () => {
  const headerMatch = source.match(/<div class="ai-provider-header">([\s\S]*?)<\/div>\s*<form\s+class="ai-provider-form"/)
  assert.ok(headerMatch, 'AI provider header should be directly above the provider form')
  assert.match(headerMatch[1], /class="ai-provider-header-actions"/)
  assert.match(headerMatch[1], /class="settings-switch"[\s\S]*@click="toggleAiProviderEnabled"[\s\S]*settings\.aiEnabled/)
  assert.match(headerMatch[1], /settings\.aiEnabled[\s\S]*@click="checkLocalRankPeekBackend"/)
  assert.doesNotMatch(source, /<label class="toggle-row">[\s\S]*aiProviderForm\.enabled/)

  const switchButtons = [...source.matchAll(/class="settings-switch"/g)]
  assert.equal(switchButtons.length, 3)
  assert.match(source, /role="switch"[\s\S]*:aria-checked="aiProviderForm\.enabled"/)
  assert.match(source, /@click="toggleAiProviderWebSearch"/)
  assert.match(source, /@click="toggleAiProviderDeepThinking"/)
  assert.doesNotMatch(source, /class="toggle-row"/)

  const providerFieldMatch = source.match(/<label class="form-field">([\s\S]*?settings\.aiProviderSelect[\s\S]*?)<\/label>/)
  assert.ok(providerFieldMatch, 'provider selector should render as a form field')
  assert.match(providerFieldMatch[1], /<span class="field-label-row">\s*<span>{{ t\('settings\.aiProviderSelect'\) }}<\/span>\s*<\/span>/)
  assert.match(source, /\.field-label-row \{[\s\S]*min-height: 26px/)

  const apiKeyFieldMatch = source.match(/<div class="form-field wide api-key-field">([\s\S]*?)<div class="saved-key-row">/)
  assert.ok(apiKeyFieldMatch, 'API Key field should contain a compact label action row')
  assert.match(apiKeyFieldMatch[1], /class="field-label-row api-key-label-row"[\s\S]*settings\.aiApiKey[\s\S]*settings\.aiAddApiKey[\s\S]*settings\.aiApiKeyOpenPage/)
  assert.doesNotMatch(apiKeyFieldMatch[1], /api-key-actions/)
})

test('settings page keeps common local settings and local service diagnostics', () => {
  assert.match(source, /defaultMatchQueueMode/)
  assert.match(source, /saveMatchSettings/)
  assert.match(source, /clearUserCache/)
  assert.match(source, /themeStore\.setTheme\('light'\)/)
  assert.match(source, /themeStore\.setTheme\('dark'\)/)
  assert.match(source, /checkRankPeekDataDiagnostics/)
  assert.match(source, /checkLocalRankPeekBackend/)
})

test('settings page exposes in-app feedback and attaches recent app logs', () => {
  assert.match(source, /submitRankPeekFeedback/)
  assert.match(source, /getOrCreateCloudInstallationId/)
  assert.match(source, /feedbackDialogOpen/)
  assert.match(source, /openFeedbackDialog/)
  assert.match(source, /sendRankPeekFeedback/)
  assert.match(source, /settings\.feedbackAction/)
  assert.match(source, /settings\.feedbackTitle/)
  assert.match(source, /settings\.feedbackDescription/)
  assert.match(source, /settings\.feedbackMessage/)
  assert.match(source, /settings\.feedbackContact/)
  assert.match(source, /settings\.feedbackPrivacyNote/)
  assert.match(source, /<textarea[\s\S]*v-model\.trim="feedbackForm\.message"[\s\S]*settings\.feedbackMessagePlaceholder/)
  assert.match(source, /v-model\.trim="feedbackForm\.contact"/)
  assert.match(source, /appVersion:\s*appVersion\.value/)
  assert.match(source, /platform:\s*window\.electronAPI\?\.platform \?\? navigator\.platform/)
  assert.match(source, /installationId:\s*getOrCreateCloudInstallationId\(\)/)
  // Since 45e8656 the submission attaches recent app logs on purpose; settings.feedbackPrivacyNote discloses it.
  assert.match(source, /logs = await window\.electronAPI\?\.getLogs\(\)/)
  assert.match(source, /\}, logs\)/)
})

test('settings page can download and install an update, not just check for one', () => {
  // 以前这里只有一个「检查更新」：点完最多显示一行版本号，装不了，用户还得自己去官网重下。
  // 现在和公告中心共用 useAppUpdateInstaller，检查 → 下载 → 安装并重启一条路走完。
  assert.match(source, /useAppUpdateInstaller\(\)/)
  assert.match(source, /checkUpdate:\s*checkForAppUpdate/)
  assert.match(source, /download:\s*downloadAppUpdate/)
  assert.match(source, /install:\s*installAppUpdate/)
  assert.match(source, /@click="downloadAppUpdate"/)
  assert.match(source, /@click="installAppUpdate"/)
  assert.match(source, /安装并重启/)
  assert.match(source, /下载中 \{\{ updateDownloadPercent \}\}%/)
  assert.match(source, /class="update-progress"/)
})

test('settings page shows compact sponsor codes at the bottom', () => {
  assert.match(source, /import sponsorAlipayQr from '@\/assets\/support\/rankpeek-alipay-qr\.png'/)
  assert.match(source, /import sponsorWechatQr from '@\/assets\/support\/rankpeek-wechat-qr\.png'/)
  // GitHub links were removed from this page in 2857611 (in-app feedback only), so they must stay out.
  assert.doesNotMatch(source, /githubRepoUrl|githubIssuesUrl|github\.com\/wxl11071123/)
  assert.doesNotMatch(source, /rankpeek-rebuild/)
  assert.match(source, /const sponsorOptions(?:: SponsorOption\[\])? = \[/)
  assert.match(source, /const activeSponsorOption = computed/)
  assert.match(source, /function openSponsorModal\(id: SponsorOption\['id'\]\)/)
  assert.match(source, /function closeSponsorModal\(\)/)
  assert.match(source, /class="settings-section support-section"/)
  assert.match(source, /v-for="option in sponsorOptions"/)
  assert.match(source, /@click="openSponsorModal\(option\.id\)"/)
  assert.match(source, /support-modal-panel/)
  assert.match(source, /activeSponsorOption/)

  for (const key of [
    'settings.supportRankPeek',
    'settings.supportDescription',
    'settings.supportAlipay',
    'settings.supportWechat',
    'settings.supportScanHint',
    'settings.supportOpenQr',
    'settings.supportCloseQr'
  ]) {
    assert.ok(zh.includes(`'${key}'`), `zh-CN should include ${key}`)
    assert.ok(en.includes(`'${key}'`), `en-US should include ${key}`)
  }
})

test('settings AI pricing inputs are manual text fields without number steppers', () => {
  const pricingPanelMatch = source.match(/<div class="pricing-panel">([\s\S]*?)<\/div>\s*<\/form>/)
  assert.ok(pricingPanelMatch, 'AI pricing panel should render inside the local AI form')
  assert.doesNotMatch(pricingPanelMatch[1], /type="number"/)
  assert.equal([...pricingPanelMatch[1].matchAll(/type="text"/g)].length, 3)
  assert.equal([...pricingPanelMatch[1].matchAll(/inputmode="decimal"/g)].length, 3)
  assert.doesNotMatch(pricingPanelMatch[1], /step="0\.001"|min="0"/)
  assert.match(zh, /'settings\.aiPricingTitle': 'AI 成本单价（填写单价后可以在AI分析页自动计算成本）'/)
})

test('settings local AI copy exists in both locales', () => {
  for (const key of [
    'settings.aiProviderTitle',
    'settings.aiProviderDescription',
    'settings.aiProviderSelect',
    'settings.aiEnabled',
    'settings.aiBaseUrl',
    'settings.aiModel',
    'settings.aiRefreshModels',
    'settings.aiRefreshingModels',
    'settings.aiModelsLoaded',
    'settings.aiModelsUnavailable',
    'settings.aiApiKey',
    'settings.aiApiKeyOpenPage',
    'settings.aiAddApiKey',
    'settings.aiAddApiKeyTitle',
    'settings.aiApiKeyPlaceholder',
    'settings.aiApiKeyName',
    'settings.aiApiKeyNamePlaceholder',
    'settings.aiSaveApiKeyAction',
    'settings.aiSavingApiKey',
    'settings.aiApiKeySaved',
    'settings.aiApiKeyDeleted',
    'settings.aiSavedKeySelect',
    'settings.aiSavedKey',
    'settings.aiNoSavedKey',
    'settings.aiNoSavedKeyPrompt',
    'settings.aiDeleteApiKey',
    'settings.aiDeletingApiKey',
    'settings.aiDeleteApiKeyConfirm',
    'settings.aiWebSearchEnabled',
    'settings.aiDeepThinkingEnabled',
    'settings.aiPricingTitle',
    'settings.aiJsonModeRequiredNotice',
    'settings.aiFeatureUsageNotice',
    'settings.aiWebSearchStructuredOutputNotice',
    'settings.aiInputCacheHitPrice',
    'settings.aiInputCacheMissPrice',
    'settings.aiOutputPrice',
    'settings.aiSaveProvider',
    'settings.aiTestConnection',
    'settings.aiSettingsSaved',
    'settings.aiConnectionReady',
    'settings.aiSettingsUnavailable',
    'settings.feedbackAction',
    'settings.feedbackTitle',
    'settings.feedbackDescription',
    'settings.feedbackMessage',
    'settings.feedbackMessagePlaceholder',
    'settings.feedbackContact',
    'settings.feedbackContactPlaceholder',
    'settings.feedbackPrivacyNote',
    'settings.feedbackSubmit',
    'settings.feedbackSubmitting',
    'settings.feedbackSent',
    'settings.feedbackFailed'
  ]) {
    assert.ok(zh.includes(`'${key}'`), `zh-CN should include ${key}`)
    assert.ok(en.includes(`'${key}'`), `en-US should include ${key}`)
  }
  for (const removedCopy of [
    '大陆价格口径',
    'Mainland pricing',
    'DeepSeek 预设',
    'DeepSeek preset',
    '保存 API Key 到本机',
    'Save API key locally'
  ]) {
    assert.equal(zh.includes(removedCopy), false, `zh-CN should not include ${removedCopy}`)
    assert.equal(en.includes(removedCopy), false, `en-US should not include ${removedCopy}`)
  }
  assert.match(zh, /'settings\.aiApiKeyOpenPage': '点击跳转服务商 API 官网'/)
  assert.match(en, /'settings\.aiApiKeyOpenPage': 'Provider API site'/)
  assert.match(zh, /response_format=json_object/)
  assert.match(en, /response_format=json_object/)
})
