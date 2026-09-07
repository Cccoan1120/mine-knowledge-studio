import type { WikiPage, WikiProject, WikiProjectSummary, WikiScope } from '../types'

type WikiProjectInput = {
  title: string
  topic: string
  scope: WikiScope
}

export async function listWikiProjects(): Promise<WikiProjectSummary[]> {
  return request<{ projects: WikiProjectSummary[] }>('/api/wikis').then((data) => data.projects)
}

export async function createWikiProject(input: WikiProjectInput): Promise<WikiProject> {
  return request<{ project: WikiProject }>('/api/wikis', { method: 'POST', body: JSON.stringify(input) }).then((data) => data.project)
}

export async function getWikiProject(id: string): Promise<WikiProject> {
  return request<{ project: WikiProject }>(`/api/wikis/${encodeURIComponent(id)}`).then((data) => data.project)
}

export async function updateWikiProject(id: string, patch: Partial<WikiProjectInput>): Promise<WikiProject> {
  return request<{ project: WikiProject }>(`/api/wikis/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  }).then((data) => data.project)
}

export async function deleteWikiProject(id: string) {
  await request(`/api/wikis/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function generateWikiOutline(id: string) {
  return request(`/api/wikis/${encodeURIComponent(id)}/outline`, { method: 'POST' })
}

export async function createWikiPage(projectId: string, input: Pick<WikiPage, 'title' | 'summary'>): Promise<WikiPage> {
  return request<{ page: WikiPage }>(`/api/wikis/${encodeURIComponent(projectId)}/pages`, {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((data) => data.page)
}

export async function updateWikiPage(
  projectId: string,
  pageId: string,
  patch: Partial<Pick<WikiPage, 'title' | 'summary' | 'content' | 'position'>> & { expectedUpdatedAt?: string },
): Promise<WikiPage> {
  return request<{ page: WikiPage }>(wikiPagePath(projectId, pageId), {
    method: 'PATCH',
    body: JSON.stringify(patch),
  }).then((data) => data.page)
}

export async function deleteWikiPage(projectId: string, pageId: string) {
  await request(wikiPagePath(projectId, pageId), { method: 'DELETE' })
}

export async function generateWikiPages(projectId: string, pageIds: string[]) {
  return request(`/api/wikis/${encodeURIComponent(projectId)}/pages/generate`, {
    method: 'POST',
    body: JSON.stringify({ pageIds }),
  })
}

export async function refreshWikiPage(projectId: string, pageId: string) {
  return request(`${wikiPagePath(projectId, pageId)}/refresh`, { method: 'POST' })
}

export async function acceptWikiCandidate(projectId: string, pageId: string): Promise<WikiPage> {
  return request<{ page: WikiPage }>(`${wikiPagePath(projectId, pageId)}/candidate/accept`, { method: 'POST' })
    .then((data) => data.page)
}

export async function discardWikiCandidate(projectId: string, pageId: string): Promise<WikiPage> {
  return request<{ page: WikiPage }>(`${wikiPagePath(projectId, pageId)}/candidate/discard`, { method: 'POST' })
    .then((data) => data.page)
}

export async function exportWikiProject(projectId: string): Promise<string> {
  return requestText(`/api/wikis/${encodeURIComponent(projectId)}/export`)
}

export async function exportWikiPage(projectId: string, pageId: string): Promise<string> {
  return requestText(`${wikiPagePath(projectId, pageId)}/export`)
}

function wikiPagePath(projectId: string, pageId: string) {
  return `/api/wikis/${encodeURIComponent(projectId)}/pages/${encodeURIComponent(pageId)}`
}

async function request<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init.body ? { 'Content-Type': 'application/json', ...init.headers } : init.headers,
  })
  const data = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(data.error || 'Wiki 请求失败。')
  return data
}

async function requestText(url: string) {
  const response = await fetch(url)
  if (response.ok) return response.text()
  const data = await response.json().catch(() => ({})) as { error?: string }
  throw new Error(data.error || 'Wiki 导出失败。')
}
