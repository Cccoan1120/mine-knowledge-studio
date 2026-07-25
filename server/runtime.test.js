// @vitest-environment node

import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { startRuntime } from './runtime.js'

function fakeServer({ closeImmediately = true } = {}) {
  const server = new EventEmitter()
  server.close = vi.fn(() => {
    if (closeImmediately) server.emit('close')
  })
  return server
}

function runtimeHarness({
  storageMode,
  embeddingConfigured,
  embeddingEnabled = true,
  closeImmediately = true,
}) {
  const server = fakeServer({ closeImmediately })
  const app = { listen: vi.fn((_port, _host, callback) => {
    callback()
    return server
  }) }
  const worker = { start: vi.fn(), stop: vi.fn() }
  const processRef = new EventEmitter()
  const store = { storageMode }
  const appFactory = vi.fn(() => app)
  const workerFactory = vi.fn(() => worker)
  const result = startRuntime({
    store,
    appFactory,
    workerFactory,
    embeddingConfig: {
      enabled: embeddingEnabled,
      apiKey: embeddingConfigured ? 'configured' : '',
    },
    embeddingClient: { embed: vi.fn() },
    processRef,
    logger: { log: vi.fn(), error: vi.fn() },
    port: 8787,
    host: '127.0.0.1',
  })
  return { ...result, app, appFactory, createdWorker: worker, processRef, store, workerFactory }
}

describe('server runtime indexing worker lifecycle', () => {
  it('shares the Postgres store, starts a configured worker, and stops it on close', () => {
    const harness = runtimeHarness({ storageMode: 'postgres', embeddingConfigured: true })

    expect(harness.worker.start).toHaveBeenCalledOnce()
    expect(harness.appFactory).toHaveBeenCalledWith(expect.objectContaining({ store: harness.store }))
    expect(harness.workerFactory).toHaveBeenCalledWith(expect.objectContaining({ store: harness.store }))
    expect(harness.app.listen).toHaveBeenCalledWith(8787, '127.0.0.1', expect.any(Function))
    harness.server.emit('close')
    expect(harness.worker.stop).toHaveBeenCalledOnce()
  })

  it.each([
    ['memory', true],
    ['postgres', false],
  ])('does not start an indexing worker for %s storage with embedding configured=%s', (storageMode, embeddingConfigured) => {
    const harness = runtimeHarness({ storageMode, embeddingConfigured })

    expect(harness.worker).toBeNull()
  })

  it('does not start an indexing worker when embeddings are explicitly disabled', () => {
    const harness = runtimeHarness({
      storageMode: 'postgres',
      embeddingConfigured: true,
      embeddingEnabled: false,
    })

    expect(harness.worker).toBeNull()
    expect(harness.workerFactory).not.toHaveBeenCalled()
  })

  it('closes the server and stops the worker on normal termination signals', () => {
    const harness = runtimeHarness({ storageMode: 'postgres', embeddingConfigured: true })

    harness.processRef.emit('SIGTERM')

    expect(harness.server.close).toHaveBeenCalledOnce()
    expect(harness.worker.stop).toHaveBeenCalledOnce()
  })

  it.each(['SIGINT', 'SIGTERM'])('stops the worker immediately on %s before server close completes', (signal) => {
    const harness = runtimeHarness({
      storageMode: 'postgres',
      embeddingConfigured: true,
      closeImmediately: false,
    })

    harness.processRef.emit(signal)

    expect(harness.server.close).toHaveBeenCalledOnce()
    expect(harness.worker.stop).toHaveBeenCalledOnce()

    harness.server.emit('close')
    expect(harness.worker.stop).toHaveBeenCalledOnce()
  })
})
