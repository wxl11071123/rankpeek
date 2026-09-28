import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./AppAnnouncements.vue', import.meta.url), 'utf8')

test('app announcements fetch current app metadata and render a dismissible banner', () => {
  assert.match(source, /fetchRankPeekAnnouncements/)
  assert.match(source, /dismissRankPeekAnnouncement/)
  assert.match(source, /window\.electronAPI\?\.getVersion/)
  assert.match(source, /platform:\s*window\.electronAPI\?\.platform \?\? navigator\.platform/)
  assert.match(source, /locale:\s*currentLocale\.value/)
  assert.match(source, /channel:\s*'stable'/)
  assert.match(source, /activeAnnouncement/)
  assert.match(source, /class="app-announcement-banner"/)
  assert.match(source, /@click="dismissActiveAnnouncement"/)
  assert.match(source, /settings\.announcementDismiss/)
})
