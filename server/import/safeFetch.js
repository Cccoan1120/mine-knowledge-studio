import { lookup } from 'node:dns/promises'
import ipaddr from 'ipaddr.js'

const blockedHosts = new Set(['localhost', 'metadata.google.internal', 'metadata.amazonaws.com'])
const redirectStatuses = new Set([301, 302, 303, 307, 308])

export async function safeFetchExternal(value, options = {}) {
  const allowPrivate = process.env.NODE_ENV === 'test' && process.env.MINE_ALLOW_PRIVATE_IMPORTS === '1'
  let currentUrl = await validateExternalUrl(value, { allowPrivate })
  const maxRedirects = options.maxRedirects ?? 5

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000)
    let response

    try {
      response = await fetch(currentUrl, {
        ...options,
        redirect: 'manual',
        signal: controller.signal,
        timeoutMs: undefined,
        maxBytes: undefined,
        maxRedirects: undefined,
      })
    } finally {
      clearTimeout(timeout)
    }

    if (redirectStatuses.has(response.status)) {
      if (redirectCount === maxRedirects) throw externalError('链接跳转次数过多。')
      const location = response.headers.get('location')
      if (!location) throw externalError('链接跳转缺少目标地址。')
      currentUrl = await validateExternalUrl(new URL(location, currentUrl), { allowPrivate })
      continue
    }

    return bufferResponse(response, currentUrl.toString(), options.maxBytes ?? 5 * 1024 * 1024)
  }

  throw externalError('链接跳转次数过多。')
}

export async function validateExternalUrl(value, { allowPrivate = false } = {}) {
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
  if (allowPrivate) return url

  const addresses = ipaddr.isValid(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true }).catch(() => {
        throw externalError('无法解析链接域名。')
      })

  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw externalError('该链接指向受保护的网络地址。')
  }

  return url
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
  if (declaredLength > maxBytes) throw Object.assign(externalError('远程内容超过大小限制。'), { status: 413 })

  const chunks = []
  let total = 0
  if (response.body) {
    const reader = response.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw Object.assign(externalError('远程内容超过大小限制。'), { status: 413 })
      }
      chunks.push(Buffer.from(value))
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

function externalError(message) {
  return Object.assign(new Error(message), { status: 400 })
}
