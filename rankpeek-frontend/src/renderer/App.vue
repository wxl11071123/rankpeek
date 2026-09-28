<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import TitleBar from '@/components/layout/TitleBar.vue'
import Sidebar from '@/components/layout/Sidebar.vue'
import { createGameflowAutoNavigator } from '@/services/gameflowAutoNavigation'
import { createHextechAutoNavigator } from '@/services/hextechAutoNavigation'
import { useGameStore } from '@/stores/game'

const gameStore = useGameStore()
const router = useRouter()
const isStandaloneRoute = computed(() => isStandaloneRuntimeRoute())
/**
 * 悬浮窗是贴在游戏画面上的透明贴片：
 * 不能带标题栏，容器也不能有底色，否则整条窗口会变成一条挡视线的横条。
 */
const isOverlayWindow = computed(
  () => window.location.hash.startsWith('#/overlay') || router.currentRoute.value.name === 'HextechOverlay'
)

// 悬浮窗要把 html/body 的底色也去掉，交给 main.css 里的 .overlay-window 规则
watch(
  isOverlayWindow,
  (active) => {
    document.documentElement.classList.toggle('overlay-window', active)
    document.body.classList.toggle('overlay-window', active)
  },
  { immediate: true }
)

let removeTrayNavigateListener: (() => void) | null = null
let stopGameflowAutoNavigation: (() => void) | null = null
let stopHextechAutoNavigation: (() => void) | null = null
let standaloneConnectionTimer: ReturnType<typeof setInterval> | null = null

if (!isStandaloneRuntimeRoute()) {
  void gameStore.initConnection()
}

/**
 * 独立窗口（悬浮窗 / OP.GG）判断。
 *
 * 必须**先看窗口自己的 hash**：挂载时路由还没解析完，只看 router.currentRoute 会把
 * 悬浮窗当成普通窗口，于是给它注册上「游戏事件自动跳转」，一有事件就把悬浮窗
 * 导航到战绩页 —— 表现就是悬浮窗「回退」成主界面。
 */
function isStandaloneRuntimeRoute() {
  const hash = window.location.hash
  return (
    hash.startsWith('#/overlay') ||
    hash.startsWith('#/opgg') ||
    router.currentRoute.value.meta.standalone === true
  )
}

onMounted(() => {
  if (isStandaloneRoute.value) {
    void gameStore.checkConnection()
    standaloneConnectionTimer = setInterval(() => {
      void gameStore.checkConnection()
    }, 5000)
  }

  if (!isStandaloneRoute.value) {
    stopGameflowAutoNavigation = createGameflowAutoNavigator(router)
    stopHextechAutoNavigation = createHextechAutoNavigator(router)
  }

  if (isStandaloneRoute.value || !window.electronAPI?.onTrayNavigate) {
    return
  }

  removeTrayNavigateListener = window.electronAPI.onTrayNavigate((path) => {
    if (router.currentRoute.value.path === path) {
      return
    }

    void router.push(path)
  })
})

onBeforeUnmount(() => {
  removeTrayNavigateListener?.()
  removeTrayNavigateListener = null
  stopGameflowAutoNavigation?.()
  stopGameflowAutoNavigation = null
  stopHextechAutoNavigation?.()
  stopHextechAutoNavigation = null
  if (standaloneConnectionTimer) {
    clearInterval(standaloneConnectionTimer)
    standaloneConnectionTimer = null
  }
})
</script>

<template>
  <div class="app-container" :class="{ 'app-container-overlay': isOverlayWindow }">
    <TitleBar v-if="!isOverlayWindow" />
    <div class="app-content">
      <Sidebar v-if="!isStandaloneRoute" />
      <main
        class="main-content"
        :class="{ 'main-content-standalone': isStandaloneRoute, 'main-content-overlay': isOverlayWindow }"
      >
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-text);
}

.app-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.main-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 24px;
  background: var(--bg-primary);
}

.main-content-standalone {
  padding: 0;
  overflow: hidden;
}

/* 悬浮窗：整块窗口透明，只留三块小面板 */
.app-container-overlay,
.main-content-overlay {
  background: transparent;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 760px) {
  .main-content:not(.main-content-standalone) {
    padding: 14px;
  }
}
</style>
