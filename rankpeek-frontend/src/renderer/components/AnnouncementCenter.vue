<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { currentLocale } from '@/i18n'
import {
  fetchRankPeekAnnouncementArchive,
  fetchRankPeekAnnouncements,
  isRankPeekAnnouncementDismissed,
  isRankPeekAnnouncementRead,
  markRankPeekAnnouncementRead,
  type RankPeekAnnouncement,
  type RankPeekAnnouncementQuery
} from '@/services/rankpeekCloudClient'

const ARCHIVE_LIMIT = 20

const activeAnnouncements = ref<RankPeekAnnouncement[]>([])
const archivedAnnouncements = ref<RankPeekAnnouncement[]>([])
const isPanelOpen = ref(false)
const isLoading = ref(false)
const readRevision = ref(0)
const updateInfo = ref<{ version: string; url: string } | null>(null)
const checkingUpdate = ref(false)
const downloadState = ref<'idle' | 'downloading' | 'downloaded' | 'error'>('idle')
const downloadPercent = ref(0)
const installerPath = ref('')
let cleanupProgress: (() => void) | null = null

const unreadCount = computed(() =>
  activeAnnouncements.value.filter(a => isAnnouncementUnread(a)).length
)
const panelAnnouncements = computed(() =>
  archivedAnnouncements.value.length ? archivedAnnouncements.value : activeAnnouncements.value
)

onMounted(() => { void loadAnnouncements(); void checkUpdates() })

type AnnouncementBlock = { kind: 'title' | 'heading' | 'item' | 'text'; text: string }

/**
 * 把公告正文按行分类，渲染出层次。
 *
 * <p>之前是一整段 `pre-line` 纯文本：版本标题、分类、条目一样大一样重，读起来是一坨没有重点。
 * 这里只按行判断类型（标题 / 小标题 / 条目 / 正文），**不解析 Markdown、也不用 v-html** ——
 * 公告是从服务器下发的，远程内容不直接当 HTML 渲染。
 */
function parseAnnouncementBody(raw: string | null | undefined): AnnouncementBlock[] {
  if (!raw) return []
  const blocks: AnnouncementBlock[] = []
  for (const line of raw.split(/\r?\n/)) {
    const text = line.trim()
    if (!text) continue

    const item = text.match(/^[·•\-*+]\s*(.+)$/)
    if (item) {
      blocks.push({ kind: 'item', text: item[1] })
      continue
    }
    if (/^[^\s：:]{1,14}[：:]$/.test(text)) {
      blocks.push({ kind: 'heading', text: text.replace(/[：:]\s*$/, '') })
      continue
    }
    if (/^v?\d+(\.\d+)+\s*(更新|版本|发布|公告)/i.test(text)) {
      blocks.push({ kind: 'title', text: text.replace(/[：:]\s*$/, '') })
      continue
    }
    blocks.push({ kind: 'text', text })
  }
  return blocks
}

async function openPanel() {
  isPanelOpen.value = true
  markAllRead()
}

function closePanel() {
  isPanelOpen.value = false
  if (cleanupProgress) { cleanupProgress(); cleanupProgress = null }
}

function markAllRead() {
  for (const a of activeAnnouncements.value) { markRankPeekAnnouncementRead(a.id) }
  readRevision.value += 1
}

function isAnnouncementUnread(a: RankPeekAnnouncement): boolean {
  return !isRankPeekAnnouncementRead(a.id) && !isRankPeekAnnouncementDismissed(a.id)
}

async function checkUpdates() {
  if (checkingUpdate.value) return
  checkingUpdate.value = true
  try {
    const info = await window.electronAPI?.checkUpdate?.()
    if (info && info.version) updateInfo.value = info
  } catch { /* 静默失败 */ }
  finally { checkingUpdate.value = false }
}

async function handleDownload() {
  if (!updateInfo.value?.url) return
  downloadState.value = 'downloading'
  downloadPercent.value = 0
  try {
    cleanupProgress = window.electronAPI?.onDownloadProgress((p) => {
      downloadPercent.value = p.percent
    }) ?? null
    installerPath.value = await window.electronAPI!.downloadUpdate!(updateInfo.value.url)
    downloadState.value = 'downloaded'
  } catch {
    downloadState.value = 'error'
  } finally {
    if (cleanupProgress) { cleanupProgress(); cleanupProgress = null }
  }
}

function handleInstall() {
  if (installerPath.value) window.electronAPI?.installUpdate?.(installerPath.value)
}

