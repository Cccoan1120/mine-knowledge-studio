import { describe, expect, it } from 'vitest'
import { extractTitle, parseMarkdownToNote, serializeNoteToMarkdown } from './markdown'

describe('markdown utilities', () => {
  it('extracts the first markdown heading as title', () => {
    expect(extractTitle('intro\n\n# 正式标题\ncontent')).toBe('正式标题')
  })

  it('parses and serializes note metadata without losing content', () => {
    const note = parseMarkdownToNote(
      [
        '---',
        'title: "本地优先"',
        'summary: "Markdown 便于迁移"',
        'tags: ["Markdown", "开源"]',
        'topic: "产品设计"',
        '---',
        '',
        '# 本地优先',
        '',
        '正文内容',
      ].join('\n'),
      'local.md',
    )

    const markdown = serializeNoteToMarkdown(note)

    expect(note.title).toBe('本地优先')
    expect(note.tags).toEqual(['Markdown', '开源'])
    expect(markdown).toContain('正文内容')
    expect(markdown).toContain('topic: "产品设计"')
  })
})
