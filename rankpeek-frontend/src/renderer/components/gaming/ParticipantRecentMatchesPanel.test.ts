import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('participant recent matches panel renders single-row matches with champion, position, kda, items and time', () => {
  const source = readFileSync(new URL('./ParticipantRecentMatchesPanel.vue', import.meta.url), 'utf8')

  assert.match(source, /player: SessionSummoner \| null/)
  assert.match(source, /buildParticipantRecentMatchItems\(props\.player\?\.matchHistory, props\.player\?\.summoner\?\.puuid\)/)
  assert.match(source, /getChampionIconUrl\(item\.championId\)/)
  assert.match(source, /getItemIconUrl\(id\)/)
  assert.match(source, /markAssetLoadFailed/)
  assert.match(source, /class="recent-match-list"/)
  assert.match(source, /class="recent-position"/)
  assert.match(source, /class="recent-kda"/)
  assert.match(source, /class="recent-items"/)
  assert.match(source, /class="recent-item-icon"/)
  assert.match(source, /class="recent-time"/)
  assert.match(source, /item\.isRanked && item\.positionText/)
  assert.match(source, /class="recent-item-slot"/)
  assert.match(source, /max-height:\s*(?:1[89]\d|2[0-2]\d)px/)
  assert.match(source, /overflow-y:\s*auto/)
  assert.doesNotMatch(source, /<header|recent-panel-header/)
  assert.doesNotMatch(source, /class="recent-queue"/)
  assert.doesNotMatch(source, /apiClient|fetch\(|axios|\/match-history/)
})

test('participant recent matches panel has an empty state for missing data', () => {
  const source = readFileSync(new URL('./ParticipantRecentMatchesPanel.vue', import.meta.url), 'utf8')

  assert.match(source, /v-if="!recentItems\.length"/)
  assert.match(source, /\u6682\u65e0\u6700\u8fd1\u6218\u7ee9\u6570\u636e/)
  assert.match(source, /\.participant-recent-panel/)
  assert.match(source, /\.recent-match-row/)
})
