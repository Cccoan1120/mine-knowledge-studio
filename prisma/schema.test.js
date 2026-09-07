// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL('./migrations/20260724000000_add_knowledge_indexing/migration.sql', import.meta.url)
const wikiMigrationPath = new URL('./migrations/20260729000000_add_llm_wiki/migration.sql', import.meta.url)
const governanceMigrationPath = new URL('./migrations/20260729010000_add_governance_dismissals/migration.sql', import.meta.url)
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

describe('LLM Wiki schema', () => {
  it('defines independent Wiki content, citations, links, and durable jobs', async () => {
    const schema = await readFile(schemaPath, 'utf8')
    expect(schema).toContain('model WikiProject')
    expect(schema).toContain('model WikiPage')
    expect(schema).toContain('model WikiCitation')
    expect(schema).toContain('model WikiPageLink')
    expect(schema).toContain('model WikiGenerationJob')
    expect(schema).toMatch(/scope\s+Json/)
    expect(schema).toMatch(/leaseToken\s+String\?\s+@unique/)
  })

  it('creates ownership, ordering, backlink, and job claiming indexes', async () => {
    const migration = await readFile(wikiMigrationPath, 'utf8')
    expect(migration).toContain('"WikiProject_userId_updatedAt_idx"')
    expect(migration).toContain('"WikiPage_projectId_position_idx"')
    expect(migration).toContain('"WikiPageLink_toPageId_idx"')
    expect(migration).toContain('"WikiGenerationJob_status_availableAt_idx"')
    expect(migration).toContain('ON DELETE SET NULL')
  })
})

describe('library governance schema', () => {
  it('persists user-scoped candidate decisions', async () => {
    const schema = await readFile(schemaPath, 'utf8')
    const migration = await readFile(governanceMigrationPath, 'utf8')
    expect(schema).toContain('model GovernanceDismissal')
    expect(schema).toContain('@@unique([userId, kind, fingerprint])')
    expect(migration).toContain('"GovernanceDismissal_userId_kind_fingerprint_key"')
    expect(migration).toContain('ON DELETE CASCADE')
  })
})
