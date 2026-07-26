// @vitest-environment node

import { createServer } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createImportApp } from './app.js'
import { createMemoryStore } from './store/memoryStore.js'

let servers = []
let tempDirs = []

beforeEach(() => {
  process.env.MINE_SKIP_YTDLP = '1'
  process.env.MINE_ALLOW_PRIVATE_IMPORTS = '1'
})

afterEach(async () => {
  delete process.env.MINE_SKIP_YTDLP
  delete process.env.MINE_ALLOW_PRIVATE_IMPORTS
  delete process.env.AI_EMBEDDING_ENABLED
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
    expect(session.cookie).toContain('HttpOnly')
    expect(session.cookie).toContain('SameSite=Lax')

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

  it('rate limits repeated authentication attempts', async () => {
    const apiUrl = await serveApp()
    const email = `rate-${Date.now()}@example.com`

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'wrong-password' }),
      })
    }

    const limited = await fetch(`${apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'wrong-password' }),
    })
    expect(limited.status).toBe(429)
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

  it('rejects cross-site mutations', async () => {
    const apiUrl = await serveApp()
    const session = await registerSession(apiUrl, 'csrf@example.com')
    const response = await fetch(`${apiUrl}/api/notes`, {
      method: 'POST',
      headers: authHeaders(session.cookie, {
        'Content-Type': 'application/json',
        Origin: 'https://attacker.example',
      }),
      body: JSON.stringify({ title: '不应创建', content: '' }),
    })
    expect(response.status).toBe(403)
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

describe('AI citations', () => {
  it('returns verified fallback citations only from the current user sources', async () => {
    const apiUrl = await serveApp()
    const owner = await registerSession(apiUrl, 'citation-owner@example.com')
    const other = await registerSession(apiUrl, 'citation-other@example.com')
    const createdResponse = await fetch(`${apiUrl}/api/notes`, {
      method: 'POST',
      headers: authHeaders(owner.cookie, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        title: '素材复用方法',
        content: '素材复用需要保留来源证据，并把观点连接到原始内容。',
        summary: '素材复用需要来源证据。',
        tags: ['素材复用', '来源'],
      }),
    })
    const created = await createdResponse.json()

    const ownerResponse = await fetch(`${apiUrl}/api/ai/ask`, {
      method: 'POST',
      headers: authHeaders(owner.cookie, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ question: '素材复用为什么需要来源证据？', noteIds: [created.note.id] }),
    })
    const ownerResult = (await ownerResponse.json()).result
    expect(ownerResult.mode).toBe('fallback')
    expect(ownerResult.citations[0].noteId).toBe(created.note.id)
    expect(created.note.content).toContain(ownerResult.citations[0].quote)

    const otherResponse = await fetch(`${apiUrl}/api/ai/ask`, {
      method: 'POST',
      headers: authHeaders(other.cookie, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ question: '素材复用为什么需要来源证据？', noteIds: [created.note.id] }),
    })
    const otherResult = (await otherResponse.json()).result
    expect(otherResult.citations).toEqual([])
    expect(otherResult.sourceIds).toEqual([])
  })
})

describe('RAG question and index APIs', () => {
  it('validates history and scope before invoking the question service', async () => {
    const questionService = { ask: vi.fn() }
    const apiUrl = await serveApp({ questionService })
    const session = await registerSession(apiUrl, 'rag-validation@example.com')
    const invalidBodies = [
      { question: 'Valid question?', history: 'not-an-array' },
      { question: 'Valid question?', history: Array.from({ length: 7 }, () => ({ role: 'user', content: 'x' })) },
      { question: 'Valid question?', history: [{ role: 'system', content: 'x' }] },
      { question: 'Valid question?', history: [{ role: 'user', content: 'x'.repeat(2001) }] },
      { question: 'Valid question?', scope: [] },
      { question: 'Valid question?', scope: { topics: 'not-an-array' } },
      { question: 'Valid question?', scope: { tags: ['same', 'same'] } },
      { question: 'Valid question?', scope: { noteIds: Array.from({ length: 21 }, (_, index) => `note-${index}`) } },
      { question: 'Valid question?', scope: { topics: ['x'.repeat(101)] } },
      { question: 'Valid question?', noteIds: [42] },
      { question: 'Valid question?', noteIds: ['same', 'same'] },
    ]

    for (const body of invalidBodies) {
      const response = await fetch(`${apiUrl}/api/ai/ask`, {
        method: 'POST',
        headers: authHeaders(session.cookie, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      })
      expect(response.status, JSON.stringify(body)).toBe(400)
    }
    expect(questionService.ask).not.toHaveBeenCalled()
  })

  it('uses scoped note ids ahead of legacy note ids and returns the effective scope', async () => {
    const questionService = {
      ask: vi.fn(async (input) => ({
        knowledgeAnswer: input.question,
        generalSupplement: '',
        answer: input.question,
        sourceIds: [],
        citations: [],
        insufficient: true,
        mode: 'fallback',
        retrievalMode: 'basic',
        scope: input.scope,
      })),
    }
    const apiUrl = await serveApp({ questionService })
    const session = await registerSession(apiUrl, 'rag-scope@example.com')

    const scopedResponse = await fetch(`${apiUrl}/api/ai/ask`, {
      method: 'POST',
      headers: authHeaders(session.cookie, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        question: 'Which notes apply?',
        noteIds: ['legacy-note'],
        history: [{ role: 'user', content: 'Earlier question' }],
        scope: { noteIds: ['scoped-note'], topics: ['Research'], tags: ['rag'] },
      }),
    })
    const scopedResult = (await scopedResponse.json()).result
    expect(scopedResponse.ok).toBe(true)
    expect(scopedResult.scope).toEqual({
      noteIds: ['scoped-note'],
      topics: ['Research'],
      tags: ['rag'],
    })

    const legacyResponse = await fetch(`${apiUrl}/api/ai/ask`, {
      method: 'POST',
      headers: authHeaders(session.cookie, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ question: 'Legacy selection?', noteIds: ['legacy-note'] }),
    })
    const legacyResult = (await legacyResponse.json()).result
    expect(legacyResult.scope).toEqual({ noteIds: ['legacy-note'], topics: [], tags: [] })
    expect(questionService.ask).toHaveBeenCalledWith(expect.objectContaining({
      userId: session.user.id,
      history: [{ role: 'user', content: 'Earlier question' }],
    }))
  })

  it('exposes authenticated ensure, status, and retry operations with user-isolated status', async () => {
    const store = createMemoryStore()
    const apiUrl = await serveApp({ store })
    const owner = await registerSession(apiUrl, 'index-owner@example.com')
    const other = await registerSession(apiUrl, 'index-other@example.com')
    await fetch(`${apiUrl}/api/notes`, {
      method: 'POST',
      headers: authHeaders(owner.cookie, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ title: 'Owner note', content: 'Owner-only content' }),
    })

    const ensure = await fetch(`${apiUrl}/api/ai/index/ensure`, {
      method: 'POST',
      headers: authHeaders(owner.cookie),
    }).then((response) => response.json())
    const ownerStatus = await fetch(`${apiUrl}/api/ai/index/status`, {
      headers: authHeaders(owner.cookie),
    }).then((response) => response.json())
    const otherStatus = await fetch(`${apiUrl}/api/ai/index/status`, {
      headers: authHeaders(other.cookie),
    }).then((response) => response.json())
    const retry = await fetch(`${apiUrl}/api/ai/index/retry`, {
      method: 'POST',
      headers: authHeaders(owner.cookie),
    }).then((response) => response.json())

    expect(ensure).toEqual({
      queued: 0,
      status: expect.objectContaining({ mode: 'basic', total: 1, missing: 0 }),
    })
    expect(ownerStatus.status.total).toBe(1)
    expect(otherStatus.status.total).toBe(0)
    expect(retry).toEqual({
      retried: 0,
      status: expect.objectContaining({ mode: 'basic', total: 1 }),
    })
  })

  it('allows ten minutes of normal index polling without spending the expensive AI quota', async () => {
    const questionService = {
      ask: vi.fn(async () => ({
        answer: 'answer',
        knowledgeAnswer: 'answer',
        generalSupplement: '',
        sourceIds: [],
        citations: [],
        insufficient: true,
        mode: 'fallback',
        retrievalMode: 'basic',
        scope: {},
      })),
    }
    const apiUrl = await serveApp({ questionService })
    const session = await registerSession(apiUrl, `index-poll-${Date.now()}@example.com`)

    for (let attempt = 0; attempt < 121; attempt += 1) {
      const response = await fetch(`${apiUrl}/api/ai/index/status`, {
        headers: authHeaders(session.cookie),
      })
      expect(response.status).toBe(200)
    }

    const ask = await fetch(`${apiUrl}/api/ai/ask`, {
      method: 'POST',
      headers: authHeaders(session.cookie, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ question: 'Still available?' }),
    })
    expect(ask.status).toBe(200)
    expect(questionService.ask).toHaveBeenCalledOnce()
  })

  it('eventually rate limits the index control plane without blocking ask', async () => {
    const questionService = {
      ask: vi.fn(async () => ({
        answer: 'answer',
        knowledgeAnswer: 'answer',
        generalSupplement: '',
        sourceIds: [],
        citations: [],
        insufficient: true,
        mode: 'fallback',
        retrievalMode: 'basic',
        scope: {},
      })),
    }
    const apiUrl = await serveApp({ questionService })
    const session = await registerSession(apiUrl, `index-control-${Date.now()}@example.com`)
    let successfulPolls = 0
    let limitedResponse

    for (let attempt = 0; attempt < 300; attempt += 1) {
      const response = await fetch(`${apiUrl}/api/ai/index/status`, {
        headers: authHeaders(session.cookie),
      })
      if (response.status === 429) {
        limitedResponse = response
        break
      }
      expect(response.status).toBe(200)
      successfulPolls += 1
    }

    expect(successfulPolls).toBeGreaterThanOrEqual(121)
    expect(limitedResponse?.status).toBe(429)
    for (const [path, method] of [
      ['/api/ai/index/ensure', 'POST'],
      ['/api/ai/index/retry', 'POST'],
    ]) {
      const response = await fetch(`${apiUrl}${path}`, {
        method,
        headers: authHeaders(session.cookie),
      })
      expect(response.status).toBe(429)
    }

    const ask = await fetch(`${apiUrl}/api/ai/ask`, {
      method: 'POST',
      headers: authHeaders(session.cookie, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ question: 'Still available?' }),
    })
    expect(ask.status).toBe(200)
    expect(questionService.ask).toHaveBeenCalledOnce()
  })

  it('reports keyword index status when embeddings are explicitly disabled', async () => {
    process.env.AI_EMBEDDING_ENABLED = 'false'
    const store = createMemoryStore()
    store.storageMode = 'postgres'
    const apiUrl = await serveApp({ store })
    const session = await registerSession(apiUrl, 'keyword-status@example.com')

    const response = await fetch(`${apiUrl}/api/ai/index/status`, {
      headers: authHeaders(session.cookie),
    })
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result.status.mode).toBe('keyword')
  })

  it('does not delay successful register or login while ensuring index jobs', async () => {
    const store = createMemoryStore()
    store.ensureIndexJobs = vi.fn(() => new Promise(() => {}))
    const apiUrl = await serveApp({ store })

    const registered = await registerSession(apiUrl, 'index-auth@example.com')
    expect(registered.user.email).toBe('index-auth@example.com')

    const loginResponse = await fetch(`${apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'index-auth@example.com', password: 'secret123' }),
    })
    expect(loginResponse.ok).toBe(true)
    expect(store.ensureIndexJobs).toHaveBeenCalledTimes(2)
    expect(store.ensureIndexJobs).toHaveBeenNthCalledWith(1, registered.user.id)
    expect(store.ensureIndexJobs).toHaveBeenNthCalledWith(2, registered.user.id)
  })

  it('keeps auth responses successful and logs only a fixed message when index ensuring fails', async () => {
    const store = createMemoryStore()
    store.ensureIndexJobs = vi.fn()
      .mockRejectedValueOnce(new Error('async raw secret'))
      .mockImplementationOnce(() => {
        throw new Error('sync raw secret')
      })
    const logger = { error: vi.fn() }
    const apiUrl = await serveApp({ store, logger })

    const registered = await registerSession(apiUrl, 'index-failure@example.com')
    await new Promise(setImmediate)
    expect(registered.user.email).toBe('index-failure@example.com')

    const loginResponse = await fetch(`${apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'index-failure@example.com', password: 'secret123' }),
    })
    await new Promise(setImmediate)

    expect(loginResponse.ok).toBe(true)
    expect(logger.error.mock.calls).toEqual([
      ['Knowledge indexing ensure failed.'],
      ['Knowledge indexing ensure failed.'],
    ])
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('raw secret')
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
