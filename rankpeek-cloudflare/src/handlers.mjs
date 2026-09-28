import { renderAdminPage } from './admin-page.mjs'

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type, authorization'
}

const HEXTECH_PROXY_ROUTES = new Map([
  ['/hextech/upload', '/api/v1/upload/batch'],
  ['/hextech/heartbeat', '/api/v1/telemetry/heartbeat']
])
const HEXTECH_MAX_BODY_BYTES = 64 * 1024
const HEXTECH_MAX_PER_MINUTE = 12
const hextechRateBuckets = new Map()

const FEEDBACK_MAX_PER_HOUR = 5
const FEEDBACK_CATEGORIES = new Set(['bug', 'suggestion', 'other'])
const ANNOUNCEMENT_LEVELS = new Set(['info', 'warning', 'critical'])

export async function handleRequest(request, env, options = {}) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: JSON_HEADERS })
  }

  const url = new URL(request.url)
  const downloadMatch = url.pathname.match(/^\/download\/(.+)$/)
  if (downloadMatch && request.method === 'GET') {
    return handleDownload(decodeURIComponent(downloadMatch[1]), env, request)
  }

  const hextechTarget = HEXTECH_PROXY_ROUTES.get(url.pathname)
  if (hextechTarget && request.method === 'POST') {
    return handleHextechProxy(request, env, hextechTarget)
  }

  if (url.pathname === '/app/feedback' && request.method === 'POST') {
    return handleFeedback(request, env, options)
  }

  if (url.pathname === '/app/announcements/archive' && request.method === 'GET') {
    return handleAnnouncementArchive(url, env, options)
  }

  if (url.pathname === '/app/announcements' && request.method === 'GET') {
    return handleAnnouncements(url, env, options)
  }

  if (url.pathname === '/admin' && request.method === 'GET') {
    return new Response(renderAdminPage(), {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8'
      }
    })
  }

  if (url.pathname === '/admin/announcements' && request.method === 'GET') {
    return withAdminAuth(request, env, () => handleAdminAnnouncementList(env))
  }

  if (url.pathname === '/admin/announcements' && request.method === 'POST') {
    return withAdminAuth(request, env, () => handleAdminAnnouncementCreate(request, env, options))
  }

  const adminAnnouncementMatch = url.pathname.match(/^\/admin\/announcements\/([^/]+)$/)
  if (adminAnnouncementMatch && request.method === 'PATCH') {
    return withAdminAuth(request, env, () => handleAdminAnnouncementPatch(
      decodeURIComponent(adminAnnouncementMatch[1]),
      request,
      env,
      options
    ))
  }

  if (adminAnnouncementMatch && request.method === 'DELETE') {
    return withAdminAuth(request, env, () => handleAdminAnnouncementDelete(
      decodeURIComponent(adminAnnouncementMatch[1]),
      env
    ))
  }

  return jsonResponse({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, 404)
}

