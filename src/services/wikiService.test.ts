import { beforeEach, describe, expect, it, vi } from 'vitest'
import { exportWikiPage, generateWikiPages, listWikiProjects, updateWikiPage } from './wikiService'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('wikiService', () => {
  it('uses the authenticated Wiki endpoints and JSON contracts', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ projects: [{ id: 'wiki-1' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ page: { id: 'page-1' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ jobs: [] }), { status: 202 }))

    expect(await listWikiProjects()).toEqual([{ id: 'wiki-1' }])
    await updateWikiPage('wiki/1', 'page/1', { title: '标题' })
    await generateWikiPages('wiki/1', ['page/1'])

    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/wikis/wiki%2F1/pages/page%2F1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ title: '标题' }),
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/wikis/wiki%2F1/pages/generate', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ pageIds: ['page/1'] }),
    }))
  })

  it('returns Markdown exports and surfaces API errors', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('# 页面', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: '页面不存在' }), { status: 404 }))

    await expect(exportWikiPage('wiki-1', 'page-1')).resolves.toBe('# 页面')
    await expect(listWikiProjects()).rejects.toThrow('页面不存在')
  })
})
