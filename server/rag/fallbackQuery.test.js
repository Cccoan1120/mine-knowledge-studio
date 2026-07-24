import { describe, expect, it } from 'vitest'
import { buildFallbackQuery } from './fallbackQuery.js'

describe('buildFallbackQuery', () => {
  it('uses the current question and recent user messages only', () => {
    const query = buildFallbackQuery('What should I do next?', [
      { role: 'user', content: 'too old' },
      { role: 'assistant', content: 'ignore this answer' },
      { role: 'user', content: 'keep one' },
      { role: 'assistant', content: 'ignore this too' },
      { role: 'user', content: 'keep two' },
      { role: 'assistant', content: 'ignore this too' },
      { role: 'user', content: 'keep three' },
      { role: 'assistant', content: 'ignore this too' },
    ])

    expect(query).toContain('keep one')
    expect(query).toContain('keep two')
    expect(query).toContain('keep three')
    expect(query).toContain('What should I do next?')
    expect(query).not.toContain('too old')
    expect(query).not.toContain('ignore this')
  })
})
