import test from 'node:test'
import assert from 'node:assert/strict'
import { handleRequest } from '../src/handlers.mjs'

class FakeStatement {
  constructor(db, sql) {
    this.db = db
    this.sql = sql
    this.params = []
  }

  bind(...params) {
    this.params = params
    return this
  }

  async first() {
    if (this.sql.includes('count(*) as count')) {
      return { count: this.db.recentFeedbackCount }
    }
    return null
  }

  async run() {
    if (this.sql.includes('insert into feedback_messages')) {
      this.db.feedbackRows.push(this.params)
      return { success: true }
    }
    if (this.sql.includes('insert into announcements')) {
      const [
        id,
        title,
        body,
        level,
        linkUrl,
        minVersion,
        maxVersion,
        platforms,
        locales,
        channels,
        startsAt,
        endsAt,
        enabled,
        createdAt,
        updatedAt
      ] = this.params
      this.db.announcements.push({
        id,
        title,
        body,
        level,
        link_url: linkUrl,
        min_version: minVersion,
        max_version: maxVersion,
        platforms,
        locales,
        channels,
        starts_at: startsAt,
        ends_at: endsAt,
        enabled,
        created_at: createdAt,
        updated_at: updatedAt
      })
      return { success: true }
    }
    if (this.sql.includes('update announcements')) {
      const [
        title,
        body,
        level,
        linkUrl,
        minVersion,
        maxVersion,
        platforms,
        locales,
        channels,
        startsAt,
        endsAt,
        enabled,
        updatedAt,
        id
      ] = this.params
      const row = this.db.announcements.find(item => item.id === id)
      if (row) {
        Object.assign(row, {
          title,
          body,
          level,
          link_url: linkUrl,
          min_version: minVersion,
          max_version: maxVersion,
          platforms,
          locales,
          channels,
          starts_at: startsAt,
          ends_at: endsAt,
          enabled,
          updated_at: updatedAt
        })
      }
      return { success: true }
    }
    return { success: true }
  }

  async all() {
    if (this.sql.includes('from announcements')) {
      const rows = this.sql.includes('where enabled = 1')
        ? this.db.announcements.filter(row => row.enabled !== 0)
        : this.db.announcements
      return { results: rows }
    }
    return { results: [] }
  }
}

class FakeD1 {
  constructor() {
    this.feedbackRows = []
    this.announcements = []
    this.recentFeedbackCount = 0
  }

  prepare(sql) {
    return new FakeStatement(this, sql)
  }
}

function makeEnv(overrides = {}) {
  return {
    DB: new FakeD1(),
    EMAIL: {
      sent: [],
      async send(message) {
        this.sent.push(message)
      }
    },
    FEEDBACK_RECIPIENT_EMAIL: 'you@example.com',
    FEEDBACK_FROM_EMAIL: 'notify@rankpeek.cn',
    IP_HASH_SALT: 'test-salt',
    ADMIN_TOKEN: 'admin-secret',
    ...overrides
  }
}

async function readJson(response) {
  return response.json()
}

test('feedback endpoint validates message body before writing to D1', async () => {
  const env = makeEnv()
  const response = await handleRequest(new Request('https://api.rankpeek.cn/app/feedback', {
    method: 'POST',
    body: JSON.stringify({
      message: 'ab',
      contact: 'player@example.com',
      appVersion: '1.0.0',
      platform: 'win32',
      installationId: 'rp-installation-test'
    })
  }), env)

  assert.equal(response.status, 400)
  assert.equal(env.DB.feedbackRows.length, 0)
  const payload = await readJson(response)
  assert.equal(payload.success, false)
  assert.equal(payload.error.code, 'VALIDATION_ERROR')
})

