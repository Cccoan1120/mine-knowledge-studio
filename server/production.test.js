// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), start: vi.fn() }))
vi.mock('node:child_process', () => ({ spawnSync: mocks.spawn }))
vi.mock('./loadEnv.js', () => ({ loadLocalEnv() {} }))
vi.mock('./runtime.js', () => ({ startRuntime: mocks.start }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('AUTH_SECRET', 'test-only-auth-secret-with-more-than-32-characters')
  vi.stubEnv('DATABASE_URL', 'postgresql://test:test@127.0.0.1/mine_test')
})
afterEach(() => vi.unstubAllEnvs())

it('applies migrations before accepting application traffic', async () => {
  mocks.spawn.mockReturnValue({ status: 0 })
  await import('./production.js')
  expect(mocks.spawn).toHaveBeenCalledWith(process.execPath, expect.arrayContaining(['migrate', 'deploy']), expect.objectContaining({ timeout: 120_000 }))
  expect(mocks.start).toHaveBeenCalledOnce()
  expect(mocks.spawn.mock.invocationCallOrder[0]).toBeLessThan(mocks.start.mock.invocationCallOrder[0])
})

it('does not start the new server if migrations fail', async () => {
  mocks.spawn.mockReturnValue({ status: 1 })
  await expect(import('./production.js')).rejects.toThrow('startup cancelled')
  expect(mocks.start).not.toHaveBeenCalled()
})

it('validates production configuration before migrating', async () => {
  vi.stubEnv('AUTH_SECRET', '')
  await expect(import('./production.js')).rejects.toThrow('AUTH_SECRET')
  expect(mocks.spawn).not.toHaveBeenCalled()
  expect(mocks.start).not.toHaveBeenCalled()
})
