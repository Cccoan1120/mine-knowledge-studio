import { describe, expect, it } from 'vitest'
import { selectContext } from './context.js'

describe('selectContext', () => {
  it('keeps ranked chunks within note and total diversity limits', () => {
    const candidates = [
      { id: 'a1', noteId: 'a' },
      { id: 'a2', noteId: 'a' },
      { id: 'a3', noteId: 'a' },
      { id: 'b1', noteId: 'b' },
      { id: 'b2', noteId: 'b' },
      { id: 'c1', noteId: 'c' },
      { id: 'd1', noteId: 'd' },
      { id: 'e1', noteId: 'e' },
      { id: 'f1', noteId: 'f' },
      { id: 'g1', noteId: 'g' },
    ]

    expect(selectContext(candidates).map((candidate) => candidate.id)).toEqual(['a1', 'a2', 'b1', 'b2', 'c1', 'd1', 'e1'])
  })
})
