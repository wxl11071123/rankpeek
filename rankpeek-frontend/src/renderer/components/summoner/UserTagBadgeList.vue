<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/i18n'
import type { RankTag, RecordStatus } from '@/types/api'

const props = withDefaults(defineProps<{
  recordStatus?: RecordStatus
  tags?: RankTag[]
  limit?: number | null
  compact?: boolean
  showEmpty?: boolean
}>(), {
  recordStatus: 'NORMAL',
  tags: () => [],
  limit: null,
  compact: false,
  showEmpty: false
})

const { t } = useI18n()
const visibleTags = computed(() => props.limit == null ? props.tags : props.tags.slice(0, props.limit))

const statusMeta = computed(() => {
  switch (props.recordStatus) {
    case 'PRIVATE':
      return {
        label: t('badge.private'),
        desc: t('badge.privateDescription'),
        className: 'private'
      }
    case 'EMPTY':
      return {
        label: t('badge.empty'),
        desc: t('badge.emptyDescription'),
        className: 'empty'
      }
    case 'ERROR':
      return {
        label: t('badge.error'),
        desc: t('badge.errorDescription'),
        className: 'error'
      }
    default:
      return null
  }
})
</script>

<template>
  <div class="badge-list" :class="{ compact }">
    <span
      v-if="statusMeta"
      class="status-chip"
      :class="statusMeta.className"
      :title="statusMeta.desc"
    >
      {{ statusMeta.label }}
    </span>

    <template v-else-if="visibleTags.length">
      <span
        v-for="tag in visibleTags"
        :key="tag.tagName"
        class="tag-chip"
        :class="tag.good === true ? 'good' : tag.good === false ? 'bad' : 'neutral'"
        :title="tag.tagDesc"
      >
        {{ tag.tagName }}
      </span>
    </template>

    <span v-else-if="showEmpty" class="status-chip empty">{{ t('badge.noTags') }}</span>
  </div>
</template>

<style scoped>
.badge-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.badge-list.compact {
  gap: 3px;
}

.tag-chip,
.status-chip {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
}

.badge-list.compact .tag-chip,
.badge-list.compact .status-chip {
  padding: 2px 6px;
  font-size: 10px;
}

.tag-chip.good {
  background: rgba(61, 155, 122, 0.14);
  color: #3d9b7a;
}

.tag-chip.bad {
  background: rgba(196, 92, 92, 0.14);
  color: #c45c5c;
}

.tag-chip.neutral {
  background: rgba(128, 128, 128, 0.16);
  color: var(--text-secondary);
}

.status-chip.private {
  background: rgba(198, 154, 66, 0.16);
  color: #d7a64b;
}

.status-chip.empty {
  background: rgba(128, 128, 128, 0.16);
  color: var(--text-secondary);
}

.status-chip.error {
  background: rgba(196, 92, 92, 0.14);
  color: #c45c5c;
}
</style>
