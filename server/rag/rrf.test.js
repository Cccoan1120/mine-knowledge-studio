import { describe, expect, it } from 'vitest'
import { fuseRankings } from './rrf.js'

describe('fuseRankings', () => {
  it('combines dense and keyword rankings with stable ties', () => {
    const fused = fuseRankings(
      [{ id: 'dense-first' }, { id: 'shared' }],
      [{ id: 'keyword-first' }, { id: 'shared' }],
    )

    expect(fused.map((candidate) => candidate.id)).toEqual(['shared', 'dense-first', 'keyword-first'])
    expect(fused[0].score).toBeCloseTo(2 / 62)
    expect(fused[1].score).toBe(fused[2].score)
  })
})
