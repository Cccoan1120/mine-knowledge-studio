import { describe, expect, it } from 'vitest'
import { hashContent } from './hash.js'

describe('hashContent', () => {
  it('returns a deterministic SHA-256 hex digest', () => {
    expect(hashContent('Mine')).toBe('f57afb7d275a26df0de0e933b28c16f2462e84c09ad605945a4c6163f2be3baa')
    expect(hashContent('Mine')).toBe(hashContent('Mine'))
  })
})
