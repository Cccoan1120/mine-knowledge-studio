// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { createMemoryStore } from '../store/memoryStore.js'
import { createGovernanceService } from './service.js'

async function setup() {
  const store = createMemoryStore()
  const owner = await store.createUser({ email: 'owner@example.com', passwordHash: 'hash' })
  const other = await store.createUser({ email: 'other@example.com', passwordHash: 'hash' })
  const body = 'A practical guide to retrieval augmented generation with source citations.'
  await store.createNote(owner.id, { title: 'Guide', content: body, tags: ['LLM', 'keep'] })
  await store.createNote(owner.id, { title: 'Guide copy', content: body, tags: ['llm'] })
  return { owner, other, service: createGovernanceService({ store }) }
}

describe('governance service', () => {
  it('keeps the event loop available while analyzing a large library', async () => {
    const notes = Array.from({ length: 220 }, (_, index) => ({
      id: String(index), title: `Note ${index}`, content: `A shared reference about source citations and reliable knowledge retrieval ${index}`,
      tags: [], updatedAt: '2026-09-07T00:00:00.000Z',
    }))
    const service = createGovernanceService({ store: { listNotes: async () => notes, listGovernanceDismissals: async () => [] } })
    let responsive = false
    const timer = setTimeout(() => { responsive = true }, 0)
    const result = await service.list('owner')
    clearTimeout(timer)
    expect(responsive).toBe(true)
    expect(result.stats.noteCount).toBe(220)
    expect(result.duplicates.length).toBeLessThanOrEqual(50)
  })

  it('updates original fullwidth tags instead of losing them after normalization', async () => {
    const store = createMemoryStore()
    await store.createNote('owner', { title: 'A', tags: ['ＡＩ'] })
    await store.createNote('owner', { title: 'B', tags: ['ai'] })
    const service = createGovernanceService({ store })
    const candidate = (await service.list('owner')).tags[0]
    expect(candidate.variants.map(item => item.tag)).toContain('ＡＩ')
    const result = await service.applyTagCandidate('owner', { fingerprint: candidate.fingerprint, canonicalTag: 'AI' })
    expect(result.notes).toHaveLength(2)
    expect((await store.listNotes('owner')).every(note => note.tags.join() === 'AI')).toBe(true)
  })

  it('lists, dismisses, and keeps a dismissal hidden', async () => {
    const { owner, service } = await setup()
    const first = await service.list(owner.id)
    expect(first.duplicates).toHaveLength(1)
    await service.dismiss(owner.id, { kind: 'duplicate', fingerprint: first.duplicates[0].fingerprint })
    expect((await service.list(owner.id)).duplicates).toEqual([])
  })

  it('revalidates stale and cross-user fingerprints', async () => {
    const { owner, other, service } = await setup()
    const candidate = (await service.list(owner.id)).tags[0]
    await expect(service.applyTagCandidate(owner.id, { fingerprint: 'f'.repeat(64), canonicalTag: 'LLM' }))
      .rejects.toMatchObject({ status: 409 })
    await expect(service.applyTagCandidate(other.id, { fingerprint: candidate.fingerprint, canonicalTag: 'LLM' }))
      .rejects.toMatchObject({ status: 409 })
  })

  it('links duplicates and applies only a fresh tag candidate', async () => {
    const { owner, service } = await setup()
    const candidates = await service.list(owner.id)
    const linked = await service.linkDuplicate(owner.id, { fingerprint: candidates.duplicates[0].fingerprint })
    expect(linked.notes.every((note) => note.relatedNoteIds.length === 1)).toBe(true)
    const applied = await service.applyTagCandidate(owner.id, {
      fingerprint: candidates.tags[0].fingerprint,
      canonicalTag: 'Language Models',
    })
    expect(applied.notes).toHaveLength(2)
    expect(applied.notes.find((note) => note.tags.includes('keep')).tags).toContain('Language Models')
    expect((await service.list(owner.id)).tags).toEqual([])
  })
})
