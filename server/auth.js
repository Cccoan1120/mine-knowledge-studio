import { compare, hash } from 'bcryptjs'
import { jwtVerify, SignJWT } from 'jose'

const sessionCookie = 'mine_session'
const encoder = new TextEncoder()

export async function registerUser(store, { email, password }) {
  const normalizedEmail = normalizeEmail(email)
  assertPassword(password)
  const passwordHash = await hash(password, 12)
  return store.createUser({ email: normalizedEmail, passwordHash })
}

export async function loginUser(store, { email, password }) {
  const user = await store.findUserByEmail(normalizeEmail(email))
  if (!user || !(await compare(String(password || ''), user.passwordHash))) {
    const error = new Error('邮箱或密码不正确。')
    error.status = 401
    throw error
  }
  return {
    id: user.id,
    email: user.email,
    createdAt: toISOString(user.createdAt),
    updatedAt: toISOString(user.updatedAt),
  }
}

export async function requireAuth(request, response, next) {
  const token = parseCookies(request.headers.cookie || '')[sessionCookie]
  if (!token) return response.status(401).json({ error: '请先登录。' })

  try {
    const { payload } = await jwtVerify(token, secret())
    const user = await request.store.findUserById(String(payload.sub || ''))
    if (!user) return response.status(401).json({ error: '登录状态已失效。' })
    request.user = user
    return next()
  } catch {
    return response.status(401).json({ error: '登录状态已失效。' })
  }
}

export async function setSessionCookie(response, user) {
  const token = await new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret())

  response.setHeader('Set-Cookie', serializeCookie(sessionCookie, token, { maxAge: 60 * 60 * 24 * 30 }))
}

export function clearSessionCookie(response) {
  response.setHeader('Set-Cookie', serializeCookie(sessionCookie, '', { maxAge: 0 }))
}

function normalizeEmail(email) {
  const normalized = String(email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    const error = new Error('请输入有效邮箱。')
    error.status = 400
    throw error
  }
  return normalized
}

function assertPassword(password) {
  const value = String(password || '')
  if (value.length < 8 || value.length > 128) {
    const error = new Error('密码需要 8 到 128 位。')
    error.status = 400
    throw error
  }
}

function parseCookies(value) {
  return Object.fromEntries(
    value
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=')
        return index === -1 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))]
      }),
  )
}

function serializeCookie(name, value, { maxAge }) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${name}=${encodeURIComponent(value)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`
}

function secret() {
  return encoder.encode(process.env.AUTH_SECRET || 'mine-dev-auth-secret-change-me')
}

function toISOString(value) {
  if (!value) return new Date().toISOString()
  if (typeof value === 'string') return value
  return new Date(value).toISOString()
}