async function handleFeedback(request, env, options) {
  if (!env.DB) {
    return jsonResponse({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Database is not configured' } }, 503)
  }

  const body = await readJsonBody(request)
  if (!body.ok) {
    return validationError('Request body must be valid JSON')
  }

  const payload = normalizeFeedbackPayload(body.value)
  if (!payload.ok) {
    return validationError(payload.message)
  }

  const feedback = payload.value
  const createdAt = (options.now ?? new Date()).toISOString()
  const ipHash = await hashRequestIp(request, env)
  const userAgent = truncate(String(request.headers.get('user-agent') ?? ''), 300)
  const limited = await isRateLimited(env.DB, {
    installationId: feedback.installationId,
    ipHash,
    now: options.now ?? new Date()
  })

  if (limited) {
    return jsonResponse({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many feedback submissions. Try again later.' }
    }, 429)
  }

  const id = crypto.randomUUID()
  await env.DB.prepare(`
    insert into feedback_messages (
      id, category, contact, message, app_version, platform, locale,
      installation_id, ip_hash, user_agent, notification_status, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    feedback.category,
    feedback.contact,
    feedback.message,
    feedback.appVersion,
    feedback.platform,
    feedback.locale,
    feedback.installationId,
    ipHash,
    userAgent,
    'pending',
    createdAt
  ).run()

  const notificationQueued = await notifyFeedback(env, { id, ...feedback, createdAt })
  await env.DB.prepare(`
    update feedback_messages
    set notification_status = ?
    where id = ?
  `).bind(notificationQueued ? 'sent' : 'failed', id).run()

  return jsonResponse({
    success: true,
    data: {
      id,
      notificationQueued
    }
  })
}

async function handleAnnouncements(url, env, options) {
  if (!env.DB) {
    return jsonResponse({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Database is not configured' } }, 503)
  }

  const version = normalizeQueryValue(url.searchParams.get('version')) || '0.0.0'
  const platform = normalizeQueryValue(url.searchParams.get('platform')) || 'unknown'
  const locale = normalizeQueryValue(url.searchParams.get('locale')) || 'zh-CN'
  const channel = normalizeQueryValue(url.searchParams.get('channel')) || 'stable'
  const now = options.now ?? new Date()

  const result = await env.DB.prepare(`
    select
      id, title, body, level, link_url, min_version, max_version,
      platforms, locales, channels, starts_at, ends_at, enabled, created_at
    from announcements
    where enabled = 1
    order by created_at desc
    limit 50
  `).all()

  const announcements = (result.results ?? [])
    .filter(row => isAnnouncementActiveFor(row, { version, platform, locale, channel, now }))
    .map(mapAnnouncementRow)

  return jsonResponse({ success: true, data: announcements })
}

async function handleAnnouncementArchive(url, env, options) {
  if (!env.DB) {
    return jsonResponse({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Database is not configured' } }, 503)
  }

  const version = normalizeQueryValue(url.searchParams.get('version')) || '0.0.0'
  const platform = normalizeQueryValue(url.searchParams.get('platform')) || 'unknown'
  const locale = normalizeQueryValue(url.searchParams.get('locale')) || 'zh-CN'
  const channel = normalizeQueryValue(url.searchParams.get('channel')) || 'stable'
  const limit = normalizeLimit(url.searchParams.get('limit'), 20, 50)
  const now = options.now ?? new Date()

  const result = await env.DB.prepare(`
    select
      id, title, body, level, link_url, min_version, max_version,
      platforms, locales, channels, starts_at, ends_at, enabled, created_at
    from announcements
    where enabled = 1
    order by created_at desc
    limit 100
  `).all()

  const announcements = (result.results ?? [])
    .filter(row => isAnnouncementVisibleInArchiveFor(row, { version, platform, locale, channel, now }))
    .slice(0, limit)
    .map(mapAnnouncementRow)

  return jsonResponse({ success: true, data: announcements })
}

async function handleAdminAnnouncementList(env) {
  if (!env.DB) {
    return jsonResponse({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Database is not configured' } }, 503)
  }

  const result = await env.DB.prepare(`
    select
      id, title, body, level, link_url, min_version, max_version,
      platforms, locales, channels, starts_at, ends_at, enabled, created_at, updated_at
    from announcements
    order by created_at desc
    limit 100
  `).all()

  return jsonResponse({
    success: true,
    data: (result.results ?? []).map(mapAdminAnnouncementRow)
  })
}

async function handleAdminAnnouncementCreate(request, env, options) {
  if (!env.DB) {
    return jsonResponse({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Database is not configured' } }, 503)
  }

  const body = await readJsonBody(request)
  if (!body.ok) {
    return validationError('Request body must be valid JSON')
  }

  const payload = normalizeAnnouncementPayload(body.value)
  if (!payload.ok) {
    return validationError(payload.message)
  }

  const id = crypto.randomUUID()
  const now = (options.now ?? new Date()).toISOString()
  const announcement = { id, ...payload.value, createdAt: now, updatedAt: now }

  await env.DB.prepare(`
    insert into announcements (
      id, title, body, level, link_url, min_version, max_version,
      platforms, locales, channels, starts_at, ends_at, enabled, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    announcement.id,
    announcement.title,
    announcement.body,
    announcement.level,
    announcement.linkUrl,
    announcement.minVersion,
    announcement.maxVersion,
    announcement.platforms,
    announcement.locales,
    announcement.channels,
    announcement.startsAt,
    announcement.endsAt,
    announcement.enabled ? 1 : 0,
    announcement.createdAt,
    announcement.updatedAt
  ).run()

  return jsonResponse({ success: true, data: announcement })
}

async function handleAdminAnnouncementPatch(id, request, env, options) {
  if (!env.DB) {
    return jsonResponse({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Database is not configured' } }, 503)
  }

  const announcementId = normalizeString(id, 120)
  if (!announcementId) {
    return validationError('Announcement id is required')
  }

  const body = await readJsonBody(request)
  if (!body.ok) {
    return validationError('Request body must be valid JSON')
  }

  const payload = normalizeAnnouncementPayload(body.value)
  if (!payload.ok) {
    return validationError(payload.message)
  }

  const updatedAt = (options.now ?? new Date()).toISOString()
  const announcement = { id: announcementId, ...payload.value, updatedAt }

  await env.DB.prepare(`
    update announcements
    set title = ?,
        body = ?,
        level = ?,
        link_url = ?,
        min_version = ?,
        max_version = ?,
        platforms = ?,
        locales = ?,
        channels = ?,
        starts_at = ?,
        ends_at = ?,
        enabled = ?,
        updated_at = ?
    where id = ?
  `).bind(
    announcement.title,
    announcement.body,
    announcement.level,
    announcement.linkUrl,
    announcement.minVersion,
    announcement.maxVersion,
    announcement.platforms,
    announcement.locales,
    announcement.channels,
    announcement.startsAt,
    announcement.endsAt,
    announcement.enabled ? 1 : 0,
    announcement.updatedAt,
    announcement.id
  ).run()

  return jsonResponse({ success: true, data: announcement })
}

async function handleAdminAnnouncementDelete(id, env) {
  if (!env.DB) {
    return jsonResponse({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Database is not configured' } }, 503)
  }

  const announcementId = normalizeString(id, 120)
  if (!announcementId) {
    return validationError('Announcement id is required')
  }

  await env.DB.prepare('DELETE FROM announcements WHERE id = ?').bind(announcementId).run()

  return jsonResponse({ success: true })
}

function downloadHeaders(object, filename) {
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('content-disposition', `attachment; filename="${filename}"`)
  headers.set('cache-control', 'public, max-age=86400')
  headers.set('access-control-allow-origin', '*')
  headers.set('accept-ranges', 'bytes')
  return headers
}

/**
 * 解析单段 Range 头。多段（含逗号）与非法值一律返回 null，退化成整包响应。
 * suffix 表示 `bytes=-N` 这种「取最后 N 字节」，要拿到总长才能换算。
 */
function parseRangeHeader(header) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim())
  if (!match) return null
  const [, rawStart, rawEnd] = match
  if (rawStart === '' && rawEnd === '') return null
  if (rawStart === '') {
    const suffix = Number(rawEnd)
    return Number.isFinite(suffix) && suffix > 0 ? { suffix } : null
  }
  const start = Number(rawStart)
  if (!Number.isFinite(start) || start < 0) return null
  if (rawEnd === '') return { start, end: null }
  const end = Number(rawEnd)
  if (!Number.isFinite(end) || end < start) return null
  return { start, end }
}

/**
 * 下载路由，支持单段 Range。
 *
 * <p>必须支持 Range：electron-builder 的差分更新会先取 .blockmap、再按块发 Range 请求。
 * 服务端忽略 Range 返回 200 整包时，客户端会把 225MB 的完整安装包当成一个差分块写进去，
 * 文件直接损坏 —— 这就是 1.1.0 没敢发布 .blockmap 的原因。
 */
async function handleDownload(filename, env, request) {
  if (!env.DOWNLOADS) {
    return new Response('Storage not configured', { status: 503 })
  }

  const parsed = request ? parseRangeHeader(request.headers.get('range')) : null

  if (!parsed) {
    const object = await env.DOWNLOADS.get(filename)
    if (!object) {
      return new Response(`File not found: ${filename}`, { status: 404 })
    }
    const headers = downloadHeaders(object, filename)
    headers.set('content-length', String(object.size))
    return new Response(object.body, { status: 200, headers })
  }

  const head = await env.DOWNLOADS.head(filename)
  if (!head) {
    return new Response(`File not found: ${filename}`, { status: 404 })
  }
  const total = head.size
  const start = parsed.suffix === undefined ? parsed.start : Math.max(0, total - parsed.suffix)
  const end = parsed.suffix !== undefined || parsed.end === null
    ? total - 1
    : Math.min(parsed.end, total - 1)

  if (start >= total) {
    return new Response(null, {
      status: 416,
      headers: { 'accept-ranges': 'bytes', 'content-range': `bytes */${total}` }
    })
  }

  const object = await env.DOWNLOADS.get(filename, {
    range: { offset: start, length: end - start + 1 }
  })
  if (!object) {
    return new Response(`File not found: ${filename}`, { status: 404 })
  }
  const headers = downloadHeaders(object, filename)
  headers.delete('content-encoding')
  headers.set('content-range', `bytes ${start}-${end}/${total}`)
  headers.set('content-length', String(end - start + 1))
  return new Response(object.body, { status: 206, headers })
}

/**
 * 把客户端的匿名海斗数据转发到自建服务器。
 *
 * 客户端 -> https://api.rankpeek.cn/hextech/upload（TLS）-> http://<自建 IP>/api/v1/upload/batch
 * 共享密钥只存在于 Worker secret 与服务器上，客户端拿不到；服务端会拒绝没有密钥的写入。
 */
async function handleHextechProxy(request, env, targetPath) {
  const baseUrl = String(env.HEXTECH_INGEST_URL || '').replace(/\/+$/, '')
  if (!baseUrl) {
    return jsonResponse({ success: false, error: { code: 'PROXY_NOT_CONFIGURED', message: 'ingest host is not configured' } }, 503)
  }
  const secret = env.HEXTECH_PROXY_SECRET
  if (!secret) {
    return jsonResponse({ success: false, error: { code: 'PROXY_NOT_CONFIGURED', message: 'ingest proxy is not configured' } }, 503)
  }

  const declaredLength = Number(request.headers.get('content-length') || 0)
  if (Number.isFinite(declaredLength) && declaredLength > HEXTECH_MAX_BODY_BYTES) {
    return jsonResponse({ success: false, error: { code: 'PAYLOAD_TOO_LARGE' } }, 413)
  }

  const ipHash = await hashRequestIp(request, env)
  if (isHextechRateLimited(ipHash)) {
    return jsonResponse({ success: false, error: { code: 'RATE_LIMITED' } }, 429)
  }

  const body = await request.text()
  if (body.length > HEXTECH_MAX_BODY_BYTES) {
    return jsonResponse({ success: false, error: { code: 'PAYLOAD_TOO_LARGE' } }, 413)
  }

  let upstream
  try {
    upstream = await fetch(baseUrl + targetPath, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-rankpeek-proxy': secret },
      body
    })
  } catch (error) {
    return jsonResponse({ success: false, error: { code: 'UPSTREAM_UNAVAILABLE', message: String(error) } }, 502)
  }

  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  })
}

function isHextechRateLimited(ipHash) {
  const minute = Math.floor(Date.now() / 60000)
  const suffix = ':' + minute
  const key = ipHash + suffix
  const count = (hextechRateBuckets.get(key) || 0) + 1
  hextechRateBuckets.set(key, count)
  if (hextechRateBuckets.size > 4096) {
    for (const existing of hextechRateBuckets.keys()) {
      if (!existing.endsWith(suffix)) {
        hextechRateBuckets.delete(existing)
      }
    }
  }
  return count > HEXTECH_MAX_PER_MINUTE
}

async function readJsonBody(request) {
  try {
    const value = await request.json()
    return { ok: true, value }
  } catch {
    return { ok: false }
  }
}

function normalizeFeedbackPayload(value) {
  if (!isRecord(value)) {
    return { ok: false, message: 'Feedback payload must be an object' }
  }

  const message = normalizeString(value.message, 2000)
  if (message.length < 3) {
    return { ok: false, message: 'Feedback message must be at least 3 characters' }
  }

  const contact = normalizeString(value.contact, 180)
  const category = normalizeCategory(value.category)
  const appVersion = normalizeString(value.appVersion, 40) || 'unknown'
  const platform = normalizeString(value.platform, 40) || 'unknown'
  const locale = normalizeString(value.locale, 20) || 'zh-CN'
  const installationId = normalizeString(value.installationId, 80)
  if (!installationId) {
    return { ok: false, message: 'Installation id is required' }
  }

  const logs = normalizeLogs(value.logs)

  return {
    ok: true,
    value: {
      message,
      contact,
      category,
      appVersion,
      platform,
      locale,
      installationId,
      logs
    }
  }
}

function normalizeAnnouncementPayload(value) {
  if (!isRecord(value)) {
    return { ok: false, message: 'Announcement payload must be an object' }
  }

  const title = normalizeString(value.title, 120)
  if (!title) {
    return { ok: false, message: 'Announcement title is required' }
  }

  const body = normalizeString(value.body, 2000)
  if (!body) {
    return { ok: false, message: 'Announcement body is required' }
  }

  const linkUrl = normalizeOptionalUrl(value.linkUrl)
  if (!linkUrl.ok) {
    return linkUrl
  }

  const startsAt = normalizeOptionalIsoDate(value.startsAt, 'startsAt')
  if (!startsAt.ok) {
    return startsAt
  }

  const endsAt = normalizeOptionalIsoDate(value.endsAt, 'endsAt')
  if (!endsAt.ok) {
    return endsAt
  }

  return {
    ok: true,
    value: {
      title,
      body,
      level: normalizeAnnouncementLevel(value.level),
      linkUrl: linkUrl.value,
      minVersion: normalizeNullableString(value.minVersion, 40),
      maxVersion: normalizeNullableString(value.maxVersion, 40),
      platforms: normalizeCsvSetting(value.platforms, 'all'),
      locales: normalizeCsvSetting(value.locales, 'all'),
      channels: normalizeCsvSetting(value.channels, 'stable'),
      startsAt: startsAt.value,
      endsAt: endsAt.value,
      enabled: value.enabled !== false
    }
  }
}

function normalizeCategory(value) {
  const category = normalizeString(value, 30)
  return FEEDBACK_CATEGORIES.has(category) ? category : 'other'
}

function normalizeLogs(value) {
  if (!isRecord(value)) {
    return null
  }
  const frontend = normalizeString(value.frontendLog, 600 * 1024)
  const backend = normalizeString(value.backendLog, 600 * 1024)
  if (!frontend && !backend) {
    return null
  }
  return { frontendLog: frontend || '', backendLog: backend || '' }
}

function normalizeAnnouncementLevel(value) {
  const level = normalizeString(value, 20).toLowerCase()
  return ANNOUNCEMENT_LEVELS.has(level) ? level : 'info'
}

function normalizeString(value, maxLength) {
  if (typeof value !== 'string') {
    return ''
  }
  return truncate(value.trim(), maxLength)
}

function normalizeNullableString(value, maxLength) {
  const normalized = normalizeString(value, maxLength)
  return normalized || null
}

function normalizeCsvSetting(value, fallback) {
  const normalized = normalizeString(value, 260)
  const entries = normalized
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
  return entries.length ? Array.from(new Set(entries)).join(',') : fallback
}

function normalizeOptionalUrl(value) {
  const normalized = normalizeNullableString(value, 300)
  if (!normalized) {
    return { ok: true, value: null }
  }

  let url
  try {
    url = new URL(normalized)
  } catch {
    return { ok: false, message: 'Announcement linkUrl must be a valid HTTP URL' }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, message: 'Announcement linkUrl must be a valid HTTP URL' }
  }

  return { ok: true, value: normalized }
}

function normalizeOptionalIsoDate(value, fieldName) {
  const normalized = normalizeNullableString(value, 40)
  if (!normalized) {
    return { ok: true, value: null }
  }

  if (!Number.isFinite(Date.parse(normalized))) {
    return { ok: false, message: `Announcement ${fieldName} must be a valid ISO date` }
  }

  return { ok: true, value: normalized }
}

function truncate(value, maxLength) {
  return value.length > maxLength ? value.slice(0, maxLength) : value
}

async function isRateLimited(db, { installationId, ipHash, now }) {
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
  const row = await db.prepare(`
    select count(*) as count
    from feedback_messages
    where created_at >= ?
      and (installation_id = ? or ip_hash = ?)
  `).bind(oneHourAgo, installationId, ipHash).first()

  return Number(row?.count ?? 0) >= FEEDBACK_MAX_PER_HOUR
}

async function hashRequestIp(request, env) {
  const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? 'unknown'
  const salt = env.IP_HASH_SALT || 'rankpeek-feedback'
  const encoded = new TextEncoder().encode(`${salt}:${ip}`)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

async function notifyFeedback(env, feedback) {
  if (!env.EMAIL?.send || !env.FEEDBACK_RECIPIENT_EMAIL || !env.FEEDBACK_FROM_EMAIL) {
    return false
  }

  const lines = [
    `Feedback id: ${feedback.id}`,
    `Category: ${feedback.category}`,
    `Contact: ${feedback.contact || 'not provided'}`,
    `Version: ${feedback.appVersion}`,
    `Platform: ${feedback.platform}`,
    `Locale: ${feedback.locale}`,
    `Installation: ${feedback.installationId}`,
    `Created: ${feedback.createdAt}`,
    '',
    feedback.message
  ]

  if (feedback.logs) {
    lines.push('', '--- Application Logs ---', '')
    if (feedback.logs.frontendLog) {
      lines.push('=== Frontend Log ===')
      lines.push(feedback.logs.frontendLog)
    }
    if (feedback.logs.backendLog) {
      lines.push('=== Backend Log ===')
      lines.push(feedback.logs.backendLog)
    }
    const maxBody = 200 * 1024
    if (lines.join('\n').length > maxBody) {
      lines.length = 0
      lines.push(
        `Feedback id: ${feedback.id}`,
        `Category: ${feedback.category}`,
        `Contact: ${feedback.contact || 'not provided'}`,
        `Version: ${feedback.appVersion}`,
        `Platform: ${feedback.platform}`,
        `Locale: ${feedback.locale}`,
        `Installation: ${feedback.installationId}`,
        `Created: ${feedback.createdAt}`,
        '',
        feedback.message,
        '',
        '--- Application Logs (truncated for email size) ---',
        ''
      )
      if (feedback.logs.frontendLog) {
        lines.push('=== Frontend Log (last 80KB) ===')
        lines.push(feedback.logs.frontendLog.slice(-80 * 1024))
      }
      if (feedback.logs.backendLog) {
        lines.push('=== Backend Log (last 80KB) ===')
        lines.push(feedback.logs.backendLog.slice(-80 * 1024))
      }
    }
  }

  try {
    await env.EMAIL.send({
      from: env.FEEDBACK_FROM_EMAIL,
      to: env.FEEDBACK_RECIPIENT_EMAIL,
      subject: `[RankPeek] New feedback ${feedback.id.slice(0, 8)}`,
      text: lines.join('\n')
    })
    return true
  } catch {
    return false
  }
}

function validationError(message) {
  return jsonResponse({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message
    }
  }, 400)
}

function isAnnouncementActiveFor(row, request) {
  return (
    isWithinTimeWindow(row, request.now) &&
    matchesCsv(row.channels, request.channel) &&
    matchesCsv(row.locales, request.locale) &&
    matchesPlatform(row.platforms, request.platform) &&
    matchesVersionRange(request.version, row.min_version, row.max_version)
  )
}

function isAnnouncementVisibleInArchiveFor(row, request) {
  return (
    hasAnnouncementStarted(row, request.now) &&
    matchesCsv(row.channels, request.channel) &&
    matchesCsv(row.locales, request.locale) &&
    matchesPlatform(row.platforms, request.platform) &&
    matchesVersionRange(request.version, row.min_version, row.max_version)
  )
}

function isWithinTimeWindow(row, now) {
  const time = now.getTime()
  if (row.starts_at && Date.parse(row.starts_at) > time) {
    return false
  }
  if (row.ends_at && Date.parse(row.ends_at) <= time) {
    return false
  }
  return true
}

function hasAnnouncementStarted(row, now) {
  return !row.starts_at || Date.parse(row.starts_at) <= now.getTime()
}

function matchesCsv(csv, value) {
  const entries = splitCsv(csv)
  return entries.length === 0 || entries.includes('all') || entries.includes(value.toLowerCase())
}

function matchesPlatform(csv, platform) {
  const normalizedPlatform = platform.toLowerCase()
  const aliases = new Set([normalizedPlatform])
  if (normalizedPlatform === 'win32' || normalizedPlatform === 'windows') {
    aliases.add('win32')
    aliases.add('windows')
  }
  const entries = splitCsv(csv)
  return entries.length === 0 || entries.includes('all') || entries.some(entry => aliases.has(entry))
}

function splitCsv(value) {
  if (typeof value !== 'string') {
    return []
  }
  return value
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
}

function matchesVersionRange(version, minVersion, maxVersion) {
  if (minVersion && compareVersions(version, minVersion) < 0) {
    return false
  }
  if (maxVersion && compareVersions(version, maxVersion) > 0) {
    return false
  }
  return true
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left)
  const rightParts = parseVersion(right)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (difference !== 0) {
      return difference > 0 ? 1 : -1
    }
  }
  return 0
}

