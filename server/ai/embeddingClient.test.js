// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { createEmbeddingClient } from './embeddingClient.js'

const config = {
  apiKey: 'embedding-secret',
  baseUrl: 'https://embedding.example.test/v1/',
  model: 'text-embedding-3-small',
  dimensions: 1536,
}

function vector(value = 0.25) {
  return Array.from({ length: 1536 }, () => value)
}

describe('embedding client', () => {
  it('posts a batch to the embeddings endpoint and preserves input order', async () => {
    const fetchImpl = vi.fn(async (_url, _options) =>
      new Response(
        JSON.stringify({
          data: [
            { index: 1, embedding: vector(0.2) },
            { index: 0, embedding: vector(0.1) },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const client = createEmbeddingClient({ config, fetchImpl })

    const result = await client.embed(['first chunk', 'second chunk'])

    expect(result[0][0]).toBe(0.1)
    expect(result[1][0]).toBe(0.2)
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, options] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://embedding.example.test/v1/embeddings')
    expect(options.headers.Authorization).toBe('Bearer embedding-secret')
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(options.body)).toEqual({
      model: 'text-embedding-3-small',
      input: ['first chunk', 'second chunk'],
      dimensions: 1536,
    })
  })

  it.each([
    ['response count', { data: [{ index: 0, embedding: vector() }] }],
    ['numeric values', { data: [{ index: 0, embedding: [...vector().slice(0, -1), 'secret source text'] }, { index: 1, embedding: vector() }] }],
    ['exact dimensions', { data: [{ index: 0, embedding: [0.1] }, { index: 1, embedding: vector() }] }],
  ])('rejects an invalid %s without exposing response data', async (_label, body) => {
    const client = createEmbeddingClient({
      config,
      fetchImpl: vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
    })

    const error = await client.embed(['first chunk', 'second chunk']).catch((caught) => caught)

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('Embedding provider returned an invalid response.')
    expect(error.message).not.toContain('secret source text')
  })

  it('sanitizes provider and transport failures', async () => {
    const providerClient = createEmbeddingClient({
      config,
      fetchImpl: vi.fn(async () => new Response('embedding-secret source text', { status: 401 })),
    })
    const transportClient = createEmbeddingClient({
      config,
      fetchImpl: vi.fn(async () => {
        throw new Error('Bearer embedding-secret source text')
      }),
    })

    await expect(providerClient.embed(['source text'])).rejects.toThrow('Embedding request failed (HTTP 401).')
    await expect(transportClient.embed(['source text'])).rejects.toThrow('Embedding request failed.')
  })
})
