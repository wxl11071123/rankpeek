<script setup lang="ts">
import AnnouncementCenter from '@/components/AnnouncementCenter.vue'
import { useGameStore } from '@/stores/game'
import { t } from '@/i18n'

const gameStore = useGameStore()

const minimize = () => window.electronAPI?.minimizeWindow()
const maximize = () => window.electronAPI?.maximizeWindow()
const close = () => window.electronAPI?.closeWindow()
</script>

<template>
  <header class="title-bar">
    <div class="title-bar-drag">
      <div class="connection-status">
        <span
          class="status-dot"
          :class="{
            connected: gameStore.connected,
            disconnected: !gameStore.connected
          }"
        ></span>
        <span class="status-text">
          {{ gameStore.connected ? t('common.connected') : t('common.disconnected') }}
        </span>
      </div>

      <div v-if="gameStore.summonerName" class="summoner-info">
        {{ gameStore.summonerName }}
      </div>

      <AnnouncementCenter />
    </div>

    <div class="window-controls">
      <button class="control-btn minimize" @click="minimize" :title="t('window.minimize')">
        <svg viewBox="0 0 12 12">
          <rect y="5" width="12" height="2" />
        </svg>
      </button>
      <button class="control-btn maximize" @click="maximize" :title="t('window.maximize')">
        <svg viewBox="0 0 12 12">
          <rect x="1" y="1" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5" />
        </svg>
      </button>
      <button class="control-btn close" @click="close" :title="t('window.close')">
        <svg viewBox="0 0 12 12">
          <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" stroke-width="1.5" />
          <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" stroke-width="1.5" />
        </svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
.title-bar {
  display: flex;
  height: 38px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-subtle);
  -webkit-app-region: drag;
}

.title-bar-drag {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 12px;
}

.connection-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-pill);
  font-size: 12px;
  letter-spacing: -0.12px;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  transition: background 0.3s;
}

.status-dot.connected {
  background: var(--success-color);
  box-shadow: 0 0 6px rgba(48, 209, 88, 0.5);
}

.status-dot.disconnected {
  background: var(--text-tertiary);
}

.status-text {
  color: var(--text-secondary);
  font-weight: 400;
}

.summoner-info {
  padding: 3px 10px;
  background: rgba(var(--accent-rgb), 0.15);
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 500;
  color: var(--accent-color);
  letter-spacing: -0.12px;
}

.window-controls {
  display: flex;
  -webkit-app-region: no-drag;
}

.control-btn {
  width: 46px;
  height: 38px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}

.control-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.control-btn.close:hover {
  background: var(--error-color);
  color: white;
}

.control-btn svg {
  width: 12px;
  height: 12px;
}
</style>
