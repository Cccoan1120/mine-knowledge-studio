// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { createMemoryStore } from './memoryStore.js'

describe('memory store indexing contract', () => {
  it('reports basic mode and keeps indexing operations as no-ops', async () => {
    const store = createMemoryStore()
    const user = await store.createUser({ email: 'basic@example.com', passwordHash: 'hash' })
    await store.createNote(user.id, { title: 'Basic note', content: 'Local-only content' })

    expect(await store.getIndexStatus(user.id)).toEqual({
      mode: 'basic',
      total: 1,
      pending: 0,
      processing: 0,
      ready: 1,
      failed: 0,
      missing: 0,
    })
    expect(await store.ensureIndexJobs(user.id)).toEqual({ mode: 'basic', queued: 0 })
    expect(await store.retryFailedIndexJobs(user.id)).toBe(0)
    expect(await store.claimNextIndexJob()).toBeNull()
  })
})
