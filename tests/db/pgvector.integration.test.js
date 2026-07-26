// @vitest-environment node

import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { hashContent } from '../../server/rag/hash.js'
import { createIndexingWorker } from '../../server/rag/indexingWorker.js'
import { createRagQuestionService } from '../../server/rag/questionService.js'
import { buildSearchTokens } from '../../server/rag/searchTokens.js'
import { createPrismaStore } from '../../server/store/prismaStore.js'
import {
  evaluationNotes,
  evaluationQuestions,
  fixtureEmbedding,
} from './fixtures/retrievalEvaluation.js'
import { verifyDisposableDatabase } from './databaseGuard.js'

const runDatabaseTests =
  process.env.MINE_RUN_DB_TESTS === '1' && Boolean(process.env.DATABASE_URL?.trim())
const describeDatabase = describe.skipIf(!runDatabaseTests)
const quietLogger = { log() {}, error() {} }

describeDatabase('live PostgreSQL and pgvector integration', () => {
  const clients = []
  let prisma
  let trackedUserIds = []

  beforeAll(async () => {
    prisma = await verifyDisposableDatabase({
      databaseUrl: process.env.DATABASE_URL,
      createClient,
    })
  })

  afterEach(async () => {
    if (trackedUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: trackedUserIds } } })
    }
    trackedUserIds = []
  })

  afterAll(async () => {
    await Promise.all(clients.map((client) => client.$disconnect()))
  })

  function createClient() {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
    const client = new PrismaClient({ adapter })
    clients.push(client)
    return client
  }

  async function createTestUser(store, label) {
    const nonce = randomUUID()
    const user = await store.createUser({
      email: `${label}-${nonce}@mine-db.test`,
      passwordHash: 'test-only-password-hash',
    })
    trackedUserIds.push(user.id)
    return user
  }

  it('deploys vector(1536), simple full-text GIN, and cosine HNSW schema objects', async () => {
    const extensions = await prisma.$queryRawUnsafe(
      `SELECT "extname" FROM "pg_extension" WHERE "extname" = 'vector'`,
    )
    const vectorColumns = await prisma.$queryRawUnsafe(`
      SELECT format_type(attribute.atttypid, attribute.atttypmod) AS "type"
      FROM pg_attribute AS attribute
      INNER JOIN pg_class AS relation ON relation.oid = attribute.attrelid
      INNER JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = current_schema()
        AND relation.relname = 'KnowledgeChunk'
        AND attribute.attname = 'embedding'
    `)
    const indexes = await prisma.$queryRawUnsafe(`
      SELECT "indexname", "indexdef"
      FROM "pg_indexes"
      WHERE "schemaname" = current_schema()
        AND "tablename" = 'KnowledgeChunk'
    `)
    const byName = new Map(indexes.map((index) => [index.indexname, index.indexdef]))

    expect(extensions).toEqual([{ extname: 'vector' }])
    expect(vectorColumns).toEqual([{ type: 'vector(1536)' }])
    expect(byName.get('KnowledgeChunk_searchTokens_gin_idx')).toContain('USING gin')
    expect(byName.get('KnowledgeChunk_searchTokens_gin_idx')).toContain(
      `to_tsvector('simple'::regconfig`,
    )
    expect(byName.get('KnowledgeChunk_embedding_hnsw_idx')).toContain('USING hnsw')
    expect(byName.get('KnowledgeChunk_embedding_hnsw_idx')).toContain('vector_cosine_ops')
  })

  it('inserts and retrieves real vectors with keyword, scope, and user isolation filters', async () => {
    const store = createPrismaStore({ prisma })
    const owner = await createTestUser(store, 'retrieval-owner')
    const other = await createTestUser(store, 'retrieval-other')
    const expected = await store.createNote(owner.id, {
      title: 'Aurora vector evidence',
      content: 'Aurora cosine evidence 支持向量检索和 keyword lookup。',
      topic: 'Research',
      tags: ['vector', 'trusted'],
    })
    const wrongTopic = await store.createNote(owner.id, {
      title: 'Archived Aurora evidence',
      content: 'Aurora cosine evidence 支持向量检索和 keyword lookup。',
      topic: 'Archive',
      tags: ['vector'],
    })
    const wrongTag = await store.createNote(owner.id, {
      title: 'Untrusted Aurora evidence',
      content: 'Aurora cosine evidence 支持向量检索和 keyword lookup。',
      topic: 'Research',
      tags: ['untrusted'],
    })
    const privateNote = await store.createNote(other.id, {
      title: 'Private Aurora evidence',
      content: 'Aurora cosine evidence 支持向量检索和 keyword lookup。',
      topic: 'Research',
      tags: ['vector', 'trusted'],
    })
    const embeddingClient = { embed: async (inputs) => inputs.map(fixtureEmbedding) }
    const worker = createIndexingWorker({ store, embeddingClient, logger: quietLogger })
    await drainWorker(worker, 4)
    const privateChunkIds = new Set(
      (await prisma.knowledgeChunk.findMany({
        where: { noteId: privateNote.id },
        select: { id: true },
      })).map((chunk) => chunk.id),
    )
    const question = 'Aurora cosine 向量检索'
    const retrieve = (scope) => store.retrieveKnowledgeCandidates({
      userId: owner.id,
      searchTokens: buildSearchTokens(question),
      queryEmbedding: fixtureEmbedding(question),
      scope,
      denseLimit: 5,
      keywordLimit: 5,
    })

    const unfiltered = await retrieve({ noteIds: [], topics: [], tags: [] })
    for (const candidates of [unfiltered.dense, unfiltered.keyword]) {
      expect(new Set(candidates.map((chunk) => chunk.noteId))).toEqual(
        new Set([expected.id, wrongTopic.id, wrongTag.id]),
      )
      expect(candidates.some((chunk) => privateChunkIds.has(chunk.id))).toBe(false)
    }

    const noteFiltered = await retrieve({ noteIds: [expected.id], topics: [], tags: [] })
    for (const candidates of [noteFiltered.dense, noteFiltered.keyword]) {
      expect(candidates.map((chunk) => chunk.noteId)).toEqual([expected.id])
    }

    const topicFiltered = await retrieve({ noteIds: [], topics: ['Research'], tags: [] })
    for (const candidates of [topicFiltered.dense, topicFiltered.keyword]) {
      expect(new Set(candidates.map((chunk) => chunk.noteId))).toEqual(
        new Set([expected.id, wrongTag.id]),
      )
    }

    const tagFiltered = await retrieve({ noteIds: [], topics: [], tags: ['vector'] })
    for (const candidates of [tagFiltered.dense, tagFiltered.keyword]) {
      expect(new Set(candidates.map((chunk) => chunk.noteId))).toEqual(
        new Set([expected.id, wrongTopic.id]),
      )
    }
  })

  it('claims distinct concurrent jobs and lets a fresh store claim pre-existing work', async () => {
    const firstStore = createPrismaStore({ prisma })
    const secondStore = createPrismaStore({ prisma: createClient() })
    const user = await createTestUser(firstStore, 'claim-owner')
    const first = await firstStore.createNote(user.id, { title: 'First', content: 'first claim content' })
    const second = await firstStore.createNote(user.id, { title: 'Second', content: 'second claim content' })

    const [firstClaim, secondClaim] = await Promise.all([
      firstStore.claimNextIndexJob(),
      secondStore.claimNextIndexJob(),
    ])

    expect(new Set([firstClaim.noteId, secondClaim.noteId])).toEqual(new Set([first.id, second.id]))
    expect(firstClaim.id).not.toBe(secondClaim.id)
    expect(firstClaim.leaseToken).not.toBe(secondClaim.leaseToken)

    const preExisting = await firstStore.createNote(user.id, {
      title: 'Before fresh store',
      content: 'pending before the fresh store starts',
    })
    const freshStore = createPrismaStore({ prisma: createClient() })
    const preExistingJob = await prisma.knowledgeIndexJob.findUnique({
      where: { noteId: preExisting.id },
      select: { id: true },
    })
    const freshWorker = createIndexingWorker({
      store: freshStore,
      embeddingClient: { embed: async (inputs) => inputs.map(fixtureEmbedding) },
      logger: quietLogger,
    })
    const freshResult = await freshWorker.runOnce()

    expect(freshResult).toEqual({ status: 'ready', jobId: preExistingJob.id })
  })

  it('fences stale edits, replaces current chunks, cascades deletes, and scopes retry by user', async () => {
    const store = createPrismaStore({ prisma })
    const owner = await createTestUser(store, 'lifecycle-owner')
    const other = await createTestUser(store, 'lifecycle-other')
    const note = await store.createNote(owner.id, { title: 'Lifecycle', content: 'version one content' })
    const worker = createIndexingWorker({
      store,
      embeddingClient: { embed: async (inputs) => inputs.map(fixtureEmbedding) },
      logger: quietLogger,
    })

    await expect(worker.runOnce()).resolves.toMatchObject({ status: 'ready' })
    await store.updateNote(owner.id, note.id, { content: 'version two content' })
    const staleClaim = await store.claimNextIndexJob()
    await store.updateNote(owner.id, note.id, { content: 'version three current content' })

    const staleReplacement = await store.replaceIndexChunks(staleClaim, [
      chunkFor(staleClaim, 'version two content', fixtureEmbedding('version two content')),
    ])
    expect(staleReplacement).toBe(false)
    expect(await chunkContents(prisma, note.id)).toEqual(['version one content'])

    await expect(worker.runOnce()).resolves.toMatchObject({ status: 'ready' })
    expect(await chunkContents(prisma, note.id)).toEqual(['version three current content'])
    const currentChunks = await prisma.knowledgeChunk.findMany({ where: { noteId: note.id } })
    expect(currentChunks.every((chunk) => chunk.contentHash === hashContent('version three current content'))).toBe(true)

    await expect(store.deleteNote(owner.id, note.id)).resolves.toBe(true)
    expect(await prisma.knowledgeChunk.count({ where: { noteId: note.id } })).toBe(0)
    expect(await prisma.knowledgeIndexJob.count({ where: { noteId: note.id } })).toBe(0)

    const ownerFailed = await store.createNote(owner.id, { title: 'Owner failed', content: 'owner retry' })
    const otherFailed = await store.createNote(other.id, { title: 'Other failed', content: 'other retry' })
    await prisma.knowledgeIndexJob.updateMany({
      where: { noteId: { in: [ownerFailed.id, otherFailed.id] } },
      data: { status: 'failed', attempts: 4, lastError: 'Indexing failed.' },
    })

    await expect(store.retryFailedIndexJobs(owner.id)).resolves.toBe(1)
    const retryStates = await prisma.knowledgeIndexJob.findMany({
      where: { noteId: { in: [ownerFailed.id, otherFailed.id] } },
      select: { noteId: true, status: true, attempts: true },
    })
    expect(retryStates).toEqual(expect.arrayContaining([
      { noteId: ownerFailed.id, status: 'pending', attempts: 0 },
      { noteId: otherFailed.id, status: 'failed', attempts: 4 },
    ]))
  })

  it('keeps hand-authored expected evidence in the top five for at least 90 percent', async () => {
    expect(evaluationNotes).toHaveLength(30)
    expect(evaluationQuestions).toHaveLength(20)

    const store = createPrismaStore({ prisma })
    const owner = await createTestUser(store, 'evaluation-owner')
    const other = await createTestUser(store, 'evaluation-other')
    const noteIds = new Map()
    for (const fixture of evaluationNotes) {
      const note = await store.createNote(owner.id, fixture)
      noteIds.set(fixture.key, note.id)
    }
    await store.createNote(other.id, {
      ...evaluationNotes[0],
      title: 'Private duplicate',
    })

    const embeddingClient = {
      embed: async (inputs) => inputs.map(fixtureEmbedding),
    }
    const worker = createIndexingWorker({ store, embeddingClient, logger: quietLogger })
    await drainWorker(worker, evaluationNotes.length + 1)

    const sourceChunks = await prisma.knowledgeChunk.findMany({
      where: { userId: { in: [owner.id, other.id] } },
      select: { id: true, userId: true, ordinal: true, content: true },
    })
    const sourceByChunkId = new Map(sourceChunks.map((chunk) => [chunk.id, chunk]))
    const otherChunkIds = new Set(
      sourceChunks.filter((chunk) => chunk.userId === other.id).map((chunk) => chunk.id),
    )
    const service = createRagQuestionService({
      store,
      embeddingClient,
      logger: quietLogger,
    })

    let hits = 0
    for (const fixture of evaluationQuestions) {
      const rawCandidates = await store.retrieveKnowledgeCandidates({
        userId: owner.id,
        searchTokens: buildSearchTokens(fixture.question),
        queryEmbedding: fixtureEmbedding(fixture.question),
        scope: { noteIds: [], topics: [], tags: [] },
        denseLimit: 30,
        keywordLimit: 30,
      })
      for (const candidates of [rawCandidates.dense, rawCandidates.keyword]) {
        expect(candidates.some((candidate) => otherChunkIds.has(candidate.id))).toBe(false)
      }

      const result = await service.ask({
        userId: owner.id,
        question: fixture.question,
        history: [],
        scope: { noteIds: [], topics: [], tags: [] },
      })
      const expectedNoteId = noteIds.get(fixture.expectedKey)
      const expectedCitation = result.citations
        .slice(0, 5)
        .find((citation) => citation.noteId === expectedNoteId)
      const expectedSource = sourceByChunkId.get(expectedCitation?.chunkId)
      if (
        expectedCitation?.quote.includes(fixture.expectedQuote)
        && expectedSource?.content.includes(fixture.expectedQuote)
        && expectedSource.ordinal === fixture.expectedOrdinal
      ) {
        hits += 1
      }

      for (const citation of result.citations) {
        const source = sourceByChunkId.get(citation.chunkId)
        expect(source?.content).toContain(citation.quote)
        expect(otherChunkIds.has(citation.chunkId)).toBe(false)
      }
    }

    expect(hits / evaluationQuestions.length).toBeGreaterThanOrEqual(0.9)
  })
})

async function drainWorker(worker, expectedJobs) {
  for (let index = 0; index < expectedJobs; index += 1) {
    const result = await worker.runOnce()
    expect(result.status).not.toBe('idle')
  }
  await expect(worker.runOnce()).resolves.toEqual({ status: 'idle' })
}

function chunkFor(job, content, embedding) {
  return {
    ordinal: 0,
    headingPath: [],
    content,
    startOffset: 0,
    endOffset: content.length,
    tokenCount: content.split(/\s+/).length,
    contentHash: job.contentHash,
    searchTokens: buildSearchTokens(content),
    indexVersion: 1,
    embedding,
  }
}

async function chunkContents(prisma, noteId) {
  const chunks = await prisma.knowledgeChunk.findMany({
    where: { noteId },
    orderBy: { ordinal: 'asc' },
    select: { content: true },
  })
  return chunks.map((chunk) => chunk.content)
}
