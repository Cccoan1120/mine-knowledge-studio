// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest'
import { safeFetchExternal, validateExternalUrl } from './import/safeFetch.js'
import { validateProductionConfig } from './security.js'

const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
}

afterEach(() => {
  restoreEnvironment('NODE_ENV', originalEnvironment.NODE_ENV)
  restoreEnvironment('DATABASE_URL', originalEnvironment.DATABASE_URL)
  restoreEnvironment('AUTH_SECRET', originalEnvironment.AUTH_SECRET)
  delete process.env.MINE_ALLOW_PRIVATE_IMPORTS
})

describe('production configuration', () => {
  it('refuses to start without production database credentials and a strong auth secret', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.DATABASE_URL
    process.env.AUTH_SECRET = 'short'

    expect(() => validateProductionConfig()).toThrow('DATABASE_URL')

    process.env.DATABASE_URL = 'postgresql://example.invalid/mine'
    expect(() => validateProductionConfig()).toThrow('AUTH_SECRET')

    process.env.AUTH_SECRET = 'a'.repeat(32)
    expect(() => validateProductionConfig()).not.toThrow()
  })
})

describe('external request protection', () => {
  it.each([
    'file:///etc/passwd',
    'http://localhost:8787/',
    'http://127.0.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://user:password@example.com/',
  ])('rejects unsafe external url %s', async (url) => {
    await expect(safeFetchExternal(url)).rejects.toMatchObject({ status: 400 })
  })

  it('rejects a private target before a media parser can receive it', async () => {
    await expect(validateExternalUrl('http://127.0.0.1/path/bilibili.com/video')).rejects.toMatchObject({ status: 400 })
  })
})

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}
