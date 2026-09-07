// @vitest-environment node

import { hash } from 'bcryptjs'
import { describe, expect, it } from 'vitest'
import { loginUser, registerUser } from './auth.js'
import { createMemoryStore } from './store/memoryStore.js'

describe('password byte limits', () => {
  it.each(['x'.repeat(73), '\u5bc6'.repeat(25)])('rejects a new password longer than 72 UTF-8 bytes', async (password) => {
    const store = createMemoryStore()
    await expect(registerUser(store, { email: 'limit@example.com', password })).rejects.toMatchObject({ status: 400 })
    expect(await store.findUserByEmail('limit@example.com')).toBeNull()
  })

  it.each(['x'.repeat(72), '\u5bc6'.repeat(24)])('accepts 72 bytes but rejects a trailing-byte login alias', async (password) => {
    const store = createMemoryStore()
    const user = await registerUser(store, { email: 'valid@example.com', password })
    await expect(loginUser(store, { email: user.email, password })).resolves.toMatchObject({ id: user.id })
    await expect(loginUser(store, { email: user.email, password: password + 'extra' })).rejects.toMatchObject({ status: 401 })
  })

  it('preserves login for previously stored unversioned long-password hashes', async () => {
    const store = createMemoryStore()
    const password = 'legacy'.repeat(15)
    const user = await store.createUser({ email: 'legacy@example.com', passwordHash: await hash(password, 4) })
    await expect(loginUser(store, { email: user.email, password })).resolves.toMatchObject({ id: user.id })
    await expect(loginUser(store, { email: user.email, password: 'wrong-password' })).rejects.toMatchObject({ status: 401 })
  })
})
