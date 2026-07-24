// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL('./migrations/20260724000000_add_knowledge_indexing/migration.sql', import.meta.url)
const schemaPath = new URL('./schema.prisma', import.meta.url)

describe('knowledge indexing schema', () => {
  it('defines durable chunk and index job models', async () => {
    const schema = await readFile(schemaPath, 'utf8')

    expect(schema).toContain('model KnowledgeChunk')
    expect(schema).toMatch(/headingPath\s+String\[\]/)
    expect(schema).toMatch(/embedding\s+Unsupported\("vector\(1536\)"\)/)
    expect(schema).toContain('model KnowledgeIndexJob')
    expect(schema).toMatch(/noteId\s+String\s+@unique/)
    expect(schema).toMatch(/status\s+KnowledgeIndexStatus/)
    expect(schema).toMatch(/leaseToken\s+String\?\s+@unique/)
    expect(schema).toContain('@@index([status, lockedAt])')
  })

  it('enables pgvector and creates search, vector, ownership, and claiming indexes', async () => {
    const migration = await readFile(migrationPath, 'utf8')

    expect(migration).toContain('CREATE EXTENSION IF NOT EXISTS vector')
    expect(migration).toContain("to_tsvector('simple', \"searchTokens\")")
    expect(migration).toContain('USING hnsw ("embedding" vector_cosine_ops)')
    expect(migration).toContain('"KnowledgeChunk_userId_noteId_idx"')
    expect(migration).toContain('"KnowledgeIndexJob_userId_status_idx"')
    expect(migration).toContain('"KnowledgeIndexJob_status_availableAt_idx"')
    expect(migration).toContain('"KnowledgeIndexJob_status_lockedAt_idx"')
    expect(migration).toContain('"leaseToken" TEXT')
    expect(migration).toContain('"KnowledgeIndexJob_leaseToken_key"')
    expect(migration.match(/ON DELETE CASCADE/g)).toHaveLength(4)
  })
})
