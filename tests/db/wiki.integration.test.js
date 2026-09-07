// @vitest-environment node

import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createPrismaStore } from '../../server/store/prismaStore.js'
import { createWikiGenerationWorker } from '../../server/wiki/generationWorker.js'
import { verifyDisposableDatabase } from './databaseGuard.js'

const enabled = process.env.MINE_RUN_DB_TESTS === '1' && Boolean(process.env.DATABASE_URL?.trim())

describe.skipIf(!enabled)('PostgreSQL Wiki job and edit contracts', () => {
  let prisma
  let store
  const clients = []
  const userIds = []

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client')
    prisma = await verifyDisposableDatabase({
      databaseUrl: process.env.DATABASE_URL,
      createClient() {
        const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
        clients.push(client)
        return client
      },
    })
    store = createPrismaStore({ prisma })
  })

  afterEach(async () => {
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } })
  })

  afterAll(async () => {
    await Promise.all(clients.map((client) => client.$disconnect()))
  })

  async function setup() {
    const user = await store.createUser({ email: `wiki-${randomUUID()}@mine-db.test`, passwordHash: 'test-only' })
    userIds.push(user.id)
    const project = await store.createWikiProject(user.id, { title: 'Wiki', topic: 'Evidence', scope: { noteIds: [], tags: [], topics: [] } })
    const page = await store.createWikiPage(user.id, project.id, { title: 'Evidence' })
    return { user, project, page }
  }

  it('recovers abandoned leases and fences old success/failure before exhausting attempts', async () => {
    const { user, project, page } = await setup()
    await store.enqueueWikiJob(user.id, project.id, { kind: 'page', pageId: page.id })
    const first = await store.claimNextWikiJob()
    expect(first).toMatchObject({ userId: user.id, attempts: 1 })
    await prisma.wikiGenerationJob.update({ where: { id: first.id }, data: { lockedAt: new Date(Date.now() - 6 * 60_000) } })
    const second = await store.claimNextWikiJob()
    expect(second).toMatchObject({ id: first.id, userId: user.id, attempts: 2 })
    expect(second.leaseToken).not.toBe(first.leaseToken)
    expect(await store.completeWikiPageJob(first, { content: 'Old', citations: [] })).toBe(false)
    expect(await store.recordWikiJobFailure(first, { retryAt: null, errorCode: 'OLD_WORKER' })).toBe(false)
    await prisma.wikiGenerationJob.update({ where: { id: first.id }, data: { lockedAt: new Date(Date.now() - 6 * 60_000) } })
    expect(await store.claimNextWikiJob()).toBeNull()
    const detail = await store.getWikiProject(user.id, project.id)
    expect(detail.jobs[0]).toMatchObject({ status: 'failed', lastError: 'LEASE_EXPIRED' })
    expect(detail.pages[0]).toMatchObject({ status: 'failed', lastError: 'LEASE_EXPIRED' })
    expect(await store.completeWikiPageJob(second, { content: 'Too late', citations: [] })).toBe(false)
  })

  it('allows exactly one concurrent save against the same version', async () => {
    const { user, project, page } = await setup()
    const attempts = await Promise.allSettled(['First', 'Second'].map((content) => store.updateWikiPage(user.id, project.id, page.id, {
      content, expectedUpdatedAt: page.updatedAt,
    })))
    const succeeded = attempts.filter((item) => item.status === 'fulfilled')
    const failed = attempts.filter((item) => item.status === 'rejected')
    expect(succeeded).toHaveLength(1)
    expect(failed).toHaveLength(1)
    expect(failed[0].reason.status).toBe(409)
    const saved = (await store.getWikiProject(user.id, project.id)).pages[0]
    expect(saved.content).toBe(succeeded[0].value.content)
    expect(new Date(saved.updatedAt) > new Date(page.updatedAt)).toBe(true)
  })

  it('uses the claimed owner and persists the source version used before model completion', async () => {
    const { user, project, page } = await setup()
    const note = await prisma.note.create({ data: { userId: user.id, title: 'Evidence', content: 'Original evidence.' } })
    const sourceUpdatedAt = note.updatedAt.toISOString()
    await store.enqueueWikiJob(user.id, project.id, { kind: 'page', pageId: page.id })
    const worker = createWikiGenerationWorker({
      store,
      retriever: { retrieve: async ({ userId }) => {
        expect(userId).toBe(user.id)
        return {
          coverage: { total: 1, ready: 1 },
          chunks: [{ id: 'test-chunk', noteId: note.id, title: note.title, content: note.content, sourceUpdatedAt }],
        }
      } },
      chatClient: { completeJSON: async () => {
        await prisma.note.update({ where: { id: note.id }, data: { content: 'Changed evidence.', updatedAt: new Date(new Date(note.updatedAt).getTime() + 1000) } })
        return { content: 'Original evidence.[^fact]', citations: [{ key: 'fact', chunkId: 'test-chunk', noteId: note.id, quote: note.content }] }
      } },
    })
    expect(await worker.runOnce()).toMatchObject({ status: 'ready' })
    const saved = (await store.getWikiProject(user.id, project.id)).pages[0]
    expect(saved.stale).toBe(true)
    expect(saved.citations[0].sourceUpdatedAt).toBe(sourceUpdatedAt)
  })
})
