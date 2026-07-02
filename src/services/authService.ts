import type { CurrentUser } from '../types'

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const response = await fetch('/api/auth/me')
  if (!response.ok) return null
  const data = (await response.json()) as { user: CurrentUser }
  return data.user
}

export async function register(email: string, password: string): Promise<CurrentUser> {
  return authRequest('/api/auth/register', email, password)
}

export async function login(email: string, password: string): Promise<CurrentUser> {
  return authRequest('/api/auth/login', email, password)
}

export async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' })
}

async function authRequest(endpoint: string, email: string, password: string) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = (await response.json()) as { user?: CurrentUser; error?: string }
  if (!response.ok || !data.user) throw new Error(data.error || '登录失败。')
  return data.user
}
