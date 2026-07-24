// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'
import { hashContent } from './hash.js'
import { createIndexingWorker } from './indexingWorker.js'

const now = new Date('2026-07-24T12:00:00.000Z')

function claimedJob(attempts = 1, content = '# Heading\n\nIndexed content') {
  return {
    id: `job-${attempts}`,
    userId: 'user-1',
    noteId: 'note-1',
    contentHash: hashContent(content),
    status: 'processing',
    attempts,
  }
}

function fakeStore({ job = claimedJob(), content = '# Heading\n\nIndexed content', replaceResult = true } = {}) {
  return {
    claimNextIndexJob: vi.fn(async () => job),
    loadNoteForIndexJob: vi.fn(async () => ({ id: job.noteId, userId: job.userId, content })),
    replaceIndexChunks: vi.fn(async () => replaceResult),
    recordIndexJobFailure: vi.fn(async () => true),
  }
}

describe('indexing worker', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns idle when no job is due', async () => {
    const store = fakeStore({ job: null })
    const embeddingClient = { embed: vi.fn() }
    const worker = createIndexingWorker({ store, embeddingClient, now: () => now })

    await expect(worker.runOnce()).resolves.toEqual({ status: 'idle' })
    expect(store.loadNoteForIndexJob).not.toHaveBeenCalled()
  })

  it('claims at most one job, embeds its chunks as a batch, and marks matching content ready', async () => {
    const store = fakeStore()
    const embeddingClient = {
      embed: vi.fn(async (inputs) => inputs.map((_input, index) => [index + 0.5])),
    }
    const worker = createIndexingWorker({ store, embeddingClient, now: () => now })

    const result = await worker.runOnce()

    expect(result).toEqual({ status: 'ready', jobId: 'job-1' })
    expect(store.claimNextIndexJob).toHaveBeenCalledOnce()
    expect(embeddingClient.embed).toHaveBeenCalledWith(['Indexed content'])
    expect(store.replaceIndexChunks).toHaveBeenCalledOnce()
    const [job, chunks] = store.replaceIndexChunks.mock.calls[0]
    expect(job.id).toBe('job-1')
    expect(chunks).toEqual([
      expect.objectContaining({
        ordinal: 0,
        headingPath: ['Heading'],
        content: 'Indexed content',
        contentHash: job.contentHash,
        searchTokens: 'indexed content',
        indexVersion: 1,
        embedding: [0.5],
      }),
    ])
  })

  it('marks an empty note ready without calling the embedding provider', async () => {
    const content = '# Empty\n\n   '
    const store = fakeStore({ job: claimedJob(1, content), content })
    const embeddingClient = { embed: vi.fn() }
    const worker = createIndexingWorker({ store, embeddingClient, now: () => now })

    const result = await worker.runOnce()

    expect(result.status).toBe('ready')
    expect(embeddingClient.embed).not.toHaveBeenCalled()
    expect(store.replaceIndexChunks).toHaveBeenCalledWith(expect.any(Object), [])
  })

  it('discards a stale completion without recording a worker failure', async () => {
    const store = fakeStore({ replaceResult: false })
    const embeddingClient = { embed: vi.fn(async () => [[0.5]]) }
    const worker = createIndexingWorker({ store, embeddingClient, now: () => now })

    const result = await worker.runOnce()

    expect(result.status).toBe('stale')
    expect(store.recordIndexJobFailure).not.toHaveBeenCalled()
  })

  it('uses 5 seconds, 30 seconds, and 5 minutes before terminal failure on execution four', async () => {
    const expectedDelays = [5_000, 30_000, 5 * 60_000]

    for (let attempts = 1; attempts <= 4; attempts += 1) {
      const rawError = new Error('Bearer embedding-secret source text must stay private')
      const store = fakeStore({ job: claimedJob(attempts) })
      const embeddingClient = { embed: vi.fn(async () => Promise.reject(rawError)) }
      const logger = { error: vi.fn() }
      const worker = createIndexingWorker({ store, embeddingClient, logger, now: () => now })

      const result = await worker.runOnce()

      if (attempts <= expectedDelays.length) {
        expect(result.status).toBe('rescheduled')
        expect(store.recordIndexJobFailure).toHaveBeenCalledWith(
          expect.objectContaining({ attempts }),
          { retryAt: new Date(now.getTime() + expectedDelays[attempts - 1]) },
        )
      } else {
        expect(result.status).toBe('failed')
        expect(store.recordIndexJobFailure).toHaveBeenCalledWith(expect.objectContaining({ attempts }), { retryAt: null })
      }

      const persistedAndLogged = JSON.stringify({
        store: store.recordIndexJobFailure.mock.calls,
        logger: logger.error.mock.calls,
      })
      expect(persistedAndLogged).not.toContain('embedding-secret')
      expect(persistedAndLogged).not.toContain('source text')
    }
  })

  it('starts and stops a non-overlapping polling loop', async () => {
    vi.useFakeTimers()
    const store = fakeStore({ job: null })
    const embeddingClient = { embed: vi.fn() }
    const worker = createIndexingWorker({
      store,
      embeddingClient,
      pollIntervalMs: 1_000,
      now: () => now,
    })

    worker.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(store.claimNextIndexJob).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(1_000)
    expect(store.claimNextIndexJob).toHaveBeenCalledTimes(2)

    worker.stop()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(store.claimNextIndexJob).toHaveBeenCalledTimes(2)
  })
})
