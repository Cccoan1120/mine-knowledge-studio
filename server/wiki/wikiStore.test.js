// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryStore } from '../store/memoryStore.js'

describe('memory Wiki store', () => {
  afterEach(() => vi.useRealTimers())

  async function setupPage() {
    const store = createMemoryStore()
    const user = await store.createUser({ email: 'worker@example.com', passwordHash: 'hash' })
    const project = await store.createWikiProject(user.id, { title: 'Wiki', topic: 'Topic', scope: {} })
    const page = await store.createWikiPage(user.id, project.id, { title: 'Page' })
    return { store, user, project, page }
  }

  it('recovers an expired job, rejects the old lease, and terminates repeated expiry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-07T00:00:00Z'))
    const { store, user, project, page } = await setupPage()
    await store.enqueueWikiJob(user.id, project.id, { kind: 'page', pageId: page.id })
    const first = await store.claimNextWikiJob()
    expect(first.userId).toBe(user.id)
    expect(await store.claimNextWikiJob()).toBeNull()
    vi.setSystemTime(new Date('2026-09-07T00:05:01Z'))
    const recovered = await store.claimNextWikiJob()
    expect(recovered).toMatchObject({ id: first.id, attempts: 2 })
    expect(recovered.leaseToken).not.toBe(first.leaseToken)
    expect(await store.completeWikiPageJob(first, { content: 'Stale', citations: [] })).toBe(false)
    expect(await store.recordWikiJobFailure(first, { retryAt: null, errorCode: 'OLD_WORKER' })).toBe(false)
    vi.setSystemTime(new Date('2026-09-07T00:10:02Z'))
    expect(await store.claimNextWikiJob()).toBeNull()
    const detail = await store.getWikiProject(user.id, project.id)
    expect(detail.jobs[0]).toMatchObject({ status: 'failed', lastError: 'LEASE_EXPIRED' })
    expect(detail.pages[0]).toMatchObject({ status: 'failed', lastError: 'LEASE_EXPIRED' })
  })

  it('rejects stale edits and advances the page version within the same millisecond', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-07T00:00:00Z'))
    const { store, user, project, page } = await setupPage()
    const first = await store.updateWikiPage(user.id, project.id, page.id, {
      content: 'First', expectedUpdatedAt: page.updatedAt,
    })
    expect(new Date(first.updatedAt).getTime()).toBe(new Date(page.updatedAt).getTime() + 1)
    await expect(store.updateWikiPage(user.id, project.id, page.id, {
      content: 'Stale', expectedUpdatedAt: page.updatedAt,
    })).rejects.toMatchObject({ status: 409 })
    const next = await store.updateWikiPage(user.id, project.id, page.id, { content: 'Legacy caller' })
    expect(next.content).toBe('Legacy caller')
    expect(next.updatedAt > first.updatedAt).toBe(true)
  })

  it('preserves candidate generation time when a scope changes before acceptance', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-07T00:00:00Z'))
    const { store, user, project, page } = await setupPage()
    const generatedAt = new Date().toISOString()
    await store.saveGeneratedWikiPage(user.id, project.id, page.id, {
      content: 'Candidate', citations: [], generatedAt,
    }, { candidate: true })
    vi.setSystemTime(new Date('2026-09-07T00:00:01Z'))
    await store.updateWikiProject(user.id, project.id, { scope: { tags: ['new'] } })
    vi.setSystemTime(new Date('2026-09-07T00:00:02Z'))
    const accepted = await store.acceptWikiCandidate(user.id, project.id, page.id)
    expect(accepted.generatedAt).toBe(generatedAt)
    expect(accepted.stale).toBe(true)
  })

  it('isolates projects and persists an editable outline', async () => {
    const store = createMemoryStore()
    const owner = await store.createUser({ email: 'owner@example.com', passwordHash: 'hash' })
    const other = await store.createUser({ email: 'other@example.com', passwordHash: 'hash' })
    const project = await store.createWikiProject(owner.id, {
      title: 'LLM Wiki',
      topic: 'Source-grounded Wiki',
      scope: { noteIds: [], topics: [], tags: [] },
    })

    expect(project).toMatchObject({ pages: [], jobs: [], scope: { noteIds: [], topics: [], tags: [] } })

    await store.replaceWikiOutline(owner.id, project.id, [
      { title: 'Overview', summary: 'What the Wiki covers.' },
      { title: 'Retrieval', summary: 'How evidence is found.' },
    ])

    const detail = await store.getWikiProject(owner.id, project.id)
    expect(detail.pages.map((page) => page.title)).toEqual(['Overview', 'Retrieval'])
    expect(detail.pages.every((page) => page.status === 'planned')).toBe(true)
    expect(await store.getWikiProject(other.id, project.id)).toBeNull()
    expect(await store.listWikiProjects(other.id)).toEqual([])
  })

  it('marks generated pages stale without losing citation snapshots', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-07T00:00:00Z'))
    const store = createMemoryStore()
    const owner = await store.createUser({ email: 'citations@example.com', passwordHash: 'hash' })
    const note = await store.createNote(owner.id, { title: 'Source', content: 'Exact source evidence.' })
    const project = await store.createWikiProject(owner.id, {
      title: 'Cited Wiki',
      topic: 'Evidence',
      scope: { noteIds: [note.id], topics: [], tags: [] },
    })
    const page = await store.createWikiPage(owner.id, project.id, { title: 'Evidence', summary: 'Cited facts.' })
    await store.saveGeneratedWikiPage(owner.id, project.id, page.id, {
      content: 'A grounded claim.[^src-1]',
      citations: [{
        id: 'src-1',
        chunkId: `basic:${note.id}`,
        noteId: note.id,
        noteTitle: note.title,
        quote: 'Exact source evidence.',
        sourceUrl: '',
        sourceUpdatedAt: note.updatedAt,
      }],
      linkedPageIds: [],
    })

    expect((await store.getWikiProject(owner.id, project.id)).pages[0].stale).toBe(false)
    vi.setSystemTime(new Date('2026-09-07T00:00:01Z'))
    await store.updateNote(owner.id, note.id, { content: 'Updated source evidence.' })
    expect((await store.getWikiProject(owner.id, project.id)).pages[0].stale).toBe(true)

    await store.deleteNote(owner.id, note.id)
    const [citation] = (await store.getWikiProject(owner.id, project.id)).pages[0].citations
    expect(citation).toMatchObject({ noteId: null, noteTitle: 'Source', quote: 'Exact source evidence.', sourceMissing: true })
  })
})
