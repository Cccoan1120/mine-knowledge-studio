import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { hashContent } from '../rag/hash.js'
import { normalizeNote, publicNote, publicUser } from './memoryStore.js'

const require = createRequire(import.meta.url)
const CURRENT_INDEX_VERSION = 1

export function createPrismaStore({ prisma = createPrismaClient() } = {}) {

  return {
    storageMode: 'postgres',

    async healthCheck() {
      await prisma.$queryRawUnsafe('SELECT 1')
      return true
    },

    async createUser({ email, passwordHash }) {
      try {
        const user = await prisma.user.create({ data: { email, passwordHash } })
        return publicUser(user)
      } catch (error) {
        if (error?.code === 'P2002') {
          const duplicate = new Error('该邮箱已经注册。')
          duplicate.code = 'USER_EXISTS'
          throw duplicate
        }
        throw error
      }
    },

    async findUserByEmail(email) {
      return prisma.user.findUnique({ where: { email } })
    },

    async findUserById(id) {
      return publicUser(await prisma.user.findUnique({ where: { id } }))
    },

    async listNotes(userId) {
      const notes = await prisma.note.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
      })
      return notes.map(publicNote)
    },

    async createNote(userId, input) {
      const note = normalizeNote({ ...input, userId })
      return prisma.$transaction(async (transaction) => {
        const created = await transaction.note.create({
          data: {
            userId,
            title: note.title,
            content: note.content,
            summary: note.summary,
            tags: note.tags,
            topic: note.topic,
            source: note.source,
            relatedNoteIds: note.relatedNoteIds,
            createdAt: new Date(note.createdAt),
            updatedAt: new Date(note.updatedAt),
          },
        })
        await upsertIndexJob(transaction, {
          userId,
          noteId: created.id,
          contentHash: hashContent(created.content),
        })
        return publicNote(created)
      })
    },

    async updateNote(userId, noteId, patch) {
      return prisma.$transaction(async (transaction) => {
        const existing = await transaction.note.findFirst({ where: { id: noteId, userId } })
        if (!existing) return null
        const note = normalizeNote({ ...existing, ...patch, id: noteId, userId, updatedAt: new Date().toISOString() })
        const updated = await transaction.note.update({
          where: { id: noteId },
          data: {
            title: note.title,
            content: note.content,
            summary: note.summary,
            tags: note.tags,
            topic: note.topic,
            source: note.source,
            relatedNoteIds: note.relatedNoteIds,
            updatedAt: new Date(note.updatedAt),
          },
        })
        if (note.content !== existing.content) {
          await upsertIndexJob(transaction, {
            userId,
            noteId,
            contentHash: hashContent(note.content),
          })
        }
        return publicNote(updated)
      })
    },

    async deleteNote(userId, noteId) {
      const existing = await prisma.note.findFirst({ where: { id: noteId, userId } })
      if (!existing) return false
      await prisma.note.delete({ where: { id: noteId } })
      return true
    },

    async bulkCreateNotes(userId, inputs) {
      const created = []
      for (const input of inputs) {
        created.push(await this.createNote(userId, input))
      }
      return created
    },

    async ensureIndexJobs(userId) {
      const [notes, jobs, chunks] = await Promise.all([
        prisma.note.findMany({
          where: { userId },
          select: { id: true, userId: true, content: true },
        }),
        prisma.knowledgeIndexJob.findMany({
          where: { userId },
          select: { noteId: true, contentHash: true, status: true },
        }),
        prisma.knowledgeChunk.findMany({
          where: { userId },
          select: { noteId: true, contentHash: true, indexVersion: true },
        }),
      ])
      const stale = buildIndexStates(notes, jobs, chunks).filter(shouldQueueIndex)

      let queued = 0
      for (const candidate of stale) {
        const didQueue = await prisma.$transaction(async (transaction) => {
          const currentNotes = await transaction.$queryRawUnsafe(
            `
              SELECT "id", "userId", "content"
              FROM "Note"
              WHERE "id" = $1 AND "userId" = $2
              FOR UPDATE
            `,
            candidate.id,
            userId,
          )
          const currentNote = currentNotes[0]
          if (!currentNote) return false

          const currentHash = hashContent(currentNote.content)
          const currentJob = await transaction.knowledgeIndexJob.findUnique({
            where: { noteId: currentNote.id },
            select: { noteId: true, contentHash: true, status: true },
          })
          const currentChunks = await transaction.knowledgeChunk.findMany({
            where: { noteId: currentNote.id, userId },
            select: { noteId: true, contentHash: true, indexVersion: true },
          })
          const currentState = buildIndexStates([currentNote], currentJob ? [currentJob] : [], currentChunks)[0]
          if (!shouldQueueIndex(currentState)) return false

          await upsertIndexJob(transaction, {
            userId,
            noteId: currentNote.id,
            contentHash: currentHash,
          })
          return true
        })
        if (didQueue) queued += 1
      }
      return { mode: 'hybrid', queued }
    },

    async getIndexStatus(userId) {
      const [counts = {}] = await prisma.$queryRawUnsafe(
        `
          WITH "noteCoverage" AS (
            SELECT
              note."id",
              job."status",
              CASE
                WHEN note."content" ~ U&'^[[:space:]\\00A0\\1680\\2000-\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF]*$' THEN job."status" = 'ready'
                WHEN job."status" = 'ready' THEN EXISTS (
                  SELECT 1
                  FROM "KnowledgeChunk" AS chunk
                  WHERE chunk."noteId" = note."id"
                    AND chunk."userId" = $1
                    AND chunk."contentHash" = job."contentHash"
                    AND chunk."indexVersion" = ${CURRENT_INDEX_VERSION}
                )
                ELSE FALSE
              END AS "ready"
            FROM "Note" AS note
            LEFT JOIN "KnowledgeIndexJob" AS job
              ON job."noteId" = note."id"
              AND job."userId" = $1
            WHERE note."userId" = $1
          )
          SELECT
            COUNT(*)::int AS "total",
            COUNT(*) FILTER (WHERE "status" = 'pending')::int AS "pending",
            COUNT(*) FILTER (WHERE "status" = 'processing')::int AS "processing",
            COUNT(*) FILTER (WHERE "status" = 'ready' AND "ready")::int AS "ready",
            COUNT(*) FILTER (WHERE "status" = 'failed')::int AS "failed",
            COUNT(*) FILTER (WHERE "status" IS NULL OR ("status" = 'ready' AND NOT "ready"))::int AS "missing"
          FROM "noteCoverage"
        `,
        userId,
      )
      return {
        mode: 'hybrid',
        total: Number(counts.total || 0),
        pending: Number(counts.pending || 0),
        processing: Number(counts.processing || 0),
        ready: Number(counts.ready || 0),
        failed: Number(counts.failed || 0),
        missing: Number(counts.missing || 0),
      }
    },

    async retryFailedIndexJobs(userId) {
      const result = await prisma.knowledgeIndexJob.updateMany({
        where: { userId, status: 'failed' },
        data: {
          status: 'pending',
          attempts: 0,
          availableAt: new Date(),
          lockedAt: null,
          leaseToken: null,
          lastError: null,
        },
      })
      return result.count
    },

    async retrieveKnowledgeCandidates({
      userId,
      searchTokens,
      queryEmbedding,
      scope = {},
      denseLimit = 30,
      keywordLimit = 30,
    }) {
      const dense = []
      const keyword = []

      if (queryEmbedding !== undefined) {
        if (!Array.isArray(queryEmbedding) || queryEmbedding.length !== 1536) {
          throw new Error('Query embedding must contain 1536 dimensions.')
        }
        const denseScope = scopeFilters(scope, 3)
        const denseParameters = [
          userId,
          vectorLiteral(queryEmbedding),
          ...denseScope.parameters,
          denseLimit,
        ]
        const limitPlaceholder = `$${denseParameters.length}`
        const rows = await prisma.$queryRawUnsafe(
          `
            SELECT
              chunk."id",
              chunk."noteId",
              chunk."ordinal",
              note."title",
              note."source",
              chunk."headingPath",
              chunk."content",
              chunk."startOffset",
              chunk."endOffset",
              1 - (chunk."embedding" <=> $2::vector) AS "score"
            FROM "KnowledgeChunk" AS chunk
            INNER JOIN "KnowledgeIndexJob" AS job
              ON job."noteId" = chunk."noteId"
              AND job."userId" = $1
              AND job."status" = 'ready'
              AND job."contentHash" = chunk."contentHash"
            INNER JOIN "Note" AS note
              ON note."id" = chunk."noteId"
              AND note."userId" = $1
            WHERE chunk."userId" = $1
              AND chunk."indexVersion" = ${CURRENT_INDEX_VERSION}
              ${denseScope.sql}
            ORDER BY chunk."embedding" <=> $2::vector, chunk."id"
            LIMIT ${limitPlaceholder}::int
          `,
          ...denseParameters,
        )
        dense.push(...rows.map(normalizeCandidate))
      }

      const terms = String(searchTokens || '').split(/\s+/).filter(Boolean)
      if (terms.length) {
        const keywordScope = scopeFilters(scope, 3)
        const keywordParameters = [
          userId,
          terms.join(' | '),
          ...keywordScope.parameters,
          keywordLimit,
        ]
        const limitPlaceholder = `$${keywordParameters.length}`
        const rows = await prisma.$queryRawUnsafe(
          `
            SELECT
              chunk."id",
              chunk."noteId",
              chunk."ordinal",
              note."title",
              note."source",
              chunk."headingPath",
              chunk."content",
              chunk."startOffset",
              chunk."endOffset",
              ts_rank_cd(
                to_tsvector('simple', chunk."searchTokens"),
                to_tsquery('simple', $2)
              ) AS "score"
            FROM "KnowledgeChunk" AS chunk
            INNER JOIN "KnowledgeIndexJob" AS job
              ON job."noteId" = chunk."noteId"
              AND job."userId" = $1
              AND job."status" = 'ready'
              AND job."contentHash" = chunk."contentHash"
            INNER JOIN "Note" AS note
              ON note."id" = chunk."noteId"
              AND note."userId" = $1
            WHERE chunk."userId" = $1
              AND chunk."indexVersion" = ${CURRENT_INDEX_VERSION}
              AND to_tsvector('simple', chunk."searchTokens") @@ to_tsquery('simple', $2)
              ${keywordScope.sql}
            ORDER BY "score" DESC, chunk."id"
            LIMIT ${limitPlaceholder}::int
          `,
          ...keywordParameters,
        )
        keyword.push(...rows.map(normalizeCandidate))
      }

      return { dense, keyword }
    },

    async claimNextIndexJob() {
      const leaseToken = randomUUID()
      return prisma.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(`
          UPDATE "KnowledgeIndexJob"
          SET
            "status" = 'failed',
            "lockedAt" = NULL,
            "leaseToken" = NULL,
            "lastError" = 'Indexing failed.',
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE "status" = 'processing'
            AND "attempts" >= 4
            AND "lockedAt" <= CURRENT_TIMESTAMP - INTERVAL '5 minutes'
        `)

        const jobs = await transaction.$queryRawUnsafe(`
          UPDATE "KnowledgeIndexJob" AS job
          SET
            "status" = 'processing',
            "attempts" = job."attempts" + 1,
            "lockedAt" = CURRENT_TIMESTAMP,
            "leaseToken" = $1,
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE job."id" = (
            SELECT candidate."id"
            FROM "KnowledgeIndexJob" AS candidate
            WHERE (
              (candidate."status" = 'pending' AND candidate."availableAt" <= CURRENT_TIMESTAMP)
              OR (
                candidate."status" = 'processing'
                AND candidate."lockedAt" <= CURRENT_TIMESTAMP - INTERVAL '5 minutes'
              )
            )
            AND candidate."attempts" < 4
            ORDER BY candidate."availableAt" ASC, candidate."createdAt" ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          )
          RETURNING job.*
        `, leaseToken)
        return jobs[0] || null
      })
    },

    async loadNoteForIndexJob(job) {
      return prisma.note.findFirst({
        where: { id: job.noteId, userId: job.userId },
      })
    },

    async replaceIndexChunks(job, chunks) {
      if (!job.leaseToken) return false
      return prisma.$transaction(async (transaction) => {
        const notes = await transaction.$queryRawUnsafe(
          `
            SELECT note."id", note."content"
            FROM "Note" AS note
            INNER JOIN "KnowledgeIndexJob" AS job ON job."noteId" = note."id"
            WHERE note."id" = $1
              AND note."userId" = $2
              AND job."id" = $3
              AND job."userId" = $2
              AND job."contentHash" = $4
              AND job."status" = 'processing'
              AND job."leaseToken" = $5
            FOR UPDATE OF note, job
          `,
          job.noteId,
          job.userId,
          job.id,
          job.contentHash,
          job.leaseToken,
        )
        const note = notes[0]
        if (!note || hashContent(note.content) !== job.contentHash) return false

        await transaction.knowledgeChunk.deleteMany({
          where: { noteId: job.noteId, userId: job.userId },
        })
        for (const chunk of chunks) {
          await transaction.$executeRawUnsafe(
            `
              INSERT INTO "KnowledgeChunk" (
                "id", "userId", "noteId", "ordinal", "headingPath", "content",
                "startOffset", "endOffset", "tokenCount", "contentHash",
                "searchTokens", "indexVersion", "embedding", "createdAt", "updatedAt"
              )
              VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10,
                $11, $12, $13::vector, $14, $15
              )
            `,
            randomUUID(),
            job.userId,
            job.noteId,
            chunk.ordinal,
            chunk.headingPath,
            chunk.content,
            chunk.startOffset,
            chunk.endOffset,
            chunk.tokenCount,
            chunk.contentHash,
            chunk.searchTokens,
            chunk.indexVersion,
            vectorLiteral(chunk.embedding),
            new Date(),
            new Date(),
          )
        }

        const completed = await transaction.knowledgeIndexJob.updateMany({
          where: {
            id: job.id,
            userId: job.userId,
            noteId: job.noteId,
            contentHash: job.contentHash,
            status: 'processing',
            leaseToken: job.leaseToken,
          },
          data: {
            status: 'ready',
            lockedAt: null,
            leaseToken: null,
            lastError: null,
          },
        })
        if (completed.count !== 1) throw new Error('Index job changed during completion.')
        return true
      }, { timeout: 60_000 })
    },

    async recordIndexJobFailure(job, { retryAt }) {
      if (!job.leaseToken) return false
      const data = retryAt
        ? {
            status: 'pending',
            availableAt: retryAt,
            lockedAt: null,
            leaseToken: null,
            lastError: 'Indexing failed.',
          }
        : {
            status: 'failed',
            lockedAt: null,
            leaseToken: null,
            lastError: 'Indexing failed.',
          }
      const result = await prisma.knowledgeIndexJob.updateMany({
        where: {
          id: job.id,
          userId: job.userId,
          noteId: job.noteId,
          contentHash: job.contentHash,
          status: 'processing',
          leaseToken: job.leaseToken,
        },
        data,
      })
      return result.count === 1
    },
  }
}

