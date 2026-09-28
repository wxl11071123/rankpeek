import { ref } from 'vue'
import zhCN, { type MessageKey } from './locales/zh-CN'
import enUS from './locales/en-US'

export type Locale = 'zh-CN' | 'en-US'

const STORAGE_KEY = 'rankpeek.locale'

const messages = {
  'zh-CN': zhCN,
  'en-US': enUS
}

export const localeOptions: Array<{ value: Locale; label: string }> = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en-US', label: 'English' }
]

function isLocale(value: string | null | undefined): value is Locale {
  return value === 'zh-CN' || value === 'en-US'
}

function detectLocale(): Locale {
  try {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (isLocale(stored)) {
        return stored
      }
    }
  } catch {
    // Ignore storage access failures and fall back to browser language.
  }

  if (typeof navigator !== 'undefined') {
    return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
  }

  return 'zh-CN'
}

export const currentLocale = ref<Locale>(detectLocale())

function syncDocumentLanguage(locale: Locale) {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale
  }
}

export function setLocale(locale: Locale) {
  currentLocale.value = locale
  syncDocumentLanguage(locale)

  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, locale)
    }
  } catch {
    // Locale switching should still work for the current session.
  }
}

export function t(key: MessageKey, params?: Record<string, string | number>) {
  const template = messages[currentLocale.value][key] ?? zhCN[key] ?? key

  if (!params) {
    return template
  }

  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params[name]
    return value === undefined || value === null ? '' : String(value)
  })
}

export function useI18n() {
  return {
    locale: currentLocale,
    localeOptions,
    setLocale,
    t
  }
}

syncDocumentLanguage(currentLocale.value)

export type { MessageKey }
