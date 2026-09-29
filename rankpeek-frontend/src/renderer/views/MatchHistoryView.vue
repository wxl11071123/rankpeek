<template>
  <SummonerMatchHistoryPanel
    v-if="currentSummoner"
    :summoner="currentSummoner"
    :connected="gameStore.connected"
    :auto-open-latest-match-token="postgameAutoOpenLatestMatchToken"
    variant="mine"
  />

  <div v-else class="match-history-view">
    <section class="page-shell">
      <div class="page-copy">
        <h1>{{ t('matchHistory.title') }}</h1>
      </div>
    </section>

    <section class="state-card">
      <strong>{{ t('matchHistory.noAccountTitle') }}</strong>
      <span>{{ t('matchHistory.noAccountBody') }}</span>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import SummonerMatchHistoryPanel from '@/components/summoner/SummonerMatchHistoryPanel.vue'
import { useI18n } from '@/i18n'
import { postgameAutoOpenLatestMatchToken } from '@/services/gameflowAutoNavigation'
import { useGameStore } from '@/stores/game'

const gameStore = useGameStore()
const { t } = useI18n()

const currentSummoner = computed(() => gameStore.currentSummoner)
</script>

<style scoped>
.match-history-view {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.page-shell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px 16px;
  box-sizing: border-box;
  width: 100%;
  min-height: 86px;
  padding: 18px 24px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 20px;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.11), transparent 16%, transparent 84%, rgba(255, 255, 255, 0.11)),
    linear-gradient(135deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.035)),
    rgba(10, 13, 20, 0.62);
}

.page-copy {
  min-width: 0;
  overflow: hidden;
}

.page-copy h1 {
  margin: 0;
  color: var(--text-primary);
  font-size: clamp(24px, 2vw, 30px);
  line-height: 1.05;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.state-card {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 16px;
}

.state-card strong {
  color: var(--text-primary);
}

.state-card span {
  color: var(--text-secondary);
}
</style>
