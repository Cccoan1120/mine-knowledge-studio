import type { GovernanceCandidates, Note } from '../types'

export async function listGovernanceCandidates(): Promise<GovernanceCandidates> {
  return request<GovernanceCandidates>('/api/governance/candidates')
}

export async function dismissGovernanceCandidate(kind: 'duplicate' | 'tag', fingerprint: string): Promise<void> {
  await request('/api/governance/dismiss', { method: 'POST', body: JSON.stringify({ kind, fingerprint }) })
}

export async function linkDuplicateCandidate(fingerprint: string): Promise<Note[]> {
  return request<{ notes: Note[] }>('/api/governance/duplicates/link', {
    method: 'POST',
    body: JSON.stringify({ fingerprint }),
  }).then((data) => data.notes)
}

export async function applyTagCandidate(fingerprint: string, canonicalTag: string): Promise<Note[]> {
  return request<{ notes: Note[] }>('/api/governance/tags/apply', {
    method: 'POST',
    body: JSON.stringify({ fingerprint, canonicalTag }),
  }).then((data) => data.notes)
}

async function request<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init.body ? { 'Content-Type': 'application/json', ...init.headers } : init.headers,
  })
  const data = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(data.error || '素材治理请求失败。')
  return data
}
