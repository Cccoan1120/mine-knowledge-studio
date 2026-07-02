import { createMemoryStore } from './memoryStore.js'
import { createPrismaStore } from './prismaStore.js'

export function createDefaultStore() {
  if (process.env.DATABASE_URL?.trim()) return createPrismaStore()
  return createMemoryStore()
}