test('feedback endpoint stores safe fields and sends email with logs when provided', async () => {
  const env = makeEnv()
  const response = await handleRequest(new Request('https://api.rankpeek.cn/app/feedback', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': '203.0.113.9',
      'user-agent': 'RankPeek/1.0.0'
    },
    body: JSON.stringify({
      message: '希望公告能够在客户端里展示，并且反馈不要上传日志。',
      contact: 'player@example.com',
      category: 'suggestion',
      appVersion: '1.0.0',
      platform: 'win32',
      locale: 'zh-CN',
      installationId: 'rp-installation-test',
      logs: {
        frontendLog: '[frontend] log content',
        backendLog: '[backend] log content'
      }
    })
  }), env)

  assert.equal(response.status, 200)
  const payload = await readJson(response)
  assert.equal(payload.success, true)
  assert.equal(payload.data.notificationQueued, true)
  assert.equal(env.DB.feedbackRows.length, 1)
  assert.equal(env.EMAIL.sent.length, 1)

  const storedParams = env.DB.feedbackRows[0].join('\n')
  assert.match(storedParams, /希望公告/)
  assert.match(storedParams, /player@example\.com/)
  assert.match(storedParams, /rp-installation-test/)
  // logs should NOT be stored in D1 (they go into email only)
  assert.doesNotMatch(storedParams, /frontend.*log/)
  assert.doesNotMatch(storedParams, /backend.*log/)

  // email should contain logs
  const emailText = env.EMAIL.sent[0].text
  assert.match(emailText, /Frontend Log/)
  assert.match(emailText, /\[frontend\] log content/)
  assert.match(emailText, /Backend Log/)
  assert.match(emailText, /\[backend\] log content/)
  assert.equal(env.EMAIL.sent[0].to, 'you@example.com')
  assert.equal(env.EMAIL.sent[0].from, 'notify@rankpeek.cn')
})

test('feedback endpoint rate limits repeated submissions for one installation', async () => {
  const env = makeEnv()
  env.DB.recentFeedbackCount = 5

  const response = await handleRequest(new Request('https://api.rankpeek.cn/app/feedback', {
    method: 'POST',
    body: JSON.stringify({
      message: '这是一个足够长的反馈内容，用来触发频率限制路径。',
      appVersion: '1.0.0',
      platform: 'win32',
      installationId: 'rp-installation-test'
    })
  }), env)

  assert.equal(response.status, 429)
  assert.equal(env.DB.feedbackRows.length, 0)
})

test('announcements endpoint filters by active window, channel, platform, and app version', async () => {
  const env = makeEnv()
  env.DB.announcements = [
    {
      id: 'active-1',
      title: 'RankPeek 公告',
      body: '新版下载源已迁移。',
      level: 'info',
      link_url: 'https://rankpeek.cn',
      min_version: '1.0.0',
      max_version: null,
      platforms: 'win32,windows',
      locales: 'zh-CN',
      channels: 'stable',
      starts_at: '2026-01-01T00:00:00.000Z',
      ends_at: '2026-12-31T23:59:59.000Z',
      enabled: 1,
      created_at: '2026-06-03T00:00:00.000Z'
    },
    {
      id: 'future-1',
      title: 'Future',
      body: 'Not yet',
      level: 'info',
      link_url: null,
      min_version: null,
      max_version: null,
      platforms: 'all',
      locales: 'all',
      channels: 'stable',
      starts_at: '2030-01-01T00:00:00.000Z',
      ends_at: null,
      enabled: 1,
      created_at: '2026-06-03T00:00:00.000Z'
    },
    {
      id: 'old-version',
      title: 'Old',
      body: 'Old clients only',
      level: 'warning',
      link_url: null,
      min_version: null,
      max_version: '0.9.0',
      platforms: 'all',
      locales: 'all',
      channels: 'stable',
      starts_at: null,
      ends_at: null,
      enabled: 1,
      created_at: '2026-06-03T00:00:00.000Z'
    }
  ]

  const response = await handleRequest(new Request(
    'https://api.rankpeek.cn/app/announcements?version=1.0.0&platform=win32&locale=zh-CN&channel=stable'
  ), env, { now: new Date('2026-06-03T00:00:00.000Z') })

  assert.equal(response.status, 200)
  const payload = await readJson(response)
  assert.deepEqual(payload.data.map(item => item.id), ['active-1'])
  assert.equal(payload.data[0].linkUrl, 'https://rankpeek.cn')
})

