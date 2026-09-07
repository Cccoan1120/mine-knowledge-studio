import { selectContext } from './context.js'
import { fuseRankings } from './rrf.js'
import { buildSearchTokens } from './searchTokens.js'

const DEFAULT_SCOPE = { noteIds: [], topics: [], tags: [] }

export function createKnowledgeRetriever({
  store,
  embeddingClient,
  embeddingEnabled = true,
  logger,
  clock = () => Date.now(),
}) {
  return {
    async retrieve({ userId, query, scope = DEFAULT_SCOPE, includeCoverage = false }) {
      if (typeof userId !== 'string' || !userId.trim()) throw new Error('Knowledge retrieval requires a user.')
      if (store.storageMode !== 'postgres') {
        return retrieveBasic({ store, userId, query, scope, includeCoverage })
      }

      const startedAt = clock()
      const searchTokens = buildSearchTokens(query)
      const queryEmbedding = embeddingEnabled ? await embedQuery(embeddingClient, query) : undefined
      let dense
      let keyword
      try {
        ({ dense, keyword } = await store.retrieveKnowledgeCandidates({
          userId,
          searchTokens,
          queryEmbedding,
          scope,
          denseLimit: 30,
          keywordLimit: 30,
        }))
      } catch (error) {
        emitMetric(logger, {
          event: 'knowledge_retrieval',
          outcome: 'failed',
          durationMs: elapsedMs(clock, startedAt),
          retrievalMode: retrievalModeFor(queryEmbedding, searchTokens),
          denseCandidateCount: 0,
          keywordCandidateCount: 0,
          contextCount: 0,
          failureCategory: 'retrieval_failed',
        })
        throw error
      }

      const chunks = selectContext(fuseRankings(dense, keyword))
      const retrievalMode = retrievalModeFor(queryEmbedding, searchTokens)
      const coverage = includeCoverage && typeof store.getIndexCoverage === 'function'
        ? await store.getIndexCoverage(userId, scope)
        : null
      emitMetric(logger, {
        event: 'knowledge_retrieval',
        outcome: 'success',
        durationMs: elapsedMs(clock, startedAt),
        retrievalMode,
        denseCandidateCount: dense.length,
        keywordCandidateCount: keyword.length,
        contextCount: chunks.length,
        failureCategory: null,
      })
      return { chunks, retrievalMode, coverage }
    },
  }
}

async function retrieveBasic({ store, userId, query, scope, includeCoverage }) {
  const notes = (await store.listNotes(userId)).filter((note) => noteMatchesScope(note, scope))
  const chunks = notes
    .map((note) => ({ note, score: basicScore(query, note) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || right.note.updatedAt.localeCompare(left.note.updatedAt))
    .slice(0, 8)
    .map(({ note, score }) => ({
      id: `basic:${note.id}`,
      noteId: note.id,
      ordinal: 0,
      title: note.title,
      source: note.source,
      sourceUpdatedAt: note.updatedAt,
      headingPath: [],
      content: note.content.slice(0, 12_000),
      startOffset: 0,
      endOffset: Math.min(note.content.length, 12_000),
      score,
    }))
  return {
    chunks,
    retrievalMode: 'basic',
    coverage: includeCoverage ? {
      total: notes.length,
      pending: 0,
      processing: 0,
      ready: notes.length,
      failed: 0,
      missing: 0,
    } : null,
  }
}

async function embedQuery(embeddingClient, query) {
  if (!embeddingClient) return undefined
  try {
    const [embedding] = await embeddingClient.embed([query])
    return Array.isArray(embedding) && embedding.length === 1536 ? embedding : undefined
  } catch {
    return undefined
  }
}

function noteMatchesScope(note, scope) {
  if (scope.noteIds?.length && !scope.noteIds.includes(note.id)) return false
  if (scope.topics?.length && !scope.topics.includes(note.topic)) return false
  if (scope.tags?.length && !scope.tags.some((tag) => note.tags.includes(tag))) return false
  return true
}

function basicScore(query, note) {
  const terms = buildSearchTokens(query).split(/\s+/).filter(Boolean)
  const title = note.title.toLowerCase()
  const body = `${note.summary} ${note.content} ${note.tags.join(' ')} ${note.topic}`.toLowerCase()
  return terms.reduce((score, term) => score + (title.includes(term) ? 3 : 0) + (body.includes(term) ? 1 : 0), 0)
}

function retrievalModeFor(queryEmbedding, searchTokens) {
  if (queryEmbedding) return searchTokens ? 'hybrid' : 'dense'
  return 'keyword'
}

function emitMetric(logger, payload) {
  logger?.log?.('Mine operational metric.', payload)
}

function elapsedMs(clock, startedAt) {
  return Math.max(0, clock() - startedAt)
}
