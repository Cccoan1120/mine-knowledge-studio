import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import multer from 'multer'
import { clearSessionCookie, loginUser, registerUser, requireAuth, setSessionCookie } from './auth.js'
import { getAICapabilities, getPlatformAIConfig } from './ai/config.js'
import { analyzeNote, answerQuestion, generateOutput } from './ai/service.js'
import { extractFromUrl, extractImage, extractMedia, getImportCapabilities } from './import/extractors.js'
import { createDefaultStore } from './store/index.js'

const currentDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(currentDir, '..')

export function createImportApp(options = {}) {
  const app = express()
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 60 * 1024 * 1024 },
  })
  const store = options.store || createDefaultStore()

  app.use(express.json({ limit: '12mb' }))
  app.use((request, _response, next) => {
    request.store = store
    next()
  })

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true })
  })

  app.post('/api/auth/register', async (request, response) => {
    try {
      const user = await registerUser(store, request.body)
      await setSessionCookie(response, user)
      response.status(201).json({ user })
    } catch (error) {
      sendError(response, error)
    }
  })

  app.post('/api/auth/login', async (request, response) => {
    try {
      const user = await loginUser(store, request.body)
      await setSessionCookie(response, user)
      response.json({ user })
    } catch (error) {
      sendError(response, error)
    }
  })

  app.post('/api/auth/logout', (_request, response) => {
    clearSessionCookie(response)
    response.json({ ok: true })
  })

  app.get('/api/auth/me', requireAuth, (request, response) => {
    response.json({ user: request.user })
  })

  app.get('/api/notes', requireAuth, async (request, response) => {
    response.json({ notes: await store.listNotes(request.user.id) })
  })

  app.post('/api/notes', requireAuth, async (request, response) => {
    response.status(201).json({ note: await store.createNote(request.user.id, request.body) })
  })

  app.post('/api/notes/bulk', requireAuth, async (request, response) => {
    const notes = Array.isArray(request.body?.notes) ? request.body.notes : []
    response.status(201).json({ notes: await store.bulkCreateNotes(request.user.id, notes) })
  })

  app.patch('/api/notes/:id', requireAuth, async (request, response) => {
    const note = await store.updateNote(request.user.id, request.params.id, request.body)
    if (!note) return response.status(404).json({ error: '素材不存在。' })
    return response.json({ note })
  })

  app.delete('/api/notes/:id', requireAuth, async (request, response) => {
    const deleted = await store.deleteNote(request.user.id, request.params.id)
    if (!deleted) return response.status(404).json({ error: '素材不存在。' })
    return response.json({ ok: true })
  })

  app.get('/api/ai/capabilities', requireAuth, (_request, response) => {
    response.json(getAICapabilities())
  })

  app.post('/api/ai/analyze', requireAuth, async (request, response) => {
    const notes = await store.listNotes(request.user.id)
    const note = notes.find((item) => item.id === request.body?.noteId) || request.body?.note
    if (!note) return response.status(404).json({ error: '素材不存在。' })
    response.json({ analysis: await analyzeNote(note, notes) })
  })

  app.post('/api/ai/ask', requireAuth, async (request, response) => {
    const notes = await store.listNotes(request.user.id)
    response.json({ result: await answerQuestion(String(request.body?.question || ''), notes) })
  })

  app.post('/api/ai/generate', requireAuth, async (request, response) => {
    const notes = await store.listNotes(request.user.id)
    const requestedIds = Array.isArray(request.body?.noteIds) ? new Set(request.body.noteIds) : null
    const sourceNotes = requestedIds ? notes.filter((note) => requestedIds.has(note.id)) : notes
    response.json({ markdown: await generateOutput(request.body?.type || 'outline', sourceNotes.slice(0, 8)) })
  })

  app.get('/api/import/capabilities', requireAuth, async (_request, response) => {
    response.json({ ...(await getImportCapabilities()), ...getAICapabilities() })
  })

  app.post('/api/import/url', requireAuth, async (request, response) => {
    try {
      response.json(await extractFromUrl({ url: request.body?.url, aiConfig: getPlatformAIConfig() }))
    } catch (error) {
      response.status(500).json(errorResult(error))
    }
  })

  app.post('/api/import/image', requireAuth, upload.single('file'), async (request, response) => {
    try {
      response.json(
        await extractImage({
          imageUrl: request.body.imageUrl,
          file: request.file,
          aiConfig: getPlatformAIConfig(),
        }),
      )
    } catch (error) {
      response.status(500).json(errorResult(error, 'image'))
    }
  })

  app.post('/api/import/media', requireAuth, upload.single('file'), async (request, response) => {
    try {
      response.json(
        await extractMedia({
          file: request.file,
          aiConfig: getPlatformAIConfig(),
        }),
      )
    } catch (error) {
      response.status(500).json(errorResult(error, 'video'))
    }
  })

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: '接口不存在。' })
  })

  mountProductionClient(app, options.staticDir)

  app.use((error, _request, response, _next) => {
    const status = Number(error?.status || error?.statusCode) || 500
    response.status(status).json(errorResult(error))
  })

  return app
}

function mountProductionClient(app, staticDir) {
  const clientDir = staticDir ?? (process.env.NODE_ENV === 'production' ? resolve(projectRoot, 'dist') : '')
  if (!clientDir) return

  const indexFile = resolve(clientDir, 'index.html')
  if (!existsSync(indexFile)) return

  app.use(express.static(clientDir))
  app.get(/^(?!\/api(?:\/|$)).*/, (_request, response) => {
    response.sendFile(indexFile)
  })
}

function sendError(response, error) {
  response.status(Number(error?.status) || (error?.code === 'USER_EXISTS' ? 409 : 500)).json({
    error: error?.message || '请求失败。',
  })
}

function errorResult(error, sourceType = 'article') {
  return {
    status: 'failed',
    sourceType,
    platform: '外部来源',
    title: '导入失败',
    sourceUrl: '',
    markdown: '',
    extractedText: '',
    warnings: [error?.message || '导入服务遇到未知错误。'],
  }
}
