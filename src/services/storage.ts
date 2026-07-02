import { demoNotes } from '../data/demoNotes'
import type { Note } from '../types'

const storageKey = 'mine-notes'
const legacyStorageKey = 'zhiji-notes'
const migratedStorageKey = 'mine-notes-migrated'

export function loadNotes(): Note[] {
  const saved = localStorage.getItem(storageKey) ?? localStorage.getItem(legacyStorageKey)
  if (!saved) return demoNotes

  try {
    const notes = JSON.parse(saved)
    if (Array.isArray(notes) && notes.length) {
      const normalizedNotes = notes.map(normalizeNote).filter(Boolean) as Note[]
      if (normalizedNotes.length) {
        localStorage.setItem(storageKey, JSON.stringify(normalizedNotes))
        return normalizedNotes
      }
      return demoNotes
    }
    return demoNotes
  } catch {
    return demoNotes
  }
}

export function saveNotes(notes: Note[]) {
  localStorage.setItem(storageKey, JSON.stringify(notes))
}

export function loadLocalNotesForMigration(): Note[] {
  if (localStorage.getItem(migratedStorageKey) === 'true') return []
  const saved = localStorage.getItem(storageKey) ?? localStorage.getItem(legacyStorageKey)
  if (!saved) return []

  try {
    const notes = JSON.parse(saved)
    if (!Array.isArray(notes)) return []
    return notes.map(normalizeNote).filter(Boolean) as Note[]
  } catch {
    return []
  }
}

export function markLocalNotesMigrated() {
  localStorage.setItem(migratedStorageKey, 'true')
}

function normalizeNote(note: Partial<Note> | null | undefined): Note | null {
  if (!note || !note.id) return null
  const now = new Date().toISOString()

  return {
    id: String(note.id),
    title: note.title || '未命名笔记',
    content: note.content || '',
    summary: note.summary || '',
    tags: Array.isArray(note.tags) ? note.tags : [],
    topic: note.topic || 'Inbox',
    source: note.source || '本地笔记',
    createdAt: note.createdAt || now,
    updatedAt: note.updatedAt || note.createdAt || now,
    relatedNoteIds: Array.isArray(note.relatedNoteIds) ? note.relatedNoteIds : [],
  }
}
