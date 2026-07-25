// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest'
import { getAICapabilities, getEmbeddingConfig } from './config.js'

const embeddingEnvironmentKeys = [
  'AI_API_KEY',
  'AI_BASE_URL',
  'AI_EMBEDDING_API_KEY',
  'AI_EMBEDDING_BASE_URL',
  'AI_EMBEDDING_ENABLED',
  'AI_EMBEDDING_MODEL',
  'AI_EMBEDDING_DIMENSIONS',
]

afterEach(() => {
  for (const key of embeddingEnvironmentKeys) delete process.env[key]
})

describe('embedding configuration', () => {
  it('uses shared AI credentials as fallbacks and fixed defaults', () => {
    process.env.AI_API_KEY = 'shared-key'
    process.env.AI_BASE_URL = 'https://shared.example.test/v1'

    expect(getEmbeddingConfig()).toEqual({
      enabled: true,
      apiKey: 'shared-key',
      baseUrl: 'https://shared.example.test/v1',
      model: 'text-embedding-3-small',
      dimensions: 1536,
    })
  })

  it('prefers dedicated embedding configuration', () => {
    process.env.AI_API_KEY = 'shared-key'
    process.env.AI_BASE_URL = 'https://shared.example.test/v1'
    process.env.AI_EMBEDDING_API_KEY = 'embedding-key'
    process.env.AI_EMBEDDING_BASE_URL = 'https://embedding.example.test/v1'
    process.env.AI_EMBEDDING_MODEL = 'embedding-model'
    process.env.AI_EMBEDDING_DIMENSIONS = '1536'

    expect(getEmbeddingConfig()).toEqual({
      enabled: true,
      apiKey: 'embedding-key',
      baseUrl: 'https://embedding.example.test/v1',
      model: 'embedding-model',
      dimensions: 1536,
    })
  })

  it('rejects configured dimensions other than 1536', () => {
    process.env.AI_EMBEDDING_DIMENSIONS = '1024'

    expect(() => getEmbeddingConfig()).toThrow('AI_EMBEDDING_DIMENSIONS must be 1536.')
  })

  it('exposes only whether embeddings are configured', () => {
    process.env.AI_EMBEDDING_API_KEY = 'embedding-secret'
    process.env.AI_EMBEDDING_BASE_URL = 'https://embedding.example.test/v1'

    const capabilities = getAICapabilities()

    expect(capabilities.embeddingConfigured).toBe(true)
    expect(JSON.stringify(capabilities)).not.toContain('embedding-secret')
    expect(JSON.stringify(capabilities)).not.toContain('embedding.example.test')
  })

  it('reports retrieval mode from storage and embedding availability', () => {
    expect(getAICapabilities({ storageMode: 'memory' }).retrievalMode).toBe('basic')
    expect(getAICapabilities({ storageMode: 'postgres' }).retrievalMode).toBe('keyword')

    process.env.AI_EMBEDDING_API_KEY = 'embedding-secret'
    expect(getAICapabilities({ storageMode: 'postgres' }).retrievalMode).toBe('hybrid')
  })

  it('uses an explicit disable switch instead of resolved shared credentials', () => {
    process.env.AI_API_KEY = 'shared-key'
    process.env.AI_EMBEDDING_ENABLED = 'false'

    expect(getEmbeddingConfig()).toMatchObject({
      enabled: false,
      apiKey: 'shared-key',
    })
    expect(getAICapabilities({ storageMode: 'postgres' })).toMatchObject({
      chatConfigured: true,
      embeddingConfigured: false,
      retrievalMode: 'keyword',
    })
  })
})
