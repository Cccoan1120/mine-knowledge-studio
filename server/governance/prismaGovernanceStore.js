import { publicNote } from '../store/memoryStore.js'

export function createPrismaGovernanceStore(prisma) {
  return {
    async listGovernanceDismissals(userId) {
      return prisma.governanceDismissal.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })
    },

    async saveGovernanceDismissal(userId, input) {
      return prisma.governanceDismissal.upsert({
        where: { userId_kind_fingerprint: { userId, kind: input.kind, fingerprint: input.fingerprint } },
        create: { userId, kind: input.kind, fingerprint: input.fingerprint },
        update: {},
      })
    },

    async linkGovernanceDuplicates(userId, input) {
      return prisma.$transaction(async (transaction) => {
        const owned = await transaction.note.findMany({ where: { userId, id: { in: input.noteIds } } })
        if (owned.length !== 2) return null
        const [firstId, secondId] = input.noteIds
        const first = owned.find((note) => note.id === firstId)
        const second = owned.find((note) => note.id === secondId)
        const updated = await Promise.all([
          transaction.note.update({ where: { id: firstId }, data: { relatedNoteIds: Array.from(new Set([...first.relatedNoteIds, secondId])) } }),
          transaction.note.update({ where: { id: secondId }, data: { relatedNoteIds: Array.from(new Set([...second.relatedNoteIds, firstId])) } }),
        ])
        await transaction.governanceDismissal.upsert({
          where: { userId_kind_fingerprint: { userId, kind: 'duplicate', fingerprint: input.fingerprint } },
          create: { userId, kind: 'duplicate', fingerprint: input.fingerprint },
          update: {},
        })
        return updated.map(publicNote)
      })
    },

    async applyGovernanceTags(userId, input) {
      return prisma.$transaction(async (transaction) => {
        const notes = await transaction.note.findMany({ where: { userId, tags: { hasSome: input.variants } } })
        const updated = []
        for (const note of notes) {
          const variants = new Set(input.variants)
          const tags = []
          let insertedCanonical = false
          for (const tag of note.tags) {
            if (variants.has(tag)) {
              if (!insertedCanonical) tags.push(input.canonicalTag)
              insertedCanonical = true
            } else if (!tags.includes(tag)) {
              tags.push(tag)
            }
          }
          updated.push(await transaction.note.update({ where: { id: note.id }, data: { tags: Array.from(new Set(tags)) } }))
        }
        await transaction.governanceDismissal.upsert({
          where: { userId_kind_fingerprint: { userId, kind: 'tag', fingerprint: input.fingerprint } },
          create: { userId, kind: 'tag', fingerprint: input.fingerprint },
          update: {},
        })
        return updated.map(publicNote)
      })
    },
  }
}
