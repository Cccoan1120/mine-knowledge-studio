import { describe, expect, it, vi } from 'vitest'
import { createSaveQueue } from './saveQueue'

describe('save queue', () => {
  it('serializes writes and uses the returned version for the next edit', async () => {
    let complete!: (value: { updatedAt: string }) => void
    const save = vi.fn().mockImplementationOnce(() => new Promise(resolve => { complete = resolve })).mockResolvedValueOnce({ updatedAt: 'v3' })
    const queue = createSaveQueue<{ content?: string }, { updatedAt: string }>({ save, delay: 10000 })
    queue.seed('a', 'v1')
    queue.enqueue('a', { content: 'earlier' })
    const flush = queue.flush('a')
    queue.enqueue('a', { content: 'latest' })
    expect(save).toHaveBeenCalledTimes(1)
    complete({ updatedAt: 'v2' })
    expect(await flush).toBe(true)
    expect(save.mock.calls[1]).toEqual(['a', { content: 'latest' }, 'v2'])
    expect(queue.status('a')).toBe('saved')
    queue.clear()
  })

  it('preserves failed patches and merges newer edits before an explicit retry', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ updatedAt: 'v2' })
    const queue = createSaveQueue<{ title?: string; content?: string }, { updatedAt: string }>({ save })
    queue.seed('a', 'v1')
    queue.enqueue('a', { title: 'title', content: 'old draft' })
    expect(await queue.flush('a')).toBe(false)
    queue.enqueue('a', { content: 'new draft' })
    expect(queue.status('a')).toBe('error')
    expect(queue.hasUnsaved()).toBe(true)
    expect(await queue.flushAll()).toBe(true)
    expect(save.mock.calls[1]).toEqual(['a', { title: 'title', content: 'new draft' }, 'v1'])
    expect(queue.hasUnsaved()).toBe(false)
    queue.clear()
  })

  it('tracks failures independently for each document', async () => {
    const queue = createSaveQueue<{ content: string }, { updatedAt: string }>({
      save: async id => { if (id === 'a') throw new Error('conflict'); return { updatedAt: 'v2' } },
    })
    queue.enqueue('a', { content: 'draft a' })
    queue.enqueue('b', { content: 'draft b' })
    expect(await queue.flushAll()).toBe(false)
    expect(queue.status('a')).toBe('error')
    expect(queue.status('b')).toBe('saved')
    queue.clear()
  })
})
