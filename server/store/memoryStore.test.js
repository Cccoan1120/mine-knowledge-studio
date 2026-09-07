// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { createMemoryStore } from './memoryStore.js'
import { validateBulkNotes } from '../validation.js'

describe('memory store indexing contract', () => {
  it('rejects stale versions without overwriting newer content', async () => {
    const store = createMemoryStore()
    const note = await store.createNote('owner', { content: 'original' })
    const saved = await store.updateNote('owner', note.id, { content: 'new', expectedUpdatedAt: note.updatedAt })
    expect(saved.updatedAt).not.toBe(note.updatedAt)
    await expect(store.updateNote('owner', note.id, { content: 'stale', expectedUpdatedAt: note.updatedAt })).rejects.toMatchObject({ status: 409 })
    expect((await store.listNotes('owner'))[0].content).toBe('new')
  })

  it('remaps imported relationships and makes a retry idempotent for the same user', async () => {
    const store = createMemoryStore()
    const input = validateBulkNotes({ notes: [
      { id: 'a', title: 'A', relatedNoteIds: ['b'] },
      { id: 'b', title: 'B', relatedNoteIds: ['a'] },
    ] })
    const imported = await store.bulkCreateNotes('owner', input)
    expect(imported[0].relatedNoteIds).toEqual([imported[1].id])
    expect(imported[1].relatedNoteIds).toEqual([imported[0].id])
    expect(await store.bulkCreateNotes('owner', input)).toEqual(imported)
    expect(await store.listNotes('owner')).toHaveLength(2)
    expect(await store.bulkCreateNotes('owner', validateBulkNotes({ notes: imported }))).toEqual(imported)
    const revised = await store.bulkCreateNotes('owner', validateBulkNotes({ notes: [{ ...imported[0], content: 'Revised file' }] }))
    expect(revised[0].content).toBe('Revised file')
    expect(revised[0].id).not.toBe(imported[0].id)
    expect((await store.bulkCreateNotes('other', input))[0].id).not.toBe(imported[0].id)
  })

  it('reports basic mode and keeps indexing operations as no-ops', async () => {
    const store = createMemoryStore()
    const user = await store.createUser({ email: 'basic@example.com', passwordHash: 'hash' })
    await store.createNote(user.id, { title: 'Basic note', content: 'Local-only content' })

    expect(await store.getIndexStatus(user.id)).toEqual({
      mode: 'basic',
      total: 1,
      pending: 0,
      processing: 0,
      ready: 1,
      failed: 0,
      missing: 0,
    })
    expect(await store.ensureIndexJobs(user.id)).toEqual({ mode: 'basic', queued: 0 })
    expect(await store.retryFailedIndexJobs(user.id)).toBe(0)
    expect(await store.claimNextIndexJob()).toBeNull()
  })
})
