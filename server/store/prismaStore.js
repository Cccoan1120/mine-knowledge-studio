import { createRequire } from 'node:module'
import { normalizeNote, publicNote, publicUser } from './memoryStore.js'

const require = createRequire(import.meta.url)

export function createPrismaStore() {
  const { PrismaClient } = require('@prisma/client')
  const { PrismaPg } = require('@prisma/adapter-pg')
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  const prisma = new PrismaClient({ adapter })

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
      return publicNote(
        await prisma.note.create({
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
        }),
      )
    },

    async updateNote(userId, noteId, patch) {
      const existing = await prisma.note.findFirst({ where: { id: noteId, userId } })
      if (!existing) return null
      const note = normalizeNote({ ...existing, ...patch, id: noteId, userId, updatedAt: new Date().toISOString() })
      return publicNote(
        await prisma.note.update({
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
        }),
      )
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
  }
}
