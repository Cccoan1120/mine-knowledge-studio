import { lookup } from 'node:dns/promises'
import ipaddr from 'ipaddr.js'
import { Agent } from 'undici'

const blockedHosts = new Set(['localhost', 'metadata.google.internal', 'metadata.amazonaws.com'])
const redirectStatuses = new Set([301, 302, 303, 307, 308])

export async function safeFetchExternal(value, options = {}) {
  const allowPrivate = process.env.NODE_ENV === 'test' && process.env.MINE_ALLOW_PRIVATE_IMPORTS === '1'
  const { timeoutMs = 10_000, maxBytes = 5 * 1024 * 1024, maxRedirects = 5, signal, ...fetchOptions } = options
  let currentUrl = parseExternalUrl(value)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(externalError('读取远程内容超时。', 408)), timeoutMs)
  const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal

  try {
    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      const target = await resolveExternalTarget(currentUrl, { allowPrivate, signal: requestSignal })
      // Pin the checked addresses while retaining the URL hostname for Host and TLS SNI.
      const dispatcher = new Agent({ connect: { lookup: pinnedLookup(target.addresses) } })
      try {
        const response = await fetch(target.url, {
          ...fetchOptions,
          redirect: 'manual',
          signal: requestSignal,
          dispatcher,
        })

        if (redirectStatuses.has(response.status)) {
          await response.body?.cancel()
          if (redirectCount === maxRedirects) throw externalError('链接跳转次数过多。')
          const location = response.headers.get('location')
          if (!location) throw externalError('链接跳转缺少目标地址。')
          currentUrl = new URL(location, currentUrl)
          continue
        }

        return await bufferResponse(response, currentUrl.toString(), maxBytes)
      } finally {
        await dispatcher.destroy()
      }
    }
    throw externalError('链接跳转次数过多。')
  } finally {
    clearTimeout(timeout)
  }
}

export async function validateExternalUrl(value, { allowPrivate = false, signal = AbortSignal.timeout(10_000) } = {}) {
  const url = parseExternalUrl(value)
  if (allowPrivate) return url
  return (await resolveExternalTarget(url, { signal })).url
}

export async function resolveExternalTarget(value, { allowPrivate = false, signal } = {}) {
  const url = parseExternalUrl(value)
  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '')
  const addresses = ipaddr.isValid(hostname)
    ? [{ address: hostname, family: ipaddr.parse(hostname).kind() === 'ipv6' ? 6 : 4 }]
    : await withSignal(lookup(hostname, { all: true, verbatim: true }), signal).catch((error) => {
        if (signal?.aborted) throw signal.reason
        throw Object.assign(externalError('无法解析链接域名。'), { cause: error })
      })

  if (!addresses.length || (!allowPrivate && addresses.some(({ address }) => !isPublicAddress(address)))) {
    throw externalError('该链接指向受保护的网络地址。')
  }
  signal?.throwIfAborted()
  return { url, addresses }
}

function parseExternalUrl(value) {
  let url
  try {
    url = value instanceof URL ? new URL(value) : new URL(String(value))
  } catch {
    throw externalError('链接格式无效。')
  }

  if (!['http:', 'https:'].includes(url.protocol)) throw externalError('只支持 HTTP 或 HTTPS 链接。')
  if (url.username || url.password) throw externalError('链接不能包含账号凭据。')
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!hostname || blockedHosts.has(hostname) || hostname.endsWith('.local')) throw externalError('该链接地址不可访问。')
  return url
}

export function pinnedLookup(addresses) {
  return (_hostname, options, callback) => {
    const family = typeof options === 'number' ? options : options?.family
    const selected = family ? addresses.filter((entry) => entry.family === family) : addresses
    if (!selected.length) return callback(externalError('链接没有可用的网络地址。'))
    if (options?.all) return callback(null, selected)
    return callback(null, selected[0].address, selected[0].family)
  }
}

async function withSignal(promise, signal) {
  if (!signal) return promise
  signal.throwIfAborted()
  let onAbort
  const aborted = new Promise((_resolve, reject) => {
    onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
  })
  try {
    return await Promise.race([promise, aborted])
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

function isPublicAddress(value) {
  let address
  try {
    address = ipaddr.parse(value)
    if (address.kind() === 'ipv6' && address.isIPv4MappedAddress()) address = address.toIPv4Address()
  } catch {
    return false
  }

  return address.range() === 'unicast'
}

async function bufferResponse(response, url, maxBytes) {
  const declaredLength = Number(response.headers.get('content-length') || 0)
  if (declaredLength > maxBytes) {
    await response.body?.cancel()
    throw externalError('远程内容超过大小限制。', 413)
  }

  const chunks = []
  let total = 0
  if (response.body) {
    const reader = response.body.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > maxBytes) throw externalError('远程内容超过大小限制。', 413)
        chunks.push(Buffer.from(value))
      }
    } catch (error) {
      await reader.cancel().catch(() => {})
      throw error
    } finally {
      reader.releaseLock()
    }
  }

  const body = Buffer.concat(chunks)
  return {
    ok: response.ok,
    status: response.status,
    headers: response.headers,
    url,
    text: async () => body.toString('utf8'),
    json: async () => JSON.parse(body.toString('utf8')),
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  }
}

function externalError(message, status = 400) {
  return Object.assign(new Error(message), { status })
}
