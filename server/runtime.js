import { createImportApp } from './app.js'
import { getEmbeddingConfig, getPlatformAIConfig } from './ai/config.js'
import { createEmbeddingClient } from './ai/embeddingClient.js'
import { createIndexingWorker } from './rag/indexingWorker.js'
import { createPlatformChatClient } from './rag/questionService.js'
import { createKnowledgeRetriever } from './rag/retriever.js'
import { createDefaultStore } from './store/index.js'
import { createWikiGenerationWorker } from './wiki/generationWorker.js'

export function startRuntime({
  store = createDefaultStore(),
  appFactory = createImportApp,
  workerFactory = createIndexingWorker,
  wikiWorkerFactory = createWikiGenerationWorker,
  embeddingConfig = getEmbeddingConfig(),
  embeddingClient,
  chatConfig = getPlatformAIConfig(),
  chatClient,
  wikiRetriever,
  processRef = process,
  logger = console,
  port = Number(process.env.PORT || process.env.MINE_IMPORT_PORT || 8787),
  host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'),
} = {}) {
  const app = appFactory({ store, logger })
  const server = app.listen(port, host, () => {
    logger.log(`Mine service ready at http://${host}:${port}`)
  })
  let worker = null
  let wikiWorker = null
  let stopped = false
  let resolvedEmbeddingClient = embeddingClient

  if (store.storageMode === 'postgres' && embeddingConfig.enabled !== false && embeddingConfig.apiKey) {
    resolvedEmbeddingClient ||= createEmbeddingClient({ config: embeddingConfig })
    worker = workerFactory({
      store,
      embeddingClient: resolvedEmbeddingClient,
      logger,
    })
    worker.start()
  }

  if (chatConfig.apiKey) {
    wikiWorker = wikiWorkerFactory({
      store,
      retriever: wikiRetriever || createKnowledgeRetriever({
        store,
        embeddingClient: resolvedEmbeddingClient,
        embeddingEnabled: embeddingConfig.enabled,
        logger,
      }),
      chatClient: chatClient || createPlatformChatClient({ config: chatConfig }),
      logger,
    })
    wikiWorker.start()
  }

  const handleSignal = () => {
    stopWorker()
    server.close()
  }
  const stopWorker = () => {
    if (stopped) return
    stopped = true
    worker?.stop()
    wikiWorker?.stop()
    processRef.off?.('SIGINT', handleSignal)
    processRef.off?.('SIGTERM', handleSignal)
  }

  server.once('close', stopWorker)
  processRef.once('SIGINT', handleSignal)
  processRef.once('SIGTERM', handleSignal)
  return { server, worker, wikiWorker, store }
}
