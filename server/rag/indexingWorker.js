import { buildSearchTokens } from './searchTokens.js'
import { chunkMarkdown } from './chunker.js'

const INDEX_VERSION = 1
const RETRY_DELAYS_MS = [5_000, 30_000, 5 * 60_000]

export function createIndexingWorker({
  store,
  embeddingClient,
  logger = console,
  now = () => new Date(),
  clock = () => Date.now(),
  pollIntervalMs = 1_000,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}) {
  let started = false
  let timer = null

  async function runOnce() {
    const startedAt = clock()
    const job = await store.claimNextIndexJob()
    if (!job) return { status: 'idle' }

    try {
      const note = await store.loadNoteForIndexJob(job)
      if (!note) throw new Error('Claimed note is unavailable.')

      const baseChunks = chunkMarkdown(note.content)
      const embeddings = baseChunks.length
        ? await embeddingClient.embed(baseChunks.map((chunk) => chunk.content))
        : []
      const chunks = baseChunks.map((chunk, index) => ({
        ...chunk,
        contentHash: job.contentHash,
        searchTokens: buildSearchTokens(chunk.content),
        indexVersion: INDEX_VERSION,
        embedding: embeddings[index],
      }))

      const replaced = await store.replaceIndexChunks(job, chunks)
      const status = replaced ? 'ready' : 'stale'
      emitMetric(logger, {
        event: 'knowledge_index_job',
        outcome: status,
        jobCount: 1,
        durationMs: elapsedMs(clock, startedAt),
        failureCategory: null,
      })
      return { status, jobId: job.id }
    } catch {
      const retryDelay = RETRY_DELAYS_MS[job.attempts - 1]
      const retryAt = retryDelay === undefined ? null : new Date(now().getTime() + retryDelay)
      const recorded = await store.recordIndexJobFailure(job, { retryAt })
      if (!recorded) {
        emitMetric(logger, {
          event: 'knowledge_index_job',
          outcome: 'stale',
          jobCount: 1,
          durationMs: elapsedMs(clock, startedAt),
          failureCategory: null,
        })
        return { status: 'stale', jobId: job.id }
      }
      logger.error('Knowledge indexing failed.', {
        jobId: job.id,
        attempt: job.attempts,
        retryScheduled: Boolean(retryAt),
      })
      const status = retryAt ? 'rescheduled' : 'failed'
      emitMetric(logger, {
        event: 'knowledge_index_job',
        outcome: status,
        jobCount: 1,
        durationMs: elapsedMs(clock, startedAt),
        failureCategory: 'indexing_failed',
      })
      return { status, jobId: job.id }
    }
  }

  async function poll() {
    if (!started) return
    try {
      await runOnce()
    } catch {
      logger.error('Knowledge indexing poll failed.')
    }
    if (started) timer = setTimeoutFn(poll, pollIntervalMs)
  }

  return {
    runOnce,

    start() {
      if (started) return
      started = true
      void poll()
    },

    stop() {
      started = false
      if (timer) clearTimeoutFn(timer)
      timer = null
    },
  }
}

function emitMetric(logger, payload) {
  logger.log?.('Mine operational metric.', payload)
}

function elapsedMs(clock, startedAt) {
  return Math.max(0, clock() - startedAt)
}
