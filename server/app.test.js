// @vitest-environment node

import { createServer } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createImportApp } from './app.js'

let servers = []
let tempDirs = []

beforeEach(() => {
  process.env.MINE_SKIP_YTDLP = '1'
  process.env.MINE_ALLOW_PRIVATE_IMPORTS = '1'
})

afterEach(async () => {
  delete process.env.MINE_SKIP_YTDLP
  delete process.env.MINE_ALLOW_PRIVATE_IMPORTS
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))))
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  servers = []
  tempDirs = []
})

describe('auth api', () => {
  it('registers, reads the current user, and rejects duplicate emails', async () => {
    const apiUrl = await serveApp()
    const session = await registerSession(apiUrl, 'owner@example.com')

    expect(session.user.email).toBe('owner@example.com')
    expect(session.cookie).toContain('mine_session=')

    const meResponse = await fetch(`${apiUrl}/api/auth/me`, { headers: authHeaders(session.cookie) })
    const me = await meResponse.json()
    expect(meResponse.ok).toBe(true)
    expect(me.user.email).toBe('owner@example.com')

    const duplicate = await fetch(`${apiUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@example.com', password: 'secret123' }),
    })
    expect(duplicate.status).toBe(409)
  })

  it('rejects wrong passwords and clears the session on logout', async () => {
    const apiUrl = await serveApp()
    await registerSession(apiUrl, 'login@example.com')

    const badLogin = await fetch(`${apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'login@example.com', password: 'wrong123' }),
    })
    expect(badLogin.status).toBe(401)

    const logout = await fetch(`${apiUrl}/api/auth/logout`, { method: 'POST' })
    expect(logout.ok).toBe(true)
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0')
  })
})

describe('notes api', () => {
  it('keeps each user note library isolated', async () => {
    const apiUrl = await serveApp()
    const owner = await registerSession(apiUrl, 'owner-notes@example.com')
    const other = await registerSession(apiUrl, 'other-notes@example.com')

    const createdResponse = await fetch(`${apiUrl}/api/notes`, {
      method: 'POST',
      headers: authHeaders(owner.cookie, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        title: '私有素材',
        content: '# 私有素材\n\n只属于用户 A。',
        tags: ['私有'],
      }),
    })
    const created = await createdResponse.json()
    expect(createdResponse.status).toBe(201)
    expect(created.note.title).toBe('私有素材')

    const ownerList = await fetch(`${apiUrl}/api/notes`, { headers: authHeaders(owner.cookie) }).then((response) => response.json())
    const otherList = await fetch(`${apiUrl}/api/notes`, { headers: authHeaders(other.cookie) }).then((response) => response.json())
    expect(ownerList.notes).toHaveLength(1)
    expect(otherList.notes).toHaveLength(0)

    const crossPatch = await fetch(`${apiUrl}/api/notes/${created.note.id}`, {
      method: 'PATCH',
      headers: authHeaders(other.cookie, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ title: '越权修改' }),
    })
    expect(crossPatch.status).toBe(404)

    const crossDelete = await fetch(`${apiUrl}/api/notes/${created.note.id}`, {
      method: 'DELETE',
      headers: authHeaders(other.cookie),
    })
    expect(crossDelete.status).toBe(404)
  })

  it('bulk imports local notes into the current user library', async () => {
    const apiUrl = await serveApp()
    const session = await registerSession(apiUrl, 'bulk@example.com')

    const response = await fetch(`${apiUrl}/api/notes/bulk`, {
      method: 'POST',
      headers: authHeaders(session.cookie, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        notes: [
          { title: '迁移素材一', content: '旧本地素材', tags: ['迁移'] },
          { title: '迁移素材二', content: '旧本地素材', tags: ['迁移'] },
        ],
      }),
    })
    const result = await response.json()

    expect(response.status).toBe(201)
    expect(result.notes).toHaveLength(2)
    expect(result.notes[0].id).toBeTruthy()
  })

  it('rejects oversized note fields and excessive bulk imports', async () => {
    const apiUrl = await serveApp()
    const session = await registerSession(apiUrl, 'limits@example.com')

    const oversized = await fetch(`${apiUrl}/api/notes`, {
      method: 'POST',
      headers: authHeaders(session.cookie, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ title: 'x'.repeat(201), content: '' }),
    })
    expect(oversized.status).toBe(400)

    const bulk = await fetch(`${apiUrl}/api/notes/bulk`, {
      method: 'POST',
      headers: authHeaders(session.cookie, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ notes: Array.from({ length: 101 }, (_, index) => ({ title: `素材 ${index}` })) }),
    })
    expect(bulk.status).toBe(400)
  })
})

