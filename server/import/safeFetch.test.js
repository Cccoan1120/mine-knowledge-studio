// @vitest-environment node

import dns from 'node:dns'
import { lookup } from 'node:dns/promises'
import { createServer } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { safeFetchExternal, validateExternalUrl } from './safeFetch.js'

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }))

let server

beforeEach(() => {
  vi.mocked(lookup).mockReset()
  delete process.env.MINE_ALLOW_PRIVATE_IMPORTS
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete process.env.MINE_ALLOW_PRIVATE_IMPORTS
  if (server) {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    server = undefined
  }
})

describe('pinned external fetch', () => {
  it('connects to the checked address without a second DNS lookup and retains Host', async () => {
    process.env.MINE_ALLOW_PRIVATE_IMPORTS = '1'
    const origin = await serve((request, response) => response.end(request.headers.host))
    const url = new URL(origin)
    url.hostname = 'audit.invalid'
    vi.mocked(lookup).mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    const connectionLookup = vi.spyOn(dns, 'lookup').mockImplementation(() => { throw new Error('DNS rebinding attempted') })
    const response = await safeFetchExternal(url)
    expect(await response.text()).toBe(url.host)
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(connectionLookup).not.toHaveBeenCalled()
  })

  it('rejects mixed public/private DNS answers before connecting', async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }])
    await expect(safeFetchExternal('http://audit.invalid')).rejects.toMatchObject({ status: 400 })
  })

  it('checks redirected destinations before connecting to them', async () => {
    vi.mocked(lookup).mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }])
      .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }])
    const fetchRequest = vi.fn().mockResolvedValue(new Response(null, {
      status: 302, headers: { location: 'http://redirect.invalid/private' },
    }))
    vi.stubGlobal('fetch', fetchRequest)
    await expect(safeFetchExternal('http://audit.invalid/')).rejects.toMatchObject({ status: 400 })
    expect(fetchRequest).toHaveBeenCalledTimes(1)
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it('keeps the timeout active while reading a stalled response body', async () => {
    process.env.MINE_ALLOW_PRIVATE_IMPORTS = '1'
    const origin = await serve((_request, response) => {
      response.writeHead(200)
      response.flushHeaders()
      response.write('partial')
    })
    await expect(safeFetchExternal(origin, { timeoutMs: 80 })).rejects.toMatchObject({ status: 408 })
  })

  it('bounds DNS resolution by the same request deadline', async () => {
    vi.mocked(lookup).mockImplementation(() => new Promise(() => {}))
    await expect(safeFetchExternal('http://audit.invalid', { timeoutMs: 30 })).rejects.toMatchObject({ status: 408 })
  })

  it.each([true, false])('cancels oversized remote bodies (declared size: %s)', async (declared) => {
    process.env.MINE_ALLOW_PRIVATE_IMPORTS = '1'
    const origin = await serve((_request, response) => {
      response.writeHead(200, declared ? { 'content-length': '100' } : {})
      response.end('x'.repeat(100))
    })
    await expect(safeFetchExternal(origin, { maxBytes: 20 })).rejects.toMatchObject({ status: 413 })
  })

  it.each(['http://[::1]/', 'http://[::ffff:127.0.0.1]/'])('rejects private IPv6 literals: %s', async (url) => {
    await expect(validateExternalUrl(url)).rejects.toMatchObject({ status: 400 })
  })
})

async function serve(handler) {
  server = createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${server.address().port}/`
}
