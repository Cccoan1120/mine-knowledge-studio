import { describe, expect, it } from 'vitest'
import { createMemoryStore } from '../store/memoryStore.js'

async function setup() {
  const store = createMemoryStore()
  const user = await store.createUser({ email: 'owner@example.com', passwordHash: 'hash' })
  const other = await store.createUser({ email: 'other@example.com', passwordHash: 'hash' })
  return { store, user, other }
}

describe('memory governance store', () => {
  it('persists dismissals idempotently per user', async () => {
    const { store, user, other } = await setup()
    const input = { kind: 'duplicate', fingerprint: 'a'.repeat(64) }
    await store.saveGovernanceDismissal(user.id, input)
    await store.saveGovernanceDismissal(user.id, input)

    expect(await store.listGovernanceDismissals(user.id)).toHaveLength(1)
    expect(await store.listGovernanceDismissals(other.id)).toEqual([])
  })

  it('links both owned notes and keeps both', async () => {
    const { store, user } = await setup()
    const first = await store.createNote(user.id, { title: 'One', content: 'content one' })
    const second = await store.createNote(user.id, { title: 'Two', content: 'content two' })

    const updated = await store.linkGovernanceDuplicates(user.id, {
      fingerprint: 'b'.repeat(64),
      noteIds: [first.id, second.id],
    })

    expect(updated).toHaveLength(2)
    expect(updated.find((item) => item.id === first.id).relatedNoteIds).toContain(second.id)
    expect(updated.find((item) => item.id === second.id).relatedNoteIds).toContain(first.id)
    expect(await store.listNotes(user.id)).toHaveLength(2)
  })

  it('rejects cross-user linking and only replaces verified tag variants', async () => {
    const { store, user, other } = await setup()
    const first = await store.createNote(user.id, { title: 'One', content: 'content one', tags: ['LLM', 'keep'] })
    const foreign = await store.createNote(other.id, { title: 'Other', content: 'content other', tags: ['llm'] })
    expect(await store.linkGovernanceDuplicates(user.id, { fingerprint: 'c'.repeat(64), noteIds: [first.id, foreign.id] })).toBeNull()

    const updated = await store.applyGovernanceTags(user.id, {
      fingerprint: 'd'.repeat(64),
      variants: ['LLM', 'llm'],
      canonicalTag: 'Language Models',
    })
    expect(updated).toHaveLength(1)
    expect(updated[0].tags).toEqual(['Language Models', 'keep'])
    expect((await store.listNotes(other.id))[0].tags).toEqual(['llm'])
  })
})
