import { createImportApp } from './app.js'
import { getEmbeddingConfig } from './ai/config.js'
import { createEmbeddingClient } from './ai/embeddingClient.js'
import { createIndexingWorker } from './rag/indexingWorker.js'
import { createDefaultStore } from './store/index.js'

export function startRuntime({
  store = createDefaultStore(),
  appFactory = createImportApp,
  workerFactory = createIndexingWorker,
  embeddingConfig = getEmbeddingConfig(),
  embeddingClient,
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
  let stopped = false

  if (store.storageMode === 'postgres' && embeddingConfig.enabled !== false && embeddingConfig.apiKey) {
    worker = workerFactory({
      store,
      embeddingClient: embeddingClient || createEmbeddingClient({ config: embeddingConfig }),
      logger,
    })
    worker.start()
  }

  const handleSignal = () => {
    stopWorker()
    server.close()
  }
  const stopWorker = () => {
    if (stopped) return
    stopped = true
    worker?.stop()
    processRef.off?.('SIGINT', handleSignal)
    processRef.off?.('SIGTERM', handleSignal)
  }

  server.once('close', stopWorker)
  processRef.once('SIGINT', handleSignal)
  processRef.once('SIGTERM', handleSignal)
  return { server, worker, store }
}