test('announcement archive returns recent visible rows including expired announcements', async () => {
  const env = makeEnv()
  env.DB.announcements = [
    {
      id: 'current-1',
      title: 'Current',
      body: 'Current body',
      level: 'info',
      link_url: null,
      min_version: '1.0.0',
      max_version: null,
      platforms: 'win32',
      locales: 'zh-CN',
      channels: 'stable',
      starts_at: '2026-06-01T00:00:00.000Z',
      ends_at: null,
      enabled: 1,
      created_at: '2026-06-03T00:00:00.000Z'
    },
    {
      id: 'expired-1',
      title: 'Expired',
      body: 'Expired body',
      level: 'warning',
      link_url: 'https://rankpeek.cn',
      min_version: null,
      max_version: null,
      platforms: 'all',
      locales: 'all',
      channels: 'stable',
      starts_at: '2026-05-01T00:00:00.000Z',
      ends_at: '2026-05-02T00:00:00.000Z',
      enabled: 1,
      created_at: '2026-05-01T00:00:00.000Z'
    },
    {
      id: 'future-1',
      title: 'Future',
      body: 'Future body',
      level: 'info',
      link_url: null,
      min_version: null,
      max_version: null,
      platforms: 'all',
      locales: 'all',
      channels: 'stable',
      starts_at: '2030-01-01T00:00:00.000Z',
      ends_at: null,
      enabled: 1,
      created_at: '2026-06-04T00:00:00.000Z'
    },
    {
      id: 'beta-1',
      title: 'Beta',
      body: 'Beta body',
      level: 'info',
      link_url: null,
      min_version: null,
      max_version: null,
      platforms: 'all',
      locales: 'all',
      channels: 'beta',
      starts_at: null,
      ends_at: null,
      enabled: 1,
      created_at: '2026-06-02T00:00:00.000Z'
    }
  ]

  const response = await handleRequest(new Request(
    'https://api.rankpeek.cn/app/announcements/archive?version=1.0.0&platform=win32&locale=zh-CN&channel=stable&limit=20'
  ), env, { now: new Date('2026-06-03T00:00:00.000Z') })

  assert.equal(response.status, 200)
  const payload = await readJson(response)
  assert.deepEqual(payload.data.map(item => item.id), ['current-1', 'expired-1'])
  assert.equal(payload.data[1].linkUrl, 'https://rankpeek.cn')
})

test('admin page serves the browser publishing form', async () => {
  const env = makeEnv()
  const response = await handleRequest(new Request('https://api.rankpeek.cn/admin'), env)

  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /text\/html/)
  const html = await response.text()
  assert.match(html, /RankPeek 公告后台/)
  assert.match(html, /发布公告/)
  assert.match(html, /管理员密钥/)
  assert.match(html, /保存公告/)
  assert.match(html, /POST \/admin\/announcements/)
  assert.match(html, /Authorization/)
})

test('admin announcement endpoints require bearer token', async () => {
  const env = makeEnv()
  const response = await handleRequest(new Request('https://api.rankpeek.cn/admin/announcements', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Maintenance',
      body: 'RankPeek service notice body'
    })
  }), env)

  assert.equal(response.status, 401)
  assert.equal(env.DB.announcements.length, 0)
  const payload = await readJson(response)
  assert.equal(payload.success, false)
  assert.equal(payload.error.code, 'UNAUTHORIZED')
})

