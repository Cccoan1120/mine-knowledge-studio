import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import helmet from 'helmet'
import multer from 'multer'
import { clearSessionCookie, loginUser, registerUser, requireAuth, setSessionCookie } from './auth.js'
import { getAICapabilities, getEmbeddingConfig, getPlatformAIConfig } from './ai/config.js'
import { createEmbeddingClient } from './ai/embeddingClient.js'
import { analyzeNote, generateOutput } from './ai/service.js'
import { extractFromUrl, extractImage, extractMedia, getImportCapabilities } from './import/extractors.js'
import { createGovernanceService } from './governance/service.js'
import { aiRateLimit, authRateLimit, importRateLimit, indexControlRateLimit, logServerError, publicError, requestContext, requireSameOrigin } from './security.js'
import { createPlatformChatClient, createRagQuestionService } from './rag/questionService.js'
import { createDefaultStore } from './store/index.js'
import { assertUpload, validateAskRequest, validateBulkNotes, validateGovernanceAction, validateGovernanceDismissal, validateImportUrl, validateNoteIds, validateNoteInput, validateOutputType, validateWikiPageIds, validateWikiPageInput, validateWikiProjectInput } from './validation.js'
import { createWikiService } from './wiki/service.js'

const currentDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(currentDir, '..')

export function createImportApp(options = {}) {
  const app = express()
  const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  })
  const mediaUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  })
  const store = options.store || createDefaultStore()
  const logger = options.logger || console
  const questionService = options.questionService || createDefaultQuestionService(store, logger)
  const governanceService = options.governanceService || createGovernanceService({ store })
  const wikiService = options.wikiService || createWikiService({
    store,
    chatConfigured: Boolean(getPlatformAIConfig().apiKey),
  })

  app.set('trust proxy', 1)
  app.disable('x-powered-by')
  app.use(helmet())
  app.use(requestContext)
  app.use(express.json({ limit: '2mb', type: 'application/json' }))
  app.use('/api', requireSameOrigin)
  app.use((request, _response, next) => {
    request.store = store
    next()
  })

  app.get('/api/health', async (request, response) => {
    try {
      await store.healthCheck()
      response.json({ ok: true })
    } catch (error) {
      logServerError(error, request.requestId)
      response.status(503).json({ ok: false, requestId: request.requestId })
    }
  })

  app.post('/api/auth/register', authRateLimit, async (request, response) => {
    try {
      const user = await registerUser(store, request.body)
      await setSessionCookie(response, user)
      ensureIndexJobs(store, user.id, logger)
      response.status(201).json({ user })
    } catch (error) {
      sendError(request, response, error)
    }
  })

  app.post('/api/auth/login', authRateLimit, async (request, response) => {
    try {
      const user = await loginUser(store, request.body)
      await setSessionCookie(response, user)
      ensureIndexJobs(store, user.id, logger)
      response.json({ user })
    } catch (error) {
      sendError(request, response, error)
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
    response.status(201).json({ note: await store.createNote(request.user.id, validateNoteInput(request.body)) })
  })

  app.post('/api/notes/bulk', requireAuth, async (request, response) => {
    const notes = validateBulkNotes(request.body)
    response.status(201).json({ notes: await store.bulkCreateNotes(request.user.id, notes) })
  })

  app.patch('/api/notes/:id', requireAuth, async (request, response) => {
    const note = await store.updateNote(request.user.id, request.params.id, validateNoteInput(request.body, { partial: true }))
    if (!note) return response.status(404).json({ error: '素材不存在。' })
    return response.json({ note })
  })

  app.delete('/api/notes/:id', requireAuth, async (request, response) => {
    const deleted = await store.deleteNote(request.user.id, request.params.id)
    if (!deleted) return response.status(404).json({ error: '素材不存在。' })
    return response.json({ ok: true })
  })

  app.use('/api/governance', requireAuth)

  app.get('/api/governance/candidates', async (request, response) => {
    response.json(await governanceService.list(request.user.id))
  })

  app.post('/api/governance/dismiss', async (request, response) => {
    response.json(await governanceService.dismiss(request.user.id, validateGovernanceDismissal(request.body)))
  })

  app.post('/api/governance/duplicates/link', async (request, response) => {
    response.json(await governanceService.linkDuplicate(request.user.id, validateGovernanceAction(request.body)))
  })

  app.post('/api/governance/tags/apply', async (request, response) => {
    response.json(await governanceService.applyTagCandidate(request.user.id, validateGovernanceAction(request.body, { tag: true })))
  })

  app.use('/api/wikis', requireAuth)

  app.get('/api/wikis', async (request, response) => {
    response.json({ projects: await store.listWikiProjects(request.user.id) })
  })

  app.post('/api/wikis', async (request, response) => {
    response.status(201).json({ project: await store.createWikiProject(request.user.id, validateWikiProjectInput(request.body)) })
  })

  app.get('/api/wikis/:wikiId', async (request, response) => {
    const project = await store.getWikiProject(request.user.id, request.params.wikiId)
    if (!project) return response.status(404).json({ error: 'Wiki 不存在。' })
    return response.json({ project })
  })

  app.patch('/api/wikis/:wikiId', async (request, response) => {
    const project = await store.updateWikiProject(request.user.id, request.params.wikiId, validateWikiProjectInput(request.body, { partial: true }))
    if (!project) return response.status(404).json({ error: 'Wiki 不存在。' })
    return response.json({ project })
  })

  app.delete('/api/wikis/:wikiId', async (request, response) => {
    const deleted = await store.deleteWikiProject(request.user.id, request.params.wikiId)
    if (!deleted) return response.status(404).json({ error: 'Wiki 不存在。' })
    return response.json({ ok: true })
  })

  app.post('/api/wikis/:wikiId/outline', aiRateLimit, async (request, response) => {
    const job = await wikiService.queueOutline(request.user.id, request.params.wikiId)
    if (!job) return response.status(404).json({ error: 'Wiki 不存在。' })
    return response.status(202).json({ job })
  })

  app.post('/api/wikis/:wikiId/pages', async (request, response) => {
    const project = await store.getWikiProject(request.user.id, request.params.wikiId)
    if (!project) return response.status(404).json({ error: 'Wiki 不存在。' })
    if (project.pages.length >= 20) return response.status(409).json({ error: '一个 Wiki 最多包含 20 个页面。' })
    const page = await store.createWikiPage(request.user.id, request.params.wikiId, validateWikiPageInput(request.body))
    return response.status(201).json({ page })
  })

  app.patch('/api/wikis/:wikiId/pages/:pageId', async (request, response) => {
    const page = await store.updateWikiPage(request.user.id, request.params.wikiId, request.params.pageId, validateWikiPageInput(request.body, { partial: true }))
    if (!page) return response.status(404).json({ error: 'Wiki 页面不存在。' })
    return response.json({ page })
  })

  app.delete('/api/wikis/:wikiId/pages/:pageId', async (request, response) => {
    const deleted = await store.deleteWikiPage(request.user.id, request.params.wikiId, request.params.pageId)
    if (!deleted) return response.status(404).json({ error: 'Wiki 页面不存在。' })
    return response.json({ ok: true })
  })

  app.post('/api/wikis/:wikiId/pages/generate', aiRateLimit, async (request, response) => {
    const jobs = await wikiService.queuePages(request.user.id, request.params.wikiId, validateWikiPageIds(request.body?.pageIds))
    if (!jobs) return response.status(404).json({ error: 'Wiki 不存在。' })
    return response.status(202).json({ jobs })
  })

  app.post('/api/wikis/:wikiId/pages/:pageId/refresh', aiRateLimit, async (request, response) => {
    const job = await wikiService.queueRefresh(request.user.id, request.params.wikiId, request.params.pageId)
    if (!job) return response.status(404).json({ error: 'Wiki 页面不存在。' })
    return response.status(202).json({ job })
  })

  app.post('/api/wikis/:wikiId/pages/:pageId/candidate/accept', async (request, response) => {
    const page = await store.acceptWikiCandidate(request.user.id, request.params.wikiId, request.params.pageId)
    if (!page) return response.status(404).json({ error: '没有可接受的候选版本。' })
    return response.json({ page })
  })

  app.post('/api/wikis/:wikiId/pages/:pageId/candidate/discard', async (request, response) => {
    const page = await store.discardWikiCandidate(request.user.id, request.params.wikiId, request.params.pageId)
    if (!page) return response.status(404).json({ error: 'Wiki 页面不存在。' })
    return response.json({ page })
  })

  app.get('/api/wikis/:wikiId/export', async (request, response) => {
    const markdown = await wikiService.exportProject(request.user.id, request.params.wikiId)
    if (markdown === null) return response.status(404).json({ error: 'Wiki 不存在。' })
    response.type('text/markdown; charset=utf-8')
    return response.send(markdown)
  })

  app.get('/api/wikis/:wikiId/pages/:pageId/export', async (request, response) => {
    const markdown = await wikiService.exportPage(request.user.id, request.params.wikiId, request.params.pageId)
    if (markdown === null) return response.status(404).json({ error: 'Wiki 页面不存在。' })
    response.type('text/markdown; charset=utf-8')
    return response.send(markdown)
  })

  app.use('/api/ai', requireAuth)

  app.get('/api/ai/capabilities', (_request, response) => {
    response.json(getAICapabilities({ storageMode: store.storageMode }))
  })

  app.post('/api/ai/analyze', aiRateLimit, async (request, response) => {
    const notes = await store.listNotes(request.user.id)
    const note = notes.find((item) => item.id === request.body?.noteId) || request.body?.note
    if (!note) return response.status(404).json({ error: '素材不存在。' })
    response.json({ analysis: await analyzeNote(note, notes) })
  })

  app.post('/api/ai/ask', aiRateLimit, async (request, response) => {
    const input = validateAskRequest(request.body)
    response.json({ result: await questionService.ask({ userId: request.user.id, ...input }) })
  })

  app.use('/api/ai/index', indexControlRateLimit)

  app.post('/api/ai/index/ensure', async (request, response) => {
    const ensured = await store.ensureIndexJobs(request.user.id)
    const status = await getReportedIndexStatus(store, request.user.id)
    response.json({ queued: ensured.queued, status })
  })

  app.get('/api/ai/index/status', async (request, response) => {
    response.json({ status: await getReportedIndexStatus(store, request.user.id) })
  })

  app.post('/api/ai/index/retry', async (request, response) => {
    const retried = await store.retryFailedIndexJobs(request.user.id)
    const status = await getReportedIndexStatus(store, request.user.id)
    response.json({ retried, status })
  })

  app.post('/api/ai/generate', aiRateLimit, async (request, response) => {
    const notes = await store.listNotes(request.user.id)
    const requestedIds = new Set(validateNoteIds(request.body?.noteIds))
    const sourceNotes = requestedIds.size ? notes.filter((note) => requestedIds.has(note.id)) : notes
    response.json({ result: await generateOutput(validateOutputType(request.body?.type), sourceNotes) })
  })

  app.use('/api/import', requireAuth, importRateLimit)

  app.get('/api/import/capabilities', async (_request, response) => {
    response.json({ ...(await getImportCapabilities()), ...getAICapabilities({ storageMode: store.storageMode }) })
  })

  app.post('/api/import/url', async (request, response) => {
    try {
      response.json(await extractFromUrl({ url: validateImportUrl(request.body?.url), aiConfig: getPlatformAIConfig() }))
    } catch (error) {
      sendImportError(request, response, error)
    }
  })

  app.post('/api/import/image', imageUpload.single('file'), async (request, response) => {
    try {
      response.json(
        await extractImage({
          imageUrl: request.body.imageUrl ? validateImportUrl(request.body.imageUrl) : '',
          file: request.file ? assertUpload(request.file, 'image') : undefined,
          aiConfig: getPlatformAIConfig(),
        }),
      )
    } catch (error) {
      sendImportError(request, response, error, 'image')
    }
  })

  app.post('/api/import/media', mediaUpload.single('file'), async (request, response) => {
    try {
      response.json(
        await extractMedia({
          file: assertUpload(request.file, 'media'),
          aiConfig: getPlatformAIConfig(),
        }),
      )
    } catch (error) {
      sendImportError(request, response, error, 'video')
    }
  })

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: '接口不存在。' })
  })

  mountProductionClient(app, options.staticDir)

  app.use((error, _request, response, _next) => {
    const request = _request
    if (request.path.startsWith('/api/import/')) {
      return sendImportError(request, response, error)
    }
    sendError(request, response, error)
  })

  return app
}

