import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Note, WikiProject } from '../types'
import { WikiWorkspace } from './WikiWorkspace'

const wikiMocks = vi.hoisted(() => ({
  acceptWikiCandidate: vi.fn(),
  createWikiPage: vi.fn(),
  createWikiProject: vi.fn(),
  deleteWikiPage: vi.fn(),
  deleteWikiProject: vi.fn(),
  discardWikiCandidate: vi.fn(),
  exportWikiPage: vi.fn(),
  exportWikiProject: vi.fn(),
  generateWikiOutline: vi.fn(),
  generateWikiPages: vi.fn(),
  getWikiProject: vi.fn(),
  listWikiProjects: vi.fn(),
  refreshWikiPage: vi.fn(),
  updateWikiPage: vi.fn(),
}))

vi.mock('../services/wikiService', () => wikiMocks)

const note: Note = {
  id: 'note-1',
  title: '来源素材',
  content: '这是逐字引用。',
  summary: '',
  tags: ['研究'],
  topic: '创作',
  source: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  relatedNoteIds: [],
}

const project: WikiProject = {
  id: 'wiki-1',
  title: '内容手册',
  topic: '如何复用内容',
  status: 'ready',
  pageCount: 1,
  readyPageCount: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  scope: { noteIds: [], topics: [], tags: [] },
  jobs: [],
  pages: [{
    id: 'page-1',
    projectId: 'wiki-1',
    title: '第一章',
    slug: 'first',
    summary: '页面摘要',
    content: '正文内容。[^src-1]',
    position: 0,
    status: 'ready',
    lastError: null,
    generatedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    citations: [{
      id: 'src-1',
      chunkId: 'chunk-1',
      noteId: 'note-1',
      noteTitle: '来源素材',
      quote: '这是逐字引用。',
      sourceUrl: '',
      sourceUpdatedAt: '2026-01-01T00:00:00.000Z',
      sourceMissing: false,
    }],
    linkedPageIds: [],
    backlinkPageIds: [],
    stale: false,
    sourceMissing: false,
    hasCandidate: false,
    candidateData: null,
  }],
}

beforeEach(() => {
  vi.clearAllMocks()
  wikiMocks.listWikiProjects.mockResolvedValue([project])
  wikiMocks.getWikiProject.mockResolvedValue(project)
  wikiMocks.createWikiProject.mockResolvedValue(project)
  wikiMocks.generateWikiOutline.mockResolvedValue({})
})

describe('WikiWorkspace', () => {
  it('finishes pending edits before leaving the workspace', async () => {
    const onOpenLibrary = vi.fn()
    let complete!: (page: WikiProject['pages'][number]) => void
    wikiMocks.updateWikiPage.mockImplementation(() => new Promise(resolve => { complete = resolve }))
    render(<WikiWorkspace notes={[note]} onOpenLibrary={onOpenLibrary} onOpenSource={vi.fn()} />)
    await screen.findByDisplayValue('第一章')
    fireEvent.click(screen.getByRole('tab', { name: '编辑' }))
    fireEvent.change(await screen.findByRole('textbox', { name: '正文' }), { target: { value: '新的正文' } })
    fireEvent.click(screen.getByRole('button', { name: '素材库' }))
    await waitFor(() => expect(wikiMocks.updateWikiPage).toHaveBeenCalled())
    expect(onOpenLibrary).not.toHaveBeenCalled()
    complete({ ...project.pages[0], content: '新的正文', updatedAt: '2026-01-02T00:00:00.000Z' })
    await waitFor(() => expect(onOpenLibrary).toHaveBeenCalledOnce())
  })

  it('keeps the editor and its draft when saving fails during navigation', async () => {
    const onOpenLibrary = vi.fn()
    wikiMocks.updateWikiPage.mockRejectedValue(new Error('offline'))
    render(<WikiWorkspace notes={[note]} onOpenLibrary={onOpenLibrary} onOpenSource={vi.fn()} />)
    await screen.findByDisplayValue('第一章')
    fireEvent.click(screen.getByRole('tab', { name: '编辑' }))
    fireEvent.change(await screen.findByRole('textbox', { name: '正文' }), { target: { value: '未保存草稿' } })
    fireEvent.click(screen.getByRole('button', { name: '素材库' }))
    await screen.findByRole('button', { name: '重试保存' })
    expect(onOpenLibrary).not.toHaveBeenCalled()
    expect((screen.getByRole('textbox', { name: '正文' }) as HTMLTextAreaElement).value).toBe('未保存草稿')
  })

  it('opens a verified citation in the source library', async () => {
    const onOpenSource = vi.fn()
    render(<WikiWorkspace notes={[note]} onOpenLibrary={vi.fn()} onOpenSource={onOpenSource} />)

    await screen.findByDisplayValue('第一章')
    fireEvent.click(screen.getByRole('button', { name: /来源素材/ }))

    await waitFor(() => expect(onOpenSource).toHaveBeenCalledWith('note-1', '这是逐字引用。'))
  })

  it('creates a Wiki with an explicit topic scope', async () => {
    wikiMocks.listWikiProjects.mockResolvedValue([])
    render(<WikiWorkspace notes={[note]} onOpenLibrary={vi.fn()} onOpenSource={vi.fn()} />)

    fireEvent.change(await screen.findByPlaceholderText('例如：内容复用手册'), { target: { value: '创作 Wiki' } })
    fireEvent.change(screen.getByPlaceholderText('说明这个 Wiki 要回答的问题'), { target: { value: '梳理创作方法' } })
    fireEvent.click(screen.getByRole('button', { name: '主题' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '创作' }))
    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => expect(wikiMocks.createWikiProject).toHaveBeenCalledWith({
      title: '创作 Wiki',
      topic: '梳理创作方法',
      scope: { noteIds: [], topics: ['创作'], tags: [] },
    }))
  })

  it('queues an outline before page generation', async () => {
    const draft = { ...project, status: 'draft' as const, pageCount: 0, readyPageCount: 0, pages: [] }
    wikiMocks.listWikiProjects.mockResolvedValue([draft])
    wikiMocks.getWikiProject.mockResolvedValue(draft)
    render(<WikiWorkspace notes={[note]} onOpenLibrary={vi.fn()} onOpenSource={vi.fn()} />)

    fireEvent.click(await screen.findByRole('button', { name: '生成目录' }))
    await waitFor(() => expect(wikiMocks.generateWikiOutline).toHaveBeenCalledWith('wiki-1'))
    expect(wikiMocks.generateWikiPages).not.toHaveBeenCalled()
  })
})