function createPrismaClient() {
  const { PrismaClient } = require('@prisma/client')
  const { PrismaPg } = require('@prisma/adapter-pg')
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  return new PrismaClient({ adapter })
}

function upsertIndexJob(transaction, { userId, noteId, contentHash }) {
  const availableAt = new Date()
  return transaction.knowledgeIndexJob.upsert({
    where: { noteId },
    create: {
      userId,
      noteId,
      contentHash,
      status: 'pending',
      attempts: 0,
      availableAt,
      leaseToken: null,
    },
    update: {
      userId,
      contentHash,
      status: 'pending',
      attempts: 0,
      availableAt,
      lockedAt: null,
      leaseToken: null,
      lastError: null,
    },
  })
}

function buildIndexStates(notes, jobs, chunks) {
  const jobsByNote = new Map(jobs.map((job) => [job.noteId, job]))
  const chunksByNote = new Map()
  for (const chunk of chunks) {
    const noteChunks = chunksByNote.get(chunk.noteId) || []
    noteChunks.push(chunk)
    chunksByNote.set(chunk.noteId, noteChunks)
  }

  return notes.map((note) => {
    const contentHash = hashContent(note.content)
    const job = jobsByNote.get(note.id)
    const noteChunks = chunksByNote.get(note.id) || []
    const chunksCurrent = noteChunks.every(
      (chunk) => chunk.contentHash === contentHash && chunk.indexVersion === CURRENT_INDEX_VERSION,
    )
    const hasRequiredChunks = !String(note.content).trim() || noteChunks.length > 0
    return {
      ...note,
      contentHash,
      job,
      ready: job?.status === 'ready'
        && job.contentHash === contentHash
        && chunksCurrent
        && hasRequiredChunks,
    }
  })
}

