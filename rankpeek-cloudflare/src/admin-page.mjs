export function renderAdminPage() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>RankPeek 公告后台</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #070a10;
        color: #f5f7fb;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-width: 320px;
        background:
          radial-gradient(circle at 20% 0%, rgba(41, 151, 255, .18), transparent 34rem),
          linear-gradient(180deg, #08101d, #05070a 28rem);
      }
      main {
        width: min(1120px, calc(100% - 32px));
        margin: 0 auto;
        padding: 32px 0 56px;
      }
      header {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 18px;
        margin-bottom: 24px;
      }
      h1 {
        margin: 0;
        font-size: clamp(30px, 5vw, 52px);
        line-height: 1;
      }
      p {
        margin: 8px 0 0;
        color: #a8b2c2;
        line-height: 1.65;
      }
      section {
        margin-top: 18px;
        padding: 20px;
        border: 1px solid rgba(166, 181, 204, .18);
        border-radius: 10px;
        background: rgba(15, 19, 29, .86);
      }
      h2 {
        margin: 0 0 16px;
        font-size: 19px;
      }
      form {
        display: grid;
        gap: 14px;
      }
      label {
        display: grid;
        gap: 7px;
        color: #dce5f2;
        font-size: 13px;
        font-weight: 700;
      }
      input,
      textarea,
      select {
        width: 100%;
        border: 1px solid rgba(166, 181, 204, .2);
        border-radius: 8px;
        background: #0b1019;
        color: #f5f7fb;
        font: inherit;
        padding: 10px 11px;
      }
      textarea {
        min-height: 120px;
        resize: vertical;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }
      .actions,
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }
      button {
        min-height: 38px;
        border: 1px solid rgba(80, 190, 255, .5);
        border-radius: 8px;
        background: linear-gradient(180deg, #36b7ff, #1677d8);
        color: #fff;
        cursor: pointer;
        font: inherit;
        font-weight: 760;
        padding: 8px 13px;
      }
      button.secondary {
        border-color: rgba(166, 181, 204, .24);
        background: rgba(255, 255, 255, .07);
      }
      button.danger {
        border-color: rgba(239, 68, 68, .42);
        background: rgba(239, 68, 68, .18);
      }
      .status {
        min-height: 24px;
        color: #a8b2c2;
        font-size: 13px;
      }
      .announcement-list {
        display: grid;
        gap: 12px;
      }
      .announcement-item {
        display: grid;
        gap: 10px;
        padding: 14px;
        border: 1px solid rgba(166, 181, 204, .14);
        border-radius: 8px;
        background: rgba(255, 255, 255, .04);
      }
      .announcement-item strong {
        display: block;
      }
      .meta {
        color: #8792a5;
        font-size: 12px;
      }
      @media (max-width: 720px) {
        header { display: block; }
        .grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>RankPeek 公告后台</h1>
          <p>使用管理员密钥把公告发布到 Cloudflare D1。创建公告会调用 POST /admin/announcements。</p>
        </div>
        <button class="secondary" id="reloadButton" type="button">刷新列表</button>
      </header>

      <section>
        <h2>管理员密钥</h2>
        <label>
          密钥
          <input id="adminToken" type="password" autocomplete="current-password" placeholder="粘贴 Cloudflare ADMIN_TOKEN" />
        </label>
        <p>请求会使用 <code>Authorization: Bearer &lt;token&gt;</code>。密钥只保存在当前浏览器里。</p>
      </section>

      <section>
        <h2>发布公告</h2>
        <form id="announcementForm">
          <input id="announcementId" type="hidden" />
          <label>
            标题
            <input name="title" required maxlength="120" placeholder="例如：RankPeek 下载源迁移通知" />
          </label>
          <label>
            正文
            <textarea name="body" required maxlength="2000" placeholder="这里填写会展示在桌面客户端里的公告正文。"></textarea>
          </label>
          <div class="grid">
            <label>
              级别
              <select name="level">
                <option value="info">普通</option>
                <option value="warning">警告</option>
                <option value="critical">重要</option>
              </select>
            </label>
            <label>
              状态
              <select name="enabled">
                <option value="true">启用</option>
                <option value="false">停用</option>
              </select>
            </label>
            <label>
              跳转链接
              <input name="linkUrl" placeholder="https://rankpeek.cn" />
            </label>
            <label>
              发布渠道
              <input name="channels" value="stable" placeholder="stable" />
            </label>
            <label>
              目标平台
              <input name="platforms" value="all" placeholder="all, win32, windows" />
            </label>
            <label>
              目标语言
              <input name="locales" value="all" placeholder="all, zh-CN, en-US" />
            </label>
            <label>
              最低版本
              <input name="minVersion" placeholder="1.0.0" />
            </label>
            <label>
              最高版本
              <input name="maxVersion" placeholder="1.2.0" />
            </label>
            <label>
              开始时间
              <input name="startsAt" type="datetime-local" />
            </label>
            <label>
              结束时间
              <input name="endsAt" type="datetime-local" />
            </label>
          </div>
          <div class="actions">
            <button type="submit">保存公告</button>
            <button class="secondary" id="resetButton" type="button">新建公告</button>
          </div>
          <div class="status" id="status" role="status"></div>
        </form>
      </section>

      <section>
        <div class="toolbar">
          <h2 style="margin-right: auto">已有公告</h2>
        </div>
        <div class="announcement-list" id="announcementList"></div>
      </section>
    </main>

    <script>
      const tokenInput = document.querySelector('#adminToken')
      const form = document.querySelector('#announcementForm')
      const statusNode = document.querySelector('#status')
      const listNode = document.querySelector('#announcementList')
      const idInput = document.querySelector('#announcementId')
      const tokenStorageKey = 'rankpeek.admin.token'

      tokenInput.value = localStorage.getItem(tokenStorageKey) || ''
      tokenInput.addEventListener('change', () => {
        localStorage.setItem(tokenStorageKey, tokenInput.value.trim())
      })

      document.querySelector('#reloadButton').addEventListener('click', () => loadAnnouncements())
      document.querySelector('#resetButton').addEventListener('click', () => resetForm())
      form.addEventListener('submit', (event) => {
        event.preventDefault()
        void saveAnnouncement()
      })

      function token() {
        const value = tokenInput.value.trim()
        localStorage.setItem(tokenStorageKey, value)
        return value
      }

      function localDateToIso(value) {
        return value ? new Date(value).toISOString() : ''
      }

      function isoToLocalDate(value) {
        if (!value) return ''
        const date = new Date(value)
        const offsetMs = date.getTimezoneOffset() * 60 * 1000
        return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
      }

      function formPayload() {
        const data = new FormData(form)
        return {
          title: String(data.get('title') || ''),
          body: String(data.get('body') || ''),
          level: String(data.get('level') || 'info'),
          linkUrl: String(data.get('linkUrl') || ''),
          minVersion: String(data.get('minVersion') || ''),
          maxVersion: String(data.get('maxVersion') || ''),
          platforms: String(data.get('platforms') || 'all'),
          locales: String(data.get('locales') || 'all'),
          channels: String(data.get('channels') || 'stable'),
          startsAt: localDateToIso(String(data.get('startsAt') || '')),
          endsAt: localDateToIso(String(data.get('endsAt') || '')),
          enabled: String(data.get('enabled')) !== 'false'
        }
      }

      async function api(path, options = {}) {
        const response = await fetch(path, {
          ...options,
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer ' + token(),
            ...(options.headers || {})
          }
        })
        const payload = await response.json()
        if (!response.ok || !payload.success) {
          throw new Error(payload.error?.message || '请求失败')
        }
        return payload.data
      }

      async function saveAnnouncement() {
        try {
          const id = idInput.value
          const path = id ? '/admin/announcements/' + encodeURIComponent(id) : '/admin/announcements'
          const method = id ? 'PATCH' : 'POST'
          await api(path, {
            method,
            body: JSON.stringify(formPayload())
          })
          statusNode.textContent = '已保存。'
          resetForm()
          await loadAnnouncements()
        } catch (error) {
          statusNode.textContent = error.message
        }
      }

      async function deleteAnnouncement(id) {
        if (!confirm('确定删除该公告？')) return
        try {
          await api('/admin/announcements/' + encodeURIComponent(id), { method: 'DELETE' })
          statusNode.textContent = '已删除。'
          await loadAnnouncements()
        } catch (error) {
          statusNode.textContent = error.message
        }
      }

      async function loadAnnouncements() {
        try {
          const announcements = await api('/admin/announcements')
          renderList(announcements)
          statusNode.textContent = '已加载 ' + announcements.length + ' 条公告。'
        } catch (error) {
          listNode.innerHTML = ''
          statusNode.textContent = error.message
        }
      }

      function renderList(announcements) {
        listNode.innerHTML = ''
        for (const announcement of announcements) {
          const item = document.createElement('article')
          item.className = 'announcement-item'
          item.innerHTML = '<div><strong></strong><p></p><div class="meta"></div></div><div class="actions"></div>'
          item.querySelector('strong').textContent = announcement.title
          item.querySelector('p').textContent = announcement.body
          item.querySelector('.meta').textContent = [
            levelLabel(announcement.level),
            announcement.enabled ? '已启用' : '已停用',
            announcement.platforms,
            announcement.locales,
            announcement.channels
          ].filter(Boolean).join('，')

          const editButton = document.createElement('button')
          editButton.className = 'secondary'
          editButton.type = 'button'
          editButton.textContent = '编辑'
          editButton.addEventListener('click', () => fillForm(announcement))

          const toggleButton = document.createElement('button')
          toggleButton.className = announcement.enabled ? 'danger' : 'secondary'
          toggleButton.type = 'button'
          toggleButton.textContent = announcement.enabled ? '停用' : '启用'
          toggleButton.addEventListener('click', async () => {
            fillForm({ ...announcement, enabled: !announcement.enabled })
            await saveAnnouncement()
          })

          item.querySelector('.actions').append(editButton, toggleButton)

          const delButton = document.createElement('button')
          delButton.className = 'danger'
          delButton.type = 'button'
          delButton.textContent = '删除'
          delButton.addEventListener('click', () => deleteAnnouncement(announcement.id))
          item.querySelector('.actions').append(delButton)
          listNode.append(item)
        }
      }

      function fillForm(announcement) {
        idInput.value = announcement.id
        form.elements.title.value = announcement.title || ''
        form.elements.body.value = announcement.body || ''
        form.elements.level.value = announcement.level || 'info'
        form.elements.linkUrl.value = announcement.linkUrl || ''
        form.elements.minVersion.value = announcement.minVersion || ''
        form.elements.maxVersion.value = announcement.maxVersion || ''
        form.elements.platforms.value = announcement.platforms || 'all'
        form.elements.locales.value = announcement.locales || 'all'
        form.elements.channels.value = announcement.channels || 'stable'
        form.elements.startsAt.value = isoToLocalDate(announcement.startsAt)
        form.elements.endsAt.value = isoToLocalDate(announcement.endsAt)
        form.elements.enabled.value = announcement.enabled ? 'true' : 'false'
        statusNode.textContent = '正在编辑 ' + announcement.id
      }

      function levelLabel(level) {
        if (level === 'critical') return '重要'
        if (level === 'warning') return '警告'
        return '普通'
      }

      function resetForm() {
        idInput.value = ''
        form.reset()
        form.elements.level.value = 'info'
        form.elements.enabled.value = 'true'
        form.elements.platforms.value = 'all'
        form.elements.locales.value = 'all'
        form.elements.channels.value = 'stable'
      }

      if (tokenInput.value) {
        void loadAnnouncements()
      }
    </script>
  </body>
</html>`
}
