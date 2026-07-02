import type { Note } from '../types'

export async function listNotes(): Promise<Note[]> {
  const response = await fetch('/api/notes')
  if (!response.ok) throw new Error('无法加载云端素材库。')
  const data = (await response.json()) as { notes: Note[] }
  return data.notes
}

export async function createNote(input: Partial<Note>): Promise<Note> {
  const response = await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = (await response.json()) as { note?: Note; error?: string }
  if (!response.ok || !data.note) throw new Error(data.error || '创建素材失败。')
  return data.note
}

export async function updateNote(id: string, patch: Partial<Note>): Promise<Note> {
  const response = await fetch(`/api/notes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  const data = (await response.json()) as { note?: Note; error?: string }
  if (!response.ok || !data.note) throw new Error(data.error || '保存素材失败。')
  return data.note
}

export async function deleteNote(id: string) {
  const response = await fetch(`/api/notes/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!response.ok) throw new Error('删除素材失败。')
}

export async function bulkImportNotes(notes: Note[]): Promise<Note[]> {
  const response = await fetch('/api/notes/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  })
  const data = (await response.json()) as { notes?: Note[]; error?: string }
  if (!response.ok || !data.notes) throw new Error(data.error || '迁移素材失败。')
  return data.notes
}
