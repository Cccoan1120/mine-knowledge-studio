// @vitest-environment node

import { lookup } from 'node:dns/promises'
import { createServer, request } from 'node:http'
import { createServer as createTcpServer } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { withPublicMediaProxy } from './mediaProxy.js'

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }))

const servers = []
const sockets = new Set()

afterEach(async () => {
  delete process.env.MINE_ALLOW_PRIVATE_IMPORTS
  vi.mocked(lookup).mockReset()
  for (const socket of sockets) socket.destroy()
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))))
})

describe('media subprocess proxy', () => {
  it('forwards public-style HTTP hostnames using the checked address', async () => {
    process.env.MINE_ALLOW_PRIVATE_IMPORTS = '1'
    vi.mocked(lookup).mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    const port = await listen(createServer((incoming, outgoing) => outgoing.end(incoming.headers.host)))
    const result = await withPublicMediaProxy((proxy) => throughProxy(proxy, `http://audit.invalid:${port}/video`))
    expect(result).toEqual({ status: 200, body: `audit.invalid:${port}` })
    expect(lookup).toHaveBeenCalledTimes(1)
  })

  it('rejects private HTTP destinations without contacting the target', async () => {
    const handler = vi.fn((_incoming, outgoing) => outgoing.end('private'))
    const port = await listen(createServer(handler))
    const result = await withPublicMediaProxy((proxy) => throughProxy(proxy, `http://127.0.0.1:${port}/private`))
    expect(result.status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
  })

  it('rejects CONNECT tunnels to private addresses', async () => {
    const connected = vi.fn()
    const port = await listen(createTcpServer(connected))
    const result = await withPublicMediaProxy((proxy) => tunnel(proxy, `127.0.0.1:${port}`))
    expect(result.status).toBe(403)
    expect(connected).not.toHaveBeenCalled()
  })

  it('pins a CONNECT tunnel to the checked address without resolving the hostname again', async () => {
    process.env.MINE_ALLOW_PRIVATE_IMPORTS = '1'
    vi.mocked(lookup).mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    const port = await listen(createTcpServer((socket) => socket.on('data', (chunk) => socket.end(chunk))))
    const result = await withPublicMediaProxy((proxy) => tunnel(proxy, `audit.invalid:${port}`, 'tunnel-data'))
    expect(result).toEqual({ status: 200, body: 'tunnel-data' })
    expect(lookup).toHaveBeenCalledTimes(1)
  })

  it('closes the temporary proxy even when the subprocess fails', async () => {
    let endpoint
    await expect(withPublicMediaProxy(async (proxy) => {
      endpoint = proxy
      throw new Error('subprocess failed')
    })).rejects.toThrow('subprocess failed')
    await expect(throughProxy(endpoint, 'http://audit.invalid/')).rejects.toMatchObject({ code: 'ECONNREFUSED' })
  })
})

async function listen(server) {
  servers.push(server)
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return server.address().port
}

function throughProxy(proxy, target) {
  return new Promise((resolve, reject) => {
    const outgoing = request(proxy, { path: target }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('error', reject)
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() }))
    })
    outgoing.on('error', reject)
    outgoing.end()
  })
}

function tunnel(proxy, target, payload = '') {
  return new Promise((resolve, reject) => {
    const outgoing = request(proxy, { method: 'CONNECT', path: target })
    outgoing.on('connect', (response, socket) => {
      if (response.statusCode !== 200) {
        socket.destroy()
        resolve({ status: response.statusCode, body: '' })
        return
      }
      const chunks = []
      socket.on('data', (chunk) => chunks.push(chunk))
      socket.on('error', reject)
      socket.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() }))
      socket.write(payload)
    })
    outgoing.on('error', reject)
    outgoing.end()
  })
}
