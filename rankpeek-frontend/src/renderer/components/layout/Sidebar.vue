<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { t, type MessageKey } from '@/i18n'
import { useResizableSidebar } from '@/composables/useResizableSidebar'
import { MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from '@/utils/sidebarWidth'
import homeIconSvg from '@/assets/icons/nav-home.svg?raw'
import gamingIconSvg from '@/assets/icons/nav-gamepad.svg?raw'
import summonerIconSvg from '@/assets/icons/nav-user-search.svg?raw'
import matchRecordIconSvg from '@/assets/icons/nav-record-bars.svg?raw'
import aiAnalysisIconSvg from '@/assets/icons/nav-ai-spark.svg?raw'
import hextechIconSvg from '@/assets/icons/nav-hextech.svg?raw'
import settingsGearIconSvg from '@/assets/icons/nav-gear-five.svg?raw'
import sidebarLogo from '@/assets/branding/sidebar-logo.png'

const route = useRoute()
const router = useRouter()
const sidebarElement = ref<HTMLElement | null>(null)
// 版本号必须从 app:getVersion 读：以前这里是写死的 "v1.1.0"，发了两个版本都没跟着动
const appVersion = ref('')
const versionLabel = computed(() => (appVersion.value ? 'v' + appVersion.value : ''))

onMounted(() => {
  void window.electronAPI
    ?.getVersion?.()
    .then((version) => {
      appVersion.value = version ?? ''
    })
    .catch(() => {
      appVersion.value = ''
    })
})

const menuItems: Array<{ path: string; iconSvg: string; labelKey: MessageKey }> = [
  { path: '/', iconSvg: homeIconSvg, labelKey: 'nav.home' },
  { path: '/gaming', iconSvg: gamingIconSvg, labelKey: 'nav.gaming' },
  { path: '/summoner', iconSvg: summonerIconSvg, labelKey: 'nav.summoner' },
  { path: '/match-history', iconSvg: matchRecordIconSvg, labelKey: 'nav.matchHistory' },
  { path: '/ai-analysis', iconSvg: aiAnalysisIconSvg, labelKey: 'nav.aiAnalysis' },
  { path: '/hextech', iconSvg: hextechIconSvg, labelKey: 'nav.hextech' },
  { path: '/settings', iconSvg: settingsGearIconSvg, labelKey: 'nav.settings' }
]

const currentPath = computed(() => route.path)
const {
  cleanupSidebarResize,
  isResizing,
  sidebarStyle,
  sidebarWidth,
  startResize
} = useResizableSidebar(sidebarElement)

onBeforeUnmount(cleanupSidebarResize)

function navigateTo(path: string) {
  void router.push(path)
}
</script>

<template>
  <aside
    ref="sidebarElement"
    class="sidebar"
    :class="{ resizing: isResizing }"
    :style="sidebarStyle"
  >
    <div class="sidebar-brand" aria-label="RankPeek">
      <img class="sidebar-logo" :src="sidebarLogo" alt="" aria-hidden="true" />
      <span class="brand-name">RankPeek</span>
    </div>

    <nav class="sidebar-nav">
      <ul class="nav-list">
        <li
          v-for="item in menuItems"
          :key="item.path"
          class="nav-item"
          :class="{ active: currentPath === item.path }"
          :aria-label="t(item.labelKey)"
          @click="navigateTo(item.path)"
        >
          <span class="nav-icon" aria-hidden="true">
            <span class="nav-icon-svg" v-html="item.iconSvg"></span>
          </span>
          <span class="nav-label">{{ t(item.labelKey) }}</span>
        </li>
      </ul>
    </nav>

    <div class="sidebar-footer">
      <div class="version">{{ versionLabel }}</div>
    </div>

    <div
      class="sidebar-resize-handle"
      role="separator"
      aria-label="Resize sidebar"
      aria-orientation="vertical"
      :aria-valuemin="MIN_SIDEBAR_WIDTH"
      :aria-valuemax="MAX_SIDEBAR_WIDTH"
      :aria-valuenow="sidebarWidth"
      @mousedown="startResize"
    />
  </aside>
</template>

<style scoped>
.sidebar {
  position: relative;
  width: var(--sidebar-width, 252px);
  flex: 0 0 var(--sidebar-width, 252px);
  min-width: 200px;
  max-width: 340px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
}

.sidebar-resize-handle {
  position: absolute;
  top: 0;
  right: -3px;
  width: 7px;
  height: 100%;
  cursor: col-resize;
  z-index: 5;
}

.sidebar-resize-handle::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 3px;
  width: 1px;
  background: var(--border-subtle);
  transition: background var(--transition-fast), box-shadow var(--transition-fast);
}

.sidebar-resize-handle:hover::after,
.sidebar.resizing .sidebar-resize-handle::after {
  background: rgba(var(--accent-rgb), 0.7);
  box-shadow: 0 0 0 1px rgba(var(--accent-rgb), 0.18);
}

:global(body.sidebar-resizing),
:global(body.sidebar-resizing *) {
  cursor: col-resize !important;
  user-select: none !important;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 76px;
  padding: 20px 22px 14px;
  color: var(--text-primary);
}

.sidebar-logo {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  display: block;
  border-radius: 8px;
  object-fit: contain;
}

.brand-name {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 750;
  line-height: 1;
  letter-spacing: 0;
}

.sidebar-nav {
  flex: 1;
  padding: 6px 14px 12px;
  overflow-y: auto;
}

.nav-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 62px;
  padding: 16px 18px;
  margin-bottom: 6px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  color: var(--text-secondary);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0;
}

.nav-item,
.nav-item:hover,
.nav-item.active,
.nav-item:focus-visible {
  font-size: 17px;
  font-weight: 700;
}

.nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.nav-item.active {
  background: var(--accent-color);
  color: #ffffff;
}

.nav-icon {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--color-nav-icon);
  transition: color var(--transition-fast);
}

.nav-item:hover .nav-icon,
.nav-item:focus-visible .nav-icon {
  color: var(--color-nav-icon-hover);
}

.nav-item.active .nav-icon {
  color: var(--color-nav-icon-active);
}

.nav-icon-svg {
  width: 25px;
  height: 25px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: inherit;
  line-height: 0;
}

.nav-icon-svg :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
  fill: none;
  stroke: currentColor;
}

.nav-label {
  font-size: inherit;
  font-weight: inherit;
  line-height: 1.25;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border-subtle);
}

.version {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-tertiary);
  text-align: center;
  letter-spacing: -0.12px;
}

@media (max-width: 760px) {
  .sidebar {
    width: 96px;
    flex: 0 0 96px;
    min-width: 96px;
    max-width: 96px;
  }

  .sidebar-resize-handle {
    display: none;
  }

  .sidebar-brand {
    justify-content: center;
    min-height: 72px;
    padding: 18px 10px 12px;
  }

  .brand-name {
    display: none;
  }

  .sidebar-nav {
    padding: 8px 10px 16px;
  }

  .nav-item {
    justify-content: center;
    min-height: 66px;
    padding: 16px 10px;
  }

  .nav-icon {
    width: 34px;
    height: 34px;
  }

  .nav-icon-svg {
    width: 28px;
    height: 28px;
  }

  .nav-label {
    display: none;
  }

  .sidebar-footer {
    padding: 12px 8px;
  }
}
</style>
