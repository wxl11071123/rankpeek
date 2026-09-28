<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { currentLocale, t } from '@/i18n'
import {
  dismissRankPeekAnnouncement,
  fetchRankPeekAnnouncements,
  type RankPeekAnnouncement
} from '@/services/rankpeekCloudClient'

const announcements = ref<RankPeekAnnouncement[]>([])
const activeAnnouncement = computed(() => announcements.value[0] ?? null)

onMounted(() => {
  void loadAnnouncements()
})

async function loadAnnouncements() {
  let version = '1.1.0'
  try {
    version = await window.electronAPI?.getVersion?.() ?? version
  } catch {
    // Announcements are optional and must not affect startup.
  }

  announcements.value = await fetchRankPeekAnnouncements({
    version,
    platform: window.electronAPI?.platform ?? navigator.platform,
    locale: currentLocale.value,
    channel: 'stable'
  })
}

function dismissActiveAnnouncement() {
  const announcement = activeAnnouncement.value
  if (!announcement) {
    return
  }
  dismissRankPeekAnnouncement(announcement.id)
  announcements.value = announcements.value.filter(item => item.id !== announcement.id)
}

async function openAnnouncementLink() {
  const linkUrl = activeAnnouncement.value?.linkUrl
  if (!linkUrl) {
    return
  }

  if (!window.electronAPI?.openExternal) {
    window.open(linkUrl, '_blank', 'noopener,noreferrer')
    return
  }

  const result = await window.electronAPI.openExternal(linkUrl)
  if (result && !result.success) {
    window.open(linkUrl, '_blank', 'noopener,noreferrer')
  }
}
</script>

<template>
  <section
    v-if="activeAnnouncement"
    class="app-announcement-banner"
    :class="`level-${activeAnnouncement.level}`"
    aria-live="polite"
  >
    <div class="announcement-copy">
      <strong>{{ activeAnnouncement.title }}</strong>
      <p>{{ activeAnnouncement.body }}</p>
    </div>
    <div class="announcement-actions">
      <button
        v-if="activeAnnouncement.linkUrl"
        class="announcement-link"
        type="button"
        @click="openAnnouncementLink"
      >
        {{ t('settings.announcementOpenLink') }}
      </button>
      <button
        class="announcement-dismiss"
        type="button"
        :aria-label="t('settings.announcementDismiss')"
        @click="dismissActiveAnnouncement"
      >
        ×
      </button>
    </div>
  </section>
</template>

<style scoped>
.app-announcement-banner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
  padding: 14px 16px;
  border: 1px solid rgba(var(--accent-rgb), 0.28);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, rgba(var(--accent-rgb), 0.12), rgba(var(--accent-rgb), 0.06));
  color: var(--text-primary);
}

.app-announcement-banner.level-warning {
  border-color: rgba(245, 158, 11, 0.38);
  background: linear-gradient(180deg, rgba(245, 158, 11, 0.14), rgba(245, 158, 11, 0.06));
}

.app-announcement-banner.level-critical {
  border-color: rgba(239, 68, 68, 0.38);
  background: linear-gradient(180deg, rgba(239, 68, 68, 0.14), rgba(239, 68, 68, 0.06));
}

.announcement-copy {
  min-width: 0;
}

.announcement-copy strong {
  display: block;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 720;
}

.announcement-copy p {
  margin: 5px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.55;
}

.announcement-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.announcement-link,
.announcement-dismiss {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 650;
}

.announcement-link {
  min-height: 30px;
  padding: 0 10px;
}

.announcement-dismiss {
  width: 30px;
  height: 30px;
  line-height: 1;
}

.announcement-link:hover,
.announcement-dismiss:hover {
  border-color: rgba(var(--accent-rgb), 0.4);
  color: var(--accent-color);
}

@media (max-width: 760px) {
  .app-announcement-banner {
    flex-direction: column;
  }

  .announcement-actions {
    align-self: stretch;
    justify-content: flex-end;
  }
}
</style>
