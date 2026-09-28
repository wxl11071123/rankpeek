import test from 'node:test'
import assert from 'node:assert/strict'
import {
  RANKPEEK_CLOUD_API_BASE_URL,
  buildRankPeekFeedbackPayload,
  dismissRankPeekAnnouncement,
  fetchRankPeekAnnouncementArchive,
  fetchRankPeekAnnouncements,
  getOrCreateCloudInstallationId,
  isRankPeekAnnouncementDismissed,
  isRankPeekAnnouncementRead,
  markRankPeekAnnouncementRead,
  submitRankPeekFeedback
} from './rankpeekCloudClient.ts'

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  private values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

test('cloud client uses the public RankPeek API endpoint by default', () => {
  assert.equal(RANKPEEK_CLOUD_API_BASE_URL, 'https://api.rankpeek.cn')
})

test('feedback payload includes logs when provided', () => {
  const payload = buildRankPeekFeedbackPayload(
    {
      category: 'suggestion',
      contact: 'player@example.com',
      message: '希望 RP 内部可以提交反馈。',
    },
    {
      appVersion: '1.0.0',
      platform: 'win32',
      locale: 'zh-CN',
      installationId: 'rp-installation-test'
    },
    { frontendLog: 'sample log', backendLog: 'sample backend log' }
  )

  assert.equal(payload.category, 'suggestion')
  assert.equal(payload.logs?.frontendLog, 'sample log')
  assert.equal(payload.logs?.backendLog, 'sample backend log')
})

test('feedback payload omits logs field when not provided', () => {
  const payload = buildRankPeekFeedbackPayload(
    {
      category: 'suggestion',
      contact: 'player@example.com',
      message: '希望 RP 内部可以提交反馈。',
    },
    {
      appVersion: '1.0.0',
      platform: 'win32',
      locale: 'zh-CN',
      installationId: 'rp-installation-test'
    }
  )

  assert.equal(payload.category, 'suggestion')
  assert.equal(payload.message, '希望 RP 内部可以提交反馈。')
  assert.equal('logs' in payload, false)
})

test('installation id is generated once and then reused', () => {
  const storage = new MemoryStorage()
  const first = getOrCreateCloudInstallationId(storage, () => 'uuid-1')
  const second = getOrCreateCloudInstallationId(storage, () => 'uuid-2')

  assert.equal(first, 'rp-uuid-1')
  assert.equal(second, 'rp-uuid-1')
})

test('feedback submission posts to the feedback endpoint and unwraps success response', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify({
      success: true,
      data: {
        id: 'feedback-1',
        notificationQueued: true
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }) as typeof fetch

  try {
    const result = await submitRankPeekFeedback({
      message: '这里是一个足够长的反馈内容。',
      contact: 'player@example.com'
    }, {
      appVersion: '1.0.0',
      platform: 'win32',
      locale: 'zh-CN',
      installationId: 'rp-installation-test'
    })

    assert.deepEqual(result, { id: 'feedback-1', notificationQueued: true })
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.url, 'https://api.rankpeek.cn/app/feedback')
    assert.equal(calls[0]?.init?.method, 'POST')
    assert.match(String(calls[0]?.init?.body), /rp-installation-test/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('announcements fetch filters locally dismissed ids', async () => {
  const storage = new MemoryStorage()
  dismissRankPeekAnnouncement('announcement-1', storage)
  assert.equal(isRankPeekAnnouncementDismissed('announcement-1', storage), true)

  const calls: Array<{ url: string; init?: RequestInit }> = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify({
      success: true,
      data: [
        {
          id: 'announcement-1',
          title: 'Hidden',
          body: 'Dismissed',
          level: 'info',
          linkUrl: null,
          startsAt: null,
          endsAt: null
        },
        {
          id: 'announcement-2',
          title: 'Visible',
          body: 'Shown',
          level: 'warning',
          linkUrl: 'https://rankpeek.cn',
          startsAt: null,
          endsAt: null
        }
      ]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }) as typeof fetch

  try {
    const announcements = await fetchRankPeekAnnouncements({
      version: '1.0.0',
      platform: 'win32',
      locale: 'zh-CN',
      channel: 'stable'
    }, { storage })

    assert.deepEqual(announcements.map(item => item.id), ['announcement-2'])
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.url, 'https://api.rankpeek.cn/app/announcements?version=1.0.0&platform=win32&locale=zh-CN&channel=stable')
    assert.equal(calls[0]?.init?.method, 'GET')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('announcement archive fetches recent announcements without dismissed filtering', async () => {
  const storage = new MemoryStorage()
  dismissRankPeekAnnouncement('announcement-1', storage)

  const calls: Array<{ url: string; init?: RequestInit }> = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify({
      success: true,
      data: [
        {
          id: 'announcement-1',
          title: 'Old',
          body: 'Still visible in archive',
          level: 'info',
          linkUrl: null,
          startsAt: null,
          endsAt: '2026-05-01T00:00:00.000Z'
        }
      ]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }) as typeof fetch

  try {
    const announcements = await fetchRankPeekAnnouncementArchive({
      version: '1.0.0',
      platform: 'win32',
      locale: 'zh-CN',
      channel: 'stable'
    }, { storage, limit: 20 })

    assert.deepEqual(announcements.map(item => item.id), ['announcement-1'])
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.url, 'https://api.rankpeek.cn/app/announcements/archive?version=1.0.0&platform=win32&locale=zh-CN&channel=stable&limit=20')
    assert.equal(calls[0]?.init?.method, 'GET')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('announcement read state is stored separately from dismissed state', () => {
  const storage = new MemoryStorage()

  markRankPeekAnnouncementRead('announcement-1', storage)
  dismissRankPeekAnnouncement('announcement-2', storage)

  assert.equal(isRankPeekAnnouncementRead('announcement-1', storage), true)
  assert.equal(isRankPeekAnnouncementRead('announcement-2', storage), false)
  assert.equal(isRankPeekAnnouncementDismissed('announcement-2', storage), true)
})
