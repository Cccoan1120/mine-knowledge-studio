import { describe, expect, it } from 'vitest'
import { createWikiService, exportWikiMarkdown, exportWikiPageMarkdown } from './service.js'

const page = {
  id: 'page-1',
  title: '第一章',
  slug: 'first',
  position: 0,
  content: '参见[第二章](./second.md)。[^src-1]',
  citations: [
    { id: 'src-1', quote: '逐字引用', noteTitle: '来源素材', sourceUrl: 'https://example.com/source' },
    { id: 'unused', quote: '没有使用', noteTitle: '另一来源', sourceUrl: '' },
  ],
}

describe('Wiki Markdown export', () => {
  it('rewrites internal page links to anchors in a project export', () => {
    const markdown = exportWikiMarkdown({ title: '测试 Wiki', pages: [page] })

    expect(markdown).toContain('[第二章](#second)')
    expect(markdown).toContain('[^src-1]: 逐字引用 - [来源素材](https://example.com/source)')
    expect(markdown).not.toContain('没有使用')
  })

  it('keeps relative links and includes used footnotes in a page export', () => {
    const markdown = exportWikiPageMarkdown(page)

    expect(markdown).toContain('# 第一章')
    expect(markdown).toContain('[第二章](./second.md)')
    expect(markdown).toContain('[^src-1]: 逐字引用')
  })

  it('exports only a page owned by the requested project', async () => {
    const store = {
      getWikiProject: async () => ({ id: 'wiki-1', title: 'Wiki', pages: [page] }),
    }
    const service = createWikiService({ store, chatConfigured: true })

    expect(await service.exportPage('user-1', 'wiki-1', 'page-1')).toContain('# 第一章')
    expect(await service.exportPage('user-1', 'wiki-1', 'missing')).toBeNull()
  })
})
