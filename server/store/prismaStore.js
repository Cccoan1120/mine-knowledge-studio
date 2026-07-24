import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { hashContent } from '../rag/hash.js'
import { normalizeNote, publicNote, publicUser } from './memoryStore.js'

const require = createRequire(import.meta.url)

export function createPrismaStore({ prisma = createPrismaClient() } = {}) {

  return {
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
      const [notes, jobs] = await Promise.all([
        prisma.note.findMany({
          where: { userId },
          select: { id: true, userId: true, content: true },
        }),
        prisma.knowledgeIndexJob.findMany({
          where: { userId },
          select: { noteId: true, contentHash: true },
        }),
      ])
      const jobHashes = new Map(jobs.map((job) => [job.noteId, job.contentHash]))
      const stale = notes
        .map((note) => ({ ...note, contentHash: hashContent(note.content) }))
        .filter((note) => jobHashes.get(note.id) !== note.contentHash)

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
            select: { contentHash: true },
          })
          if (currentJob?.contentHash === currentHash) return false

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
      const [total, grouped] = await Promise.all([
        prisma.note.count({ where: { userId } }),
        prisma.knowledgeIndexJob.groupBy({
          by: ['status'],
          where: { userId },
          _count: { _all: true },
        }),
      ])
      const counts = Object.fromEntries(grouped.map((group) => [group.status, group._count._all]))
      const indexed = Object.values(counts).reduce((sum, count) => sum + count, 0)
      return {
        mode: 'hybrid',
        total,
        pending: counts.pending || 0,
        processing: counts.processing || 0,
        ready: counts.ready || 0,
        failed: counts.failed || 0,
        missing: Math.max(0, total - indexed),
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
          lastError: null,
        },
      })
      return result.count
    },

    async claimNextIndexJob() {
      return prisma.$transaction(async (transaction) => {
        await transaction.knowledgeIndexJob.updateMany({
          where: {
            status: 'processing',
            attempts: { gte: 4 },
            lockedAt: { lte: new Date(Date.now() - 5 * 60_000) },
          },
          data: {
            status: 'failed',
            lockedAt: null,
            lastError: 'Indexing failed.',
          },
        })

        const jobs = await transaction.$queryRawUnsafe(`
          UPDATE "KnowledgeIndexJob" AS job
          SET
            "status" = 'processing',
            "attempts" = job."attempts" + 1,
            "lockedAt" = CURRENT_TIMESTAMP,
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
        `)
        return jobs[0] || null
      })
    },

    async loadNoteForIndexJob(job) {
      return prisma.note.findFirst({
        where: { id: job.noteId, userId: job.userId },
      })
    },

    async replaceIndexChunks(job, chunks) {
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
            FOR UPDATE OF note, job
          `,
          job.noteId,
          job.userId,
          job.id,
          job.contentHash,
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
          },
          data: {
            status: 'ready',
            lockedAt: null,
            lastError: null,
          },
        })
        if (completed.count !== 1) throw new Error('Index job changed during completion.')
        return true
      }, { timeout: 60_000 })
    },

    async recordIndexJobFailure(job, { retryAt }) {
      const data = retryAt
        ? {
            status: 'pending',
            availableAt: retryAt,
            lockedAt: null,
            lastError: 'Indexing failed.',
          }
        : {
            status: 'failed',
            lockedAt: null,
            lastError: 'Indexing failed.',
          }
      const result = await prisma.knowledgeIndexJob.updateMany({
        where: {
          id: job.id,
          userId: job.userId,
          noteId: job.noteId,
          contentHash: job.contentHash,
          status: 'processing',
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
    },
    update: {
      userId,
      contentHash,
      status: 'pending',
      attempts: 0,
      availableAt,
      lockedAt: null,
      lastError: null,
    },
  })
}

function vectorLiteral(embedding) {
  return `[${embedding.join(',')}]`
}
