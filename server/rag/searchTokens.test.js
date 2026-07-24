import { describe, expect, it } from 'vitest'
import { buildSearchTokens } from './searchTokens.js'

describe('buildSearchTokens', () => {
  it('normalizes English words and adds Chinese character bigrams', () => {
    expect(buildSearchTokens('Mine MINE, 知识库检索')).toBe('mine 知识 识库 库检 检索')
  })
})
