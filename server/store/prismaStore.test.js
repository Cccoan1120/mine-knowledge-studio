// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { hashContent } from '../rag/hash.js'
import { createRagQuestionService } from '../rag/questionService.js'
import { createPrismaStore } from './prismaStore.js'

const storedNote = {
  id: 'note-1',
  userId: 'user-1',
  title: 'Indexed note',
  content: 'current content',
  summary: '',
  tags: [],
  topic: 'Inbox',
  source: '',
  relatedNoteIds: [],
  createdAt: new Date('2026-07-24T10:00:00.000Z'),
  updatedAt: new Date('2026-07-24T10:00:00.000Z'),
}

function indexedChunk(content = storedNote.content) {
  return {
    ordinal: 0,
    headingPath: [],
    content,
    startOffset: 0,
    endOffset: content.length,
    tokenCount: 2,
    contentHash: hashContent(content),
    searchTokens: content,
    indexVersion: 1,
    embedding: [0.1],
  }
}

describe('Prisma indexing store', () => {
  it('queues a pending index job in the same transaction that creates a note', async () => {
    const transaction = {
      note: { create: vi.fn(async () => storedNote) },
      knowledgeIndexJob: { upsert: vi.fn(async () => undefined) },
    }
    const prisma = { $transaction: vi.fn(async (callback) => callback(transaction)) }
    const store = createPrismaStore({ prisma })

    const note = await store.createNote('user-1', {
      title: storedNote.title,
      content: storedNote.content,
    })

    expect(note.id).toBe('note-1')
    expect(transaction.knowledgeIndexJob.upsert).toHaveBeenCalledWith({
      where: { noteId: 'note-1' },
      create: expect.objectContaining({
        userId: 'user-1',
        noteId: 'note-1',
        contentHash: hashContent('current content'),
        status: 'pending',
        attempts: 0,
        leaseToken: null,
      }),
      update: expect.objectContaining({
        contentHash: hashContent('current content'),
        status: 'pending',
        attempts: 0,
        leaseToken: null,
        lockedAt: null,
        lastError: null,
      }),
    })
  })

  it('queues changed content but leaves the index job alone for metadata-only edits', async () => {
    const transaction = {
      note: {
        findFirst: vi.fn(async () => storedNote),
        update: vi.fn(async ({ data }) => ({ ...storedNote, ...data })),
      },
      knowledgeIndexJob: { upsert: vi.fn(async () => undefined) },
    }
    const prisma = { $transaction: vi.fn(async (callback) => callback(transaction)) }
    const store = createPrismaStore({ prisma })

    await store.updateNote('user-1', 'note-1', { content: 'changed content' })
    expect(transaction.knowledgeIndexJob.upsert).toHaveBeenCalledOnce()
    expect(transaction.knowledgeIndexJob.upsert.mock.calls[0][0].update.contentHash).toBe(hashContent('changed content'))
    expect(transaction.knowledgeIndexJob.upsert.mock.calls[0][0].update.leaseToken).toBeNull()

    transaction.knowledgeIndexJob.upsert.mockClear()
    transaction.note.findFirst.mockResolvedValueOnce({ ...storedNote, content: 'changed content' })
    await store.updateNote('user-1', 'note-1', { title: 'Renamed note' })
    expect(transaction.knowledgeIndexJob.upsert).not.toHaveBeenCalled()
  })

  it('ensures missing jobs and incomplete current-version coverage for the requested user', async () => {
    const notes = [
      { id: 'current-note', userId: 'user-1', content: 'current' },
      { id: 'missing-note', userId: 'user-1', content: 'missing' },
      { id: 'stale-note', userId: 'user-1', content: 'new content' },
      { id: 'missing-chunk-note', userId: 'user-1', content: 'needs a chunk' },
      { id: 'old-version-note', userId: 'user-1', content: 'needs current version' },
      { id: 'empty-note', userId: 'user-1', content: '   ' },
    ]
    const jobs = [
      { noteId: 'current-note', contentHash: hashContent('current'), status: 'ready' },
      { noteId: 'stale-note', contentHash: hashContent('old content'), status: 'ready' },
      { noteId: 'missing-chunk-note', contentHash: hashContent('needs a chunk'), status: 'ready' },
      { noteId: 'old-version-note', contentHash: hashContent('needs current version'), status: 'ready' },
      { noteId: 'empty-note', contentHash: hashContent('   '), status: 'ready' },
    ]
    const chunks = [
      { noteId: 'current-note', contentHash: hashContent('current'), indexVersion: 1 },
      { noteId: 'old-version-note', contentHash: hashContent('needs current version'), indexVersion: 0 },
    ]
    const upsert = vi.fn(async () => undefined)
    const noteMap = new Map(notes.map((note) => [note.id, note]))
    const jobMap = new Map(jobs.map((job) => [job.noteId, job]))
    const chunkMap = new Map(notes.map((note) => [
      note.id,
      chunks.filter((chunk) => chunk.noteId === note.id),
    ]))
    const transaction = {
      $queryRawUnsafe: vi.fn(async (_query, noteId) => [noteMap.get(noteId)]),
      knowledgeIndexJob: {
        findUnique: vi.fn(async ({ where }) => jobMap.get(where.noteId) || null),
        upsert,
      },
      knowledgeChunk: {
        findMany: vi.fn(async ({ where }) => chunkMap.get(where.noteId) || []),
      },
    }
    const prisma = {
      note: { findMany: vi.fn(async () => notes) },
      knowledgeIndexJob: { findMany: vi.fn(async () => jobs) },
      knowledgeChunk: { findMany: vi.fn(async () => chunks) },
      $transaction: vi.fn(async (callback) => callback(transaction)),
    }
    const store = createPrismaStore({ prisma })

    const result = await store.ensureIndexJobs('user-1')

    expect(result).toEqual({ mode: 'hybrid', queued: 4 })
    expect(prisma.note.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { id: true, userId: true, content: true },
    })
    expect(upsert).toHaveBeenCalledTimes(4)
    expect(upsert.mock.calls.map(([call]) => call.where.noteId)).toEqual([
      'missing-note',
      'stale-note',
      'missing-chunk-note',
      'old-version-note',
    ])
  })

  it('rechecks and locks current note content before a backfill upsert', async () => {
    const upsert = vi.fn(async () => undefined)
    const transaction = {
      $queryRawUnsafe: vi.fn(async () => [{ id: 'note-1', userId: 'user-1', content: 'new content' }]),
      knowledgeIndexJob: {
        findUnique: vi.fn(async () => null),
        upsert,
      },
      knowledgeChunk: { findMany: vi.fn(async () => []) },
    }
    const prisma = {
      note: { findMany: vi.fn(async () => [{ id: 'note-1', userId: 'user-1', content: 'old content' }]) },
      knowledgeIndexJob: { findMany: vi.fn(async () => []) },
      knowledgeChunk: { findMany: vi.fn(async () => []) },
      $transaction: vi.fn(async (callback) => callback(transaction)),
    }
    const store = createPrismaStore({ prisma })

    await store.ensureIndexJobs('user-1')

    expect(transaction.$queryRawUnsafe.mock.calls[0][0]).toContain('FOR UPDATE')
    expect(upsert.mock.calls[0][0].update.contentHash).toBe(hashContent('new content'))
  })

  it('does not reset a current pending job found during the locked recheck', async () => {
    const upsert = vi.fn(async () => undefined)
    const transaction = {
      $queryRawUnsafe: vi.fn(async () => [{ id: 'note-1', userId: 'user-1', content: 'new content' }]),
      knowledgeIndexJob: {
        findUnique: vi.fn(async () => ({
          noteId: 'note-1',
          contentHash: hashContent('new content'),
          status: 'pending',
        })),
        upsert,
      },
      knowledgeChunk: { findMany: vi.fn(async () => []) },
    }
    const prisma = {
      note: { findMany: vi.fn(async () => [{ id: 'note-1', userId: 'user-1', content: 'old content' }]) },
      knowledgeIndexJob: { findMany: vi.fn(async () => []) },
      knowledgeChunk: { findMany: vi.fn(async () => []) },
      $transaction: vi.fn(async (callback) => callback(transaction)),
    }
    const store = createPrismaStore({ prisma })

    await expect(store.ensureIndexJobs('user-1')).resolves.toEqual({ mode: 'hybrid', queued: 0 })
    expect(transaction.knowledgeIndexJob.findUnique).toHaveBeenCalledWith({
      where: { noteId: 'note-1' },
      select: { noteId: true, contentHash: true, status: true },
    })
    expect(upsert).not.toHaveBeenCalled()
  })

  it('uses one user-isolated aggregate query for searchable status coverage', async () => {
    const notes = [
      { id: 'ready', content: 'ready content' },
      { id: 'pending', content: 'pending content' },
      { id: 'failed', content: 'failed content' },
      { id: 'missing-chunk', content: 'missing chunk' },
      { id: 'old-version', content: 'old version' },
      { id: 'empty', content: '' },
      { id: 'missing-job', content: 'missing job' },
    ]
    const noteFindMany = vi.fn(async () => notes)
    const jobFindMany = vi.fn(async () => [
      { noteId: 'ready', contentHash: hashContent('ready content'), status: 'ready' },
      { noteId: 'pending', contentHash: hashContent('pending content'), status: 'pending' },
      { noteId: 'failed', contentHash: hashContent('failed content'), status: 'failed' },
      { noteId: 'missing-chunk', contentHash: hashContent('missing chunk'), status: 'ready' },
      { noteId: 'old-version', contentHash: hashContent('old version'), status: 'ready' },
      { noteId: 'empty', contentHash: hashContent(''), status: 'ready' },
    ])
    const chunkFindMany = vi.fn(async () => [
      { noteId: 'ready', contentHash: hashContent('ready content'), indexVersion: 1 },
      { noteId: 'old-version', contentHash: hashContent('old version'), indexVersion: 0 },
    ])
    const prisma = {
      note: { findMany: noteFindMany },
      knowledgeIndexJob: {
        findMany: jobFindMany,
      },
      knowledgeChunk: {
        findMany: chunkFindMany,
      },
      $queryRawUnsafe: vi.fn(async () => [{
        total: 7,
        pending: 1,
        processing: 0,
        ready: 2,
        failed: 1,
        missing: 3,
      }]),
    }
    const store = createPrismaStore({ prisma })

    expect(await store.getIndexStatus('user-1')).toEqual({
      mode: 'hybrid',
      total: 7,
      pending: 1,
      processing: 0,
      ready: 2,
      failed: 1,
      missing: 3,
    })
    expect(noteFindMany).not.toHaveBeenCalled()
    expect(jobFindMany).not.toHaveBeenCalled()
    expect(chunkFindMany).not.toHaveBeenCalled()
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledOnce()
    const [query, ...parameters] = prisma.$queryRawUnsafe.mock.calls[0]
    expect(query).toContain('COUNT(*)')
    expect(query).toContain('FILTER')
    expect(query).toContain('EXISTS')
    expect(query).toContain('note."userId" = $1')
    expect(query).toContain('job."userId" = $1')
    expect(query).toContain('chunk."userId" = $1')
    expect(parameters).toEqual(['user-1'])
  })

  it('treats newline, tab, and common ECMAScript trim whitespace as empty in status SQL', async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn(async () => [{
        total: 1,
        pending: 0,
        processing: 0,
        ready: 1,
        failed: 0,
        missing: 0,
      }]),
    }
    const store = createPrismaStore({ prisma })

    await expect(store.getIndexStatus('user-1')).resolves.toEqual({
      mode: 'hybrid',
      total: 1,
      pending: 0,
      processing: 0,
      ready: 1,
      failed: 0,
      missing: 0,
    })
    const [query] = prisma.$queryRawUnsafe.mock.calls[0]
    expect(query).toContain(`note."content" ~ U&'^[[:space:]`)
    expect(query).toContain('\\00A0')
    expect(query).toContain('\\2000-\\200A')
    expect(query).toContain('\\2028\\2029')
    expect(query).toContain('\\FEFF')
  })

  it('resets only the requested user failed jobs', async () => {
    const prisma = {
      knowledgeIndexJob: {
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    }
    const store = createPrismaStore({ prisma })

    expect(await store.retryFailedIndexJobs('user-1')).toBe(1)
    expect(prisma.knowledgeIndexJob.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', status: 'failed' },
      data: expect.objectContaining({
        status: 'pending',
        attempts: 0,
        leaseToken: null,
        lockedAt: null,
        lastError: null,
      }),
    })
  })

  it('recovers expired locks and claims one due job with skip-locked semantics', async () => {
    const claimed = {
      id: 'job-1',
      userId: 'user-1',
      noteId: 'note-1',
      contentHash: hashContent('current content'),
      status: 'processing',
      attempts: 2,
    }
    const transaction = {
      knowledgeIndexJob: { updateMany: vi.fn(async () => ({ count: 0 })) },
      $executeRawUnsafe: vi.fn(async () => 0),
      $queryRawUnsafe: vi.fn(async (_query, leaseToken) => [{ ...claimed, leaseToken }]),
    }
    const prisma = { $transaction: vi.fn(async (callback) => callback(transaction)) }
    const store = createPrismaStore({ prisma })

    const result = await store.claimNextIndexJob()

    expect(result).toEqual(expect.objectContaining(claimed))
    expect(result.leaseToken).toMatch(/^[0-9a-f-]{36}$/)
    expect(transaction.knowledgeIndexJob.updateMany).not.toHaveBeenCalled()
    expect(transaction.$executeRawUnsafe).toHaveBeenCalledOnce()
    const [cleanupQuery, ...cleanupParameters] = transaction.$executeRawUnsafe.mock.calls[0]
    expect(cleanupQuery).toContain("CURRENT_TIMESTAMP - INTERVAL '5 minutes'")
    expect(cleanupQuery).toContain('"leaseToken" = NULL')
    expect(cleanupParameters).toEqual([])
    const [query, claimedLeaseToken] = transaction.$queryRawUnsafe.mock.calls[0]
    expect(query).toContain('"leaseToken" = $1')
    expect(claimedLeaseToken).toBe(result.leaseToken)
    expect(query).toContain('FOR UPDATE SKIP LOCKED')
    expect(query).toContain('INTERVAL \'5 minutes\'')
    expect(query).toContain('LIMIT 1')
  })

  it('issues a new lease when a failed unchanged job is reset and reuses attempt one', async () => {
    const state = {
      id: 'job-1',
      userId: 'user-1',
      noteId: 'note-1',
      contentHash: hashContent(storedNote.content),
      status: 'failed',
      attempts: 1,
      leaseToken: 'lease-old',
    }
    const transaction = {
      $executeRawUnsafe: vi.fn(async () => 0),
      $queryRawUnsafe: vi.fn(async (_query, leaseToken) => {
        Object.assign(state, {
          status: 'processing',
          attempts: state.attempts + 1,
          leaseToken,
        })
        return [{ ...state }]
      }),
    }
    const prisma = {
      knowledgeIndexJob: {
        updateMany: vi.fn(async ({ data }) => {
          Object.assign(state, data)
          return { count: 1 }
        }),
      },
      $transaction: vi.fn(async (callback) => callback(transaction)),
    }
    const store = createPrismaStore({ prisma })

    await store.retryFailedIndexJobs('user-1')
    const reclaimed = await store.claimNextIndexJob()

    expect(reclaimed.contentHash).toBe(hashContent(storedNote.content))
    expect(reclaimed.attempts).toBe(1)
    expect(reclaimed.leaseToken).toMatch(/^[0-9a-f-]{36}$/)
    expect(reclaimed.leaseToken).not.toBe('lease-old')
  })

  it('loads a claimed note only when note and job ownership agree', async () => {
    const prisma = { note: { findFirst: vi.fn(async () => storedNote) } }
    const store = createPrismaStore({ prisma })
    const job = { noteId: 'note-1', userId: 'user-1' }

    await expect(store.loadNoteForIndexJob(job)).resolves.toEqual(storedNote)
    expect(prisma.note.findFirst).toHaveBeenCalledWith({
      where: { id: 'note-1', userId: 'user-1' },
    })
  })

  it('stores only a fixed safe failure and either reschedules or terminates the current claim', async () => {
    const prisma = {
      knowledgeIndexJob: { updateMany: vi.fn(async () => ({ count: 1 })) },
    }
    const store = createPrismaStore({ prisma })
    const job = {
      id: 'job-1',
      userId: 'user-1',
      noteId: 'note-1',
      contentHash: hashContent('current content'),
      status: 'processing',
      attempts: 1,
      leaseToken: 'lease-current',
    }
    const retryAt = new Date('2026-07-24T12:00:05.000Z')

    await expect(store.recordIndexJobFailure(job, { retryAt })).resolves.toBe(true)
    expect(prisma.knowledgeIndexJob.updateMany.mock.calls[0][0]).toEqual({
      where: expect.objectContaining({
        id: 'job-1',
        userId: 'user-1',
        contentHash: job.contentHash,
        status: 'processing',
        leaseToken: 'lease-current',
      }),
      data: {
        status: 'pending',
        availableAt: retryAt,
        leaseToken: null,
        lockedAt: null,
        lastError: 'Indexing failed.',
      },
    })

    await expect(store.recordIndexJobFailure(job, { retryAt: null })).resolves.toBe(true)
    expect(prisma.knowledgeIndexJob.updateMany.mock.calls[1][0].data).toEqual({
      status: 'failed',
      leaseToken: null,
      lockedAt: null,
      lastError: 'Indexing failed.',
    })
  })

  it('does not reschedule an old lease after reset and reclaim reuse the same attempt number', async () => {
    const currentLeaseToken = 'lease-new'
    const prisma = {
      knowledgeIndexJob: {
        updateMany: vi.fn(async ({ where }) => ({
          count: where.leaseToken === undefined || where.leaseToken === currentLeaseToken ? 1 : 0,
        })),
      },
    }
    const store = createPrismaStore({ prisma })
    const expiredJob = {
      id: 'job-1',
      userId: 'user-1',
      noteId: 'note-1',
      contentHash: hashContent(storedNote.content),
      status: 'processing',
      attempts: 1,
      leaseToken: 'lease-old',
    }

    const rescheduled = await store.recordIndexJobFailure(expiredJob, {
      retryAt: new Date('2026-07-24T12:00:05.000Z'),
    })

    expect(rescheduled).toBe(false)
    const where = prisma.knowledgeIndexJob.updateMany.mock.calls[0][0].where
    expect(where.leaseToken).toBe('lease-old')
    expect(where).not.toHaveProperty('attempts')
  })

  it('marks ready only when the completion has the current lease', async () => {
    const transaction = {
      $queryRawUnsafe: vi.fn(async () => [{ id: storedNote.id, content: storedNote.content }]),
      $executeRawUnsafe: vi.fn(async () => 1),
      knowledgeChunk: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      knowledgeIndexJob: { updateMany: vi.fn(async () => ({ count: 1 })) },
    }
    const prisma = { $transaction: vi.fn(async (callback) => callback(transaction)) }
    const store = createPrismaStore({ prisma })
    const job = {
      id: 'job-1',
      noteId: storedNote.id,
      userId: storedNote.userId,
      contentHash: hashContent(storedNote.content),
      status: 'processing',
      attempts: 2,
      leaseToken: 'lease-current',
    }

    await expect(store.replaceIndexChunks(job, [indexedChunk()])).resolves.toBe(true)
    const completion = transaction.knowledgeIndexJob.updateMany.mock.calls[0][0]
    expect(completion.where).toEqual(expect.objectContaining({ status: 'processing', leaseToken: 'lease-current' }))
    expect(completion.where).not.toHaveProperty('attempts')
    expect(completion.data.leaseToken).toBeNull()
  })

  it('does not let an old lease replace chunks after reclaim reuses the same attempt number', async () => {
    const currentLeaseToken = 'lease-new'
    const transaction = {
      $queryRawUnsafe: vi.fn(async (query, ...parameters) => {
        const hasLeaseFence = query.includes('job."leaseToken" = $5')
        if (!hasLeaseFence || parameters[4] === currentLeaseToken) {
          return [{ id: storedNote.id, content: storedNote.content }]
        }
        return []
      }),
      $executeRawUnsafe: vi.fn(async () => 1),
      knowledgeChunk: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      knowledgeIndexJob: {
        updateMany: vi.fn(async ({ where }) => ({
          count: where.leaseToken === undefined || where.leaseToken === currentLeaseToken ? 1 : 0,
        })),
      },
    }
    const prisma = { $transaction: vi.fn(async (callback) => callback(transaction)) }
    const store = createPrismaStore({ prisma })
    const expiredJob = {
      id: 'job-1',
      noteId: storedNote.id,
      userId: storedNote.userId,
      contentHash: hashContent(storedNote.content),
      status: 'processing',
      attempts: 1,
      leaseToken: 'lease-old',
    }

    const replaced = await store.replaceIndexChunks(expiredJob, [indexedChunk()])

    expect(replaced).toBe(false)
    expect(transaction.knowledgeChunk.deleteMany).not.toHaveBeenCalled()
    expect(transaction.$executeRawUnsafe).not.toHaveBeenCalled()
  })

  it('rejects completion and failure transitions without a lease token', async () => {
    const transaction = {
      $queryRawUnsafe: vi.fn(async () => [{ id: storedNote.id, content: storedNote.content }]),
      $executeRawUnsafe: vi.fn(async () => 1),
      knowledgeChunk: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      knowledgeIndexJob: { updateMany: vi.fn(async () => ({ count: 1 })) },
    }
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(transaction)),
      knowledgeIndexJob: { updateMany: vi.fn(async () => ({ count: 1 })) },
    }
    const store = createPrismaStore({ prisma })
    const unleasedJob = {
      id: 'job-1',
      noteId: storedNote.id,
      userId: storedNote.userId,
      contentHash: hashContent(storedNote.content),
      status: 'processing',
      attempts: 1,
    }

    await expect(store.replaceIndexChunks(unleasedJob, [indexedChunk()])).resolves.toBe(false)
    await expect(store.recordIndexJobFailure(unleasedJob, { retryAt: null })).resolves.toBe(false)
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(prisma.knowledgeIndexJob.updateMany).not.toHaveBeenCalled()
  })

  it('does not replace chunks when the locked note content no longer matches the claimed hash', async () => {
    const transaction = {
      $queryRawUnsafe: vi.fn(async () => [{ id: 'note-1', content: 'new content' }]),
      $executeRawUnsafe: vi.fn(),
      knowledgeChunk: { deleteMany: vi.fn() },
      knowledgeIndexJob: { updateMany: vi.fn() },
    }
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(transaction)),
    }
    const store = createPrismaStore({ prisma })

    const replaced = await store.replaceIndexChunks(
      {
        id: 'job-1',
        noteId: 'note-1',
        userId: 'user-1',
        contentHash: hashContent('old content'),
        attempts: 1,
        leaseToken: 'lease-current',
      },
      [
        {
          ordinal: 0,
          headingPath: [],
          content: 'old content',
          startOffset: 0,
          endOffset: 11,
          tokenCount: 2,
          contentHash: hashContent('old content'),
          searchTokens: 'old content',
          indexVersion: 1,
          embedding: [0.1],
        },
      ],
    )

    expect(replaced).toBe(false)
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 60_000 })
    expect(transaction.knowledgeChunk.deleteMany).not.toHaveBeenCalled()
    expect(transaction.$executeRawUnsafe).not.toHaveBeenCalled()
    expect(transaction.knowledgeIndexJob.updateMany).not.toHaveBeenCalled()
  })
})