function shouldQueueIndex(state) {
  if (state.ready) return false
  if (!state.job || state.job.contentHash !== state.contentHash) return true
  return state.job.status === 'ready'
}

function vectorLiteral(embedding) {
  return `[${embedding.join(',')}]`
}

function scopeFilters(scope, firstParameter) {
  const clauses = []
  const parameters = []

  for (const [field, clause] of [
    ['noteIds', (placeholder) => `chunk."noteId" = ANY(${placeholder}::text[])`],
    ['topics', (placeholder) => `note."topic" = ANY(${placeholder}::text[])`],
    ['tags', (placeholder) => `note."tags" && ${placeholder}::text[]`],
  ]) {
    const values = Array.isArray(scope[field]) ? scope[field] : []
    if (!values.length) continue
    const placeholder = `$${firstParameter + parameters.length}`
    clauses.push(clause(placeholder))
    parameters.push(values)
  }

  return {
    sql: clauses.length ? `AND ${clauses.join('\n              AND ')}` : '',
    parameters,
  }
}

function normalizeCandidate(candidate) {
  return {
    id: String(candidate.id),
    noteId: String(candidate.noteId),
    ordinal: Number(candidate.ordinal),
    title: String(candidate.title || ''),
    source: String(candidate.source || ''),
    headingPath: Array.isArray(candidate.headingPath) ? candidate.headingPath.map(String) : [],
    content: String(candidate.content || ''),
    startOffset: Number(candidate.startOffset),
    endOffset: Number(candidate.endOffset),
    score: Number(candidate.score),
  }
}
