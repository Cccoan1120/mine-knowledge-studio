import { randomUUID } from 'node:crypto'

export function createMemoryGovernanceStore({ notes, normalizeNote, publicNote }) {
  const dismissals = new Map()

  return {
    async listGovernanceDismissals(userId) {
      return Array.from(dismissals.values()).filter((item) => item.userId === userId)
    },

    async saveGovernanceDismissal(userId, input) {
      const key = `${userId}:${input.kind}:${input.fingerprint}`
      if (!dismissals.has(key)) {
        dismissals.set(key, {
          id: randomUUID(),
          userId,
          kind: input.kind,
          fingerprint: input.fingerprint,
          createdAt: new Date().toISOString(),
        })
      }
      return dismissals.get(key)
    },

    async linkGovernanceDuplicates(userId, input) {
      const [firstId, secondId] = input.noteIds
      const first = notes.get(firstId)
      const second = notes.get(secondId)
      if (!first || !second || first.userId !== userId || second.userId !== userId) return null
      const now = new Date().toISOString()
      const updated = [
        normalizeNote({ ...first, relatedNoteIds: Array.from(new Set([...first.relatedNoteIds, secondId])), updatedAt: now }),
        normalizeNote({ ...second, relatedNoteIds: Array.from(new Set([...second.relatedNoteIds, firstId])), updatedAt: now }),
      ]
      for (const note of updated) notes.set(note.id, note)
      await this.saveGovernanceDismissal(userId, { kind: 'duplicate', fingerprint: input.fingerprint })
      return updated.map(publicNote)
    },

    async applyGovernanceTags(userId, input) {
      const variants = new Set(input.variants)
      const updated = []
      for (const current of notes.values()) {
        if (current.userId !== userId || !current.tags.some((tag) => variants.has(tag))) continue
        const nextTags = []
        let insertedCanonical = false
        for (const tag of current.tags) {
          if (variants.has(tag)) {
            if (!insertedCanonical) nextTags.push(input.canonicalTag)
            insertedCanonical = true
          } else if (!nextTags.includes(tag)) {
            nextTags.push(tag)
          }
        }
        const note = normalizeNote({ ...current, tags: Array.from(new Set(nextTags)), updatedAt: new Date().toISOString() })
        notes.set(note.id, note)
        updated.push(publicNote(note))
      }
      await this.saveGovernanceDismissal(userId, { kind: 'tag', fingerprint: input.fingerprint })
      return updated
    },
  }
}