describe('Prisma knowledge retrieval', () => {
  it.each(['pending', 'failed'])(
    'excludes %s reindex chunks from dense, keyword, and answer citations',
    async (jobStatus) => {
      const staleRow = {
        id: 'stale-chunk',
        noteId: 'note-1',
        ordinal: 0,
        title: 'Stale note',
        source: '',
        headingPath: [],
        content: 'stale evidence',
        startOffset: 0,
        endOffset: 14,
        score: 1,
      }
      const prisma = {
        $queryRawUnsafe: vi.fn(async (query) => {
          const requiresReadyJob = query.includes(`job."status" = 'ready'`)
          return requiresReadyJob && jobStatus !== 'ready' ? [] : [staleRow]
        }),
      }
      const store = createPrismaStore({ prisma })
      const queryEmbedding = Array(1536).fill(0.125)

      const candidates = await store.retrieveKnowledgeCandidates({
        userId: 'user-1',
        searchTokens: 'stale evidence',
        queryEmbedding,
      })
      expect(candidates).toEqual({ dense: [], keyword: [] })

      const service = createRagQuestionService({
        store,
        embeddingClient: { embed: vi.fn(async () => [queryEmbedding]) },
      })
      const result = await service.ask({
        userId: 'user-1',
        question: 'stale evidence',
        history: [],
        scope: { noteIds: [], topics: [], tags: [] },
      })
      expect(result.citations).toEqual([])
      expect(result.insufficient).toBe(true)
    },
  )

  it('issues user-isolated dense and keyword queries with parameterized scope filters', async () => {
    const calls = []
    const prisma = {
      $queryRawUnsafe: vi.fn(async (query, ...parameters) => {
        calls.push({ query, parameters })
        return [{
          id: calls.length === 1 ? 'dense-chunk' : 'keyword-chunk',
          noteId: 'note-1',
          ordinal: 2,
          title: 'Trusted title',
          source: 'https://example.test/source',
          headingPath: ['Section'],
          content: 'Trusted content',
          startOffset: 10,
          endOffset: 25,
          score: calls.length === 1 ? 0.8 : 0.7,
        }]
      }),
    }
    const store = createPrismaStore({ prisma })
    const queryEmbedding = Array(1536).fill(0.125)
    const scope = {
      noteIds: ['note-user-value'],
      topics: ['topic-user-value'],
      tags: ['tag-user-value'],
    }

    const result = await store.retrieveKnowledgeCandidates({
      userId: 'user-1',
      searchTokens: 'alpha beta',
      queryEmbedding,
      scope,
      denseLimit: 30,
      keywordLimit: 30,
    })

    expect(result.dense).toEqual([expect.objectContaining({ id: 'dense-chunk', score: 0.8 })])
    expect(result.keyword).toEqual([expect.objectContaining({ id: 'keyword-chunk', score: 0.7 })])
    expect(calls).toHaveLength(2)
    for (const { query, parameters } of calls) {
      expect(query).toContain('INNER JOIN "Note"')
      expect(query).toContain('INNER JOIN "KnowledgeIndexJob"')
      expect(query).toContain('chunk."userId" = $1')
      expect(query).toContain('note."userId" = $1')
      expect(query).toContain('job."userId" = $1')
      expect(query).toContain(`job."status" = 'ready'`)
      expect(query).toContain('job."contentHash" = chunk."contentHash"')
      expect(query).toContain('chunk."indexVersion" = 1')
      expect(query).toContain('chunk."noteId"')
      expect(query).toContain('note."topic"')
      expect(query).toContain('note."tags" &&')
      expect(parameters[0]).toBe('user-1')
      expect(parameters).toContainEqual(scope.noteIds)
      expect(parameters).toContainEqual(scope.topics)
      expect(parameters).toContainEqual(scope.tags)
      expect(query).not.toContain('note-user-value')
      expect(query).not.toContain('topic-user-value')
      expect(query).not.toContain('tag-user-value')
    }
    expect(calls[0].query).toContain('<=>')
    expect(calls[0].parameters[1]).toContain('[0.125,0.125')
    expect(calls[1].query).toContain("to_tsvector('simple'")
    expect(calls[1].query).toContain("to_tsquery('simple'")
    expect(calls[1].parameters).toContain('alpha | beta')
  })

  it('skips dense retrieval without an embedding and keyword retrieval without search terms', async () => {
    const prisma = { $queryRawUnsafe: vi.fn(async () => []) }
    const store = createPrismaStore({ prisma })

    await expect(store.retrieveKnowledgeCandidates({
      userId: 'user-1',
      searchTokens: 'keyword',
      scope: { noteIds: [], topics: [], tags: [] },
    })).resolves.toEqual({ dense: [], keyword: [] })
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledOnce()

    prisma.$queryRawUnsafe.mockClear()
    await expect(store.retrieveKnowledgeCandidates({
      userId: 'user-1',
      searchTokens: '',
      queryEmbedding: Array(1536).fill(0),
      scope: { noteIds: [], topics: [], tags: [] },
    })).resolves.toEqual({ dense: [], keyword: [] })
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledOnce()
  })
})
