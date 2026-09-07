import { describe, expect, it } from 'vitest'
import { detectGovernanceCandidates } from './candidates.js'

function note(id, overrides = {}) {
  return {
    id,
    title: `Note ${id}`,
    content: 'This is a meaningful note body with enough detail for duplicate detection.',
    summary: '',
    tags: [],
    topic: 'Inbox',
    source: '',
    createdAt: '2026-07-29T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z',
    relatedNoteIds: [],
    ...overrides,
  }
}

describe('detectGovernanceCandidates', () => {
  it('continues past dismissed duplicate pairs without exceeding the candidate limit', () => {
    const notes = Array.from({ length: 30 }, (_, index) => note(`note-${index}`))
    const first = detectGovernanceCandidates(notes)
    expect(first.duplicates).toHaveLength(50)
    const dismissed = first.duplicates.map(item => ({ kind: 'duplicate', fingerprint: item.fingerprint }))
    const next = detectGovernanceCandidates(notes, dismissed)
    expect(next.duplicates).toHaveLength(50)
    expect(next.duplicates.some(item => dismissed.some(ignored => ignored.fingerprint === item.fingerprint))).toBe(false)
  })

  it('finds exact normalized content and ignores unrelated notes', () => {
    const result = detectGovernanceCandidates([
      note('a', { content: ' A practical guide to retrieval augmented generation and citations. ' }),
      note('b', { content: 'a practical guide to retrieval augmented generation and citations.' }),
      note('c', { content: 'A completely separate note about cooking seasonal vegetables.' }),
    ])

    expect(result.duplicates).toHaveLength(1)
    expect(result.duplicates[0]).toMatchObject({ noteIds: ['a', 'b'], reason: 'exact-content', score: 1 })
  })

  it('requires content evidence for same-title and high similarity candidates', () => {
    const result = detectGovernanceCandidates([
      note('a', { title: 'RAG notes', content: 'Retrieval augmented generation grounds answers in selected source passages and includes citations.' }),
      note('b', { title: 'rag notes', content: 'Retrieval augmented generation grounds answers in selected source passages while including citations.' }),
      note('c', { title: 'RAG notes', content: 'This note is about a weekend travel plan through several coastal cities.' }),
    ])

    expect(result.duplicates).toHaveLength(1)
    expect(result.duplicates[0].noteIds).toEqual(['a', 'b'])
    expect(result.duplicates[0].reason).toBe('same-title')
  })

  it('groups formatting variants and chooses the most-used canonical form', () => {
    const result = detectGovernanceCandidates([
      note('a', { tags: ['LLM', 'Product'] }),
      note('b', { tags: ['llm'] }),
      note('c', { tags: ['#LLM'] }),
    ])

    expect(result.tags).toHaveLength(1)
    expect(result.tags[0]).toMatchObject({ canonicalTag: 'LLM', reason: 'format-variant', affectedNoteCount: 3 })
    expect(result.tags[0].variants.map((item) => item.tag)).toEqual(['#LLM', 'LLM', 'llm'])
  })

  it('offers conservative one-edit spelling candidates', () => {
    const result = detectGovernanceCandidates([
      note('a', { tags: ['research'] }),
      note('b', { tags: ['reseach'] }),
      note('c', { tags: ['art'] }),
    ])

    expect(result.tags).toHaveLength(1)
    expect(result.tags[0]).toMatchObject({ canonicalTag: 'research', reason: 'similar-spelling' })
  })

  it('filters persisted dismissals by kind and fingerprint', () => {
    const notes = [note('a', { tags: ['LLM'] }), note('b', { tags: ['llm'] })]
    const candidate = detectGovernanceCandidates(notes).tags[0]
    const result = detectGovernanceCandidates(notes, [{ kind: 'tag', fingerprint: candidate.fingerprint }])

    expect(result.tags).toEqual([])
  })
})
