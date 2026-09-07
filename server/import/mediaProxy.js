import { createServer, request as httpRequest } from 'node:http'
import { connect } from 'node:net'
import { pinnedLookup, resolveExternalTarget } from './safeFetch.js'

const maxTransferBytes = 64 * 1024 * 1024
const idleTimeoutMs = 10_000

// The subprocess must use this proxy for redirects, manifests, metadata, and media connections.
export async function withPublicMediaProxy(task) {
  const sockets = new Set()
  const allowPrivate = process.env.NODE_ENV === 'test' && process.env.MINE_ALLOW_PRIVATE_IMPORTS === '1'
  const track = (socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
    socket.on('error', () => {})
    socket.setTimeout(idleTimeoutMs, () => socket.destroy())
    return socket
  }
  const resolveTarget = (url) => resolveExternalTarget(url, {
    allowPrivate,
    signal: AbortSignal.timeout(idleTimeoutMs),
  })

  const server = createServer(async (incoming, outgoing) => {
    let upstream
    try {
      const { url, addresses } = await resolveTarget(incoming.url)
      if (url.protocol !== 'http:' || !['GET', 'HEAD', 'POST'].includes(incoming.method)) throw new Error('Unsupported proxy request')
      if (incoming.destroyed || outgoing.destroyed) return
      const headers = { ...incoming.headers, host: url.host }
      delete headers['proxy-authorization']
      delete headers['proxy-connection']
      upstream = httpRequest(url, {
        method: incoming.method,
        headers,
        lookup: pinnedLookup(addresses),
        agent: false,
      }, (response) => {
        outgoing.writeHead(response.statusCode, response.headers)
        let received = 0
        response.on('data', (chunk) => {
          received += chunk.length
          if (received > maxTransferBytes) {
            upstream.destroy()
            outgoing.destroy()
          }
        })
        response.on('error', () => outgoing.destroy())
        response.pipe(outgoing)
      })
      upstream.on('socket', track)
      upstream.on('error', () => {
        if (outgoing.headersSent) outgoing.destroy()
        else outgoing.writeHead(502).end()
      })
      incoming.on('aborted', () => upstream.destroy())
      outgoing.on('close', () => upstream.destroy())
      let sent = 0
      incoming.on('data', (chunk) => {
        sent += chunk.length
        if (sent > 2 * 1024 * 1024) {
          upstream.destroy()
          incoming.destroy()
        }
      })
      incoming.pipe(upstream)
    } catch {
      upstream?.destroy()
      if (!outgoing.destroyed) outgoing.writeHead(403).end()
    }
  })

  server.on('connection', track)
  server.on('connect', async (incoming, client, head) => {
    let upstream
    try {
      const { url, addresses } = await resolveTarget(`https://${incoming.url}`)
      if (url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid tunnel target')
      if (client.destroyed) return
      upstream = track(connect({
        host: url.hostname.replace(/^\[|\]$/g, ''),
        port: Number(url.port || 443),
        lookup: pinnedLookup(addresses),
      }))
      upstream.once('connect', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head.length) upstream.write(head)
        let received = 0
        upstream.on('data', (chunk) => {
          received += chunk.length
          if (received > maxTransferBytes) {
            upstream.destroy()
            client.destroy()
          }
        })
        client.pipe(upstream)
        upstream.pipe(client)
      })
      upstream.on('error', () => client.destroy())
      client.on('error', () => upstream.destroy())
      upstream.on('close', () => client.destroy())
      client.on('close', () => upstream.destroy())
    } catch {
      upstream?.destroy()
      if (!client.destroyed) client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
    }
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  try {
    return await task(`http://127.0.0.1:${server.address().port}`)
  } finally {
    for (const socket of sockets) socket.destroy()
    await new Promise((resolve) => server.close(resolve))
  }
}
