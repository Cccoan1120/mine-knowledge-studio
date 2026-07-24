import { describe, expect, it } from 'vitest'
import { chunkMarkdown } from './chunker.js'

describe('chunkMarkdown', () => {
  it('preserves heading breadcrumbs and Markdown source offsets', () => {
    const markdown = '# Project\n\n## Plan\n\nFirst paragraph.'
    const startOffset = markdown.indexOf('First paragraph.')

    expect(chunkMarkdown(markdown)).toEqual([
      expect.objectContaining({
        ordinal: 0,
        headingPath: ['Project', 'Plan'],
        content: 'First paragraph.',
        startOffset,
        endOffset: startOffset + 'First paragraph.'.length,
        tokenCount: 2,
      }),
    ])
  })

  it('splits oversized blocks with overlap under small test limits', () => {
    const markdown = '# Steps\n\none two three four five six seven eight nine ten'
    const chunks = chunkMarkdown(markdown, { targetTokens: 4, maxTokens: 5, overlapTokens: 1 })

    expect(chunks.map((chunk) => chunk.content)).toEqual([
      'one two three four',
      'four five six seven',
      'seven eight nine ten',
    ])
    expect(chunks.every((chunk) => chunk.tokenCount <= 5)).toBe(true)
  })

  it('never emits empty chunks', () => {
    expect(chunkMarkdown('# Heading\n\n   \n\n')).toEqual([])
  })
})
