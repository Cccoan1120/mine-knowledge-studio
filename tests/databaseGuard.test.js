// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { verifyDisposableDatabase } from './db/databaseGuard.js'

describe('disposable database guard', () => {
  it('rejects a database without an explicitly test-only identity before creating a client', async () => {
    const createClient = vi.fn()

    await expect(verifyDisposableDatabase({
      databaseUrl: 'postgresql://user:password@example.test/mine_production',
      createClient,
    })).rejects.toThrow('test-only database')
    expect(createClient).not.toHaveBeenCalled()
  })

  it.each([
    { counts: { nonTestUsers: 1, nonTestJobs: 0 }, label: 'users' },
    { counts: { nonTestUsers: 0, nonTestJobs: 1 }, label: 'jobs' },
  ])('rejects existing non-test $label before database work starts', async ({ counts }) => {
    const databaseWork = vi.fn()
    const client = {
      $queryRawUnsafe: vi.fn(async () => [counts]),
    }

    await expect(
      verifyDisposableDatabase({
        databaseUrl: 'postgresql://user:password@example.test/mine_ci_test',
        createClient: () => client,
      }).then(databaseWork),
    ).rejects.toThrow('non-test data')
    expect(databaseWork).not.toHaveBeenCalled()
  })
})
