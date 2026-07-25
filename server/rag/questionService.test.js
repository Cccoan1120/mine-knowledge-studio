// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { createMemoryStore } from '../store/memoryStore.js'
import { createRagQuestionService } from './questionService.js'

function chunk(id, noteId, overrides = {}) {
  return {
    id,
    noteId,
    ordinal: 0,
    title: `Title ${noteId}`,
    source: `https://example.test/${noteId}`,
    headingPath: ['Section'],
    content: `Exact evidence for ${id}.`,
    startOffset: 0,
    endOffset: 24,
    score: 1,
    ...overrides,
  }
}

function postgresStore(result) {
  return {
    storageMode: 'postgres',
    retrieveKnowledgeCandidates: vi.fn(async () => result),
  }
}

describe('RAG question service', () => {
  it('fuses dense and keyword candidates and enforces context diversity limits', async () => {
    const candidates = [
      chunk('a1', 'a'),
      chunk('a2', 'a'),
      chunk('a3', 'a'),
      chunk('b1', 'b'),
      chunk('b2', 'b'),
      chunk('c1', 'c'),
      chunk('d1', 'd'),
      chunk('e1', 'e'),
      chunk('f1', 'f'),
    ]
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]))
    const store = postgresStore({
      dense: ['a1', 'a2', 'a3', 'b1', 'c1', 'd1', 'e1', 'f1'].map((id) => byId.get(id)),
      keyword: ['b1', 'a3', 'b2', 'c1', 'd1', 'e1', 'f1'].map((id) => byId.get(id)),
    })
    const embedding = Array(1536).fill(0.25)
    const service = createRagQuestionService({
      store,
      embeddingClient: { embed: vi.fn(async () => [embedding]) },
    })

    const result = await service.ask({
      userId: 'user-1',
      question: 'What is the evidence?',
      history: [],
      scope: { noteIds: [], topics: [], tags: [] },
    })

    expect(result.retrievalMode).toBe('hybrid')
    expect(result.mode).toBe('fallback')
    expect(result.citations.map((citation) => citation.chunkId).slice(0, 3)).toEqual(['b1', 'a3', 'c1'])
    expect(result.citations.length).toBeLessThanOrEqual(8)
    expect(new Set(result.citations.map((citation) => citation.noteId)).size).toBeLessThanOrEqual(5)
    for (const noteId of new Set(result.citations.map((citation) => citation.noteId))) {
      expect(result.citations.filter((citation) => citation.noteId === noteId).length).toBeLessThanOrEqual(2)
    }
    expect(store.retrieveKnowledgeCandidates).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      queryEmbedding: embedding,
      denseLimit: 30,
      keywordLimit: 30,
    }))
  })

  it('continues keyword-only when query embedding fails', async () => {
    const evidence = chunk('keyword-1', 'note-1')
    const store = postgresStore({ dense: [], keyword: [evidence] })
    const service = createRagQuestionService({
      store,
      embeddingClient: { embed: vi.fn(async () => Promise.reject(new Error('provider secret'))) },
    })

    const result = await service.ask({
      userId: 'user-1',
      question: 'Keyword evidence',
      history: [],
      scope: { noteIds: [], topics: [], tags: [] },
    })

    expect(result.retrievalMode).toBe('keyword')
    expect(result.citations[0]).toMatchObject({ chunkId: 'keyword-1', noteId: 'note-1' })
    expect(store.retrieveKnowledgeCandidates.mock.calls[0][0].queryEmbedding).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain('provider secret')
  })

  it('rewrites a follow-up before retrieval and suppresses a supplement when evidence is sufficient', async () => {
    const evidence = chunk('chunk-1', 'note-1')
    const store = postgresStore({ dense: [evidence], keyword: [evidence] })
    const chatClient = {
      completeJSON: vi.fn()
        .mockResolvedValueOnce({ standaloneQuestion: 'Mine evidence retention strategy' })
        .mockResolvedValueOnce({
          knowledgeAnswer: 'The retained evidence supports the answer.',
          citations: [
            { chunkId: 'chunk-1', noteId: 'note-1', quote: evidence.content },
            { chunkId: 'missing', noteId: 'note-1', quote: 'Invented quote' },
          ],
          insufficient: false,
          generalSupplement: 'This must be suppressed.',
        }),
    }
    const service = createRagQuestionService({
      store,
      embeddingClient: { embed: vi.fn(async () => [Array(1536).fill(0.1)]) },
      chatClient,
    })

    const result = await service.ask({
      userId: 'user-1',
      question: 'How does that work?',
      history: [
        { role: 'user', content: 'Tell me about evidence retention.' },
        { role: 'assistant', content: 'It preserves trusted source material.' },
      ],
      scope: { noteIds: [], topics: [], tags: [] },
    })

    expect(store.retrieveKnowledgeCandidates.mock.calls[0][0].searchTokens).toBe('mine evidence retention strategy')
    expect(result.citations).toEqual([{
      chunkId: 'chunk-1',
      noteId: 'note-1',
      title: 'Title note-1',
      quote: evidence.content,
      sourceUrl: 'https://example.test/note-1',
    }])
    expect(result.insufficient).toBe(false)
    expect(result.generalSupplement).toBe('')
    expect(result.answer).toBe(result.knowledgeAnswer)
    const answerMessages = chatClient.completeJSON.mock.calls[1][0]
    expect(answerMessages[0].content).toContain('untrusted data')
    expect(answerMessages[1].content).toContain('<UNTRUSTED_SOURCE_TEXT>')
  })

  it('uses the approved fallback standalone query when rewriting fails', async () => {
    const evidence = chunk('chunk-1', 'note-1')
    const store = postgresStore({ dense: [], keyword: [evidence] })
    const chatClient = {
      completeJSON: vi.fn()
        .mockRejectedValueOnce(new Error('rewrite unavailable'))
        .mockResolvedValueOnce({
          knowledgeAnswer: 'Grounded answer',
          citations: [{ chunkId: evidence.id, noteId: evidence.noteId, quote: evidence.content }],
          insufficient: false,
          generalSupplement: '',
        }),
    }
    const service = createRagQuestionService({ store, chatClient })

    await service.ask({
      userId: 'user-1',
      question: 'What next?',
      history: [
        { role: 'user', content: 'Earlier user context' },
        { role: 'assistant', content: 'Assistant text must not enter the fallback query' },
      ],
      scope: { noteIds: [], topics: [], tags: [] },
    })

    const tokens = store.retrieveKnowledgeCandidates.mock.calls[0][0].searchTokens
    expect(tokens).toContain('earlier')
    expect(tokens).toContain('what')
    expect(tokens).not.toContain('assistant')
  })

  it('rejects hallucinated citations and keeps general knowledge only for insufficient results', async () => {
    const evidence = chunk('chunk-1', 'note-1')
    const store = postgresStore({ dense: [], keyword: [evidence] })
    const chatClient = {
      completeJSON: vi.fn(async () => ({
        knowledgeAnswer: 'Evidence is unavailable.',
        citations: [
          { chunkId: evidence.id, noteId: 'wrong-note', quote: evidence.content },
          { chunkId: evidence.id, noteId: evidence.noteId, quote: 'Not in the chunk' },
          { chunkId: evidence.id, noteId: evidence.noteId, quote: 'x'.repeat(501) },
        ],
        insufficient: false,
        generalSupplement: 'General background, clearly separated.',
      })),
    }
    const service = createRagQuestionService({ store, chatClient })

    const result = await service.ask({
      userId: 'user-1',
      question: 'Unsupported claim?',
      history: [],
      scope: { noteIds: [], topics: [], tags: [] },
    })

    expect(result.citations).toEqual([])
    expect(result.sourceIds).toEqual([])
    expect(result.insufficient).toBe(true)
    expect(result.generalSupplement).toBe('General background, clearly separated.')
  })

  it('records safe retrieval and answer timing metrics without questions, sources, quotes, keys, or errors', async () => {
    const evidence = chunk('chunk-1', 'note-1', {
      content: 'source sentinel with quote sentinel',
      source: 'postgresql://connection-sentinel',
    })
    const store = postgresStore({ dense: [evidence], keyword: [evidence] })
    const logger = { log: vi.fn() }
    const times = [1_000, 1_030, 2_000, 2_045]
    const service = createRagQuestionService({
      store,
      embeddingClient: { embed: vi.fn(async () => [Array(1536).fill(0.1)]) },
      chatClient: {
        completeJSON: vi.fn(async () => Promise.reject(new Error('provider-error-sentinel api-key-sentinel'))),
      },
      logger,
      clock: () => times.shift(),
    })

    await service.ask({
      userId: 'user-1',
      question: 'question sentinel',
      history: [],
      scope: { noteIds: [], topics: [], tags: [] },
    })

    expect(logger.log.mock.calls).toEqual([
      ['Mine operational metric.', {
        event: 'knowledge_retrieval',
        outcome: 'success',
        durationMs: 30,
        retrievalMode: 'hybrid',
        denseCandidateCount: 1,
        keywordCandidateCount: 1,
        contextCount: 1,
        failureCategory: null,
      }],
      ['Mine operational metric.', {
        event: 'answer_generation',
        outcome: 'fallback',
        durationMs: 45,
        retrievalMode: 'hybrid',
        contextCount: 1,
        failureCategory: 'answer_generation_failed',
      }],
    ])
    const logs = JSON.stringify(logger.log.mock.calls)
    for (const sentinel of [
      'question sentinel',
      'source sentinel',
      'quote sentinel',
      'connection-sentinel',
      'provider-error-sentinel',
      'api-key-sentinel',
    ]) {
      expect(logs).not.toContain(sentinel)
    }
  })

  it('filters memory notes with AND-across and OR-within scope semantics', async () => {
    const store = createMemoryStore()
    const first = await store.createNote('user-1', {
      title: 'Matching note',
      content: 'matching evidence',
      topic: 'Research',
      tags: ['rag', 'mine'],
    })
    await store.createNote('user-1', {
      title: 'Wrong tag',
      content: 'other evidence',
      topic: 'Research',
      tags: ['other'],
    })
    await store.createNote('user-2', {
      title: 'Other user',
      content: 'private evidence',
      topic: 'Research',
      tags: ['rag'],
    })
    const legacyAnswer = vi.fn(async (_question, notes) => ({
      answer: notes.map((note) => note.title).join(', '),
      sourceIds: notes.map((note) => note.id),
      citations: [],
      insufficient: false,
      mode: 'fallback',
    }))
    const service = createRagQuestionService({ store, legacyAnswer })

    const result = await service.ask({
      userId: 'user-1',
      question: 'What matches?',
      history: [],
      scope: { noteIds: [first.id], topics: ['Research', 'Planning'], tags: ['rag', 'trusted'] },
    })

    expect(result.retrievalMode).toBe('basic')
    expect(result.scope).toEqual({
      noteIds: [first.id],
      topics: ['Research', 'Planning'],
      tags: ['rag', 'trusted'],
    })
    expect(result.knowledgeAnswer).toBe('Matching note')
    expect(legacyAnswer.mock.calls[0][1]).toHaveLength(1)
  })
})
