import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'rankpeek-theme'

export const useThemeStore = defineStore('theme', () => {
  // 从 localStorage 读取主题，默认为 dark
  const storedTheme = localStorage.getItem(STORAGE_KEY) as Theme | null
  const theme = ref<Theme>(storedTheme || 'dark')

  // 应用主题到 DOM
  function applyTheme(newTheme: Theme) {
    document.documentElement.setAttribute('data-theme', newTheme)

    // 更新 meta theme-color (移动端浏览器地址栏颜色)
    const metaThemeColor = document.querySelector('meta[name="theme-color"]')
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', newTheme === 'dark' ? '#0f0f1a' : '#f5f5fa')
    }
  }

  // 设置主题
  function setTheme(newTheme: Theme) {
    theme.value = newTheme
    localStorage.setItem(STORAGE_KEY, newTheme)
    applyTheme(newTheme)
  }

  // 切换主题
  function toggleTheme() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  // 监听主题变化
  watch(theme, (newTheme) => {
    applyTheme(newTheme)
  }, { immediate: true })

  // 初始化应用主题
  applyTheme(theme.value)

  return {
    theme,
    setTheme,
    toggleTheme
  }
})
