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

  it('preserves non-ASCII content in chunks', () => {
    const markdown = '# Languages\n\nПривет café 😀'

    expect(chunkMarkdown(markdown)).toEqual([
      expect.objectContaining({ content: 'Привет café 😀' }),
    ])
  })

  it('splits oversized punctuation-only blocks within the hard maximum', () => {
    const chunks = chunkMarkdown('!!!!!!!', { targetTokens: 2, maxTokens: 2, overlapTokens: 0 })

    expect(chunks.map((chunk) => chunk.content)).toEqual(['!!', '!!', '!!', '!'])
    expect(chunks.every((chunk) => chunk.tokenCount <= 2)).toBe(true)
  })

  it('does not hide oversized punctuation tails behind a word token', () => {
    const chunks = chunkMarkdown('word!!!!!!!', { targetTokens: 2, maxTokens: 2, overlapTokens: 0 })

    expect(chunks.map((chunk) => chunk.content)).toEqual(['word!!', '!!', '!!', '!'])
    expect(chunks.every((chunk) => chunk.tokenCount <= 2)).toBe(true)
  })

  it('does not leave sparse entries for skipped heading levels', () => {
    const chunks = chunkMarkdown('# Top\n\n### Deep\n\nBody')

    expect(chunks[0].headingPath).toEqual(['Top', 'Deep'])
  })
})