test('admin announcement creation validates and inserts normalized D1 row', async () => {
  const env = makeEnv()
  const response = await handleRequest(new Request('https://api.rankpeek.cn/admin/announcements', {
    method: 'POST',
    headers: {
      authorization: 'Bearer admin-secret',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      title: 'RankPeek Notice',
      body: 'Download mirror has moved. Please use the official download link.',
      level: 'warning',
      linkUrl: 'https://rankpeek.cn',
      minVersion: '1.0.0',
      maxVersion: '',
      platforms: 'win32, windows',
      locales: 'zh-CN',
      channels: 'stable',
      startsAt: '2026-06-03T00:00:00.000Z',
      endsAt: '2026-12-31T23:59:59.000Z',
      enabled: true
    })
  }), env, { now: new Date('2026-06-03T00:00:00.000Z') })

  assert.equal(response.status, 200)
  const payload = await readJson(response)
  assert.equal(payload.success, true)
  assert.equal(payload.data.title, 'RankPeek Notice')
  assert.equal(payload.data.level, 'warning')
  assert.equal(env.DB.announcements.length, 1)
  assert.equal(env.DB.announcements[0].title, 'RankPeek Notice')
  assert.equal(env.DB.announcements[0].body, 'Download mirror has moved. Please use the official download link.')
  assert.equal(env.DB.announcements[0].level, 'warning')
  assert.equal(env.DB.announcements[0].platforms, 'win32,windows')
  assert.equal(env.DB.announcements[0].enabled, 1)
})

test('admin announcement list returns stored rows when authorized', async () => {
  const env = makeEnv()
  env.DB.announcements = [
    {
      id: 'announcement-1',
      title: 'RankPeek Notice',
      body: 'Body text',
      level: 'info',
      link_url: null,
      min_version: null,
      max_version: null,
      platforms: 'all',
      locales: 'all',
      channels: 'stable',
      starts_at: null,
      ends_at: null,
      enabled: 1,
      created_at: '2026-06-03T00:00:00.000Z',
      updated_at: '2026-06-03T00:00:00.000Z'
    }
  ]

  const response = await handleRequest(new Request('https://api.rankpeek.cn/admin/announcements', {
    headers: {
      authorization: 'Bearer admin-secret'
    }
  }), env)

  assert.equal(response.status, 200)
  const payload = await readJson(response)
  assert.deepEqual(payload.data.map(item => item.id), ['announcement-1'])
  assert.equal(payload.data[0].enabled, true)
})

test('admin announcement patch updates existing rows and disabled rows disappear from public feed', async () => {
  const env = makeEnv()
  env.DB.announcements = [
    {
      id: 'announcement-1',
      title: 'RankPeek Notice',
      body: 'Body text',
      level: 'info',
      link_url: null,
      min_version: null,
      max_version: null,
      platforms: 'all',
      locales: 'all',
      channels: 'stable',
      starts_at: null,
      ends_at: null,
      enabled: 1,
      created_at: '2026-06-03T00:00:00.000Z',
      updated_at: '2026-06-03T00:00:00.000Z'
    }
  ]

  const response = await handleRequest(new Request('https://api.rankpeek.cn/admin/announcements/announcement-1', {
    method: 'PATCH',
    headers: {
      authorization: 'Bearer admin-secret',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      title: 'Updated Notice',
      body: 'Updated body text',
      level: 'critical',
      enabled: false
    })
  }), env, { now: new Date('2026-06-03T00:00:00.000Z') })

  assert.equal(response.status, 200)
  const payload = await readJson(response)
  assert.equal(payload.data.title, 'Updated Notice')
  assert.equal(payload.data.enabled, false)
  assert.equal(env.DB.announcements[0].title, 'Updated Notice')
  assert.equal(env.DB.announcements[0].enabled, 0)

  const publicResponse = await handleRequest(new Request(
    'https://api.rankpeek.cn/app/announcements?version=1.0.0&platform=win32&locale=zh-CN&channel=stable'
  ), env, { now: new Date('2026-06-03T00:00:00.000Z') })
  const publicPayload = await readJson(publicResponse)
  assert.deepEqual(publicPayload.data, [])
})

// ---------- 下载路由：Range 支持 ----------
// electron-builder 的差分更新会先取 .blockmap，再按块发 Range 请求。
// 服务端忽略 Range 返回 200 整包时，客户端会把 225MB 的完整安装包当成一个差分块，
// 直接把文件写坏 —— 这就是 1.1.0 没敢发布 .blockmap 的原因。
class FakeR2Bucket {
  constructor(files) {
    this.files = files
  }

