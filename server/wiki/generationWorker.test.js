// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryStore } from '../store/memoryStore.js'
import { createKnowledgeRetriever } from '../rag/retriever.js'
import { createWikiGenerationWorker } from './generationWorker.js'

async function setup() {
  const store = createMemoryStore()
  const user = await store.createUser({ email: 'wiki@example.com', passwordHash: 'hash' })
  const note = await store.createNote(user.id, { title: 'Source note', content: 'Exact evidence for the Wiki.' })
  const project = await store.createWikiProject(user.id, {
    title: 'Mine Wiki',
    topic: 'Source-grounded knowledge',
    scope: { noteIds: [note.id], topics: [], tags: [] },
  })
  return { store, user, note, project }
}

describe('Wiki generation worker', () => {
  afterEach(() => vi.useRealTimers())

  it('keeps the retrieved source version when the note changes during generation', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-07T00:00:00Z'))
    const { store, user, note, project } = await setup()
    const page = await store.createWikiPage(user.id, project.id, { title: 'Evidence' })
    await store.enqueueWikiJob(user.id, project.id, { kind: 'page', pageId: page.id })
    const worker = createWikiGenerationWorker({
      store,
      retriever: createKnowledgeRetriever({ store }),
      chatClient: { completeJSON: async () => {
        vi.setSystemTime(new Date('2026-09-07T00:00:01Z'))
        await store.updateNote(user.id, note.id, { content: 'The source changed.' })
        return {
          content: 'A grounded claim.[^fact]',
          citations: [{ key: 'fact', chunkId: `basic:${note.id}`, noteId: note.id, quote: note.content }],
        }
      } },
    })

    expect(await worker.runOnce()).toMatchObject({ status: 'ready' })
    const saved = (await store.getWikiProject(user.id, project.id)).pages[0]
    expect(saved.stale).toBe(true)
    expect(saved.citations[0].sourceUpdatedAt).toBe(note.updatedAt)
    expect(saved.citations[0].quote).toBe(note.content)
  })

  it('creates a validated outline before any page content', async () => {
    const { store, user, project } = await setup()
    await store.enqueueWikiJob(user.id, project.id, { kind: 'outline' })
    const worker = createWikiGenerationWorker({
      store,
      retriever: { retrieve: vi.fn(async () => ({
        retrievalMode: 'basic',
        coverage: { total: 1, ready: 1, pending: 0, processing: 0, failed: 0, missing: 0 },
        chunks: [{ id: 'chunk-1', noteId: 'note-1', title: 'Source', content: 'Evidence' }],
      })) },
      chatClient: { completeJSON: vi.fn(async () => ({ pages: [
        { title: 'Overview', summary: 'The main concepts.' },
        { title: 'Evidence', summary: 'The supporting material.' },
        { title: 'Workflow', summary: 'How the parts connect.' },
      ] })) },
    })

    expect(await worker.runOnce()).toMatchObject({ status: 'ready' })
    const detail = await store.getWikiProject(user.id, project.id)
    expect(detail.status).toBe('outline-ready')
    expect(detail.pages).toHaveLength(3)
    expect(detail.pages.every((page) => page.content === '' && page.status === 'planned')).toBe(true)
  })

  it('persists only exact cited evidence and derives internal links', async () => {
    const { store, user, note, project } = await setup()
    const overview = await store.createWikiPage(user.id, project.id, { title: 'Overview', summary: 'Summary' })
    const evidence = await store.createWikiPage(user.id, project.id, { title: 'Evidence', summary: 'Sources' })
    await store.enqueueWikiJob(user.id, project.id, { kind: 'page', pageId: overview.id })
    const sourceChunk = {
      id: `basic:${note.id}`,
      noteId: note.id,
      title: note.title,
      source: '',
      content: note.content,
    }
    const worker = createWikiGenerationWorker({
      store,
      retriever: { retrieve: vi.fn(async () => ({
        retrievalMode: 'basic',
        coverage: { total: 1, ready: 1, pending: 0, processing: 0, failed: 0, missing: 0 },
        chunks: [sourceChunk],
      })) },
      chatClient: { completeJSON: vi.fn(async () => ({
        content: `# Overview\n\nA grounded claim.[^fact]\n\nSee [Evidence](${evidence.slug}.md).`,
        citations: [{ key: 'fact', chunkId: sourceChunk.id, noteId: note.id, quote: note.content }],
      })) },
    })

    expect(await worker.runOnce()).toMatchObject({ status: 'ready' })
    const page = (await store.getWikiProject(user.id, project.id)).pages.find((item) => item.id === overview.id)
    expect(page.status).toBe('ready')
    expect(page.content).toMatch(/\[\^src-[0-9a-f-]+\]/)
    expect(page.citations).toEqual([expect.objectContaining({ noteId: note.id, quote: note.content })])
    expect(page.linkedPageIds).toEqual([evidence.id])
  })

  it('fails a page without storing hallucinated citations', async () => {
    const { store, user, project } = await setup()
    const page = await store.createWikiPage(user.id, project.id, { title: 'Overview', summary: 'Summary' })
    await store.enqueueWikiJob(user.id, project.id, { kind: 'page', pageId: page.id })
    const worker = createWikiGenerationWorker({
      store,
      retriever: { retrieve: vi.fn(async () => ({
        retrievalMode: 'basic',
        coverage: { total: 1, ready: 1, pending: 0, processing: 0, failed: 0, missing: 0 },
        chunks: [{ id: 'chunk-1', noteId: 'note-1', title: 'Source', source: '', content: 'Real evidence' }],
      })) },
      chatClient: { completeJSON: vi.fn(async () => ({
        content: 'Invented claim.[^fake]',
        citations: [{ key: 'fake', chunkId: 'chunk-1', noteId: 'note-1', quote: 'Invented evidence' }],
      })) },
    })

    expect(await worker.runOnce()).toMatchObject({ status: 'failed' })
    const stored = (await store.getWikiProject(user.id, project.id)).pages[0]
    expect(stored.status).toBe('failed')
    expect(stored.content).toBe('')
    expect(stored.citations).toEqual([])
  })
})
