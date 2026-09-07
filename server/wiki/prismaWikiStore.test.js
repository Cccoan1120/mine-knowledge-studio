// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPrismaWikiStore } from './prismaWikiStore.js'
import { createWikiGenerationWorker } from './generationWorker.js'

const now = new Date('2026-07-29T08:00:00.000Z')
const project = {
  id: 'wiki-1',
  userId: 'user-1',
  title: 'Wiki',
  topic: 'Topic',
  scope: { noteIds: [], topics: [], tags: [] },
  scopeUpdatedAt: now,
  createdAt: now,
  updatedAt: now,
}

const page = {
  id: 'page-1',
  projectId: 'wiki-1',
  title: 'Topic',
  slug: 'topic',
  summary: '',
  content: '',
  position: 0,
  status: 'planned',
  lastError: null,
  generatedAt: null,
  candidateData: null,
  createdAt: now,
  updatedAt: now,
}

describe('Prisma Wiki store', () => {
  afterEach(() => vi.useRealTimers())
  it('passes the database owner through the claimed job into real worker retrieval', async () => {
    const job = { id: 'job-1', userId: 'user-1', projectId: project.id, kind: 'outline', pageId: null, status: 'processing', attempts: 1, leaseToken: 'lease-1', createdAt: now, updatedAt: now }
    const transaction = {
      $executeRawUnsafe: vi.fn(async () => 0),
      $queryRawUnsafe: vi.fn(async () => [job]),
      wikiPage: { deleteMany: vi.fn(), create: vi.fn() },
      wikiGenerationJob: { update: vi.fn() },
    }
    const prisma = {
      $transaction: async (callback) => callback(transaction),
      wikiGenerationJob: { findFirst: async () => job },
      wikiProject: { findFirst: async () => ({ ...project, pages: [], jobs: [job] }) },
    }
    const retrieve = vi.fn(async () => ({ coverage: { total: 1, ready: 1 }, chunks: [{ id: 'c', content: 'Evidence' }] }))
    const worker = createWikiGenerationWorker({
      store: createPrismaWikiStore(prisma), retriever: { retrieve },
      chatClient: { completeJSON: async () => ({ pages: ['One', 'Two', 'Three'].map((title) => ({ title, summary: 'Summary' })) }) },
    })
    expect(await worker.runOnce()).toMatchObject({ status: 'ready' })
    expect(retrieve).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1' }))
    expect(transaction.$queryRawUnsafe.mock.calls[1][0]).toContain('FOR UPDATE')
  })

  it('does not write page output when the lease has been replaced', async () => {
    const transaction = { $queryRawUnsafe: vi.fn(async () => []), wikiPage: { update: vi.fn() } }
    const store = createPrismaWikiStore({ $transaction: async (callback) => callback(transaction) })
    expect(await store.completeWikiPageJob({ id: 'job', pageId: 'page', leaseToken: 'old' }, { content: 'Old' })).toBe(false)
    expect(transaction.wikiPage.update).not.toHaveBeenCalled()
  })

  it('compares the page version atomically and returns complete citation metadata', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const saved = { ...page, content: 'New', citations: [{ id: 'c', noteId: 'n', sourceUpdatedAt: now, note: { updatedAt: now } }], outgoingLinks: [{ toPageId: 'other' }], incomingLinks: [] }
    const transaction = { wikiPage: {
      updateMany: vi.fn(async () => ({ count: 1 })), findUnique: vi.fn(async () => saved),
    } }
    const store = createPrismaWikiStore({
      wikiPage: { findFirst: async () => ({ ...page, project }) },
      $transaction: async (callback) => callback(transaction),
    })
    const result = await store.updateWikiPage('user-1', project.id, page.id, { content: 'New', expectedUpdatedAt: now.toISOString() })
    expect(transaction.wikiPage.updateMany).toHaveBeenCalledWith({ where: { id: page.id, updatedAt: now }, data: expect.objectContaining({ content: 'New' }) })
    expect(transaction.wikiPage.updateMany.mock.calls[0][0].data.updatedAt.getTime()).toBe(now.getTime() + 1)
    expect(result.citations).toHaveLength(1)
    expect(result.linkedPageIds).toEqual(['other'])
    transaction.wikiPage.updateMany.mockResolvedValue({ count: 0 })
    await expect(store.updateWikiPage('user-1', project.id, page.id, { content: 'Lost race' })).rejects.toMatchObject({ status: 409 })
  })

  it('checks nested project ownership before updating a page', async () => {
    const prisma = {
      wikiPage: {
        findFirst: vi.fn(async () => null),
        update: vi.fn(),
      },
    }
    const store = createPrismaWikiStore(prisma)

    await expect(store.updateWikiPage('other-user', 'wiki-1', 'page-1', { title: 'Changed' })).resolves.toBeNull()
    expect(prisma.wikiPage.findFirst).toHaveBeenCalledWith({
      where: { id: 'page-1', projectId: 'wiki-1', project: { userId: 'other-user' } },
      include: { project: true },
    })
    expect(prisma.wikiPage.update).not.toHaveBeenCalled()
  })

  it('creates a uniquely slugged page at the end of the outline', async () => {
    const created = { ...page, id: 'page-3', slug: 'topic-3', position: 2 }
    const prisma = {
      wikiProject: { findFirst: vi.fn(async () => project) },
      wikiPage: {
        findMany: vi.fn(async () => [{ slug: 'topic' }, { slug: 'topic-2' }]),
        count: vi.fn(async () => 2),
        create: vi.fn(async () => created),
      },
    }
    const store = createPrismaWikiStore(prisma)

    const result = await store.createWikiPage('user-1', 'wiki-1', { title: 'Topic', summary: 'Summary' })

    expect(result).toEqual(expect.objectContaining({ id: 'page-3', slug: 'topic-3', position: 2 }))
    expect(prisma.wikiPage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ projectId: 'wiki-1', title: 'Topic', slug: 'topic-3', position: 2 }),
    })
  })

  it('writes generated citations and only validated project links in one transaction', async () => {
    const generatedPage = {
      ...page,
      content: 'Grounded.[^src-1]',
      status: 'ready',
      generatedAt: now,
      citations: [],
      outgoingLinks: [],
      incomingLinks: [],
    }
    const transaction = {
      wikiPage: {
        findFirst: vi.fn(async () => ({ ...page, project })),
        findMany: vi.fn(async () => [{ id: 'page-2' }]),
        update: vi.fn(async () => generatedPage),
      },
      wikiCitation: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async () => ({ count: 1 })),
      },
      wikiPageLink: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async () => ({ count: 1 })),
      },
    }
    const prisma = {
      $transaction: vi.fn(async (callback) => callback(transaction)),
      wikiProject: {
        findFirst: vi.fn(async () => ({ ...project, pages: [generatedPage], jobs: [] })),
      },
    }
    const store = createPrismaWikiStore(prisma)
    const output = {
      content: 'Grounded.[^src-1]',
      citations: [{
        id: 'src-1',
        noteId: 'note-1',
        chunkId: 'chunk-1',
        noteTitle: 'Source',
        quote: 'Grounded.',
        sourceUrl: '',
        sourceUpdatedAt: now.toISOString(),
      }],
      linkedPageIds: ['page-2', 'missing-page'],
    }

    await store.saveGeneratedWikiPage('user-1', 'wiki-1', 'page-1', output)

    expect(transaction.wikiCitation.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ id: 'src-1', pageId: 'page-1', noteId: 'note-1', chunkId: 'chunk-1' })],
    })
    expect(transaction.wikiPage.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['page-2', 'missing-page'] }, projectId: 'wiki-1' },
      select: { id: true },
    })
    expect(transaction.wikiPageLink.createMany).toHaveBeenCalledWith({
      data: [{ fromPageId: 'page-1', toPageId: 'page-2' }],
      skipDuplicates: true,
    })
  })
})
