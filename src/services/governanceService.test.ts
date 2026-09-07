import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyTagCandidate, dismissGovernanceCandidate, linkDuplicateCandidate, listGovernanceCandidates } from './governanceService'

afterEach(() => vi.unstubAllGlobals())

describe('governanceService', () => {
  it('uses the authenticated governance endpoints', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ duplicates: [], tags: [], stats: { noteCount: 0, tagCount: 0 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ notes: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ notes: [] }) })
    vi.stubGlobal('fetch', fetchMock)

    await listGovernanceCandidates()
    await dismissGovernanceCandidate('duplicate', 'a'.repeat(64))
    await linkDuplicateCandidate('b'.repeat(64))
    await applyTagCandidate('c'.repeat(64), 'LLM')

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/governance/candidates',
      '/api/governance/dismiss',
      '/api/governance/duplicates/link',
      '/api/governance/tags/apply',
    ])
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({ fingerprint: 'c'.repeat(64), canonicalTag: 'LLM' })
  })
})