async function loadAnnouncements() {
  if (isLoading.value) return
  isLoading.value = true
  try {
    const query = await buildAnnouncementQuery()
    const [active, archive] = await Promise.all([
      fetchRankPeekAnnouncements(query, { includeDismissedAnnouncements: true }),
      fetchRankPeekAnnouncementArchive(query, { limit: ARCHIVE_LIMIT })
    ])
    activeAnnouncements.value = active
    archivedAnnouncements.value = mergeAnnouncementLists(active, archive)
  } finally { isLoading.value = false }
}

async function buildAnnouncementQuery(): Promise<RankPeekAnnouncementQuery> {
  let version = '1.1.0'
  try { version = await window.electronAPI?.getVersion?.() ?? version } catch { /* */ }
  return { version, platform: window.electronAPI?.platform ?? navigator.platform, locale: currentLocale.value, channel: 'stable' }
}

function mergeAnnouncementLists(active: RankPeekAnnouncement[], archive: RankPeekAnnouncement[]): RankPeekAnnouncement[] {
  const seen = new Set<string>()
  return [...active, ...archive].filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true })
}

function levelLabel(level: string) {
  if (level === 'critical') return '紧急'
  if (level === 'warning') return '重要'
  return '普通'
}

function formatDate(value: string): string {
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="ac-root">
    <button class="ac-bell" type="button" aria-label="公告中心" @click="openPanel">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 10.5v3a2 2 0 0 0 2 2h1.5l1.7 3.4a1 1 0 0 0 1.8-.9l-1.25-2.5H12l6 3.5V5l-6 3.5H6a2 2 0 0 0-2 2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
        <path d="M20 9v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      <span v-if="unreadCount" class="ac-badge">{{ unreadCount }}</span>
    </button>

    <div v-if="isPanelOpen" class="ac-overlay" @click.self="closePanel">
      <div class="ac-card">
        <div class="ac-header">
          <h2>公告中心</h2>
          <span class="ac-unread" v-if="unreadCount">{{ unreadCount }} 条未读</span>
          <div class="ac-header-actions">
            <button @click="loadAnnouncements">刷新</button>
            <button @click="closePanel">关闭</button>
          </div>
        </div>

        <div v-if="updateInfo" class="ac-update-banner">
          <div class="ac-update-info">
            <span>RankPeek v{{ updateInfo.version }} 已发布</span>
            <span v-if="downloadState === 'downloading'" class="ac-progress-text">下载中 {{ downloadPercent }}%</span>
          </div>
          <div class="ac-update-action">
            <progress v-if="downloadState === 'downloading'" class="ac-progress" :value="downloadPercent" max="100" />
            <button v-else-if="downloadState === 'idle'" class="ac-update-btn" @click="handleDownload">下载更新</button>
            <button v-else-if="downloadState === 'downloaded'" class="ac-update-btn" @click="handleInstall">安装并重启</button>
            <button v-else class="ac-update-btn" @click="handleDownload">重试</button>
          </div>
        </div>

        <div v-if="isLoading" class="ac-loading">加载中…</div>
        <div v-else-if="!panelAnnouncements.length" class="ac-empty">暂无公告</div>
        <div v-else class="ac-list">
          <article v-for="a in panelAnnouncements" :key="a.id"
            class="ac-item" :class="[`lv-${a.level}`, { unread: isAnnouncementUnread(a) }]">
            <div class="ac-item-head">
              <strong>{{ a.title }}</strong>
              <span>{{ levelLabel(a.level) }} · {{ a.startsAt ? formatDate(a.startsAt) : '' }}</span>
            </div>
            <div class="ac-body">
              <template v-for="(block, index) in parseAnnouncementBody(a.body)" :key="index">
                <p v-if="block.kind === 'title'" class="ac-body-title">{{ block.text }}</p>
                <p v-else-if="block.kind === 'heading'" class="ac-body-heading">{{ block.text }}</p>
                <p v-else-if="block.kind === 'item'" class="ac-body-item">{{ block.text }}</p>
                <p v-else class="ac-body-text">{{ block.text }}</p>
              </template>
            </div>
          </article>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ac-root { position: relative; display: inline-flex; align-items: center; -webkit-app-region: no-drag; }

.ac-bell {
  position: relative; display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 28px; border: 1px solid transparent; border-radius: var(--radius-sm);
  background: transparent; color: var(--text-secondary); cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.ac-bell:hover { border-color: var(--border-subtle); background: var(--bg-hover); color: var(--text-primary); }
.ac-bell svg { width: 18px; height: 18px; }

.ac-badge {
  position: absolute; top: 2px; right: 2px; min-width: 14px; height: 14px; padding: 0 4px;
  border: 1px solid var(--bg-secondary); border-radius: var(--radius-pill);
  background: var(--error-color); color: #fff; font-size: 10px; font-weight: 700; line-height: 12px;
}

.ac-overlay {
  position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
}

.ac-card {
  width: min(760px, 92vw); max-height: min(84vh, 860px);
  display: flex; flex-direction: column; border-radius: 14px;
  background: var(--bg-secondary); box-shadow: 0 24px 64px rgba(0,0,0,0.42);
  color: var(--text-primary); overflow: hidden;
}

.ac-header {
  display: flex; align-items: center; gap: 12px; padding: 16px 20px;
  border-bottom: 1px solid var(--border-subtle); flex-shrink: 0;
}
.ac-header h2 { margin: 0; font-size: 17px; font-weight: 720; }
.ac-unread { color: var(--text-tertiary); font-size: 13px; margin-left: -4px; }
.ac-header-actions { display: flex; gap: 6px; margin-left: auto; }
.ac-header-actions button {
  min-height: 28px; padding: 0 10px; border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm); background: var(--bg-primary);
  color: var(--text-secondary); font-size: 12px; cursor: pointer;
}
.ac-header-actions button:hover { border-color: var(--accent-color); color: var(--accent-color); }
.ac-header-actions button:disabled { opacity: 0.5; cursor: default; }

.ac-update-banner {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin: 12px 16px 0; padding: 12px 14px; border-radius: var(--radius-md);
  border: 1px solid rgba(239,68,68,0.3); background: rgba(239,68,68,0.07);
  flex-shrink: 0; flex-wrap: wrap;
}
.ac-update-info {
  display: flex; flex-direction: column; gap: 4px; min-width: 0;
}
.ac-update-info span:first-child { font-size: 14px; font-weight: 650; }
.ac-progress-text { font-size: 12px; color: var(--text-tertiary); }
.ac-update-action { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.ac-progress { width: 120px; height: 6px; accent-color: var(--accent-color); }
.ac-update-btn {
  flex-shrink: 0; min-height: 30px; padding: 0 16px; border: none;
  border-radius: var(--radius-sm); background: var(--accent-color);
  color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;
}
.ac-update-btn:hover { opacity: 0.9; }

.ac-loading, .ac-empty { padding: 32px 20px; color: var(--text-tertiary); font-size: 14px; text-align: center; }

.ac-list { overflow-y: auto; padding: 12px 16px 16px; flex: 1; }

.ac-item {
  padding: 12px; border: 1px solid var(--border-subtle); border-radius: var(--radius-md);
  background: var(--bg-primary);
}
.ac-item + .ac-item { margin-top: 8px; }
.ac-item.unread { border-color: rgba(var(--accent-rgb), 0.42); }
.ac-item.lv-warning { border-color: rgba(245, 158, 11, 0.45); background: rgba(245, 158, 11, 0.07); }
.ac-item.lv-critical { border-color: rgba(239, 68, 68, 0.45); background: rgba(239, 68, 68, 0.07); }

.ac-item-head { display: grid; gap: 4px; margin-bottom: 6px; }
.ac-item-head strong { font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ac-item-head span { color: var(--text-tertiary); font-size: 12px; }

.ac-body { display: grid; gap: 7px; }
.ac-body p { margin: 0; color: var(--text-secondary); font-size: 14px; line-height: 1.65; word-break: break-word; }

/* 版本标题：整条公告的视觉起点 */
.ac-body-title {
  color: var(--text-primary); font-size: 15px; font-weight: 750;
  padding-bottom: 7px; border-bottom: 1px solid var(--border-subtle);
}

/* 分类小标题（"新增："、"修复："） */
.ac-body-heading {
  color: var(--text-primary); font-size: 13px; font-weight: 700;
  letter-spacing: 0.04em; margin-top: 3px;
}

/* 条目：真正的圆点 + 悬挂缩进，长行换行对齐到文字而不是回到行首 */
.ac-body-item { position: relative; padding-left: 17px; }
.ac-body-item::before {
  content: ''; position: absolute; left: 4px; top: 9px;
  width: 5px; height: 5px; border-radius: 50%;
  background: rgba(var(--accent-rgb), 0.75);
}
</style>