describe('import api', () => {
  it('requires login for import, AI, and note endpoints', async () => {
    const apiUrl = await serveApp()

    for (const [method, endpoint] of [
      ['GET', '/api/notes'],
      ['GET', '/api/import/capabilities'],
      ['POST', '/api/import/url'],
      ['POST', '/api/ai/ask'],
    ]) {
      const response = await fetch(`${apiUrl}${endpoint}`, { method })
      expect(response.status).toBe(401)
    }
  })

  it('extracts an article url through the api for a logged-in user', async () => {
    const articleUrl = await serveHTML(`
      <!doctype html>
      <html>
        <head><title>Mine API Article</title></head>
        <body>
          <article>
            <h1>API 导入文章</h1>
            <p>这是一篇用于接口测试的文章，包含足够的自然段和信息量。</p>
            <p>导入服务应该返回 ready 状态，并生成可以保存为笔记的 Markdown。</p>
            <p>为了避免正文过短被误判为无效内容，这里补充一段更完整的描述：Mine 会将外部资料提取为 Markdown 笔记，再进入标签筛选、AI 收纳、知识库问答和内容输出流程。</p>
            <p>这条测试验证接口层、文章解析层和 Markdown 生成层能一起工作。</p>
          </article>
        </body>
      </html>
    `)
    const apiUrl = await serveApp()
    const session = await registerSession(apiUrl, 'importer@example.com')

    const response = await fetch(`${apiUrl}/api/import/url`, {
      method: 'POST',
      headers: authHeaders(session.cookie, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ url: articleUrl }),
    })
    const result = await response.json()

    expect(response.ok).toBe(true)
    expect(result.status).toBe('ready')
    expect(result.markdown).toContain('Mine 会将外部资料提取为 Markdown 笔记')
    expect(result.markdown).toContain('来源：')
  })

  it('returns a clear fallback state for a video url that cannot be parsed', async () => {
    const apiUrl = await serveApp()
    const session = await registerSession(apiUrl, 'video@example.com')
    const response = await fetch(`${apiUrl}/api/import/url`, {
      method: 'POST',
      headers: authHeaders(session.cookie, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ url: 'https://www.bilibili.com/video/BV-not-real' }),
    })
    const result = await response.json()

    expect(response.ok).toBe(true)
    expect(['needs-action', 'failed']).toContain(result.status)
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('returns import capabilities through the api', async () => {
    const apiUrl = await serveApp()
    const session = await registerSession(apiUrl, 'capabilities@example.com')
    const response = await fetch(`${apiUrl}/api/import/capabilities`, { headers: authHeaders(session.cookie) })
    const result = await response.json()

    expect(response.ok).toBe(true)
    expect(result.ytDlpAvailable).toBe(false)
    expect(result.authConfigured).toBe(false)
    expect(result.chatConfigured).toBe(false)
  })

  it('returns json for malformed import requests after auth succeeds', async () => {
    const apiUrl = await serveApp()
    const session = await registerSession(apiUrl, 'malformed@example.com')
    const response = await fetch(`${apiUrl}/api/import/url`, {
      method: 'POST',
      headers: authHeaders(session.cookie, { 'Content-Type': 'application/json' }),
      body: '{',
    })
    const result = await response.json()

    expect(response.ok).toBe(false)
    expect(result.status).toBe('failed')
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('returns a needs-action image response without a platform vision api key', async () => {
    const apiUrl = await serveApp()
    const session = await registerSession(apiUrl, 'image@example.com')
    const response = await fetch(`${apiUrl}/api/import/image`, {
      method: 'POST',
      headers: authHeaders(session.cookie, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ imageUrl: 'https://example.com/image.png' }),
    })
    const result = await response.json()

    expect(response.ok).toBe(true)
    expect(result.status).toBe('needs-action')
    expect(result.warnings[0]).toContain('未配置')
  })

  it('rejects an uploaded file whose content does not match an image', async () => {
    const apiUrl = await serveApp()
    const session = await registerSession(apiUrl, 'upload@example.com')
    const body = new FormData()
    body.append('file', new Blob(['this is not an image'], { type: 'image/png' }), 'fake.png')

    const response = await fetch(`${apiUrl}/api/import/image`, {
      method: 'POST',
      headers: authHeaders(session.cookie),
      body,
    })
    const result = await response.json()

    expect(response.status).toBe(415)
    expect(result.status).toBe('failed')
    expect(result.requestId).toBeTruthy()
  })
})

describe('health api', () => {
  it('returns 503 when the database health check fails', async () => {
    const failingStore = {
      healthCheck: async () => {
        throw new Error('postgresql://user:secret@example.invalid/database')
      },
    }
    const apiUrl = await serveApp({ store: failingStore })
    const response = await fetch(`${apiUrl}/api/health`)
    const result = await response.json()

    expect(response.status).toBe(503)
    expect(result.ok).toBe(false)
    expect(result.requestId).toBeTruthy()
  })
})

describe('production client hosting', () => {
  it('serves the built client without swallowing api 404 responses', async () => {
    const staticDir = await mkdtemp(join(tmpdir(), 'mine-client-'))
    tempDirs.push(staticDir)
    await writeFile(join(staticDir, 'index.html'), '<!doctype html><div id="root">Mine Client</div>', 'utf8')
    await writeFile(join(staticDir, 'asset.txt'), 'static asset', 'utf8')
    const apiUrl = await serveApp({ staticDir })

    const root = await fetch(`${apiUrl}/`)
    const nested = await fetch(`${apiUrl}/workspace/today`)
    const asset = await fetch(`${apiUrl}/asset.txt`)
    const missingApi = await fetch(`${apiUrl}/api/not-found`)
    const missingApiBody = await missingApi.json()

    expect(root.ok).toBe(true)
    expect(await root.text()).toContain('Mine Client')
    expect(nested.ok).toBe(true)
    expect(await nested.text()).toContain('Mine Client')
    expect(asset.ok).toBe(true)
    expect(await asset.text()).toBe('static asset')
    expect(missingApi.status).toBe(404)
    expect(missingApiBody.error).toBe('接口不存在。')
  })
})

async function registerSession(apiUrl, email) {
  const response = await fetch(`${apiUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'secret123' }),
  })
  const body = await response.json()
  return { user: body.user, cookie: response.headers.get('set-cookie') }
}

function authHeaders(cookie, headers = {}) {
  return { ...headers, cookie }
}

async function serveApp(options = {}) {
  const server = createImportApp(options).listen(0, '127.0.0.1')
  servers.push(server)
  await new Promise((resolve) => server.once('listening', resolve))
  const address = server.address()
  return `http://127.0.0.1:${address.port}`
}

async function serveHTML(html) {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' })
    response.end(html)
  }).listen(0, '127.0.0.1')
  servers.push(server)
  await new Promise((resolve) => server.once('listening', resolve))
  const address = server.address()
  return `http://127.0.0.1:${address.port}/article`
}
