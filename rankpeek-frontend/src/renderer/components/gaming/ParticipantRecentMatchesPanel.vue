<script setup lang="ts">
import { computed } from 'vue'
import type { SessionSummoner } from '@/types/api'
import { getChampionIconUrl, getItemIconUrl, markAssetLoadFailed } from '@/utils/gameAssetUrls'
import {
  buildParticipantRecentMatchItems,
  type ParticipantRecentMatchItem
} from '@/utils/participantRecentMatches'

const props = defineProps<{
  player: SessionSummoner | null
}>()

const recentItems = computed<ParticipantRecentMatchItem[]>(() =>
  buildParticipantRecentMatchItems(props.player?.matchHistory, props.player?.summoner?.puuid)
)

function resultClass(item: ParticipantRecentMatchItem): string {
  if (item.result === 'win') return 'result-win'
  if (item.result === 'loss') return 'result-loss'
  return 'result-unknown'
}
</script>

<template>
  <section
    class="participant-recent-panel"
    aria-label="最近战绩列表"
  >
    <div
      v-if="!recentItems.length"
      class="recent-empty"
    >
      暂无最近战绩数据
    </div>

    <div
      v-else
      class="recent-match-list"
    >
      <article
        v-for="item in recentItems"
        :key="item.key"
        class="recent-match-row"
        :class="resultClass(item)"
      >
        <img
          v-if="getChampionIconUrl(item.championId)"
          class="recent-champion-avatar"
          :src="getChampionIconUrl(item.championId)"
          alt=""
          @error="markAssetLoadFailed"
        >
        <span
          v-else
          class="recent-champion-avatar champion-placeholder"
          aria-hidden="true"
        />

        <span
          v-if="item.isRanked && item.positionText"
          class="recent-position"
        >{{ item.positionText }}</span>

        <span class="recent-kda">{{ item.kdaText }}</span>

        <span class="recent-items">
          <template v-for="(id, idx) in item.itemIds" :key="idx">
            <img
              v-if="id > 0"
              class="recent-item-icon"
              :src="getItemIconUrl(id)"
              alt=""
              @error="markAssetLoadFailed"
            >
            <span v-else class="recent-item-slot" />
          </template>
        </span>

        <span class="recent-time" :title="`时长 ${item.durationText}`">{{ item.startTimeText }}</span>
      </article>
    </div>
  </section>
</template>

<style scoped>
.participant-recent-panel {
  min-width: 0;
  padding: 8px;
  border: 1px solid rgba(var(--accent-rgb), 0.14);
  border-radius: 4px;
  background: var(--bg-secondary);
}

.recent-empty {
  min-height: 40px;
  display: grid;
  place-items: center;
  border: 1px dashed rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
}

.recent-match-list {
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding-right: 2px;
  overscroll-behavior: contain;
}

.recent-match-row {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.02);
}

/* 胜/负用整块色面表达，去掉左侧装饰竖条 */
.recent-match-row.result-win {
  border-color: rgba(61, 155, 122, 0.34);
  background: rgba(61, 155, 122, 0.14);
}

.recent-match-row.result-loss {
  border-color: rgba(196, 92, 92, 0.34);
  background: rgba(196, 92, 92, 0.14);
}

.recent-champion-avatar {
  display: block;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  object-fit: cover;
  background: var(--bg-tertiary);
  flex-shrink: 0;
}

.recent-champion-avatar[data-asset-failed='true'] {
  display: none;
}

.champion-placeholder {
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
}

.recent-position {
  flex-shrink: 0;
  color: rgba(var(--accent-rgb), 0.85);
  font-size: 12px;
  line-height: 1;
  font-weight: 800;
  white-space: nowrap;
}

.recent-kda {
  flex-shrink: 0;
  min-width: 5.5em;
  text-align: right;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1;
  font-weight: 900;
  white-space: nowrap;
}

.recent-items {
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}

.recent-item-icon {
  display: block;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  object-fit: cover;
  background: var(--bg-tertiary);
}

.recent-item-icon[data-asset-failed='true'] {
  display: none;
}

.recent-item-slot {
  display: block;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.04);
}

.recent-time {
  margin-left: auto;
  flex-shrink: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1;
  font-weight: 700;
  text-align: right;
  white-space: nowrap;
  opacity: 0.72;
}

@media (max-width: 720px) {
  .participant-recent-panel {
    padding: 6px;
  }

  .recent-match-row {
    gap: 6px;
    padding: 4px 6px;
  }
}
</style>
