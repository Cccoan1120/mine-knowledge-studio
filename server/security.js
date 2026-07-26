import { randomUUID } from 'node:crypto'
import { ipKeyGenerator, rateLimit } from 'express-rate-limit'

export function validateProductionConfig() {
  if (process.env.NODE_ENV !== 'production') return

  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('Production requires DATABASE_URL.')
  }

  if ((process.env.AUTH_SECRET || '').trim().length < 32) {
    throw new Error('Production requires AUTH_SECRET with at least 32 characters.')
  }
}

export function requestContext(request, response, next) {
  const requestId = String(request.headers['x-request-id'] || randomUUID()).slice(0, 128)
  request.requestId = requestId
  response.setHeader('X-Request-Id', requestId)
  next()
}

export function requireSameOrigin(request, response, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return next()

  if (request.headers['sec-fetch-site'] === 'cross-site') {
    return response.status(403).json({ error: '跨站请求已被拒绝。', requestId: request.requestId })
  }

  const origin = request.headers.origin
  if (!origin) return next()

  try {
    const originUrl = new URL(origin)
    if (originUrl.host !== request.get('host')) {
      return response.status(403).json({ error: '请求来源不受信任。', requestId: request.requestId })
    }
  } catch {
    return response.status(403).json({ error: '请求来源不受信任。', requestId: request.requestId })
  }

  return next()
}

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (request) => {
    const email = String(request.body?.email || '').trim().toLowerCase().slice(0, 254)
    return `${ipKeyGenerator(request.ip)}:${email}`
  },
  handler: rateLimitHandler,
})

export const aiRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: authenticatedKey,
  handler: rateLimitHandler,
})

export const indexControlRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 150,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: authenticatedKey,
  handler: rateLimitHandler,
})

export const importRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: authenticatedKey,
  handler: rateLimitHandler,
})

function authenticatedKey(request) {
  return request.user?.id || ipKeyGenerator(request.ip)
}

function rateLimitHandler(request, response) {
  response.status(429).json({ error: '操作太频繁，请稍后再试。', requestId: request.requestId })
}

export function publicError(error, requestId) {
  const status = errorStatus(error)
  const safeMessage = status < 500 ? error?.message || '请求内容无效。' : '服务暂时不可用，请稍后重试。'
  return { status, body: { error: safeMessage, requestId } }
}

export function logServerError(error, requestId) {
  const message = String(error?.message || error || 'Unknown server error')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[database-url-redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
  console.error(`[${requestId || 'no-request-id'}] ${message}`)
}

function errorStatus(error) {
  if (error?.code === 'LIMIT_FILE_SIZE') return 413
  if (error?.code === 'USER_EXISTS') return 409
  return Number(error?.status || error?.statusCode) || 500
}