function createDefaultQuestionService(store, logger) {
  const chatConfig = getPlatformAIConfig()
  const embeddingConfig = getEmbeddingConfig()
  return createRagQuestionService({
    store,
    embeddingClient: embeddingConfig.enabled && embeddingConfig.apiKey
      ? createEmbeddingClient({ config: embeddingConfig })
      : undefined,
    embeddingEnabled: embeddingConfig.enabled,
    chatClient: chatConfig.apiKey ? createPlatformChatClient({ config: chatConfig }) : undefined,
    logger,
  })
}

function ensureIndexJobs(store, userId, logger) {
  try {
    Promise.resolve(store.ensureIndexJobs(userId)).catch(() => {
      logger.error('Knowledge indexing ensure failed.')
    })
  } catch {
    logger.error('Knowledge indexing ensure failed.')
  }
}

async function getReportedIndexStatus(store, userId) {
  const status = await store.getIndexStatus(userId)
  const retrievalMode = getAICapabilities({ storageMode: store.storageMode }).retrievalMode
  return { ...status, mode: retrievalMode }
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

function sendError(request, response, error) {
  const result = publicError(error, request.requestId)
  if (result.status >= 500) logServerError(error, request.requestId)
  response.status(result.status).json(result.body)
}

function sendImportError(request, response, error, sourceType = 'article') {
  const result = publicError(error, request.requestId)
  if (result.status >= 500) logServerError(error, request.requestId)
  response.status(result.status).json(errorResult(result.body.error, sourceType, request.requestId))
}

function errorResult(message, sourceType = 'article', requestId = '') {
  return {
    status: 'failed',
    sourceType,
    platform: '外部来源',
    title: '导入失败',
    sourceUrl: '',
    markdown: '',
    extractedText: '',
    warnings: [message || '导入服务遇到未知错误。'],
    requestId,
  }
}
