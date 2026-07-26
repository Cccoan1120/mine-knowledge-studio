import { randomUUID } from 'node:crypto'

export function createMemoryStore() {
  const users = new Map()
  const notes = new Map()

  return {
    storageMode: 'memory',

    async healthCheck() {
      return true
    },

    async createUser({ email, passwordHash }) {
      const existing = Array.from(users.values()).find((user) => user.email === email)
      if (existing) {
        const error = new Error('该邮箱已经注册。')
        error.code = 'USER_EXISTS'
        throw error
      }

      const now = new Date().toISOString()
      const user = { id: randomUUID(), email, passwordHash, createdAt: now, updatedAt: now }
      users.set(user.id, user)
      return publicUser(user)
    },

    async findUserByEmail(email) {
      return Array.from(users.values()).find((user) => user.email === email) ?? null
    },

    async findUserById(id) {
      const user = users.get(id)
      return user ? publicUser(user) : null
    },

    async listNotes(userId) {
      return Array.from(notes.values())
        .filter((note) => note.userId === userId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map(publicNote)
    },

    async createNote(userId, input) {
      const now = new Date().toISOString()
      const note = normalizeNote({ ...input, id: randomUUID(), userId, createdAt: now, updatedAt: now })
      notes.set(note.id, note)
      return publicNote(note)
    },

    async updateNote(userId, noteId, patch) {
      const current = notes.get(noteId)
      if (!current || current.userId !== userId) return null
      const updated = normalizeNote({ ...current, ...patch, userId, id: noteId, updatedAt: new Date().toISOString() })
      notes.set(noteId, updated)
      return publicNote(updated)
    },

    async deleteNote(userId, noteId) {
      const current = notes.get(noteId)
      if (!current || current.userId !== userId) return false
      return notes.delete(noteId)
    },

    async bulkCreateNotes(userId, inputs) {
      const created = []
      for (const input of inputs) {
        created.push(await this.createNote(userId, input))
      }
      return created
    },

    async ensureIndexJobs() {
      return { mode: 'basic', queued: 0 }
    },

    async getIndexStatus(userId) {
      const total = Array.from(notes.values()).filter((note) => note.userId === userId).length
      return {
        mode: 'basic',
        total,
        pending: 0,
        processing: 0,
        ready: total,
        failed: 0,
        missing: 0,
      }
    },

    async retryFailedIndexJobs() {
      return 0
    },

    async retrieveKnowledgeCandidates() {
      return { dense: [], keyword: [] }
    },

    async claimNextIndexJob() {
      return null
    },

    async loadNoteForIndexJob() {
      return null
    },

    async replaceIndexChunks() {
      return false
    },

    async recordIndexJobFailure() {
      return false
    },
  }
}

export function publicUser(user) {
  if (!user) return null
  return {
    id: user.id,
    email: user.email,
    createdAt: toISOString(user.createdAt),
    updatedAt: toISOString(user.updatedAt),
  }
}

export function publicNote(note) {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    summary: note.summary,
    tags: note.tags,
    topic: note.topic,
    source: note.source,
    createdAt: toISOString(note.createdAt),
    updatedAt: toISOString(note.updatedAt),
    relatedNoteIds: note.relatedNoteIds,
  }
}

export function normalizeNote(note) {
  const now = new Date().toISOString()
  return {
    id: String(note.id || randomUUID()),
    userId: String(note.userId),
    title: String(note.title || '未命名素材'),
    content: String(note.content || ''),
    summary: String(note.summary || ''),
    tags: Array.isArray(note.tags) ? note.tags.map(String).slice(0, 20) : [],
    topic: String(note.topic || 'Inbox'),
    source: String(note.source || ''),
    createdAt: toISOString(note.createdAt || now),
    updatedAt: toISOString(note.updatedAt || now),
    relatedNoteIds: Array.isArray(note.relatedNoteIds) ? note.relatedNoteIds.map(String).slice(0, 50) : [],
  }
}

function toISOString(value) {
  if (!value) return new Date().toISOString()
  if (typeof value === 'string') return value
  return new Date(value).toISOString()
}
