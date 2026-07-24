// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { hashContent } from '../rag/hash.js'
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
      }),
      update: expect.objectContaining({
        contentHash: hashContent('current content'),
        status: 'pending',
        attempts: 0,
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

    transaction.knowledgeIndexJob.upsert.mockClear()
    transaction.note.findFirst.mockResolvedValueOnce({ ...storedNote, content: 'changed content' })
    await store.updateNote('user-1', 'note-1', { title: 'Renamed note' })
    expect(transaction.knowledgeIndexJob.upsert).not.toHaveBeenCalled()
  })

  it('ensures only missing or stale jobs for the requested user', async () => {
    const notes = [
      { id: 'current-note', userId: 'user-1', content: 'current' },
      { id: 'missing-note', userId: 'user-1', content: 'missing' },
      { id: 'stale-note', userId: 'user-1', content: 'new content' },
    ]
    const jobs = [
      { noteId: 'current-note', contentHash: hashContent('current') },
      { noteId: 'stale-note', contentHash: hashContent('old content') },
    ]
    const upsert = vi.fn(async () => undefined)
    const noteMap = new Map(notes.map((note) => [note.id, note]))
    const jobMap = new Map(jobs.map((job) => [job.noteId, job]))
    const transaction = {
      $queryRawUnsafe: vi.fn(async (_query, noteId) => [noteMap.get(noteId)]),
      knowledgeIndexJob: {
        findUnique: vi.fn(async ({ where }) => jobMap.get(where.noteId) || null),
        upsert,
      },
    }
    const prisma = {
      note: { findMany: vi.fn(async () => notes) },
      knowledgeIndexJob: { findMany: vi.fn(async () => jobs) },
      $transaction: vi.fn(async (callback) => callback(transaction)),
    }
    const store = createPrismaStore({ prisma })

    const result = await store.ensureIndexJobs('user-1')

    expect(result).toEqual({ mode: 'hybrid', queued: 2 })
    expect(prisma.note.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { id: true, userId: true, content: true },
    })
    expect(upsert).toHaveBeenCalledTimes(2)
    expect(upsert.mock.calls.map(([call]) => call.where.noteId)).toEqual([
      'missing-note',
      'stale-note',
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
    }
    const prisma = {
      note: { findMany: vi.fn(async () => [{ id: 'note-1', userId: 'user-1', content: 'old content' }]) },
      knowledgeIndexJob: { findMany: vi.fn(async () => []) },
      $transaction: vi.fn(async (callback) => callback(transaction)),
    }
    const store = createPrismaStore({ prisma })

    await store.ensureIndexJobs('user-1')

    expect(transaction.$queryRawUnsafe.mock.calls[0][0]).toContain('FOR UPDATE')
    expect(upsert.mock.calls[0][0].update.contentHash).toBe(hashContent('new content'))
  })

  it('aggregates user-scoped index status and resets only that user failed jobs', async () => {
    const prisma = {
      note: { count: vi.fn(async () => 7) },
      knowledgeIndexJob: {
        groupBy: vi.fn(async () => [
          { status: 'pending', _count: { _all: 2 } },
          { status: 'processing', _count: { _all: 1 } },
          { status: 'ready', _count: { _all: 2 } },
          { status: 'failed', _count: { _all: 1 } },
        ]),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    }
    const store = createPrismaStore({ prisma })

    expect(await store.getIndexStatus('user-1')).toEqual({
      mode: 'hybrid',
      total: 7,
      pending: 2,
      processing: 1,
      ready: 2,
      failed: 1,
      missing: 1,
    })
    expect(await store.retryFailedIndexJobs('user-1')).toBe(1)
    expect(prisma.knowledgeIndexJob.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', status: 'failed' },
      data: expect.objectContaining({
        status: 'pending',
        attempts: 0,
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
      $queryRawUnsafe: vi.fn(async () => [claimed]),
    }
    const prisma = { $transaction: vi.fn(async (callback) => callback(transaction)) }
    const store = createPrismaStore({ prisma })

    const result = await store.claimNextIndexJob()

    expect(result).toEqual(claimed)
    expect(transaction.knowledgeIndexJob.updateMany).not.toHaveBeenCalled()
    expect(transaction.$executeRawUnsafe).toHaveBeenCalledOnce()
    const [cleanupQuery, ...cleanupParameters] = transaction.$executeRawUnsafe.mock.calls[0]
    expect(cleanupQuery).toContain("CURRENT_TIMESTAMP - INTERVAL '5 minutes'")
    expect(cleanupParameters).toEqual([])
    const [query] = transaction.$queryRawUnsafe.mock.calls[0]
    expect(query).toContain('FOR UPDATE SKIP LOCKED')
    expect(query).toContain('INTERVAL \'5 minutes\'')
    expect(query).toContain('LIMIT 1')
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
    }
    const retryAt = new Date('2026-07-24T12:00:05.000Z')

    await expect(store.recordIndexJobFailure(job, { retryAt })).resolves.toBe(true)
    expect(prisma.knowledgeIndexJob.updateMany.mock.calls[0][0]).toEqual({
      where: expect.objectContaining({
        id: 'job-1',
        userId: 'user-1',
        contentHash: job.contentHash,
        status: 'processing',
        attempts: 1,
      }),
      data: {
        status: 'pending',
        availableAt: retryAt,
        lockedAt: null,
        lastError: 'Indexing failed.',
      },
    })

    await expect(store.recordIndexJobFailure(job, { retryAt: null })).resolves.toBe(true)
    expect(prisma.knowledgeIndexJob.updateMany.mock.calls[1][0].data).toEqual({
      status: 'failed',
      lockedAt: null,
      lastError: 'Indexing failed.',
    })
  })

  it('does not reschedule an expired worker after a newer attempt claims the job', async () => {
    const currentAttempt = 2
    const prisma = {
      knowledgeIndexJob: {
        updateMany: vi.fn(async ({ where }) => ({
          count: where.attempts === undefined || where.attempts === currentAttempt ? 1 : 0,
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
    }

    const rescheduled = await store.recordIndexJobFailure(expiredJob, {
      retryAt: new Date('2026-07-24T12:00:05.000Z'),
    })

    expect(rescheduled).toBe(false)
    expect(prisma.knowledgeIndexJob.updateMany.mock.calls[0][0].where.attempts).toBe(1)
  })

  it('marks ready only when the completion has the current claimed attempt', async () => {
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
    }

    await expect(store.replaceIndexChunks(job, [indexedChunk()])).resolves.toBe(true)
    expect(transaction.knowledgeIndexJob.updateMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ status: 'processing', attempts: 2 }),
    )
  })

  it('does not let an expired worker replace chunks after a newer attempt claims the job', async () => {
    const currentAttempt = 2
    const transaction = {
      $queryRawUnsafe: vi.fn(async (query, ...parameters) => {
        const hasAttemptFence = query.includes('job."attempts" = $5')
        if (!hasAttemptFence || parameters[4] === currentAttempt) {
          return [{ id: storedNote.id, content: storedNote.content }]
        }
        return []
      }),
      $executeRawUnsafe: vi.fn(async () => 1),
      knowledgeChunk: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      knowledgeIndexJob: {
        updateMany: vi.fn(async ({ where }) => ({
          count: where.attempts === undefined || where.attempts === currentAttempt ? 1 : 0,
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
    }

    const replaced = await store.replaceIndexChunks(expiredJob, [indexedChunk()])

    expect(replaced).toBe(false)
    expect(transaction.knowledgeChunk.deleteMany).not.toHaveBeenCalled()
    expect(transaction.$executeRawUnsafe).not.toHaveBeenCalled()
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
