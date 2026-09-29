import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const titleBarSource = readFileSync(new URL('./TitleBar.vue', import.meta.url), 'utf8')
const announcementCenterSource = readFileSync(new URL('../AnnouncementCenter.vue', import.meta.url), 'utf8')

test('title bar hosts the announcement center entry', () => {
  assert.match(titleBarSource, /import AnnouncementCenter from '@\/components\/AnnouncementCenter\.vue'/)
  assert.match(titleBarSource, /<AnnouncementCenter \/>/)
})

test('announcement center fetches active and archived announcements with unread popup state', () => {
  assert.match(announcementCenterSource, /fetchRankPeekAnnouncements/)
  assert.match(announcementCenterSource, /fetchRankPeekAnnouncementArchive/)
  assert.match(announcementCenterSource, /includeDismissedAnnouncements:\s*true/)
  assert.match(announcementCenterSource, /markRankPeekAnnouncementRead/)
  assert.match(announcementCenterSource, /isRankPeekAnnouncementRead/)
  assert.match(announcementCenterSource, /class="ac-bell"/)
  assert.match(announcementCenterSource, /class="ac-overlay"/)
  assert.match(announcementCenterSource, /class="ac-card"/)
})

test('announcement center only fetches automatically on startup', () => {
  // 更新检查现在走 useAppUpdateInstaller 的 checkUpdate（和设置页共用一份实现）
  assert.match(announcementCenterSource, /onMounted\(\(\) => \{[^}]*void loadAnnouncements\(\);[^}]*void checkUpdate\(\)[^}]*\}\)/)
  assert.match(announcementCenterSource, /useAppUpdateInstaller\(\)/)
  assert.doesNotMatch(announcementCenterSource, /setInterval/)
  assert.doesNotMatch(announcementCenterSource, /clearInterval/)
})
