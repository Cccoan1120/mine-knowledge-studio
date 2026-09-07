// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { createMemoryStore } from '../store/memoryStore.js'
import { createKnowledgeRetriever } from './retriever.js'

function chunk(id, noteId) {
  return {
    id,
    noteId,
    ordinal: 0,
    title: `Title ${noteId}`,
    source: '',
    headingPath: [],
    content: `Evidence ${id}`,
    startOffset: 0,
    endOffset: 12,
    score: 1,
  }
}

describe('knowledge retriever', () => {
  it('refuses missing user identity before querying storage', async () => {
    const store = { storageMode: 'memory', listNotes: vi.fn() }
    const retriever = createKnowledgeRetriever({ store })
    await expect(retriever.retrieve({ query: 'test' })).rejects.toThrow('requires a user')
    expect(store.listNotes).not.toHaveBeenCalled()
  })
  it('returns fused Postgres context with scoped coverage', async () => {
    const evidence = chunk('chunk-1', 'note-1')
    evidence.sourceUpdatedAt = '2026-09-07T00:00:00.000Z'
    const store = {
      storageMode: 'postgres',
      retrieveKnowledgeCandidates: vi.fn(async () => ({ dense: [evidence], keyword: [evidence] })),
      getIndexCoverage: vi.fn(async () => ({ total: 1, ready: 1, pending: 0, processing: 0, failed: 0, missing: 0 })),
    }
    const embedding = Array(1536).fill(0.2)
    const retriever = createKnowledgeRetriever({
      store,
      embeddingClient: { embed: vi.fn(async () => [embedding]) },
    })
    const scope = { noteIds: ['note-1'], topics: [], tags: [] }

    const result = await retriever.retrieve({ userId: 'user-1', query: 'Evidence', scope, includeCoverage: true })

    expect(result).toMatchObject({ retrievalMode: 'hybrid', coverage: { total: 1, ready: 1 } })
    expect(result.chunks).toEqual([expect.objectContaining({ id: evidence.id, noteId: evidence.noteId, sourceUpdatedAt: evidence.sourceUpdatedAt })])
    expect(store.retrieveKnowledgeCandidates).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', scope }))
  })

  it('builds limited source chunks from scoped notes in memory mode', async () => {
    const store = createMemoryStore()
    const user = await store.createUser({ email: 'reader@example.com', passwordHash: 'hash' })
    const matching = await store.createNote(user.id, {
      title: 'LLM Wiki',
      content: 'LLM Wiki uses source-grounded pages.',
      topic: 'Product',
      tags: ['AI'],
    })
    await store.createNote(user.id, { title: 'Cooking', content: 'A recipe.', topic: 'Life' })
    const retriever = createKnowledgeRetriever({ store })

    const result = await retriever.retrieve({
      userId: user.id,
      query: 'LLM Wiki',
      scope: { noteIds: [], topics: ['Product'], tags: [] },
      includeCoverage: true,
    })

    expect(result.retrievalMode).toBe('basic')
    expect(result.coverage).toMatchObject({ total: 1, ready: 1, missing: 0 })
    expect(result.chunks).toEqual([expect.objectContaining({ id: `basic:${matching.id}`, noteId: matching.id, sourceUpdatedAt: matching.updatedAt })])
  })
})