  async head(name) {
    const buffer = this.files[name]
    if (!buffer) return null
    return {
      size: buffer.byteLength,
      httpMetadata: {},
      writeHttpMetadata(headers) {
        headers.set('content-type', 'application/octet-stream')
      }
    }
  }

  async get(name, options) {
    const buffer = this.files[name]
    if (!buffer) return null
    const range = options && options.range
    const body = range ? buffer.subarray(range.offset, range.offset + range.length) : buffer
    return {
      size: buffer.byteLength,
      body,
      httpMetadata: {},
      writeHttpMetadata(headers) {
        headers.set('content-type', 'application/octet-stream')
      }
    }
  }
}

const PAYLOAD = new TextEncoder().encode('0123456789abcdefghij')
const FULL_BODY = '0123456789abcdefghij'
const downloadEnv = () => ({ DOWNLOADS: new FakeR2Bucket({ 'pkg.exe': PAYLOAD }) })

test('download serves the whole file and advertises range support', async () => {
  const response = await handleRequest(new Request('https://api.rankpeek.cn/download/pkg.exe'), downloadEnv())
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('accept-ranges'), 'bytes')
  assert.equal(response.headers.get('content-length'), '20')
  assert.equal(await response.text(), FULL_BODY)
})

test('download answers a closed byte range with 206 and content-range', async () => {
  const response = await handleRequest(new Request('https://api.rankpeek.cn/download/pkg.exe', {
    headers: { range: 'bytes=0-9' }
  }), downloadEnv())
  assert.equal(response.status, 206)
  assert.equal(response.headers.get('content-range'), 'bytes 0-9/20')
  assert.equal(response.headers.get('content-length'), '10')
  assert.equal(await response.text(), '0123456789')
})

test('download answers an open-ended byte range to the end of the file', async () => {
  const response = await handleRequest(new Request('https://api.rankpeek.cn/download/pkg.exe', {
    headers: { range: 'bytes=15-' }
  }), downloadEnv())
  assert.equal(response.status, 206)
  assert.equal(response.headers.get('content-range'), 'bytes 15-19/20')
  assert.equal(await response.text(), 'fghij')
})

test('download answers a suffix byte range from the end of the file', async () => {
  const response = await handleRequest(new Request('https://api.rankpeek.cn/download/pkg.exe', {
    headers: { range: 'bytes=-5' }
  }), downloadEnv())
  assert.equal(response.status, 206)
  assert.equal(response.headers.get('content-range'), 'bytes 15-19/20')
  assert.equal(await response.text(), 'fghij')
})

test('download clamps a range that runs past the end of the file', async () => {
  const response = await handleRequest(new Request('https://api.rankpeek.cn/download/pkg.exe', {
    headers: { range: 'bytes=18-999' }
  }), downloadEnv())
  assert.equal(response.status, 206)
  assert.equal(response.headers.get('content-range'), 'bytes 18-19/20')
  assert.equal(await response.text(), 'ij')
})

test('download rejects a range that starts past the end of the file', async () => {
  const response = await handleRequest(new Request('https://api.rankpeek.cn/download/pkg.exe', {
    headers: { range: 'bytes=50-60' }
  }), downloadEnv())
  assert.equal(response.status, 416)
  assert.equal(response.headers.get('content-range'), 'bytes */20')
})

test('download falls back to the whole file for multi-range or malformed headers', async () => {
  for (const value of ['bytes=0-1,4-5', 'bytes=abc', 'items=0-1', 'bytes=9-0', 'bytes=-']) {
    const response = await handleRequest(new Request('https://api.rankpeek.cn/download/pkg.exe', {
      headers: { range: value }
    }), downloadEnv())
    assert.equal(response.status, 200, 'expected 200 for ' + value)
    assert.equal(await response.text(), FULL_BODY, 'expected full body for ' + value)
  }
})

test('download returns 404 for an unknown file even when a range is requested', async () => {
  const response = await handleRequest(new Request('https://api.rankpeek.cn/download/nope.exe', {
    headers: { range: 'bytes=0-9' }
  }), downloadEnv())
  assert.equal(response.status, 404)
})