function parseVersion(value) {
  return String(value ?? '')
    .split(/[.-]/)
    .map(part => Number.parseInt(part, 10))
    .filter(part => Number.isFinite(part))
}

function mapAnnouncementRow(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    level: row.level || 'info',
    linkUrl: row.link_url || null,
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null
  }
}

function mapAdminAnnouncementRow(row) {
  return {
    ...mapAnnouncementRow(row),
    minVersion: row.min_version || null,
    maxVersion: row.max_version || null,
    platforms: row.platforms || 'all',
    locales: row.locales || 'all',
    channels: row.channels || 'stable',
    enabled: row.enabled !== 0,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  }
}

function normalizeQueryValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeLimit(value, fallback, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.max(1, Math.min(max, parsed))
}

async function withAdminAuth(request, env, handler) {
  const configuredToken = normalizeString(env.ADMIN_TOKEN, 300)
  if (!configuredToken) {
    return jsonResponse({
      success: false,
      error: { code: 'ADMIN_TOKEN_MISSING', message: 'Admin token is not configured' }
    }, 503)
  }

  const header = request.headers.get('authorization') || ''
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || ''
  if (token !== configuredToken) {
    return jsonResponse({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Admin authorization is required' }
    }, 401)
  }

  return handler()
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS
  })
}

function isRecord(value) {
  return typeof value === 'object' && value !== null
}
